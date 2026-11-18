package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.math.abs

/** FK, IK, binding and deformation use the production renderer and project archive. */
fun vectorRigSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 256, 256)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    val root = v.createBone("Raiz", null, 60f, 0f)
    val child = v.createBone("Filho", root.id, 40f, 0f)
    val rig = v.skeleton!!
    check(rig.bones.size == 2)
    check(child.parentId == root.id)
    check(abs(child.worldX1 - 228f) < .01f && abs(child.worldY1 - 128f) < .01f)

    val obj =
        VectorObject(
            "skin",
            mutableListOf(
                VectorNode(220f, 120f, 1f),
                VectorNode(236f, 120f, 1f),
                VectorNode(236f, 140f, 1f),
                VectorNode(220f, 140f, 1f),
            ),
            engine.captureVectorStyle().apply { put("strokeEnabled", false) },
            true,
            0xffff0000.toInt(),
        )
    v.layers[layer] = mutableListOf(obj)
    v.selectedId = "skin"
    v.render()
    check(v.bindSelected(child.id, "cutout"))
    check(rig.bindings.single().targetId == "skin")
    v.poseBone(child.id, 90f)
    check(abs(child.worldX1 - 188f) < .01f && abs(child.worldY1 - 168f) < .01f)
    check(v.layers.getValue(layer).first().nodes.first().x == 220f) { "Binding mutated base geometry" }
    val bitmap = Bitmap(256, 256)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(layer, bitmap))
    check((bitmap.getPixel(188, 168) ushr 24) > 0) { "Skinned object was not rendered at the posed position" }
    bitmap.recycle()

    val error = v.solveRigIk(child.id, 150f, 200f)
    check(error < 5f) { "IK error $error" }
    check(abs(child.worldX1 - 150f) < 5f && abs(child.worldY1 - 200f) < 5f)

    val weights = mapOf(root.id to .4f, child.id to .6f)
    check(v.bindSelected(child.id, "smooth_path", weights))
    check(rig.bindings.single().weights.size == 2)
    v.render()

    val project = v.snapshot()
    v.restore(project)
    check(v.skeleton!!.bones.size == 2 && v.skeleton!!.bindings.size == 1)
    check(v.skeleton!!.bindings.single().weights.size == 2)
    println("Vector rig: FK, IK, cutout/smooth binding, render and project roundtrip OK")
}
