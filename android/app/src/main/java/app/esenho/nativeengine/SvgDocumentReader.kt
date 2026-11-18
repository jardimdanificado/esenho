package app.esenho.nativeengine

import android.graphics.Color
import kotlin.math.*
import org.json.JSONArray
import org.json.JSONObject
import org.w3c.dom.Element

/** A strict editable SVG subset. Unsupported paint/compositing never silently drops artwork. */
internal class SvgDocumentReader(private val root: Element) {
    private val objects = mutableListOf<VectorObject>()
    private val ids = mutableMapOf<String, Element>()
    private var viewportWidth = 300.0
    private var viewportHeight = 150.0
    private val number = Regex("[-+]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][-+]?[0-9]+)?")

    private data class Affine(
        val a: Double = 1.0,
        val b: Double = 0.0,
        val c: Double = 0.0,
        val d: Double = 1.0,
        val e: Double = 0.0,
        val f: Double = 0.0,
    ) {
        operator fun times(o: Affine) =
            Affine(
                a * o.a + c * o.b,
                b * o.a + d * o.b,
                a * o.c + c * o.d,
                b * o.c + d * o.d,
                a * o.e + c * o.f + e,
                b * o.e + d * o.f + f,
            )

        fun point(x: Float, y: Float) =
            (a * x + c * y + e).toFloat() to (b * x + d * y + f).toFloat()

        fun strokeScale(): Double {
            val sx = hypot(a, b)
            val sy = hypot(c, d)
            require(
                abs(sx - sy) < 1e-5 * max(1.0, max(sx, sy)) &&
                    abs(a * c + b * d) < 1e-5 * max(1.0, sx * sy)
            ) {
                "SVG: contorno com escala não uniforme ou inclinação ainda não é suportado. Converta o contorno em caminho."
            }
            return sx
        }
    }

    private fun elements(e: Element) =
        (0 until e.childNodes.length).mapNotNull { e.childNodes.item(it) as? Element }

    private fun fail(message: String): Nothing = error("SVG: $message")

    private fun numbers(value: String): List<Double> {
        val matches = number.findAll(value).toList()
        var last = 0
        matches.forEach {
            require(
                value.substring(last, it.range.first).all { c -> c.isWhitespace() || c == ',' }
            ) {
                "Lista numérica SVG inválida."
            }
            last = it.range.last + 1
        }
        require(value.substring(last).all { it.isWhitespace() || it == ',' }) {
            "Lista numérica SVG inválida."
        }
        return matches.map {
            it.value.toDouble().also { n ->
                require(n.isFinite() && abs(n) <= 1e7) { "Valor SVG fora do intervalo suportado." }
            }
        }
    }

    private fun length(value: String, reference: Double): Double {
        val v = value.trim()
        val m =
            number.find(v)?.takeIf { it.range.first == 0 } ?: fail("Comprimento inválido: $value")
        val n = m.value.toDouble()
        require(n.isFinite()) { "Comprimento SVG inválido." }
        val scale =
            when (v.substring(m.range.last + 1).trim()) {
                "",
                "px" -> 1.0
                "%" -> reference / 100
                "in" -> 96.0
                "cm" -> 96 / 2.54
                "mm" -> 96 / 25.4
                "pt" -> 96 / 72.0
                "pc" -> 16.0
                else -> fail("Unidade não suportada em $value")
            }
        return n * scale
    }

    private fun transform(value: String): Affine {
        var result = Affine()
        var cursor = 0
        val commands = Regex("([A-Za-z]+)\\s*\\(([^)]*)\\)")
        commands.findAll(value).forEach { m ->
            require(value.substring(cursor, m.range.first).all { it.isWhitespace() || it == ',' }) {
                "Transformação SVG inválida."
            }
            cursor = m.range.last + 1
            val n = numbers(m.groupValues[2])
            val t =
                when (m.groupValues[1]) {
                    "matrix" -> {
                        require(n.size == 6)
                        Affine(n[0], n[1], n[2], n[3], n[4], n[5])
                    }
                    "translate" -> {
                        require(n.size in 1..2)
                        Affine(e = n[0], f = n.getOrElse(1) { 0.0 })
                    }
                    "scale" -> {
                        require(n.size in 1..2)
                        Affine(a = n[0], d = n.getOrElse(1) { n[0] })
                    }
                    "rotate" -> {
                        require(n.size == 1 || n.size == 3)
                        val r = n[0] * PI / 180
                        val rot = Affine(cos(r), sin(r), -sin(r), cos(r))
                        if (n.size == 1) rot
                        else Affine(e = n[1], f = n[2]) * rot * Affine(e = -n[1], f = -n[2])
                    }
                    "skewX" -> {
                        require(n.size == 1)
                        Affine(c = tan(n[0] * PI / 180))
                    }
                    "skewY" -> {
                        require(n.size == 1)
                        Affine(b = tan(n[0] * PI / 180))
                    }
                    else -> fail("Transformação não suportada: ${m.groupValues[1]}")
                }
            result = result * t
        }
        require(value.substring(cursor).all { it.isWhitespace() || it == ',' }) {
            "Transformação SVG inválida."
        }
        return result
    }

    private fun viewBox(): Affine {
        val box = root.getAttribute("viewBox").takeIf { it.isNotBlank() }?.let(::numbers)
        if (box != null)
            require(box.size == 4 && box[2] > 0 && box[3] > 0) { "viewBox SVG inválido." }
        viewportWidth =
            root
                .getAttribute("width")
                .takeIf { it.isNotBlank() }
                ?.let { length(it, box?.get(2) ?: 300.0) } ?: box?.get(2) ?: 300.0
        viewportHeight =
            root
                .getAttribute("height")
                .takeIf { it.isNotBlank() }
                ?.let { length(it, box?.get(3) ?: 150.0) } ?: box?.get(3) ?: 150.0
        require(
            viewportWidth > 0 &&
                viewportHeight > 0 &&
                viewportWidth.isFinite() &&
                viewportHeight.isFinite()
        ) {
            "Dimensões SVG inválidas."
        }
        if (box == null) return Affine()
        var sx = viewportWidth / box[2]
        var sy = viewportHeight / box[3]
        val preserve =
            root
                .getAttribute("preserveAspectRatio")
                .trim()
                .ifEmpty { "xMidYMid meet" }
                .split(Regex("\\s+"))
        var tx = 0.0
        var ty = 0.0
        if (preserve[0] != "none") {
            require(
                preserve[0] in
                    listOf(
                        "xMinYMin",
                        "xMidYMin",
                        "xMaxYMin",
                        "xMinYMid",
                        "xMidYMid",
                        "xMaxYMid",
                        "xMinYMax",
                        "xMidYMax",
                        "xMaxYMax",
                    )
            ) {
                "preserveAspectRatio SVG inválido."
            }
            require(preserve.getOrElse(1) { "meet" } == "meet") {
                "SVG: preserveAspectRatio slice ainda não é suportado."
            }
            val scale = min(sx, sy)
            sx = scale
            sy = scale
            tx =
                (viewportWidth - box[2] * scale) *
                    (if (preserve[0].startsWith("xMin")) 0.0
                    else if (preserve[0].startsWith("xMax")) 1.0 else .5)
            ty =
                (viewportHeight - box[3] * scale) *
                    (if (preserve[0].endsWith("YMin")) 0.0
                    else if (preserve[0].endsWith("YMax")) 1.0 else .5)
        }
        // Percentages on geometry are measured in the current SVG user coordinate system.
        viewportWidth = box[2]
        viewportHeight = box[3]
        return Affine(a = sx, d = sy, e = tx - box[0] * sx, f = ty - box[1] * sy)
    }

    fun read(): List<VectorObject> {
        fun index(e: Element) {
            e.getAttribute("id").takeIf { it.isNotEmpty() }?.let { ids[it] = e }
            elements(e).forEach(::index)
        }
        index(root)
        val document = root.ownerDocument
        require(
            (0 until document.childNodes.length).none {
                document.childNodes.item(it).nodeName == "xml-stylesheet"
            }
        ) {
            "SVG: folhas de estilo externas ainda não são suportadas."
        }
        require(root.getElementsByTagNameNS("*", "style").length == 0) {
            "SVG: folhas CSS ainda não são suportadas. Use atributos ou style inline."
        }
        val base = viewBox()
        visit(
            root,
            mapOf("fill" to "black", "stroke" to "none", "color" to "black"),
            base,
            null,
            emptySet(),
            true,
        )
        require(objects.isNotEmpty()) { "SVG não contém formas editáveis visíveis." }
        return objects
    }

    private val inherited =
        setOf(
            "fill",
            "stroke",
            "color",
            "fill-rule",
            "fill-opacity",
            "stroke-opacity",
            "stroke-width",
            "stroke-linecap",
            "stroke-linejoin",
            "stroke-miterlimit",
            "stroke-dasharray",
            "stroke-dashoffset",
            "visibility",
            "marker-start",
            "marker-mid",
            "marker-end",
        )

    private fun properties(e: Element, parent: Map<String, String>): Map<String, String> {
        val result = parent.filterKeys { it in inherited }.toMutableMap()
        val supported =
            inherited +
                setOf(
                    "opacity",
                    "display",
                    "clip-path",
                    "mask",
                    "filter",
                    "vector-effect",
                    "paint-order",
                    "mix-blend-mode",
                )
        supported.forEach { key -> if (e.hasAttribute(key)) result[key] = e.getAttribute(key) }
        e.getAttribute("style")
            .split(';')
            .filter { it.isNotBlank() }
            .forEach {
                val parts = it.split(':', limit = 2)
                require(parts.size == 2) { "Estilo SVG inválido." }
                val key = parts[0].trim()
                val value = parts[1].trim()
                if (key !in supported) fail("Propriedade de estilo não suportada: $key")
                result[key] = value
            }
        result.entries.toList().forEach { (key, value) ->
            if (value == "inherit") {
                parent[key]?.let { result[key] = it } ?: result.remove(key)
            }
        }
        return result
    }

    private fun opacity(value: String?): Double =
        (value?.let { length(it, 1.0) } ?: 1.0).coerceIn(0.0, 1.0)

    private fun paint(value: String?, alpha: Double, current: String): Int? {
        val v = (value ?: "none").trim()
        if (v == "none") return null
        if (v == "currentColor") return paint(current, alpha, "black")
        if (v.startsWith("url("))
            fail("Gradientes e padrões de preenchimento ainda não são suportados.")
        val basic =
            mapOf(
                "black" to 0x000000,
                "silver" to 0xc0c0c0,
                "gray" to 0x808080,
                "white" to 0xffffff,
                "maroon" to 0x800000,
                "red" to 0xff0000,
                "purple" to 0x800080,
                "fuchsia" to 0xff00ff,
                "green" to 0x008000,
                "lime" to 0x00ff00,
                "olive" to 0x808000,
                "yellow" to 0xffff00,
                "navy" to 0x000080,
                "blue" to 0x0000ff,
                "teal" to 0x008080,
                "aqua" to 0x00ffff,
                "orange" to 0xffa500,
            )
        val color =
            when {
                v.equals("transparent", true) -> 0
                basic.containsKey(v.lowercase()) ->
                    basic.getValue(v.lowercase()) or 0xff000000.toInt()
                v.startsWith("#") -> {
                    val h = v.drop(1)
                    when (h.length) {
                        3 -> ("ff" + h.map { "$it$it" }.joinToString("")).toLong(16).toInt()
                        4 ->
                            (h.takeLast(1).repeat(2) + h.take(3).map { "$it$it" }.joinToString(""))
                                .toLong(16)
                                .toInt()
                        6 -> h.toLong(16).toInt() or 0xff000000.toInt()
                        8 -> ((h.takeLast(2) + h.take(6)).toLong(16)).toInt()
                        else -> fail("Cor inválida: $v")
                    }
                }
                v.startsWith("rgb(") || v.startsWith("rgba(") -> {
                    val values =
                        v.substringAfter('(').substringBefore(')').split(Regex("[,\\s/]+")).filter {
                            it.isNotEmpty()
                        }
                    require(values.size in 3..4) { "Cor SVG inválida: $v" }
                    val rgb = values.take(3).map { length(it, 255.0).roundToInt().coerceIn(0, 255) }
                    Color.argb(
                        (opacity(values.getOrNull(3)) * 255).roundToInt(),
                        rgb[0],
                        rgb[1],
                        rgb[2],
                    )
                }
                else ->
                    runCatching { Color.parseColor(v) }.getOrElse { fail("Cor não suportada: $v") }
            }
        return (color and 0xffffff) or
            (((color ushr 24) * alpha).roundToInt().coerceIn(0, 255) shl 24)
    }

    private fun visit(
        e: Element,
        parent: Map<String, String>,
        matrix: Affine,
        group: String?,
        stack: Set<String>,
        isRoot: Boolean = false,
    ) {
        val tag = e.localName ?: e.tagName
        require(e.namespaceURI.isNullOrEmpty() || e.namespaceURI == "http://www.w3.org/2000/svg") {
            "Namespace SVG não suportado."
        }
        if (tag in setOf("metadata", "title", "desc", "defs")) return
        val p = properties(e, parent)
        if (p["display"] == "none") return
        listOf("clip-path", "mask", "filter", "marker-start", "marker-mid", "marker-end").forEach {
            if (p[it] != null && p[it] != "none") fail("$it ainda não é suportado.")
        }
        if (p["vector-effect"]?.let { it != "none" } == true)
            fail("vector-effect ainda não é suportado.")
        if (p["paint-order"]?.let { it != "normal" && it != "fill stroke markers" } == true)
            fail("paint-order personalizado ainda não é suportado.")
        if (p["mix-blend-mode"]?.let { it != "normal" } == true)
            fail("Modo de mistura SVG ainda não é suportado.")
        val m = matrix * transform(e.getAttribute("transform"))
        if (tag == "svg" && !isRoot) fail("Viewports SVG aninhados ainda não são suportados.")
        if (tag == "g" || isRoot) {
            if (opacity(p["opacity"]) != 1.0)
                fail("Opacidade de grupo ainda não é suportada. Aplique a opacidade aos objetos.")
            val id = if (tag == "g") group ?: java.util.UUID.randomUUID().toString() else group
            elements(e).forEach { visit(it, p, m, id, stack) }
            return
        }
        if (tag == "use") {
            val ref =
                e.getAttribute("href").ifEmpty {
                    e.getAttributeNS("http://www.w3.org/1999/xlink", "href")
                }
            require(ref.startsWith("#") && ref.length > 1) {
                "SVG: use aceita apenas referências internas."
            }
            require(ref !in stack && stack.size < 32) {
                "Referência SVG circular ou profunda demais."
            }
            if (opacity(p["opacity"]) != 1.0) fail("Opacidade em use ainda não é suportada.")
            val target = ids[ref.drop(1)] ?: fail("Referência não encontrada: $ref")
            visit(
                target,
                p,
                m * Affine(e = attr(e, "x", viewportWidth), f = attr(e, "y", viewportHeight)),
                group,
                stack + ref,
            )
            return
        }
        if (p["visibility"] in setOf("hidden", "collapse")) return
        if (e.hasAttribute("pathLength")) fail("pathLength ainda não é suportado.")
        val contours = shape(e, tag)
        if (contours.isEmpty()) return
        val stroke = paint(p["stroke"], opacity(p["stroke-opacity"]), p["color"] ?: "black")
        val fill = paint(p["fill"], opacity(p["fill-opacity"]), p["color"] ?: "black")
        val width =
            length(p["stroke-width"] ?: "1", hypot(viewportWidth, viewportHeight) / sqrt(2.0))
        require(width >= 0) { "Espessura SVG negativa." }
        val scale = if (stroke != null && width > 0) m.strokeScale() else 1.0
        require((width * scale).isFinite() && width * scale <= 1e7) {
            "Espessura SVG fora do intervalo suportado."
        }
        contours
            .flatMap { it.nodes }
            .forEach { n ->
                val a = m.point(n.x, n.y)
                val b = m.point(n.inX, n.inY)
                val c = m.point(n.outX, n.outY)
                n.x = a.first
                n.y = a.second
                n.inX = b.first
                n.inY = b.second
                n.outX = c.first
                n.outY = c.second
                require(
                    listOf(n.x, n.y, n.inX, n.inY, n.outX, n.outY).all {
                        it.isFinite() && abs(it) <= 1e7
                    }
                ) {
                    "Coordenada SVG fora do intervalo suportado."
                }
            }
        val cap = p["stroke-linecap"] ?: "butt"
        val join = p["stroke-linejoin"] ?: "miter"
        require(
            cap in listOf("butt", "round", "square") && join in listOf("miter", "round", "bevel")
        ) {
            "Terminação ou junção SVG não suportada."
        }
        val dash = p["stroke-dasharray"]?.takeIf { it != "none" }?.let(::numbers).orEmpty()
        require(dash.all { it >= 0 }) { "Tracejado SVG inválido." }
        val style =
            JSONObject()
                .put("svgStroke", true)
                .put("strokeEnabled", stroke != null && width > 0 && scale > 0)
                .put("color", stroke ?: 0xff000000.toInt())
                .put("size", width * scale)
                .put("opacity", 1.0)
                .put("smooth", 0)
                .put("hardness", 100)
                .put("svgOpacity", opacity(p["opacity"]))
                .put("cap", cap)
                .put("join", join)
                .put("miter", length(p["stroke-miterlimit"] ?: "4", 1.0))
                .put("dash", JSONArray(dash.map { it * scale }))
                .put(
                    "dashOffset",
                    length(
                        p["stroke-dashoffset"] ?: "0",
                        hypot(viewportWidth, viewportHeight) / sqrt(2.0),
                    ) * scale,
                )
        require(style.getDouble("miter") >= 1) { "Limite de junção SVG inválido." }
        val rule = p["fill-rule"] ?: "nonzero"
        require(rule in listOf("nonzero", "evenodd")) { "Regra de preenchimento SVG inválida." }
        objects.add(
            VectorObject(
                java.util.UUID.randomUUID().toString(),
                contours.first().nodes,
                style,
                contours.first().closed,
                fill,
                e.getAttribute("id"),
                groupId = group,
                subPaths = contours.drop(1).toMutableList(),
                evenOdd = rule == "evenodd",
            )
        )
        require(objects.size <= 20000) { "SVG contém objetos demais." }
    }

    private fun attr(e: Element, key: String, ref: Double, default: Double = 0.0) =
        e.getAttribute(key).takeIf { it.isNotBlank() }?.let { length(it, ref) } ?: default

    private fun shape(e: Element, tag: String): MutableList<VectorContour> {
        fun n(key: String, ref: Double, default: Double = 0.0) = attr(e, key, ref, default)
        val data =
            when (tag) {
                "path" -> e.getAttribute("d")
                "line" ->
                    "M ${n("x1",viewportWidth)} ${n("y1",viewportHeight)} L ${n("x2",viewportWidth)} ${n("y2",viewportHeight)}"
                "polyline",
                "polygon" -> {
                    val points = numbers(e.getAttribute("points"))
                    require(points.size % 2 == 0) { "Pontos SVG incompletos." }
                    if (points.isEmpty()) ""
                    else
                        "M " +
                            points.chunked(2).joinToString(" L ") { "${it[0]} ${it[1]}" } +
                            if (tag == "polygon") " Z" else ""
                }
                "rect" -> {
                    val x = n("x", viewportWidth)
                    val y = n("y", viewportHeight)
                    val w = n("width", viewportWidth)
                    val h = n("height", viewportHeight)
                    require(w >= 0 && h >= 0) { "Dimensão SVG negativa." }
                    if (w == 0.0 || h == 0.0) return mutableListOf()
                    var rx =
                        n(
                            "rx",
                            viewportWidth,
                            if (e.hasAttribute("ry")) n("ry", viewportHeight) else 0.0,
                        )
                    var ry = n("ry", viewportHeight, rx)
                    require(rx >= 0 && ry >= 0) { "Raio SVG negativo." }
                    rx = min(rx, w / 2)
                    ry = min(ry, h / 2)
                    if (rx == 0.0 || ry == 0.0) "M $x $y H ${x+w} V ${y+h} H $x Z"
                    else
                        "M ${x+rx} $y H ${x+w-rx} A $rx $ry 0 0 1 ${x+w} ${y+ry} V ${y+h-ry} A $rx $ry 0 0 1 ${x+w-rx} ${y+h} H ${x+rx} A $rx $ry 0 0 1 $x ${y+h-ry} V ${y+ry} A $rx $ry 0 0 1 ${x+rx} $y Z"
                }
                "circle",
                "ellipse" -> {
                    val cx = n("cx", viewportWidth)
                    val cy = n("cy", viewportHeight)
                    val rx =
                        if (tag == "circle")
                            n("r", hypot(viewportWidth, viewportHeight) / sqrt(2.0))
                        else n("rx", viewportWidth)
                    val ry = if (tag == "circle") rx else n("ry", viewportHeight)
                    require(rx >= 0 && ry >= 0) { "Raio SVG negativo." }
                    if (rx == 0.0 || ry == 0.0) return mutableListOf()
                    "M ${cx+rx} $cy A $rx $ry 0 0 1 ${cx-rx} $cy A $rx $ry 0 0 1 ${cx+rx} $cy Z"
                }
                else ->
                    fail(
                        "Elemento <$tag> ainda não é suportado. Converta texto e contornos em caminhos."
                    )
            }
        return SvgPathData(data).parse()
    }
}
