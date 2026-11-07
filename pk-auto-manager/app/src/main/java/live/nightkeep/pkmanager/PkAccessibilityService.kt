package live.nightkeep.pkmanager

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * Experimental UI-only companion. Never claims TikTok API privileges.
 * Requires manifest service declaration and user-enabled Accessibility access.
 * Labels must be validated against the current TikTok version.
 */
class PkAccessibilityService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var lastActionAt = 0L
    private var lastInviteAt = 0L
    private var enabled = false
    private val packageNameTikTok = "com.zhiliaoapp.musically"
    private val cooldownMs = 2_500L
    private val outgoingCooldownMs = 90_000L
    private val tick = object : Runnable {
        override fun run() {
            enabled = getSharedPreferences("pk", MODE_PRIVATE).getBoolean("enabled", false)
            if (enabled) inspect()
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
        val invitationContext = labels.any { containsAny(it, "PK invitation", "LIVE Match invitation", "Πρόσκληση συνδιοργάνωσης", "Πρόσκληση για αγώνα", "invited you to", "σας προσκάλεσε", "σας προσκαλεί", "πρόσκληση για συνδιοργάνωση", "πρόσκληση αγώνα", "invitation to co-host", "invitation to match", "match invitation", "co-host invitation", "Πρόσκληση σε LIVE Match") }
        val activePk = labels.any { containsAny(it, "PK BATTLE", "LIVE Match in progress", "Αγώνας σε εξέλιξη") }
        if (invitationContext) {
            if (clickExact(all, listOf("Accept", "Αποδοχή", "Accept invite", "Accept invitation", "Αποδοχή πρόσκλησης", "Join", "Συμμετοχή"))) lastActionAt = now
            return
        }
        if (activePk) return

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
        if (uniqueTargets.size != 1) return false
        return uniqueTargets.first().performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }
}
