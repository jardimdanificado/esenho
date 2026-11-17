package app.esenho.desktop.platform

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.awt.SwingPanel
import app.esenho.desktop.graphics.Canvas
import java.awt.Graphics
import java.awt.event.*
import javax.swing.JPanel

interface AttributeSet

object KeyEvent {
    const val META_SHIFT_ON = 1
    const val META_CTRL_ON = 4096
    const val META_META_ON = 65536
}

class MotionEvent(
    val actionMasked: Int,
    val x: Float,
    val y: Float,
    val metaState: Int = 0,
    private val eraser: Boolean = false,
) {
    private val tablet = app.esenho.desktop.TabletInput.sample()
    val pointerCount = 1
    val actionIndex = 0
    val pressure = tablet[0]
    val historySize = 0
    val eventTime = SystemClock.elapsedRealtime()

    fun getPointerId(index: Int) = 0

    fun getX(index: Int) = x

    fun getY(index: Int) = y

    fun getToolType(index: Int) =
        if (eraser || tablet[2] == 2f) TOOL_TYPE_ERASER
        else if (tablet[2] == 1f) TOOL_TYPE_STYLUS else TOOL_TYPE_MOUSE

    fun getAxisValue(axis: Int) = if (axis == AXIS_TILT) tablet[1] else 0f

    fun getHistoricalX(pointer: Int, position: Int) = x

    fun getHistoricalY(pointer: Int, position: Int) = y

    fun getHistoricalPressure(pointer: Int, position: Int) = pressure

    fun getHistoricalAxisValue(axis: Int, pointer: Int, position: Int) = 0f

    companion object {
        const val ACTION_DOWN = 0
        const val ACTION_UP = 1
        const val ACTION_MOVE = 2
        const val ACTION_CANCEL = 3
        const val ACTION_POINTER_DOWN = 5
        const val ACTION_POINTER_UP = 6
        const val AXIS_TILT = 25
        const val TOOL_TYPE_FINGER = 1
        const val TOOL_TYPE_STYLUS = 2
        const val TOOL_TYPE_MOUSE = 3
        const val TOOL_TYPE_ERASER = 4
    }
}

open class View(val context: Context, attrs: AttributeSet? = null, style: Int = 0) : JPanel() {
    val resources
        get() = context.resources

    private var oldWidth = 0
    private var oldHeight = 0

    init {
        isFocusable = true
        val mouse =
            object : MouseAdapter() {
                private var drawing = false
                private var panning = false
                private var erase = false
                private var lastX = 0
                private var lastY = 0

                fun event(e: MouseEvent, action: Int) =
                    MotionEvent(
                        action,
                        e.x.toFloat(),
                        e.y.toFloat(),
                        (if (e.isShiftDown) KeyEvent.META_SHIFT_ON else 0) or
                            (if (e.isControlDown) KeyEvent.META_CTRL_ON else 0) or
                            (if (e.isMetaDown) KeyEvent.META_META_ON else 0),
                        erase,
                    )

                override fun mousePressed(e: MouseEvent) {
                    requestFocusInWindow()
                    panning = javax.swing.SwingUtilities.isMiddleMouseButton(e)
                    lastX = e.x
                    lastY = e.y
                    erase = javax.swing.SwingUtilities.isRightMouseButton(e)
                    if (!panning) {
                        drawing = true
                        onTouchEvent(event(e, MotionEvent.ACTION_DOWN))
                    }
                }

                override fun mouseDragged(e: MouseEvent) {
                    if (panning) {
                        (this@View as? app.esenho.ui.EsenhoCanvasView)
                            ?.transformMatrix
                            ?.postTranslate((e.x - lastX).toFloat(), (e.y - lastY).toFloat())
                        lastX = e.x
                        lastY = e.y
                        repaint()
                    } else if (drawing) onTouchEvent(event(e, MotionEvent.ACTION_MOVE))
                }

                override fun mouseReleased(e: MouseEvent) {
                    if (drawing) onTouchEvent(event(e, MotionEvent.ACTION_UP))
                    drawing = false
                    panning = false
                }

                override fun mouseWheelMoved(e: MouseWheelEvent) {
                    val view = this@View as? app.esenho.ui.EsenhoCanvasView ?: return
                    if (e.isShiftDown)
                        view.transformMatrix.postRotate(
                            (-e.preciseWheelRotation * 5).toFloat(),
                            e.x.toFloat(),
                            e.y.toFloat(),
                        )
                    else {
                        val scale = Math.pow(1.12, -e.preciseWheelRotation).toFloat()
                        view.transformMatrix.postScale(scale, scale, e.x.toFloat(), e.y.toFloat())
                    }
                    repaint()
                }
            }
        addMouseListener(mouse)
        addMouseMotionListener(mouse)
        addMouseWheelListener(mouse)
    }

    override fun invalidate() {
        super.invalidate()
        repaint()
    }

    open fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {}

    open fun onDraw(canvas: Canvas) {}

    open fun onTouchEvent(event: MotionEvent) = false

    fun postInvalidateOnAnimation() {
        javax.swing
            .Timer(16) { repaint() }
            .apply {
                isRepeats = false
                start()
            }
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        if (width != oldWidth || height != oldHeight) {
            onSizeChanged(width, height, oldWidth, oldHeight)
            oldWidth = width
            oldHeight = height
        }
        val copy = g.create() as java.awt.Graphics2D
        try {
            onDraw(Canvas(copy, width, height))
        } finally {
            copy.dispose()
        }
    }
}

@Composable
fun <T : View> DesktopCanvasView(factory: (Context) -> T, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    SwingPanel(factory = { factory(context) }, modifier = modifier)
}
