package live.nightkeep.pkmanager
import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.provider.Settings
import android.widget.*
class MainActivity:Activity(){
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState)
 val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(28,40,28,20)}
 val status=TextView(this).apply{text="AURA PK Manager · experimental alpha. TikTok UI support is unverified. Enable only while testing."}
 val toggle=Switch(this).apply{text="Enable automatic UI actions";isChecked=getSharedPreferences("pk",MODE_PRIVATE).getBoolean("enabled",false)}
 toggle.setOnCheckedChangeListener{_,checked->getSharedPreferences("pk",MODE_PRIVATE).edit().putBoolean("enabled",checked).apply()}
 val settings=Button(this).apply{text="Open Accessibility Settings";setOnClickListener{startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))}}
 layout.addView(status);layout.addView(toggle);layout.addView(settings);setContentView(layout)
 }
}
