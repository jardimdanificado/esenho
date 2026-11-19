package app.esenho.nativeengine.mesh3d

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import app.esenho.nativeengine.EsenhoNativeBridge
import app.esenho.nativeengine.EsenhoEngine
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.cos
import kotlin.math.sin

data class MeshHit(val objectId: String, val faceIndex: Int, val distance: Float, val point: Vec3)

/** Editable triangle scenes. Geometry stays authoritative; the native layer holds rendered pixels. */
class MeshWorkspace(private val engine: EsenhoEngine) {
    var enabled = false
        private set
    var scene = Scene3D()
    var selectedId: String? = null
    var layerId: Int = -1
        private set
    private var rasterLayer: Int = -1
    private val undo = linkedMapOf<Long, String>()
    private val redo = linkedMapOf<Long, String>()

    val selected: Mesh3DObject?
        get() = selectedId?.let { scene.objectById(it) }

    fun reset() {
        scene = Scene3D()
        selectedId = null
        layerId = -1
        rasterLayer = -1
        undo.clear()
        redo.clear()
        enabled = false
    }

    fun switchMode(active: Boolean) {
        engine.cancelActiveStroke()
        if (enabled == active) return
        if (active) {
            rasterLayer = engine.activeLayerIndex
            layerId =
                layerId.takeIf { it >= 0 && engine.layers.any { layer -> layer.id == it } }
                    ?: engine.addLayer().also { engine.renameLayer(it, "3D") }
            engine.selectLayer(layerId)
            engine.clearSelection()
            engine.currentTool = app.esenho.nativeengine.ToolMode.BRUSH
        } else {
            engine.layers.firstOrNull { it.id == rasterLayer }?.let { engine.selectLayer(it.id) }
        }
        enabled = active
    }

    fun snapshot(): String =
        JSONObject()
            .put("enabled", enabled)
            .put("layerId", layerId)
            .put("scene", scene.json())
            .put("selectedId", selectedId)
            .toString()

    fun restore(value: String) {
        val j = JSONObject(value)
        scene = Scene3D.read(j.getJSONObject("scene"))
        layerId = j.optInt("layerId", -1)
        selectedId = j.optString("selectedId").takeIf { it.isNotEmpty() }
        enabled = j.optBoolean("enabled")
    }

    fun projectJson(): JSONObject {
        val j = JSONObject(snapshot())
        j.put("layerId", engine.layers.indexOfFirst { it.id == layerId })
        return j
    }

    fun loadProject(j: JSONObject?) {
        if (j == null) return
        val copy = JSONObject(j.toString())
        val index = copy.optInt("layerId", -1)
        copy.put("layerId", engine.layers.getOrNull(index)?.id ?: -1)
        restore(copy.toString())
        if (layerId < 0) layerId = -1
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

    fun edit(): Long {
        return engine.beginVectorEdit()
    }

    fun render() {
        if (!enabled || layerId < 0) return
        val width = engine.width
        val height = engine.height
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val pixels = IntArray(width * height)
        val depth = FloatArray(width * height)
        try {
            MeshRasterizer.render(scene, width, height, pixels, depth)
            bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
            EsenhoNativeBridge.nativeBeginLayerUpdate()
            EsenhoNativeBridge.nativeLayerClear(layerId)
            EsenhoNativeBridge.nativeLayerDrawBitmap(layerId, bitmap, 0, 0, width, height)
            EsenhoNativeBridge.nativeEndLayerUpdate()
        } finally {
            bitmap.recycle()
        }
        engine.captureCurrentFrame()
        engine.getRenderBitmap()
    }

    fun addCube(size: Float = 2f) {
        edit()
        switchMode(true)
        val h = size / 2
        val vertices =
            mutableListOf(
                Vec3(-h, -h, -h), Vec3(h, -h, -h), Vec3(h, h, -h), Vec3(-h, h, -h),
                Vec3(-h, -h, h), Vec3(h, -h, h), Vec3(h, h, h), Vec3(-h, h, h),
            )
        val faces = mutableListOf<MeshFace>()
        fun quad(a: Int, b: Int, c: Int, d: Int) {
            faces += MeshFace(intArrayOf(a, b, c))
            faces += MeshFace(intArrayOf(a, c, d))
        }
        quad(0, 1, 2, 3)
        quad(5, 4, 7, 6)
        quad(4, 0, 3, 7)
        quad(1, 5, 6, 2)
        quad(3, 2, 6, 7)
        quad(4, 5, 1, 0)
        val obj =
            Mesh3DObject(
                UUID.randomUUID().toString(),
                vertices,
                name = "Cubo",
                faces = faces,
            )
        scene.objects += obj
        selectedId = obj.id
        render()
    }

    fun addPlane(size: Float = 4f) {
        edit()
        switchMode(true)
        val h = size / 2
        val obj =
            Mesh3DObject(
                UUID.randomUUID().toString(),
                mutableListOf(Vec3(-h, 0f, -h), Vec3(h, 0f, -h), Vec3(h, 0f, h), Vec3(-h, 0f, h)),
                mutableListOf(Vec3.UP, Vec3.UP, Vec3.UP, Vec3.UP),
                mutableListOf(0f to 0f, 1f to 0f, 1f to 1f, 0f to 1f),
                mutableListOf(MeshFace(intArrayOf(0, 1, 2), intArrayOf(0, 1, 2), intArrayOf(0, 1, 2))),
                name = "Plano",
            )
        scene.objects += obj
        selectedId = obj.id
        render()
    }

    fun removeSelected() {
        val obj = selected ?: return
        edit()
        scene.objects.remove(obj)
        selectedId = null
        render()
    }

    fun setTransform(position: Vec3? = null, rotation: Vec3? = null, scale: Vec3? = null) {
        val obj = selected ?: return
        edit()
        position?.let { obj.transform.position = it }
        rotation?.let { obj.transform.rotation = it }
        scale?.let { obj.transform.scale = it }
        render()
    }

    var dragMode = "orbit"
    var gizmoMode = "move"
    var selectedFace: Int = -1
        private set
    private var gizmoAxis: Int = -1
    private var gizmoStart = Vec3.ZERO

    private fun viewProjection(width: Int, height: Int): Mat4 =
        scene.camera.projection(width.toFloat() / height.toFloat()) * scene.camera.view()

    fun projectPoint(point: Vec3): Pair<Float, Float>? {
        if (engine.width <= 0 || engine.height <= 0) return null
        val clip = viewProjection(engine.width, engine.height).transform(point)
        if (clip.w <= 1e-5f) return null
        val ndc = clip.projected()
        return ((ndc.x * .5f + .5f) * engine.width) to ((1f - (ndc.y * .5f + .5f)) * engine.height)
    }

    private fun screenRay(x: Float, y: Float): Pair<Vec3, Vec3>? {
        if (engine.width <= 0 || engine.height <= 0) return null
        val inverse = viewProjection(engine.width, engine.height).invert() ?: return null
        val ndcX = x / engine.width * 2f - 1f
        val ndcY = 1f - y / engine.height * 2f
        val near = inverse.transform(Vec3(ndcX, ndcY, -1f)).projected()
        val far = inverse.transform(Vec3(ndcX, ndcY, 1f)).projected()
        return near to (far - near).normalize()
    }

    fun pick(x: Float, y: Float): MeshHit? {
        val ray = screenRay(x, y) ?: return null
        val origin = ray.first
        val direction = ray.second
        var best: MeshHit? = null
        scene.objects.filter { it.visible }.forEachIndexed { objectIndex, obj ->
            val matrix = obj.transform.matrix()
            obj.faces.forEachIndexed { faceIndex, face ->
                for (i in 1 until face.vertices.size - 1) {
                    val a = matrix.transform(obj.vertices.getOrNull(face.vertices[0]) ?: return@forEachIndexed).projected()
                    val b = matrix.transform(obj.vertices.getOrNull(face.vertices[i]) ?: return@forEachIndexed).projected()
                    val c = matrix.transform(obj.vertices.getOrNull(face.vertices[i + 1]) ?: return@forEachIndexed).projected()
                    val edge1 = b - a
                    val edge2 = c - a
                    val p = direction.cross(edge2)
                    val determinant = edge1.dot(p)
                    if (kotlin.math.abs(determinant) < 1e-6f) continue
                    val inverse = 1f / determinant
                    val offset = origin - a
                    val u = offset.dot(p) * inverse
                    if (u < 0f || u > 1f) continue
                    val q = offset.cross(edge1)
                    val v = direction.dot(q) * inverse
                    if (v < 0f || u + v > 1f) continue
                    val distance = edge2.dot(q) * inverse
                    if (distance <= 0f) continue
                    if (best == null || distance < best!!.distance) {
                        best =
                            MeshHit(
                                obj.id,
                                faceIndex,
                                distance,
                                origin + direction * distance,
                            )
                    }
                }
            }
        }
        return best
    }

    private var lastPointerX = 0f
    private var lastPointerY = 0f

    fun pointerDown(x: Float, y: Float) {
        lastPointerX = x
        lastPointerY = y
        val hit = pick(x, y)
        if (hit != null) {
            selectedId = hit.objectId
            selectedFace = hit.faceIndex
        }
        gizmoAxis = hitGizmoAxis(x, y)
        if (gizmoAxis >= 0) gizmoStart = selected?.transform?.position ?: Vec3.ZERO
    }

    fun pointerMove(x: Float, y: Float) {
        val dx = x - lastPointerX
        val dy = y - lastPointerY
        lastPointerX = x
        lastPointerY = y
        if (dx == 0f && dy == 0f) return
        if (gizmoAxis >= 0) {
            applyGizmo(dx, dy)
            return
        }
        if (dragMode == "pan") pan(dx, dy) else orbit(dx, dy)
    }

    fun pointerUp() {
        gizmoAxis = -1
    }

    private fun hitGizmoAxis(x: Float, y: Float): Int {
        val obj = selected ?: return -1
        val origin = obj.transform.position
        val center = projectPoint(origin) ?: return -1
        if (kotlin.math.hypot(center.first - x, center.second - y) < 14f) return 0
        val length = (scene.camera.position - origin).length() * .12f
        listOf(Vec3(length, 0f, 0f), Vec3(0f, length, 0f), Vec3(0f, 0f, length)).forEachIndexed { axis, delta ->
            val end = projectPoint(origin + delta) ?: return@forEachIndexed
            if (kotlin.math.hypot(end.first - x, end.second - y) < 12f) return axis
        }
        return -1
    }

    private fun applyGizmo(dx: Float, dy: Float) {
        val obj = selected ?: return
        val factor = (scene.camera.position - obj.transform.position).length() * .004f
        when (gizmoMode) {
            "rotate" -> {
                val rotation = obj.transform.rotation
                val delta = (dx + dy) * .5f
                obj.transform.rotation =
                    when (gizmoAxis) {
                        0 -> Vec3(rotation.x + delta, rotation.y, rotation.z)
                        1 -> Vec3(rotation.x, rotation.y + delta, rotation.z)
                        else -> Vec3(rotation.x, rotation.y, rotation.z + delta)
                    }
            }
            "scale" -> {
                val amount = 1f + (dx + dy) * .005f
                val scale = obj.transform.scale
                obj.transform.scale = Vec3(scale.x * amount, scale.y * amount, scale.z * amount)
            }
            else -> {
                val position = obj.transform.position
                obj.transform.position =
                    when (gizmoAxis) {
                        0 -> Vec3(position.x + dx * factor, position.y, position.z)
                        1 -> Vec3(position.x, position.y - dy * factor, position.z)
                        else -> Vec3(position.x, position.y, position.z + (dx - dy) * factor)
                    }
            }
        }
        render()
    }

    fun pan(dx: Float, dy: Float) {
        edit()
        val camera = scene.camera
        val forward = (camera.target - camera.position).normalize()
        val right = forward.cross(camera.up).normalize()
        val up = right.cross(forward).normalize()
        val scale = (camera.position - camera.target).length() * .002f
        val offset = right * (-dx * scale) + up * (dy * scale)
        camera.position = camera.position + offset
        camera.target = camera.target + offset
        render()
    }

    fun orbit(dx: Float, dy: Float) {
        edit()
        val camera = scene.camera
        val offset = camera.position - camera.target
        val yaw = dx * .01f
        val pitch = dy * .01f
        val cosY = cos(yaw)
        val sinY = sin(yaw)
        val rotated =
            Vec3(
                offset.x * cosY - offset.z * sinY,
                offset.y + pitch * offset.length(),
                offset.x * sinY + offset.z * cosY,
            )
        camera.position = camera.target + rotated
        render()
    }

    fun zoom(factor: Float) {
        edit()
        val camera = scene.camera
        val offset = camera.position - camera.target
        camera.position = camera.target + offset * factor.coerceIn(.2f, 5f)
        render()
    }

    fun importObj(text: String) {
        val imported = ObjReader.read(text)
        edit()
        switchMode(true)
        scene = imported
        selectedId = scene.objects.firstOrNull()?.id
        render()
    }

    fun exportObj(withMetadata: Boolean = true) = ObjIO.write(scene, withMetadata)

    fun drawOverlay(canvas: Canvas) {
        val obj = selected ?: return
        val scale = engine.vectorViewScale.coerceAtLeast(.01f)
        val line =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = 0xff4ba3ff.toInt()
                style = Paint.Style.STROKE
                strokeWidth = 1.5f / scale
            }
        val dot =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = 0xffffffff.toInt()
                style = Paint.Style.FILL
            }
        val projected = obj.vertices.map { projectPoint(it) }
        obj.faces.forEach { face ->
            for (i in face.vertices.indices) {
                val a = projected.getOrNull(face.vertices[i]) ?: return@forEach
                val b = projected.getOrNull(face.vertices[(i + 1) % face.vertices.size]) ?: return@forEach
                canvas.drawLine(a.first, a.second, b.first, b.second, line)
            }
        }
        projected.forEach { point ->
            if (point != null) canvas.drawCircle(point.first, point.second, 3f / scale, dot)
        }
        val origin = obj.transform.position
        val center = projectPoint(origin) ?: return
        val length = (scene.camera.position - origin).length() * .12f
        val axes = listOf(Vec3(length, 0f, 0f), Vec3(0f, length, 0f), Vec3(0f, 0f, length))
        val colors = listOf(0xffff5555.toInt(), 0xff55ff55.toInt(), 0xff5599ff.toInt())
        axes.forEachIndexed { index, delta ->
            val end = projectPoint(origin + delta) ?: return@forEachIndexed
            line.color = colors[index]
            canvas.drawLine(center.first, center.second, end.first, end.second, line)
            canvas.drawCircle(end.first, end.second, 5f / scale, line)
        }
    }

    fun setRenderSettings(wireframe: Boolean? = null, cull: Boolean? = null, background: Int? = null) {
        edit()
        wireframe?.let { scene.wireframe = it }
        cull?.let { scene.cullBackfaces = it }
        background?.let { scene.background = it }
        render()
    }
}
