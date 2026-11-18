package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*

/** Editable gradients and embedded PNG images use the production renderer and SVG IO. */
fun vectorGradientImageSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 160, 160)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    v.layers[layer] =
        mutableListOf(
            VectorObject(
                "gradient",
                mutableListOf(
                    VectorNode(20f, 20f, 1f),
                    VectorNode(140f, 20f, 1f),
                    VectorNode(140f, 140f, 1f),
                    VectorNode(20f, 140f, 1f),
                ),
                engine.captureVectorStyle(),
                true,
                0xff0000ff.toInt(),
            )
        )
    v.render()
    v.selectedId = "gradient"
    v.setGradientEnabled(true)
    check(v.selected!!.fillGradient != null)
    v.updateGradient { it.stops[1].color = 0xff00ff00.toInt() }
    v.render()
    val bitmap = Bitmap(160, 160)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(layer, bitmap))
    val left = bitmap.getPixel(40, 80)
    val right = bitmap.getPixel(120, 80)
    bitmap.recycle()
    check(left != right) { "Gradient rendered as a flat fill" }
    check(v.selected!!.fillGradient!!.colorAt(0f) == 0xff0000ff.toInt())
    check(v.selected!!.fillGradient!!.colorAt(1f) == 0xff00ff00.toInt())
    val svg = v.exportSvg()
    check(svg.contains("<linearGradient id=\"grad-gradient\""))
    check(svg.contains("fill=\"url(#grad-gradient)\""))
    check(VectorSvgIO.readEditable(svg).single().fillGradient != null)

    val external =
        "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>" +
            "<defs><radialGradient id='g' cx='50%' cy='50%' r='50%'>" +
            "<stop offset='0%' stop-color='red'/><stop offset='100%' stop-color='blue'/>" +
            "</radialGradient></defs>" +
            "<rect x='10' y='10' width='60' height='60' fill='url(#g)'/></svg>"
    val imported = VectorSvgIO.readEditable(external).single()
    check(imported.fillGradient?.type == "radial" && imported.fillGradient!!.stops.size == 2)

    // Embedded PNG images survive render, SVG export and plain-SVG import.
    val source = Bitmap(40, 30)
    Canvas(source).drawRect(
        0f,
        0f,
        40f,
        30f,
        Paint().apply {
            color = 0xffff0000.toInt()
            style = Paint.Style.FILL
        },
    )
    val imageId = v.embedBitmap(source, 50f, 50f)!!
    source.recycle()
    check(v.selected!!.imageData != null && v.selected!!.id == imageId)
    v.render()
    val pixels = Bitmap(160, 160)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(layer, pixels))
    check((pixels.getPixel(60, 60) ushr 24) > 0) { "Embedded image did not render" }
    pixels.recycle()
    val imageSvg = v.exportSvg()
    check(imageSvg.contains("<image "))
    check(imageSvg.contains("data:image/png;base64,"))
    val plain =
        "<svg xmlns='http://www.w3.org/2000/svg' width='80' height='60'>" +
            "<image x='5' y='7' width='40' height='30' href='data:image/png;base64,${v.selected!!.imageData}'/></svg>"
    val imageImported = VectorSvgIO.readEditable(plain).single()
    check(imageImported.imageData != null && imageImported.nodes.size == 4)
    val project = v.snapshot()
    v.restore(project)
    check(v.layers.getValue(layer).any { it.imageData != null && it.fillGradient != null || it.imageData != null })
    check(engine.undo())
    println("Vector gradient/image: render, interpolation, SVG export/import and archive OK")
}
