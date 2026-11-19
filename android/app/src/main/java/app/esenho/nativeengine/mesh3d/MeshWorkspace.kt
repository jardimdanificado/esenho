package app.esenho.nativeengine.mesh3d

import android.graphics.Bitmap
import app.esenho.nativeengine.EsenhoNativeBridge
import app.esenho.nativeengine.EsenhoEngine
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.cos
import kotlin.math.sin

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

    private var lastPointerX = 0f
    private var lastPointerY = 0f

    fun pointerDown(x: Float, y: Float) {
        lastPointerX = x
        lastPointerY = y
    }

    fun pointerMove(x: Float, y: Float) {
        val dx = x - lastPointerX
        val dy = y - lastPointerY
        lastPointerX = x
        lastPointerY = y
        if (dx != 0f || dy != 0f) orbit(dx, dy)
    }

    fun pointerUp() = Unit

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

    fun setRenderSettings(wireframe: Boolean? = null, cull: Boolean? = null, background: Int? = null) {
        edit()
        wireframe?.let { scene.wireframe = it }
        cull?.let { scene.cullBackfaces = it }
        background?.let { scene.background = it }
        render()
    }
}
