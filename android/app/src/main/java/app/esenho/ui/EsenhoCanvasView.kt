package app.esenho.ui

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.CanvasGuide
import app.esenho.nativeengine.DrawingGuideType
import app.esenho.nativeengine.GuidePoint
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

    private var historyGestureStartTime = 0L
    private val matrixBeforeTwoFinger = Matrix()
    private var twoFingerMoved = false
    private var maxPointersInGesture = 0
    private var historyGestureHandled = false
    private val initialPointerPositions = mutableMapOf<Int, Pair<Float, Float>>()
    private data class PendingCanvasDown(val x: Float, val y: Float, val pressure: Float, val tilt: Int)
    private var pendingCanvasDown: PendingCanvasDown? = null

    // Floating Transform Tool gesture state (M4 / R1)
    private var activeTransformHandle: app.esenho.nativeengine.TransformState.Handle = app.esenho.nativeengine.TransformState.Handle.NONE
    private var transformDragStartX = 0f
    private var transformDragStartY = 0f
    private var initialHandleAngle = 0f
    private var transformDragOrigin = FloatArray(8)
    private val initialCenter = PointF()

    // Single-finger Pan tracking
    private var lastSingleTouchX = 0f
    private var lastSingleTouchY = 0f
    private val matrixValues = FloatArray(9)
    private var stylusEraserPreviousTool: ToolMode? = null
    private var creatingGuideType: DrawingGuideType? = null
    private var guideStart = GuidePoint(0f, 0f)
    private val guideDraft = mutableListOf<GuidePoint>()

    private fun restoreStylusEraserTool() {
        val previous = stylusEraserPreviousTool ?: return
        engine?.currentTool = previous
        stylusEraserPreviousTool = null
    }

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
        color = 0xFF1D2021.toInt()
        style = Paint.Style.FILL
    }

    private val shadowPaint = Paint().apply {
        color = 0x50000000
        style = Paint.Style.FILL
    }

    private val paperPaint = Paint().apply {
        color = Color.WHITE
        style = Paint.Style.FILL
    }

    private val onionPrevPaint = Paint().apply {
        alpha = 90
        colorFilter = PorterDuffColorFilter(0xFFFF3C3C.toInt(), PorterDuff.Mode.SRC_IN)
    }

    private val onionNextPaint = Paint().apply {
        alpha = 90
        colorFilter = PorterDuffColorFilter(0xFF3C8CFF.toInt(), PorterDuff.Mode.SRC_IN)
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

    private val selectionAntsBlackPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.5f
        color = Color.BLACK
        isAntiAlias = true
    }

    private val selectionAntsWhitePaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.5f
        color = Color.WHITE
        isAntiAlias = true
    }

    private var antsPhase = 0f

    private val selectionFillPaint = Paint().apply {
        style = Paint.Style.FILL
        color = 0x332196F3
        isAntiAlias = true
    }

    private val lassoFillPreviewPaint = Paint().apply {
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val lassoStrokePreviewPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        isAntiAlias = true
    }

    private val selectionBrushPreviewPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = 0x66FFD166
        isAntiAlias = true
    }

    private val pixelGridPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 0f // device-pixel hairline, independent of canvas zoom
        // Match the subtle warm grid used by the web canvas.
        color = 0x2EEBDBB2
        isAntiAlias = false
    }

    private val guidePaint = Paint().apply {
        color = 0xDD43D9C2.toInt()
        strokeWidth = 1.75f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        isAntiAlias = true
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) {
            if (engine == null) {
                engine = EsenhoEngine(context, 1080, 1920)
            }
            if (oldw > 0 && oldh > 0) {
                // Opening an inspector preserves zoom and the drawing point at the center.
                transformMatrix.postTranslate((w - oldw) / 2f, (h - oldh) / 2f)
                transformMatrix.invert(inverseMatrix)
                invalidate()
            } else {
                centerCanvas(w, h)
            }
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

    private fun ellipsePath(bounds: Pair<GuidePoint, GuidePoint>, rxFactor: Float = 1f, ryFactor: Float = 1f): List<GuidePoint> {
        val (a, b) = bounds
        val cx = (a.x + b.x) / 2f
        val cy = (a.y + b.y) / 2f
        val rx = abs(b.x - a.x) * 0.5f * rxFactor
        val ry = abs(b.y - a.y) * 0.5f * ryFactor
        return (0..96).map { i ->
            val angle = i * (2.0 * Math.PI / 96.0)
            GuidePoint(cx + cos(angle).toFloat() * rx, cy + sin(angle).toFloat() * ry)
        }
    }

    private fun createGuide(type: DrawingGuideType, a: GuidePoint, b: GuidePoint, curve: List<GuidePoint> = emptyList()): CanvasGuide {
        val paths = when (type) {
            DrawingGuideType.LINE -> listOf(listOf(a, b))
            DrawingGuideType.CURVE -> listOf((curve + b).distinct())
            DrawingGuideType.ELLIPSE -> listOf(ellipsePath(a to b))
            DrawingGuideType.SPHERE -> listOf(ellipsePath(a to b), ellipsePath(a to b, 0.34f, 1f), ellipsePath(a to b, 1f, 0.34f))
        }
        return CanvasGuide(type, paths.filter { it.size >= 2 })
    }

    private fun beginGuideGesture(x: Float, y: Float): Boolean {
        val eng = engine ?: return false
        val type = eng.guideCreationType ?: return false
        val point = mapToCanvas(x, y)
        guideStart = GuidePoint(point.first.coerceIn(0f, eng.width.toFloat()), point.second.coerceIn(0f, eng.height.toFloat()))
        guideDraft.clear()
        guideDraft += guideStart
        creatingGuideType = type
        invalidate()
        return true
    }

    private fun moveGuideGesture(x: Float, y: Float) {
        val eng = engine ?: return
        val type = creatingGuideType ?: return
        val p = mapToCanvas(x, y)
        val point = GuidePoint(p.first.coerceIn(0f, eng.width.toFloat()), p.second.coerceIn(0f, eng.height.toFloat()))
        if (type == DrawingGuideType.CURVE) {
            val last = guideDraft.lastOrNull()
            if (last == null || hypot(point.x - last.x, point.y - last.y) >= 2f) guideDraft += point
        } else if (guideDraft.size == 1) guideDraft += point else guideDraft[1] = point
        invalidate()
    }

    private fun finishGuideGesture(x: Float, y: Float, cancelled: Boolean = false) {
        val eng = engine ?: return
        val type = creatingGuideType ?: return
        if (!cancelled) {
            moveGuideGesture(x, y)
            val end = guideDraft.lastOrNull() ?: guideStart
            val guide = createGuide(type, guideStart, end, guideDraft.toList())
            if (guide.paths.isNotEmpty() && guide.paths.any { it.size >= 2 }) {
                eng.canvasGuides += guide
                eng.activeCanvasGuideIndex = eng.canvasGuides.lastIndex
                if (!eng.snapToAllVisibleGuides) eng.snapGuideIndices += eng.activeCanvasGuideIndex
            }
        }
        creatingGuideType = null
        guideDraft.clear()
        eng.guideCreationType = null
        onStateChanged?.invoke()
        invalidate()
    }

    private fun constrainToGuide(x: Float, y: Float): Pair<Float, Float> {
        val eng = engine ?: return x to y
        val tool = eng.currentTool
        if (!eng.guideSnapEnabled || eng.guideCreationType != null ||
            (tool != ToolMode.BRUSH && tool != ToolMode.ERASER && tool != ToolMode.SMUDGE && tool != ToolMode.BLEND)) return x to y
        val guides = if (eng.snapToAllVisibleGuides) eng.canvasGuides.toList()
            else eng.snapGuideIndices.mapNotNull { eng.canvasGuides.getOrNull(it) }
        if (guides.isEmpty()) return x to y
        var bestDistance = Float.POSITIVE_INFINITY
        var bestX = x
        var bestY = y
        guides.forEach { guide ->
            guide.paths.forEach { path ->
                for (i in 0 until path.lastIndex) {
                    val a = path[i]
                    val b = path[i + 1]
                    val dx = b.x - a.x
                    val dy = b.y - a.y
                    val length = dx * dx + dy * dy
                    val t = if (length <= 0f) 0f else (((x - a.x) * dx + (y - a.y) * dy) / length).coerceIn(0f, 1f)
                    val px = a.x + t * dx
                    val py = a.y + t * dy
                    val distance = (x - px) * (x - px) + (y - py) * (y - py)
                    if (distance < bestDistance) { bestDistance = distance; bestX = px; bestY = py }
                }
            }
        }
        return bestX to bestY
    }

    private fun drawGuide(canvas: Canvas, guide: CanvasGuide) {
        guide.paths.forEach { points ->
            if (points.size < 2) return@forEach
            val path = Path().apply {
                moveTo(points.first().x, points.first().y)
                points.drop(1).forEach { lineTo(it.x, it.y) }
            }
            canvas.drawPath(path, guidePaint)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val pointerCount = event.pointerCount

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                maxPointersInGesture = 1
                historyGestureHandled = false
                initialPointerPositions.clear()
                initialPointerPositions[event.getPointerId(0)] = event.x to event.y
                historyGestureStartTime = event.eventTime
                twoFingerMoved = false
                isTransforming = false
                isEyedropperActive = false
                lastSingleTouchX = event.x
                lastSingleTouchY = event.y

                if (beginGuideGesture(event.x, event.y)) return true

                val tState = engine?.transformState
                if (tState != null) {
                    transformMatrix.getValues(matrixValues)
                    val currentScale = hypot(matrixValues[Matrix.MSCALE_X], matrixValues[Matrix.MSKEW_Y])
                    val (cx, cy) = mapToCanvas(event.x, event.y)
                    val handleRadius = 26f / currentScale.coerceAtLeast(0.1f)
                    val hit = tState.hitTest(cx, cy, handleRadius)
                    if (hit != app.esenho.nativeengine.TransformState.Handle.NONE) {
                        activeTransformHandle = hit
                        transformDragStartX = cx
                        transformDragStartY = cy
                        val c = tState.getCenter()
                        transformDragOrigin = tState.dstPts.copyOf()
                        initialCenter.set(c.x, c.y)
                        initialHandleAngle = Math.toDegrees(atan2((cy - c.y).toDouble(), (cx - c.x).toDouble())).toFloat()
                        invalidate()
                        return true
                    }
                }

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

                if (engine?.transformState != null) {
                    return true
                }

                // A stylus eraser tip should erase without changing the
                // selected toolbar tool, matching the web pointer behavior.
                if (event.getToolType(0) == MotionEvent.TOOL_TYPE_ERASER && engine?.currentTool != ToolMode.ERASER) {
                    stylusEraserPreviousTool = engine?.currentTool
                    engine?.currentTool = ToolMode.ERASER
                }

                val raw = mapToCanvas(event.x, event.y)
                val (cx, cy) = constrainToGuide(raw.first, raw.second)
                val pressure = if (event.pressure > 0.01f) event.pressure else 0.85f
                val tilt = (event.getAxisValue(MotionEvent.AXIS_TILT) * 180f / Math.PI).toInt()
                if (event.getToolType(0) == MotionEvent.TOOL_TYPE_FINGER) {
                    // Delay finger dabs until a move confirms drawing. This
                    // keeps two/three-finger history gestures from creating a
                    // stray dab and clearing the native redo stack.
                    pendingCanvasDown = PendingCanvasDown(cx, cy, pressure, tilt)
                } else {
                    engine?.onTouchDown(cx, cy, pressure, tilt, 0)
                }
                invalidate()
                return true
            }

            MotionEvent.ACTION_POINTER_DOWN -> {
                maxPointersInGesture = max(maxPointersInGesture, pointerCount)
                initialPointerPositions[event.getPointerId(event.actionIndex)] =
                    event.getX(event.actionIndex) to event.getY(event.actionIndex)
                isEyedropperActive = false

                if (pointerCount >= 2) {
                    // Enter 2-Finger Transform Mode (Pan, Zoom, Rotate)
                    isTransforming = true
                    pendingCanvasDown = null

                    // Cancel and erase any single-finger dab painted when finger 0 touched down
                    engine?.cancelActiveStroke()
                    restoreStylusEraserTool()

                    val p0x = event.getX(0)
                    val p0y = event.getY(0)
                    val p1x = event.getX(1)
                    val p1y = event.getY(1)

                    lastMidX = (p0x + p1x) / 2f
                    lastMidY = (p0y + p1y) / 2f
                    lastSpan = hypot(p1x - p0x, p1y - p0y)
                    lastAngle = Math.toDegrees(atan2((p1y - p0y).toDouble(), (p1x - p0x).toDouble())).toFloat()

                    if (pointerCount == 2) {
                        matrixBeforeTwoFinger.set(transformMatrix)
                    }

                    invalidate()
                    return true
                }
            }

            MotionEvent.ACTION_MOVE -> {
                if (creatingGuideType != null && pointerCount == 1) {
                    moveGuideGesture(event.x, event.y)
                    return true
                }
                val tState = engine?.transformState
                if (tState != null && activeTransformHandle != app.esenho.nativeengine.TransformState.Handle.NONE && pointerCount == 1) {
                    val (cx, cy) = mapToCanvas(event.x, event.y)
                    when (activeTransformHandle) {
                        app.esenho.nativeengine.TransformState.Handle.BODY -> {
                            val dx = cx - transformDragStartX
                            val dy = cy - transformDragStartY
                            tState.translate(dx, dy)
                            transformDragStartX = cx
                            transformDragStartY = cy
                            invalidate()
                            return true
                        }
                        app.esenho.nativeengine.TransformState.Handle.ROTATION -> {
                            val currentAngle = Math.toDegrees(atan2((cy - initialCenter.y).toDouble(), (cx - initialCenter.x).toDouble())).toFloat()
                            var dAngle = currentAngle - initialHandleAngle
                            while (dAngle > 180f) dAngle -= 360f
                            while (dAngle < -180f) dAngle += 360f
                            if ((event.metaState and android.view.KeyEvent.META_SHIFT_ON) != 0) {
                                dAngle = (dAngle / 15f).roundToInt() * 15f
                            }
                            tState.rotateFromOrigin(dAngle, transformDragOrigin, initialCenter.x, initialCenter.y)
                            invalidate()
                            return true
                        }
                        else -> {
                            tState.moveHandle(
                                activeTransformHandle,
                                cx - transformDragStartX,
                                cy - transformDragStartY,
                                transformDragOrigin,
                                engine?.transformLockAspect == true ||
                                    (event.metaState and android.view.KeyEvent.META_SHIFT_ON) != 0,
                                (event.metaState and (android.view.KeyEvent.META_CTRL_ON or android.view.KeyEvent.META_META_ON)) != 0
                            )
                            invalidate()
                            return true
                        }
                    }
                }

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

                    // Accurate displacement check: if either finger traveled or span changed, it's a zoom/pan gesture, NOT a tap
                    val pointerMoved = (0 until pointerCount).any { index ->
                        val initial = initialPointerPositions[event.getPointerId(index)] ?: return@any true
                        hypot(event.getX(index) - initial.first, event.getY(index) - initial.second) > 12f
                    }
                    if (pointerMoved) twoFingerMoved = true

                    // 1. Pinch Scale around stable previous midpoint
                    transformMatrix.postScale(scaleDelta, scaleDelta, lastMidX, lastMidY)
                    // 2. Rotate around stable previous midpoint
                    if (abs(angleDelta) > 0.05f) {
                        transformMatrix.postRotate(angleDelta, lastMidX, lastMidY)
                    }
                    // 3. Pan Translate to current midpoint
                    transformMatrix.postTranslate(panDx, panDy)

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

                    if (engine?.transformState != null) {
                        return true
                    }

                    pendingCanvasDown?.let { pending ->
                        pendingCanvasDown = null
                        engine?.onTouchDown(pending.x, pending.y, pending.pressure, pending.tilt, 0)
                    }

                    val historySize = event.historySize
                    for (h in 0 until historySize) {
                        val raw = mapToCanvas(event.getHistoricalX(h), event.getHistoricalY(h))
                        val (hcx, hcy) = constrainToGuide(raw.first, raw.second)
                        val hp = event.getHistoricalPressure(h)
                        engine?.onTouchMove(hcx, hcy, if (hp > 0.01f) hp else 0.85f)
                    }

                    val raw = mapToCanvas(event.x, event.y)
                    val (cx, cy) = constrainToGuide(raw.first, raw.second)
                    val pressure = if (event.pressure > 0.01f) event.pressure else 0.85f
                    val tilt = (event.getAxisValue(MotionEvent.AXIS_TILT) * 180f / Math.PI).toInt()

                    engine?.onTouchMove(cx, cy, pressure, tilt, 0)
                    invalidate()
                    return true
                }
            }

            MotionEvent.ACTION_POINTER_UP -> {
                if (isTransforming) {
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
                if (creatingGuideType != null) {
                    finishGuideGesture(event.x, event.y)
                    return true
                }
                if (isTransforming) {
                    val duration = event.eventTime - historyGestureStartTime
                    if (!historyGestureHandled && !twoFingerMoved && duration <= 650L) {
                        historyGestureHandled = true
                        transformMatrix.set(matrixBeforeTwoFinger)
                        transformMatrix.invert(inverseMatrix)
                        if (engine?.transformState != null) {
                            // Cancelling a pending transform rolls back its own
                            // reserved snapshot; don't consume the preceding
                            // user action as part of the same tap gesture.
                            engine?.cancelTransform()
                        } else if (maxPointersInGesture >= 3) {
                            engine?.redo()
                        } else if (maxPointersInGesture == 2) {
                            engine?.undo()
                        }
                        onStateChanged?.invoke()
                    }
                    isTransforming = false
                    invalidate()
                    return true
                }

                if (activeTransformHandle != app.esenho.nativeengine.TransformState.Handle.NONE) {
                    activeTransformHandle = app.esenho.nativeengine.TransformState.Handle.NONE
                    invalidate()
                    return true
                }

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

                if (engine?.transformState != null) {
                    return true
                }

                val raw = mapToCanvas(event.x, event.y)
                val (cx, cy) = constrainToGuide(raw.first, raw.second)
                val pressure = if (event.pressure > 0.01f) event.pressure else 0.85f
                pendingCanvasDown?.let { pending ->
                    pendingCanvasDown = null
                    engine?.onTouchDown(pending.x, pending.y, pending.pressure, pending.tilt, 0)
                }
                engine?.onTouchUp(cx, cy, pressure)
                restoreStylusEraserTool()
                onStateChanged?.invoke()
                invalidate()
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                if (creatingGuideType != null) finishGuideGesture(lastSingleTouchX, lastSingleTouchY, cancelled = true)
                activeTransformHandle = app.esenho.nativeengine.TransformState.Handle.NONE
                isEyedropperActive = false
                isTransforming = false
                pendingCanvasDown = null
                engine?.cancelActiveStroke()
                restoreStylusEraserTool()
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
        if (eng.isStrokeActive && eng.needsCurveTimeTicks) {
            eng.tickCurveStroke()
            postInvalidateOnAnimation()
        }

        canvas.save()
        canvas.concat(transformMatrix)

        // Drop shadow behind document
        canvas.drawRect(4f, 4f, eng.width.toFloat() + 8f, eng.height.toFloat() + 8f, shadowPaint)

        // Solid document paper background (white)
        canvas.drawRect(0f, 0f, eng.width.toFloat(), eng.height.toFloat(), paperPaint)

        // 2. Onion skin shows configurable neighboring cels in the active layer.
        eng.getOnionSkinPreviews().forEach { preview ->
            val paint = if (preview.isPrevious) onionPrevPaint else onionNextPaint
            paint.alpha = preview.alpha
            paint.colorFilter = PorterDuffColorFilter(preview.tint, PorterDuff.Mode.SRC_IN)
            canvas.drawBitmap(preview.bitmap, 0f, 0f, paint)
        }
        onionPrevPaint.alpha = 90
        onionNextPaint.alpha = 90
        onionPrevPaint.colorFilter = PorterDuffColorFilter(0xFFFF3C3C.toInt(), PorterDuff.Mode.SRC_IN)
        onionNextPaint.colorFilter = PorterDuffColorFilter(0xFF3C8CFF.toInt(), PorterDuff.Mode.SRC_IN)

        // 3. Document Flattened Composite Bitmap
        val bmp = eng.getRenderBitmap()
        if (bmp != null) {
            canvas.drawBitmap(bmp, 0f, 0f, null)
        }

        // 4. Pixel Art Grid Overlay
        transformMatrix.getValues(matrixValues)
        // MSCALE_X alone drops toward zero as the canvas rotates, which made
        // the grid disappear even though individual pixels were still large.
        val scaleX = hypot(matrixValues[Matrix.MSCALE_X], matrixValues[Matrix.MSKEW_Y])
        val scaleY = hypot(matrixValues[Matrix.MSKEW_X], matrixValues[Matrix.MSCALE_Y])
        val gridScale = min(scaleX, scaleY)
        if (eng.pixelArtGrid && gridScale >= 4f) {
            val step = eng.pixelArtGridStep.coerceAtLeast(1).toFloat()
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

        eng.canvasGuides.forEach { drawGuide(canvas, it) }
        creatingGuideType?.let { type ->
            if (guideDraft.size >= 2) drawGuide(canvas, createGuide(type, guideStart, guideDraft.last(), guideDraft.toList()))
        }

        // 6. Active Selection Boundary (Dynamic High-Contrast Marching Ants)
        if (eng.selectionActive) {
            selectionAntsBlackPaint.pathEffect = DashPathEffect(floatArrayOf(8f, 8f), antsPhase)
            selectionAntsWhitePaint.pathEffect = DashPathEffect(floatArrayOf(8f, 8f), antsPhase + 8f)

            val path = eng.selectionPath
            if (path != null) {
                canvas.drawPath(path, selectionFillPaint)
                canvas.drawPath(path, selectionAntsBlackPaint)
                canvas.drawPath(path, selectionAntsWhitePaint)
            } else if (eng.selectionBounds != null) {
                val b = eng.selectionBounds!!
                val left = b.left.toFloat()
                val top = b.top.toFloat()
                val right = b.right.toFloat()
                val bottom = b.bottom.toFloat()
                canvas.drawRect(left, top, right, bottom, selectionFillPaint)
                canvas.drawRect(left, top, right, bottom, selectionAntsBlackPaint)
                canvas.drawRect(left, top, right, bottom, selectionAntsWhitePaint)
            }

            antsPhase = (antsPhase + 1f) % 16f
            postInvalidateOnAnimation()
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
                ToolMode.RECTANGLE, ToolMode.ERASE_RECTANGLE -> {
                    val rx = min(sx, cx)
                    val ry = min(sy, cy)
                    val rw = max(sx, cx)
                    val rh = max(sy, cy)
                    canvas.drawRect(rx, ry, rw, rh, shapePreviewPaint)
                }
                ToolMode.ELLIPSE -> {
                    canvas.drawOval(RectF(min(sx, cx), min(sy, cy), max(sx, cx), max(sy, cy)), shapePreviewPaint)
                }
                ToolMode.ERASE_ELLIPSE -> {
                    val rx = min(sx, cx)
                    val ry = min(sy, cy)
                    val rw = max(sx, cx)
                    val rh = max(sy, cy)
                    canvas.drawOval(RectF(rx, ry, rw, rh), shapePreviewPaint)
                }
                ToolMode.SELECT_RECT -> {
                    val rx = min(sx, cx)
                    val ry = min(sy, cy)
                    val rw = max(sx, cx)
                    val rh = max(sy, cy)
                    selectionAntsBlackPaint.pathEffect = DashPathEffect(floatArrayOf(8f, 8f), antsPhase)
                    selectionAntsWhitePaint.pathEffect = DashPathEffect(floatArrayOf(8f, 8f), antsPhase + 8f)
                    canvas.drawRect(rx, ry, rw, rh, selectionFillPaint)
                    canvas.drawRect(rx, ry, rw, rh, selectionAntsBlackPaint)
                    canvas.drawRect(rx, ry, rw, rh, selectionAntsWhitePaint)
                }
                ToolMode.SELECT_ELLIPSE -> {
                    val rx = min(sx, cx)
                    val ry = min(sy, cy)
                    val rw = max(sx, cx)
                    val rh = max(sy, cy)
                    val oval = RectF(rx, ry, rw, rh)
                    selectionAntsBlackPaint.pathEffect = DashPathEffect(floatArrayOf(8f, 8f), antsPhase)
                    selectionAntsWhitePaint.pathEffect = DashPathEffect(floatArrayOf(8f, 8f), antsPhase + 8f)
                    canvas.drawOval(oval, selectionFillPaint)
                    canvas.drawOval(oval, selectionAntsBlackPaint)
                    canvas.drawOval(oval, selectionAntsWhitePaint)
                }
                ToolMode.SELECT_LASSO -> {
                    if (eng.lassoPoints.size >= 2) {
                        val path = Path()
                        path.moveTo(eng.lassoPoints[0].first.toFloat(), eng.lassoPoints[0].second.toFloat())
                        for (i in 1 until eng.lassoPoints.size) {
                            path.lineTo(eng.lassoPoints[i].first.toFloat(), eng.lassoPoints[i].second.toFloat())
                        }
                        val closedPath = Path(path)
                        closedPath.close()
                        selectionAntsBlackPaint.pathEffect = DashPathEffect(floatArrayOf(8f, 8f), antsPhase)
                        selectionAntsWhitePaint.pathEffect = DashPathEffect(floatArrayOf(8f, 8f), antsPhase + 8f)
                        canvas.drawPath(closedPath, selectionFillPaint)
                        canvas.drawPath(path, selectionAntsBlackPaint)
                        canvas.drawPath(path, selectionAntsWhitePaint)
                    }
                }
                ToolMode.SELECT_BRUSH_MASK -> {
                    if (eng.lassoPoints.isNotEmpty()) {
                        val path = Path().apply {
                            moveTo(eng.lassoPoints[0].first.toFloat(), eng.lassoPoints[0].second.toFloat())
                            for (i in 1 until eng.lassoPoints.size) {
                                lineTo(eng.lassoPoints[i].first.toFloat(), eng.lassoPoints[i].second.toFloat())
                            }
                        }
                        selectionBrushPreviewPaint.strokeWidth = eng.brushSize.coerceAtLeast(1f)
                        canvas.drawPath(path, selectionBrushPreviewPaint)
                        if (eng.lassoPoints.size == 1) {
                            val p = eng.lassoPoints.first()
                            canvas.drawCircle(p.first.toFloat(), p.second.toFloat(), eng.brushSize.coerceAtLeast(1f) / 2f, selectionBrushPreviewPaint)
                        }
                    }
                }
                ToolMode.LASSO_FILL -> {
                    if (eng.lassoPoints.size >= 2) {
                        val path = Path()
                        path.moveTo(eng.lassoPoints[0].first.toFloat(), eng.lassoPoints[0].second.toFloat())
                        for (i in 1 until eng.lassoPoints.size) {
                            path.lineTo(eng.lassoPoints[i].first.toFloat(), eng.lassoPoints[i].second.toFloat())
                        }
                        val closedPath = Path(path)
                        closedPath.close()

                        val c = eng.currentColor
                        lassoFillPreviewPaint.color = Color.argb(100, Color.red(c), Color.green(c), Color.blue(c))
                        canvas.drawPath(closedPath, lassoFillPreviewPaint)

                        lassoStrokePreviewPaint.color = c
                        canvas.drawPath(path, lassoStrokePreviewPaint)
                    }
                }
                else -> {}
            }
        }

        // 8. Floating Transform Tool Overlay (M4 / R1)
        eng.transformState?.let { tState ->
            transformMatrix.getValues(matrixValues)
            val currentScale = hypot(matrixValues[Matrix.MSCALE_X], matrixValues[Matrix.MSKEW_Y])
            tState.draw(canvas, currentScale)
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
