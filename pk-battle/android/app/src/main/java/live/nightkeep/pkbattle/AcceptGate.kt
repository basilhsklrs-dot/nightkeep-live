package live.nightkeep.pkbattle

/** Local monotonic-time policy. Fixture and TikTok use separate instances. */
class AcceptGate {
    private var lastAt: Long? = null
    private var signature = ""
    private val times = ArrayDeque<Long>()
    fun check(sig: String, now: Long, mode: String, cooldownSec: Int, maxPerHour: Int): String {
        if (mode == "OFF") return "off"
        if (mode == "ASSIST") return "assist"
        while (times.isNotEmpty() && now - times.first() >= 3_600_000) times.removeFirst()
        val at = lastAt
        if (at != null && sig == signature && now - at < 60_000) return "duplicate"
        if (at != null && now - at < cooldownSec * 1000L) return "cooldown"
        if (times.size >= maxPerHour) return "hourly_limit"
        return "auto"
    }
    fun record(sig: String, now: Long, success: Boolean) {
        if (!success) return
        lastAt = now; signature = sig; times.addLast(now)
    }
}
