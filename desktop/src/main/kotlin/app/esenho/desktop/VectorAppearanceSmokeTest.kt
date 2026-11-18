package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import org.json.JSONObject

/** Brush fills, object filters and per-node width use the production renderer. */
fun vectorAppearanceSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 160, 160)
    engine.selectPreset(engine.presetCatalog.first())
    engine.brushSize = 12f
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    val rect =
        VectorObject(
            "appearance",
            mutableListOf(
                VectorNode(20f, 20f, 1f),
                VectorNode(140f, 20f, 1f),
                VectorNode(140f, 140f, 1f),
                VectorNode(20f, 140f, 1f),
            ),
            engine.captureVectorStyle(),
            true,
            0xff4080ff.toInt(),
        )
    v.layers[layer] = mutableListOf(rect)
    v.render()
    v.selectedId = "appearance"

    fun pixels(): IntArray {
        val bitmap = Bitmap(160, 160)
        check(EsenhoNativeBridge.nativeLayerGetBitmap(layer, bitmap))
        return IntArray(160 * 160).also {
            bitmap.getPixels(it, 0, 160, 0, 0, 160, 160)
            bitmap.recycle()
        }
    }
    val solid = pixels()
    v.setBrushFill(true)
    check(v.selected!!.fillBrush && v.selected!!.fillBrushStyle != null)
    v.render()
    val textured = pixels()
    val inside = (40 until 120).flatMap { y -> (40 until 120).map { x -> y * 160 + x } }
    check(inside.count { textured[it] ushr 24 > 0 } > 1000) { "Brush fill did not render" }
    check(textured.indices.count { textured[it] != solid[it] } > 100) { "Brush fill left the flat fill unchanged" }

    val filterId = engine.filterCatalog.first().id
    v.setObjectFilter("fill", VectorFilter(filterId, 4, 0))
    check(v.selected!!.fillFilter?.id == filterId)
    v.render()
    val filtered = pixels()
    check(filtered.indices.count { filtered[it] != solid[it] } > 100)

    v.changeSelected { it.nodes.first().width = 2.5f }
    check(v.selected!!.nodes.first().width == 2.5f)
    val archived = v.layers.getValue(layer).first()
    val restored = VectorObject.read(JSONObject(archived.json().toString()))
    check(restored.nodes.first().width == 2.5f && restored.fillBrush && restored.fillFilter?.id == filterId)
    v.render()
    val project = v.snapshot()
    v.restore(project)
    val loaded = v.layers.getValue(layer).first()
    check(loaded.fillBrush && loaded.fillFilter?.id == filterId && loaded.nodes.first().width == 2.5f)
    check(engine.undo())
    println("Vector appearance: brush fill, object filter, node width and archive OK")
}
