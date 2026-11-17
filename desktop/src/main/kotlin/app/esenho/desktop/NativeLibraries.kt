package app.esenho.desktop

import java.nio.file.Files

/** Extracts packaged native libraries so the distribution works outside the checkout. */
object NativeLibraries {
    private val loaded = mutableSetOf<String>()
    private val directory by lazy {
        Files.createTempDirectory("esenho-native-").toFile().apply { deleteOnExit() }
    }

    @Synchronized
    fun load(name: String) {
        if (name in loaded) return
        val filename = System.mapLibraryName(name)
        val resource = javaClass.getResourceAsStream("/native/$filename")
        if (resource == null) System.loadLibrary(name)
        else {
            val file = directory.resolve(filename).apply { deleteOnExit() }
            resource.use { source -> file.outputStream().use { source.copyTo(it) } }
            System.load(file.absolutePath)
        }
        loaded += name
    }
}
