package app.esenho.ui

import app.esenho.desktop.graphics.Canvas
import app.esenho.desktop.platform.AttributeSet
import app.esenho.desktop.platform.Context
import app.esenho.desktop.platform.View

/**
 * Desktop counterpart of the Android surface host: the editor paints into the
 * Compose canvas through the JPanel-backed [View] shim, so there is no surface
 * to own and no frame coalescing to do.
 */
open class CanvasHost(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    /** Paints the whole content. */
    var drawContent: ((Canvas) -> Unit)? = null

    override fun onDraw(canvas: Canvas) {
        drawContent?.invoke(canvas)
    }
}
