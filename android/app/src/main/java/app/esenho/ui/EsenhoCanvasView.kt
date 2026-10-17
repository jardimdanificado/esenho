package app.esenho.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import app.esenho.nativeengine.EsenhoEngine

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

    // Transform matrix for Pan & Zoom
    private val transformMatrix = Matrix()
    private val inverseMatrix = Matrix()
    private var scaleFactor = 1.0f
    private var focusX = 0f
    private var focusY = 0f

    // Scale detector
    private val scaleDetector: ScaleGestureDetector

    // Gesture tracking
    private var isMultiTouch = false
    private var touchDownTime = 0L
    private var initialPointerCount = 0
    private var lastTouchX = 0f
    private var lastTouchY = 0f

    private val bgPaint = Paint().apply {
        color = 0xFF1E2022.toInt() // Dark workspace background
        style = Paint.Style.FILL
    }

    private val shadowPaint = Paint().apply {
        color = 0x40000000
        style = Paint.Style.FILL
    }

    init {
        scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val scale = detector.scaleFactor
                scaleFactor = (scaleFactor * scale).coerceIn(0.2f, 15.0f)
                transformMatrix.postScale(scale, scale, detector.focusX, detector.focusY)
                transformMatrix.invert(inverseMatrix)
                invalidate()
                return true
            }
        })
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) {
            if (engine == null) {
                engine = EsenhoEngine(w, h)
            } else {
                engine?.resize(w, h)
            }
            // Center canvas
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

                engine?.onTouchDown(cx, cy, pressure, tilt, 0)
                invalidate()
                return true
            }

            MotionEvent.ACTION_POINTER_DOWN -> {
                isMultiTouch = true
                initialPointerCount = Math.max(initialPointerCount, pointerCount)
                // Cancel ongoing stroke when second finger lands
                engine?.onTouchUp(0f, 0f)
                invalidate()
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                if (isMultiTouch || pointerCount > 1) {
                    // Two-finger Pan
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
                    // Process historical points for ultra-smooth stylus stroke interpolation
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
                // If it was a quick 2-finger tap (< 250ms), trigger Undo!
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
                val (cx, cy) = mapToCanvas(event.x, event.y)
                val pressure = if (event.pressure > 0.01f) event.pressure else 0.5f
                engine?.onTouchUp(cx, cy, pressure)
                onStateChanged?.invoke()
                invalidate()
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                engine?.onTouchUp(0f, 0f)
                invalidate()
                return true
            }
        }

        return super.onTouchEvent(event)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // Draw dark workspace background
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), bgPaint)

        val eng = engine ?: return
        val bmp = eng.getRenderBitmap() ?: return

        canvas.save()
        canvas.concat(transformMatrix)

        // Subtle drop shadow around document
        canvas.drawRect(4f, 4f, eng.width.toFloat() + 8f, eng.height.toFloat() + 8f, shadowPaint)

        // Render document bitmap
        canvas.drawBitmap(bmp, 0f, 0f, null)

        canvas.restore()
    }

    fun resetView() {
        transformMatrix.reset()
        transformMatrix.invert(inverseMatrix)
        scaleFactor = 1.0f
        invalidate()
    }
}
