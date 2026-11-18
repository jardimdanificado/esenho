package app.esenho.nativeengine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import kotlin.math.*
import org.json.JSONArray
import org.json.JSONObject

/** Editable geometry is authoritative; native layer pixels are its rendered cache. */
enum class VectorTool(val label: String) {
    DRAW("Pincel vetorial"),
    PEN("Caneta Bézier"),
    ERASER("Apagar objeto"),
    SELECT("Objetos"),
    NODES("Nós"),
    LINE("Linha"),
    RECT("Retângulo"),
    ELLIPSE("Elipse"),
}

enum class VectorNodeType(val label: String) {
    CORNER("Angular"),
    SMOOTH("Suave"),
    SYMMETRIC("Simétrico"),
}

data class VectorNode(
    var x: Float,
    var y: Float,
    var pressure: Float = .85f,
    var tiltX: Int = 0,
    var tiltY: Int = 0,
    var inX: Float = x,
    var inY: Float = y,
    var outX: Float = x,
    var outY: Float = y,
    var type: VectorNodeType = VectorNodeType.CORNER,
) {
    fun move(dx: Float, dy: Float) {
        x += dx
        y += dy
        inX += dx
        inY += dy
        outX += dx
        outY += dy
    }

    /**
     * Smooth nodes keep both handles on one line, preserving their lengths.
     * Symmetric nodes also force equal lengths. [moved] is 1 for the in handle,
     * 2 for the out handle, and 0 when the type itself is being changed.
     */
    fun balanceHandles(moved: Int = 0) {
        if (type == VectorNodeType.CORNER) return
        val li = hypot(inX - x, inY - y)
        val lo = hypot(outX - x, outY - y)
        if (li < .0001f && lo < .0001f) return
        val fromIn = moved == 1 || (moved == 0 && li > lo)
        val useIn = fromIn && li >= .0001f || !fromIn && lo < .0001f
        val ux: Float
        val uy: Float
        if (useIn) {
            ux = -(inX - x) / li
            uy = -(inY - y) / li
        } else {
            ux = (outX - x) / lo
            uy = (outY - y) / lo
        }
        if (type == VectorNodeType.SYMMETRIC) {
            val length =
                when (moved) {
                    1 -> li
                    2 -> lo
                    else -> max(li, lo)
                }
            outX = x + ux * length
            outY = y + uy * length
            inX = x - ux * length
            inY = y - uy * length
        } else {
            outX = x + ux * lo
            outY = y + uy * lo
            inX = x - ux * li
            inY = y - uy * li
        }
    }

    fun json() =
        JSONArray(listOf(x, y, pressure, tiltX, tiltY, inX, inY, outX, outY, type.name))
}

/** Extra contours belong to the same filled object; they may bound holes or separate islands. */
data class VectorContour(val nodes: MutableList<VectorNode>, var closed: Boolean)

data class VectorObject(
    val id: String,
    val nodes: MutableList<VectorNode>,
    var style: JSONObject,
    var closed: Boolean = false,
    var fill: Int? = null,
    var name: String = "",
    var visible: Boolean = true,
    var locked: Boolean = false,
    var groupId: String? = null,
    val subPaths: MutableList<VectorContour> = mutableListOf(),
    var evenOdd: Boolean = false,
) {
    fun geometry(): List<VectorContour> = listOf(VectorContour(nodes, closed)) + subPaths

    fun allNodes(): List<VectorNode> = geometry().flatMap { it.nodes }

    fun strokes(): List<VectorObject> =
        geometry().map { copy(nodes = it.nodes, closed = it.closed, subPaths = mutableListOf()) }

    fun path() =
        Path().apply {
            fillType = if (evenOdd) Path.FillType.EVEN_ODD else Path.FillType.WINDING
            geometry().forEach { contour ->
                val n = contour.nodes
                if (n.isNotEmpty()) {
                    moveTo(n[0].x, n[0].y)
                    for (i in 1 until n.size) {
                        val a = n[i - 1]
                        val b = n[i]
                        cubicTo(a.outX, a.outY, b.inX, b.inY, b.x, b.y)
                    }
                    if (contour.closed) {
                        val a = n.last()
                        val b = n.first()
                        cubicTo(a.outX, a.outY, b.inX, b.inY, b.x, b.y)
                        close()
                    }
                }
            }
        }

    /** Adaptive flattening bounds curve error and avoids replaying straight lines every 2 px. */
    fun samples(): List<VectorNode> {
        if (nodes.size < 2) return nodes
        val result = mutableListOf(nodes.first().copy())
        val count = if (closed) nodes.size else nodes.size - 1
        repeat(count) { i ->
            val a = nodes[i]
            val b = nodes[(i + 1) % nodes.size]
            fun flatten(
                x0: Float,
                y0: Float,
                x1: Float,
                y1: Float,
                x2: Float,
                y2: Float,
                x3: Float,
                y3: Float,
                t0: Float,
                t1: Float,
                depth: Int,
            ) {
                val chord = hypot(x3 - x0, y3 - y0)
                val polygon =
                    hypot(x1 - x0, y1 - y0) + hypot(x2 - x1, y2 - y1) + hypot(x3 - x2, y3 - y2)
                val error =
                    if (chord > .0001f)
                        max(
                            abs((x1 - x0) * (y3 - y0) - (y1 - y0) * (x3 - x0)),
                            abs((x2 - x0) * (y3 - y0) - (y2 - y0) * (x3 - x0)),
                        ) / chord
                    else polygon
                val dynamics =
                    (t1 - t0) * abs(b.pressure - a.pressure) <= .05f &&
                        (t1 - t0) * max(abs(b.tiltX - a.tiltX), abs(b.tiltY - a.tiltY)) <= 3f
                if (
                    depth >= 12 ||
                        (chord <= 32f && error <= .25f && polygon - chord <= .25f && dynamics)
                ) {
                    result.add(
                        VectorNode(
                            x3,
                            y3,
                            a.pressure * (1 - t1) + b.pressure * t1,
                            (a.tiltX * (1 - t1) + b.tiltX * t1).roundToInt(),
                            (a.tiltY * (1 - t1) + b.tiltY * t1).roundToInt(),
                        )
                    )
                    return
                }
                val ax = (x0 + x1) / 2
                val ay = (y0 + y1) / 2
                val bx = (x1 + x2) / 2
                val by = (y1 + y2) / 2
                val cx = (x2 + x3) / 2
                val cy = (y2 + y3) / 2
                val dx = (ax + bx) / 2
                val dy = (ay + by) / 2
                val ex = (bx + cx) / 2
                val ey = (by + cy) / 2
                val mx = (dx + ex) / 2
                val my = (dy + ey) / 2
                val tm = (t0 + t1) / 2
                flatten(x0, y0, ax, ay, dx, dy, mx, my, t0, tm, depth + 1)
                flatten(mx, my, ex, ey, cx, cy, x3, y3, tm, t1, depth + 1)
            }
            flatten(a.x, a.y, a.outX, a.outY, b.inX, b.inY, b.x, b.y, 0f, 1f, 0)
        }
        return result
    }

    fun json() =
        JSONObject()
            .put("id", id)
            .put("nodes", JSONArray().also { a -> nodes.forEach { a.put(it.json()) } })
            .put("style", style)
            .put("closed", closed)
            .put("fill", fill)
            .put("name", name)
            .put("visible", visible)
            .put("locked", locked)
            .put("group", groupId)
            .put("evenOdd", evenOdd)
            .put(
                "subPaths",
                JSONArray().also { paths ->
                    subPaths.forEach { contour ->
                        paths.put(
                            JSONObject()
                                .put("closed", contour.closed)
                                .put(
                                    "nodes",
                                    JSONArray().also { a ->
                                        contour.nodes.forEach { a.put(it.json()) }
                                    },
                                )
                        )
                    }
                },
            )

    companion object {
        fun read(j: JSONObject): VectorObject {
            val points = j.getJSONArray("nodes")
            val nodes =
                MutableList(points.length()) { i ->
                    val a = points.getJSONArray(i)
                    VectorNode(
                        a.getDouble(0).toFloat(),
                        a.getDouble(1).toFloat(),
                        a.getDouble(2).toFloat(),
                        a.getInt(3),
                        a.getInt(4),
                        a.getDouble(5).toFloat(),
                        a.getDouble(6).toFloat(),
                        a.getDouble(7).toFloat(),
                        a.getDouble(8).toFloat(),
                        runCatching { VectorNodeType.valueOf(a.optString(9, "CORNER")) }
                            .getOrDefault(VectorNodeType.CORNER),
                    )
                }
            return VectorObject(
                j.getString("id"),
                nodes,
                j.getJSONObject("style"),
                j.optBoolean("closed"),
                if (j.isNull("fill")) null else j.getInt("fill"),
                j.optString("name", ""),
                j.optBoolean("visible", true),
                j.optBoolean("locked", false),
                if (j.isNull("group")) null else j.optString("group").takeIf { it.isNotEmpty() },
                mutableListOf<VectorContour>().also { paths ->
                    val a = j.optJSONArray("subPaths") ?: JSONArray()
                    repeat(a.length()) { i ->
                        val c = a.getJSONObject(i)
                        val objectData =
                            JSONObject()
                                .put("id", "contour")
                                .put("nodes", c.getJSONArray("nodes"))
                                .put("style", JSONObject())
                                .put("closed", c.optBoolean("closed"))
                        val obj = read(objectData)
                        paths.add(VectorContour(obj.nodes, obj.closed))
                    }
                },
                j.optBoolean("evenOdd", false),
            )
        }
    }
}

class VectorWorkspace(private val engine: EsenhoEngine) {
    var enabled = false
        private set

    var tool = VectorTool.DRAW
    val layers = linkedMapOf<Int, MutableList<VectorObject>>()
    val selection = VectorSelection(engine, this)
    var selectedId: String?
        get() = selection.primary
        set(value) {
            if (selection.primary != value) nodeIndex = -1
            selection.replace(value)
        }

    val selected: VectorObject?
        get() = layers.values.flatten().firstOrNull { it.id == selectedId }

    var editFillColor = false
    private var penPathId: String? = null
    private var appearanceToken = 0L

    fun finishAppearanceEdit() {
        appearanceToken = 0L
    }

    fun finishPen() {
        penPathId = null
    }

    private var rasterLayer = -1
    private var gestureBefore: String? = null
    private var gestureToken = 0L
    private var startX = 0f
    private var startY = 0f
    private var lastX = 0f
    private var lastY = 0f
    private var handle = -1
    private var nodeIndex = -1
    val selectedNode: VectorNode?
        get() = selected?.allNodes()?.getOrNull(nodeIndex)

    val selectedNodeIndex: Int
        get() = nodeIndex

    private val raw = mutableListOf<VectorNode>()
    private var strokeBase: Bitmap? = null

    private fun releaseStrokeBase() {
        strokeBase?.recycle()
        strokeBase = null
    }

    private val undo = linkedMapOf<Long, String>()
    private val redo = linkedMapOf<Long, String>()

    fun reset() {
        releaseStrokeBase()
        finishPen()
        finishAppearanceEdit()
        selection.finish()
        layers.clear()
        undo.clear()
        redo.clear()
        selectedId = null
        enabled = false
        gestureBefore = null
    }

    fun switchMode(vector: Boolean) {
        engine.cancelActiveStroke()
        finishPen()
        finishAppearanceEdit()
        engine.isAnimationPlaying = false
        if (enabled == vector) return
        if (vector) {
            rasterLayer = engine.activeLayerIndex
            val layer =
                layers.keys.firstOrNull { id -> engine.layers.any { it.id == id } }
                    ?: engine.addLayer().also {
                        layers[it] = mutableListOf()
                        engine.renameLayer(it, "Vetores")
                    }
            engine.selectLayer(layer)
            engine.clearSelection()
            engine.currentTool = ToolMode.BRUSH
        } else {
            engine.layers
                .firstOrNull { it.id == rasterLayer && it.id !in layers }
                ?.let { engine.selectLayer(it.id) }
                ?: engine.layers
                    .firstOrNull { it.id >= 3 && it.id !in layers }
                    ?.let { engine.selectLayer(it.id) }
                ?: engine.addLayer()
        }
        enabled = vector
    }

    fun snapshot(): String =
        JSONObject()
            .put("enabled", enabled)
            .put(
                "layers",
                JSONArray().also { arr ->
                    layers.forEach { (id, objects) ->
                        arr.put(
                            JSONObject()
                                .put("layer", id)
                                .put(
                                    "objects",
                                    JSONArray().also { a -> objects.forEach { a.put(it.json()) } },
                                )
                        )
                    }
                },
            )
            .toString()

    fun restore(value: String) {
        val j = JSONObject(value)
        layers.clear()
        val a = j.optJSONArray("layers") ?: JSONArray()
        repeat(a.length()) { i ->
            val l = a.getJSONObject(i)
            val objects = l.getJSONArray("objects")
            layers[l.getInt("layer")] =
                MutableList(objects.length()) { VectorObject.read(objects.getJSONObject(it)) }
        }
        enabled = j.optBoolean("enabled")
        selectedId = null
        finishPen()
        finishAppearanceEdit()
    }

    fun projectJson(): JSONObject {
        val j = JSONObject(snapshot())
        val a = j.getJSONArray("layers")
        repeat(a.length()) { i ->
            val l = a.getJSONObject(i)
            l.put("layer", engine.layers.indexOfFirst { it.id == l.getInt("layer") })
        }
        return j
    }

    fun loadProject(j: JSONObject?) {
        if (j == null) return
        val copy = JSONObject(j.toString())
        val a = copy.optJSONArray("layers") ?: JSONArray()
        repeat(a.length()) { i ->
            val l = a.getJSONObject(i)
            l.put("layer", engine.layers.getOrNull(l.getInt("layer"))?.id ?: -1)
        }
        restore(copy.toString())
        layers.remove(-1)
    }

    fun record(token: Long) {
        if (token == 0L) return
        redo.clear()
        undo[token] = snapshot()
        while (undo.size > engine.maxUndoSteps) undo.remove(undo.keys.first())
    }

    fun restoreHistory(token: Long, forward: Boolean) {
        val source = if (forward) redo else undo
        val target = if (forward) undo else redo
        source.remove(token)?.let { before ->
            target[token] = snapshot()
            restore(before)
        }
    }

    private fun ensureLayer(): MutableList<VectorObject> {
        if (engine.activeLayerIndex !in layers) {
            val id =
                layers.keys.firstOrNull { id -> engine.layers.any { it.id == id } }
                    ?: engine.addLayer().also {
                        layers[it] = mutableListOf()
                        engine.renameLayer(it, "Vetores")
                    }
            engine.selectLayer(id)
        }
        return layers.getValue(engine.activeLayerIndex)
    }

    private fun loadSelectedStyle() {
        val obj = selected ?: return
        val currentTool = engine.currentTool
        engine.restoreVectorStyle(obj.style)
        engine.currentTool = currentTool
        editFillColor = false
    }

    fun selectObject(id: String) {
        val layer =
            layers.entries.firstOrNull { (_, objects) -> objects.any { it.id == id } } ?: return
        finishAppearanceEdit()
        finishPen()
        engine.selectLayer(layer.key)
        nodeIndex = -1
        selection.select(id)
        loadSelectedStyle()
    }

    fun down(x: Float, y: Float, pressure: Float, tiltX: Int, tiltY: Int) {
        finishAppearanceEdit()
        val objects = ensureLayer()
        if (tool == VectorTool.ERASER) {
            selectedId =
                objects.asReversed().firstOrNull { it.visible && !it.locked && hit(it, x, y) }?.id
            deleteSelected()
            return
        }
        if (tool == VectorTool.PEN) {
            gestureBefore = snapshot()
            gestureToken = engine.beginVectorEdit()
            var obj = objects.firstOrNull { it.id == penPathId }
            if (
                obj != null &&
                    obj.nodes.size >= 3 &&
                    hypot(x - obj.nodes.first().x, y - obj.nodes.first().y) <=
                        12f / engine.vectorViewScale
            ) {
                obj.closed = true
                selectedId = obj.id
                finishPen()
                gestureBefore = null
                render()
                return
            }
            if (obj == null) {
                obj =
                    VectorObject(
                        java.util.UUID.randomUUID().toString(),
                        mutableListOf(),
                        engine.captureVectorStyle(),
                    )
                objects.add(obj)
                penPathId = obj.id
            }
            selectedId = obj.id
            obj.nodes.add(VectorNode(x, y, pressure, tiltX, tiltY))
            return
        }
        if (tool !in listOf(VectorTool.SELECT, VectorTool.NODES)) selectedId = null
        startX = x
        startY = y
        lastX = x
        lastY = y
        raw.clear()
        raw += VectorNode(x, y, pressure, tiltX, tiltY)
        nodeIndex = -1
        handle = -1
        gestureToken = 0L
        if (tool == VectorTool.SELECT) {
            selection.down(
                x,
                y,
                objects.asReversed().firstOrNull { it.visible && !it.locked && hit(it, x, y) },
            )
            loadSelectedStyle()
            gestureBefore = snapshot()
            return
        }
        if (tool == VectorTool.NODES) {
            if (tool == VectorTool.NODES || tool == VectorTool.PEN) {
                var best = 12f / engine.vectorViewScale
                selected?.allNodes()?.forEachIndexed { i, n ->
                    listOf(n.x to n.y, n.inX to n.inY, n.outX to n.outY).forEachIndexed { h, p ->
                        val distance = hypot(p.first - x, p.second - y)
                        if (distance < best) {
                            best = distance
                            nodeIndex = i
                            handle = h
                        }
                    }
                }
            }
            if (selected?.locked == true || selected?.visible == false) nodeIndex = -1
            if (nodeIndex < 0)
                selectedId =
                    objects
                        .asReversed()
                        .firstOrNull { obj -> obj.visible && !obj.locked && hit(obj, x, y) }
                        ?.id
            loadSelectedStyle()
        }
        gestureBefore = snapshot()
        if (tool != VectorTool.SELECT && tool != VectorTool.NODES) {
            gestureToken = engine.beginVectorEdit()
            if (tool == VectorTool.DRAW) {
                releaseStrokeBase()
                strokeBase =
                    Bitmap.createBitmap(engine.width, engine.height, Bitmap.Config.ARGB_8888)
                if (!EsenhoNativeBridge.nativeLayerGetBitmap(engine.activeLayerIndex, strokeBase!!))
                    releaseStrokeBase()
                engine.previewVectorPoint(0, raw.first())
            }
        }
    }

    fun move(x: Float, y: Float, pressure: Float, tiltX: Int, tiltY: Int) {
        if (gestureBefore == null) return
        if (tool == VectorTool.SELECT) {
            selection.move(x, y)
            return
        }
        if (tool != VectorTool.SELECT && tool != VectorTool.NODES) {
            lastX = x
            lastY = y
        }
        if (tool == VectorTool.PEN) {
            selected?.nodes?.lastOrNull()?.let { n ->
                n.outX = x
                n.outY = y
                n.inX = 2 * n.x - x
                n.inY = 2 * n.y - y
            }
            return
        }
        if (tool == VectorTool.SELECT || tool == VectorTool.NODES) {
            val obj = selected ?: return
            if (x == lastX && y == lastY) return
            if (gestureToken == 0L) gestureToken = engine.beginVectorEdit()
            val dx = x - lastX
            val dy = y - lastY
            if (nodeIndex >= 0) {
                val n = obj.allNodes()[nodeIndex]
                when (handle) {
                    1 -> {
                        n.inX += dx
                        n.inY += dy
                        n.balanceHandles(1)
                    }
                    2 -> {
                        n.outX += dx
                        n.outY += dy
                        n.balanceHandles(2)
                    }
                    else -> n.move(dx, dy)
                }
            } else if (tool == VectorTool.SELECT) obj.allNodes().forEach { it.move(dx, dy) }
            lastX = x
            lastY = y
        } else if (hypot(x - raw.last().x, y - raw.last().y) >= 2f) {
            val previous = raw.last()
            val point = VectorNode(x, y, pressure, tiltX, tiltY)
            raw += point
            if (tool == VectorTool.DRAW) engine.previewVectorPoint(1, point, previous)
        }
    }

    private fun gestureNodes(x: Float, y: Float): MutableList<VectorNode> =
        when (tool) {
            VectorTool.LINE -> mutableListOf(VectorNode(startX, startY), VectorNode(x, y))
            VectorTool.RECT ->
                mutableListOf(
                    VectorNode(startX, startY),
                    VectorNode(x, startY),
                    VectorNode(x, y),
                    VectorNode(startX, y),
                )
            VectorTool.ELLIPSE -> {
                val cx = (startX + x) / 2
                val cy = (startY + y) / 2
                val rx = abs(x - startX) / 2
                val ry = abs(y - startY) / 2
                val k = .55228475f
                mutableListOf(
                    VectorNode(
                        cx + rx,
                        cy,
                        inX = cx + rx,
                        inY = cy - ry * k,
                        outX = cx + rx,
                        outY = cy + ry * k,
                    ),
                    VectorNode(
                        cx,
                        cy + ry,
                        inX = cx + rx * k,
                        inY = cy + ry,
                        outX = cx - rx * k,
                        outY = cy + ry,
                    ),
                    VectorNode(
                        cx - rx,
                        cy,
                        inX = cx - rx,
                        inY = cy + ry * k,
                        outX = cx - rx,
                        outY = cy - ry * k,
                    ),
                    VectorNode(
                        cx,
                        cy - ry,
                        inX = cx - rx * k,
                        inY = cy - ry,
                        outX = cx + rx * k,
                        outY = cy - ry,
                    ),
                )
            }
            else -> {
                val simplified = mutableListOf(raw.first().copy())
                raw.drop(1).forEachIndexed { i, n ->
                    val last = simplified.last()
                    if (i == raw.size - 2 || hypot(n.x - last.x, n.y - last.y) >= 6f)
                        simplified += n.copy()
                }
                simplified.forEachIndexed { i, n ->
                    val a = simplified[max(0, i - 1)]
                    val b = simplified[min(simplified.lastIndex, i + 1)]
                    n.inX = n.x - (b.x - a.x) / 6
                    n.inY = n.y - (b.y - a.y) / 6
                    n.outX = n.x + (b.x - a.x) / 6
                    n.outY = n.y + (b.y - a.y) / 6
                }
                simplified
            }
        }

    fun up(x: Float, y: Float, pressure: Float, tiltX: Int, tiltY: Int) {
        if (gestureBefore == null) return
        if (tool == VectorTool.SELECT) {
            selection.up(x, y)
            gestureBefore = null
            raw.clear()
            return
        }
        if (tool == VectorTool.PEN) {
            move(x, y, pressure, tiltX, tiltY)
            render()
            gestureBefore = null
            return
        }
        if (
            (tool == VectorTool.RECT || tool == VectorTool.ELLIPSE) &&
                (abs(x - startX) < .01f || abs(y - startY) < .01f)
        ) {
            cancel()
            return
        }
        move(x, y, if (pressure > 0) pressure else raw.last().pressure, tiltX, tiltY)
        if (tool != VectorTool.SELECT && tool != VectorTool.NODES) {
            if (tool == VectorTool.DRAW) engine.previewVectorPoint(2, raw.last())
            val nodes = gestureNodes(x, y)
            val obj =
                VectorObject(
                    java.util.UUID.randomUUID().toString(),
                    nodes,
                    engine.captureVectorStyle(),
                    tool == VectorTool.RECT || tool == VectorTool.ELLIPSE,
                )
            ensureLayer().add(obj)
            selectedId = obj.id
            render(if (tool == VectorTool.DRAW && strokeBase == null) null else obj)
        } else if (gestureToken != 0L) render()
        gestureBefore = null
        raw.clear()
    }

    fun cancel() {
        val before = gestureBefore ?: return
        if (tool == VectorTool.SELECT) {
            selection.cancel()
            gestureBefore = null
            raw.clear()
            return
        }
        engine.endCurveStroke()
        if (gestureToken != 0L) {
            engine.undo()
        } else restore(before)
        gestureBefore = null
        raw.clear()
        releaseStrokeBase()
    }

    private fun hit(obj: VectorObject, x: Float, y: Float): Boolean {
        val contours = obj.strokes().map { it.samples() }
        val tolerance =
            max(
                12f / engine.vectorViewScale,
                if (obj.style.optBoolean("strokeEnabled", true))
                    obj.style.optDouble("size", 14.0).toFloat() / 2
                else 0f,
            )
        if (
            contours.any { points ->
                points.size == 1 && hypot(points[0].x - x, points[0].y - y) <= tolerance ||
                    points.zipWithNext().any { (a, b) ->
                        val dx = b.x - a.x
                        val dy = b.y - a.y
                        val length = dx * dx + dy * dy
                        val t =
                            if (length == 0f) 0f
                            else (((x - a.x) * dx + (y - a.y) * dy) / length).coerceIn(0f, 1f)
                        hypot(a.x + t * dx - x, a.y + t * dy - y) <= tolerance
                    }
            }
        )
            return true
        if (obj.fill == null) return false
        var winding = 0
        contours.forEach { points ->
            if (points.size < 2) return@forEach
            var a = points.last()
            points.forEach { b ->
                val cross = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)
                if (a.y <= y && b.y > y && cross > 0) winding++
                if (a.y > y && b.y <= y && cross < 0) winding--
                a = b
            }
        }
        return if (obj.evenOdd) abs(winding) % 2 == 1 else winding != 0
    }

    private fun editAppearance(action: (VectorObject) -> Unit) {
        val targets =
            selection.objects.takeIf { list ->
                list.isNotEmpty() && list.none { it.locked || !it.visible }
            } ?: return
        if (appearanceToken == 0L) appearanceToken = engine.beginVectorEdit()
        targets.forEach(action)
        render()
    }

    fun changeAppearance(action: (VectorObject) -> Unit) {
        finishAppearanceEdit()
        editAppearance(action)
        finishAppearanceEdit()
    }

    fun setObjectColor(color: Int) = editAppearance { obj ->
        if (editFillColor && (obj.closed || obj.style.optBoolean("svgStroke", false)))
            obj.fill = color
        else obj.style.put("color", color)
    }

    fun setObjectSize(size: Float) = editAppearance { obj ->
        obj.style.put("size", size)
        obj.style.optJSONObject("preset")?.put("size", size.toInt())
    }

    fun setObjectOpacity(opacity: Float) = editAppearance { obj ->
        obj.style.put("opacity", opacity)
        obj.style.optJSONObject("preset")?.put("opacity", (opacity * 100).toInt())
    }

    fun applyStyleEdit() = editAppearance { it.style = engine.captureVectorStyle() }

    fun changeSelected(action: (VectorObject) -> Unit) {
        val obj = selected?.takeIf { !it.locked && it.visible } ?: return
        finishAppearanceEdit()
        engine.beginVectorEdit()
        action(obj)
        render()
    }

    fun applyStyle() = changeAppearance { it.style = engine.captureVectorStyle() }

    fun cornerNode() = setNodeType(VectorNodeType.CORNER)

    fun setNodeType(type: VectorNodeType) = changeSelected { obj ->
        val (contour, index) = editingContour() ?: return@changeSelected
        val n = contour.nodes.getOrNull(index) ?: return@changeSelected
        n.type = type
        if (type == VectorNodeType.CORNER) {
            n.inX = n.x
            n.inY = n.y
            n.outX = n.x
            n.outY = n.y
            return@changeSelected
        }
        // A fresh node has both handles collapsed; seed them from its neighbours.
        if (hypot(n.inX - n.x, n.inY - n.y) < .0001f &&
            hypot(n.outX - n.x, n.outY - n.y) < .0001f
        ) {
            val nodes = contour.nodes
            val previous = when {
                index > 0 -> nodes[index - 1]
                contour.closed -> nodes.lastOrNull()
                else -> null
            }
            val next = when {
                index < nodes.lastIndex -> nodes[index + 1]
                contour.closed -> nodes.firstOrNull()
                else -> null
            }
            val dx: Float
            val dy: Float
            when {
                previous != null && next != null -> {
                    dx = next.x - previous.x
                    dy = next.y - previous.y
                }
                next != null -> {
                    dx = next.x - n.x
                    dy = next.y - n.y
                }
                previous != null -> {
                    dx = n.x - previous.x
                    dy = n.y - previous.y
                }
                else -> return@changeSelected
            }
            val length = hypot(dx, dy)
            if (length < .0001f) return@changeSelected
            val handle = (minOf(40f, length / 3f) / length)
            n.outX = n.x + dx * handle
            n.outY = n.y + dy * handle
            n.inX = n.x - dx * handle
            n.inY = n.y - dy * handle
        }
        n.balanceHandles()
    }

    /** Absolute coordinates for the active node, without touching its handles' offsets. */
    fun moveNode(x: Float, y: Float) = changeSelected {
        val n = selectedNode ?: return@changeSelected
        val dx = x - n.x
        val dy = y - n.y
        if (dx.isFinite() && dy.isFinite()) n.move(dx, dy)
    }

    fun setObjectCap(cap: String) = changeAppearance { it.style.put("cap", cap) }

    fun setObjectJoin(join: String) = changeAppearance { it.style.put("join", join) }

    fun setObjectMiter(miter: Float) =
        changeAppearance { it.style.put("miter", miter.toDouble()) }

    private fun editingContour(): Pair<VectorContour, Int>? {
        val obj = selected ?: return null
        var offset = 0
        obj.geometry().forEach { c ->
            if (nodeIndex in offset until offset + c.nodes.size) return c to (nodeIndex - offset)
            offset += c.nodes.size
        }
        return obj.geometry().firstOrNull()?.let { it to 0 }
    }

    fun removeNode() {
        val (contour, index) = editingContour() ?: return
        if (selectedNode == null || contour.nodes.size <= if (contour.closed) 3 else 2) return
        changeSelected { contour.nodes.removeAt(index) }
        nodeIndex = -1
    }

    fun splitSegment() {
        val (contour, index) = editingContour() ?: return
        val nodes = contour.nodes
        if (nodes.size < 2) return
        val i = if (!contour.closed && index == nodes.lastIndex) index - 1 else index
        val offset = selected!!.allNodes().indexOfFirst { it === nodes[i] }
        changeSelected {
            val a = nodes[i]
            val b = nodes[(i + 1) % nodes.size]
            val ax = (a.x + a.outX) / 2
            val ay = (a.y + a.outY) / 2
            val bx = (a.outX + b.inX) / 2
            val by = (a.outY + b.inY) / 2
            val cx = (b.inX + b.x) / 2
            val cy = (b.inY + b.y) / 2
            val dx = (ax + bx) / 2
            val dy = (ay + by) / 2
            val ex = (bx + cx) / 2
            val ey = (by + cy) / 2
            a.outX = ax
            a.outY = ay
            b.inX = cx
            b.inY = cy
            nodes.add(
                i + 1,
                VectorNode(
                    (dx + ex) / 2,
                    (dy + ey) / 2,
                    (a.pressure + b.pressure) / 2,
                    (a.tiltX + b.tiltX) / 2,
                    (a.tiltY + b.tiltY) / 2,
                    dx,
                    dy,
                    ex,
                    ey,
                ),
            )
        }
        nodeIndex = offset + 1
    }

    fun duplicateSelected() = selection.duplicate()

    fun scaleGeometry(
        sx: Float,
        sy: Float,
        layerId: Int? = null,
        offsetX: Float = 0f,
        offsetY: Float = 0f,
    ) {
        layers
            .filterKeys { layerId == null || it == layerId }
            .values
            .flatten()
            .forEach { obj ->
                val sizeScale = sqrt(abs(sx * sy))
                if (abs(sizeScale - 1f) > .0001f) {
                    val size = obj.style.optDouble("size", 14.0) * sizeScale
                    obj.style.put("size", size)
                    obj.style.optJSONObject("preset")?.put("size", size.toInt())
                }
                obj.allNodes().forEach { n ->
                    n.x = n.x * sx + offsetX
                    n.y = n.y * sy + offsetY
                    n.inX = n.inX * sx + offsetX
                    n.inY = n.inY * sy + offsetY
                    n.outX = n.outX * sx + offsetX
                    n.outY = n.outY * sy + offsetY
                }
            }
    }

    fun deleteSelected() = selection.delete()

    fun rasterize() {
        if (engine.activeLayerIndex !in layers) return
        engine.beginVectorEdit()
        layers.remove(engine.activeLayerIndex)
        selectedId = null
        switchMode(false)
    }

    fun render(append: VectorObject? = null) {
        val objects = layers[engine.activeLayerIndex] ?: return
        val saved = engine.captureVectorStyle()
        val tool = engine.currentTool
        var fillBitmap: Bitmap? = null
        var previousStyle: String? = null
        EsenhoNativeBridge.nativeBeginLayerUpdate()
        try {
            if (append == null || strokeBase != null)
                EsenhoNativeBridge.nativeLayerClear(engine.activeLayerIndex)
            strokeBase?.let { base ->
                EsenhoNativeBridge.nativeLayerDrawBitmap(
                    engine.activeLayerIndex,
                    base,
                    0,
                    0,
                    engine.width,
                    engine.height,
                )
            }
            (if (append == null) objects else listOf(append))
                .filter { it.visible }
                .forEach { obj ->
                    if (obj.style.optBoolean("svgStroke", false)) {
                        val bitmap =
                            fillBitmap
                                ?: Bitmap.createBitmap(
                                        engine.width,
                                        engine.height,
                                        Bitmap.Config.ARGB_8888,
                                    )
                                    .also { fillBitmap = it }
                        VectorSvgPaint.draw(obj, bitmap)
                        EsenhoNativeBridge.nativeLayerDrawBitmap(
                            engine.activeLayerIndex,
                            bitmap,
                            0,
                            0,
                            engine.width,
                            engine.height,
                        )
                        return@forEach
                    }
                    obj.fill?.let { color ->
                        val bitmap =
                            fillBitmap
                                ?: Bitmap.createBitmap(
                                        engine.width,
                                        engine.height,
                                        Bitmap.Config.ARGB_8888,
                                    )
                                    .also { fillBitmap = it }
                        bitmap.eraseColor(0)
                        run {
                            Canvas(bitmap)
                                .drawPath(
                                    obj.path(),
                                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                                        this.color = color
                                        style = Paint.Style.FILL
                                    },
                                )
                            EsenhoNativeBridge.nativeLayerDrawBitmap(
                                engine.activeLayerIndex,
                                bitmap,
                                0,
                                0,
                                engine.width,
                                engine.height,
                            )
                        }
                    }
                    val styleKey = obj.style.toString()
                    if (obj.style.optBoolean("strokeEnabled", true))
                        obj.strokes().forEach { stroke ->
                            engine.renderVectorStroke(
                                obj.style,
                                stroke.samples(),
                                configure = previousStyle != styleKey,
                            )
                            previousStyle = styleKey
                        }
                }
        } finally {
            engine.restoreVectorStyle(saved)
            engine.currentTool = tool
            EsenhoNativeBridge.nativeEndLayerUpdate()
            fillBitmap?.recycle()
            releaseStrokeBase()
        }
        engine.captureCurrentFrame()
        engine.getRenderBitmap()
    }

    fun drawOverlay(canvas: Canvas) {
        val scale = engine.vectorViewScale.coerceAtLeast(.01f)
        val paint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = 0xff4ba3ff.toInt()
                style = Paint.Style.STROKE
                strokeWidth = 1.5f / scale
            }
        if (tool == VectorTool.SELECT) selection.draw(canvas, paint)
        selected
            ?.takeIf { tool != VectorTool.SELECT && it.visible }
            ?.let { obj ->
                canvas.drawPath(obj.path(), paint)
                if (tool == VectorTool.NODES || tool == VectorTool.PEN) {
                    val fill =
                        Paint(Paint.ANTI_ALIAS_FLAG).apply {
                            color = 0xffffffff.toInt()
                            style = Paint.Style.FILL
                        }
                    obj.allNodes().forEachIndexed { index, n ->
                        if (hypot(n.inX - n.x, n.inY - n.y) > 1f / scale) {
                            canvas.drawLine(n.x, n.y, n.inX, n.inY, paint)
                            canvas.drawCircle(n.inX, n.inY, 3f / scale, fill)
                            canvas.drawCircle(n.inX, n.inY, 3f / scale, paint)
                        }
                        if (hypot(n.outX - n.x, n.outY - n.y) > 1f / scale) {
                            canvas.drawLine(n.x, n.y, n.outX, n.outY, paint)
                            canvas.drawCircle(n.outX, n.outY, 3f / scale, fill)
                            canvas.drawCircle(n.outX, n.outY, 3f / scale, paint)
                        }
                        val r = 4f / scale
                        fill.color =
                            if (
                                index == nodeIndex ||
                                    (tool == VectorTool.PEN && index == obj.nodes.lastIndex)
                            )
                                0xff4ba3ff.toInt()
                            else 0xffffffff.toInt()
                        canvas.drawRect(n.x - r, n.y - r, n.x + r, n.y + r, fill)
                        canvas.drawRect(n.x - r, n.y - r, n.x + r, n.y + r, paint)
                        fill.color = 0xffffffff.toInt()
                    }
                }
            }
        if (
            raw.isNotEmpty() && tool !in listOf(VectorTool.SELECT, VectorTool.NODES, VectorTool.PEN)
        ) {
            val path =
                if (tool in listOf(VectorTool.LINE, VectorTool.RECT, VectorTool.ELLIPSE)) {
                    VectorObject(
                            "preview",
                            gestureNodes(lastX, lastY),
                            JSONObject(),
                            tool != VectorTool.LINE,
                        )
                        .path()
                } else
                    Path().apply {
                        moveTo(raw[0].x, raw[0].y)
                        raw.drop(1).forEach { lineTo(it.x, it.y) }
                    }
            canvas.drawPath(path, paint)
            if (tool in listOf(VectorTool.LINE, VectorTool.RECT, VectorTool.ELLIPSE)) {
                canvas.drawCircle(startX, startY, 4f / scale, paint)
                canvas.drawCircle(lastX, lastY, 4f / scale, paint)
            }
        }
    }

    fun importSvg(svg: String) {
        // Parse completely before changing the current document.
        val objects = VectorSvgIO.readEditable(svg)
        switchMode(true)
        ensureLayer()
        engine.beginVectorEdit()
        layers.getValue(engine.activeLayerIndex).addAll(objects)
        selectedId = objects.lastOrNull()?.id
        render()
    }

    fun exportSvg(appearance: Boolean = false): String {
        fun xml(s: String) =
            s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
        fun rgb(c: Int) = String.format(java.util.Locale.ROOT, "#%06x", c and 0xffffff)
        return buildString {
            append(
                "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${engine.width}\" height=\"${engine.height}\" viewBox=\"0 0 ${engine.width} ${engine.height}\">"
            )
            append("<metadata id=\"esenho-vector\">${xml(projectJson().toString())}</metadata>")
            layers.forEach { (id, objects) ->
                val layer = engine.layers.firstOrNull { it.id == id } ?: return@forEach
                if (!layer.visible) return@forEach
                append("<g opacity=\"${layer.opacity/255f}\">")
                if (appearance) {
                    val bitmap =
                        Bitmap.createBitmap(engine.width, engine.height, Bitmap.Config.ARGB_8888)
                    try {
                        check(EsenhoNativeBridge.nativeLayerGetBitmap(id, bitmap))
                        val bytes = java.io.ByteArrayOutputStream()
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)
                        append(
                            "<image width=\"${engine.width}\" height=\"${engine.height}\" href=\"data:image/png;base64,${java.util.Base64.getEncoder().encodeToString(bytes.toByteArray())}\"/>"
                        )
                    } finally {
                        bitmap.recycle()
                    }
                } else
                    objects
                        .filter { it.nodes.isNotEmpty() && it.visible }
                        .forEach { obj ->
                            val d = buildString {
                                obj.geometry().forEach { contour ->
                                    val n = contour.nodes
                                    if (n.isNotEmpty()) {
                                        append("M ${n[0].x} ${n[0].y} ")
                                        if (n.size == 1) append("L ${n[0].x} ${n[0].y} ")
                                        for (i in 1 until n.size) {
                                            val a = n[i - 1]
                                            val b = n[i]
                                            append(
                                                "C ${a.outX} ${a.outY} ${b.inX} ${b.inY} ${b.x} ${b.y} "
                                            )
                                        }
                                        if (contour.closed) {
                                            val a = n.last()
                                            val b = n.first()
                                            append(
                                                "C ${a.outX} ${a.outY} ${b.inX} ${b.inY} ${b.x} ${b.y} Z "
                                            )
                                        }
                                    }
                                }
                            }
                            val color = obj.style.optInt("color", 0xff000000.toInt())
                            append(
                                "<path d=\"$d\" fill=\"${obj.fill?.let(::rgb) ?: "none"}\" fill-opacity=\"${obj.fill?.let { (it ushr 24)/255f } ?: 1f}\" stroke=\"${if(obj.style.optBoolean("strokeEnabled",true)) rgb(color) else "none"}\" stroke-width=\"${obj.style.optDouble("size",14.0)}\" stroke-opacity=\"${obj.style.optDouble("opacity",1.0)*(color ushr 24)/255.0}\" fill-rule=\"${if(obj.evenOdd) "evenodd" else "nonzero"}\" opacity=\"${obj.style.optDouble("svgOpacity",1.0)}\" stroke-linecap=\"${xml(obj.style.optString("cap","round"))}\" stroke-linejoin=\"${xml(obj.style.optString("join","round"))}\" stroke-miterlimit=\"${obj.style.optDouble("miter",4.0)}\" stroke-dasharray=\"${obj.style.optJSONArray("dash")?.let { a -> if(a.length()==0) "none" else (0 until a.length()).joinToString(",") { a.getDouble(it).toString() } } ?: "none"}\" stroke-dashoffset=\"${obj.style.optDouble("dashOffset",0.0)}\"/>"
                            )
                        }
                append("</g>")
            }
            append("</svg>")
        }
    }
}
