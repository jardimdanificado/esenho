package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*

/** Stroke outlines, simplification and raster tracing use the production engine. */
fun vectorConversionSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 120, 120)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    var layer = engine.activeLayerIndex

    // Stroke to area: an open line becomes a closed filled band with the stroke width.
    val line =
        VectorObject(
            "line",
            mutableListOf(VectorNode(20f, 60f, 1f), VectorNode(100f, 60f, 1f)),
            engine.captureVectorStyle().apply { put("size", 10.0) },
            false,
        )
    v.layers[layer] = mutableListOf(line)
    v.render()
    v.selectedId = "line"
    v.outlineStroke()
    val outlined = v.layers.getValue(layer).first()
    check(outlined.closed && outlined.fill != null && outlined.nodes.size > 4)
    check(!outlined.style.optBoolean("strokeEnabled", true))
    val bounds = VectorSelection.VectorBounds.of(listOf(outlined))!!
    check(bounds.width in 75f..105f) { "Outline width ${bounds.width}" }
    check(bounds.height in 8f..12f) { "Outline height ${bounds.height}" }
    check(engine.undo())
    check(!v.layers.getValue(layer).first().closed)

    // RDP keeps the endpoints and drops nearly collinear anchors.
    v.layers[layer] =
        mutableListOf(
            VectorObject(
                "many",
                MutableList(21) { i -> VectorNode(10f + i * 5f, 50f + if (i == 10) 1f else 0f, 1f) },
                engine.captureVectorStyle(),
                false,
            )
        )
    v.selectedId = "many"
    v.render()
    v.simplify(2f)
    check(v.selected!!.nodes.size == 2)
    check(engine.undo())
    check(v.layers.getValue(layer).first().nodes.size == 21)

    // Tracing a raster rectangle creates a filled closed vector path.
    v.switchMode(false)
    val raster = engine.activeLayerIndex
    val bitmap = Bitmap(120, 120)
    Canvas(bitmap).drawRect(
        20f,
        20f,
        80f,
        80f,
        Paint().apply {
            color = 0xff000000.toInt()
            style = Paint.Style.FILL
        },
    )
    EsenhoNativeBridge.nativeLayerDrawBitmap(raster, bitmap, 0, 0, 120, 120)
    bitmap.recycle()
    val count = v.traceLayer(128)
    check(count >= 1) { "Tracer found no contours" }
    layer = engine.activeLayerIndex
    val traced = v.layers.getValue(layer)
    val created = traced.filter { it.name == "Vetorizado" }
    check(created.size == count && created.all { it.closed && it.fill != null && it.nodes.size >= 3 })
    check(
        created.any { obj ->
            val b = VectorSelection.VectorBounds.of(listOf(obj))!!
            b.left in 15f..25f && b.top in 15f..25f && b.right in 75f..85f && b.bottom in 75f..85f
        }
    ) { "Traced contour does not match the raster rectangle" }
    check(engine.undo())
    check(v.layers.values.flatten().none { it.name == "Vetorizado" })
    println("Vector conversions: outline, simplify, raster tracing and undo OK")
}
