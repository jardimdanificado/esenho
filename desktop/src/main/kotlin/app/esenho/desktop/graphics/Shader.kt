package app.esenho.desktop.graphics

import java.awt.Color as AwtColor
import java.awt.LinearGradientPaint
import java.awt.MultipleGradientPaint
import java.awt.Paint as AwtPaint
import java.awt.RadialGradientPaint

/** Android Shader subset backed by java.awt gradient paints. */
abstract class Shader {
    enum class TileMode {
        CLAMP,
        REPEAT,
        MIRROR,
    }

    internal abstract fun awtPaint(): AwtPaint?

    protected fun fractions(positions: FloatArray?, count: Int): FloatArray {
        if (positions == null || positions.size != count || count < 2) {
            return FloatArray(count) { i -> if (count <= 1) 0f else i / (count - 1f) }
        }
        val result = FloatArray(count)
        var previous = -1f
        for (i in 0 until count) {
            var value = positions[i].coerceIn(0f, 1f)
            if (value <= previous) value = (previous + .0001f).coerceAtMost(1f)
            result[i] = value
            previous = value
        }
        if (result[count - 1] >= 1f && result.any { it < 1f }) {
            val scale = 1f / result[count - 1].coerceAtLeast(.0001f)
            for (i in 0 until count) result[i] = (result[i] * scale).coerceIn(0f, 1f)
        }
        return result
    }

    protected fun toAwtColors(values: IntArray, count: Int) =
        Array(count) { i ->
            val c = if (values.isEmpty()) 0 else values[i.coerceAtMost(values.lastIndex)]
            AwtColor(c, true)
        }

    protected fun cycle(mode: TileMode) =
        when (mode) {
            TileMode.REPEAT -> MultipleGradientPaint.CycleMethod.REPEAT
            TileMode.MIRROR -> MultipleGradientPaint.CycleMethod.REFLECT
            else -> MultipleGradientPaint.CycleMethod.NO_CYCLE
        }
}

class LinearGradient(
    private val x0: Float,
    private val y0: Float,
    private val x1: Float,
    private val y1: Float,
    colors: IntArray,
    positions: FloatArray?,
    private val tile: TileMode = TileMode.CLAMP,
) : Shader() {
    private val colors = colors
    private val positions = positions

    override fun awtPaint(): AwtPaint? {
        if (colors.isEmpty()) return null
        if (colors.size == 1) return AwtColor(colors[0], true)
        val fractions = fractions(positions, colors.size)
        return LinearGradientPaint(x0, y0, x1, y1, fractions, toAwtColors(colors, colors.size), cycle(tile))
    }
}

class RadialGradient(
    private val cx: Float,
    private val cy: Float,
    private val radius: Float,
    colors: IntArray,
    positions: FloatArray?,
    private val tile: TileMode = TileMode.CLAMP,
) : Shader() {
    private val colors = colors
    private val positions = positions

    override fun awtPaint(): AwtPaint? {
        if (colors.isEmpty() || radius <= 0f) return null
        if (colors.size == 1) return AwtColor(colors[0], true)
        val fractions = fractions(positions, colors.size)
        return RadialGradientPaint(
            cx,
            cy,
            radius,
            cx,
            cy,
            fractions,
            toAwtColors(colors, colors.size),
            cycle(tile),
        )
    }
}
