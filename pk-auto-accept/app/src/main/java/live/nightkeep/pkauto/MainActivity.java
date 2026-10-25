package live.nightkeep.pkauto;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;
public class MainActivity extends Activity {
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  LinearLayout root = new LinearLayout(this); root.setOrientation(1); root.setPadding(35,55,35,30); root.setGravity(Gravity.CENTER_HORIZONTAL);
  TextView title = new TextView(this); title.setText("NIGHTKEEP PK AUTO ACCEPT"); title.setTextSize(22); root.addView(title);
  TextView note = new TextView(this); note.setText("1. Enable automatic PK acceptance below.\n2. Open Accessibility settings and enable NIGHTKEEP PK AUTO ACCEPT.\n3. Open TikTok LIVE.\n\nTest with a trusted creator first. This does not stream the game."); note.setTextSize(16); note.setPadding(0,35,0,35); root.addView(note);
  Switch enabled = new Switch(this); enabled.setText("Auto-accept PK invitations"); enabled.setChecked(getSharedPreferences("pk",MODE_PRIVATE).getBoolean("enabled",false)); enabled.setOnCheckedChangeListener((button,checked)->getSharedPreferences("pk",MODE_PRIVATE).edit().putBoolean("enabled",checked).apply()); root.addView(enabled);
  Button settings = new Button(this); settings.setText("OPEN ACCESSIBILITY SETTINGS"); settings.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))); root.addView(settings);
  TextView privacy = new TextView(this); privacy.setText("No network access. Disable anytime."); privacy.setPadding(0,35,0,0); root.addView(privacy);
  setContentView(root);
 }
}