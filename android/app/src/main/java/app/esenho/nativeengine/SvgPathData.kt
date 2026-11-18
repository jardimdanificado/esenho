package app.esenho.nativeengine

import kotlin.math.*

/** SVG path grammar, retaining cubic handles; quadratics and elliptical arcs become cubics. */
internal class SvgPathData(private val data: String) {
    private var cursor = 0
    private var nodeCount = 0
    private var x = 0.0
    private var y = 0.0
    private var previous = ' '
    private var quadX = 0.0
    private var quadY = 0.0
    private var contour: VectorContour? = null
    private val contours = mutableListOf<VectorContour>()
    private val numeric = Regex("[-+]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][-+]?[0-9]+)?")

    private fun skip() {
        while (
            cursor < data.length && (data[cursor].isWhitespace() || data[cursor] == ',')
        ) cursor++
    }

    private fun number(): Double {
        skip()
        val m =
            numeric.find(data, cursor)?.takeIf { it.range.first == cursor }
                ?: error("Número inválido no caminho SVG, posição $cursor.")
        cursor = m.range.last + 1
        return m.value.toDouble().also {
            require(it.isFinite() && abs(it) <= 1e7) {
                "Coordenada SVG fora do intervalo suportado."
            }
        }
    }

    private fun flag(): Boolean {
        skip()
        require(cursor < data.length && data[cursor] in "01") { "Flag de arco SVG inválida." }
        return data[cursor++] == '1'
    }

    private fun node(): VectorNode =
        contour?.nodes?.lastOrNull() ?: error("O caminho SVG precisa começar com M.")

    private fun move(px: Double, py: Double) {
        nodeCount++
        contour =
            VectorContour(mutableListOf(VectorNode(px.toFloat(), py.toFloat(), 1f)), false).also {
                contours.add(it)
            }
        x = px
        y = py
    }

    private fun resume() {
        if (contour?.closed == true) move(x, y)
    }

    private fun line(px: Double, py: Double) {
        nodeCount++
        resume()
        node()
        contour!!.nodes.add(VectorNode(px.toFloat(), py.toFloat(), 1f))
        x = px
        y = py
    }

    private fun cubic(ax: Double, ay: Double, bx: Double, by: Double, px: Double, py: Double) {
        nodeCount++
        resume()
        val a = node()
        a.outX = ax.toFloat()
        a.outY = ay.toFloat()
        contour!!
            .nodes
            .add(VectorNode(px.toFloat(), py.toFloat(), 1f, inX = bx.toFloat(), inY = by.toFloat()))
        x = px
        y = py
    }

    fun parse(): MutableList<VectorContour> {
        var command = ' '
        while (true) {
            skip()
            if (cursor == data.length) break
            if (data[cursor].isLetter()) command = data[cursor++]
            else
                require(command != ' ' && command.uppercaseChar() != 'Z') { "Comando SVG ausente." }
            val relative = command.isLowerCase()
            val ox = if (relative) x else 0.0
            val oy = if (relative) y else 0.0
            when (command.uppercaseChar()) {
                'M' -> {
                    val a = number()
                    val b = number()
                    move(a + ox, b + oy)
                    command = if (relative) 'l' else 'L'
                }
                'L' -> {
                    val a = number()
                    val b = number()
                    line(a + ox, b + oy)
                }
                'H' -> line(number() + ox, y)
                'V' -> line(x, number() + oy)
                'C' -> {
                    val a = number()
                    val b = number()
                    val c = number()
                    val d = number()
                    val e = number()
                    val f = number()
                    cubic(a + ox, b + oy, c + ox, d + oy, e + ox, f + oy)
                }
                'S' -> {
                    val n = node()
                    val ax = if (previous.uppercaseChar() in "CS") 2 * x - n.inX else x
                    val ay = if (previous.uppercaseChar() in "CS") 2 * y - n.inY else y
                    val c = number()
                    val d = number()
                    val e = number()
                    val f = number()
                    cubic(ax, ay, c + ox, d + oy, e + ox, f + oy)
                }
                'Q',
                'T' -> {
                    val ax: Double
                    val ay: Double
                    if (command.uppercaseChar() == 'Q') {
                        ax = number() + ox
                        ay = number() + oy
                    } else {
                        ax = if (previous.uppercaseChar() in "QT") 2 * x - quadX else x
                        ay = if (previous.uppercaseChar() in "QT") 2 * y - quadY else y
                    }
                    val px = number() + ox
                    val py = number() + oy
                    cubic(
                        x + (ax - x) * 2 / 3,
                        y + (ay - y) * 2 / 3,
                        px + (ax - px) * 2 / 3,
                        py + (ay - py) * 2 / 3,
                        px,
                        py,
                    )
                    quadX = ax
                    quadY = ay
                }
                'A' -> {
                    val rx = number()
                    val ry = number()
                    val angle = number()
                    val large = flag()
                    val sweep = flag()
                    val px = number() + ox
                    val py = number() + oy
                    arc(rx, ry, angle, large, sweep, px, py)
                }
                'Z' -> {
                    val c = contour ?: error("Fechamento SVG sem caminho.")
                    c.closed = true
                    x = c.nodes.first().x.toDouble()
                    y = c.nodes.first().y.toDouble()
                }
                else -> error("Comando SVG não suportado: $command")
            }
            previous = if (previous == ' ' && command.uppercaseChar() == 'L') 'M' else command
            require(nodeCount <= 200000) { "SVG contém nós demais." }
        }
        return contours
    }

    // Endpoint-to-center conversion follows SVG 2, appendix B.2.
    private fun arc(
        rxInput: Double,
        ryInput: Double,
        angle: Double,
        large: Boolean,
        sweep: Boolean,
        px: Double,
        py: Double,
    ) {
        node()
        if (x == px && y == py) return
        var rx = abs(rxInput)
        var ry = abs(ryInput)
        if (rx == 0.0 || ry == 0.0) {
            line(px, py)
            return
        }
        val phi = angle % 360 * PI / 180
        val c = cos(phi)
        val s = sin(phi)
        val xp = c * (x - px) / 2 + s * (y - py) / 2
        val yp = -s * (x - px) / 2 + c * (y - py) / 2
        val correction = xp * xp / (rx * rx) + yp * yp / (ry * ry)
        if (correction > 1) {
            val scale = sqrt(correction)
            rx *= scale
            ry *= scale
        }
        val factor =
            (if (large == sweep) -1 else 1) *
                sqrt(
                    max(
                        0.0,
                        (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) /
                            (rx * rx * yp * yp + ry * ry * xp * xp),
                    )
                )
        val cxp = factor * rx * yp / ry
        val cyp = -factor * ry * xp / rx
        val cx = c * cxp - s * cyp + (x + px) / 2
        val cy = s * cxp + c * cyp + (y + py) / 2
        val ux = (xp - cxp) / rx
        val uy = (yp - cyp) / ry
        val vx = (-xp - cxp) / rx
        val vy = (-yp - cyp) / ry
        var start = atan2(uy, ux)
        var delta = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        if (!sweep && delta > 0) delta -= 2 * PI
        if (sweep && delta < 0) delta += 2 * PI
        val count = ceil(abs(delta) / (PI / 4)).toInt().coerceAtLeast(1)
        val step = delta / count
        fun point(t: Double) =
            (cx + rx * c * cos(t) - ry * s * sin(t)) to (cy + rx * s * cos(t) + ry * c * sin(t))
        fun tangent(t: Double) =
            (-rx * c * sin(t) - ry * s * cos(t)) to (-rx * s * sin(t) + ry * c * cos(t))
        repeat(count) { i ->
            val end = start + step
            val k = 4.0 / 3 * tan(step / 4)
            val a = point(start)
            val b = point(end)
            val da = tangent(start)
            val db = tangent(end)
            cubic(
                a.first + k * da.first,
                a.second + k * da.second,
                b.first - k * db.first,
                b.second - k * db.second,
                if (i == count - 1) px else b.first,
                if (i == count - 1) py else b.second,
            )
            start = end
        }
    }
}
