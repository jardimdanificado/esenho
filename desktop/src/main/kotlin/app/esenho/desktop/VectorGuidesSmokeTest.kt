package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.math.abs

/** Guide snapping and ruler state use the production engine and pointer routing. */
fun vectorGuidesSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 200, 200)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    v.layers[layer] =
        mutableListOf(
            VectorObject(
                "guided",
                mutableListOf(
                    VectorNode(30f, 30f, 1f),
                    VectorNode(60f, 30f, 1f),
                    VectorNode(60f, 60f, 1f),
                    VectorNode(30f, 60f, 1f),
                ),
                engine.captureVectorStyle(),
                true,
                0xff00ff00.toInt(),
            )
        )
    v.render()
    v.tool = VectorTool.SELECT
    v.selectedId = "guided"
    engine.canvasGuides.add(
        CanvasGuide(DrawingGuideType.LINE, listOf(listOf(GuidePoint(100f, 0f), GuidePoint(100f, 200f))))
    )
    engine.activeCanvasGuideIndex = 0
    engine.guideSnapEnabled = true
    // Object snapping stays off: only the guide contributes a candidate.
    v.selection.snapEnabled = false
    HandleMetrics.density = .5f
    engine.onTouchDown(45f, 45f)
    engine.onTouchMove(113f, 45f)
    engine.onTouchUp(113f, 45f)
    HandleMetrics.density = 1f
    val left = v.layers.getValue(layer).first().nodes.minOf { it.x }
    check(abs(left - 100f) < .05f) { "Object did not snap to guide: $left" }
    check(!v.rulersVisible)
    v.rulersVisible = true
    check(v.rulersVisible)
    println("Vector guides: guide snapping and ruler state OK")
}
