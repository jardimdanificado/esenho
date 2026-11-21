package app.esenho.desktop.platform

import androidx.compose.runtime.*
import java.io.*
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import javax.swing.*
import org.json.JSONObject

annotation class Keep

class Uri private constructor(val file: File) {
    override fun toString() = file.toURI().toString()

    companion object {
        fun parse(path: String) =
            Uri(if (path.startsWith("file:")) File(java.net.URI(path)) else File(path))

        fun fromFile(file: File) = Uri(file)
    }
}

class ContentResolver {
    fun openInputStream(uri: Uri): InputStream = uri.file.inputStream()

    fun openOutputStream(uri: Uri, mode: String = "w"): OutputStream = uri.file.outputStream()

    fun takePersistableUriPermission(uri: Uri, flags: Int) {
        /* Local files require no Android URI grant. */
    }
}

class DisplayMetrics {
    val scaledDensity = 1f
    val density = 1f
}

class Resources {
    val displayMetrics = DisplayMetrics()
    private val names = mutableMapOf<Int, String>()

    fun getIdentifier(name: String, type: String, pkg: String): Int {
        val id = name.hashCode()
        names[id] = name
        return id
    }

    fun openRawResource(id: Int): InputStream {
        val name =
            names[id]
                ?: when (id) {
                    1 -> "esenho_script_api"
                    2 -> "esenho_script_reference"
                    3 -> "esenho_native_metadata"
                    else -> error("Recurso desconhecido: $id")
                }
        return listOf("js", "txt", "json").firstNotNullOfOrNull {
            Resources::class.java.getResourceAsStream("/$name.$it")
        } ?: error("Recurso ausente: $name")
    }
}

class Context {
    val filesDir =
        File(
                System.getenv("XDG_DATA_HOME") ?: "${System.getProperty("user.home")}/.local/share",
                "esenho",
            )
            .apply { mkdirs() }
    val cacheDir =
        File(
                System.getenv("XDG_CACHE_HOME") ?: "${System.getProperty("user.home")}/.cache",
                "esenho",
            )
            .apply { mkdirs() }
    val resources = Resources()
    val contentResolver = ContentResolver()
    val packageName = "app.esenho.desktop"
    private val preferences = mutableMapOf<String, SharedPreferences>()

    fun getSharedPreferences(name: String, mode: Int) =
        preferences.getOrPut(name) { SharedPreferences(File(filesDir, "$name.json")) }

    fun getString(id: Int) = app.esenho.desktop.BuildVersion.VERSION

    companion object {
        const val MODE_PRIVATE = 0
    }
}

class SharedPreferences(private val file: File) {
    private val values = if (file.exists()) JSONObject(file.readText()) else JSONObject()

    fun getString(key: String, fallback: String?): String? =
        if (values.has(key)) values.getString(key) else fallback

    fun getBoolean(key: String, fallback: Boolean) = values.optBoolean(key, fallback)

    fun getInt(key: String, fallback: Int) = values.optInt(key, fallback)

    fun getFloat(key: String, fallback: Float) =
        values.optDouble(key, fallback.toDouble()).toFloat()

    fun edit() = Editor()

    inner class Editor {
        private val changes = mutableMapOf<String, Any?>()

        fun putString(key: String, value: String?) = apply { changes[key] = value }

        fun putBoolean(key: String, value: Boolean) = apply { changes[key] = value }

        fun putInt(key: String, value: Int) = apply { changes[key] = value }

        fun putFloat(key: String, value: Float) = apply { changes[key] = value }

        fun remove(key: String) = apply { changes[key] = null }

        fun apply() {
            changes.forEach { (k, v) -> if (v == null) values.remove(k) else values.put(k, v) }
            val atomic = AtomicFile(file)
            val stream = atomic.startWrite()
            try {
                stream.write(values.toString().toByteArray())
                atomic.finishWrite(stream)
            } catch (e: Exception) {
                atomic.failWrite(stream)
                throw e
            }
        }
    }
}

class AtomicFile(private val file: File) {
    private val pending = File(file.path + ".new")

    fun startWrite(): FileOutputStream {
        file.parentFile?.mkdirs()
        return pending.outputStream()
    }

    fun finishWrite(stream: FileOutputStream) {
        stream.fd.sync()
        stream.close()
        Files.move(
            pending.toPath(),
            file.toPath(),
            StandardCopyOption.ATOMIC_MOVE,
            StandardCopyOption.REPLACE_EXISTING,
        )
    }

    fun failWrite(stream: FileOutputStream?) {
        stream?.close()
        pending.delete()
    }
}

object Intent {
    const val FLAG_GRANT_READ_URI_PERMISSION = 1
    const val FLAG_GRANT_WRITE_URI_PERMISSION = 2
}

object Log {
    fun e(tag: String, message: String, error: Throwable? = null) {
        System.err.println("$tag: $message")
        error?.printStackTrace()
    }

    fun w(tag: String, message: String, error: Throwable? = null) = e(tag, message, error)
}

object Base64 {
    const val DEFAULT = 0

    fun decode(text: String, flags: Int) = java.util.Base64.getMimeDecoder().decode(text)
}

object SystemClock {
    fun elapsedRealtime() = System.nanoTime() / 1_000_000
    fun uptimeMillis() = elapsedRealtime()
}

class Looper {
    companion object {
        fun getMainLooper() = Looper()
    }
}

class Handler(looper: Looper) {
    fun post(action: Runnable): Boolean {
        SwingUtilities.invokeLater(action)
        return true
    }
}

class Toast private constructor(private val message: String, private val duration: Int) {
    fun show() {
        if (!SwingUtilities.isEventDispatchThread()) {
            SwingUtilities.invokeLater { show() }
            return
        }
        val owner = java.awt.KeyboardFocusManager.getCurrentKeyboardFocusManager().activeWindow
        val popup =
            JWindow(owner).apply {
                focusableWindowState = false
                contentPane.add(
                    JLabel(message).apply {
                        foreground = java.awt.Color(0xEBDBB2)
                        background = java.awt.Color(0x3C3836)
                        isOpaque = true
                        border = BorderFactory.createEmptyBorder(10, 16, 10, 16)
                    }
                )
                pack()
                setLocationRelativeTo(owner)
                if (owner != null) setLocation(x, owner.y + owner.height - height - 48)
                isVisible = true
            }
        Timer(if (duration == LENGTH_LONG) 4500 else 2500) { popup.dispose() }
            .apply {
                isRepeats = false
                start()
            }
    }

    companion object {
        const val LENGTH_SHORT = 0
        const val LENGTH_LONG = 1

        fun makeText(context: Context, message: String, duration: Int) = Toast(message, duration)
    }
}

val LocalContext = staticCompositionLocalOf { Context() }

data class Configuration(val screenWidthDp: Int = 1280, val screenHeightDp: Int = 800)

val LocalConfiguration = staticCompositionLocalOf { Configuration() }

object ActivityResultContracts {
    class OpenDocument : FileContract<Array<String>>()

    class GetContent : FileContract<String>()

    class CreateDocument(val mime: String) : FileContract<String>()
}

open class FileContract<T>

class FileLauncher<T>(private val contract: FileContract<T>, private val callback: (Uri?) -> Unit) {
    fun launch(input: T) {
        val picker = JFileChooser()
        if (contract is ActivityResultContracts.CreateDocument)
            picker.selectedFile = File(input.toString())
        val result =
            if (contract is ActivityResultContracts.CreateDocument) picker.showSaveDialog(null)
            else picker.showOpenDialog(null)
        if (result != JFileChooser.APPROVE_OPTION) {
            callback(null)
            return
        }
        if (
            contract is ActivityResultContracts.CreateDocument &&
                picker.selectedFile.exists() &&
                JOptionPane.showConfirmDialog(
                    null,
                    "Substituir ${picker.selectedFile.name}?",
                    "Esenho",
                    JOptionPane.YES_NO_OPTION,
                ) != JOptionPane.YES_OPTION
        ) {
            callback(null)
            return
        }
        callback(Uri.fromFile(picker.selectedFile))
    }
}

@Composable
fun <T> rememberLauncherForActivityResult(
    contract: FileContract<T>,
    onResult: (Uri?) -> Unit,
): FileLauncher<T> {
    val callback by rememberUpdatedState(onResult)
    return remember { FileLauncher(contract) { callback(it) } }
}

@Composable
fun BackHandler(enabled: Boolean = true, onBack: () -> Unit) {
    val callback by rememberUpdatedState(onBack)
    DisposableEffect(enabled) {
        val listener =
            java.awt.KeyEventDispatcher { event ->
                if (
                    enabled &&
                        event.id == java.awt.event.KeyEvent.KEY_PRESSED &&
                        event.keyCode == java.awt.event.KeyEvent.VK_ESCAPE
                ) {
                    callback()
                    true
                } else false
            }
        val manager = java.awt.KeyboardFocusManager.getCurrentKeyboardFocusManager()
        manager.addKeyEventDispatcher(listener)
        onDispose { manager.removeKeyEventDispatcher(listener) }
    }
}
