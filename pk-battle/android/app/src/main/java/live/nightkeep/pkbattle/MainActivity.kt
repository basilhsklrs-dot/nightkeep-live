package live.nightkeep.pkbattle

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView

/** Control panel: settings, Auto Accept mode, status, start/stop and diagnostics. */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var status: TextView
    private lateinit var logView: TextView
    private val ui = Handler(Looper.getMainLooper())
    private val logListener: () -> Unit = { logView.text = DiagLog.text().lines().takeLast(60).joinToString("\n") }
    private val poll = object : Runnable { override fun run() { refresh(); ui.postDelayed(this, 5000) } }

    private val dp get() = resources.displayMetrics.density
    private fun px(v: Int) = (v * dp).toInt()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        prefs = Prefs(this); DiagLog.init(this)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(px(20), px(28), px(20), px(28)); setBackgroundColor(Color.rgb(12, 8, 30)) }
        fun title(t: String, size: Float = 20f) = TextView(this).apply { text = t; textSize = size; setTextColor(Color.WHITE); typeface = Typeface.DEFAULT_BOLD; setPadding(0, px(18), 0, px(6)) }.also { root.addView(it) }
        fun note(t: String) = TextView(this).apply { text = t; textSize = 13f; setTextColor(Color.rgb(190, 180, 230)) }.also { root.addView(it) }
        fun field(label: String, value: String, secret: Boolean = false, onSave: (String) -> Unit): EditText {
            note(label)
            return EditText(this).apply {
                setText(value); setTextColor(Color.WHITE); setHintTextColor(Color.GRAY); textSize = 15f; isSingleLine = true
                if (secret) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                setOnFocusChangeListener { _, f -> if (!f) onSave(text.toString()) }
            }.also { root.addView(it, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)) }
        }
        fun button(t: String, color: Int = Color.rgb(255, 59, 107), onClick: () -> Unit) = Button(this).apply {
            text = t; setTextColor(Color.WHITE); setBackgroundColor(color); textSize = 15f; typeface = Typeface.DEFAULT_BOLD
            setOnClickListener { saveAll(); onClick() }
        }.also { root.addView(it, LinearLayout.LayoutParams(MATCH_PARENT, px(54)).apply { topMargin = px(10) }) }

        title("NIGHTKEEP PK BATTLE", 26f)
        status = TextView(this).apply { textSize = 14f; setTextColor(Color.rgb(255, 230, 109)); typeface = Typeface.MONOSPACE; setPadding(0, px(8), 0, px(8)) }
        root.addView(status)

        button("▶ START GAME (FULL SCREEN)") { startActivity(Intent(this, GameActivity::class.java)) }
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((label, action) in listOf("Start battle" to "start", "Stop battle" to "stop", "PK mode" to "mode_pk", "Non-stop" to "mode_cont")) {
            row.addView(Button(this).apply {
                text = label; textSize = 12f; setOnClickListener {
                    saveAll()
                    val a = when (action) { "mode_pk", "mode_cont" -> "mode" else -> action }
                    if (a == "mode") controlMode(if (action == "mode_pk") "pk" else "continuous")
                    else Backend.control(prefs, a) { DiagLog.log("ctl", "$a → $it") }
                }
            }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        }
        root.addView(row)

        title("PK AUTO ACCEPT")
        note("OFF = do nothing. ASSIST = alert + vibrate, you tap Accept. AUTO = tap the TikTok Accept button for you.\nRequires enabling the accessibility service below. Quick Settings tile “PK Accept” turns it off instantly.")
        val group = RadioGroup(this).apply { orientation = RadioGroup.HORIZONTAL }
        for (m in AcceptMode.values()) group.addView(RadioButton(this).apply { text = m.name; id = m.ordinal + 1; setTextColor(Color.WHITE); textSize = 16f; isChecked = prefs.mode == m })
        group.setOnCheckedChangeListener { _, id -> prefs.mode = AcceptMode.values()[id - 1]; DiagLog.log("ui", "Auto Accept mode → ${prefs.mode}"); Backend.report(prefs, "service_state", detail = "mode=${prefs.mode}"); refresh() }
        root.addView(group)
        button("OPEN ACCESSIBILITY SETTINGS", Color.rgb(60, 50, 120)) { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        val cooldown = field("Cooldown between accepts (seconds)", prefs.cooldownSec.toString()) { prefs.cooldownSec = it.toIntOrNull() ?: 20 }
        cooldown.inputType = InputType.TYPE_CLASS_NUMBER
        val maxHour = field("Max automatic accepts per hour", prefs.maxPerHour.toString()) { prefs.maxPerHour = it.toIntOrNull() ?: 8 }
        maxHour.inputType = InputType.TYPE_CLASS_NUMBER
        field("Only accept these inviters (comma separated, empty = anyone)", prefs.allowedInviters) { prefs.allowedInviters = it }

        title("SERVER")
        field("Game server URL (https://…)", prefs.serverUrl) { prefs.serverUrl = it }
        field("Session (your TikTok username)", prefs.session) { prefs.session = it }
        field("Device token (from Render env DEVICE_TOKEN)", prefs.deviceToken, secret = true) { prefs.deviceToken = it }
        root.addView(Switch(this).apply { text = "Game sound"; setTextColor(Color.WHITE); isChecked = prefs.sound; setOnCheckedChangeListener { _, c -> prefs.sound = c } })

        title("CALIBRATION (if TikTok wording differs)")
        field("Extra invitation phrases (comma separated)", prefs.extraInvitePhrases) { prefs.extraInvitePhrases = it }
        field("Extra Accept button labels", prefs.extraAcceptLabels) { prefs.extraAcceptLabels = it }
        field("Verified Accept view IDs (from capture)", prefs.acceptViewIds) { prefs.acceptViewIds = it }
        button("CAPTURE TIKTOK UI (next TikTok screen)", Color.rgb(60, 50, 120)) { prefs.captureNext = true; DiagLog.log("ui", "Capture armed: open the TikTok invitation dialog now") }

        title("DIAGNOSTICS")
        button("SHARE LOGS", Color.rgb(60, 50, 120)) { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, DiagLog.text()), "Share logs")) }
        button("CLEAR LOGS", Color.rgb(60, 50, 120)) { DiagLog.clear(); logListener() }
        logView = TextView(this).apply { textSize = 11f; typeface = Typeface.MONOSPACE; setTextColor(Color.rgb(170, 255, 190)); setTextIsSelectable(true) }
        root.addView(logView)

        setContentView(ScrollView(this).apply { addView(root); isFillViewport = true; setBackgroundColor(Color.rgb(12, 8, 30)) })
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }

    private fun controlMode(mode: String) = Backend.control(prefs, "mode", mapOf("mode" to mode)) { DiagLog.log("ctl", "mode $mode → $it") }

    private fun saveAll() { currentFocus?.clearFocus() }

    private fun accessibilityEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, PkAutoAcceptService::class.java).flattenToString()
        return enabled.split(':').any { it.equals(me, true) }
    }

    private fun refresh() {
        val acc = accessibilityEnabled()
        val head = "Auto Accept: ${prefs.mode}   Service: ${if (acc) "ENABLED" else "DISABLED"} (${PkAutoAcceptService.lastState})"
        if (prefs.serverUrl.isEmpty()) { status.text = "$head\nServer: not configured"; return }
        Backend.status(prefs) { j, err ->
            if (j == null) { status.text = "$head\nServer: OFFLINE ($err)"; return@status }
            val host = j.optJSONObject("host"); val pk = j.optJSONObject("pk"); val opp = pk?.optJSONObject("opponent")
            val off = pk?.optJSONObject("officialScore")
            status.text = buildString {
                appendLine(head)
                appendLine("Server: ONLINE ${if (j.optBoolean("demo")) "(DEMO)" else ""} mode=${j.optString("mode")}")
                appendLine("TikTok LIVE: ${host?.optString("state") ?: "n/a"} ${host?.optString("lastError")?.takeIf { it.isNotEmpty() } ?: ""}")
                appendLine("PK: ${pk?.optString("phase")}  opponent: ${opp?.optString("nickname")?.ifEmpty { opp.optString("uniqueId") } ?: "—"}")
                appendLine("Official PK score: ${off?.opt("left") ?: "—"} : ${off?.opt("right") ?: "—"}  right team via: ${pk?.optString("rightAttribution")}")
                append("Verified accepts: ${j.optInt("verifiedAccepts")}  events: ${j.optJSONObject("counters")?.optInt("events")}")
            }
        }
    }

    override fun onResume() { super.onResume(); DiagLog.listeners.add(logListener); logListener(); ui.post(poll) }
    override fun onPause() { saveAll(); DiagLog.listeners.remove(logListener); ui.removeCallbacks(poll); super.onPause() }
}
