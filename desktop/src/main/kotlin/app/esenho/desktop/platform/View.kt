package app.esenho.desktop.platform

import androidx.compose.foundation.Canvas as ComposeCanvas
import androidx.compose.foundation.focusable
import androidx.compose.runtime.*
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.input.pointer.*
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import app.esenho.desktop.graphics.Canvas
import java.awt.Graphics
import java.awt.event.*
import java.awt.image.BufferedImage
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

    var editorWindow: java.awt.Window? = null
    var hasEditorFocus = false
    var editorBounds = androidx.compose.ui.geometry.Rect.Zero
    var onComposeInvalidate: (() -> Unit)? = null

    override fun repaint() {
        super.repaint()
        onComposeInvalidate?.invoke()
    }

    private var oldWidth = 0
    private var oldHeight = 0

    init {
        app.esenho.desktop.TabletInput.initialize()
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
                        (this@View as? app.esenho.ui.EsenhoCanvasView)?.let { view ->
                            view.transformMatrix.postTranslate((e.x - lastX).toFloat(), (e.y - lastY).toFloat())
                            // Touch mapping reads the cached inverse, so it must
                            // follow every transform change or strokes land at the
                            // old pan position.
                            view.updateInverseMatrix()
                        }
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
                    // Touch mapping reads the cached inverse; without this the
                    // brush keeps drawing at the pre-zoom coordinates.
                    view.updateInverseMatrix()
                    repaint()
                }
            }
        addMouseListener(mouse)
        addMouseMotionListener(mouse)
        addMouseWheelListener(mouse)
        addFocusListener(
            object : FocusAdapter() {
                override fun focusGained(e: FocusEvent) {
                    hasEditorFocus = true
                }

                override fun focusLost(e: FocusEvent) {
                    hasEditorFocus = false
                }
            },
        )
    }

    override fun invalidate() {
        super.invalidate()
        repaint()
    }

    open fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {}

    open fun onDraw(canvas: Canvas) {}

    open fun onTouchEvent(event: MotionEvent) = false

    /** No input batching on desktop; kept so shared editor code compiles. */
    fun requestUnbufferedDispatch(event: MotionEvent) {}

    fun postInvalidateOnAnimation() {
        javax.swing
            .Timer(16) { repaint() }
            .apply {
                isRepeats = false
                start()
            }
    }

    fun postInvalidateDelayed(delayMillis: Long) {
        javax.swing
            .Timer(delayMillis.coerceAtLeast(1L).toInt()) { repaint() }
            .apply {
                isRepeats = false
                start()
            }
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        drawTo(g)
    }

    fun drawTo(g: Graphics) {
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

val LocalDesktopWindow = staticCompositionLocalOf<java.awt.Window?> { null }

/** The canvas belongs to Compose's rendering, hit testing and focus tree, just like its menus. */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun <T : View> DesktopCanvasView(factory: (Context) -> T, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val window = LocalDesktopWindow.current
    val view = remember(context) { factory(context) }
    val requester = remember { FocusRequester() }
    var revision by remember { mutableLongStateOf(0L) }
    var dimensions by remember { mutableStateOf(IntSize.Zero) }
    val backing =
        remember(dimensions) {
            if (dimensions.width > 0 && dimensions.height > 0)
                BufferedImage(dimensions.width, dimensions.height, BufferedImage.TYPE_INT_ARGB_PRE)
            else null
        }
    SideEffect { view.editorWindow = window }
    DisposableEffect(view) {
        view.onComposeInvalidate = { revision++ }
        if (java.lang.Boolean.getBoolean("esenho.uiSmoke"))
            app.esenho.desktop.desktopUiTestCanvas = view as? app.esenho.ui.EsenhoCanvasView
        onDispose {
            view.onComposeInvalidate = null
            view.hasEditorFocus = false
            view.editorWindow = null
            view.onTouchEvent(MotionEvent(MotionEvent.ACTION_CANCEL, 0f, 0f))
        }
    }
    ComposeCanvas(
        modifier =
            modifier
                .onSizeChanged {
                    dimensions = it
                    view.setSize(it.width, it.height)
                }
                .onGloballyPositioned { view.editorBounds = it.boundsInRoot() }
                .focusRequester(requester)
                .onFocusChanged { view.hasEditorFocus = it.isFocused }
                .focusable()
                .pointerInput(view) {
                    var pressed = false
                    try {
                        awaitPointerEventScope {
                            while (true) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull() ?: continue
                                if (change.isConsumed) {
                                    if (pressed)
                                        view.onTouchEvent(
                                            MotionEvent(
                                                MotionEvent.ACTION_CANCEL,
                                                change.position.x,
                                                change.position.y,
                                            )
                                        )
                                    pressed = false
                                    continue
                                }
                                val native = event.nativeEvent as? MouseEvent
                                val modifiers = native?.modifiersEx ?: 0
                                val id =
                                    when (event.type) {
                                        PointerEventType.Press -> MouseEvent.MOUSE_PRESSED
                                        PointerEventType.Move ->
                                            if (pressed) MouseEvent.MOUSE_DRAGGED else continue
                                        PointerEventType.Release ->
                                            if (pressed) MouseEvent.MOUSE_RELEASED else continue
                                        PointerEventType.Scroll -> MouseEvent.MOUSE_WHEEL
                                        else -> continue
                                    }
                                if (id == MouseEvent.MOUSE_PRESSED) {
                                    requester.requestFocus()
                                    pressed = true
                                }
                                val button =
                                    when {
                                        id == MouseEvent.MOUSE_DRAGGED -> MouseEvent.NOBUTTON
                                        native != null -> native.button
                                        event.buttons.isSecondaryPressed -> MouseEvent.BUTTON3
                                        event.buttons.isTertiaryPressed -> MouseEvent.BUTTON2
                                        else -> MouseEvent.BUTTON1
                                    }
                                val x = change.position.x.toInt()
                                val y = change.position.y.toInt()
                                if (id == MouseEvent.MOUSE_WHEEL) {
                                    val rotation =
                                        (native as? MouseWheelEvent)?.preciseWheelRotation
                                            ?: change.scrollDelta.y.toDouble()
                                    view.dispatchEvent(
                                        MouseWheelEvent(
                                            view,
                                            id,
                                            System.currentTimeMillis(),
                                            modifiers,
                                            x,
                                            y,
                                            0,
                                            0,
                                            0,
                                            false,
                                            MouseWheelEvent.WHEEL_UNIT_SCROLL,
                                            3,
                                            rotation.toInt(),
                                            rotation,
                                        )
                                    )
                                } else {
                                    view.dispatchEvent(
                                        MouseEvent(
                                            view,
                                            id,
                                            System.currentTimeMillis(),
                                            modifiers,
                                            x,
                                            y,
                                            if (id == MouseEvent.MOUSE_DRAGGED) 0 else 1,
                                            false,
                                            button,
                                        )
                                    )
                                }
                                if (id == MouseEvent.MOUSE_RELEASED) pressed = false
                                change.consume()
                            }
                        }
                    } finally {
                        if (pressed)
                            view.onTouchEvent(MotionEvent(MotionEvent.ACTION_CANCEL, 0f, 0f))
                    }
                }
    ) {
        // Observe invalidations here so a frame does not recreate the canvas or its pointer
        // handler.
        revision
        backing?.let { image ->
            val graphics = image.createGraphics()
            try {
                view.drawTo(graphics)
            } finally {
                graphics.dispose()
            }
            drawImage(image.toComposeImageBitmap())
        }
    }
}
