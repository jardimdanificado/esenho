package app.esenho.nativeengine

import android.graphics.*
import kotlin.math.*

class TransformState(
    val sourceBitmap: Bitmap,
    val initialBounds: RectF,
    val isSelectionOnly: Boolean,
    val originalLayerBackup: Bitmap? = null
) {
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
        val w = sourceBitmap.width.toFloat()
        val h = sourceBitmap.height.toFloat()

        // 1. Render Transformed Bitmap with Bilinear Filter
        val drawMatrix = Matrix()
        val srcPoly = floatArrayOf(0f, 0f, w, 0f, w, h, 0f, h)
        drawMatrix.setPolyToPoly(srcPoly, 0, dstPts, 0, 4)
        canvas.drawBitmap(sourceBitmap, drawMatrix, bitmapPaint)

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
