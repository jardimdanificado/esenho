package app.esenho.desktop.graphics

import java.awt.Font
import java.awt.font.FontRenderContext
import java.awt.geom.PathIterator

/** JVM side of the shared vector text API used by generated nativeengine sources. */
object VectorFont {
    private fun context() = FontRenderContext(null, true, true)

    private fun familyName(family: String) =
        when (family.lowercase()) {
            "serif" -> "Serif"
            "monospace" -> "Monospaced"
            else -> "SansSerif"
        }

    private fun awt(family: String, size: Float, weight: String, style: String): Font {
        val faceStyle =
            when {
                weight.equals("bold", true) && style.equals("italic", true) -> Font.BOLD or Font.ITALIC
                weight.equals("bold", true) -> Font.BOLD
                style.equals("italic", true) -> Font.ITALIC
                else -> Font.PLAIN
            }
        return Font(familyName(family), faceStyle, size.toInt().coerceAtLeast(1))
    }

    fun apply(paint: Paint, family: String, weight: String = "normal", style: String = "normal") {
        paint.typeface = familyName(family)
        paint.bold = weight.equals("bold", true)
        paint.italic = style.equals("italic", true)
    }

    fun measure(
        text: String,
        size: Float,
        family: String,
        weight: String = "normal",
        style: String = "normal",
    ): Float {
        if (text.isEmpty()) return 0f
        return awt(family, size, weight, style).getStringBounds(text, context()).width.toFloat()
    }

    fun outline(
        text: String,
        size: Float,
        family: String,
        weight: String = "normal",
        style: String = "normal",
    ): List<List<Pair<Float, Float>>> {
        if (text.isEmpty()) return emptyList()
        val shape = awt(family, size, weight, style).createGlyphVector(context(), text).outline
        val iterator = shape.getPathIterator(null)
        val coords = DoubleArray(6)
        val result = mutableListOf<List<Pair<Float, Float>>>()
        var contour = mutableListOf<Pair<Float, Float>>()
        while (!iterator.isDone) {
            when (iterator.currentSegment(coords)) {
                PathIterator.SEG_MOVETO -> {
                    if (contour.size > 2) result += contour
                    contour = mutableListOf(coords[0].toFloat() to coords[1].toFloat())
                }
                PathIterator.SEG_LINETO ->
                    contour += coords[0].toFloat() to coords[1].toFloat()
                PathIterator.SEG_QUADTO ->
                    contour += coords[2].toFloat() to coords[3].toFloat()
                PathIterator.SEG_CUBICTO ->
                    contour += coords[4].toFloat() to coords[5].toFloat()
            }
            iterator.next()
        }
        if (contour.size > 2) result += contour
        return result
    }
}
