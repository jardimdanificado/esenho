package app.esenho.nativeengine

import android.graphics.Bitmap
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.roundToInt

/** Marching-squares tracer for turning raster pixels into editable closed contours. */
internal object VectorTracer {
    private data class Point(val x: Float, val y: Float)

    fun trace(bitmap: Bitmap, threshold: Int, maxContours: Int): List<VectorContour> {
        val width = bitmap.width
        val height = bitmap.height
        if (width < 3 || height < 3) return emptyList()
        val step = maxOf(1, ceil(kotlin.math.sqrt((width * height).toDouble() / 250000.0)).toInt())
        val cols = (width - 1) / step + 1
        val rows = (height - 1) / step + 1
        if (cols < 3 || rows < 3) return emptyList()
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        val mask = BooleanArray(cols * rows)
        for (y in 0 until rows) {
            val py = minOf(y * step, height - 1)
            for (x in 0 until cols) {
                val px = minOf(x * step, width - 1)
                val color = pixels[py * width + px]
                mask[y * cols + x] = (color ushr 24) >= threshold
            }
        }
        val segments = mutableListOf<Pair<Point, Point>>()
        fun key(p: Point) = "${(p.x * 4).roundToInt()}:${(p.y * 4).roundToInt()}"
        fun add(a: Point, b: Point) {
            if (hypot(a.x - b.x, a.y - b.y) > .01f) segments += a to b
        }
        for (y in 0 until rows - 1) {
            for (x in 0 until cols - 1) {
                val tl = mask[y * cols + x]
                val tr = mask[y * cols + x + 1]
                val br = mask[(y + 1) * cols + x + 1]
                val bl = mask[(y + 1) * cols + x]
                val index =
                    (if (tl) 8 else 0) or
                        (if (tr) 4 else 0) or
                        (if (br) 2 else 0) or
                        (if (bl) 1 else 0)
                if (index == 0 || index == 15) continue
                val top = Point(x + .5f, y.toFloat())
                val right = Point((x + 1).toFloat(), y + .5f)
                val bottom = Point(x + .5f, (y + 1).toFloat())
                val left = Point(x.toFloat(), y + .5f)
                when (index) {
                    1, 14 -> add(left, bottom)
                    2, 13 -> add(bottom, right)
                    3, 12 -> add(left, right)
                    4, 11 -> add(top, right)
                    5 -> {
                        add(left, top)
                        add(bottom, right)
                    }
                    6, 9 -> add(top, bottom)
                    7, 8 -> add(left, top)
                    10 -> {
                        add(left, bottom)
                        add(top, right)
                    }
                }
            }
        }
        val starts = mutableMapOf<String, MutableList<Int>>()
        segments.forEachIndexed { index, segment ->
            starts.getOrPut(key(segment.first)) { mutableListOf() }.add(index)
        }
        val used = BooleanArray(segments.size)
        val contours = mutableListOf<VectorContour>()
        for (seed in segments.indices) {
            if (used[seed] || contours.size >= maxContours) continue
            val points = mutableListOf<Point>()
            var current = seed
            var currentKey = key(segments[seed].first)
            var guard = 0
            while (guard++ <= segments.size) {
                val segment = segments[current]
                if (!used[current]) {
                    used[current] = true
                    points += segment.first
                    points += segment.second
                }
                currentKey = key(segment.second)
                val next = starts[currentKey]?.firstOrNull { !used[it] } ?: break
                current = next
                if (key(segments[current].first) != currentKey) break
            }
            val simplified = simplifyLoop(points)
            if (simplified.size >= 3) {
                contours +=
                    VectorContour(
                        simplified.map { VectorNode(it.x * step.toFloat(), it.y * step.toFloat(), 1f) }
                            .toMutableList(),
                        true,
                    )
            }
        }
        // Ambiguous corners can produce two chains for the same boundary; keep one.
        val accepted = mutableListOf<VectorContour>()
        contours.forEach { contour ->
            val box = bounds(contour)
            val duplicate =
                accepted.any { other ->
                    val previous = bounds(other)
                    (0 until 4).all { i -> abs(previous[i] - box[i]) < 3f } &&
                        abs(other.nodes.size - contour.nodes.size) <= contour.nodes.size / 8 + 2
                }
            if (!duplicate) accepted += contour
        }
        return accepted
    }

    private fun bounds(contour: VectorContour) =
        listOf(
            contour.nodes.minOf { it.x },
            contour.nodes.minOf { it.y },
            contour.nodes.maxOf { it.x },
            contour.nodes.maxOf { it.y },
        )

    private fun simplifyLoop(points: List<Point>): List<Point> {
        val result = mutableListOf<Point>()
        points.forEach { p ->
            if (result.isEmpty() || hypot(p.x - result.last().x, p.y - result.last().y) >= .5f)
                result += p
        }
        if (result.size > 2 && hypot(result.first().x - result.last().x, result.first().y - result.last().y) < .5f)
            result.removeAt(result.lastIndex)
        return result
    }
}
