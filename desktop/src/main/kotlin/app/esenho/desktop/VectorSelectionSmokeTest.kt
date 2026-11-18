package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.math.abs
import org.json.JSONObject

fun vectorSelectionSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 256, 256)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = v.layers.getValue(engine.activeLayerIndex)
    val s = v.selection
    fun near(actual: Float, expected: Float) =
        check(abs(actual - expected) < .05f) { "$actual != $expected" }
    fun rect(id: String, x: Float, y: Float) =
        VectorObject(
            id,
            mutableListOf(
                VectorNode(x, y, .3f, 12, 4),
                VectorNode(x + 30, y),
                VectorNode(x + 30, y + 30),
                VectorNode(x, y + 30),
            ),
            engine.captureVectorStyle(),
            true,
            0xffc03020.toInt(),
        )
    layer.addAll(listOf(rect("a", 40f, 70f), rect("b", 130f, 70f)))
    v.render()
    v.tool = VectorTool.SELECT
    // Actual production pointer routing: marquee, shared drag, commit, undo and redo.
    engine.onTouchDown(10f, 20f)
    engine.onTouchMove(190f, 130f)
    engine.onTouchUp(190f, 130f)
    check(s.selectedIds == setOf("a", "b"))
    engine.onTouchDown(70f, 85f)
    engine.onTouchMove(75f, 91f)
    engine.onTouchUp(75f, 91f)
    near(layer[0].nodes[0].x, 45f)
    near(layer[1].nodes[0].x, 135f)
    check(engine.undo())
    near(v.layers.getValue(engine.activeLayerIndex)[0].nodes[0].x, 40f)
    check(engine.redo())
    near(v.layers.getValue(engine.activeLayerIndex)[1].nodes[0].x, 135f)
    check(engine.undo())
    s.all()
    // Eight resize handles scale both objects and preserve pressure/tilt.
    engine.onTouchDown(160f, 100f)
    engine.onTouchMove(190f, 130f)
    engine.onTouchUp(190f, 130f)
    near(s.bounds()!!.width, 150f)
    near(s.bounds()!!.height, 60f)
    near(s.objects.first().nodes.first().pressure, .3f)
    check(s.objects.first().nodes.first().tiltX == 12)
    check(engine.undo())
    s.all()
    // The separate circular handle rotates around the selection center.
    engine.onTouchDown(100f, 42f)
    engine.onTouchMove(143f, 85f)
    engine.onTouchUp(143f, 85f)
    near(s.bounds()!!.width, 30f)
    near(s.bounds()!!.height, 120f)
    check(engine.undo())
    s.all()
    s.transform(20f, 30f, 240f, 60f)
    near(s.bounds()!!.left, 20f)
    near(s.bounds()!!.width, 240f)
    check(engine.undo())
    s.all()
    s.transform(40f, 70f, 120f, 30f, 90f)
    near(s.bounds()!!.width, 30f)
    near(s.bounds()!!.height, 120f)
    check(engine.undo())
    s.all()
    s.group()
    val group = s.objects.first().groupId
    check(group != null && s.objects.all { it.groupId == group })
    s.clear()
    v.selectObject("a")
    check(s.objects.size == 2)
    s.copy()
    s.paste()
    check(s.objects.size == 2 && v.layers.getValue(engine.activeLayerIndex).size == 4)
    check(
        s.objects.all { it.groupId != group } && s.objects.map { it.groupId }.distinct().size == 1
    )
    s.delete()
    check(v.layers.getValue(engine.activeLayerIndex).size == 2)
    check(engine.undo())
    check(v.layers.getValue(engine.activeLayerIndex).size == 4)
    check(engine.undo())
    check(v.layers.getValue(engine.activeLayerIndex).size == 2)
    s.all()
    s.ungroup()
    check(s.objects.all { it.groupId == null })
    s.select("a", false)
    s.reorder(true)
    check(v.layers.getValue(engine.activeLayerIndex).last().id == "a")
    check(engine.undo())
    check(v.layers.getValue(engine.activeLayerIndex).first().id == "a")
    // Numeric edit, opacity/color and metadata participate in the same native history.
    v.setObjectColor(0xff0040dd.toInt())
    v.finishAppearanceEdit()
    check(s.objects.all { it.style.getInt("color") == 0xff0040dd.toInt() })
    s.select("a", false)
    s.rename("Cabeça")
    val a = v.selected!!
    s.toggleVisibility(a)
    val bitmap = Bitmap(256, 256)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(engine.activeLayerIndex, bitmap))
    check(bitmap.getPixel(55, 85) ushr 24 == 0) { "Hidden vector still rendered" }
    bitmap.recycle()
    check(!v.exportSvg().contains("M 40.0 70.0"))
    val saved = v.snapshot()
    v.restore(saved)
    val restored = v.layers.getValue(engine.activeLayerIndex).first { it.id == "a" }
    check(restored.name == "Cabeça" && !restored.visible)
    s.toggleVisibility(restored)
    s.toggleLock(restored)
    v.selectObject("a")
    val count = v.layers.getValue(engine.activeLayerIndex).size
    s.delete()
    check(v.layers.getValue(engine.activeLayerIndex).size == count)
    s.transform(0f, 0f, 30f, 30f)
    near(restored.nodes.first().x, 40f)
    s.clear()
    engine.onTouchDown(55f, 85f)
    engine.onTouchUp(55f, 85f)
    check(s.objects.isEmpty())
    check(engine.undo())
    check(!v.layers.getValue(engine.activeLayerIndex).first { it.id == "a" }.locked)
    s.all()
    s.align("top")
    check(s.objects.map { it.nodes.minOf { n -> n.y } }.distinct().size == 1)
    // Snap the left edge to the 16px grid, retaining a single undo operation.
    s.select("a", false)
    s.snapEnabled = true
    engine.onTouchDown(55f, 85f)
    engine.onTouchMove(46f, 85f)
    engine.onTouchUp(46f, 85f)
    near(v.selected!!.nodes.first().x, 32f)
    check(engine.undo())
    s.snapEnabled = false
    // Cancellation restores geometry and the selection without leaving a half-transformed object.
    s.all()
    val prior = s.objects.map { it.json().toString() }
    engine.onTouchDown(70f, 85f)
    engine.onTouchMove(75f, 90f)
    engine.cancelActiveStroke()
    check(s.objects.map { it.json().toString() } == prior)
    // Older project objects load with usable defaults for the new metadata.
    val legacy = JSONObject(rect("old", 0f, 0f).json().toString())
    listOf("name", "visible", "locked", "group").forEach { legacy.remove(it) }
    val old = VectorObject.read(legacy)
    check(old.visible && !old.locked && old.groupId == null)
    // Distribution retains endpoints and places the middle object at an equal center interval.
    v.layers.getValue(engine.activeLayerIndex).add(rect("c", 80f, 160f))
    s.all()
    s.distribute(true)
    val centers = s.objects.map { VectorSelection.VectorBounds.of(listOf(it))!!.cx }.sorted()
    near(centers[1] - centers[0], centers[2] - centers[1])
    val archive = java.io.ByteArrayOutputStream()
    EsenhoProjectIO.save(engine, archive)
    val expected = v.layers.values.flatten().map { it.json().toString() }
    EsenhoProjectIO.load(engine, archive.toByteArray().inputStream())
    check(v.layers.values.flatten().map { it.json().toString() } == expected) {
        "Project lost vector organization metadata"
    }
    val originalLayer = engine.activeLayerIndex
    val otherLayer = engine.addLayer()
    val other = rect("other", 40f, 70f)
    v.layers[otherLayer] = mutableListOf(other)
    v.render()
    engine.selectLayer(originalLayer)
    s.toggleVisibility(other)
    check(engine.activeLayerIndex == otherLayer)
    val hidden = Bitmap(256, 256)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(otherLayer, hidden))
    check(hidden.getPixel(55, 85) ushr 24 == 0)
    hidden.recycle()
    check(engine.undo())
    check(v.layers.getValue(otherLayer).single().visible)
    println(
        "Vector selection: marquee, shared move/scale/rotation, numeric transform, grouping, copy/paste, ordering, visibility/lock, snapping, alignment, distribution and undo OK"
    )
}
