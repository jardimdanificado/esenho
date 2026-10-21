package app.esenho.scripting

import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class NativeScriptPreset(val id: String, val name: String, val source: String)

/** User scripts live separately from the editable draft and bundled examples. */
class NativeScriptPresets(private val preferences: SharedPreferences) {
    fun remove(id: String): Boolean {
        val current = load()
        if (current.none { it.id == id }) return false
        write(current.filterNot { it.id == id })
        return true
    }
    private fun write(presets: List<NativeScriptPreset>) {
        val data = JSONArray(presets.map { JSONObject().put("id",it.id).put("name",it.name).put("source",it.source) })
        preferences.edit().putString("presets",data.toString()).apply()
    }
    fun load(): List<NativeScriptPreset> = runCatching {
        val data = JSONArray(preferences.getString("presets", "[]") ?: "[]")
        (0 until data.length()).map { index ->
            val item = data.getJSONObject(index)
            NativeScriptPreset(item.getString("id"), item.getString("name"), item.getString("source"))
        }
    }.getOrDefault(emptyList())

    fun save(presets: List<NativeScriptPreset>, id: String?, name: String, source: String): Pair<List<NativeScriptPreset>, NativeScriptPreset> {
        val trimmed = name.trim()
        require(trimmed.isNotEmpty()) { "Informe um nome" }
        val preset = NativeScriptPreset(id ?: UUID.randomUUID().toString(), trimmed, source)
        val updated = if (presets.any { it.id == preset.id }) presets.map { if (it.id == preset.id) preset else it }
            else presets + preset
        write(updated)
        return updated to preset
    }
}
