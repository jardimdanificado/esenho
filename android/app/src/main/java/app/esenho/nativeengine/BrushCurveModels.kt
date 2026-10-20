package app.esenho.nativeengine

import org.json.JSONArray
import org.json.JSONObject

data class SavedBrushCurve(
    val id: String,
    val name: String,
    val points: List<Pair<Float, Float>>,
    val interpolation: String = "smooth",
    val builtin: Boolean = false,
) {
    init { require(id.isNotBlank() && name.isNotBlank() && interpolation in setOf("linear", "smooth", "steps")) }
    val evaluator = BrushResponseCurve(points.map { it.first }.toFloatArray(), points.map { it.second }.toFloatArray(), interpolation)
    fun toJson() = JSONObject().put("id", id).put("name", name).put("interpolation", interpolation)
        .put("points", JSONArray().also { arr -> points.forEach { arr.put(JSONArray().put(it.first).put(it.second)) } })
    companion object {
        fun fromJson(json: JSONObject, builtin: Boolean = false): SavedBrushCurve {
            val arr = json.getJSONArray("points")
            return SavedBrushCurve(json.getString("id"), json.getString("name"),
                List(arr.length()) { arr.getJSONArray(it).let { p -> p.getDouble(0).toFloat() to p.getDouble(1).toFloat() } },
                json.optString("interpolation", "smooth"), builtin)
        }
    }
}

data class BrushCurveTarget(
    val id: Int, val name: String, val min: Float, val max: Float,
    val kind: String = "slider", val options: List<String> = emptyList(),
    val owner: String = BrushParameterScope.owner(null, id),
) {
    init { require(min.isFinite() && max.isFinite() && max > min && kind in setOf("slider", "switch", "choice")) }
    fun toJson() = JSONObject().put("id", id).put("name", name).put("min", min).put("max", max)
        .put("kind", kind).put("options", JSONArray(options)).put("owner", owner)
    companion object {
        fun fromJson(json: JSONObject): BrushCurveTarget {
            val options = json.optJSONArray("options")
            return BrushCurveTarget(json.getInt("id"), json.optString("name", "Parâmetro"),
                json.getDouble("min").toFloat(), json.getDouble("max").toFloat(),
                json.optString("kind", "slider"), if (options == null) emptyList() else List(options.length()) { options.getString(it) },
                json.optString("owner", BrushParameterScope.owner(null, json.getInt("id"))))
        }
    }
}

data class BrushParameterCurve(
    val target: BrushCurveTarget,
    val curveId: String,
    val input: String = "pressure",
    val scale: Float = 200f,
    val repeat: Boolean = false,
    val low: Float = 0f,
    val high: Float = 1f,
    val enabled: Boolean = true,
) {
    init {
        require(scale.isFinite() && scale > 0 && low.isFinite() && high.isFinite())
        require(input in setOf("pressure", "speed", "distance", "time", "tilt", "direction", "noise"))
    }
    fun toJson() = JSONObject().put("target", target.toJson()).put("curveId", curveId).put("input", input)
        .put("scale", scale).put("repeat", repeat).put("low", low).put("high", high).put("enabled", enabled)
    companion object {
        fun fromJson(json: JSONObject): BrushParameterCurve = BrushParameterCurve(
            BrushCurveTarget.fromJson(json.getJSONObject("target")), json.getString("curveId"),
            json.optString("input", "pressure"), json.optDouble("scale", 200.0).toFloat().coerceIn(.05f, 20000f),
            json.optBoolean("repeat", false), json.optDouble("low", 0.0).toFloat().coerceIn(0f, 1f),
            json.optDouble("high", 1.0).toFloat().coerceIn(0f, 1f), json.optBoolean("enabled", true))
    }
}

internal fun readBrushParameterCurves(array: JSONArray?): List<BrushParameterCurve> =
    if (array == null) emptyList() else (0 until array.length()).mapNotNull {
        runCatching { BrushParameterCurve.fromJson(array.getJSONObject(it)) }.getOrNull()
    }.distinctBy { it.target.id }
