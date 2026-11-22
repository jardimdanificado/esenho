package app.esenho.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.PixelFormat
import android.util.AttributeSet
import android.view.Choreographer
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView

/**
 * Hosts the editor on its own buffer.
 *
 * Every frame used to go through the window surface: Compose recomposed and the
 * compositor re-uploaded the whole document texture whenever a stroke sample
 * changed one pixel. A SurfaceView keeps the document out of that path, so a
 * stroke only repaints this surface. Content comes from [drawContent] and is
 * painted at most once per display frame, even when touch samples arrive faster.
 */
open class CanvasHost @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : SurfaceView(context, attrs, defStyleAttr), SurfaceHolder.Callback {

    /** Paints the whole surface. Must fill the clip with an opaque colour. */
    var drawContent: ((Canvas) -> Unit)? = null

    private var surfaceReady = false
    private var frameScheduled = false
    private var detached = false

    private val frameCallback = Choreographer.FrameCallback {
        frameScheduled = false
        drawFrame()
    }

    init {
        holder.addCallback(this)
        // The canvas workspace paints its own opaque background, so no blending
        // with the window is needed.
        holder.setFormat(PixelFormat.OPAQUE)
    }

    override fun invalidate() {
        scheduleFrame()
    }

    override fun postInvalidateOnAnimation() {
        scheduleFrame()
    }

    override fun postInvalidateDelayed(delayMillis: Long) {
        if (delayMillis <= 0L) scheduleFrame()
        else postDelayed({ scheduleFrame() }, delayMillis)
    }

    private fun scheduleFrame() {
        if (frameScheduled || detached || !surfaceReady) return
        frameScheduled = true
        Choreographer.getInstance().postFrameCallback(frameCallback)
    }

    private fun drawFrame() {
        if (detached || !surfaceReady) return
        val content = drawContent ?: return
        val canvas =
            try {
                holder.lockCanvas()
            } catch (_: IllegalArgumentException) {
                null
            } catch (_: IllegalStateException) {
                null
            } catch (_: Surface.OutOfResourcesException) {
                null
            } ?: return
        try {
            content(canvas)
        } finally {
            try {
                holder.unlockCanvasAndPost(canvas)
            } catch (_: IllegalArgumentException) {
            } catch (_: IllegalStateException) {
            }
        }
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        surfaceReady = true
        scheduleFrame()
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        // A resized surface starts from a fresh buffer, so repaint all of it.
        surfaceReady = width > 0 && height > 0
        scheduleFrame()
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        surfaceReady = false
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        detached = false
    }

    override fun onDetachedFromWindow() {
        detached = true
        Choreographer.getInstance().removeFrameCallback(frameCallback)
        super.onDetachedFromWindow()
    }
}
