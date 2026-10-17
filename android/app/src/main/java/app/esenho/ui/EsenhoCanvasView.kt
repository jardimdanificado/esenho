package app.esenho.ui

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.ToolMode

class EsenhoCanvasView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    var engine: EsenhoEngine? = null
        set(value) {
            field = value
            invalidate()
        }

    var onStateChanged: (() -> Unit)? = null
    var onColorPicked: ((Int) -> Unit)? = null

    // Transform matrix for Pan & Zoom
    private val transformMatrix = Matrix()
    private val inverseMatrix = Matrix()
    var scaleFactor = 1.0f
        private set

    // Touch & Stylus detectors
    private val scaleDetector: ScaleGestureDetector
    private val gestureDetector: GestureDetector

    // Gesture tracking
    private var isMultiTouch = false
    private var touchDownTime = 0L
    private var initialPointerCount = 0
    private var lastTouchX = 0f
    private var lastTouchY = 0f

    // Eyedropper Loupe state
    var isEyedropperActive = false
        private set
    private var loupeScreenX = 0f
    private var loupeScreenY = 0f
    private var loupePickedColor = Color.BLACK

    // Size Preview indicator
    var previewBrushSize: Float = 0f
        set(value) {
            field = value
            invalidate()
        }

    // Paints
    private val bgPaint = Paint().apply {
        color = 0xFF181A1B.toInt()
        style = Paint.Style.FILL
    }

    private val shadowPaint = Paint().apply {
        color = 0x50000000
        style = Paint.Style.FILL
    }

    private val onionPrevPaint = Paint().apply {
        alpha = 90
        colorFilter = LightingColorFilter(0xFFFF6666.toInt(), 0x00000000)
    }

    private val onionNextPaint = Paint().apply {
        alpha = 90
        colorFilter = LightingColorFilter(0xFF66AAFF.toInt(), 0x00000000)
    }

    private val loupeRingPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 6f
        color = Color.WHITE
        isAntiAlias = true
    }

    private val loupeShadowPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 8f
        color = 0x80000000.toInt()
        isAntiAlias = true
    }

    private val loupeFillPaint = Paint().apply {
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val sizePreviewPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        color = Color.WHITE
        isAntiAlias = true
    }

    init {
        scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val scale = detector.scaleFactor
                scaleFactor = (scaleFactor * scale).coerceIn(0.15f, 20.0f)
                transformMatrix.postScale(scale, scale, detector.focusX, detector.focusY)
                transformMatrix.invert(inverseMatrix)
                invalidate()
                return true
            }
        })

        gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onLongPress(e: MotionEvent) {
                // Long-press triggers Eyedropper loupe
                isEyedropperActive = true
                loupeScreenX = e.x
                loupeScreenY = e.y
                val (cx, cy) = mapToCanvas(e.x, e.y)
                val c = engine?.pickColorAt(cx, cy) ?: Color.BLACK
                loupePickedColor = c
                onColorPicked?.invoke(c)
                invalidate()
            }
        })
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) {
            if (engine == null) {
                engine = EsenhoEngine(context, w, h)
            } else {
                engine?.resize(w, h)
            }
            transformMatrix.reset()
            transformMatrix.invert(inverseMatrix)
            invalidate()
        }
    }

    private fun mapToCanvas(screenX: Float, screenY: Float): Pair<Float, Float> {
        val pts = floatArrayOf(screenX, screenY)
        inverseMatrix.mapPoints(pts)
        return Pair(pts[0], pts[1])
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        gestureDetector.onTouchEvent(event)
        scaleDetector.onTouchEvent(event)

        val pointerCount = event.pointerCount

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                touchDownTime = System.currentTimeMillis()
                initialPointerCount = 1
                isMultiTouch = false
                lastTouchX = event.x
                lastTouchY = event.y

                val (cx, cy) = mapToCanvas(event.x, event.y)
                val pressure = if (event.pressure > 0.01f) event.pressure else 0.5f
                val tilt = (event.getAxisValue(MotionEvent.AXIS_TILT) * 180f / Math.PI).toInt()

                if (engine?.currentTool == ToolMode.EYEDROPPER) {
                    isEyedropperActive = true
                    loupeScreenX = event.x
                    loupeScreenY = event.y
                    val c = engine?.pickColorAt(cx, cy) ?: Color.BLACK
                    loupePickedColor = c
                    onColorPicked?.invoke(c)
                    invalidate()
                    return true
                }

                engine?.onTouchDown(cx, cy, pressure, tilt, 0)
                invalidate()
                return true
            }

            MotionEvent.ACTION_POINTER_DOWN -> {
                isMultiTouch = true
                initialPointerCount = Math.max(initialPointerCount, pointerCount)
                isEyedropperActive = false
                engine?.onTouchUp(0f, 0f)
                invalidate()
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                if (isEyedropperActive) {
                    loupeScreenX = event.x
                    loupeScreenY = event.y
                    val (cx, cy) = mapToCanvas(event.x, event.y)
                    val c = engine?.pickColorAt(cx, cy) ?: Color.BLACK
                    loupePickedColor = c
                    onColorPicked?.invoke(c)
                    invalidate()
                    return true
                }

                if (isMultiTouch || pointerCount > 1) {
                    val dx = event.x - lastTouchX
                    val dy = event.y - lastTouchY
                    if (!scaleDetector.isInProgress) {
                        transformMatrix.postTranslate(dx, dy)
                        transformMatrix.invert(inverseMatrix)
                    }
                    lastTouchX = event.x
                    lastTouchY = event.y
                    invalidate()
                } else {
                    val historySize = event.historySize
                    for (h in 0 until historySize) {
                        val (hcx, hcy) = mapToCanvas(event.getHistoricalX(h), event.getHistoricalY(h))
                        val hp = event.getHistoricalPressure(h)
                        engine?.onTouchMove(hcx, hcy, if (hp > 0.01f) hp else 0.5f)
                    }

                    val (cx, cy) = mapToCanvas(event.x, event.y)
                    val pressure = if (event.pressure > 0.01f) event.pressure else 0.5f
                    val tilt = (event.getAxisValue(MotionEvent.AXIS_TILT) * 180f / Math.PI).toInt()

                    engine?.onTouchMove(cx, cy, pressure, tilt, 0)
                    invalidate()
                }
                return true
            }

            MotionEvent.ACTION_POINTER_UP -> {
                val dt = System.currentTimeMillis() - touchDownTime
                if (initialPointerCount == 2 && dt < 280) {
                    engine?.undo()
                    onStateChanged?.invoke()
                    invalidate()
                } else if (initialPointerCount == 3 && dt < 280) {
                    engine?.redo()
                    onStateChanged?.invoke()
                    invalidate()
                }
                return true
            }

            MotionEvent.ACTION_UP -> {
                if (isEyedropperActive) {
                    isEyedropperActive = false
                    if (engine?.currentTool == ToolMode.EYEDROPPER) {
                        engine?.currentTool = ToolMode.BRUSH
                    }
                    invalidate()
                    return true
                }

                val (cx, cy) = mapToCanvas(event.x, event.y)
                val pressure = if (event.pressure > 0.01f) event.pressure else 0.5f
                engine?.onTouchUp(cx, cy, pressure)
                onStateChanged?.invoke()
                invalidate()
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                isEyedropperActive = false
                engine?.onTouchUp(0f, 0f)
                invalidate()
                return true
            }
        }

        return super.onTouchEvent(event)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // 1. Dark canvas workspace background
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), bgPaint)

        val eng = engine ?: return

        canvas.save()
        canvas.concat(transformMatrix)

        // Drop shadow behind document
        canvas.drawRect(4f, 4f, eng.width.toFloat() + 8f, eng.height.toFloat() + 8f, shadowPaint)

        // 2. Onion Skinning (Previous Frame Tinted Red, Next Frame Tinted Blue)
        eng.getOnionSkinPrevBitmap()?.let { prevBmp ->
            canvas.drawBitmap(prevBmp, 0f, 0f, onionPrevPaint)
        }
        eng.getOnionSkinNextBitmap()?.let { nextBmp ->
            canvas.drawBitmap(nextBmp, 0f, 0f, onionNextPaint)
        }

        // 3. Document Flattened Composite Bitmap
        val bmp = eng.getRenderBitmap()
        if (bmp != null) {
            canvas.drawBitmap(bmp, 0f, 0f, null)
        }

        canvas.restore()

        // 4. Eyedropper Magnifying Loupe
        if (isEyedropperActive) {
            val loupeRadius = 55f
            val offsetY = -100f // Show above finger
            val lx = loupeScreenX
            val ly = loupeScreenY + offsetY

            loupeFillPaint.color = loupePickedColor

            // Outer ring & shadow
            canvas.drawCircle(lx, ly, loupeRadius + 3f, loupeShadowPaint)
            canvas.drawCircle(lx, ly, loupeRadius, loupeRingPaint)
            // Inner color swatch
            canvas.drawCircle(lx, ly, loupeRadius - 4f, loupeFillPaint)
        }

        // 5. Size Preview indicator
        if (previewBrushSize > 0f) {
            val cx = width / 2f
            val cy = height / 2f
            val r = (previewBrushSize * scaleFactor) * 0.5f
            canvas.drawCircle(cx, cy, r, sizePreviewPaint)
        }
    }

    fun resetView() {
        transformMatrix.reset()
        transformMatrix.invert(inverseMatrix)
        scaleFactor = 1.0f
        invalidate()
    }
}
