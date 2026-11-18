package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.math.abs

/**
 * Pixel probes distinguish real holes from overlapping painted objects, through the production JNI.
 */
fun vectorBooleanSvgSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 256, 256)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val s = v.selection
    fun layer() = v.layers.getValue(engine.activeLayerIndex)
    fun svg(content: String, attributes: String = "") =
        "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' $attributes>$content</svg>"
    fun import(content: String) {
        layer().clear()
        v.importSvg(svg(content))
        s.all()
    }
    fun pixel(x: Int, y: Int): Int {
        val b = Bitmap(256, 256)
        check(EsenhoNativeBridge.nativeLayerGetBitmap(engine.activeLayerIndex, b))
        val p = b.getPixel(x, y)
        b.recycle()
        return p
    }
    fun filled(x: Int, y: Int) = pixel(x, y) ushr 24 > 200
    fun transparent(x: Int, y: Int) = pixel(x, y) ushr 24 == 0
    val overlapping =
        "<rect x='20' y='20' width='80' height='80' fill='#d02030'/><rect x='60' y='20' width='80' height='80' fill='blue'/>"
    for (operation in VectorBooleanOperation.values()) {
        import(overlapping)
        val before = v.snapshot()
        s.boolean(operation)
        check(layer().size == 1)
        check(filled(30, 50) == (operation != VectorBooleanOperation.INTERSECT))
        check(
            filled(80, 50) ==
                (operation == VectorBooleanOperation.UNION ||
                    operation == VectorBooleanOperation.INTERSECT)
        )
        check(
            filled(120, 50) ==
                (operation == VectorBooleanOperation.UNION ||
                    operation == VectorBooleanOperation.EXCLUDE)
        )
        check(v.selected!!.fill == 0xffd02030.toInt()) {
            "Boolean result lost the back object's appearance"
        }
        val after = v.snapshot()
        check(engine.undo())
        check(v.snapshot() == before)
        check(engine.redo())
        check(v.snapshot() == after)
    }
    import(
        "<rect x='10' y='10' width='140' height='140' fill='red'/><rect x='50' y='50' width='60' height='60'/>"
    )
    s.boolean(VectorBooleanOperation.SUBTRACT)
    check(v.selected!!.subPaths.size == 1 && transparent(80, 80) && filled(25, 25)) {
        "Subtraction painted over the hole"
    }
    val donut = v.selected!!
    val raw = v.exportSvg().replace(Regex("<metadata.*?</metadata>"), "")
    val reopened = VectorSvgIO.readEditable(raw).single()
    check(reopened.subPaths.size == 1)
    val archive = java.io.ByteArrayOutputStream()
    EsenhoProjectIO.save(engine, archive)
    EsenhoProjectIO.load(engine, archive.toByteArray().inputStream())
    check(layer().single().subPaths.size == 1 && transparent(80, 80))
    v.selectedId = layer().single().id
    val b = s.bounds()!!
    s.transform(b.left + 10, b.top + 15, b.width, b.height)
    check(transparent(90, 95) && filled(35, 40)) { "Transform lost the hole" }
    // Direct node editing and overlays also include the inner contour.
    v.tool = VectorTool.NODES
    val inner = v.selected!!.subPaths.first().nodes.first()
    val oldX = inner.x
    val oldY = inner.y
    engine.onTouchDown(oldX, oldY)
    engine.onTouchMove(oldX + 5, oldY + 4)
    engine.onTouchUp(oldX + 5, oldY + 4)
    check(v.selectedNode != null && abs(v.selectedNode!!.x - oldX - 5) < .01f)
    check(engine.undo())
    import(
        "<rect x='10' y='10' width='20' height='20'/><rect x='100' y='100' width='20' height='20'/>"
    )
    s.boolean(VectorBooleanOperation.INTERSECT)
    check(layer().isEmpty() && transparent(15, 15))
    check(engine.undo())
    s.all()
    s.boolean(VectorBooleanOperation.UNION)
    check(
        layer().single().subPaths.size == 1 &&
            filled(15, 15) &&
            filled(110, 110) &&
            transparent(60, 60)
    )
    // Even-odd and nonzero holes retain distinct fill rules.
    val rings = "M10 10H150V150H10Z M50 50H110V110H50Z"
    import("<path d='$rings' fill='green' fill-rule='evenodd'/>")
    check(transparent(80, 80) && filled(20, 20))
    v.tool = VectorTool.SELECT
    s.clear()
    engine.onTouchDown(80f, 80f)
    engine.onTouchUp(80f, 80f)
    check(s.objects.isEmpty()) { "Hit test selected a hole" }
    import("<path d='$rings' fill='green' fill-rule='nonzero'/>")
    check(filled(80, 80))
    // Units, viewBox, inherited styles, transforms, use and rounded shapes.
    val transformed =
        VectorSvgIO.readEditable(
                """<svg xmlns='http://www.w3.org/2000/svg' width='2in' height='1in' viewBox='0 0 100 50'>
      <defs><path id='p' d='M0 0h10v10h-10z'/></defs><g transform='translate(10 5) scale(2)' fill='#0f0'><use href='#p' x='5'/></g>
    </svg>"""
            )
            .single()
    check(
        abs(transformed.nodes.first().x - 38.4f) < .01f &&
            abs(transformed.nodes.first().y - 9.6f) < .01f
    )
    check(transformed.fill == 0xff00ff00.toInt() && transformed.groupId != null)
    import(
        "<rect x='20' y='20' width='100' height='80' rx='15' fill='red'/><circle cx='170' cy='60' r='20' fill='#0000ff80'/>"
    )
    check(transparent(20, 20) && filled(40, 40))
    check(pixel(170, 60) ushr 24 in 126..129)
    val ellipse =
        VectorSvgIO.readEditable(
                svg(
                    "<ellipse cx='50' cy='60' rx='20' ry='10'/><polygon points='10,10 20,10 20,20'/><polyline points='30,30 40,30 40,40' fill='none' stroke='red'/>"
                )
            )
            .toList()
    check(ellipse.size == 3 && ellipse[0].closed && ellipse[1].closed && !ellipse[2].closed)
    // Every SVG path command, relative forms, repetitions, compact signs/exponents and arc flags.
    val path =
        VectorSvgIO.readEditable(
                svg(
                    "<path fill='none' stroke='black' d='M1e1,10 l20 0 0 20 h-10 v10 c0 10 10 10 10 0 s10-10 10 0 q10 10 20 0 t20 0 a10 15 30 0110 20 z m100 0 L140 30 H150 V50 C160 60 170 60 180 50 S200 40 210 50 Q220 60 230 50 T240 50 A10 10 0 0 1 250 60'/>"
                )
            )
            .single()
    check(path.geometry().size == 2 && path.closed && !path.subPaths.single().closed)
    check(path.allNodes().any { it.inX != it.x || it.inY != it.y })
    val stroke =
        "<path d='M20 30H100' fill='none' stroke='rgba(0,0,255,0.5)' stroke-width='10' stroke-linecap='butt'/>"
    import(stroke)
    check(transparent(15, 30))
    check(pixel(50, 30) ushr 24 in 126..129)
    import(
        "<rect x='20' y='20' width='80' height='80' fill='red' stroke='blue' stroke-width='12' opacity='.5'/>"
    )
    check(pixel(20, 50) ushr 24 in 126..129) {
        "Object opacity applied twice in fill/stroke overlap"
    }
    check(pixel(50, 50) ushr 24 in 126..129)
    import(
        "<path d='M20 30H150' fill='none' stroke='black' stroke-width='4' stroke-dasharray='10 10' stroke-dashoffset='-20'/>"
    )
    check(filled(25, 30) && transparent(35, 30))
    import(
        "<path d='M20 30H150' stroke='red' stroke-linecap='round' stroke-width='10' transform='scale(0)'/>"
    )
    check(transparent(0, 0)) { "Collapsed SVG transform rendered a hairline" }
    import("<rect x='20' y='20' width='30' height='30' fill='transparent'/>")
    check(transparent(25, 25))
    // Export without Esenho metadata remains a usable external SVG, including compound geometry.
    layer().clear()
    layer().add(reopened)
    v.render()
    val external =
        VectorSvgIO.readEditable(v.exportSvg().replace(Regex("<metadata.*?</metadata>"), ""))
            .single()
    layer().clear()
    layer().add(external)
    v.render()
    check(transparent(80, 80) && filled(25, 25))
    engine.selectPreset(engine.presetCatalog.first())
    engine.brushSize = 4f
    engine.brushOpacity = 1f
    engine.currentColor = 0xff2040dd.toInt()
    val native = external.copy(style = engine.captureVectorStyle())
    layer().clear()
    layer().add(native)
    v.render()
    check(transparent(80, 80) && filled(25, 25)) { "Raster brush replay bridged a compound hole" }
    v.selectedId = native.id
    v.tool = VectorTool.NODES
    val selectedInner = native.subPaths.first().nodes.first()
    engine.onTouchDown(selectedInner.x, selectedInner.y)
    engine.onTouchUp(selectedInner.x, selectedInner.y)
    val innerCount = native.subPaths.first().nodes.size
    v.splitSegment()
    check(v.selected!!.subPaths.first().nodes.size == innerCount + 1)
    val overlay = Bitmap(256, 256)
    v.drawOverlay(Canvas(overlay))
    check(overlay.getPixel(selectedInner.x.toInt(), selectedInner.y.toInt()) ushr 24 > 0)
    overlay.recycle()
    check(engine.undo())
    // Fail atomically for unsupported artwork and malformed path data.
    val bad =
        listOf(
            "<rect width='10' height='10' stroke='red' stroke-width='1e100'/>",
            "<path d='M0 0C1 2'/>",
            "<rect width='10' height='10' fill='url(#g)'/>",
            "<g opacity='.5'><rect width='10' height='10'/></g>",
            "<path d='M0 0A1 1 0 2 0 10 10'/>",
            "<use href='#missing'/>",
            "<defs><g id='cycle'><use href='#cycle'/></g></defs><use href='#cycle'/>",
            "<style>path{fill:red}</style><path d='M0 0L10 10'/>",
            "<rect width='10' height='10' stroke='red' transform='scale(2 1)'/>",
            "<rect width='10' height='10' clip-path='url(#clip)'/>",
        )
    bad.forEach { content ->
        val before = v.snapshot()
        val beforePixel = pixel(25, 25)
        check(
            runCatching { v.importSvg(svg("<rect width='10' height='10'/>" + content)) }.isFailure
        ) {
            "Unsupported SVG silently imported: $content"
        }
        check(v.snapshot() == before && pixel(25, 25) == beforePixel)
    }
    check(
        runCatching {
                VectorSvgIO.readEditable(
                    "<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><svg xmlns='http://www.w3.org/2000/svg'><text>&x;</text></svg>"
                )
            }
            .isFailure
    )
    v.importSvg(
        svg(
            "<text x='10' y='40' font-family='serif' font-size='20' letter-spacing='2' text-anchor='middle'>Olá</text>"
        )
    )
    val text = v.layers.getValue(engine.activeLayerIndex).last()
    check(
        text.text == "Olá" &&
            text.fontFamily == "serif" &&
            text.fontSize == 20f &&
            text.letterSpacing == 2f &&
            text.textAlign == "center"
    )
    check(v.exportSvg().contains("<text "))
    println(
        "Vector boolean/SVG: four area operations, holes/islands, compound nodes/transforms, empty results, undo, project/export roundtrip, external shapes/curves/arcs/styles and atomic errors OK"
    )
}
