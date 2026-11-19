package app.esenho.nativeengine.mesh3d

import org.json.JSONObject

data class MeshMaterial(
    var name: String = "default",
    var diffuse: Int = 0xffb0b0b0.toInt(),
    var specular: Int = 0xffffffff.toInt(),
    var shininess: Float = 24f,
    var opacity: Float = 1f,
    var texture: String? = null,
) {
    fun json() =
        JSONObject()
            .put("name", name)
            .put("diffuse", diffuse)
            .put("specular", specular)
            .put("shininess", shininess.toDouble())
            .put("opacity", opacity.toDouble())
            .put("texture", texture)

    companion object {
        fun read(j: JSONObject) =
            MeshMaterial(
                j.optString("name", "default"),
                j.optInt("diffuse", 0xffb0b0b0.toInt()),
                j.optInt("specular", 0xffffffff.toInt()),
                j.optDouble("shininess", 24.0).toFloat(),
                j.optDouble("opacity", 1.0).toFloat(),
                if (j.isNull("texture")) null else j.optString("texture"),
            )
    }
}

data class MeshLight(
    var direction: Vec3 = Vec3(0f, -1f, -1f),
    var color: Int = 0xffffffff.toInt(),
    var intensity: Float = 1f,
) {
    fun json() =
        JSONObject()
            .put("x", direction.x.toDouble())
            .put("y", direction.y.toDouble())
            .put("z", direction.z.toDouble())
            .put("color", color)
            .put("intensity", intensity.toDouble())

    companion object {
        fun read(j: JSONObject) =
            MeshLight(
                Vec3(
                    j.optDouble("x", 0.0).toFloat(),
                    j.optDouble("y", -1.0).toFloat(),
                    j.optDouble("z", -1.0).toFloat(),
                ),
                j.optInt("color", 0xffffffff.toInt()),
                j.optDouble("intensity", 1.0).toFloat(),
            )
    }
}
