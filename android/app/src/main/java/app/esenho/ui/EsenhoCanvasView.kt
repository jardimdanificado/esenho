package app.esenho.ui

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.ToolMode
import kotlin.math.*

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

    // Transform Matrix for Pan, Zoom & Rotate
    val transformMatrix = Matrix()
    private val inverseMatrix = Matrix()

    // 2-Finger Transform tracking (Pan, Zoom, Rotate)
    private var isTransforming = false
    private var lastMidX = 0f
    private var lastMidY = 0f
    private var lastSpan = 0f
    private var lastAngle = 0f

    private var initialTwoFingerTime = 0L
    private var initialTwoFingerMidX = 0f
    private var initialTwoFingerMidY = 0f
    private var twoFingerMoved = false
    private var maxPointersInGesture = 0

    // Single-finger Pan tracking
    private var lastSingleTouchX = 0f
    private var lastSingleTouchY = 0f
    private val matrixValues = FloatArray(9)

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

    private val gestureDetector: GestureDetector

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

    private val symmetryGuidePaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f
        color = 0xAA64B5F6.toInt()
        pathEffect = DashPathEffect(floatArrayOf(12f, 8f), 0f)
        isAntiAlias = true
    }

    private val shapePreviewPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        color = 0xFF64B5F6.toInt()
        isAntiAlias = true
    }

    private val selectionMarqueePaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.5f
        color = Color.WHITE
        pathEffect = DashPathEffect(floatArrayOf(8f, 8f), 0f)
        isAntiAlias = true
    }

    private val pixelGridPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 1f
        color = 0x25FFFFFF
    }

    init {
        gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onLongPress(e: MotionEvent) {
                if (!isTransforming) {
                    isEyedropperActive = true
                    loupeScreenX = e.x
                    loupeScreenY = e.y
                    val (cx, cy) = mapToCanvas(e.x, e.y)
                    val c = engine?.pickColorAt(cx, cy) ?: Color.BLACK
                    loupePickedColor = c
                    onColorPicked?.invoke(c)
                    invalidate()
                }
            }
        })
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) {
            if (engine == null) {
                engine = EsenhoEngine(context, 1080, 1920)
            }
            centerCanvas(w, h)
        }
    }

    fun centerCanvas(viewW: Int = width, viewH: Int = height) {
        val eng = engine ?: return
        if (viewW <= 0 || viewH <= 0) return

        transformMatrix.reset()
        // Fit canvas nicely with 24dp margin
        val margin = 48f
        val scaleX = (viewW - margin) / eng.width.toFloat()
        val scaleY = (viewH - margin) / eng.height.toFloat()
        val fitScale = min(scaleX, scaleY).coerceIn(0.1f, 5.0f)

        val offsetX = (viewW - eng.width * fitScale) / 2f
        val offsetY = (viewH - eng.height * fitScale) / 2f

        transformMatrix.postScale(fitScale, fitScale)
        transformMatrix.postTranslate(offsetX, offsetY)
        transformMatrix.invert(inverseMatrix)
        invalidate()
    }

    fun resetView() {
        centerCanvas()
    }

    private fun mapToCanvas(screenX: Float, screenY: Float): Pair<Float, Float> {
        val pts = floatArrayOf(screenX, screenY)
        inverseMatrix.mapPoints(pts)
        return Pair(pts[0], pts[1])
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        gestureDetector.onTouchEvent(event)

        val pointerCount = event.pointerCount

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                maxPointersInGesture = 1
                isTransforming = false
                isEyedropperActive = false
                lastSingleTouchX = event.x
                lastSingleTouchY = event.y

                if (engine?.currentTool == ToolMode.PAN) {
                    return true
                }

                if (engine?.currentTool == ToolMode.EYEDROPPER) {
                    isEyedropperActive = true
                    loupeScreenX = event.x
                    loupeScreenY = event.y
                    val (cx, cy) = mapToCanvas(event.x, event.y)
                    val c = engine?.pickColorAt(cx, cy) ?: Color.BLACK
                    loupePickedColor = c
                    onColorPicked?.invoke(c)
                    invalidate()
                    return true
                }

                val (cx, cy) = mapToCanvas(event.x, event.y)
                val pressure = if (event.pressure > 0.01f) event.pressure else 0.85f
                val tilt = (event.getAxisValue(MotionEvent.AXIS_TILT) * 180f / Math.PI).toInt()

                engine?.onTouchDown(cx, cy, pressure, tilt, 0)
                invalidate()
                return true
            }

            MotionEvent.ACTION_POINTER_DOWN -> {
                maxPointersInGesture = max(maxPointersInGesture, pointerCount)
                isEyedropperActive = false

                if (pointerCount >= 2) {
                    // Enter 2-Finger Transform Mode (Pan, Zoom, Rotate)
                    isTransforming = true

                    // Cancel and erase any single-finger dab painted when finger 0 touched down
                    engine?.cancelActiveStroke()

                    val p0x = event.getX(0)
                    val p0y = event.getY(0)
                    val p1x = event.getX(1)
                    val p1y = event.getY(1)

                    lastMidX = (p0x + p1x) / 2f
                    lastMidY = (p0y + p1y) / 2f
                    lastSpan = hypot(p1x - p0x, p1y - p0y)
                    lastAngle = Math.toDegrees(atan2((p1y - p0y).toDouble(), (p1x - p0x).toDouble())).toFloat()

                    initialTwoFingerTime = System.currentTimeMillis()
                    initialTwoFingerMidX = lastMidX
                    initialTwoFingerMidY = lastMidY
                    twoFingerMoved = false

                    invalidate()
                    return true
                }
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

                if (isTransforming && pointerCount >= 2) {
                    val p0x = event.getX(0)
                    val p0y = event.getY(0)
                    val p1x = event.getX(1)
                    val p1y = event.getY(1)

                    val currMidX = (p0x + p1x) / 2f
                    val currMidY = (p0y + p1y) / 2f
                    val currSpan = hypot(p1x - p0x, p1y - p0y)
                    val currAngle = Math.toDegrees(atan2((p1y - p0y).toDouble(), (p1x - p0x).toDouble())).toFloat()

                    val panDx = currMidX - lastMidX
                    val panDy = currMidY - lastMidY
                    val rawScaleDelta = if (lastSpan > 10f) (currSpan / lastSpan).coerceIn(0.7f, 1.4f) else 1f

                    // Limit zoom range to keep canvas within reasonable bounds (5% to 4000%)
                    transformMatrix.getValues(matrixValues)
                    val currentScale = hypot(matrixValues[Matrix.MSCALE_X], matrixValues[Matrix.MSKEW_Y])
                    val scaleDelta = if ((currentScale * rawScaleDelta < 0.05f && rawScaleDelta < 1f) ||
                                         (currentScale * rawScaleDelta > 40.0f && rawScaleDelta > 1f)) {
                        1.0f
                    } else {
                        rawScaleDelta
                    }

                    var angleDelta = currAngle - lastAngle
                    while (angleDelta > 180f) angleDelta -= 360f
                    while (angleDelta < -180f) angleDelta += 360f

                    if (hypot(currMidX - initialTwoFingerMidX, currMidY - initialTwoFingerMidY) > 8f || abs(currSpan - lastSpan) > 6f || abs(angleDelta) > 1.8f) {
                        twoFingerMoved = true
                    }

                    // 1. Pan (Translate)
                    transformMatrix.postTranslate(panDx, panDy)
                    // 2. Pinch (Scale around midpoint)
                    transformMatrix.postScale(scaleDelta, scaleDelta, currMidX, currMidY)
                    // 3. Rotate around midpoint
                    transformMatrix.postRotate(angleDelta, currMidX, currMidY)

                    transformMatrix.invert(inverseMatrix)

                    lastMidX = currMidX
                    lastMidY = currMidY
                    lastSpan = currSpan
                    lastAngle = currAngle

                    invalidate()
                    return true
                }

                if (!isTransforming && pointerCount == 1) {
                    if (engine?.currentTool == ToolMode.PAN) {
                        val dx = event.x - lastSingleTouchX
                        val dy = event.y - lastSingleTouchY
                        transformMatrix.postTranslate(dx, dy)
                        transformMatrix.invert(inverseMatrix)
                        lastSingleTouchX = event.x
                        lastSingleTouchY = event.y
                        invalidate()
                        return true
                    }

                    val historySize = event.historySize
                    for (h in 0 until historySize) {
                        val (hcx, hcy) = mapToCanvas(event.getHistoricalX(h), event.getHistoricalY(h))
                        val hp = event.getHistoricalPressure(h)
                        engine?.onTouchMove(hcx, hcy, if (hp > 0.01f) hp else 0.85f)
                    }

                    val (cx, cy) = mapToCanvas(event.x, event.y)
                    val pressure = if (event.pressure > 0.01f) event.pressure else 0.85f
                    val tilt = (event.getAxisValue(MotionEvent.AXIS_TILT) * 180f / Math.PI).toInt()

                    engine?.onTouchMove(cx, cy, pressure, tilt, 0)
                    invalidate()
                    return true
                }
            }

            MotionEvent.ACTION_POINTER_UP -> {
                if (isTransforming) {
                    val dt = System.currentTimeMillis() - initialTwoFingerTime
                    if (!twoFingerMoved && dt < 280) {
                        if (maxPointersInGesture == 2) {
                            // Two-finger Tap = UNDO
                            engine?.undo()
                            onStateChanged?.invoke()
                            invalidate()
                        } else if (maxPointersInGesture >= 3) {
                            // Three-finger Tap = REDO
                            engine?.redo()
                            onStateChanged?.invoke()
                            invalidate()
                        }
                    }

                    val remaining = event.pointerCount - 1
                    if (remaining >= 2) {
                        val upIndex = event.actionIndex
                        val p0Idx = if (upIndex == 0) 1 else 0
                        val p1Idx = if (upIndex <= 1) 2 else 1
                        val p0x = event.getX(p0Idx)
                        val p0y = event.getY(p0Idx)
                        val p1x = event.getX(p1Idx)
                        val p1y = event.getY(p1Idx)
                        lastMidX = (p0x + p1x) / 2f
                        lastMidY = (p0y + p1y) / 2f
                        lastSpan = hypot(p1x - p0x, p1y - p0y)
                        lastAngle = Math.toDegrees(atan2((p1y - p0y).toDouble(), (p1x - p0x).toDouble())).toFloat()
                    }
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

                if (isTransforming) {
                    isTransforming = false
                    invalidate()
                    return true
                }

                if (engine?.currentTool == ToolMode.PAN) {
                    invalidate()
                    return true
                }

                val (cx, cy) = mapToCanvas(event.x, event.y)
                val pressure = if (event.pressure > 0.01f) event.pressure else 0.85f
                engine?.onTouchUp(cx, cy, pressure)
                onStateChanged?.invoke()
                invalidate()
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                isEyedropperActive = false
                isTransforming = false
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

        // 4. Pixel Art Grid Overlay
        if (eng.pixelArtGrid) {
            val step = eng.pixelArtGridStep.toFloat()
            var gx = 0f
            while (gx <= eng.width) {
                canvas.drawLine(gx, 0f, gx, eng.height.toFloat(), pixelGridPaint)
                gx += step
            }
            var gy = 0f
            while (gy <= eng.height) {
                canvas.drawLine(0f, gy, eng.width.toFloat(), gy, pixelGridPaint)
                gy += step
            }
        }

        // 5. Symmetry Guides
        if (eng.symmetryMode != app.esenho.nativeengine.SymmetryMode.OFF) {
            val midX = eng.width / 2f
            val midY = eng.height / 2f
            when (eng.symmetryMode) {
                app.esenho.nativeengine.SymmetryMode.MIRROR_X -> {
                    canvas.drawLine(midX, 0f, midX, eng.height.toFloat(), symmetryGuidePaint)
                }
                app.esenho.nativeengine.SymmetryMode.MIRROR_Y -> {
                    canvas.drawLine(0f, midY, eng.width.toFloat(), midY, symmetryGuidePaint)
                }
                app.esenho.nativeengine.SymmetryMode.QUAD -> {
                    canvas.drawLine(midX, 0f, midX, eng.height.toFloat(), symmetryGuidePaint)
                    canvas.drawLine(0f, midY, eng.width.toFloat(), midY, symmetryGuidePaint)
                }
                app.esenho.nativeengine.SymmetryMode.RADIAL -> {
                    canvas.drawLine(midX, 0f, midX, eng.height.toFloat(), symmetryGuidePaint)
                    canvas.drawLine(0f, midY, eng.width.toFloat(), midY, symmetryGuidePaint)
                    canvas.drawLine(0f, 0f, eng.width.toFloat(), eng.height.toFloat(), symmetryGuidePaint)
                    canvas.drawLine(0f, eng.height.toFloat(), eng.width.toFloat(), 0f, symmetryGuidePaint)
                }
                else -> {}
            }
        }

        // 6. Active Selection Boundary
        if (eng.selectionActive && eng.selectionBounds != null) {
            val b = eng.selectionBounds!!
            canvas.drawRect(b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), b.bottom.toFloat(), selectionMarqueePaint)
        }

        // 7. Interactive Shape Drag Previews
        if (eng.isStrokeActive) {
            val sx = eng.strokeStartX
            val sy = eng.strokeStartY
            val cx = eng.strokeCurrentX
            val cy = eng.strokeCurrentY
            when (eng.currentTool) {
                ToolMode.LINE -> {
                    canvas.drawLine(sx, sy, cx, cy, shapePreviewPaint)
                }
                ToolMode.RECTANGLE -> {
                    val rx = min(sx, cx)
                    val ry = min(sy, cy)
                    val rw = max(sx, cx)
                    val rh = max(sy, cy)
                    canvas.drawRect(rx, ry, rw, rh, shapePreviewPaint)
                }
                ToolMode.CIRCLE -> {
                    val mx = (sx + cx) / 2f
                    val my = (sy + cy) / 2f
                    val r = hypot(cx - sx, cy - sy) / 2f
                    canvas.drawCircle(mx, my, r, shapePreviewPaint)
                }
                ToolMode.SELECT_RECT -> {
                    val rx = min(sx, cx)
                    val ry = min(sy, cy)
                    val rw = max(sx, cx)
                    val rh = max(sy, cy)
                    canvas.drawRect(rx, ry, rw, rh, selectionMarqueePaint)
                }
                ToolMode.SELECT_LASSO -> {
                    if (eng.lassoPoints.size >= 2) {
                        val path = Path()
                        path.moveTo(eng.lassoPoints[0].first.toFloat(), eng.lassoPoints[0].second.toFloat())
                        for (i in 1 until eng.lassoPoints.size) {
                            path.lineTo(eng.lassoPoints[i].first.toFloat(), eng.lassoPoints[i].second.toFloat())
                        }
                        canvas.drawPath(path, selectionMarqueePaint)
                    }
                }
                else -> {}
            }
        }

        canvas.restore()

        // 4. Eyedropper Magnifying Loupe
        if (isEyedropperActive) {
            val loupeRadius = 55f
            val offsetY = -100f
            val lx = loupeScreenX
            val ly = loupeScreenY + offsetY

            loupeFillPaint.color = loupePickedColor

            canvas.drawCircle(lx, ly, loupeRadius + 3f, loupeShadowPaint)
            canvas.drawCircle(lx, ly, loupeRadius, loupeRingPaint)
            canvas.drawCircle(lx, ly, loupeRadius - 4f, loupeFillPaint)
        }

        // 5. Size Preview indicator
        if (previewBrushSize > 0f) {
            val cx = width / 2f
            val cy = height / 2f
            val r = (previewBrushSize) * 0.5f
            canvas.drawCircle(cx, cy, r, sizePreviewPaint)
        }
    }
}
