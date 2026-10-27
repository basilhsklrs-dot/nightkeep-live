package live.nightkeep.pkbattle

import android.accessibilityservice.AccessibilityService
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.app.Notification

/**
 * Optional, user-enabled AccessibilityService. It only looks at TikTok windows,
 * only acts while mode = AUTO, and only performs ACTION_CLICK on the recognised
 * Accept control of a recognised invitation dialog (no coordinates, no root, no
 * private APIs). In ASSIST mode it alerts the creator instead of clicking.
 */
class PkAutoAcceptService : AccessibilityService() {
    companion object {
        val TIKTOK = setOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.zhiliaoapp.musically.go", "com.ss.android.ugc.aweme")
        @Volatile var running = false
        @Volatile var lastState = "idle"
        private const val CHANNEL = "pk_invites"
    }

    private lateinit var prefs: Prefs
    private val main = Handler(Looper.getMainLooper())
    private var gate = AcceptGate()
    private var testGate = AcceptGate()
    private var testEpoch = -1
    private fun testing() = prefs.testUntil > System.currentTimeMillis()
    private fun currentMode() = if (testing()) prefs.testMode else prefs.mode
    private fun report(kind: String, inviter: String = "", detail: String = "", dump: String? = null) { if (testing()) DiagLog.log("test", "$kind $detail") else Backend.report(prefs, kind, inviter, detail, dump) }
    private var lastSeenSignature = ""
    private var lastScanAt = 0L
    private var pendingScan = false

    override fun onServiceConnected() {
        prefs = Prefs(this); DiagLog.init(this)
        running = true; lastState = "connected"
        DiagLog.log("svc", "Accessibility service connected (mode=${prefs.mode})")
        report("service_state", detail = "connected mode=${prefs.mode}")
        if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "PK invitations", NotificationManager.IMPORTANCE_HIGH))
    }

    override fun onUnbind(intent: Intent?): Boolean { running = false; lastState = "disabled"; DiagLog.log("svc", "service unbound"); return super.onUnbind(intent) }
    override fun onInterrupt() { lastState = "interrupted" }
    override fun onDestroy() { running = false;lastState = "destroyed";main.removeCallbacksAndMessages(null);super.onDestroy() }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!::prefs.isInitialized) return
        val pkg = event?.packageName?.toString() ?: return
        if (if (testing()) pkg != packageName else pkg !in TIKTOK) return
        if (currentMode() == AcceptMode.OFF && !prefs.captureNext && !testing()) return
        // Coalesce bursts of content-changed events into one scan every 250 ms.
        if (pendingScan) return
        pendingScan = true
        val wait = (250 - (SystemClock.elapsedRealtime() - lastScanAt)).coerceAtLeast(0)
        main.postDelayed({ pendingScan = false; lastScanAt = SystemClock.elapsedRealtime(); scan() }, wait)
    }

    /** Flatten every visible TikTok window (dialogs can be separate windows). */
    private fun snapshot(): Pair<List<UiNode>, List<AccessibilityNodeInfo>> {
        val nodes = ArrayList<UiNode>(); val infos = ArrayList<AccessibilityNodeInfo>()
        val roots = runCatching { windows.mapNotNull { it.root } }.getOrDefault(emptyList()).ifEmpty { listOfNotNull(rootInActiveWindow) }
        for (root in roots) {
            if (if (testing()) root.packageName?.toString() != packageName else root.packageName?.toString() !in TIKTOK) continue
            fun walk(n: AccessibilityNodeInfo?, parent: Int, depth: Int) {
                if (n == null || depth > 30 || nodes.size >= 600) return
                val idx = nodes.size
                nodes.add(UiNode(idx, parent, n.text?.toString() ?: "", n.contentDescription?.toString() ?: "", n.viewIdResourceName ?: "", n.isClickable, n.isEnabled, n.isVisibleToUser))
                infos.add(n)
                for (i in 0 until n.childCount) walk(n.getChild(i), idx, depth + 1)
            }
            walk(root, -1, 0)
        }
        return nodes to infos
    }

    private fun scan() {
        val (nodes, infos) = snapshot()
        if (prefs.captureNext && nodes.isNotEmpty()) {
            prefs.captureNext = false
            sendDump(nodes, "manual capture")
        }
        if (testing() && nodes.none { it.text == "NIGHTKEEP LOCAL TEST — NOT TIKTOK" }) return
        if (testing() && testEpoch != prefs.testEpoch) { testEpoch = prefs.testEpoch; testGate = AcceptGate(); lastSeenSignature = "" }
        if (!testing()) probe(nodes)
        if (currentMode() == AcceptMode.OFF) return
        val result = PkMatcher.match(nodes, prefs.matchConfig())
        val now = SystemClock.elapsedRealtime()
        when (result) {
            is MatchResult.NoInvitation -> lastState = "watching"
            is MatchResult.Unsafe -> {
                val key = result.reason + result.inviter
                if (key != lastSeenSignature) {
                    lastSeenSignature = key
                    DiagLog.log("pk", "Invitation-like UI NOT accepted: ${result.reason} inviter='${result.inviter}'")
                    report("pk_accept_skipped", result.inviter, result.reason)
                }
            }
            is MatchResult.Invitation -> handleInvite(result, infos, now)
        }
    }

    private fun dumpOf(nodes: List<UiNode>) = nodes.filter { it.text.isNotEmpty() || it.desc.isNotEmpty() || it.clickable }.take(150)
        .joinToString("\n") { "#${it.index}<${it.parent} ${if (it.clickable) "C" else "-"}${if (it.enabled) "E" else "-"}${if (it.visible) "V" else "-"} id=${it.viewId.substringAfter(":id/", it.viewId)} t='${it.text.take(60)}' d='${it.desc.take(60)}'" }

    private fun sendDump(nodes: List<UiNode>, reason: String) {
        val dump = dumpOf(nodes)
        DiagLog.log("capture", "$reason (${nodes.size} nodes):\n${dump.take(3000)}")
        report("ui_capture", detail = "$reason; ${nodes.size} nodes", dump = dump)
    }

    private val probeWords = Regex("(?U)\\b(pk|match|matches|battle|invit\\w*|accept|decline|προσκλ\\w*|αγων\\w*|μαχ\\w*|αποδοχ\\w*|αποδεχ\\w*|απορριψ\\w*)\\b")
    private var lastProbeKey = ""
    private var lastProbeAt = 0L

    /** Calibration: automatically send any TikTok screen that looks like a PK/match prompt (deduplicated, max 1 per 8 s). */
    private fun probe(nodes: List<UiNode>) {
        if (currentMode() == AcceptMode.OFF) return
        val hits = nodes.filter { it.visible }.mapNotNull { n -> probeWords.find(PkMatcher.norm(n.text + " " + n.desc))?.value }.distinct()
        if (hits.isEmpty()) return
        val key = hits.sorted().joinToString(",")
        val now = SystemClock.elapsedRealtime()
        if (key == lastProbeKey || now - lastProbeAt < 8000) return
        lastProbeKey = key; lastProbeAt = now
        sendDump(nodes, "auto: $key")
    }

    private fun handleInvite(r: MatchResult.Invitation, infos: List<AccessibilityNodeInfo>, now: Long) {
        val firstSight = r.signature != lastSeenSignature
        lastSeenSignature = r.signature
        if (firstSight) { DiagLog.log("pk", "PK invitation detected from '${r.inviter}'"); report("pk_invitation_seen", r.inviter) }
        lastState = "invitation"
        val policy = if (testing()) testGate else gate
        when (val decision = policy.check(r.signature, now, currentMode().name, prefs.cooldownSec, prefs.maxPerHour)) {
            "off" -> return
            "assist" -> { if (firstSight) { DiagLog.log("pk", "ASSIST — no click"); if (!testing()) alert(r.inviter) }; return }
            "auto" -> Unit
            else -> { lastState = decision; if (firstSight) DiagLog.log("pk", "Not clicking: $decision"); return }
        }
        val target = infos.getOrNull(r.clickIndex)
        if (target == null || !target.refresh() || !target.isEnabled) { DiagLog.log("pk", "accept node vanished before click"); return }
        val ok = target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        policy.record(r.signature, now, ok)
        DiagLog.log("pk", if (ok) "ACCEPT clicked for '${r.inviter}'" else "ACCEPT click rejected by system")
        report(if (ok) "pk_accept_clicked" else "pk_accept_failed", r.inviter, if (ok) "click dispatched" else "performAction=false")
        val local = testing()
        if (ok) main.postDelayed({ if (!local || testing()) verify(r, local) }, 2500)
    }

    /** After clicking, the same invitation dialog must be gone. */
    private fun verify(r: MatchResult.Invitation, local: Boolean) {
        val (nodes, _) = snapshot()
        val again = PkMatcher.match(nodes, prefs.matchConfig())
        if (again is MatchResult.Invitation && again.signature == r.signature) {
            DiagLog.log("pk", "dialog still visible 2.5 s after click — acceptance NOT confirmed")
            report("pk_accept_failed", r.inviter, "dialog still visible after click")
        } else DiagLog.log("pk", if (local) "LOCAL TEST: dialog closed after click" else "dialog closed after click (server will confirm via PK start event)")
    }

    private fun alert(inviter: String) {
        val nm = getSystemService(NotificationManager::class.java)
        val open = packageManager.getLaunchIntentForPackage("com.zhiliaoapp.musically") ?: packageManager.getLaunchIntentForPackage("com.ss.android.ugc.trill")
        val pi = open?.let { PendingIntent.getActivity(this, 1, it, PendingIntent.FLAG_IMMUTABLE) }
        val n = Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("PK invitation").setContentText(if (inviter.isNotEmpty()) "$inviter wants to battle — tap Accept in TikTok" else "Tap Accept in TikTok")
            .setAutoCancel(true).apply { if (pi != null) setContentIntent(pi) }.build()
        runCatching { nm.notify(42, n) }
        val vib = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        runCatching { vib?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 250, 120, 250, 120, 400), -1)) }
    }
}

