package app.esenho.desktop

import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.system.measureNanoTime

/** Same layer, brush and pointer workload before/after vector interaction changes. */
fun vectorBenchmark() {
    val engine = EsenhoEngine(Context(), 256, 256)
    val v = engine.vectors
    v.switchMode(true)
    engine.selectBrush(engine.brushCatalog.first())
    engine.brushOpacity = .45f
    engine.brushSize = 8f
    repeat(6) { i ->
        val path =
            VectorObject(
                "bench-$i",
                mutableListOf(VectorNode(20f, 20f + i * 25), VectorNode(220f, 30f + i * 25)),
                engine.captureVectorStyle(),
            )
        v.layers.getValue(engine.activeLayerIndex).add(path)
    }
    v.render()
    v.selectedId = "bench-0"
    v.tool = VectorTool.NODES
    engine.onTouchDown(20f, 20f)
    val elapsed = measureNanoTime {
        repeat(8) { i -> engine.onTouchMove(22f + i * 2, 24f + i * 2) }
    }
    val commit = measureNanoTime { engine.onTouchUp(36f, 38f) }
    println(
        "Vector benchmark: drag8=${elapsed/1_000_000.0} ms commit=${commit/1_000_000.0} ms lineSamples=${v.layers.values.first().last().samples().size}"
    )
}
