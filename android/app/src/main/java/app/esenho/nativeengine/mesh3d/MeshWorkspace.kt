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

enum class MeshTool { SELECT, ORBIT, PAN, MOVE, ROTATE, SCALE, VERTEX, FACE }

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
        releaseBuffers()
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
            .put("animation", animation.json())
            .toString()

    fun restore(value: String) {
        val j = JSONObject(value)
        scene = Scene3D.read(j.getJSONObject("scene"))
        layerId = j.optInt("layerId", -1)
        selectedId = j.optString("selectedId").takeIf { it.isNotEmpty() }
        animation.load(j.optJSONObject("animation"))
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

    val animation = app.esenho.nativeengine.VectorAnimation(this)
    var previewScale = 1f

    companion object {
        const val CAMERA_TRACK = "__camera__"
        const val LIGHT_TRACK = "__light__"
    }

    fun keyframeObject(frame: Int, easing: String = "linear") {
        val obj = selected ?: return
        val t = obj.transform
        animation.addKeyframe(
            obj.id, frame, t.position.x, t.position.y, t.rotation.x, t.scale.x, 1f, easing,
        )
        render()
    }

    fun keyframeCamera(frame: Int, easing: String = "linear") {
        val camera = scene.camera
        animation.addKeyframe(CAMERA_TRACK, frame, camera.position.x, camera.position.y, 0f, camera.fov, 1f, easing)
        render()
    }

    fun keyframeLight(frame: Int, easing: String = "linear") {
        val light = scene.lights.firstOrNull() ?: return
        animation.addKeyframe(LIGHT_TRACK, frame, 0f, 0f, 0f, 1f, light.intensity, easing, light.color)
        render()
    }

    fun seekFrame(frame: Int) {
        animation.currentFrame = frame.coerceIn(0, animation.duration - 1)
        render()
    }

    private var renderBitmap: Bitmap? = null
    private var pixelBuffer: IntArray? = null
    private var depthBuffer: FloatArray? = null

    private fun ensureBuffers(width: Int, height: Int) {
        val current = renderBitmap
        if (current == null || current.isRecycled || current.width != width || current.height != height) {
            renderBitmap?.recycle()
            renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            pixelBuffer = IntArray(width * height)
            depthBuffer = FloatArray(width * height)
        }
    }

    private fun animatedScene(): Scene3D {
        val frame = animation.currentFrame
        val copy = Scene3D()
        copy.name = scene.name
        copy.camera = scene.camera.copy()
        copy.lights = scene.lights.map { it.copy() }.toMutableList()
        copy.ambient = scene.ambient
        copy.background = scene.background
        copy.wireframe = scene.wireframe
        copy.cullBackfaces = scene.cullBackfaces
        animation.tracks[CAMERA_TRACK]?.let { track ->
            animation.valueAt(track, frame)?.let { value ->
                copy.camera.position = Vec3(value.x, value.y, copy.camera.position.z)
                if (value.scale in 5f..150f) copy.camera.fov = value.scale
            }
        }
        animation.tracks[LIGHT_TRACK]?.let { track ->
            animation.valueAt(track, frame)?.let { value ->
                value.fill?.let { copy.lights.firstOrNull()?.color = it }
                copy.lights.firstOrNull()?.intensity = value.opacity
            }
        }
        copy.objects.addAll(
            scene.objects.map { obj ->
                val value = animation.evaluate(obj.id, frame) ?: return@map obj
                val animated = obj.copy(transform = obj.transform.copy())
                animated.transform.position = Vec3(value.x, value.y, obj.transform.position.z)
                animated.transform.rotation = Vec3(value.rotation, obj.transform.rotation.y, obj.transform.rotation.z)
                animated.transform.scale = Vec3(value.scale, value.scale, value.scale)
                animated
            },
        )
        return copy
    }

    fun render() {
        if (!enabled || layerId < 0) return
        val width = maxOf(1, (engine.width * previewScale).toInt())
        val height = maxOf(1, (engine.height * previewScale).toInt())
        ensureBuffers(width, height)
        val bitmap = renderBitmap!!
        val pixels = pixelBuffer!!
        val depth = depthBuffer!!
        MeshRasterizer.render(animatedScene(), width, height, pixels, depth)
        bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
        EsenhoNativeBridge.nativeBeginLayerUpdate()
        EsenhoNativeBridge.nativeLayerClear(layerId)
        EsenhoNativeBridge.nativeLayerDrawBitmap(layerId, bitmap, 0, 0, engine.width, engine.height)
        EsenhoNativeBridge.nativeEndLayerUpdate()
        if (previewScale >= 1f) {
            engine.captureCurrentFrame()
            engine.getRenderBitmap()
        }
    }

    fun releaseBuffers() {
        renderBitmap?.recycle()
        renderBitmap = null
        pixelBuffer = null
        depthBuffer = null
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

    fun addCylinder(radius: Float = 1f, height: Float = 2f, segments: Int = 16) {
        edit()
        switchMode(true)
        val sides = segments.coerceIn(3, 64)
        val vertices = mutableListOf<Vec3>()
        val normals = mutableListOf<Vec3>()
        repeat(sides) { i ->
            val angle = i.toFloat() / sides * 2f * Math.PI.toFloat()
            vertices += Vec3(cos(angle) * radius, -height / 2, sin(angle) * radius)
            normals += Vec3(cos(angle), 0f, sin(angle))
        }
        repeat(sides) { i ->
            val angle = i.toFloat() / sides * 2f * Math.PI.toFloat()
            vertices += Vec3(cos(angle) * radius, height / 2, sin(angle) * radius)
            normals += Vec3(cos(angle), 0f, sin(angle))
        }
        val faces = mutableListOf<MeshFace>()
        repeat(sides) { i ->
            val next = (i + 1) % sides
            faces += MeshFace(intArrayOf(i, next, sides + next), intArrayOf(), intArrayOf(i, next, sides + next))
            faces += MeshFace(intArrayOf(i, sides + next, sides + i), intArrayOf(), intArrayOf(i, sides + next, sides + i))
        }
        val bottomCenter = vertices.size
        vertices += Vec3(0f, -height / 2, 0f)
        normals += Vec3(0f, -1f, 0f)
        val topCenter = vertices.size
        vertices += Vec3(0f, height / 2, 0f)
        normals += Vec3(0f, 1f, 0f)
        repeat(sides) { i ->
            val next = (i + 1) % sides
            faces += MeshFace(intArrayOf(bottomCenter, next, i))
            faces += MeshFace(intArrayOf(topCenter, sides + i, sides + next))
        }
        val obj =
            Mesh3DObject(
                UUID.randomUUID().toString(),
                vertices,
                normals,
                name = "Cilindro",
                faces = faces,
            )
        scene.objects += obj
        selectedId = obj.id
        selectedFace = -1
        selectedVertex = -1
        render()
    }

    fun addSphere(radius: Float = 1f, segments: Int = 16, rings: Int = 12) {
        edit()
        switchMode(true)
        val cols = segments.coerceIn(3, 64)
        val rows = rings.coerceIn(2, 48)
        val vertices = mutableListOf<Vec3>()
        val normals = mutableListOf<Vec3>()
        val uvs = mutableListOf<Pair<Float, Float>>()
        for (row in 0..rows) {
            val v = row.toFloat() / rows
            val phi = v * Math.PI.toFloat()
            for (col in 0..cols) {
                val u = col.toFloat() / cols
                val theta = u * 2f * Math.PI.toFloat()
                val normal = Vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta))
                normals += normal
                vertices += normal * radius
                uvs += u to v
            }
        }
        val faces = mutableListOf<MeshFace>()
        for (row in 0 until rows) {
            for (col in 0 until cols) {
                val a = row * (cols + 1) + col
                val b = a + cols + 1
                faces += MeshFace(intArrayOf(a, b, a + 1), intArrayOf(a, b, a + 1), intArrayOf(a, b, a + 1))
                faces += MeshFace(intArrayOf(a + 1, b, b + 1), intArrayOf(a + 1, b, b + 1), intArrayOf(a + 1, b, b + 1))
            }
        }
        val obj =
            Mesh3DObject(
                UUID.randomUUID().toString(),
                vertices,
                normals,
                uvs,
                faces,
                name = "Esfera",
                smooth = true,
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

    fun pickVertex(x: Float, y: Float): Int {
        val obj = selected ?: return -1
        var best = -1
        var bestDistance = 14f
        obj.vertices.forEachIndexed { index, vertex ->
            val matrix = obj.transform.matrix()
            val screen = projectPoint(matrix.transform(vertex).projected()) ?: return@forEachIndexed
            val distance = kotlin.math.hypot(screen.first - x, screen.second - y)
            if (distance < bestDistance) {
                bestDistance = distance
                best = index
            }
        }
        return best
    }

    private fun setVertexInternal(index: Int, position: Vec3) {
        val obj = selected ?: return
        if (index !in obj.vertices.indices) return
        obj.vertices[index] = position
        obj.normals.clear()
        render()
    }

    fun setVertex(index: Int, position: Vec3) {
        edit()
        setVertexInternal(index, position)
    }

    fun deleteFace(index: Int) {
        val obj = selected ?: return
        if (index !in obj.faces.indices || obj.faces.size <= 1) return
        edit()
        obj.faces.removeAt(index)
        selectedFace = -1
        render()
    }

    fun extrudeFace(index: Int, distance: Float = .5f) {
        val obj = selected ?: return
        val face = obj.faces.getOrNull(index) ?: return
        edit()
        val matrix = obj.transform.matrix()
        val world =
            face.vertices.map { obj.vertices.getOrNull(it)?.let { v -> matrix.transform(v).projected() } }
        if (world.any { it == null }) return
        val a = world[0]!!
        val b = world.getOrNull(1) ?: a
        val c = world.getOrNull(2) ?: b
        val normal = (b - a).cross(c - a).normalize()
        val duplicated = mutableListOf<Int>()
        face.vertices.forEach { source ->
            val original = obj.vertices[source]
            val offset = normal * distance
            duplicated += obj.vertices.size
            obj.vertices += original + offset
            obj.normals += normal
        }
        val top = MeshFace(duplicated.toIntArray(), face.texCoords.copyOf(), face.normals.copyOf(), face.material)
        val sides = mutableListOf<MeshFace>()
        for (i in face.vertices.indices) {
            val next = (i + 1) % face.vertices.size
            sides +=
                MeshFace(
                    intArrayOf(face.vertices[i], face.vertices[next], duplicated[next], duplicated[i]),
                    intArrayOf(),
                    intArrayOf(),
                    face.material,
                )
        }
        obj.faces[index] = top
        obj.faces.addAll(sides)
        selectedFace = index
        render()
    }

    fun boolean(operation: MeshBooleanOp, secondId: String): Boolean {
        val first = selected ?: return false
        val second = scene.objectById(secondId) ?: return false
        val result = MeshBoolean.combine(first, second, operation) ?: return false
        edit()
        scene.objects.remove(first)
        scene.objects.remove(second)
        scene.objects += result
        selectedId = result.id
        selectedFace = -1
        selectedVertex = -1
        render()
        return true
    }

    fun setMaterial(color: Int? = null, opacity: Float? = null, shininess: Float? = null) {
        val obj = selected ?: return
        edit()
        val material = obj.materials.firstOrNull() ?: MeshMaterial().also { obj.materials += it }
        color?.let { material.diffuse = it }
        opacity?.let { material.opacity = it.coerceIn(0f, 1f) }
        shininess?.let { material.shininess = it.coerceIn(1f, 200f) }
        render()
    }

    fun setSmooth(enabled: Boolean) {
        val obj = selected ?: return
        edit()
        obj.smooth = enabled
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

    var tool = MeshTool.SELECT
    var selectedFace: Int = -1
        private set
    var selectedVertex: Int = -1
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
        gizmoAxis = -1
        previewScale = .5f
        when (tool) {
            MeshTool.VERTEX -> {
                selectedVertex = pickVertex(x, y)
                if (selectedVertex >= 0) {
                    gizmoAxis = 0
                    edit()
                }
            }
            MeshTool.FACE -> {
                val hit = pick(x, y)
                if (hit != null) {
                    selectedId = hit.objectId
                    selectedFace = hit.faceIndex
                }
            }
            MeshTool.ORBIT, MeshTool.PAN -> Unit
            else -> {
                val hit = pick(x, y)
                if (hit != null) {
                    selectedId = hit.objectId
                    selectedFace = hit.faceIndex
                }
                gizmoAxis = hitGizmoAxis(x, y)
                if (gizmoAxis >= 0) {
                    edit()
                    gizmoStart = selected?.transform?.position ?: Vec3.ZERO
                }
            }
        }
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
        when (tool) {
            MeshTool.PAN -> pan(dx, dy)
            MeshTool.ORBIT -> orbit(dx, dy)
            else -> Unit
        }
    }

    fun pointerUp() {
        gizmoAxis = -1
        previewScale = 1f
        render()
    }

    private fun hitGizmoAxis(x: Float, y: Float): Int {
        val obj = selected ?: return -1
        val origin = obj.transform.position
        val center = projectPoint(origin) ?: return -1
        if (kotlin.math.hypot(center.first - x, center.second - y) < 18f) return 0
        val length = (scene.camera.position - origin).length() * .12f
        listOf(Vec3(length, 0f, 0f), Vec3(0f, length, 0f), Vec3(0f, 0f, length)).forEachIndexed { axis, delta ->
            val end = projectPoint(origin + delta) ?: return@forEachIndexed
            if (kotlin.math.hypot(end.first - x, end.second - y) < 16f) return axis
        }
        return -1
    }

    private fun applyGizmo(dx: Float, dy: Float) {
        val obj = selected ?: return
        val factor = (scene.camera.position - obj.transform.position).length() * .004f
        if (tool == MeshTool.VERTEX && selectedVertex >= 0) {
            val current = obj.vertices[selectedVertex]
            setVertexInternal(
                selectedVertex,
                when (gizmoAxis) {
                    0 -> Vec3(current.x + dx * factor, current.y, current.z)
                    1 -> Vec3(current.x, current.y - dy * factor, current.z)
                    else -> Vec3(current.x, current.y, current.z + (dx - dy) * factor)
                },
            )
            return
        }
        when (tool) {
            MeshTool.ROTATE -> {
                val rotation = obj.transform.rotation
                val delta = (dx + dy) * .5f
                obj.transform.rotation =
                    when (gizmoAxis) {
                        0 -> Vec3(rotation.x + delta, rotation.y, rotation.z)
                        1 -> Vec3(rotation.x, rotation.y + delta, rotation.z)
                        else -> Vec3(rotation.x, rotation.y, rotation.z + delta)
                    }
            }
            MeshTool.SCALE -> {
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
                strokeWidth = 2.5f / scale
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
            canvas.drawCircle(end.first, end.second, 7f / scale, line)
        }
        line.color = 0xffffffff.toInt()
        canvas.drawRect(center.first - 6f / scale, center.second - 6f / scale, center.first + 6f / scale, center.second + 6f / scale, line)
    }

    fun setRenderSettings(wireframe: Boolean? = null, cull: Boolean? = null, background: Int? = null) {
        edit()
        wireframe?.let { scene.wireframe = it }
        cull?.let { scene.cullBackfaces = it }
        background?.let { scene.background = it }
        render()
    }
}
