package app.esenho.desktop.graphics

import kotlin.math.*

class PointF(var x: Float = 0f, var y: Float = 0f) {
    fun set(x: Float, y: Float) {
        this.x = x
        this.y = y
    }
}

open class RectF(
    var left: Float = 0f,
    var top: Float = 0f,
    var right: Float = 0f,
    var bottom: Float = 0f,
) {
    constructor(other: RectF) : this(other.left, other.top, other.right, other.bottom)

    fun width() = right - left

    fun height() = bottom - top

    fun centerX() = (left + right) / 2

    fun centerY() = (top + bottom) / 2

    fun set(l: Float, t: Float, r: Float, b: Float) {
        left = l
        top = t
        right = r
        bottom = b
    }

    fun contains(x: Float, y: Float) = x >= left && x < right && y >= top && y < bottom

    fun inset(dx: Float, dy: Float) {
        left += dx
        right -= dx
        top += dy
        bottom -= dy
    }
}

class Rect(var left: Int = 0, var top: Int = 0, var right: Int = 0, var bottom: Int = 0) {
    constructor(other: Rect) : this(other.left, other.top, other.right, other.bottom)

    fun width() = right - left

    fun height() = bottom - top

    fun centerX() = (left + right) / 2

    fun centerY() = (top + bottom) / 2

    fun contains(x: Int, y: Int) = x >= left && x < right && y >= top && y < bottom
}

/** Android's 3×3 homography convention, including perspective and post-concatenation order. */
class Matrix() {
    private var v = doubleArrayOf(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)

    constructor(other: Matrix) : this() {
        set(other)
    }

    fun reset() {
        v = doubleArrayOf(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
    }

    fun set(other: Matrix) {
        v = other.v.clone()
    }

    fun getValues(out: FloatArray) {
        for (i in 0..8) out[i] = v[i].toFloat()
    }

    fun setValues(input: FloatArray) {
        v = DoubleArray(9) { input[it].toDouble() }
    }

    private fun multiply(a: DoubleArray, b: DoubleArray) =
        DoubleArray(9) { i -> (0..2).sumOf { k -> a[(i / 3) * 3 + k] * b[k * 3 + i % 3] } }

    fun postConcat(other: Matrix): Boolean {
        v = multiply(other.v, v)
        return true
    }

    fun preConcat(other: Matrix): Boolean {
        v = multiply(v, other.v)
        return true
    }

    fun postTranslate(x: Float, y: Float): Boolean =
        postConcat(
            Matrix().apply {
                v[2] = x.toDouble()
                v[5] = y.toDouble()
            }
        )

    fun postScale(x: Float, y: Float, px: Float = 0f, py: Float = 0f): Boolean =
        postConcat(
            Matrix().apply {
                v[0] = x.toDouble()
                v[4] = y.toDouble()
                v[2] = px * (1.0 - x)
                v[5] = py * (1.0 - y)
            }
        )

    fun setRotate(degrees: Float, px: Float = 0f, py: Float = 0f) {
        reset()
        val r = Math.toRadians(degrees.toDouble())
        val c = cos(r)
        val s = sin(r)
        v = doubleArrayOf(c, -s, px - c * px + s * py, s, c, py - s * px - c * py, 0.0, 0.0, 1.0)
    }

    fun postRotate(degrees: Float, px: Float = 0f, py: Float = 0f): Boolean =
        postConcat(Matrix().apply { setRotate(degrees, px, py) })

    fun setScale(x: Float, y: Float) {
        reset()
        postScale(x, y)
    }

    fun mapPoints(points: FloatArray) {
        for (i in points.indices step 2) {
            val x = points[i]
            val y = points[i + 1]
            val z = v[6] * x + v[7] * y + v[8]
            points[i] = ((v[0] * x + v[1] * y + v[2]) / z).toFloat()
            points[i + 1] = ((v[3] * x + v[4] * y + v[5]) / z).toFloat()
        }
    }

    fun mapPoints(out: FloatArray, input: FloatArray) {
        input.copyInto(out)
        mapPoints(out)
    }

    fun mapVectors(points: FloatArray) {
        for (i in points.indices step 2) {
            val x = points[i]
            val y = points[i + 1]
            points[i] = (v[0] * x + v[1] * y).toFloat()
            points[i + 1] = (v[3] * x + v[4] * y).toFloat()
        }
    }

    fun setConcat(a: Matrix, b: Matrix): Boolean {
        v = multiply(a.v, b.v)
        return true
    }

    fun invert(out: Matrix): Boolean {
        val a = v
        val d =
            a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) +
                a[2] * (a[3] * a[7] - a[4] * a[6])
        if (abs(d) < 1e-12) return false
        out.v =
            doubleArrayOf(
                    a[4] * a[8] - a[5] * a[7],
                    a[2] * a[7] - a[1] * a[8],
                    a[1] * a[5] - a[2] * a[4],
                    a[5] * a[6] - a[3] * a[8],
                    a[0] * a[8] - a[2] * a[6],
                    a[2] * a[3] - a[0] * a[5],
                    a[3] * a[7] - a[4] * a[6],
                    a[1] * a[6] - a[0] * a[7],
                    a[0] * a[4] - a[1] * a[3],
                )
                .map { it / d }
                .toDoubleArray()
        return true
    }

    fun setPolyToPoly(src: FloatArray, si: Int, dst: FloatArray, di: Int, count: Int): Boolean {
        require(count in 0..4)
        reset()
        if (count == 0) return true
        if (count == 1) return postTranslate(dst[di] - src[si], dst[di + 1] - src[si + 1])
        if (count == 2) {
            val sx = src[si + 2] - src[si]
            val sy = src[si + 3] - src[si + 1]
            val dx = dst[di + 2] - dst[di]
            val dy = dst[di + 3] - dst[di + 1]
            val scale = hypot(dx, dy) / hypot(sx, sy)
            postTranslate(-src[si], -src[si + 1])
            postScale(scale, scale)
            postRotate(Math.toDegrees((atan2(dy, dx) - atan2(sy, sx)).toDouble()).toFloat())
            return postTranslate(dst[di], dst[di + 1])
        }
        val n = if (count == 3) 6 else 8
        val rows = Array(n) { DoubleArray(n + 1) }
        for (i in 0 until count) {
            val x = src[si + i * 2].toDouble()
            val y = src[si + i * 2 + 1].toDouble()
            val u = dst[di + i * 2].toDouble()
            val w = dst[di + i * 2 + 1].toDouble()
            rows[i * 2][0] = x
            rows[i * 2][1] = y
            rows[i * 2][2] = 1.0
            rows[i * 2 + 1][3] = x
            rows[i * 2 + 1][4] = y
            rows[i * 2 + 1][5] = 1.0
            if (n == 8) {
                rows[i * 2][6] = -u * x
                rows[i * 2][7] = -u * y
                rows[i * 2 + 1][6] = -w * x
                rows[i * 2 + 1][7] = -w * y
            }
            rows[i * 2][n] = u
            rows[i * 2 + 1][n] = w
        }
        for (i in 0 until n) {
            val pivot = (i until n).maxBy { abs(rows[it][i]) }
            if (abs(rows[pivot][i]) < 1e-10) return false
            val tmp = rows[i]
            rows[i] = rows[pivot]
            rows[pivot] = tmp
            val d = rows[i][i]
            for (j in i..n) rows[i][j] /= d
            for (k in 0 until n) if (k != i) {
                val f = rows[k][i]
                for (j in i..n) rows[k][j] -= f * rows[i][j]
            }
        }
        v = DoubleArray(9) { if (it < n) rows[it][n] else if (it == 8) 1.0 else 0.0 }
        return true
    }

    fun isPerspective() = kotlin.math.abs(v[6]) > 1e-10 || kotlin.math.abs(v[7]) > 1e-10

    fun affine() = java.awt.geom.AffineTransform(v[0], v[3], v[1], v[4], v[2], v[5])

    companion object {
        const val MSCALE_X = 0
        const val MSKEW_X = 1
        const val MTRANS_X = 2
        const val MSKEW_Y = 3
        const val MSCALE_Y = 4
        const val MTRANS_Y = 5
        const val MPERSP_0 = 6
        const val MPERSP_1 = 7
        const val MPERSP_2 = 8
    }
}

class Path() {
    constructor(other: Path) : this() {
        shape.append(other.shape, false)
    }

    enum class Direction {
        CW,
        CCW,
    }

    val shape = java.awt.geom.Path2D.Float()

    fun moveTo(x: Float, y: Float) = shape.moveTo(x.toDouble(), y.toDouble())

    fun lineTo(x: Float, y: Float) = shape.lineTo(x.toDouble(), y.toDouble())

    fun cubicTo(x1: Float, y1: Float, x2: Float, y2: Float, x: Float, y: Float) =
        shape.curveTo(
            x1.toDouble(),
            y1.toDouble(),
            x2.toDouble(),
            y2.toDouble(),
            x.toDouble(),
            y.toDouble(),
        )

    fun close() = shape.closePath()

    fun reset() = shape.reset()

    fun addOval(r: RectF, direction: Direction) =
        shape.append(java.awt.geom.Ellipse2D.Float(r.left, r.top, r.width(), r.height()), false)
}
