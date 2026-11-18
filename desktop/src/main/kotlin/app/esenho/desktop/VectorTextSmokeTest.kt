package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*

/** Text objects, path attachment and outlines use the production engine and native layer. */
fun vectorTextSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 300, 200)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    v.tool = VectorTool.TEXT
    engine.onTouchDown(20f, 40f)
    engine.onTouchUp(20f, 40f)
    val textId = v.selected!!.id
    check(v.selected!!.text == "Texto")
    check(v.selected!!.nodes.size == 4)
    v.setTextContent("Olá mundo")
    v.setFontFamily("serif")
    v.setFontSize(32f)
    v.setLetterSpacing(2f)
    v.setTextAlign("center")
    val text = v.selected!!
    check(
        text.text == "Olá mundo" &&
            text.fontFamily == "serif" &&
            text.fontSize == 32f &&
            text.letterSpacing == 2f &&
            text.textAlign == "center"
    )
    check(text.nodes[1].x > text.nodes[0].x)
    val bitmap = Bitmap(300, 200)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(layer, bitmap))
    val painted = (20 until 220).any { x -> (38 until 90).any { y -> (bitmap.getPixel(x, y) ushr 24) > 0 } }
    bitmap.recycle()
    check(painted) { "Text object did not render" }
    val svg = v.exportSvg()
    check(svg.contains("<text "))
    check(svg.contains("font-family=\"serif\""))
    check(svg.contains("letter-spacing=\"2.0\""))
    check(svg.contains(">Olá mundo</text>"))

    // Attach the text to a path, export the reference, then outline it.
    v.tool = VectorTool.RECT
    engine.onTouchDown(10f, 10f)
    engine.onTouchUp(200f, 160f)
    val pathId = v.selected!!.id
    v.selectedId = textId
    v.setTextPath(pathId)
    check(v.selected!!.pathId == pathId)
    check(v.exportSvg().contains("<textPath href=\"#$pathId\""))
    v.convertTextToCurves()
    val outlined = v.selected!!
    check(outlined.text == null && outlined.nodes.size > 2)
    check(outlined.subPaths.isNotEmpty())
    check(engine.undo())
    v.selectedId = textId
    check(v.selected!!.text == "Olá mundo")

    val snapshot = v.snapshot()
    v.restore(snapshot)
    check(v.layers.values.flatten().first { it.id == textId }.text == "Olá mundo")
    println("Vector text: edit, render, path attachment, outlines, SVG and project roundtrip OK")
}
