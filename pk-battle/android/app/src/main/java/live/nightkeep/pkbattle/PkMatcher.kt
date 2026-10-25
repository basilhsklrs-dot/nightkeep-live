package live.nightkeep.pkbattle

import java.text.Normalizer
import java.util.Locale

/**
 * Pure (Android-free) recognition of a TikTok PK / match invitation dialog in a
 * flattened accessibility tree. Kept separate from the service so it can be
 * unit-tested on the JVM. It never produces screen coordinates: the service may
 * only click the matched node (or its own clickable ancestor) via ACTION_CLICK.
 */
data class UiNode(
    val index: Int,
    val parent: Int,          // -1 for root
    val text: String,
    val desc: String,
    val viewId: String,
    val clickable: Boolean,
    val enabled: Boolean,
    val visible: Boolean = true,
)

data class MatchConfig(
    val invitePhrases: List<String> = DEFAULT_INVITE,
    val acceptLabels: List<String> = DEFAULT_ACCEPT,
    val declineLabels: List<String> = DEFAULT_DECLINE,
    /** Optional verified view-id suffixes (from "Capture TikTok UI"); when set they take priority. */
    val acceptViewIds: List<String> = emptyList(),
    /** Empty = accept any inviter. Otherwise inviter text must contain one entry. */
    val allowedInviters: List<String> = emptyList(),
) {
    companion object {
        val DEFAULT_INVITE = listOf(
            "invited you to a match", "invites you to a match", "invited you to a pk", "match invitation",
            "pk invitation", "invitation to match", "invite to match", "wants to match with you", "invited you to battle",
            "σας προσκαλει σε αγωνα", "σε προσκαλει σε αγωνα", "προσκληση σε αγωνα", "προσκληση για αγωνα", "προσκληση αγωνα",
        )
        val DEFAULT_ACCEPT = listOf("accept", "αποδοχη", "αποδεχτειτε", "αποδεξου", "αποδοχή")
        val DEFAULT_DECLINE = listOf("decline", "reject", "not now", "ignore", "απορριψη", "απορριψτε", "οχι τωρα", "αγνοηση")
    }
}

sealed class MatchResult {
    object NoInvitation : MatchResult()
    /** Invitation recognised but it must not be accepted automatically. */
    data class Unsafe(val reason: String, val inviter: String) : MatchResult()
    data class Invitation(val acceptIndex: Int, val clickIndex: Int, val inviter: String, val signature: String) : MatchResult()
}

object PkMatcher {
    fun norm(s: String?): String {
        if (s.isNullOrEmpty()) return ""
        val d = Normalizer.normalize(s.lowercase(Locale.ROOT), Normalizer.Form.NFD)
        return d.replace(Regex("\\p{M}+"), "").replace(Regex("\\s+"), " ").trim()
    }

    private fun label(n: UiNode) = norm(n.text).ifEmpty { norm(n.desc) }
    private fun both(n: UiNode) = norm(n.text) + " " + norm(n.desc)

    fun match(nodes: List<UiNode>, cfg: MatchConfig): MatchResult {
        if (nodes.isEmpty()) return MatchResult.NoInvitation
        val invites = cfg.invitePhrases.map(::norm).filter { it.isNotEmpty() }
        val accepts = cfg.acceptLabels.map(::norm).filter { it.isNotEmpty() }.toSet()
        val declines = cfg.declineLabels.map(::norm).filter { it.isNotEmpty() }.toSet()
        val byIndex = nodes.associateBy { it.index }

        val inviteNodes = nodes.filter { n -> n.visible && invites.any { both(n).contains(it) } }
        if (inviteNodes.isEmpty()) return MatchResult.NoInvitation

        val acceptNodes = nodes.filter { n ->
            n.visible && (label(n) in accepts || (cfg.acceptViewIds.isNotEmpty() && cfg.acceptViewIds.any { id -> id.isNotEmpty() && n.viewId.endsWith(id) }))
        }
        val declineNodes = nodes.filter { n -> n.visible && label(n) in declines }
        if (acceptNodes.isEmpty() || declineNodes.isEmpty()) return MatchResult.Unsafe("buttons_not_recognised", "")

        fun ancestors(i: Int): List<Int> {
            val out = ArrayList<Int>(); var p = byIndex[i]?.parent ?: -1; var guard = 0
            while (p >= 0 && guard++ < 40) { out.add(p); p = byIndex[p]?.parent ?: -1 }
            return out
        }
        fun within(i: Int, container: Int): Boolean = i == container || ancestors(i).contains(container)

        // The invitation text, Accept and Decline must live in ONE dialog container.
        for (invite in inviteNodes) {
            for (container in ancestors(invite.index).take(8)) {
                val acc = acceptNodes.filter { within(it.index, container) }
                val dec = declineNodes.filter { within(it.index, container) }
                if (acc.isEmpty() || dec.isEmpty()) continue
                val inviter = inviterIn(nodes, container, ::within, invites, accepts, declines)
                if (acc.size > 1) return MatchResult.Unsafe("ambiguous_accept_buttons", inviter)
                val a = acc.first()
                // Click target: the accept node or its nearest clickable ancestor that does not also hold Decline.
                var target: UiNode? = a; var steps = 0
                while (target != null && !target.clickable && steps++ < 4) target = byIndex[target.parent]
                if (target == null || !target.clickable) return MatchResult.Unsafe("accept_not_clickable", inviter)
                if (dec.any { within(it.index, target.index) }) return MatchResult.Unsafe("accept_target_contains_decline", inviter)
                if (!target.enabled) return MatchResult.Unsafe("accept_disabled", inviter)
                if (cfg.allowedInviters.isNotEmpty()) {
                    val ni = norm(inviter)
                    if (ni.isEmpty() || cfg.allowedInviters.map(::norm).none { it.isNotEmpty() && ni.contains(it) })
                        return MatchResult.Unsafe("inviter_not_allowed", inviter)
                }
                val sig = nodes.filter { within(it.index, container) }.joinToString("|") { label(it) }.take(300)
                return MatchResult.Invitation(a.index, target.index, inviter, sig.hashCode().toString(16))
            }
        }
        return MatchResult.Unsafe("dialog_structure_not_recognised", "")
    }

    private fun inviterIn(nodes: List<UiNode>, container: Int, within: (Int, Int) -> Boolean, invites: List<String>, accepts: Set<String>, declines: Set<String>): String {
        val texts = nodes.filter { within(it.index, container) }.map { it.text.trim() }.filter { it.isNotEmpty() }
        // A phrase like "Maria invited you to a match" carries the name before the phrase.
        for (t in texts) {
            val n = norm(t)
            for (p in invites) {
                val i = n.indexOf(p)
                if (i > 0) return t.take(i).trim().trimEnd(':', ',', '-').take(40)
            }
        }
        return texts.firstOrNull { t ->
            val n = norm(t)
            n.length in 2..30 && invites.none { n.contains(it) } && n !in accepts && n !in declines && !n.any { it.isDigit() && n.length < 4 }
        }?.take(40) ?: ""
    }
}
