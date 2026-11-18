package app.esenho.desktop

import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.math.abs

/** Mirror, skew, fine z-order and nested groups use the production selection engine. */
fun vectorAdvancedManipulationSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 240, 200)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    fun rect(id: String, x: Float) =
        VectorObject(
            id,
            mutableListOf(
                VectorNode(x, 20f, 1f),
                VectorNode(x + 30, 20f, 1f),
                VectorNode(x + 30, 50f, 1f),
                VectorNode(x, 50f, 1f),
            ),
            engine.captureVectorStyle(),
            true,
            null,
        )
    v.layers[layer] = mutableListOf(rect("a", 20f), rect("b", 70f), rect("c", 120f))
    v.render()
    val s = v.selection

    s.replace("a")
    val beforeX = v.layers.getValue(layer).first { it.id == "a" }.nodes.map { it.x }
    val bounds = s.bounds()!!
    s.flip(true)
    val flipped = v.layers.getValue(layer).first { it.id == "a" }
    check(flipped.nodes.map { it.x } == beforeX.map { 2 * bounds.cx - it })
    check(abs(s.bounds()!!.left - bounds.left) < .01f)
    check(engine.undo())

    s.replace("a")
    val original = v.layers.getValue(layer).first { it.id == "a" }.nodes.first().x
    val b = s.bounds()!!
    s.transform(b.left, b.top, b.width, b.height, 0f, .5f, .5f, 20f, 0f)
    check(abs(v.layers.getValue(layer).first { it.id == "a" }.nodes.first().x - original) > 1f)
    check(engine.undo())

    s.replace("a")
    s.reorderRelative(true)
    check(v.layers.getValue(layer).map { it.id } == listOf("b", "a", "c"))
    s.reorderRelative(false)
    check(v.layers.getValue(layer).map { it.id } == listOf("a", "b", "c"))

    s.replace("a")
    s.select("b", true)
    s.group("inner")
    val inner = v.groups.values.single()
    s.replace("a")
    s.select("b", true)
    s.group("outer")
    val outer = v.groups.values.first { it.id != inner.id }
    check(outer.parentId == inner.id)
    v.layers.getValue(layer).first { it.id == "c" }.groupId = inner.id
    s.select("a", false)
    check(s.selectedIds == setOf("a", "b"))
    s.select("c", false)
    check(s.selectedIds.size == 3) { "Nested group selection ${s.selectedIds}" }
    s.select("a", false)
    s.ungroup()
    check(!v.groups.containsKey(outer.id))
    check(v.groups.containsKey(inner.id))

    val project = v.snapshot()
    v.restore(project)
    check(v.groups.values.any { it.name == "inner" })
    check(v.layers.getValue(layer).any { it.groupId == inner.id })
    println("Vector manipulation: mirror, skew, z-order and nested groups OK")
}
