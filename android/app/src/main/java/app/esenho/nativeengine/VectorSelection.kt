package app.esenho.nativeengine

import android.graphics.Canvas
import android.graphics.Paint
import kotlin.math.*
import org.json.JSONObject

/** Selection and geometry edits stay within the active vector layer, sharing its undo snapshot. */
class VectorSelection(private val engine: EsenhoEngine, private val workspace: VectorWorkspace) {
    private val ids = linkedSetOf<String>()
    val selectedIds: Set<String>
        get() = ids.toSet()

    val objects: List<VectorObject>
        get() = workspace.layers[engine.activeLayerIndex].orEmpty().filter { it.id in ids }

    var primary: String? = null
        private set

    var additive = false
    var pointerAdditive = false
    private val adding
        get() = additive || pointerAdditive

    var snapEnabled = false
    var gridSize = 16f
    private var clipboard: List<String> = emptyList()
    private var original = emptyList<VectorObject>()
    private var dragBounds: VectorBounds? = null
    private var startX = 0f
    private var startY = 0f
    private var currentX = 0f
    private var currentY = 0f
    private var dragHandle = -1
    private var token = 0L
    private var beforeIds = emptySet<String>()
    private var guideX: Float? = null
    private var guideY: Float? = null

    fun replace(id: String?) {
        ids.clear()
        if (id != null) ids.add(id)
        primary = id
    }

    private fun setIds(values: Collection<String>) {
        ids.clear()
        val available = workspace.layers[engine.activeLayerIndex].orEmpty().map { it.id }.toSet()
        ids.addAll(values.filter { it in available })
        primary = ids.lastOrNull()
    }

    fun select(id: String, toggle: Boolean = adding) {
        val obj = workspace.layers[engine.activeLayerIndex]?.firstOrNull { it.id == id } ?: return
        val group =
            if (obj.groupId == null) listOf(obj)
            else
                workspace.layers[engine.activeLayerIndex].orEmpty().filter {
                    it.groupId == obj.groupId
                }
        val values = group.map { it.id }
        if (!toggle) setIds(values)
        else if (values.all { it in ids }) setIds(ids - values.toSet()) else setIds(ids + values)
    }

    fun all() =
        setIds(
            workspace.layers[engine.activeLayerIndex]
                .orEmpty()
                .filter { it.visible && !it.locked }
                .map { it.id }
        )

    fun clear() = replace(null)

    fun bounds(): VectorBounds? = VectorBounds.of(objects)

    private fun editable() =
        objects.takeIf { list -> list.none { it.locked || !it.visible } }.orEmpty()

    fun down(x: Float, y: Float, hit: VectorObject?) {
        workspace.finishPen()
        setIds(ids.toList())
        startX = x
        startY = y
        currentX = x
        currentY = y
        token = 0L
        beforeIds = selectedIds
        val bounds = bounds()
        dragHandle =
            if (!adding && editable().size == objects.size)
                bounds?.handles(engine.vectorViewScale)?.indexOfFirst {
                    hypot(it.first - x, it.second - y) <
                        HandleMetrics.dp(HandleMetrics.SELECT_HIT_DP, engine.vectorViewScale)
                } ?: -1
            else -1
        if (dragHandle >= 0) {
            dragBounds = bounds
        } else {
            if (hit == null) {
                if (!adding) clear()
                dragHandle = -2 // Marquee, including an additive marquee on touch devices.
            } else if (adding || hit.id !in ids) select(hit.id)
            dragBounds = bounds()
        }
        original = editable().map { VectorObject.read(it.json()) }
    }

    fun move(x: Float, y: Float) {
        currentX = x
        currentY = y
        if (dragHandle == -2 || original.isEmpty() || (x == startX && y == startY)) return
        if (adding && dragHandle < 0) return // Add/remove clicks must not also move the object.
        if (token == 0L) token = engine.beginVectorEdit()
        val bounds = dragBounds ?: return
        guideX = null
        guideY = null
        val transform: (Float, Float) -> Pair<Float, Float>
        if (dragHandle == 8) {
            val angle =
                atan2(y - bounds.cy, x - bounds.cx) - atan2(startY - bounds.cy, startX - bounds.cx)
            val c = cos(angle)
            val s = sin(angle)
            transform = { px, py ->
                (bounds.cx + (px - bounds.cx) * c - (py - bounds.cy) * s) to
                    (bounds.cy + (px - bounds.cx) * s + (py - bounds.cy) * c)
            }
        } else if (dragHandle >= 0) {
            val handle = bounds.handles(engine.vectorViewScale)[dragHandle]
            val opposite = bounds.handles(engine.vectorViewScale)[(dragHandle + 4) % 8]
            val target = snap(x, y, emptyList())
            val sx =
                if (abs(handle.first - opposite.first) < .001f) 1f
                else
                    ((target.first - opposite.first) / (handle.first - opposite.first)).let {
                        if (abs(it) < .001f) .001f else it
                    }
            val sy =
                if (abs(handle.second - opposite.second) < .001f) 1f
                else
                    ((target.second - opposite.second) / (handle.second - opposite.second)).let {
                        if (abs(it) < .001f) .001f else it
                    }
            transform = { px, py ->
                (opposite.first + (px - opposite.first) * sx) to
                    (opposite.second + (py - opposite.second) * sy)
            }
        } else {
            val dx = x - startX
            val dy = y - startY
            val snapped =
                snap(
                    bounds.left + dx,
                    bounds.top + dy,
                    listOf(bounds.width / 2 to bounds.height / 2, bounds.width to bounds.height),
                )
            transform = { px, py ->
                (px + snapped.first - bounds.left) to (py + snapped.second - bounds.top)
            }
        }
        original.forEach { source ->
            val target = objects.firstOrNull { it.id == source.id } ?: return@forEach
            val sourceNodes = source.allNodes()
            target.allNodes().forEachIndexed { index, node ->
                val n = sourceNodes[index]
                val a = transform(n.x, n.y)
                val b = transform(n.inX, n.inY)
                val c = transform(n.outX, n.outY)
                node.x = a.first
                node.y = a.second
                node.inX = b.first
                node.inY = b.second
                node.outX = c.first
                node.outY = c.second
            }
        }
    }

    private fun guideCandidates(x: Float, y: Float): List<Pair<Float, Float>> {
        val result = mutableListOf<Pair<Float, Float>>()
        engine.canvasGuides.forEachIndexed { index, guide ->
            if (
                !engine.snapToAllVisibleGuides &&
                    index != engine.activeCanvasGuideIndex &&
                    index !in engine.snapGuideIndices
            )
                return@forEachIndexed
            guide.paths.forEach { path ->
                path.zipWithNext().forEach { (a, b) ->
                    val dx = b.x - a.x
                    val dy = b.y - a.y
                    val length = dx * dx + dy * dy
                    val t = if (length == 0f) 0f else ((x - a.x) * dx + (y - a.y) * dy) / length
                    val point = t.coerceIn(0f, 1f)
                    result += (a.x + point * dx) to (a.y + point * dy)
                }
            }
        }
        return result
    }

    private fun snap(x: Float, y: Float, offsets: List<Pair<Float, Float>>): Pair<Float, Float> {
        if (!snapEnabled && !engine.guideSnapEnabled) return x to y
        val tolerance = 8f / engine.vectorViewScale
        val xs = mutableListOf<Float>()
        val ys = mutableListOf<Float>()
        if (snapEnabled) {
            xs.addAll(listOf(0f, engine.width / 2f, engine.width.toFloat()))
            ys.addAll(listOf(0f, engine.height / 2f, engine.height.toFloat()))
            workspace.layers[engine.activeLayerIndex]
                .orEmpty()
                .filter { it.id !in ids && it.visible }
                .forEach {
                    VectorBounds.of(listOf(it))?.let { b ->
                        xs.addAll(listOf(b.left, b.cx, b.right))
                        ys.addAll(listOf(b.top, b.cy, b.bottom))
                    }
                }
            xs += round(x / gridSize) * gridSize
            ys += round(y / gridSize) * gridSize
        }
        if (engine.guideSnapEnabled)
            guideCandidates(x, y).forEach { (gx, gy) ->
                xs += gx
                ys += gy
            }
        if (xs.isEmpty() && ys.isEmpty()) return x to y
        val candidates = listOf(0f to 0f) + offsets
        val bx = candidates.flatMap { o -> xs.map { it - o.first } }.minByOrNull { abs(it - x) }
        val by = candidates.flatMap { o -> ys.map { it - o.second } }.minByOrNull { abs(it - y) }
        val nx = bx?.takeIf { abs(it - x) <= tolerance } ?: x
        val ny = by?.takeIf { abs(it - y) <= tolerance } ?: y
        if (nx != x) guideX = nx
        if (ny != y) guideY = ny
        return nx to ny
    }

    fun up(x: Float, y: Float) {
        move(x, y)
        if (dragHandle == -2 && hypot(x - startX, y - startY) > 3f / engine.vectorViewScale) {
            val box = VectorBounds(min(x, startX), min(y, startY), max(x, startX), max(y, startY))
            val found =
                workspace.layers[engine.activeLayerIndex].orEmpty().filter {
                    it.visible &&
                        !it.locked &&
                        VectorBounds.of(listOf(it))?.let(box::contains) == true
                }
            val values =
                found.flatMap { obj ->
                    if (obj.groupId == null) listOf(obj.id)
                    else
                        workspace.layers[engine.activeLayerIndex]
                            .orEmpty()
                            .filter { it.groupId == obj.groupId && !it.locked && it.visible }
                            .map { it.id }
                }
            setIds((if (adding) beforeIds else emptySet()) + values)
        } else if (token != 0L) workspace.render()
        finish()
    }

    fun finish() {
        dragHandle = -1
        original = emptyList()
        dragBounds = null
        token = 0L
        guideX = null
        guideY = null
    }

    fun cancel() {
        if (token != 0L) engine.undo()
        setIds(beforeIds)
        finish()
    }

    private fun edit(action: (List<VectorObject>) -> Unit) {
        val targets = editable()
        if (targets.isEmpty()) return
        workspace.finishAppearanceEdit()
        engine.beginVectorEdit()
        action(targets)
        workspace.render()
    }

    fun transform(
        x: Float,
        y: Float,
        width: Float,
        height: Float,
        degrees: Float = 0f,
        pivotX: Float = .5f,
        pivotY: Float = .5f,
    ) {
        if (
            listOf(x, y, width, height, degrees, pivotX, pivotY).any { !it.isFinite() } ||
                width < 0 ||
                height < 0
        )
            return
        val b = bounds() ?: return
        val sx = if (b.width > .001f) width / b.width else 1f
        val sy = if (b.height > .001f) height / b.height else 1f
        val px = x + width * pivotX
        val py = y + height * pivotY
        val r = degrees * PI.toFloat() / 180f
        val c = cos(r)
        val s = sin(r)
        edit { targets ->
            targets.forEach { obj ->
                obj.allNodes().forEach { n ->
                    fun point(a: Float, z: Float): Pair<Float, Float> {
                        val ax = x + (a - b.left) * sx
                        val ay = y + (z - b.top) * sy
                        return (px + (ax - px) * c - (ay - py) * s) to
                            (py + (ax - px) * s + (ay - py) * c)
                    }
                    val a = point(n.x, n.y)
                    val i = point(n.inX, n.inY)
                    val o = point(n.outX, n.outY)
                    n.x = a.first
                    n.y = a.second
                    n.inX = i.first
                    n.inY = i.second
                    n.outX = o.first
                    n.outY = o.second
                }
            }
        }
    }

    private fun units(targets: List<VectorObject>) =
        targets.groupBy { it.groupId ?: it.id }.values.toList()

    fun align(axis: String) {
        val b = bounds() ?: return
        edit { targets ->
            units(targets).forEach { unit ->
                val a = VectorBounds.of(unit) ?: return@forEach
                val dx =
                    when (axis) {
                        "left" -> b.left - a.left
                        "center" -> b.cx - a.cx
                        "right" -> b.right - a.right
                        else -> 0f
                    }
                val dy =
                    when (axis) {
                        "top" -> b.top - a.top
                        "middle" -> b.cy - a.cy
                        "bottom" -> b.bottom - a.bottom
                        else -> 0f
                    }
                unit.forEach { obj -> obj.allNodes().forEach { it.move(dx, dy) } }
            }
        }
    }

    fun distribute(horizontal: Boolean) {
        val sorted =
            units(editable()).sortedBy { unit ->
                VectorBounds.of(unit)!!.let { if (horizontal) it.cx else it.cy }
            }
        if (sorted.size < 3) return
        val first = VectorBounds.of(sorted.first())!!
        val last = VectorBounds.of(sorted.last())!!
        val start = if (horizontal) first.cx else first.cy
        val end = if (horizontal) last.cx else last.cy
        edit {
            sorted.forEachIndexed { index, unit ->
                val b = VectorBounds.of(unit)!!
                val shift =
                    start + (end - start) * index / (sorted.size - 1) -
                        if (horizontal) b.cx else b.cy
                unit.forEach { obj ->
                    obj.allNodes().forEach {
                        it.move(if (horizontal) shift else 0f, if (horizontal) 0f else shift)
                    }
                }
            }
        }
    }

    fun boolean(operation: VectorBooleanOperation) {
        val targets = objects
        if (!VectorBoolean.eligible(targets)) return
        // Compute and validate before consuming history or replacing source objects.
        val result = VectorBoolean.combine(targets, operation)
        workspace.finishAppearanceEdit()
        workspace.finishPen()
        engine.beginVectorEdit()
        val layer = workspace.layers.getValue(engine.activeLayerIndex)
        val insertion = layer.indexOf(targets.first())
        layer.removeAll(targets.toSet())
        if (result != null) layer.add(insertion.coerceAtMost(layer.size), result)
        replace(result?.id)
        workspace.render()
    }

    /** The topmost selected object becomes a reusable clip; the others are masked by it. */
    fun createClip() {
        val layer = workspace.layers[engine.activeLayerIndex] ?: return
        val targets = editable()
        if (targets.size < 2) return
        val clip = targets.maxByOrNull { layer.indexOf(it) } ?: return
        edit { _ ->
            targets.forEach { obj ->
                if (obj === clip) {
                    obj.isClip = true
                    obj.fill = null
                    obj.style.put("strokeEnabled", false)
                } else {
                    if (obj.isClip)
                        layer.forEach { other -> if (other.clipOf == obj.id) other.clipOf = null }
                    obj.isClip = false
                    obj.clipOf = clip.id
                }
            }
            replace(clip.id)
        }
    }

    /** Turning a clip back into a normal object also frees everything it masked. */
    fun releaseClip() {
        val layer = workspace.layers[engine.activeLayerIndex] ?: return
        val clips = editable().filter { it.isClip }
        if (clips.isEmpty()) return
        edit { _ ->
            clips.forEach { clip ->
                clip.isClip = false
                layer.forEach { obj -> if (obj.clipOf == clip.id) obj.clipOf = null }
            }
        }
    }

    fun group() {
        if (editable().size > 1)
            edit { targets ->
                val id = java.util.UUID.randomUUID().toString()
                targets.forEach { it.groupId = id }
            }
    }

    fun ungroup() = edit { targets -> targets.forEach { it.groupId = null } }

    fun rename(name: String) = edit { targets ->
        targets.forEach { it.name = name.trim().take(120) }
    }

    private fun activate(obj: VectorObject): Boolean {
        val layer =
            workspace.layers.entries.firstOrNull { (_, objects) -> objects.any { it.id == obj.id } }
                ?: return false
        if (engine.activeLayerIndex != layer.key) {
            engine.cancelActiveStroke()
            engine.selectLayer(layer.key)
            replace(obj.id)
        }
        return true
    }

    fun toggleVisibility(obj: VectorObject) {
        if (!activate(obj)) return
        workspace.finishPen()
        engine.beginVectorEdit()
        obj.visible = !obj.visible
        workspace.render()
    }

    fun toggleLock(obj: VectorObject) {
        if (!activate(obj)) return
        workspace.finishPen()
        engine.beginVectorEdit()
        obj.locked = !obj.locked
    }

    fun reorder(front: Boolean) = edit { targets ->
        val layer = workspace.layers.getValue(engine.activeLayerIndex)
        layer.removeAll(targets.toSet())
        layer.addAll(if (front) layer.size else 0, targets)
    }

    fun copy() {
        clipboard = objects.map { it.json().toString() }
    }

    fun paste() {
        if (
            clipboard.isEmpty() ||
                !workspace.enabled ||
                engine.activeLayerIndex !in workspace.layers
        )
            return
        engine.beginVectorEdit()
        val groups = mutableMapOf<String, String>()
        val copies =
            clipboard.map {
                VectorObject.read(JSONObject(it))
                    .copy(id = java.util.UUID.randomUUID().toString())
                    .also { obj ->
                        obj.groupId =
                            obj.groupId?.let {
                                groups.getOrPut(it) { java.util.UUID.randomUUID().toString() }
                            }
                        obj.locked = false
                        obj.visible = true
                        obj.allNodes().forEach { it.move(12f, 12f) }
                    }
            }
        workspace.layers.getOrPut(engine.activeLayerIndex) { mutableListOf() }.addAll(copies)
        setIds(copies.map { it.id })
        workspace.render()
    }

    fun duplicate() {
        copy()
        paste()
    }

    fun delete() = edit { targets ->
        workspace.layers.getValue(engine.activeLayerIndex).removeAll(targets.toSet())
        clear()
    }

    fun draw(canvas: Canvas, paint: Paint) {
        if (dragHandle == -2)
            canvas.drawRect(
                min(startX, currentX),
                min(startY, currentY),
                max(startX, currentX),
                max(startY, currentY),
                paint,
            )
        objects.filter { it.visible }.forEach { canvas.drawPath(it.path(), paint) }
        val b = bounds() ?: return
        canvas.drawRect(b.left, b.top, b.right, b.bottom, paint)
        if (editable().size != objects.size) return
        val handles = b.handles(engine.vectorViewScale)
        canvas.drawLine(b.cx, b.top, handles[8].first, handles[8].second, paint)
        val r = HandleMetrics.dp(HandleMetrics.SELECT_DOT_DP, engine.vectorViewScale)
        val fill =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = 0xffffffff.toInt()
                style = Paint.Style.FILL
            }
        handles.forEachIndexed { i, p ->
            if (i == 8) {
                canvas.drawCircle(p.first, p.second, r, fill)
                canvas.drawCircle(p.first, p.second, r, paint)
            } else {
                canvas.drawRect(p.first - r, p.second - r, p.first + r, p.second + r, fill)
                canvas.drawRect(p.first - r, p.second - r, p.first + r, p.second + r, paint)
            }
        }
        guideX?.let { canvas.drawLine(it, 0f, it, engine.height.toFloat(), paint) }
        guideY?.let { canvas.drawLine(0f, it, engine.width.toFloat(), it, paint) }
    }

    data class VectorBounds(val left: Float, val top: Float, val right: Float, val bottom: Float) {
        val width
            get() = right - left

        val height
            get() = bottom - top

        val cx
            get() = (left + right) / 2

        val cy
            get() = (top + bottom) / 2

        fun contains(b: VectorBounds) =
            b.left >= left && b.top >= top && b.right <= right && b.bottom <= bottom

        fun handles(scale: Float): List<Pair<Float, Float>> =
            listOf(
                left to top,
                cx to top,
                right to top,
                right to cy,
                right to bottom,
                cx to bottom,
                left to bottom,
                left to cy,
                cx to (top - HandleMetrics.dp(HandleMetrics.SELECT_ROT_OFFSET_DP, scale)),
            )

        companion object {
            fun of(objects: List<VectorObject>): VectorBounds? {
                val points = objects.flatMap { obj -> obj.strokes().flatMap { it.samples() } }
                if (points.isEmpty()) return null
                return VectorBounds(
                    points.minOf { it.x },
                    points.minOf { it.y },
                    points.maxOf { it.x },
                    points.maxOf { it.y },
                )
            }
        }
    }
}
