package app.esenho.nativeengine

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.pow

data class VectorAnimatedValue(
    var x: Float,
    var y: Float,
    var rotation: Float = 0f,
    var scale: Float = 1f,
    var opacity: Float = 1f,
    var fill: Int? = null,
    var fontSize: Float? = null,
)

data class VectorKeyframe(
    var frame: Int,
    var value: VectorAnimatedValue,
    var easing: String = "linear",
) {
    fun json() =
        JSONObject()
            .put("frame", frame)
            .put("x", value.x)
            .put("y", value.y)
            .put("rotation", value.rotation)
            .put("scale", value.scale)
            .put("opacity", value.opacity)
            .put("fill", value.fill)
            .put("fontSize", value.fontSize?.toDouble())
            .put("easing", easing)

    companion object {
        fun read(j: JSONObject) =
            VectorKeyframe(
                j.optInt("frame"),
                VectorAnimatedValue(
                    j.optDouble("x").toFloat(),
                    j.optDouble("y").toFloat(),
                    j.optDouble("rotation").toFloat(),
                    j.optDouble("scale", 1.0).toFloat(),
                    j.optDouble("opacity", 1.0).toFloat(),
                    if (j.isNull("fill")) null else j.getInt("fill"),
                    if (j.isNull("fontSize")) null else j.optDouble("fontSize").toFloat(),
                ),
                j.optString("easing", "linear"),
            )
    }
}

class VectorAnimationTrack(val objectId: String) {
    val keyframes = mutableListOf<VectorKeyframe>()

    fun json() =
        JSONObject()
            .put("objectId", objectId)
            .put(
                "keyframes",
                JSONArray().also { array -> keyframes.sortedBy { it.frame }.forEach { array.put(it.json()) } },
            )

    companion object {
        fun read(j: JSONObject) =
            VectorAnimationTrack(j.optString("objectId")).also { track ->
                val frames = j.optJSONArray("keyframes") ?: JSONArray()
                repeat(frames.length()) { i -> track.keyframes += VectorKeyframe.read(frames.getJSONObject(i)) }
            }
    }
}

data class VectorAnimationClip(var name: String, var start: Int, var end: Int) {
    fun json() = JSONObject().put("name", name).put("start", start).put("end", end)

    companion object {
        fun read(j: JSONObject) =
            VectorAnimationClip(j.optString("name"), j.optInt("start"), j.optInt("end"))
    }
}

data class VectorEasingCurve(
    var name: String,
    var x1: Float = .25f,
    var y1: Float = .1f,
    var x2: Float = .25f,
    var y2: Float = 1f,
) {
    fun json() =
        JSONObject()
            .put("name", name)
            .put("x1", x1.toDouble())
            .put("y1", y1.toDouble())
            .put("x2", x2.toDouble())
            .put("y2", y2.toDouble())

    companion object {
        fun read(j: JSONObject) =
            VectorEasingCurve(
                j.optString("name"),
                j.optDouble("x1", .25).toFloat(),
                j.optDouble("y1", .1).toFloat(),
                j.optDouble("x2", .25).toFloat(),
                j.optDouble("y2", 1.0).toFloat(),
            )
    }
}

/** Per-object property tracks. Geometry stays authoritative; transforms are applied at render time. */
class VectorAnimation(private val workspace: Any) {
    val tracks = linkedMapOf<String, VectorAnimationTrack>()
    val customEasings = mutableListOf<VectorEasingCurve>()
    val clips = mutableListOf<VectorAnimationClip>()
    var currentFrame: Int = 0
    var duration: Int = 120
    var playing: Boolean = false
    var activeClip: String? = null

    fun track(objectId: String) = tracks.getOrPut(objectId) { VectorAnimationTrack(objectId) }

    fun addKeyframe(
        objectId: String,
        frame: Int,
        x: Float,
        y: Float,
        rotation: Float,
        scale: Float,
        opacity: Float,
        easing: String,
        fill: Int? = null,
        fontSize: Float? = null,
    ) {
        val values =
            VectorAnimatedValue(
                x.coerceAtLeast(-1e6f).coerceAtMost(1e6f),
                y.coerceAtLeast(-1e6f).coerceAtMost(1e6f),
                rotation,
                scale.coerceIn(.01f, 100f),
                opacity.coerceIn(0f, 1f),
                fill,
                fontSize?.coerceIn(4f, 400f),
            )
        val keyframes = track(objectId).keyframes
        keyframes.removeAll { it.frame == frame }
        keyframes += VectorKeyframe(frame, values, easing)
        keyframes.sortBy { it.frame }
        duration = maxOf(duration, frame + 1)
    }

    fun removeKeyframe(objectId: String, frame: Int) {
        tracks[objectId]?.keyframes?.removeAll { it.frame == frame }
    }

    fun advance() {
        val clip = clips.firstOrNull { it.name == activeClip }
        val from = clip?.start ?: 0
        val to = clip?.end ?: duration - 1
        currentFrame = if (currentFrame >= to) from else currentFrame + 1
    }

    private fun eased(t: Float, easing: String): Float {
        val curve = customEasings.firstOrNull { it.name == easing }
        if (curve == null)
            return when (easing) {
                "ease-in" -> t * t
                "ease-out" -> t * (2f - t)
                "ease-in-out" ->
                    if (t < .5f) 2f * t * t else 1f - (-2f * t + 2f).pow(2) / 2f
                else -> t
            }
        fun bezier(a: Float, b: Float, u: Float): Float {
            val v = 1 - u
            return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u
        }
        var low = 0f
        var high = 1f
        var u = t
        repeat(24) {
            val x = bezier(curve.x1, curve.x2, u)
            if (abs(x - t) < .0001f) return@repeat
            if (x < t) low = u else high = u
            u = (low + high) / 2
        }
        return bezier(curve.y1, curve.y2, u)
    }

    fun valueAt(track: VectorAnimationTrack, frame: Int): VectorAnimatedValue? {
        val keys = track.keyframes.sortedBy { it.frame }
        val first = keys.firstOrNull() ?: return null
        if (frame <= first.frame) return first.value.copy()
        val last = keys.last()
        if (frame >= last.frame) return last.value.copy()
        val index = keys.indexOfFirst { it.frame > frame }
        if (index <= 0) return first.value.copy()
        val before = keys[index - 1]
        val after = keys[index]
        val span = (after.frame - before.frame).toFloat().coerceAtLeast(1f)
        val t = eased(((frame - before.frame).toFloat() / span).coerceIn(0f, 1f), before.easing)
        fun between(a: Float, b: Float) = a + (b - a) * t
        fun betweenColor(a: Int?, b: Int?): Int? {
            if (a == null && b == null) return null
            val from = a ?: b ?: return null
            val to = b ?: a ?: return null
            fun channel(shift: Int) =
                (((from shr shift) and 0xff) * (1 - t) + ((to shr shift) and 0xff) * t)
                    .toInt()
                    .coerceIn(0, 255)
            return (channel(24) shl 24) or (channel(16) shl 16) or (channel(8) shl 8) or channel(0)
        }
        return VectorAnimatedValue(
            between(before.value.x, after.value.x),
            between(before.value.y, after.value.y),
            between(before.value.rotation, after.value.rotation),
            between(before.value.scale, after.value.scale),
            between(before.value.opacity, after.value.opacity),
            betweenColor(before.value.fill, after.value.fill),
            if (before.value.fontSize != null && after.value.fontSize != null)
                between(before.value.fontSize!!, after.value.fontSize!!)
            else after.value.fontSize ?: before.value.fontSize,
        )
    }

    fun evaluate(obj: VectorObject, frame: Int): VectorAnimatedValue? = evaluate(obj.id, frame)

    fun evaluate(objectId: String, frame: Int): VectorAnimatedValue? =
        tracks[objectId]?.let { valueAt(it, frame) }

    fun json() =
        JSONObject()
            .put("currentFrame", currentFrame)
            .put("duration", duration)
            .put("playing", playing)
            .put("activeClip", activeClip)
            .put(
                "tracks",
                JSONArray().also { array -> tracks.values.forEach { array.put(it.json()) } },
            )
            .put("clips", JSONArray().also { array -> clips.forEach { array.put(it.json()) } })
            .put("easings", JSONArray().also { array -> customEasings.forEach { array.put(it.json()) } })

    fun load(j: JSONObject?) {
        tracks.clear()
        clips.clear()
        customEasings.clear()
        if (j == null) return
        currentFrame = j.optInt("currentFrame")
        duration = j.optInt("duration", 120).coerceAtLeast(1)
        playing = j.optBoolean("playing", false)
        activeClip = j.optString("activeClip").takeIf { it.isNotEmpty() }
        val savedTracks = j.optJSONArray("tracks") ?: JSONArray()
        repeat(savedTracks.length()) { i ->
            val track = VectorAnimationTrack.read(savedTracks.getJSONObject(i))
            tracks[track.objectId] = track
        }
        val savedClips = j.optJSONArray("clips") ?: JSONArray()
        repeat(savedClips.length()) { i -> clips += VectorAnimationClip.read(savedClips.getJSONObject(i)) }
        val savedEasings = j.optJSONArray("easings") ?: JSONArray()
        repeat(savedEasings.length()) { i ->
            customEasings += VectorEasingCurve.read(savedEasings.getJSONObject(i))
        }
    }
}
