package live.nightkeep.pkbattle
import org.junit.Assert.assertEquals
import org.junit.Test
class AcceptGateTest {
 @Test fun modesAndFirstAccept() { val g=AcceptGate();assertEquals("off",g.check("a",0,"OFF",20,8));assertEquals("assist",g.check("a",0,"ASSIST",20,8));assertEquals("auto",g.check("a",0,"AUTO",20,8)) }
 @Test fun cooldownDuplicateAndFailedClick() { val g=AcceptGate();g.record("a",1000,false);assertEquals("auto",g.check("b",1001,"AUTO",20,8));g.record("a",1001,true);assertEquals("duplicate",g.check("a",3000,"AUTO",20,8));assertEquals("cooldown",g.check("b",3000,"AUTO",20,8));assertEquals("auto",g.check("b",21001,"AUTO",20,8)) }
 @Test fun hourlyCapExpires() { val g=AcceptGate();g.record("a",0,true);assertEquals("hourly_limit",g.check("b",61000,"AUTO",20,1));assertEquals("auto",g.check("b",3600000,"AUTO",20,1)) }
 @Test fun testDoesNotConsumeRealQuota() { val real=AcceptGate();val local=AcceptGate();local.record("fixture",0,true);assertEquals("hourly_limit",local.check("b",61000,"AUTO",20,1));assertEquals("auto",real.check("b",61000,"AUTO",20,1)) }
}
