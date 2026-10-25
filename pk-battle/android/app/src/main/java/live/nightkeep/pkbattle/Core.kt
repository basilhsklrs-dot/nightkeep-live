package live.nightkeep.pkbattle

import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

enum class AcceptMode { OFF, ASSIST, AUTO }

/** All user settings. Secrets (device token) stay in private app storage, never in the APK. */
class Prefs(ctx: Context) {
    private val p: SharedPreferences = ctx.getSharedPreferences("pkbattle", Context.MODE_PRIVATE)
    var serverUrl: String get() = p.getString("server", BuildConfig.DEFAULT_SERVER)!!.trimEnd('/'); set(v) = p.edit().putString("server", v.trim().trimEnd('/')).apply()
    var session: String get() = p.getString("session", "nightkeep.live")!!; set(v) = p.edit().putString("session", v.trim().removePrefix("@")).apply()
    var deviceToken: String get() = p.getString("token", "")!!; set(v) = p.edit().putString("token", v.trim()).apply()
    var mode: AcceptMode get() = runCatching { AcceptMode.valueOf(p.getString("mode", "OFF")!!) }.getOrDefault(AcceptMode.OFF); set(v) = p.edit().putString("mode", v.name).apply()
    var cooldownSec: Int get() = p.getInt("cooldown", 20); set(v) = p.edit().putInt("cooldown", v.coerceIn(5, 600)).apply()
    var maxPerHour: Int get() = p.getInt("maxHour", 8); set(v) = p.edit().putInt("maxHour", v.coerceIn(1, 60)).apply()
    var allowedInviters: String get() = p.getString("allow", "")!!; set(v) = p.edit().putString("allow", v).apply()
    var extraInvitePhrases: String get() = p.getString("phrases", "")!!; set(v) = p.edit().putString("phrases", v).apply()
    var extraAcceptLabels: String get() = p.getString("acceptLabels", "")!!; set(v) = p.edit().putString("acceptLabels", v).apply()
    var acceptViewIds: String get() = p.getString("viewIds", "")!!; set(v) = p.edit().putString("viewIds", v).apply()
    var rival: String get() = p.getString("rival", "")!!; set(v) = p.edit().putString("rival", v.trim().removePrefix("@")).apply()
    var sound: Boolean get() = p.getBoolean("sound", true); set(v) = p.edit().putBoolean("sound", v).apply()
    var captureNext: Boolean get() = p.getBoolean("capture", false); set(v) = p.edit().putBoolean("capture", v).apply()

    private fun list(s: String) = s.split(',', '\n').map { it.trim() }.filter { it.isNotEmpty() }
    fun matchConfig() = MatchConfig(
        invitePhrases = MatchConfig.DEFAULT_INVITE + list(extraInvitePhrases),
        acceptLabels = MatchConfig.DEFAULT_ACCEPT + list(extraAcceptLabels),
        acceptViewIds = list(acceptViewIds),
        allowedInviters = list(allowedInviters),
    )
    fun gameUrl(): String = "$serverUrl/?session=${java.net.URLEncoder.encode(session, "UTF-8")}&sound=${if (sound) 1 else 0}"
}

/** Ring-buffer diagnostic log persisted to app-private storage. */
object DiagLog {
    private const val MAX = 400
    private val lines = ArrayDeque<String>()
    private var file: File? = null
    private val fmt = SimpleDateFormat("HH:mm:ss", Locale.US)
    val listeners = mutableListOf<() -> Unit>()

    @Synchronized fun init(ctx: Context) {
        if (file != null) return
        file = File(ctx.filesDir, "diag.log")
        runCatching { file!!.readLines().takeLast(MAX).forEach { lines.addLast(it) } }
    }
    @Synchronized fun log(tag: String, msg: String) {
        val line = "${fmt.format(Date())} [$tag] $msg"
        lines.addLast(line); while (lines.size > MAX) lines.removeFirst()
        runCatching { file?.writeText(lines.joinToString("\n")) }
        Handler(Looper.getMainLooper()).post { listeners.toList().forEach { it() } }
    }
    @Synchronized fun text(): String = lines.joinToString("\n")
    @Synchronized fun clear() { lines.clear(); runCatching { file?.writeText("") } }
}

/** Minimal HTTPS client for the game backend (no third-party dependencies). */
object Backend {
    private val pool = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private fun call(url: String, method: String, token: String, body: JSONObject?): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 6000; c.readTimeout = 8000; c.requestMethod = method
        if (token.isNotEmpty()) c.setRequestProperty("Authorization", "Bearer $token")
        if (body != null) { c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toString().toByteArray()) } }
        val code = c.responseCode
        val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        c.disconnect()
        return code to text
    }

    fun report(prefs: Prefs, kind: String, inviter: String = "", detail: String = "", dump: String? = null) {
        if (prefs.serverUrl.isEmpty() || prefs.deviceToken.isEmpty()) return
        val body = JSONObject().put("session", prefs.session).put("kind", kind).put("inviter", inviter).put("detail", detail.take(190)).put("mode", prefs.mode.name.lowercase())
        if (dump != null) body.put("dump", dump.take(12000))
        pool.execute { runCatching { call("${prefs.serverUrl}/api/device/report", "POST", prefs.deviceToken, body) }.onFailure { DiagLog.log("net", "report failed: ${it.javaClass.simpleName}") } }
    }

    fun control(prefs: Prefs, action: String, extra: Map<String, String> = emptyMap(), done: (String) -> Unit) {
        val body = JSONObject().put("session", prefs.session).put("action", action)
        for ((k, v) in extra) body.put(k, v)
        pool.execute {
            val r = runCatching { call("${prefs.serverUrl}/api/control", "POST", prefs.deviceToken, body) }
            main.post { done(r.fold({ "${it.first}: ${it.second.take(120)}" }, { "error: ${it.javaClass.simpleName}" })) }
        }
    }

    fun status(prefs: Prefs, done: (JSONObject?, String) -> Unit) {
        pool.execute {
            val r = runCatching { call("${prefs.serverUrl}/api/diagnostics?session=${java.net.URLEncoder.encode(prefs.session, "UTF-8")}", "GET", prefs.deviceToken, null) }
            main.post {
                r.fold({ (code, text) -> if (code == 200) done(runCatching { JSONObject(text) }.getOrNull(), "") else done(null, "HTTP $code") }, { done(null, it.javaClass.simpleName) })
            }
        }
    }
}
