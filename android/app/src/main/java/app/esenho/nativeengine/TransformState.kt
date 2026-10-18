package app.esenho.nativeengine

import android.graphics.*
import kotlin.math.*

private fun interpolateChannel(p00: Int, p10: Int, p01: Int, p11: Int, shift: Int, w00: Float, w10: Float, w01: Float, w11: Float): Int = (
    ((p00 ushr shift) and 255) * w00 +
        ((p10 ushr shift) and 255) * w10 +
        ((p01 ushr shift) and 255) * w01 +
        ((p11 ushr shift) and 255) * w11
    ).roundToInt().coerceIn(0, 255)

private fun interpolatePremultipliedArgb(
    p00: Int,
    p10: Int,
    p01: Int,
    p11: Int,
    w00: Float,
    w10: Float,
    w01: Float,
    w11: Float
): Int {
    val alpha = interpolateChannel(p00, p10, p01, p11, 24, w00, w10, w01, w11)
    if (alpha == 0) return Color.TRANSPARENT

    fun premultipliedChannel(shift: Int): Int {
        val c00 = ((p00 ushr shift) and 255) * ((p00 ushr 24) and 255) / 255f
        val c10 = ((p10 ushr shift) and 255) * ((p10 ushr 24) and 255) / 255f
        val c01 = ((p01 ushr shift) and 255) * ((p01 ushr 24) and 255) / 255f
        val c11 = ((p11 ushr shift) and 255) * ((p11 ushr 24) and 255) / 255f
        val value = c00 * w00 + c10 * w10 + c01 * w01 + c11 * w11
        return (value * 255f / alpha).roundToInt().coerceIn(0, 255)
    }

    return Color.argb(
        alpha,
        premultipliedChannel(16),
        premultipliedChannel(8),
        premultipliedChannel(0)
    )
}

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

    fun moveHandle(
        handle: Handle,
        dx: Float,
        dy: Float,
        origin: FloatArray = dstPts.copyOf(),
        lockAspect: Boolean = false,
        forceFreeCorner: Boolean = false
    ) {
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
            // Perspective and free Distort both expose independent corners.
            // Scale and Skew keep the opposite corner anchored; Ctrl/Meta can
            // temporarily free a corner in those modes.
            val free = mode == Mode.DISTORT || mode == Mode.PERSPECTIVE || forceFreeCorner
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
                val basisDeterminant = ux * vy - uy * vx
                if (abs(basisDeterminant) < 1e-4f) return
                fun basisCoordinates(x: Float, y: Float): Pair<Float, Float> =
                    Pair(
                        (x * vy - y * vx) / basisDeterminant,
                        (ux * y - uy * x) / basisDeterminant
                    )
                val oldX = origin[corner * 2] - opposite.x
                val oldY = origin[corner * 2 + 1] - opposite.y
                val newX = oldX + dx
                val newY = oldY + dy
                val (oldU, oldV) = basisCoordinates(oldX, oldY)
                val (newU, newV) = basisCoordinates(newX, newY)
                var scaleU = if (abs(oldU) > 1e-3f) newU / oldU else 1f
                var scaleV = if (abs(oldV) > 1e-3f) newV / oldV else 1f
                if (lockAspect) {
                    val mag = (abs(scaleU) + abs(scaleV)) * 0.5f
                    scaleU = if (scaleU < 0f) -mag else mag
                    scaleV = if (scaleV < 0f) -mag else mag
                }
                for (index in 0..3) {
                    val relativeX = origin[index * 2] - opposite.x
                    val relativeY = origin[index * 2 + 1] - opposite.y
                    val (coordinateU, coordinateV) = basisCoordinates(relativeX, relativeY)
                    val projectedU = coordinateU * scaleU
                    val projectedV = coordinateV * scaleV
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

    /**
     * Rasterizes projective modes with inverse-homography pixel-center
     * sampling. Canvas matrix filtering differs between Android versions,
     * especially for nearest-neighbor transforms and transparent edges.
     */
    fun drawTransformedBitmapExact(canvas: Canvas) {
        if (mode == Mode.DISTORT) {
            drawDistortedBitmapExact(canvas)
            return
        }
        val targetWidth = canvas.width
        val targetHeight = canvas.height
        if (targetWidth <= 0 || targetHeight <= 0) return

        val sourceWidth = sourceBitmap.width
        val sourceHeight = sourceBitmap.height
        val mapping = Matrix()
        val sourceCorners = floatArrayOf(
            0f, 0f, sourceWidth.toFloat(), 0f,
            sourceWidth.toFloat(), sourceHeight.toFloat(), 0f, sourceHeight.toFloat()
        )
        if (!mapping.setPolyToPoly(sourceCorners, 0, dstPts, 0, 4)) return
        val inverse = Matrix()
        if (!mapping.invert(inverse)) return

        val matrixValues = FloatArray(9)
        inverse.getValues(matrixValues)
        val sxScale = matrixValues[Matrix.MSCALE_X]
        val sxSkew = matrixValues[Matrix.MSKEW_X]
        val sxTranslate = matrixValues[Matrix.MTRANS_X]
        val sySkew = matrixValues[Matrix.MSKEW_Y]
        val syScale = matrixValues[Matrix.MSCALE_Y]
        val syTranslate = matrixValues[Matrix.MTRANS_Y]
        val perspectiveX = matrixValues[Matrix.MPERSP_0]
        val perspectiveY = matrixValues[Matrix.MPERSP_1]
        val perspectiveW = matrixValues[Matrix.MPERSP_2]

        var minX = Float.POSITIVE_INFINITY
        var minY = Float.POSITIVE_INFINITY
        var maxX = Float.NEGATIVE_INFINITY
        var maxY = Float.NEGATIVE_INFINITY
        for (i in 0..3) {
            val x = dstPts[i * 2]
            val y = dstPts[i * 2 + 1]
            minX = min(minX, x)
            minY = min(minY, y)
            maxX = max(maxX, x)
            maxY = max(maxY, y)
        }
        val left = floor(minX).toInt().coerceAtLeast(0)
        val top = floor(minY).toInt().coerceAtLeast(0)
        val right = ceil(maxX).toInt().coerceAtMost(targetWidth - 1)
        val bottom = ceil(maxY).toInt().coerceAtMost(targetHeight - 1)
        if (left > right || top > bottom) return

        val sourcePixels = IntArray(sourceWidth * sourceHeight)
        sourceBitmap.getPixels(sourcePixels, 0, sourceWidth, 0, 0, sourceWidth, sourceHeight)
        val regionWidth = right - left + 1
        val regionHeight = bottom - top + 1
        val warpedPixels = IntArray(regionWidth * regionHeight)
        for (y in top..bottom) {
            val destinationCenterY = y + 0.5f
            val rowOffset = (y - top) * regionWidth
            for (x in left..right) {
                val destinationCenterX = x + 0.5f
                val denominator = perspectiveX * destinationCenterX +
                    perspectiveY * destinationCenterY + perspectiveW
                if (abs(denominator) < 1e-8f) continue
                val sourceX = (sxScale * destinationCenterX + sxSkew * destinationCenterY + sxTranslate) / denominator - 0.5f
                val sourceY = (sySkew * destinationCenterX + syScale * destinationCenterY + syTranslate) / denominator - 0.5f

                if (interpolation == Interpolation.NEAREST) {
                    val ix = floor(sourceX + 0.5f).toInt()
                    val iy = floor(sourceY + 0.5f).toInt()
                    if (ix in 0 until sourceWidth && iy in 0 until sourceHeight) {
                        val color = sourcePixels[iy * sourceWidth + ix]
                        if (Color.alpha(color) != 0) warpedPixels[rowOffset + x - left] = color
                    }
                } else if (sourceX >= -0.5f && sourceX < sourceWidth - 0.5f &&
                    sourceY >= -0.5f && sourceY < sourceHeight - 0.5f
                ) {
                    val x0 = floor(sourceX).toInt().coerceIn(0, sourceWidth - 1)
                    val y0 = floor(sourceY).toInt().coerceIn(0, sourceHeight - 1)
                    val x1 = (x0 + 1).coerceAtMost(sourceWidth - 1)
                    val y1 = (y0 + 1).coerceAtMost(sourceHeight - 1)
                    val fx = (sourceX - x0).coerceIn(0f, 1f)
                    val fy = (sourceY - y0).coerceIn(0f, 1f)
                    val w00 = (1f - fx) * (1f - fy)
                    val w10 = fx * (1f - fy)
                    val w01 = (1f - fx) * fy
                    val w11 = fx * fy
                    val p00 = sourcePixels[y0 * sourceWidth + x0]
                    val p10 = sourcePixels[y0 * sourceWidth + x1]
                    val p01 = sourcePixels[y1 * sourceWidth + x0]
                    val p11 = sourcePixels[y1 * sourceWidth + x1]
                    warpedPixels[rowOffset + x - left] = interpolatePremultipliedArgb(
                        p00, p10, p01, p11, w00, w10, w01, w11
                    )
                }
            }
        }

        val warped = Bitmap.createBitmap(regionWidth, regionHeight, Bitmap.Config.ARGB_8888)
        try {
            warped.setPixels(warpedPixels, 0, regionWidth, 0, 0, regionWidth, regionHeight)
            canvas.drawBitmap(warped, left.toFloat(), top.toFloat(), null)
        } finally {
            warped.recycle()
        }
    }

    /** Rasterizes free Distort as two affine triangles, matching its preview. */
    private fun drawDistortedBitmapExact(canvas: Canvas) {
        val targetWidth = canvas.width
        val targetHeight = canvas.height
        val sourceWidth = sourceBitmap.width
        val sourceHeight = sourceBitmap.height
        if (targetWidth <= 0 || targetHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return

        val sourcePixels = IntArray(sourceWidth * sourceHeight)
        sourceBitmap.getPixels(sourcePixels, 0, sourceWidth, 0, 0, sourceWidth, sourceHeight)
        val srcFirst = floatArrayOf(0f, 0f, sourceWidth.toFloat(), 0f, 0f, sourceHeight.toFloat())
        val dstFirst = floatArrayOf(dstPts[0], dstPts[1], dstPts[2], dstPts[3], dstPts[6], dstPts[7])
        val srcSecond = floatArrayOf(
            sourceWidth.toFloat(), sourceHeight.toFloat(), 0f, sourceHeight.toFloat(),
            sourceWidth.toFloat(), 0f
        )
        val dstSecond = floatArrayOf(dstPts[4], dstPts[5], dstPts[6], dstPts[7], dstPts[2], dstPts[3])

        fun drawTriangle(src: FloatArray, dst: FloatArray, ownsSharedEdge: Boolean) {
            val mapping = Matrix()
            if (!mapping.setPolyToPoly(src, 0, dst, 0, 3)) return
            val inverse = Matrix()
            if (!mapping.invert(inverse)) return
            val values = FloatArray(9)
            inverse.getValues(values)

            var minX = Float.POSITIVE_INFINITY
            var minY = Float.POSITIVE_INFINITY
            var maxX = Float.NEGATIVE_INFINITY
            var maxY = Float.NEGATIVE_INFINITY
            for (i in 0..2) {
                minX = min(minX, dst[i * 2])
                minY = min(minY, dst[i * 2 + 1])
                maxX = max(maxX, dst[i * 2])
                maxY = max(maxY, dst[i * 2 + 1])
            }
            val left = floor(minX).toInt().coerceAtLeast(0)
            val top = floor(minY).toInt().coerceAtLeast(0)
            val right = ceil(maxX).toInt().coerceAtMost(targetWidth - 1)
            val bottom = ceil(maxY).toInt().coerceAtMost(targetHeight - 1)
            if (left > right || top > bottom) return

            fun edge(ax: Float, ay: Float, bx: Float, by: Float, px: Float, py: Float) =
                (px - ax) * (by - ay) - (py - ay) * (bx - ax)

            fun insideTriangle(px: Float, py: Float): Boolean {
                val d0 = edge(dst[0], dst[1], dst[2], dst[3], px, py)
                val d1 = edge(dst[2], dst[3], dst[4], dst[5], px, py)
                val d2 = edge(dst[4], dst[5], dst[0], dst[1], px, py)
                val hasNegative = d0 < -1e-4f || d1 < -1e-4f || d2 < -1e-4f
                val hasPositive = d0 > 1e-4f || d1 > 1e-4f || d2 > 1e-4f
                return !(hasNegative && hasPositive)
            }

            fun liesOnSharedDiagonal(px: Float, py: Float): Boolean {
                val topRightX = dstPts[2]
                val topRightY = dstPts[3]
                val bottomLeftX = dstPts[6]
                val bottomLeftY = dstPts[7]
                val cross = edge(topRightX, topRightY, bottomLeftX, bottomLeftY, px, py)
                val edgeLength = hypot(bottomLeftX - topRightX, bottomLeftY - topRightY).coerceAtLeast(1f)
                return abs(cross) <= edgeLength * 1e-4f
            }

            val regionWidth = right - left + 1
            val regionHeight = bottom - top + 1
            val warpedPixels = IntArray(regionWidth * regionHeight)
            for (y in top..bottom) {
                val py = y + 0.5f
                val rowOffset = (y - top) * regionWidth
                for (x in left..right) {
                    val px = x + 0.5f
                    if (!insideTriangle(px, py) || (!ownsSharedEdge && liesOnSharedDiagonal(px, py))) continue
                    val denominator = values[Matrix.MPERSP_0] * px +
                        values[Matrix.MPERSP_1] * py + values[Matrix.MPERSP_2]
                    if (abs(denominator) < 1e-8f) continue
                    val sourceX = (values[Matrix.MSCALE_X] * px + values[Matrix.MSKEW_X] * py + values[Matrix.MTRANS_X]) / denominator - 0.5f
                    val sourceY = (values[Matrix.MSKEW_Y] * px + values[Matrix.MSCALE_Y] * py + values[Matrix.MTRANS_Y]) / denominator - 0.5f
                    val color = sampleSourcePixel(sourcePixels, sourceWidth, sourceHeight, sourceX, sourceY)
                    if (Color.alpha(color) != 0) warpedPixels[rowOffset + x - left] = color
                }
            }

            val warped = Bitmap.createBitmap(regionWidth, regionHeight, Bitmap.Config.ARGB_8888)
            try {
                warped.setPixels(warpedPixels, 0, regionWidth, 0, 0, regionWidth, regionHeight)
                canvas.drawBitmap(warped, left.toFloat(), top.toFloat(), null)
            } finally {
                warped.recycle()
            }
        }

        drawTriangle(srcFirst, dstFirst, ownsSharedEdge = true)
        drawTriangle(srcSecond, dstSecond, ownsSharedEdge = false)
    }

    private fun sampleSourcePixel(pixels: IntArray, width: Int, height: Int, sourceX: Float, sourceY: Float): Int {
        if (interpolation == Interpolation.NEAREST) {
            val x = floor(sourceX + 0.5f).toInt()
            val y = floor(sourceY + 0.5f).toInt()
            return if (x in 0 until width && y in 0 until height) pixels[y * width + x] else Color.TRANSPARENT
        }
        if (sourceX < -0.5f || sourceX >= width - 0.5f || sourceY < -0.5f || sourceY >= height - 0.5f) {
            return Color.TRANSPARENT
        }
        val x0 = floor(sourceX).toInt().coerceIn(0, width - 1)
        val y0 = floor(sourceY).toInt().coerceIn(0, height - 1)
        val x1 = (x0 + 1).coerceAtMost(width - 1)
        val y1 = (y0 + 1).coerceAtMost(height - 1)
        val fx = (sourceX - x0).coerceIn(0f, 1f)
        val fy = (sourceY - y0).coerceIn(0f, 1f)
        val w00 = (1f - fx) * (1f - fy)
        val w10 = fx * (1f - fy)
        val w01 = (1f - fx) * fy
        val w11 = fx * fy
        val p00 = pixels[y0 * width + x0]
        val p10 = pixels[y0 * width + x1]
        val p01 = pixels[y1 * width + x0]
        val p11 = pixels[y1 * width + x1]
        return interpolatePremultipliedArgb(p00, p10, p01, p11, w00, w10, w01, w11)
    }

    /**
     * Free Distort uses two affine triangles in both preview and commit.
     * Perspective uses a projective homography in both paths.
     */
    private fun drawPreviewBitmap(canvas: Canvas, paint: Paint = bitmapPaint) {
        paint.isFilterBitmap = interpolation == Interpolation.BILINEAR
        if (mode != Mode.DISTORT) {
            drawTransformedBitmap(canvas, paint)
            return
        }
        val w = sourceBitmap.width.toFloat()
        val h = sourceBitmap.height.toFloat()
        val srcFirst = floatArrayOf(0f, 0f, w, 0f, 0f, h)
        val dstFirst = floatArrayOf(dstPts[0], dstPts[1], dstPts[2], dstPts[3], dstPts[6], dstPts[7])
        val srcSecond = floatArrayOf(w, h, 0f, h, w, 0f)
        val dstSecond = floatArrayOf(dstPts[4], dstPts[5], dstPts[6], dstPts[7], dstPts[2], dstPts[3])

        fun drawTriangle(src: FloatArray, dst: FloatArray) {
            val transform = Matrix()
            if (!transform.setPolyToPoly(src, 0, dst, 0, 3)) return
            val clip = Path().apply {
                moveTo(dst[0], dst[1])
                lineTo(dst[2], dst[3])
                lineTo(dst[4], dst[5])
                close()
            }
            canvas.save()
            canvas.clipPath(clip)
            canvas.drawBitmap(sourceBitmap, transform, paint)
            canvas.restore()
        }

        drawTriangle(srcFirst, dstFirst)
        drawTriangle(srcSecond, dstSecond)
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
        drawPreviewBitmap(canvas)

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
