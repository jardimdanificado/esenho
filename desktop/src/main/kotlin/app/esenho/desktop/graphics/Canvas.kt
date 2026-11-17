package app.esenho.desktop.graphics

import java.awt.AlphaComposite
import java.awt.BasicStroke
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.geom.*

object Color {
    const val BLACK: Int = -16777216
    const val WHITE: Int = -1
    const val TRANSPARENT = 0

    fun alpha(c: Int) = c ushr 24

    fun red(c: Int) = c ushr 16 and 255

    fun green(c: Int) = c ushr 8 and 255

    fun blue(c: Int) = c and 255

    fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b

    fun rgb(r: Int, g: Int, b: Int) = argb(255, r, g, b)

    fun parseColor(s: String): Int {
        if (s.startsWith("#")) {
            val n = s.drop(1).toLong(16)
            return (if (s.length == 7) n or 0xff000000L else n).toInt()
        }
        return when (s.lowercase()) {
            "black" -> BLACK
            "white" -> WHITE
            "transparent" -> 0
            "red" -> rgb(255, 0, 0)
            "green" -> rgb(0, 255, 0)
            "blue" -> rgb(0, 0, 255)
            else -> error("Cor inválida: $s")
        }
    }

    fun colorToHSV(c: Int, hsv: FloatArray) {
        java.awt.Color.RGBtoHSB(red(c), green(c), blue(c), hsv)
        hsv[0] *= 360f
    }

    fun HSVToColor(hsv: FloatArray) = java.awt.Color.HSBtoRGB(hsv[0] / 360f, hsv[1], hsv[2])

    fun HSVToColor(alpha: Int, hsv: FloatArray) = (HSVToColor(hsv) and 0xffffff) or (alpha shl 24)
}

object PorterDuff {
    enum class Mode {
        SRC_IN,
        DST_IN,
        CLEAR,
        SRC_OVER,
        SRC,
    }
}

class PorterDuffColorFilter(val color: Int, val mode: PorterDuff.Mode)

class PorterDuffXfermode(val mode: PorterDuff.Mode)

class DashPathEffect(val intervals: FloatArray, val phase: Float)

class Paint(flags: Int = 0) {
    enum class Style {
        FILL,
        STROKE,
        FILL_AND_STROKE,
    }

    enum class Cap {
        BUTT,
        ROUND,
        SQUARE,
    }

    enum class Join {
        MITER,
        ROUND,
        BEVEL,
    }

    var color = Color.BLACK
    var alpha: Int
        get() = Color.alpha(color)
        set(value) {
            color = (color and 0xffffff) or (value.coerceIn(0, 255) shl 24)
        }

    var style = Style.FILL
    var strokeWidth = 1f
    var strokeCap = Cap.BUTT
    var strokeJoin = Join.MITER
    var isAntiAlias = flags and ANTI_ALIAS_FLAG != 0
    var isFilterBitmap = flags and FILTER_BITMAP_FLAG != 0
    var colorFilter: PorterDuffColorFilter? = null
    var xfermode: PorterDuffXfermode? = null
    var pathEffect: DashPathEffect? = null
    var textSize = 12f

    companion object {
        const val ANTI_ALIAS_FLAG = 1
        const val FILTER_BITMAP_FLAG = 2
    }
}

class Canvas
private constructor(
    private val graphics: Graphics2D,
    val width: Int,
    val height: Int,
    private val target: Bitmap?,
    private val image: java.awt.image.BufferedImage?,
) {
    constructor(bitmap: Bitmap) : this(bitmap.toImage(), bitmap)

    private constructor(
        image: java.awt.image.BufferedImage,
        bitmap: Bitmap,
    ) : this(image.createGraphics(), bitmap.width, bitmap.height, bitmap, image)

    constructor(
        graphics: Graphics2D,
        width: Int,
        height: Int,
    ) : this(graphics, width, height, null, null)

    private val stack = java.util.ArrayDeque<Pair<AffineTransform, java.awt.Shape?>>()

    private fun flush() {
        if (target != null && image != null) target.replace(image)
    }

    private fun setup(p: Paint) {
        graphics.color = java.awt.Color(p.color, true)
        graphics.composite =
            when (p.xfermode?.mode) {
                PorterDuff.Mode.DST_IN -> AlphaComposite.DstIn
                PorterDuff.Mode.SRC_IN -> AlphaComposite.SrcIn
                PorterDuff.Mode.CLEAR -> AlphaComposite.Clear
                PorterDuff.Mode.SRC -> AlphaComposite.Src
                else -> AlphaComposite.SrcOver
            }
        graphics.setRenderingHint(
            RenderingHints.KEY_ANTIALIASING,
            if (p.isAntiAlias) RenderingHints.VALUE_ANTIALIAS_ON
            else RenderingHints.VALUE_ANTIALIAS_OFF,
        )
        graphics.stroke =
            BasicStroke(
                p.strokeWidth.coerceAtLeast(.01f),
                p.strokeCap.ordinal,
                p.strokeJoin.ordinal,
                10f,
                p.pathEffect?.intervals,
                p.pathEffect?.phase ?: 0f,
            )
    }

    private fun shape(s: java.awt.Shape, p: Paint) {
        setup(p)
        if (p.style != Paint.Style.STROKE) graphics.fill(s)
        if (p.style != Paint.Style.FILL) graphics.draw(s)
        flush()
    }

    fun save(): Int {
        stack.push(graphics.transform to graphics.clip)
        return stack.size
    }

    fun restore() {
        val (t, c) = stack.pop()
        graphics.transform = t
        graphics.clip = c
    }

    fun concat(m: Matrix) = graphics.transform(m.affine())

    fun clipPath(path: Path) = graphics.clip(path.shape)

    fun drawColor(c: Int) {
        graphics.color = java.awt.Color(c, true)
        graphics.fillRect(0, 0, width, height)
        flush()
    }

    fun drawRect(l: Float, t: Float, r: Float, b: Float, p: Paint) =
        shape(Rectangle2D.Float(l, t, r - l, b - t), p)

    fun drawRect(r: RectF, p: Paint) = drawRect(r.left, r.top, r.right, r.bottom, p)

    fun drawOval(r: RectF, p: Paint) =
        shape(Ellipse2D.Float(r.left, r.top, r.width(), r.height()), p)

    fun drawCircle(x: Float, y: Float, r: Float, p: Paint) =
        shape(Ellipse2D.Float(x - r, y - r, r * 2, r * 2), p)

    fun drawLine(x: Float, y: Float, x2: Float, y2: Float, p: Paint) {
        setup(p)
        graphics.draw(Line2D.Float(x, y, x2, y2))
        flush()
    }

    fun drawPath(path: Path, p: Paint) = shape(path.shape, p)

    fun drawText(text: String, x: Float, y: Float, p: Paint) {
        setup(p)
        graphics.font = java.awt.Font("SansSerif", 0, p.textSize.toInt())
        graphics.drawString(text, x, y)
        flush()
    }

    fun drawBitmap(bitmap: Bitmap, x: Float, y: Float, p: Paint?) =
        drawBitmap(bitmap, Matrix().apply { postTranslate(x, y) }, p)

    fun drawBitmap(bitmap: Bitmap, matrix: Matrix, p: Paint?) {
        val paint = p ?: Paint()
        setup(paint)
        var source = bitmap.toImage()
        paint.colorFilter?.let { filter ->
            val pixels = source.getRGB(0, 0, source.width, source.height, null, 0, source.width)
            for (i in pixels.indices) pixels[i] =
                (filter.color and 0xffffff) or
                    ((Color.alpha(pixels[i]) * Color.alpha(filter.color) / 255) shl 24)
            source =
                java.awt.image
                    .BufferedImage(
                        source.width,
                        source.height,
                        java.awt.image.BufferedImage.TYPE_INT_ARGB_PRE,
                    )
                    .also { it.setRGB(0, 0, it.width, it.height, pixels, 0, it.width) }
        }
        graphics.composite = AlphaComposite.getInstance(AlphaComposite.SRC_OVER, paint.alpha / 255f)
        graphics.setRenderingHint(
            RenderingHints.KEY_INTERPOLATION,
            if (paint.isFilterBitmap) RenderingHints.VALUE_INTERPOLATION_BILINEAR
            else RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR,
        )
        if (matrix.isPerspective()) drawPerspective(source, matrix, paint.isFilterBitmap)
        else graphics.drawImage(source, matrix.affine(), null)
        flush()
    }

    private fun drawPerspective(
        source: java.awt.image.BufferedImage,
        matrix: Matrix,
        filter: Boolean,
    ) {
        val corners =
            floatArrayOf(
                0f,
                0f,
                source.width.toFloat(),
                0f,
                source.width.toFloat(),
                source.height.toFloat(),
                0f,
                source.height.toFloat(),
            )
        matrix.mapPoints(corners)
        if (corners.any { !it.isFinite() }) return
        val clip = graphics.clipBounds ?: java.awt.Rectangle(0, 0, width, height)
        val left =
            maxOf(
                clip.x,
                kotlin.math
                    .floor(listOf(corners[0], corners[2], corners[4], corners[6]).min())
                    .toInt(),
            )
        val top =
            maxOf(
                clip.y,
                kotlin.math
                    .floor(listOf(corners[1], corners[3], corners[5], corners[7]).min())
                    .toInt(),
            )
        val right =
            minOf(
                clip.x + clip.width,
                kotlin.math
                    .ceil(listOf(corners[0], corners[2], corners[4], corners[6]).max())
                    .toInt(),
            )
        val bottom =
            minOf(
                clip.y + clip.height,
                kotlin.math
                    .ceil(listOf(corners[1], corners[3], corners[5], corners[7]).max())
                    .toInt(),
            )
        if (right <= left || bottom <= top) return
        val inverse = Matrix()
        if (!matrix.invert(inverse)) return
        val warped =
            java.awt.image.BufferedImage(
                right - left,
                bottom - top,
                java.awt.image.BufferedImage.TYPE_INT_ARGB,
            )
        val point = FloatArray(2)
        fun sample(x: Int, y: Int) =
            if (x in 0 until source.width && y in 0 until source.height) source.getRGB(x, y) else 0
        for (y in top until bottom) for (x in left until right) {
            point[0] = x + .5f
            point[1] = y + .5f
            inverse.mapPoints(point)
            if (!point[0].isFinite() || !point[1].isFinite()) continue
            val color =
                if (!filter)
                    sample(kotlin.math.floor(point[0]).toInt(), kotlin.math.floor(point[1]).toInt())
                else {
                    val sx = point[0] - .5f
                    val sy = point[1] - .5f
                    val ix = kotlin.math.floor(sx).toInt()
                    val iy = kotlin.math.floor(sy).toInt()
                    val fx = sx - ix
                    val fy = sy - iy
                    val colors =
                        intArrayOf(
                            sample(ix, iy),
                            sample(ix + 1, iy),
                            sample(ix, iy + 1),
                            sample(ix + 1, iy + 1),
                        )
                    val weights =
                        floatArrayOf((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
                    var alpha = 0f
                    var red = 0f
                    var green = 0f
                    var blue = 0f
                    for (i in 0..3) {
                        val a = Color.alpha(colors[i]) * weights[i]
                        alpha += a
                        red += Color.red(colors[i]) * a
                        green += Color.green(colors[i]) * a
                        blue += Color.blue(colors[i]) * a
                    }
                    if (alpha <= 0f) 0
                    else
                        Color.argb(
                            alpha.toInt().coerceIn(0, 255),
                            (red / alpha).toInt().coerceIn(0, 255),
                            (green / alpha).toInt().coerceIn(0, 255),
                            (blue / alpha).toInt().coerceIn(0, 255),
                        )
                }
            warped.setRGB(x - left, y - top, color)
        }
        graphics.drawImage(warped, left, top, null)
    }

    fun drawBitmap(bitmap: Bitmap, src: Rect?, dst: RectF, p: Paint?) {
        val s = src ?: Rect(0, 0, bitmap.width, bitmap.height)
        val cropped = Bitmap.createBitmap(bitmap, s.left, s.top, s.width(), s.height())
        drawBitmap(
            cropped,
            Matrix().apply {
                postScale(dst.width() / s.width(), dst.height() / s.height())
                postTranslate(dst.left, dst.top)
            },
            p,
        )
    }
}

fun drawComposeText(
    canvas: org.jetbrains.skia.Canvas,
    text: String,
    x: Float,
    y: Float,
    paint: Paint,
) {
    org.jetbrains.skia.Paint().use { p ->
        p.color = paint.color
        org.jetbrains.skia.Font(null, paint.textSize).use { font ->
            canvas.drawString(text, x, y, font, p)
        }
    }
}
