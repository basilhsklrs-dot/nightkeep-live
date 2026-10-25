package live.nightkeep.pkauto;
import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
public class PKAccessibilityService extends AccessibilityService {
 private static final long COOLDOWN_MS=12000;
 private long lastClickAt=0; private String lastInvitationSignature="";
 @Override public void onAccessibilityEvent(AccessibilityEvent event) {
  if(event==null||event.getPackageName()==null)return;
  String pkg=event.getPackageName().toString();
  if(!pkg.equals("com.zhiliaoapp.musically")&&!pkg.equals("com.ss.android.ugc.trill"))return;
  if(!getSharedPreferences("pk",MODE_PRIVATE).getBoolean("enabled",false))return;
  long now=android.os.SystemClock.elapsedRealtime(); if(now-lastClickAt<COOLDOWN_MS)return;
  AccessibilityNodeInfo root=getRootInActiveWindow(); if(root==null)return;
  try {
   List<AccessibilityNodeInfo> nodes=new ArrayList<>(); collect(root,nodes,0);
   boolean invite=false,decline=false; AccessibilityNodeInfo accept=null; StringBuilder signature=new StringBuilder();
   for(AccessibilityNodeInfo node:nodes){
    String t=norm(node.getText()),d=norm(node.getContentDescription()),both=t+" "+d;
    if(both.contains("προσκληση σε αγωνα")||both.contains("invitation to match")||both.contains("match invitation")||both.contains("invite to match")||both.contains("προσκληση για αγωνα"))invite=true;
    if(both.equals("απορριψη ")||both.contains("decline")||both.contains("reject")||both.equals("απορριψη"))decline=true;
    if(t.equals("αποδοχη")||t.equals("accept")||d.equals("αποδοχη")||d.equals("accept"))accept=node;
    if(signature.length()<200&&!t.isEmpty())signature.append(t).append('|');
   }
   if(!invite||!decline||accept==null)return;
   AccessibilityNodeInfo clickable=accept;
   for(int i=0;i<4&&clickable!=null&&!clickable.isClickable();i++)clickable=clickable.getParent();
   if(clickable==null||!clickable.isClickable()||!clickable.isEnabled())return;
   String sig=signature.toString();
   if(sig.equals(lastInvitationSignature)&&now-lastClickAt<60000)return;
   if(clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK)){lastClickAt=now;lastInvitationSignature=sig;}
  }finally{root.recycle();}
 }
 private void collect(AccessibilityNodeInfo node,List<AccessibilityNodeInfo> out,int depth){if(node==null||depth>24||out.size()>=300)return;out.add(node);for(int i=0;i<node.getChildCount();i++)collect(node.getChild(i),out,depth+1);}
 private String norm(CharSequence raw){if(raw==null)return "";String s=java.text.Normalizer.normalize(raw.toString().toLowerCase(Locale.ROOT),java.text.Normalizer.Form.NFD);return s.replaceAll("\\p{M}+","").trim();}
 @Override public void onInterrupt(){}
}