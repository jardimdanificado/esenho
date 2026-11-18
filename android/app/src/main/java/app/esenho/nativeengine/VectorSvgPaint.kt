package app.esenho.nativeengine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import kotlin.math.roundToInt

/** SVG solid paints remain editable; applying a raster brush replaces this contour style. */
internal object VectorSvgPaint {
    fun draw(obj: VectorObject, bitmap: Bitmap) {
        bitmap.eraseColor(0)
        val canvas = Canvas(bitmap)
        val path = obj.path()
        obj.fill?.let { color ->
            canvas.drawPath(
                path,
                Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    this.color = color
                    style = Paint.Style.FILL
                },
            )
        }
        val s = obj.style
        if (s.optBoolean("strokeEnabled", true)) {
            val color = s.optInt("color", 0xff000000.toInt())
            val opacity = s.optDouble("opacity", 1.0).coerceIn(0.0, 1.0)
            val paint =
                Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    this.color =
                        (color and 0xffffff) or (((color ushr 24) * opacity).roundToInt() shl 24)
                    style = Paint.Style.STROKE
                    strokeWidth = s.optDouble("size", 1.0).toFloat()
                    strokeCap =
                        when (s.optString("cap")) {
                            "round" -> Paint.Cap.ROUND
                            "square" -> Paint.Cap.SQUARE
                            else -> Paint.Cap.BUTT
                        }
                    strokeJoin =
                        when (s.optString("join")) {
                            "round" -> Paint.Join.ROUND
                            "bevel" -> Paint.Join.BEVEL
                            else -> Paint.Join.MITER
                        }
                    strokeMiter = s.optDouble("miter", 4.0).toFloat()
                    val a = s.optJSONArray("dash")
                    if (a != null && a.length() > 0) {
                        var intervals = FloatArray(a.length()) { a.getDouble(it).toFloat() }
                        if (intervals.size % 2 == 1) intervals += intervals
                        if (intervals.any { it > 0 })
                            pathEffect =
                                DashPathEffect(intervals, s.optDouble("dashOffset", 0.0).toFloat())
                    }
                }
            canvas.drawPath(path, paint)
        }
        val opacity = s.optDouble("svgOpacity", 1.0).coerceIn(0.0, 1.0)
        if (opacity < 1) {
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            pixels.indices.forEach { i ->
                pixels[i] =
                    (pixels[i] and 0xffffff) or
                        (((pixels[i] ushr 24) * opacity).roundToInt() shl 24)
            }
            bitmap.setPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        }
    }
}
