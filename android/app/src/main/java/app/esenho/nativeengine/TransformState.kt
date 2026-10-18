package app.esenho.nativeengine

import android.graphics.*
import kotlin.math.*

class TransformState(
    val sourceBitmap: Bitmap,
    val initialBounds: RectF,
    val isSelectionOnly: Boolean,
    val originalLayerBackup: Bitmap? = null
) {
    enum class Mode(val title: String) {
        SCALE("Escala"),
        DISTORT("Distorção livre"),
        PERSPECTIVE("Perspectiva"),
        SKEW("Inclinação")
    }

    enum class Interpolation(val title: String) {
        NEAREST("Nítido"),
        BILINEAR("Suave")
    }

    var mode: Mode = Mode.SCALE
    var interpolation: Interpolation = Interpolation.NEAREST

    // Current transformation matrix in canvas coordinates
    val matrix = Matrix()

    // Original corner points [TLx, TLy, TRx, TRy, BRx, BRy, BLx, BLy]
    private val srcPts = floatArrayOf(
        initialBounds.left, initialBounds.top,
        initialBounds.right, initialBounds.top,
        initialBounds.right, initialBounds.bottom,
        initialBounds.left, initialBounds.bottom
    )

    // Transformed corner points [TLx, TLy, TRx, TRy, BRx, BRy, BLx, BLy]
    val dstPts = FloatArray(8)

    // Axis-aligned bounding rect of the transformed shape
    val currentBounds = RectF()

    // Paints for rendering the bounding quad and handles
    private val quadPaint = Paint().apply {
        color = Color.parseColor("#2196F3") // Accent Blue
        style = Paint.Style.STROKE
        strokeWidth = 2f
        isAntiAlias = true
    }

    private val quadShadowPaint = Paint().apply {
        color = Color.parseColor("#80000000") // Semi-transparent black shadow
        style = Paint.Style.STROKE
        strokeWidth = 4f
        isAntiAlias = true
    }

    private val handleFillPaint = Paint().apply {
        color = Color.WHITE
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val handleStrokePaint = Paint().apply {
        color = Color.parseColor("#1976D2")
        style = Paint.Style.STROKE
        strokeWidth = 2f
        isAntiAlias = true
    }

    private val rotKnobFillPaint = Paint().apply {
        color = Color.parseColor("#FF9800") // Orange for rotation
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)

    init {
        updatePoints()
    }

    fun updatePoints() {
        matrix.mapPoints(dstPts, srcPts)
        var minX = Float.MAX_VALUE
        var minY = Float.MAX_VALUE
        var maxX = -Float.MAX_VALUE
        var maxY = -Float.MAX_VALUE
        for (i in 0 until 4) {
            val x = dstPts[i * 2]
            val y = dstPts[i * 2 + 1]
            if (x < minX) minX = x
            if (y < minY) minY = y
            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
        }
        currentBounds.set(minX, minY, maxX, maxY)
    }

    fun translate(dx: Float, dy: Float) {
        matrix.postTranslate(dx, dy)
        updatePoints()
    }

    fun scale(sx: Float, sy: Float, px: Float, py: Float) {
        matrix.postScale(sx, sy, px, py)
        updatePoints()
    }

    fun rotate(degrees: Float, px: Float, py: Float) {
        matrix.postRotate(degrees, px, py)
        updatePoints()
    }

    fun rotateFromOrigin(degrees: Float, origin: FloatArray, px: Float, py: Float) {
        if (origin.size < 8) return
        val radians = Math.toRadians(degrees.toDouble())
        val cosA = cos(radians).toFloat()
        val sinA = sin(radians).toFloat()
        val rotated = origin.copyOf()
        for (index in 0..3) {
            val dx = origin[index * 2] - px
            val dy = origin[index * 2 + 1] - py
            rotated[index * 2] = px + dx * cosA - dy * sinA
            rotated[index * 2 + 1] = py + dx * sinA + dy * cosA
        }
        matrix.reset()
        matrix.setPolyToPoly(srcPts, 0, rotated, 0, 4)
        updatePoints()
    }

    fun flipHorizontal() {
        val c = getCenter()
        matrix.postScale(-1f, 1f, c.x, c.y)
        updatePoints()
    }

    fun flipVertical() {
        val c = getCenter()
        matrix.postScale(1f, -1f, c.x, c.y)
        updatePoints()
    }

    fun rotate90() {
        val c = getCenter()
        matrix.postRotate(90f, c.x, c.y)
        updatePoints()
    }

    fun reset() {
        matrix.reset()
        updatePoints()
    }

    fun centerOnCanvas(canvasWidth: Int, canvasHeight: Int) {
        val c = getCenter()
        matrix.postTranslate(canvasWidth / 2f - c.x, canvasHeight / 2f - c.y)
        updatePoints()
    }

    fun fitToCanvas(canvasWidth: Int, canvasHeight: Int, margin: Float = 0.05f) {
        if (canvasWidth <= 0 || canvasHeight <= 0) return
        val bounds = RectF(currentBounds)
        if (bounds.width() <= 0f || bounds.height() <= 0f) return
        val maxWidth = canvasWidth * (1f - margin.coerceIn(0f, 0.4f) * 2f)
        val maxHeight = canvasHeight * (1f - margin.coerceIn(0f, 0.4f) * 2f)
        val scale = min(maxWidth / bounds.width(), maxHeight / bounds.height())
        val c = getCenter()
        matrix.postScale(scale, scale, c.x, c.y)
        val scaledCenter = getCenter()
        matrix.postTranslate(canvasWidth / 2f - scaledCenter.x, canvasHeight / 2f - scaledCenter.y)
        updatePoints()
    }

    fun moveHandle(handle: Handle, dx: Float, dy: Float, origin: FloatArray = dstPts.copyOf(), lockAspect: Boolean = false) {
        if (origin.size < 8) return
        val next = origin.copyOf()
        fun movePoint(index: Int, x: Float, y: Float) {
            next[index * 2] = x
            next[index * 2 + 1] = y
        }
        fun point(index: Int) = PointF(origin[index * 2], origin[index * 2 + 1])

        val corner = when (handle) {
            Handle.TOP_LEFT -> 0
            Handle.TOP_RIGHT -> 1
            Handle.BOTTOM_RIGHT -> 2
            Handle.BOTTOM_LEFT -> 3
            else -> -1
        }
        if (corner >= 0) {
            // Perspective and Free Distort both need independent corner
            // control; their edge handles remain distinct below.
            val free = mode == Mode.DISTORT || mode == Mode.PERSPECTIVE
            if (free) {
                movePoint(corner, origin[corner * 2] + dx, origin[corner * 2 + 1] + dy)
            } else {
                val opposite = point((corner + 2) % 4)
                val topLeft = point(0)
                val topRight = point(1)
                val bottomLeft = point(3)
                val uX = topRight.x - topLeft.x
                val uY = topRight.y - topLeft.y
                val vX = bottomLeft.x - topLeft.x
                val vY = bottomLeft.y - topLeft.y
                val uLen = hypot(uX, uY).coerceAtLeast(1e-4f)
                val vLen = hypot(vX, vY).coerceAtLeast(1e-4f)
                val ux = uX / uLen; val uy = uY / uLen
                val vx = vX / vLen; val vy = vY / vLen
                val oldX = origin[corner * 2] - opposite.x
                val oldY = origin[corner * 2 + 1] - opposite.y
                val newX = oldX + dx
                val newY = oldY + dy
                val oldU = oldX * ux + oldY * uy
                val oldV = oldX * vx + oldY * vy
                var scaleU = if (abs(oldU) > 1e-3f) (newX * ux + newY * uy) / oldU else 1f
                var scaleV = if (abs(oldV) > 1e-3f) (newX * vx + newY * vy) / oldV else 1f
                if (lockAspect) {
                    val mag = (abs(scaleU) + abs(scaleV)) * 0.5f
                    scaleU = if (scaleU < 0f) -mag else mag
                    scaleV = if (scaleV < 0f) -mag else mag
                }
                for (index in 0..3) {
                    val relativeX = origin[index * 2] - opposite.x
                    val relativeY = origin[index * 2 + 1] - opposite.y
                    val projectedU = (relativeX * ux + relativeY * uy) * scaleU
                    val projectedV = (relativeX * vx + relativeY * vy) * scaleV
                    movePoint(index, opposite.x + projectedU * ux + projectedV * vx, opposite.y + projectedU * uy + projectedV * vy)
                }
            }
        } else {
            val edge = when (handle) {
                Handle.TOP -> intArrayOf(0, 1, 3, 2)
                Handle.RIGHT -> intArrayOf(1, 2, 0, 3)
                Handle.BOTTOM -> intArrayOf(2, 3, 1, 0)
                Handle.LEFT -> intArrayOf(3, 0, 2, 1)
                else -> return
            }
            val a = edge[0]; val b = edge[1]
            if (mode == Mode.SKEW || mode == Mode.DISTORT) {
                movePoint(a, origin[a * 2] + dx, origin[a * 2 + 1] + dy)
                movePoint(b, origin[b * 2] + dx, origin[b * 2 + 1] + dy)
            } else {
                val pa = point(a)
                val oppositeA = point(edge[2])
                val axisX = pa.x - oppositeA.x
                val axisY = pa.y - oppositeA.y
                val axisLength = hypot(axisX, axisY).coerceAtLeast(1e-4f)
                val ax = axisX / axisLength; val ay = axisY / axisLength
                val projection = dx * ax + dy * ay
                movePoint(a, pa.x + projection * ax, pa.y + projection * ay)
                val pb = point(b)
                movePoint(b, pb.x + projection * ax, pb.y + projection * ay)
            }
        }
        matrix.reset()
        if (!matrix.setPolyToPoly(srcPts, 0, next, 0, 4)) {
            matrix.reset()
            matrix.setPolyToPoly(srcPts, 0, origin, 0, 4)
        }
        updatePoints()
    }

    fun isCorner(handle: Handle): Boolean = handle in setOf(
        Handle.TOP_LEFT, Handle.TOP_RIGHT, Handle.BOTTOM_RIGHT, Handle.BOTTOM_LEFT
    )

    fun isEdge(handle: Handle): Boolean = handle in setOf(Handle.TOP, Handle.RIGHT, Handle.BOTTOM, Handle.LEFT)

    fun drawTransformedBitmap(canvas: Canvas, paint: Paint = bitmapPaint) {
        paint.isFilterBitmap = interpolation == Interpolation.BILINEAR
        val w = sourceBitmap.width.toFloat()
        val h = sourceBitmap.height.toFloat()
        val map = Matrix()
        if (map.setPolyToPoly(floatArrayOf(0f, 0f, w, 0f, w, h, 0f, h), 0, dstPts, 0, 4)) {
            canvas.drawBitmap(sourceBitmap, map, paint)
        }
    }

    fun getCenter(): PointF {
        return PointF(
            (dstPts[0] + dstPts[4]) / 2f,
            (dstPts[1] + dstPts[5]) / 2f
        )
    }

    fun getRotationHandlePos(): PointF {
        val midTopX = (dstPts[0] + dstPts[2]) / 2f
        val midTopY = (dstPts[1] + dstPts[3]) / 2f
        val c = getCenter()
        val dx = midTopX - c.x
        val dy = midTopY - c.y
        val len = hypot(dx, dy)
        val offset = 36f
        return if (len > 0.001f) {
            PointF(midTopX + (dx / len) * offset, midTopY + (dy / len) * offset)
        } else {
            PointF(midTopX, midTopY - offset)
        }
    }

    enum class Handle {
        NONE,
        TOP_LEFT, TOP, TOP_RIGHT,
        RIGHT, BOTTOM_RIGHT, BOTTOM,
        BOTTOM_LEFT, LEFT,
        ROTATION,
        BODY
    }

    fun getHandlePoint(handle: Handle): PointF? {
        return when (handle) {
            Handle.TOP_LEFT -> PointF(dstPts[0], dstPts[1])
            Handle.TOP -> PointF((dstPts[0] + dstPts[2]) / 2f, (dstPts[1] + dstPts[3]) / 2f)
            Handle.TOP_RIGHT -> PointF(dstPts[2], dstPts[3])
            Handle.RIGHT -> PointF((dstPts[2] + dstPts[4]) / 2f, (dstPts[3] + dstPts[5]) / 2f)
            Handle.BOTTOM_RIGHT -> PointF(dstPts[4], dstPts[5])
            Handle.BOTTOM -> PointF((dstPts[4] + dstPts[6]) / 2f, (dstPts[5] + dstPts[7]) / 2f)
            Handle.BOTTOM_LEFT -> PointF(dstPts[6], dstPts[7])
            Handle.LEFT -> PointF((dstPts[6] + dstPts[0]) / 2f, (dstPts[7] + dstPts[1]) / 2f)
            Handle.ROTATION -> getRotationHandlePos()
            else -> null
        }
    }

    fun hitTest(canvasX: Float, canvasY: Float, handleRadius: Float): Handle {
        // 1. Rotation knob
        val rotPt = getRotationHandlePos()
        if (hypot(canvasX - rotPt.x, canvasY - rotPt.y) <= handleRadius * 1.6f) {
            return Handle.ROTATION
        }

        // 2. Corner and Edge handles
        val handles = arrayOf(
            Handle.TOP_LEFT, Handle.TOP_RIGHT, Handle.BOTTOM_RIGHT, Handle.BOTTOM_LEFT,
            Handle.TOP, Handle.RIGHT, Handle.BOTTOM, Handle.LEFT
        )
        for (h in handles) {
            val pt = getHandlePoint(h) ?: continue
            if (hypot(canvasX - pt.x, canvasY - pt.y) <= handleRadius * 1.3f) {
                return h
            }
        }

        // 3. Inside the bounding quadrilateral = move/translate
        if (isPointInsideQuad(canvasX, canvasY)) {
            return Handle.BODY
        }

        return Handle.NONE
    }

    private fun isPointInsideQuad(px: Float, py: Float): Boolean {
        var inside = false
        var j = 3
        for (i in 0 until 4) {
            val xi = dstPts[i * 2]
            val yi = dstPts[i * 2 + 1]
            val xj = dstPts[j * 2]
            val yj = dstPts[j * 2 + 1]
            val intersect = ((yi > py) != (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
            if (intersect) inside = !inside
            j = i
        }
        return inside
    }

    /**
     * Renders the transformed bitmap, quad outline, and handles on the canvas.
     */
    fun draw(canvas: Canvas, canvasScale: Float = 1f) {
        // Render the preview using perspective mapping or piecewise affine distortion.
        drawTransformedBitmap(canvas)

        // 2. Render Bounding Box Quad
        val handleRadius = 7f / canvasScale.coerceAtLeast(0.1f)
        val strokeW = 1.8f / canvasScale.coerceAtLeast(0.1f)
        quadPaint.strokeWidth = strokeW
        quadShadowPaint.strokeWidth = strokeW * 2f
        handleStrokePaint.strokeWidth = strokeW

        val path = Path().apply {
            moveTo(dstPts[0], dstPts[1])
            lineTo(dstPts[2], dstPts[3])
            lineTo(dstPts[4], dstPts[5])
            lineTo(dstPts[6], dstPts[7])
            close()
        }

        // Dual-pass quad outline
        canvas.drawPath(path, quadShadowPaint)
        canvas.drawPath(path, quadPaint)

        // 3. Stem line connecting Top Midpoint to Rotation Knob
        val midTopX = (dstPts[0] + dstPts[2]) / 2f
        val midTopY = (dstPts[1] + dstPts[3]) / 2f
        val rotPt = getRotationHandlePos()
        canvas.drawLine(midTopX, midTopY, rotPt.x, rotPt.y, quadShadowPaint)
        canvas.drawLine(midTopX, midTopY, rotPt.x, rotPt.y, quadPaint)

        // Rotation Handle Knob
        canvas.drawCircle(rotPt.x, rotPt.y, handleRadius * 1.25f, rotKnobFillPaint)
        canvas.drawCircle(rotPt.x, rotPt.y, handleRadius * 1.25f, handleStrokePaint)

        // 4. Render 8 resize handles
        val handles = arrayOf(
            Handle.TOP_LEFT, Handle.TOP_RIGHT, Handle.BOTTOM_RIGHT, Handle.BOTTOM_LEFT,
            Handle.TOP, Handle.RIGHT, Handle.BOTTOM, Handle.LEFT
        )
        for (handle in handles) {
            val pt = getHandlePoint(handle) ?: continue
            val r = if (handle == Handle.TOP_LEFT || handle == Handle.TOP_RIGHT ||
                         handle == Handle.BOTTOM_RIGHT || handle == Handle.BOTTOM_LEFT) {
                handleRadius * 1.15f
            } else {
                handleRadius * 0.9f
            }
            canvas.drawCircle(pt.x, pt.y, r, handleFillPaint)
            canvas.drawCircle(pt.x, pt.y, r, handleStrokePaint)
        }
    }

    fun release() {
        if (!sourceBitmap.isRecycled) {
            sourceBitmap.recycle()
        }
        originalLayerBackup?.let {
            if (!it.isRecycled) {
                it.recycle()
            }
        }
    }
}
