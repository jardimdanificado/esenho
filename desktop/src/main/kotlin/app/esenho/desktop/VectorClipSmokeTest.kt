package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*

/** Vector clipping uses the production native layer and project archive. */
fun vectorClipSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 200, 200)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    fun rect(id: String, x: Float, y: Float, size: Float, fill: Int?) =
        VectorObject(
            id,
            mutableListOf(
                VectorNode(x, y, 1f),
                VectorNode(x + size, y, 1f),
                VectorNode(x + size, y + size, 1f),
                VectorNode(x, y + size, 1f),
            ),
            engine.captureVectorStyle(),
            true,
            fill,
        )
    val clip = rect("clip", 60f, 60f, 60f, null)
    val content = rect("content", 30f, 30f, 130f, 0xffff0000.toInt())
    v.layers[layer] = mutableListOf(content, clip)
    v.render()
    v.tool = VectorTool.SELECT
    v.selection.all()
    v.selection.createClip()

    fun objects() = v.layers.getValue(layer)
    fun pixel(x: Int, y: Int): Int {
        val bmp = Bitmap(200, 200)
        check(EsenhoNativeBridge.nativeLayerGetBitmap(layer, bmp))
        return bmp.getPixel(x, y).also { bmp.recycle() }
    }
    check(objects().first { it.id == "clip" }.isClip)
    check(objects().first { it.id == "content" }.clipOf == "clip")
    check((pixel(40, 40) ushr 24) == 0) { "Clipped object leaked outside the clip path" }
    check((pixel(90, 90) ushr 24) > 200) { "Clipped object missing inside the clip path" }
    val svg = v.exportSvg()
    check(svg.contains("<clipPath id=\"clip-clip\">"))
    check(svg.contains("clip-path=\"url(#clip-clip)\""))

    // The clip metadata round-trips through the editable project snapshot.
    val archive = v.snapshot()
    v.restore(archive)
    check(objects().first { it.id == "clip" }.isClip)
    check(objects().first { it.id == "content" }.clipOf == "clip")

    // Releasing the clip restores independent objects and the original rendering.
    v.selection.all()
    v.selection.releaseClip()
    check(!objects().first { it.id == "clip" }.isClip)
    check(objects().first { it.id == "content" }.clipOf == null)
    check((pixel(40, 40) ushr 24) > 200)
    check(!v.exportSvg().contains("clip-path="))
    check(engine.undo())
    check(objects().first { it.id == "clip" }.isClip)
    check(objects().first { it.id == "content" }.clipOf == "clip")
    println("Vector clip: create/release, masked render, SVG clipPath, undo and project roundtrip OK")
}
