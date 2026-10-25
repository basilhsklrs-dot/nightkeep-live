package live.nightkeep.pkbattle

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings kill switch: one tap turns Auto Accept OFF (or back to AUTO). */
class AutoAcceptTile : TileService() {
    override fun onStartListening() = render()
    override fun onClick() {
        val p = Prefs(this)
        p.mode = if (p.mode == AcceptMode.OFF) AcceptMode.AUTO else AcceptMode.OFF
        DiagLog.init(this); DiagLog.log("tile", "Auto Accept set to ${p.mode} from Quick Settings")
        render()
    }
    private fun render() {
        val t = qsTile ?: return
        val m = Prefs(this).mode
        t.state = if (m == AcceptMode.OFF) Tile.STATE_INACTIVE else Tile.STATE_ACTIVE
        t.label = "PK Accept: $m"
        t.updateTile()
    }
}
