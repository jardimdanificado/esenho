package app.esenho.nativeengine

import android.graphics.Bitmap
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sqrt

data class VectorTraceOptions(
    val mode: String = "threshold",
    val threshold: Int = 128,
    val colorCount: Int = 4,
    val minArea: Float = 0f,
    val smoothness: Float = 1f,
    val bezierFit: Boolean = true,
    val maxContours: Int = 120,
)

data class TracedShape(val contours: List<VectorContour>, val color: Int)

/** Marching-squares tracer with silhouette, threshold and colour quantization modes. */
internal object VectorTracer {
    private data class Point(val x: Float, val y: Float)

    fun trace(bitmap: Bitmap, options: VectorTraceOptions): List<TracedShape> {
        val width = bitmap.width
        val height = bitmap.height
        if (width < 3 || height < 3) return emptyList()
        val step = maxOf(1, ceil(sqrt((width * height).toDouble() / 250000.0)).toInt())
        val cols = (width - 1) / step + 1
        val rows = (height - 1) / step + 1
        if (cols < 3 || rows < 3) return emptyList()
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        val colors = IntArray(cols * rows)
        val alphas = IntArray(cols * rows)
        for (y in 0 until rows) {
            val py = minOf(y * step, height - 1)
            for (x in 0 until cols) {
                val px = minOf(x * step, width - 1)
                val color = pixels[py * width + px]
                colors[y * cols + x] = color
                alphas[y * cols + x] = color ushr 24
            }
        }
        val threshold = options.threshold.coerceIn(1, 255)
        val masks: List<Pair<BooleanArray, Int>> =
            when (options.mode.lowercase()) {
                "silhouette" ->
                    listOf(BooleanArray(cols * rows) { alphas[it] >= threshold } to 0xff000000.toInt())
                "color" -> colorMasks(colors, alphas, options.colorCount.coerceIn(2, 16), threshold)
                else ->
                    listOf(
                        BooleanArray(cols * rows) {
                            alphas[it] >= threshold &&
                                ((colors[it] and 0xff) + ((colors[it] shr 8) and 0xff) + ((colors[it] shr 16) and 0xff)) / 3 < 128
                        } to 0xff000000.toInt()
                    )
            }
        return masks.mapNotNull { (mask, color) ->
            val contours = traceMask(mask, cols, rows, step, options)
            if (contours.isEmpty()) null else TracedShape(contours, color)
        }
    }

    private fun colorMasks(
        colors: IntArray,
        alphas: IntArray,
        count: Int,
        threshold: Int,
    ): List<Pair<BooleanArray, Int>> {
        val samples = colors.indices.filter { alphas[it] >= threshold }.toIntArray()
        if (samples.isEmpty()) return emptyList()
        val centers =
            samples
                .map { colors[it] }
                .sortedBy { luminance(it) }
                .filterIndexed { index, _ -> index % maxOf(1, samples.size / count) == 0 }
                .take(count)
                .toMutableList()
        while (centers.size < count) centers += colors[samples.last()]
        repeat(8) {
            val sums = LongArray(count)
            val weights = LongArray(count)
            val next = Array(count) { IntArray(3) }
            samples.forEach { index ->
                val color = colors[index]
                var best = 0
                var bestDistance = Long.MAX_VALUE
                centers.forEachIndexed { c, center ->
                    val distance = distance(color, center)
                    if (distance < bestDistance) {
                        bestDistance = distance
                        best = c
                    }
                }
                val r = color and 0xff
                val g = (color shr 8) and 0xff
                val b = (color shr 16) and 0xff
                next[best][0] += r
                next[best][1] += g
                next[best][2] += b
                weights[best]++
                sums[best]++
            }
            centers.forEachIndexed { c, _ ->
                if (weights[c] > 0) {
                    val r = (next[c][0] / weights[c]).toInt()
                    val g = (next[c][1] / weights[c]).toInt()
                    val b = (next[c][2] / weights[c]).toInt()
                    centers[c] = 0xff000000.toInt() or (b shl 16) or (g shl 8) or r
                }
            }
        }
        return centers.map { center ->
            BooleanArray(colors.size) { index -> alphas[index] >= threshold && nearest(colors[index], centers) == center } to center
        }
    }

    private fun luminance(color: Int) =
        (color and 0xff) + ((color shr 8) and 0xff) + ((color shr 16) and 0xff)

    private fun distance(a: Int, b: Int): Long {
        val dr = (a and 0xff) - (b and 0xff)
        val dg = ((a shr 8) and 0xff) - ((b shr 8) and 0xff)
        val db = ((a shr 16) and 0xff) - ((b shr 16) and 0xff)
        return dr.toLong() * dr + dg.toLong() * dg + db.toLong() * db
    }

    private fun nearest(color: Int, centers: List<Int>) =
        centers.minByOrNull { distance(color, it) } ?: color

    private fun traceMask(
        mask: BooleanArray,
        cols: Int,
        rows: Int,
        step: Int,
        options: VectorTraceOptions,
    ): List<VectorContour> {
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
        val tolerance = options.smoothness.coerceIn(.25f, 12f)
        for (seed in segments.indices) {
            if (used[seed] || contours.size >= options.maxContours) continue
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
            val simplified = simplifyLoop(points, tolerance)
            if (simplified.size >= 3) {
                val nodes =
                    simplified.map { VectorNode(it.x * step, it.y * step, 1f) }.toMutableList()
                if (abs(polygonArea(nodes)) < options.minArea) continue
                if (options.bezierFit) fitHandles(nodes)
                contours += VectorContour(nodes, true)
            }
        }
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

    private fun fitHandles(nodes: MutableList<VectorNode>) {
        nodes.indices.forEach { i ->
            val previous = nodes[(i - 1 + nodes.size) % nodes.size]
            val next = nodes[(i + 1) % nodes.size]
            val dx = (next.x - previous.x) / 6
            val dy = (next.y - previous.y) / 6
            nodes[i].inX = nodes[i].x - dx
            nodes[i].inY = nodes[i].y - dy
            nodes[i].outX = nodes[i].x + dx
            nodes[i].outY = nodes[i].y + dy
        }
    }

    private fun polygonArea(nodes: List<VectorNode>): Float {
        var value = 0f
        for (i in nodes.indices) {
            val a = nodes[i]
            val b = nodes[(i + 1) % nodes.size]
            value += a.x * b.y - b.x * a.y
        }
        return value / 2f
    }

    private fun bounds(contour: VectorContour) =
        listOf(
            contour.nodes.minOf { it.x },
            contour.nodes.minOf { it.y },
            contour.nodes.maxOf { it.x },
            contour.nodes.maxOf { it.y },
        )

    private fun simplifyLoop(points: List<Point>, tolerance: Float): List<Point> {
        val result = mutableListOf<Point>()
        points.forEach { p ->
            if (result.isEmpty() || hypot(p.x - result.last().x, p.y - result.last().y) >= tolerance)
                result += p
        }
        if (result.size > 2 && hypot(result.first().x - result.last().x, result.first().y - result.last().y) < tolerance)
            result.removeAt(result.lastIndex)
        return result
    }
}
