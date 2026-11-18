package app.esenho.nativeengine

import org.json.JSONArray
import org.json.JSONObject

data class VectorGradientStop(var offset: Float, var color: Int, var opacity: Float = 1f) {
    fun json() =
        JSONObject()
            .put("offset", offset.toDouble())
            .put("color", color)
            .put("opacity", opacity.toDouble())

    companion object {
        fun read(j: JSONObject) =
            VectorGradientStop(
                j.optDouble("offset").toFloat(),
                j.optInt("color"),
                j.optDouble("opacity", 1.0).toFloat(),
            )
    }
}

/** Editable linear/radial gradient. Coordinates are 0..1 in object bounds by default. */
data class VectorGradient(
    var type: String = "linear",
    var stops: MutableList<VectorGradientStop> = mutableListOf(),
    var startX: Float = 0f,
    var startY: Float = .5f,
    var endX: Float = 1f,
    var endY: Float = .5f,
    var radius: Float = .5f,
    var userSpace: Boolean = false,
) {
    fun json() =
        JSONObject()
            .put("type", type)
            .put(
                "stops",
                JSONArray().also { array -> stops.sortedBy { it.offset }.forEach { array.put(it.json()) } },
            )
            .put("startX", startX.toDouble())
            .put("startY", startY.toDouble())
            .put("endX", endX.toDouble())
            .put("endY", endY.toDouble())
            .put("radius", radius.toDouble())
            .put("userSpace", userSpace)

    fun copyGradient() =
        VectorGradient(
            type,
            stops.map { it.copy() }.toMutableList(),
            startX,
            startY,
            endX,
            endY,
            radius,
            userSpace,
        )

    /** Premultiplied-independent interpolation in sRGB. */
    fun colorAt(t: Float): Int {
        val sorted = stops.sortedBy { it.offset }
        if (sorted.isEmpty()) return 0
        if (sorted.size == 1) return sorted.first().color
        val value = t.coerceIn(0f, 1f)
        if (value <= sorted.first().offset) return sorted.first().color
        if (value >= sorted.last().offset) return sorted.last().color
        val index = sorted.indexOfFirst { it.offset >= value }
        val before = sorted[index - 1]
        val after = sorted[index]
        val span = (after.offset - before.offset).coerceAtLeast(.0001f)
        val f = ((value - before.offset) / span).coerceIn(0f, 1f)
        fun channel(shift: Int) =
            (((before.color shr shift) and 0xff) * (1 - f) + ((after.color shr shift) and 0xff) * f)
                .toInt()
                .coerceIn(0, 255)
        val a = ((before.opacity * 255) * (1 - f) + (after.opacity * 255) * f).toInt().coerceIn(0, 255)
        return (a shl 24) or (channel(16) shl 16) or (channel(8) shl 8) or channel(0)
    }

    companion object {
        fun read(j: JSONObject) =
            VectorGradient(
                j.optString("type", "linear"),
                mutableListOf<VectorGradientStop>().also { stops ->
                    val array = j.optJSONArray("stops") ?: JSONArray()
                    repeat(array.length()) { i -> stops += VectorGradientStop.read(array.getJSONObject(i)) }
                },
                j.optDouble("startX", 0.0).toFloat(),
                j.optDouble("startY", 0.5).toFloat(),
                j.optDouble("endX", 1.0).toFloat(),
                j.optDouble("endY", 0.5).toFloat(),
                j.optDouble("radius", 0.5).toFloat(),
                j.optBoolean("userSpace", false),
            )
    }
}
