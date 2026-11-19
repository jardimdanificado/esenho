package app.esenho.nativeengine.mesh3d

import org.json.JSONArray
import org.json.JSONObject

data class MeshFace(
    val vertices: IntArray,
    val texCoords: IntArray = intArrayOf(),
    val normals: IntArray = intArrayOf(),
    var material: Int = 0,
) {
    fun json() =
        JSONObject()
            .put("v", JSONArray().also { a -> vertices.forEach { a.put(it) } })
            .put("vt", JSONArray().also { a -> texCoords.forEach { a.put(it) } })
            .put("vn", JSONArray().also { a -> normals.forEach { a.put(it) } })
            .put("material", material)

    companion object {
        fun read(j: JSONObject) =
            MeshFace(
                j.getJSONArray("v").let { a -> IntArray(a.length()) { a.getInt(it) } },
                j.optJSONArray("vt")?.let { a -> IntArray(a.length()) { a.getInt(it) } } ?: intArrayOf(),
                j.optJSONArray("vn")?.let { a -> IntArray(a.length()) { a.getInt(it) } } ?: intArrayOf(),
                j.optInt("material"),
            )
    }
}

data class MeshTransform(
    var position: Vec3 = Vec3.ZERO,
    var rotation: Vec3 = Vec3.ZERO,
    var scale: Vec3 = Vec3(1f, 1f, 1f),
) {
    fun matrix() =
        Mat4.translation(position.x, position.y, position.z) *
            Mat4.rotationY(rotation.y) *
            Mat4.rotationX(rotation.x) *
            Mat4.rotationZ(rotation.z) *
            Mat4.scaling(scale.x, scale.y, scale.z)

    fun json() =
        JSONObject().put("position", vec(position)).put("rotation", vec(rotation)).put("scale", vec(scale))

    companion object {
        private fun vec(v: Vec3) = JSONArray().put(v.x.toDouble()).put(v.y.toDouble()).put(v.z.toDouble())
        private fun vec(j: JSONArray) = Vec3(j.getDouble(0).toFloat(), j.getDouble(1).toFloat(), j.getDouble(2).toFloat())

        fun read(j: JSONObject) =
            MeshTransform(
                vec(j.getJSONArray("position")),
                vec(j.getJSONArray("rotation")),
                vec(j.getJSONArray("scale")),
            )
    }
}

data class Mesh3DObject(
    val id: String,
    val vertices: MutableList<Vec3> = mutableListOf(),
    val normals: MutableList<Vec3> = mutableListOf(),
    val uvs: MutableList<Pair<Float, Float>> = mutableListOf(),
    val faces: MutableList<MeshFace> = mutableListOf(),
    val materials: MutableList<MeshMaterial> = mutableListOf(MeshMaterial()),
    var name: String = "",
    var visible: Boolean = true,
    var locked: Boolean = false,
    var groupId: String? = null,
    var transform: MeshTransform = MeshTransform(),
    var smooth: Boolean = false,
) {
    fun triangleCount() = faces.sumOf { maxOf(0, it.vertices.size - 2) }

    fun json() =
        JSONObject()
            .put("id", id)
            .put("name", name)
            .put("visible", visible)
            .put("locked", locked)
            .put("group", groupId)
            .put("smooth", smooth)
            .put("transform", transform.json())
            .put(
                "vertices",
                JSONArray().also { a ->
                    vertices.forEach { v -> a.put(JSONArray().put(v.x.toDouble()).put(v.y.toDouble()).put(v.z.toDouble())) }
                },
            )
            .put(
                "normals",
                JSONArray().also { a ->
                    normals.forEach { v -> a.put(JSONArray().put(v.x.toDouble()).put(v.y.toDouble()).put(v.z.toDouble())) }
                },
            )
            .put(
                "uvs",
                JSONArray().also { a ->
                    uvs.forEach { uv -> a.put(JSONArray().put(uv.first.toDouble()).put(uv.second.toDouble())) }
                },
            )
            .put("faces", JSONArray().also { a -> faces.forEach { a.put(it.json()) } })
            .put("materials", JSONArray().also { a -> materials.forEach { a.put(it.json()) } })

    companion object {
        fun read(j: JSONObject): Mesh3DObject {
            fun vectors(array: JSONArray?) =
                MutableList(array?.length() ?: 0) { i ->
                    val a = array!!.getJSONArray(i)
                    Vec3(a.getDouble(0).toFloat(), a.getDouble(1).toFloat(), a.getDouble(2).toFloat())
                }
            val uvs = mutableListOf<Pair<Float, Float>>()
            j.optJSONArray("uvs")?.let { array ->
                repeat(array.length()) { i ->
                    val a = array.getJSONArray(i)
                    uvs += a.getDouble(0).toFloat() to a.getDouble(1).toFloat()
                }
            }
            val materials = mutableListOf<MeshMaterial>()
            j.optJSONArray("materials")?.let { array ->
                repeat(array.length()) { i -> materials += MeshMaterial.read(array.getJSONObject(i)) }
            }
            if (materials.isEmpty()) materials += MeshMaterial()
            return Mesh3DObject(
                j.getString("id"),
                vectors(j.getJSONArray("vertices")),
                vectors(j.optJSONArray("normals")),
                uvs,
                mutableListOf<MeshFace>().also { list ->
                    j.optJSONArray("faces")?.let { array ->
                        repeat(array.length()) { i -> list += MeshFace.read(array.getJSONObject(i)) }
                    }
                },
                materials,
                j.optString("name", ""),
                j.optBoolean("visible", true),
                j.optBoolean("locked", false),
                if (j.isNull("group")) null else j.optString("group").takeIf { it.isNotEmpty() },
                MeshTransform.read(j.getJSONObject("transform")),
                j.optBoolean("smooth", false),
            )
        }
    }
}
