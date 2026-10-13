package app.esenho

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    companion object {
        private const val FILE_CHOOSER_REQUEST_CODE = 1001
        private const val START_URL = "https://appassets.androidplatform.net/assets/painter.html"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED)
        enableImmersiveMode()

        webView = WebView(this)
        webView.setBackgroundColor(0xFF161819.toInt())
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", OfflineAssetsPathHandler(applicationContext))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.addJavascriptInterface(EsenhoAndroidBridge(this), "EsenhoAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                injectBlobDownloadInterceptor(view)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback

                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    if (fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }

                return try {
                    startActivityForResult(
                        Intent.createChooser(intent, "Import file"),
                        FILE_CHOOSER_REQUEST_CODE
                    )
                    true
                } catch (e: Exception) {
                    fileUploadCallback = null
                    false
                }
            }
        }

        webView.setDownloadListener { url, _, _, mimetype, _ ->
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                val safeMime = mimetype ?: "application/octet-stream"
                val js = """
                    (function() {
                        fetch(${org.json.JSONObject.quote(url)})
                            .then(function(r) { return r.blob(); })
                            .then(function(blob) {
                                var reader = new FileReader();
                                reader.onloadend = function() {
                                    window.EsenhoAndroid.saveBase64File(
                                        reader.result,
                                        'esenho_export_' + Date.now(),
                                        blob.type || ${org.json.JSONObject.quote(safeMime)}
                                    );
                                };
                                reader.readAsDataURL(blob);
                            });
                    })();
                """.trimIndent()
                webView.evaluateJavascript(js, null)
            }
        }

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun injectBlobDownloadInterceptor(view: WebView) {
        val script = """
            (function() {
                if (window.__esenhoAndroidBlobHooked) return;
                window.__esenhoAndroidBlobHooked = true;
                const origClick = HTMLAnchorElement.prototype.click;
                HTMLAnchorElement.prototype.click = function() {
                    const href = this.href || '';
                    const dl = this.getAttribute('download') || this.download;
                    if (dl !== null && dl !== undefined && (href.startsWith('blob:') || href.startsWith('data:'))) {
                        const filename = dl || ('esenho_' + Date.now());
                        fetch(href)
                            .then(r => r.blob())
                            .then(blob => {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    if (window.EsenhoAndroid && window.EsenhoAndroid.saveBase64File) {
                                        window.EsenhoAndroid.saveBase64File(
                                            reader.result,
                                            filename,
                                            blob.type || 'application/octet-stream'
                                        );
                                    }
                                };
                                reader.readAsDataURL(blob);
                            })
                            .catch(err => console.error('Android export error:', err));
                        return;
                    }
                    return origClick.apply(this, arguments);
                };
            })();
        """.trimIndent()
        view.evaluateJavascript(script, null)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            val callback = fileUploadCallback
            fileUploadCallback = null
            if (resultCode != RESULT_OK || data == null) {
                callback?.onReceiveValue(null)
                return
            }
            val results = mutableListOf<Uri>()
            val clipData = data.clipData
            if (clipData != null) {
                for (i in 0 until clipData.itemCount) {
                    clipData.getItemAt(i)?.uri?.let { results.add(it) }
                }
            } else {
                data.data?.let { results.add(it) }
            }
            callback?.onReceiveValue(results.toTypedArray())
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableImmersiveMode()
        }
    }

    private fun enableImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
    }

    private class OfflineAssetsPathHandler(private val context: Context) :
        WebViewAssetLoader.PathHandler {

        override fun handle(path: String): WebResourceResponse? {
            val cleanPath = path.trimStart('/').ifEmpty { "painter.html" }
            return try {
                val inputStream = context.assets.open(cleanPath)
                val mimeType = guessMimeType(cleanPath)
                val headers = mapOf(
                    "Access-Control-Allow-Origin" to "*",
                    "Cache-Control" to "no-cache"
                )
                WebResourceResponse(mimeType, "UTF-8", 200, "OK", headers, inputStream)
            } catch (e: Exception) {
                null
            }
        }

        private fun guessMimeType(path: String): String {
            val ext = path.substringAfterLast('.', "").lowercase()
            return when (ext) {
                "html", "htm" -> "text/html"
                "js", "mjs" -> "text/javascript"
                "css" -> "text/css"
                "json", "webmanifest", "esen" -> "application/json"
                "wasm" -> "application/wasm"
                "svg" -> "image/svg+xml"
                "png" -> "image/png"
                "jpg", "jpeg" -> "image/jpeg"
                "gif" -> "image/gif"
                "webp" -> "image/webp"
                "webm" -> "video/webm"
                "wav" -> "audio/wav"
                else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
                    ?: "application/octet-stream"
            }
        }
    }

    private class EsenhoAndroidBridge(private val activity: Activity) {

        @JavascriptInterface
        fun saveBase64File(base64Data: String, fileName: String, mimeType: String) {
            try {
                val payload = if (base64Data.contains(",")) {
                    base64Data.substringAfter(",")
                } else {
                    base64Data
                }
                val bytes = Base64.decode(payload, Base64.DEFAULT)
                val safeName = fileName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                    .ifEmpty { "esenho_export_${System.currentTimeMillis()}" }
                val resolvedMime = mimeType.ifEmpty { "application/octet-stream" }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val resolver = activity.contentResolver
                    val values = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
                        put(MediaStore.MediaColumns.MIME_TYPE, resolvedMime)
                        put(
                            MediaStore.MediaColumns.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + "/Esenho"
                        )
                    }
                    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IllegalStateException("Failed to create MediaStore entry")
                    resolver.openOutputStream(uri)?.use { out ->
                        out.write(bytes)
                        out.flush()
                    }
                } else {
                    @Suppress("DEPRECATION")
                    val dir = File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        "Esenho"
                    )
                    if (!dir.exists()) dir.mkdirs()
                    val outFile = File(dir, safeName)
                    FileOutputStream(outFile).use { out ->
                        out.write(bytes)
                        out.flush()
                    }
                }

                activity.runOnUiThread {
                    Toast.makeText(
                        activity,
                        "Saved to Downloads/Esenho/$safeName",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } catch (e: Exception) {
                activity.runOnUiThread {
                    Toast.makeText(
                        activity,
                        "Export failed: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }
}
