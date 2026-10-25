package live.nightkeep.pkbattle

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/** Full-screen, portrait, immersive game view. Reconnection is handled in-page; this reloads on hard failures. */
class GameActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var prefs: Prefs
    private val ui = Handler(Looper.getMainLooper())
    private var netCallback: ConnectivityManager.NetworkCallback? = null
    private var failed = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        prefs = Prefs(this); DiagLog.init(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this).apply {
            setBackgroundColor(Color.rgb(7, 5, 26))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                    if (!req.isForMainFrame) return
                    failed = true
                    DiagLog.log("game", "load failed (${err.errorCode}); retrying in 3 s")
                    ui.postDelayed({ load() }, 3000)
                }
                override fun onPageFinished(view: WebView, url: String) { if (!failed) DiagLog.log("game", "game loaded") }
            }
        }
        setContentView(web)
        immersive()
        load()
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        netCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { ui.post { if (failed) load() } }
            override fun onLost(network: Network) { DiagLog.log("game", "network lost; game will reconnect") }
        }
        runCatching { cm.registerDefaultNetworkCallback(netCallback!!) }
    }

    private fun load() {
        failed = false
        if (prefs.serverUrl.isEmpty()) { web.loadData("<body style='background:#07051a;color:#fff;font:24px sans-serif;padding:40px'>Set the server URL in the NIGHTKEEP PK app first.</body>", "text/html", "utf-8"); return }
        web.loadUrl(prefs.gameUrl())
    }

    private fun immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive() }
    override fun onResume() { super.onResume(); web.onResume(); web.evaluateJavascript("window.NK&&NK.setSound(${prefs.sound})", null) }
    override fun onPause() { web.onPause(); super.onPause() }
    override fun onDestroy() {
        netCallback?.let { runCatching { (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it) } }
        web.destroy(); super.onDestroy()
    }
}
