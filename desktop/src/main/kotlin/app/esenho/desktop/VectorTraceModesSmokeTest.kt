package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.math.hypot

/** Trace modes, color quantization, area filtering and Bézier fitting. */
fun vectorTraceModesSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 160, 160)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    val raster = engine.activeLayerIndex
    val bitmap = Bitmap(160, 160)
    Canvas(bitmap).apply {
        drawRect(
            10f,
            10f,
            60f,
            60f,
            Paint().apply {
                color = 0xffcc0000.toInt()
                style = Paint.Style.FILL
            },
        )
        drawRect(
            90f,
            90f,
            140f,
            140f,
            Paint().apply {
                color = 0xff0000cc.toInt()
                style = Paint.Style.FILL
            },
        )
    }
    EsenhoNativeBridge.nativeLayerDrawBitmap(raster, bitmap, 0, 0, 160, 160)
    bitmap.recycle()

    check(v.traceLayer(VectorTraceOptions(mode = "silhouette", threshold = 128)) == 1)
    val silhouettes = v.layers.getValue(engine.activeLayerIndex)
    check(silhouettes.single().nodes.isNotEmpty() && silhouettes.single().subPaths.isNotEmpty())
    check(silhouettes.all { it.fill == engine.currentColor && it.evenOdd })
    check(engine.undo())

    v.switchMode(false)
    engine.selectLayer(raster)
    val colors = v.traceLayer(VectorTraceOptions(mode = "color", colorCount = 2, threshold = 128))
    check(colors == 2) { "Color trace produced $colors shapes" }
    val traced = v.layers.getValue(engine.activeLayerIndex)
    check(traced.map { it.fill }.distinct().size == 2) { "Colors were not quantized" }
    check(traced.all { it.nodes.any { n -> hypot(n.inX - n.x, n.inY - n.y) > .01f } })

    check(engine.undo())
    v.switchMode(false)
    engine.selectLayer(raster)
    check(v.traceLayer(VectorTraceOptions(mode = "silhouette", minArea = 1e6f)) == 0)
    check(v.traceLayer(VectorTraceOptions(mode = "silhouette", bezierFit = false)) == 1)
    check(
        v.layers.getValue(engine.activeLayerIndex).all { obj ->
            obj.nodes.all { n -> n.inX == n.x && n.outX == n.x }
        }
    )
    println("Vector trace modes: silhouette, color, area filter and Bézier fit OK")
}
