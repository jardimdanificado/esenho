package app.esenho.nativeengine

import org.json.JSONObject

/** Definitions come from the same schema used to generate the preset catalog. */
data class BrushRealismParameter(
    val id: Int,
    val key: String,
    val label: String,
    val shortLabel: String,
    val min: Int,
    val max: Int,
    val default: Int,
    val unit: String,
    val group: String,
    val options: List<String>,
    val isSwitch: Boolean,
) {
    companion object {
        fun fromJson(json: JSONObject): BrushRealismParameter {
            val options = json.optJSONArray("options")
            return BrushRealismParameter(
                json.getInt("id"), json.getString("key"), json.getString("label"),
                json.getString("shortLabel"), json.getInt("min"), json.getInt("max"),
                json.getInt("default"), json.optString("unit"), json.getString("group"),
                if (options == null) emptyList() else List(options.length()) { options.getString(it) },
                json.optBoolean("switch", false),
            )
        }
    }
}

internal fun brushRealismConfig(json: JSONObject): JSONObject = JSONObject().also { result ->
    val keys = json.keys()
    while (keys.hasNext()) {
        val key = keys.next()
        if (key.startsWith("realism_")) result.put(key, json.opt(key))
    }
}
