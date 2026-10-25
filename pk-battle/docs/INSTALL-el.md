# NIGHTKEEP PK BATTLE: Εγκατάσταση και δοκιμές

## Α. Server στο Render (μία φορά)

Το υπάρχον NIGHTKEEP service **δεν αλλάζει**. Δημιουργείται ένα **νέο** service.

1. Render Dashboard → **New → Blueprint** → διάλεξε το repo `basilhsklrs-dot/nightkeep-live`, branch `main`. Αν θέλεις να το δοκιμάσεις πριν το merge, διάλεξε το branch `claude/tiktok-pk-battle-game-b0y3gv`.
2. Το Render διαβάζει το `render.yaml` και προτείνει το service **nightkeep-pk-battle**.
3. Στο `EULER_API_KEY` βάλε το **ίδιο** κλειδί EulerStream που έχει το NIGHTKEEP (Environment του παλιού service).
4. Deploy. Όταν τελειώσει, άνοιξε `https://<όνομα>.onrender.com/healthz`. Πρέπει να δεις `"ok":true`.
5. Από το Environment του νέου service αντέγραψε το **DEVICE_TOKEN** (θα το βάλεις στο tablet).

> Στο Free plan το Render «κοιμίζει» το service όταν δεν το χρησιμοποιεί κανείς, και το leaderboard χάνεται σε κάθε restart. Για LIVE χρήση προτείνεται Starter plan με Disk (mount `/var/data`, env `DATA_DIR=/var/data`).

Χρήσιμες μεταβλητές: `GAME_MODE=pk` (η μάχη ξεκινά με το PK) ή `continuous` (συνεχόμενες μάχες). Επίσης `GIFT_ID_MAP` (π.χ. `{"5655":"shield"}`), `GAME_RULES` (JSON overrides των κανόνων) και `CONNECT_OPPONENT=false` για να μην ανοίγει σύνδεση στο δωμάτιο του αντιπάλου.

Για demo χωρίς TikTok: `DEMO_MODE=true`. Εμφανίζεται πάντα το σήμα **SIMULATION**.

## Β. APK στο Xiaomi Pad 5

1. Στο tablet άνοιξε **GitHub → Releases → «NIGHTKEEP PK — latest APK»** και κατέβασε το `NIGHTKEEP-PK-<αριθμός>.apk`. Εναλλακτικά: Actions → «PK Battle — Android APK» → artifact.
2. Άνοιξε το αρχείο. Αν ζητηθεί, επίτρεψε «Εγκατάσταση από άγνωστες πηγές» για τον browser ή τον File Manager.
3. Αν η εγκατάσταση αποτύχει με «η υπογραφή διαφέρει», απεγκατέστησε την παλιά έκδοση. Οι εκδόσεις υπογράφονται με προσωρινό κλειδί μέχρι να οριστούν τα secrets `PK_KEYSTORE_*`.

### Ρυθμίσεις μέσα στην εφαρμογή
- **Game server URL**: `https://<όνομα>.onrender.com`
- **Session**: `nightkeep.live`
- **Device token**: το DEVICE_TOKEN από το Render
- **START GAME**: ανοίγει το παιχνίδι σε πλήρη οθόνη, κάθετα.

### Άδειες Android και γιατί χρειάζονται
| Άδεια | Γιατί |
|---|---|
| Internet / Network state | Σύνδεση με τον server και αυτόματη επανασύνδεση |
| Notifications (Android 13+) | Ειδοποίηση πρόσκλησης στη λειτουργία ASSIST |
| Vibrate | Δόνηση όταν έρχεται πρόσκληση |
| **Accessibility service** «NIGHTKEEP PK Auto Accept» | Διαβάζει **μόνο** την οθόνη του TikTok για να βρει το dialog πρόσκλησης και πατά το Accept (AUTO). Ενεργοποιείται χειροκίνητα: Ρυθμίσεις → Πρόσθετες ρυθμίσεις → Προσβασιμότητα → Εγκατεστημένες υπηρεσίες |

### MIUI (Xiaomi): απαραίτητο για να μη σταματά η υπηρεσία
- Ρυθμίσεις → Εφαρμογές → NIGHTKEEP PK → **Εξοικονόμηση μπαταρίας: Χωρίς περιορισμούς**
- **Autostart: ON**
- Κλείδωσε την εφαρμογή στις πρόσφατες εφαρμογές (σύρε προς τα κάτω την κάρτα της → λουκέτο).

### Λειτουργίες Auto Accept
- **OFF**: τίποτα (προεπιλογή).
- **ASSIST**: ειδοποίηση και δόνηση, και πατάς εσύ το Accept. Προτείνεται για αρχή.
- **AUTO**: πατά αυτόματα το Accept με cooldown, όριο ανά ώρα και προαιρετική λίστα επιτρεπόμενων.
- **Διακόπτης έκτακτης ανάγκης**: Quick Settings → πρόσθεσε το πλακίδιο **«PK Accept»** για άμεσο OFF.

## Γ. Βαθμονόμηση στην πρώτη πραγματική πρόσκληση (σημαντικό)

1. Στην εφαρμογή πάτα **CAPTURE TIKTOK UI**.
2. Ζήτα από έναν φίλο-δημιουργό να σου στείλει πρόσκληση PK και άφησε το dialog ανοιχτό λίγα δευτερόλεπτα.
3. Γύρνα στην εφαρμογή → DIAGNOSTICS: θα δεις τη γραμμή `[capture] TikTok UI ...` με τα κείμενα και τα view IDs.
4. Αν το dialog **δεν** αναγνωρίστηκε (π.χ. `buttons_not_recognised`), πάτα **SHARE LOGS** και στείλε μου το αρχείο. Εναλλακτικά, πρόσθεσε τη φράση ή την ετικέτα στα πεδία «Extra invitation phrases» / «Extra Accept button labels».

## Δ. Λίστα πραγματικών δοκιμών (στο tablet, κατά τη διάρκεια LIVE)

Σημείωσε ✅/❌ και στείλε μου τα logs:

1. ☐ Έναρξη LIVE → στην εφαρμογή «TikTok LIVE: live»
2. ☐ Like από θεατή → ενέργεια (energy) και στρατιώτες στην αριστερή ομάδα
3. ☐ Follow → +3 στρατιώτες (μόνο μία φορά ανά θεατή)
4. ☐ Rose ×1 → στρατιώτης· combo Rose ×20 → ακριβώς 20 δώρα και ένα μπόνους «COMBO x10»
5. ☐ Πρόσκληση PK (ASSIST) → ειδοποίηση και δόνηση
6. ☐ Πρόσκληση PK (AUTO) → αυτόματο Accept, στα logs «ACCEPT clicked», στον server `verifiedAccepts` +1
7. ☐ Έναρξη PK → το παιχνίδι ξεκινά, ο αντίπαλος εμφανίζεται δεξιά, το timer συγχρονίζεται με το PK
8. ☐ «TIKTOK PK SCORE» εμφανίζεται και ταιριάζει με την μπάρα του TikTok
9. ☐ Δώρα στο δωμάτιο του αντιπάλου → μονάδες στη δεξιά ομάδα (ή «<αντίπαλος> fans» στο fallback)
10. ☐ Λήξη PK → αποτέλεσμα στην οθόνη
11. ☐ Δεύτερη πρόσκληση μετά τη λήξη → αποδεκτή ξανά (μετά το cooldown)
12. ☐ Wi-Fi off για 10 s → «RECONNECTING» και αυτόματη επαναφορά
13. ☐ Κλείσιμο και επανεκκίνηση της εφαρμογής → η μάχη συνεχίζεται από τον server
