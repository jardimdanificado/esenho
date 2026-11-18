package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import java.io.ByteArrayOutputStream

/** Uses the production engine/JNI and archive, not a mock renderer. */
fun vectorSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 128, 128)
    engine.selectPreset(engine.presetCatalog.first())
    engine.brushSize = 9f
    engine.currentColor = Color.rgb(230, 30, 10)
    val raster = engine.activeLayerIndex
    val v = engine.vectors
    v.switchMode(true)
    check(engine.activeLayerIndex != raster)
    val vectorLayer = engine.activeLayerIndex
    engine.onTouchDown(10f, 30f, .2f, 10, 0)
    engine.onTouchMove(45f, 70f, .7f, 20, 3)
    engine.onTouchMove(85f, 40f, 1f, 30, 6)
    engine.onTouchUp(110f, 65f, .8f, 15, 4)
    val obj = v.selected!!
    val id = obj.id
    check(obj.nodes.size >= 3)
    check(obj.nodes.first().pressure == .2f && obj.nodes[1].tiltX == 20)
    fun pixels(): IntArray {
        val bitmap = Bitmap(128, 128)
        check(EsenhoNativeBridge.nativeLayerGetBitmap(vectorLayer, bitmap))
        return IntArray(128 * 128).also {
            bitmap.getPixels(it, 0, 128, 0, 0, 128, 128)
            bitmap.recycle()
        }
    }
    val original = pixels()
    check(original.count { it ushr 24 > 0 } > 40) { "Vector brush did not render" }
    check(engine.undo())
    check(v.layers.getValue(vectorLayer).isEmpty())
    check(engine.redo())
    check(v.layers.getValue(vectorLayer).single().id == id)
    check(pixels().contentEquals(original)) { "Vector redo lost rendered appearance" }
    v.selectedId = id
    v.tool = VectorTool.SELECT
    val first = v.selected!!.nodes.first()
    val x = first.x
    val y = first.y
    engine.onTouchDown(x, y)
    engine.onTouchMove(x + 8, y + 10)
    engine.onTouchUp(x + 8, y + 10)
    check(v.selected!!.nodes.first().x == x + 8)
    check(engine.undo())
    check(v.layers.getValue(vectorLayer).single().nodes.first().x == x)
    check(engine.redo())
    v.selectedId = id
    engine.currentColor = Color.rgb(10, 30, 230)
    engine.brushSize = 18f
    v.applyStyle()
    check(v.selected!!.style.getInt("color") == engine.currentColor)
    check(!pixels().contentEquals(original))
    check(engine.brushSize == 18f) { "Replay leaked brush state" }
    v.tool = VectorTool.NODES
    val anchor = v.selected!!.nodes[1]
    val hx = anchor.outX
    val hy = anchor.outY
    engine.onTouchDown(hx, hy)
    engine.onTouchMove(hx + 6, hy - 9)
    engine.onTouchUp(hx + 6, hy - 9)
    check(v.selected!!.nodes[1].outY == hy - 9)
    check(engine.undo())
    v.selectedId = id
    v.tool = VectorTool.RECT
    engine.onTouchDown(20f, 20f)
    engine.onTouchUp(80f, 90f)
    v.changeSelected { it.fill = Color.rgb(20, 180, 50) }
    val savedCount = v.layers.getValue(vectorLayer).size
    val data = ByteArrayOutputStream()
    EsenhoProjectIO.save(engine, data)
    engine.initEngine(40, 40)
    check(v.layers.isEmpty() && !v.enabled)
    EsenhoProjectIO.load(engine, data.toByteArray().inputStream())
    check(v.enabled && v.layers.values.flatten().size == savedCount)
    val restored = v.layers.values.flatten().first()
    check(restored.style.getInt("color") == Color.rgb(10, 30, 230))
    check(restored.nodes[0].tiltX == 10)
    check(v.exportSvg().contains("<path d=\"M"))
    check(v.exportSvg(true).contains("data:image/png;base64,"))
    val editableSvg = v.exportSvg()
    val reopened = VectorSvgIO.readEditable(editableSvg)
    check(reopened.size == savedCount)
    check(reopened.first().nodes.first().tiltX == 10)
    check(reopened.first().style.getInt("color") == Color.rgb(10, 30, 230))
    check(VectorSvgIO.readEditable(v.exportSvg(true)).size == savedCount)
    val beforeBadImport = v.snapshot()
    check(
        runCatching { v.importSvg("<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>") }
            .isFailure
    )
    check(v.snapshot() == beforeBadImport)
    v.importSvg(editableSvg)
    check(v.layers.values.flatten().size == savedCount * 2)
    check(engine.undo())
    check(v.layers.values.flatten().size == savedCount)
    v.switchMode(false)
    check(engine.activeLayerIndex !in v.layers)
    v.switchMode(true)
    v.selectedId = restored.id
    v.deleteSelected()
    check(v.layers.values.flatten().size == savedCount - 1)
    check(engine.undo())
    check(v.layers.values.flatten().size == savedCount)
    val restoredLayer = v.layers.keys.first()
    engine.selectLayer(restoredLayer)
    v.selectedId = v.layers.getValue(restoredLayer).first().id
    val curveBeforeSplit = v.selected!!.samples()
    val nodeCount = v.selected!!.nodes.size
    v.splitSegment()
    check(v.selected!!.nodes.size == nodeCount + 1)
    check(
        v.selected!!.samples().all { n ->
            curveBeforeSplit.any { kotlin.math.hypot(it.x - n.x, it.y - n.y) < 2.5f }
        }
    )
    check(engine.undo())
    check(v.layers.getValue(restoredLayer).first().nodes.size == nodeCount)
    val beforeRasterize = v.layers.values.flatten().size
    v.rasterize()
    check(restoredLayer !in v.layers && !v.enabled)
    check(engine.undo())
    check(v.layers.values.flatten().size == beforeRasterize)
    check(engine.redo())
    check(restoredLayer !in v.layers)
    check(engine.undo())
    engine.selectLayer(restoredLayer)
    val duplicate = engine.duplicateLayer(restoredLayer)
    check(v.layers.getValue(duplicate).size == v.layers.getValue(restoredLayer).size)
    check(engine.undo())
    check(duplicate !in v.layers)
    check(engine.redo())
    check(duplicate in v.layers)
    engine.deleteLayer(duplicate)
    check(duplicate !in v.layers)
    check(engine.undo())
    check(duplicate in v.layers)
    engine.selectLayer(restoredLayer)
    v.selectedId = v.layers.getValue(restoredLayer).first().id
    engine.selectBrush(engine.brushCatalog.first())
    engine.setBrushCustomParam(0, engine.selectedBrush!!.params.first().max)
    val proceduralValue = engine.selectedBrush!!.params.first().currentVal
    engine.brushSize = 13f
    v.applyStyle()
    check(v.selected!!.style.getJSONArray("params").getInt(0) == proceduralValue)
    v.render()
    check(engine.selectedBrush!!.params.first().currentVal == proceduralValue)
    check(engine.brushSize == 13f)
    // Property drags form one undo step and update only the selected appearance.
    val selectedStyle = v.selected!!.style.toString()
    engine.currentColor = Color.BLACK
    v.selectObject(v.selected!!.id)
    check(engine.currentColor == org.json.JSONObject(selectedStyle).getInt("color"))
    check(engine.brushSize == org.json.JSONObject(selectedStyle).getDouble("size").toFloat())
    val colorBefore = v.selected!!.style.getInt("color")
    v.setObjectColor(Color.rgb(20, 210, 30))
    v.setObjectColor(Color.rgb(30, 220, 40))
    v.setObjectColor(Color.rgb(40, 230, 50))
    v.finishAppearanceEdit()
    check(v.selected!!.style.getInt("color") == Color.rgb(40, 230, 50))
    check(engine.undo())
    check(v.layers.getValue(restoredLayer).first().style.getInt("color") == colorBefore)
    engine.selectLayer(restoredLayer)
    val countBeforePen = v.layers.getValue(restoredLayer).size
    v.tool = VectorTool.PEN
    engine.onTouchDown(15f, 15f, .3f, 12, 2)
    engine.onTouchMove(25f, 10f, .3f, 12, 2)
    engine.onTouchUp(25f, 10f, .3f, 12, 2)
    engine.onTouchDown(65f, 55f, .9f, 5, 6)
    engine.onTouchMove(80f, 65f, .9f, 5, 6)
    engine.onTouchUp(80f, 65f, .9f, 5, 6)
    check(v.selected!!.nodes.size == 2)
    check(v.selected!!.nodes.first().outX == 25f)
    check(v.selected!!.nodes.first().inX == 5f)
    check(v.selected!!.nodes[1].pressure == .9f)
    check(v.layers.getValue(restoredLayer).size == countBeforePen + 1)
    check(engine.undo())
    check(v.layers.getValue(restoredLayer).last().nodes.size == 1)
    check(engine.redo())
    // History restoration finishes the pen; select its path explicitly for property edits.
    v.selectedId = v.layers.getValue(restoredLayer).last().id
    v.changeSelected { it.closed = true }
    val strokeBeforeFill = v.selected!!.style.getInt("color")
    v.editFillColor = true
    v.setObjectColor(Color.rgb(180, 40, 90))
    v.finishAppearanceEdit()
    check(v.selected!!.fill == Color.rgb(180, 40, 90))
    check(v.selected!!.style.getInt("color") == strokeBeforeFill)
    v.editFillColor = false
    v.finishPen()
    v.tool = VectorTool.ERASER
    engine.onTouchDown(15f, 15f)
    engine.onTouchUp(15f, 15f)
    check(v.layers.getValue(restoredLayer).size == countBeforePen)
    check(engine.undo())
    v.tool = VectorTool.DRAW
    engine.selectLayer(restoredLayer)
    val beforePreview = pixels()
    engine.onTouchDown(10f, 110f)
    engine.onTouchMove(100f, 110f)
    check(!pixels().contentEquals(beforePreview)) {
        "Vector brush preview did not paint before release"
    }
    engine.cancelActiveStroke()
    check(pixels().contentEquals(beforePreview)) {
        "Cancelling a live vector preview changed the document"
    }
    // Gestures update the geometry overlay without repeatedly rebuilding native layer pixels.
    engine.initEngine(128, 128)
    v.switchMode(true)
    engine.selectPreset(engine.presetCatalog.first())
    v.tool = VectorTool.PEN
    engine.onTouchDown(20f, 30f)
    engine.onTouchMove(40f, 20f)
    val overlay = Bitmap(128, 128)
    v.drawOverlay(Canvas(overlay))
    check(overlay.getPixel(20, 30) ushr 24 > 0) { "The Bezier anchor is invisible while drawing" }
    check(overlay.getPixel(40, 20) ushr 24 > 0) { "The Bezier handle is invisible while drawing" }
    engine.onTouchUp(40f, 20f)
    engine.onTouchDown(90f, 80f)
    engine.onTouchUp(90f, 80f)
    v.finishPen()
    v.tool = VectorTool.NODES
    val cacheBefore = Bitmap(128, 128)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(engine.activeLayerIndex, cacheBefore))
    val before = IntArray(128 * 128)
    cacheBefore.getPixels(before, 0, 128, 0, 0, 128, 128)
    engine.onTouchDown(20f, 30f)
    repeat(8) { engine.onTouchMove(21f + it, 31f + it) }
    val during = Bitmap(128, 128)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(engine.activeLayerIndex, during))
    val duringPixels = IntArray(128 * 128)
    during.getPixels(duringPixels, 0, 128, 0, 0, 128, 128)
    check(before.contentEquals(duringPixels)) { "Node moves still repaint the whole layer" }
    engine.onTouchUp(28f, 38f)
    check(v.selected!!.nodes.first().x == 28f)
    check(engine.undo())
    check(v.layers.values.flatten().first().nodes.first().x == 20f)
    overlay.recycle()
    cacheBefore.recycle()
    during.recycle()
    for (shape in listOf(VectorTool.LINE, VectorTool.RECT, VectorTool.ELLIPSE)) {
        v.tool = shape
        val count = v.layers.values.flatten().size
        engine.onTouchDown(20f, 30f)
        engine.onTouchMove(100f, 90f)
        val preview = Bitmap(128, 128)
        v.drawOverlay(Canvas(preview))
        val probe =
            when (shape) {
                VectorTool.LINE -> 60 to 60
                else -> 20 to 60
            }
        check(preview.getPixel(probe.first, probe.second) ushr 24 > 0) {
            "The $shape preview does not match its geometry"
        }
        if (shape == VectorTool.ELLIPSE)
            check(preview.getPixel(20, 30) ushr 24 == 0) {
                "Ellipse preview has rectangular corners"
            }
        preview.recycle()
        engine.onTouchUp(100f, 90f)
        check(v.layers.values.flatten().size == count + 1)
        check(v.selected!!.closed == (shape != VectorTool.LINE))
    }
    check(
        VectorObject(
                "straight",
                mutableListOf(VectorNode(0f, 0f), VectorNode(1000f, 0f)),
                org.json.JSONObject(),
            )
            .samples()
            .size < 70
    )
    println(
        "Vector smoke test: editable curves, pressure/tilt, native brush, move/handles, style, undo/redo, project and SVG OK"
    )
}
