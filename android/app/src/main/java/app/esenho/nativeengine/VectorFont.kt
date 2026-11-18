package app.esenho.nativeengine

import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface

/** Android side of the shared vector text API; desktop supplies the same signatures. */
object VectorFont {
    fun apply(paint: Paint, family: String, weight: String = "normal", style: String = "normal") {
        val face =
            when (family.lowercase()) {
                "serif" -> Typeface.SERIF
                "monospace" -> Typeface.MONOSPACE
                else -> Typeface.SANS_SERIF
            }
        val faceStyle =
            when {
                weight.equals("bold", true) && style.equals("italic", true) ->
                    Typeface.BOLD_ITALIC
                weight.equals("bold", true) -> Typeface.BOLD
                style.equals("italic", true) -> Typeface.ITALIC
                else -> Typeface.NORMAL
            }
        paint.typeface = Typeface.create(face, faceStyle)
    }

    fun measure(text: String, size: Float, family: String, weight: String = "normal", style: String = "normal"): Float {
        if (text.isEmpty()) return 0f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size.coerceAtLeast(1f)
            apply(this, family, weight, style)
        }
        return paint.measureText(text)
    }

    /** Glyph outlines as closed contours, flattened with the native path API. */
    fun outline(
        text: String,
        size: Float,
        family: String,
        weight: String = "normal",
        style: String = "normal",
    ): List<List<Pair<Float, Float>>> {
        if (text.isEmpty()) return emptyList()
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size.coerceAtLeast(1f)
            apply(this, family, weight, style)
        }
        val path = Path()
        paint.getTextPath(text, 0, text.length, 0f, 0f, path)
        val points = path.approximate(.25f)
        val result = mutableListOf<List<Pair<Float, Float>>>()
        var contour = mutableListOf<Pair<Float, Float>>()
        var i = 0
        while (i + 2 < points.size) {
            val x = points[i]
            val y = points[i + 1]
            val progress = points[i + 2]
            if (progress < 0f) {
                if (contour.size > 2) result += contour
                contour = mutableListOf()
            }
            contour += x to y
            i += 3
        }
        if (contour.size > 2) result += contour
        return result
    }
}
