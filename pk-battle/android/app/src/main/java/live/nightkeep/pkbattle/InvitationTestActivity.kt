package live.nightkeep.pkbattle

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
import android.widget.*

/** A real local accessibility fixture. No TikTok connection or backend reports. */
class InvitationTestActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var root: LinearLayout
    private lateinit var state: TextView
    private lateinit var inviter: EditText
    private val main = Handler(Looper.getMainLooper())
    private var card: LinearLayout? = null
    private var greek = false
    private var accepted = 0
    private val expiry = Runnable { prefs.testUntil = 0; state.text = "TEST EXPIRED — return and reopen to test again"; card?.let { root.removeView(it) } }
    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved); prefs = Prefs(this); prefs.testUntil = System.currentTimeMillis() + 60_000
        prefs.testEpoch++; prefs.testMode = AcceptMode.OFF
        root = LinearLayout(this).apply { orientation = 1; setPadding(26, 36, 26, 20); setBackgroundColor(Color.rgb(12, 8, 30)) }
        fun text(value: String) = TextView(this).apply { text = value; textSize = 15f; setTextColor(Color.WHITE); setPadding(0, 10, 0, 10) }.also { root.addView(it) }
        text("NIGHTKEEP LOCAL TEST — NOT TIKTOK")
        text("Uses the same matcher, click action and limits. Nothing is sent to the server. Real AUTO settings are preserved. Test closes after 60 seconds.")
        state = text("TEST MODE: OFF")
        inviter = EditText(this).apply { setText(prefs.allowedInviters.split(',').firstOrNull()?.trim()?.ifEmpty { null } ?: "NIGHTKEEP TEST"); setTextColor(Color.WHITE); hint = "Test inviter" };root.addView(inviter)
        val row = LinearLayout(this)
        AcceptMode.values().forEach { mode -> row.addView(Button(this).apply { text = mode.name; setOnClickListener { prefs.testMode = mode; state.text = "TEST MODE: $mode · accepts: $accepted"; showInvite() } }, LinearLayout.LayoutParams(0, -2, 1f)) };root.addView(row)
        fun button(title: String, action: () -> Unit) { root.addView(Button(this).apply { text = title; setOnClickListener { action() } }) }
        button("SHOW INVITATION") { showInvite() }
        button("GREEK / ENGLISH") { greek = !greek; showInvite() }
        button("UNRELATED ACCEPT — MUST NOT CLICK") { showInvite(unrelated = true) }
        button("AMBIGUOUS ACCEPT — MUST NOT CLICK") { showInvite(ambiguous = true) }
        button("RESET TEST COUNTERS") { prefs.testEpoch++; accepted = 0; state.text = "Test counters reset. Real hourly limits unchanged."; showInvite() }
        setContentView(ScrollView(this).apply { addView(root) });main.postDelayed(expiry, 60_000)
    }
    private fun showInvite(unrelated: Boolean = false, ambiguous: Boolean = false) {
        card?.let { root.removeView(it) }
        val box = LinearLayout(this).apply { orientation = 1; setPadding(20, 24, 20, 24); setBackgroundColor(Color.rgb(42, 35, 75)) }
        box.addView(TextView(this).apply { setTextColor(Color.WHITE); textSize = 18f; text = if (unrelated) "Example preferences" else if (greek) "${inviter.text} σας προσκαλεί σε αγώνα" else "${inviter.text} invited you to a match" })
        fun accept() = Button(this).apply { text = if (greek) "Αποδοχή" else "Accept"; setOnClickListener { accepted++; state.text = "LOCAL ACCEPT CLICKED: $accepted · ${prefs.testMode}"; root.removeView(box); card = null } }
        box.addView(accept());if (ambiguous) box.addView(accept())
        box.addView(Button(this).apply { text = if (greek) "Απόρριψη" else "Decline"; setOnClickListener { root.removeView(box); card = null; state.text = "Local invitation declined" } })
        card = box;root.addView(box)
    }
    override fun onDestroy() { main.removeCallbacks(expiry);prefs.testUntil = 0;super.onDestroy() }
}
