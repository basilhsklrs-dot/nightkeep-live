package live.nightkeep.pkbattle

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PkMatcherTest {
    private fun dialog(invite: String = "Maria invited you to a match", accept: String = "Accept", decline: String = "Decline", acceptClickable: Boolean = false): List<UiNode> = listOf(
        UiNode(0, -1, "", "", "", false, true),
        UiNode(1, 0, "", "", "com.zhiliaoapp.musically:id/dialog", false, true),
        UiNode(2, 1, invite, "", "", false, true),
        UiNode(3, 1, "", "", "com.zhiliaoapp.musically:id/btn_decline", true, true),
        UiNode(4, 3, decline, "", "", false, true),
        UiNode(5, 1, "", "", "com.zhiliaoapp.musically:id/btn_accept", true, true),
        UiNode(6, 5, accept, "", "", acceptClickable, true),
    )

    @Test fun recognisesEnglishInvitationAndClicksAcceptContainer() {
        val r = PkMatcher.match(dialog(), MatchConfig())
        assertTrue(r is MatchResult.Invitation)
        r as MatchResult.Invitation
        assertEquals(6, r.acceptIndex); assertEquals(5, r.clickIndex); assertEquals("Maria", r.inviter)
    }

    @Test fun recognisesGreekWithAccents() {
        val r = PkMatcher.match(dialog("Η Μαρία σας προσκαλεί σε αγώνα", "Αποδοχή", "Απόρριψη"), MatchConfig())
        assertTrue(r.toString(), r is MatchResult.Invitation)
    }

    @Test fun ignoresScreensWithoutInvitationText() {
        assertEquals(MatchResult.NoInvitation, PkMatcher.match(dialog(invite = "Go LIVE"), MatchConfig()))
    }

    @Test fun refusesWhenDeclineMissing() {
        val nodes = dialog().filter { it.index != 4 }
        val r = PkMatcher.match(nodes, MatchConfig())
        assertTrue(r is MatchResult.Unsafe)
    }

    @Test fun allowlistBlocksUnknownInviter() {
        val r = PkMatcher.match(dialog(), MatchConfig(allowedInviters = listOf("kostas")))
        assertEquals("inviter_not_allowed", (r as MatchResult.Unsafe).reason)
        assertTrue(PkMatcher.match(dialog(), MatchConfig(allowedInviters = listOf("maria"))) is MatchResult.Invitation)
    }

    @Test fun refusesWhenClickTargetWouldContainDecline() {
        // Accept text not clickable and its only clickable ancestor is the whole dialog.
        val nodes = listOf(
            UiNode(0, -1, "", "", "", false, true),
            UiNode(1, 0, "", "", "", true, true),
            UiNode(2, 1, "Maria invited you to a match", "", "", false, true),
            UiNode(3, 1, "Decline", "", "", false, true),
            UiNode(4, 1, "Accept", "", "", false, true),
        )
        assertEquals("accept_target_contains_decline", (PkMatcher.match(nodes, MatchConfig()) as MatchResult.Unsafe).reason)
    }

    @Test fun ambiguousAcceptButtonsAreRefused() {
        val nodes = dialog() + UiNode(7, 1, "Accept", "", "", true, true)
        assertEquals("ambiguous_accept_buttons", (PkMatcher.match(nodes, MatchConfig()) as MatchResult.Unsafe).reason)
    }

    @Test fun signatureStableForSameDialog() {
        val a = PkMatcher.match(dialog(), MatchConfig()) as MatchResult.Invitation
        val b = PkMatcher.match(dialog(), MatchConfig()) as MatchResult.Invitation
        assertEquals(a.signature, b.signature)
    }

    @Test fun verifiedViewIdWorksWhenLabelUnknown() {
        val r = PkMatcher.match(dialog(accept = "✓"), MatchConfig(acceptViewIds = listOf(":id/btn_accept")))
        assertTrue(r.toString(), r is MatchResult.Invitation)
    }
}
