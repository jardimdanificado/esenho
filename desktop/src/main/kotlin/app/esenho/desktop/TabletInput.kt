package app.esenho.desktop

/**
 * XInput2 supplies pressure, tilt and eraser identity when the X server exposes tablet valuators.
 */
object TabletInput {
    private external fun start(): Boolean

    private external fun read(): FloatArray

    private val available by lazy {
        try {
            NativeLibraries.load("esenho_input")
            start()
        } catch (_: UnsatisfiedLinkError) {
            false
        }
    }

    fun sample(): FloatArray = if (available) read() else floatArrayOf(1f, 0f, 0f)
}
