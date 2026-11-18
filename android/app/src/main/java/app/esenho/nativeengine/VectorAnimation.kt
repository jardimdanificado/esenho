package app.esenho.nativeengine

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.pow

data class VectorAnimatedValue(
    var x: Float,
    var y: Float,
    var rotation: Float = 0f,
    var scale: Float = 1f,
    var opacity: Float = 1f,
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

/** Per-object property tracks. Geometry stays authoritative; transforms are applied at render time. */
class VectorAnimation(private val workspace: VectorWorkspace) {
    val tracks = linkedMapOf<String, VectorAnimationTrack>()
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
    ) {
        val values =
            VectorAnimatedValue(
                x.coerceAtLeast(-1e6f).coerceAtMost(1e6f),
                y.coerceAtLeast(-1e6f).coerceAtMost(1e6f),
                rotation,
                scale.coerceIn(.01f, 100f),
                opacity.coerceIn(0f, 1f),
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

    private fun eased(t: Float, easing: String): Float =
        when (easing) {
            "ease-in" -> t * t
            "ease-out" -> t * (2f - t)
            "ease-in-out" ->
                if (t < .5f) 2f * t * t else 1f - (-2f * t + 2f).pow(2) / 2f
            else -> t
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
        return VectorAnimatedValue(
            between(before.value.x, after.value.x),
            between(before.value.y, after.value.y),
            between(before.value.rotation, after.value.rotation),
            between(before.value.scale, after.value.scale),
            between(before.value.opacity, after.value.opacity),
        )
    }

    fun evaluate(obj: VectorObject, frame: Int): VectorAnimatedValue? =
        tracks[obj.id]?.let { valueAt(it, frame) }

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

    fun load(j: JSONObject?) {
        tracks.clear()
        clips.clear()
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
    }
}
