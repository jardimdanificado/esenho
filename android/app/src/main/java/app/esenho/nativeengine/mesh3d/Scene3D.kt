package app.esenho.nativeengine.mesh3d

import org.json.JSONArray
import org.json.JSONObject

data class MeshCamera(
    var position: Vec3 = Vec3(0f, 2f, 6f),
    var target: Vec3 = Vec3.ZERO,
    var up: Vec3 = Vec3.UP,
    var fov: Float = 50f,
    var near: Float = .1f,
    var far: Float = 1000f,
    var orthographic: Boolean = false,
    var orthoSize: Float = 8f,
) {
    fun view() = Mat4.lookAt(position, target, up)
    fun projection(aspect: Float) =
        if (orthographic) Mat4.orthographic(orthoSize, aspect, near, far)
        else Mat4.perspective(fov.coerceIn(5f, 150f), aspect, near, far)

    fun json() =
        JSONObject()
            .put("position", arr(position))
            .put("target", arr(target))
            .put("up", arr(up))
            .put("fov", fov.toDouble())
            .put("near", near.toDouble())
            .put("far", far.toDouble())
            .put("orthographic", orthographic)
            .put("orthoSize", orthoSize.toDouble())

    companion object {
        private fun arr(v: Vec3) = JSONArray().put(v.x.toDouble()).put(v.y.toDouble()).put(v.z.toDouble())
        private fun vec(j: JSONArray) = Vec3(j.getDouble(0).toFloat(), j.getDouble(1).toFloat(), j.getDouble(2).toFloat())

        fun read(j: JSONObject) =
            MeshCamera(
                vec(j.getJSONArray("position")),
                vec(j.getJSONArray("target")),
                j.optJSONArray("up")?.let { vec(it) } ?: Vec3.UP,
                j.optDouble("fov", 50.0).toFloat(),
                j.optDouble("near", .1).toFloat(),
                j.optDouble("far", 1000.0).toFloat(),
                j.optBoolean("orthographic", false),
                j.optDouble("orthoSize", 8.0).toFloat(),
            )
    }
}

class Scene3D {
    var name: String = "Cena 3D"
    val objects = mutableListOf<Mesh3DObject>()
    var camera = MeshCamera()
    var lights = mutableListOf(MeshLight())
    var ambient = .25f
    var background: Int = 0
    var wireframe = false
    var cullBackfaces = true

    fun objectById(id: String) = objects.firstOrNull { it.id == id }

    fun json() =
        JSONObject()
            .put("name", name)
            .put("camera", camera.json())
            .put("lights", JSONArray().also { a -> lights.forEach { a.put(it.json()) } })
            .put("ambient", ambient.toDouble())
            .put("background", background)
            .put("wireframe", wireframe)
            .put("cullBackfaces", cullBackfaces)
            .put("objects", JSONArray().also { a -> objects.forEach { a.put(it.json()) } })

    companion object {
        fun read(j: JSONObject) =
            Scene3D().apply {
                name = j.optString("name", "Cena 3D")
                camera = MeshCamera.read(j.getJSONObject("camera"))
                j.optJSONArray("lights")?.let { array ->
                    lights.clear()
                    repeat(array.length()) { i -> lights += MeshLight.read(array.getJSONObject(i)) }
                }
                ambient = j.optDouble("ambient", .25).toFloat()
                background = j.optInt("background", 0)
                wireframe = j.optBoolean("wireframe", false)
                cullBackfaces = j.optBoolean("cullBackfaces", true)
                j.optJSONArray("objects")?.let { array ->
                    objects.clear()
                    repeat(array.length()) { i -> objects += Mesh3DObject.read(array.getJSONObject(i)) }
                }
            }
    }
}
