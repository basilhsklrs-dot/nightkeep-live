package live.nightkeep.pkmanager

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.graphics.Path
import android.graphics.Rect
import android.accessibilityservice.GestureDescription
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * Experimental UI-only companion. Never claims TikTok API privileges.
 * Requires manifest service declaration and user-enabled Accessibility access.
 * Labels must be validated against the current TikTok version.
 */
class PkAccessibilityService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private val configExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var remoteInviteTerms: List<String> = emptyList()
    @Volatile private var remoteAcceptLabels: List<String> = emptyList()
    @Volatile private var remoteEnabled = true
    private var lastConfigFetchAt = 0L
    private val configUrl = "https://raw.githubusercontent.com/basilhsklrs-dot/nightkeep-live/main/pk-auto-manager/remote-config.json"
    private fun refreshRemoteConfig() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastConfigFetchAt < 60_000L) return
        lastConfigFetchAt = now
        configExecutor.execute {
            try {
                val conn = URL(configUrl).openConnection().apply { connectTimeout = 4500; readTimeout = 4500; useCaches = false }
                val json = conn.getInputStream().bufferedReader().use { it.readText() }
                if (json.length > 16_384) return@execute
                val obj = JSONObject(json)
                if (obj.optInt("schema", 0) != 1) return@execute
                fun terms(key: String): List<String> {
                    val a = obj.optJSONArray(key) ?: return emptyList()
                    return (0 until minOf(a.length(), 40)).mapNotNull { i -> a.optString(i).trim().takeIf { it.length in 2..100 } }
                }
                remoteInviteTerms = terms("invitationTerms")
                remoteAcceptLabels = terms("acceptLabels")
                remoteEnabled = obj.optBoolean("autoAcceptEnabled", true)
                retryCooldownMs = obj.optLong("retryCooldownSeconds", 60L).coerceIn(30L, 600L) * 1000L
                entryTapEnabled = obj.optBoolean("entryTapEnabled", true)
                entryTapX = obj.optDouble("entryTapX", 0.055).toFloat().coerceIn(0.02f, 0.25f)
                entryTapY = obj.optDouble("entryTapY", 0.855).toFloat().coerceIn(0.60f, 0.95f)
            } catch (_: Exception) { /* Offline: keep last known configuration and built-in rules. */ }
        }
    }
    private var lastActionAt = 0L
    private var lastInviteAt = 0L
    private var lastRetryAt = 0L
    private var lastEntryAt = 0L
    private var lastMatchAt = 0L
    @Volatile private var retryCooldownMs = 60_000L
    private val entryCooldownMs = 60_000L
    @Volatile private var entryTapEnabled = true
    @Volatile private var entryTapX = 0.055f
    @Volatile private var entryTapY = 0.855f
    private var enabled = false
    private val packageNameTikTok = "com.zhiliaoapp.musically"
    private val cooldownMs = 2_500L
    private val outgoingCooldownMs = 90_000L
    private val tick = object : Runnable {
        override fun run() {
            enabled = getSharedPreferences("pk", MODE_PRIVATE).getBoolean("enabled", false)
            if (enabled) { refreshRemoteConfig(); inspect() }
            handler.postDelayed(this, 1800)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        enabled = getSharedPreferences("pk", MODE_PRIVATE).getBoolean("enabled", false)
        handler.post(tick)
    }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (enabled && event?.packageName?.toString() == packageNameTikTok) inspect()
    }
    override fun onInterrupt() {}
    override fun onDestroy() {
        handler.removeCallbacks(tick)
        configExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun inspect() {
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != packageNameTikTok) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastActionAt < cooldownMs) return

        val all = mutableListOf<AccessibilityNodeInfo>()
        collect(root, all)
        val labels = all.flatMap { listOfNotNull(it.text?.toString(), it.contentDescription?.toString()) }
        // Never accept ambiguous generic "Accept": require explicit PK / co-host context.
        val invitationContext = labels.any { containsAny(it, "Αγώνας συγκεκριμένου Δώρου", "αγώνας συγκεκριμένου δώρου", "Specific Gift Match", "PK invitation", "LIVE Match invitation", "Πρόσκληση συνδιοργάνωσης", "Πρόσκληση για αγώνα", "invited you to", "σας προσκάλεσε", "σας προσκαλεί", "πρόσκληση για συνδιοργάνωση", "πρόσκληση αγώνα", "invitation to co-host", "invitation to match", "match invitation", "co-host invitation", "Πρόσκληση σε LIVE Match", "πρόσκληση", "invitation", "invited", "συνδιοργάνωση", "LIVE Match", "αγώνας LIVE") || remoteInviteTerms.any { term -> it.contains(term, ignoreCase = true) } }
        val hasAccept = all.any { node -> listOfNotNull(node.text?.toString(), node.contentDescription?.toString()).any { it.trim().equals("Αποδοχή", true) || it.trim().equals("Accept", true) } }
        val hasDecline = labels.any { containsAny(it, "Απόρριψη", "Απόρριψε", "Decline", "Reject") }
        val incomingInvite = hasAccept && (invitationContext || hasDecline)
        val activePk = labels.any { containsAny(it, "PK BATTLE", "LIVE Match in progress", "Αγώνας σε εξέλιξη") }
        if (incomingInvite && remoteEnabled) {
            if (clickExact(all, listOf("Accept", "Αποδοχή", "Accept invite", "Accept invitation", "Αποδοχή πρόσκλησης", "Join", "Συμμετοχή") + remoteAcceptLabels)) lastActionAt = now
            return
        }
        if (activePk) return
        // After a co-host joins, prefer explicitly labeled match controls.
        // Never tap generic Start buttons without an identified match context.
        val matchContext = labels.any { containsAny(it, "Αγώνας LIVE", "LIVE Match", "Αγώνας PK", "PK Match", "Έναρξη αγώνα") }
        if (matchContext && now - lastMatchAt > 20_000L) {
            if (clickExact(all, listOf("Ανάληψη", "Έναρξη αγώνα", "Start match", "Start Match", "Πρόσκληση σε αγώνα", "Invite to match", "Αποστολή πρόσκλησης αγώνα"))) {
                lastMatchAt = now
                lastActionAt = now
                return
            }
        }

        // TikTok quick-invite discovery: retry only after the explicit no-creator state.
        val noCreators = labels.any { containsAny(it, "Δεν βρέθηκαν κατάλληλοι δημιουργοί", "No suitable creators found", "No creators found") }
        val retryVisible = labels.any { containsAny(it, "Δοκιμάστε ξανά", "Try again", "Retry") }
        if (noCreators && retryVisible && now - lastRetryAt > retryCooldownMs) {
            if (clickExact(all, listOf("Δοκιμάστε ξανά", "Try again", "Retry"))) {
                lastRetryAt = now
                lastActionAt = now
            }
            return
        }

        // Entry point is a pair of interlinked circles. Only use its accessible label;
        // unlabeled icon coordinates are unsafe across tablet orientations and layouts.
        val entry = labels.any { containsAny(it, "Γρήγορη πρόσκληση", "Quick invite", "Quick invitation") }
        val liveUi = labels.any { containsAny(it, "Σίγαση μικροφώνου", "Mute microphone", "LIVE") }
        val cohostConnected = labels.any { containsAny(it, "Έναρξη αγώνα", "Start match", "Match", "Συνδιοργανωτής") }
        val discoveryVisible = labels.any { containsAny(it, "Δεν βρέθηκαν κατάλληλοι δημιουργοί", "Προτεινόμενοι δημιουργοί", "Προσκαλέστε άλλους δημιουργούς", "Δοκιμάστε ξανά") }
        if (entry && now - lastEntryAt > entryCooldownMs) {
            if (clickExact(all, listOf("Γρήγορη πρόσκληση", "Quick invite", "Quick invitation"))) {
                lastEntryAt = now
                lastActionAt = now
                return
            }
        }

        // Screen-position fallback for the unlabeled interlinked-circles control.
        // Only on the TikTok LIVE host screen, never during a dialog or a match.
        if (!entry && entryTapEnabled && liveUi && !cohostConnected && !discoveryVisible && !incomingInvite && now - lastEntryAt > entryCooldownMs) {
            val screen = Rect()
            root.getBoundsInScreen(screen)
            if (screen.width() > 400 && screen.height() > 400) {
                if (tapAt(screen.left + screen.width() * entryTapX, screen.top + screen.height() * entryTapY)) {
                    lastEntryAt = now
                    lastActionAt = now
                    return
                }
            }
        }

        // Only invite when a verified co-host screen is visible.
        val cohostScreen = labels.any { containsAny(it, "Συνδιοργάνωση με δημιουργούς", "Co-host with creators") }
        if (cohostScreen && now - lastInviteAt > outgoingCooldownMs) {
            if (clickExact(all, listOf("Πρόσκληση", "Invite"))) {
                lastInviteAt = now
                lastActionAt = now
            }
        }
    }

    private fun containsAny(text: String, vararg terms: String) =
        terms.any { text.contains(it, ignoreCase = true) }

    private fun collect(node: AccessibilityNodeInfo, out: MutableList<AccessibilityNodeInfo>, depth: Int = 0) {
        if (depth > 24 || out.size > 500) return
        out.add(node)
        for (i in 0 until node.childCount) node.getChild(i)?.let { collect(it, out, depth + 1) }
    }

    private fun tapAt(x: Float, y: Float): Boolean {
        val path = Path().apply { moveTo(x, y) }
        return dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 75)).build(), null, null)
    }

    private fun clickExact(nodes: List<AccessibilityNodeInfo>, names: List<String>): Boolean {
        val candidates = nodes.filter { n ->
            val values = listOfNotNull(n.text?.toString(), n.contentDescription?.toString())
            values.any { value -> names.any { value.trim().equals(it, ignoreCase = true) } }
        }
        // Multiple matching controls are ambiguous: fail closed.
        if (candidates.isEmpty()) return false
        // Multiple accessible nodes can describe the same underlying button.
        val uniqueTargets = candidates.map { node ->
            var target: AccessibilityNodeInfo? = node
            while (target != null && !target.isClickable) target = target.parent
            target
        }.filterNotNull().distinctBy { it.hashCode() }
        if (uniqueTargets.size == 1 && uniqueTargets.first().performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        // Some TikTok dialogs expose text but not an actionable parent. Tap its actual on-screen bounds.
        val visible = candidates.map { node ->
            val bounds = Rect()
            node.getBoundsInScreen(bounds)
            bounds
        }.filter { !it.isEmpty && it.width() > 8 && it.height() > 8 }.distinctBy { "${it.centerX()},${it.centerY()}" }
        if (visible.size != 1) return false
        val b = visible.first()
        val path = Path().apply { moveTo(b.exactCenterX(), b.exactCenterY()) }
        return dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 70)).build(), null, null)
    }
}
