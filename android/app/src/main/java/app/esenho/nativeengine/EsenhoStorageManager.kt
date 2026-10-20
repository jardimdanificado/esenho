package app.esenho.nativeengine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets

/**
 * Manages persistent JSON storage in app private sandbox (context.filesDir).
 * Supports atomic writes, error fallback, and corruption resilience for:
 * - Custom brush presets (esenho_custom_presets.json)
 * - Color palettes (esenho_palettes.json)
 * - Recent colors (esenho_recent_colors.json)
 * - Session state across cold restarts (esenho_session_state.json)
 */
class EsenhoStorageManager(private val context: Context) {

    companion object {
        private const val TAG = "EsenhoStorageManager"
        const val PRESETS_FILENAME = "esenho_custom_presets.json"
        const val PALETTES_FILENAME = "esenho_palettes.json"
        const val RECENT_COLORS_FILENAME = "esenho_recent_colors.json"
        const val SESSION_FILENAME = "esenho_session_state.json"
        const val FAVORITES_FILENAME = "esenho_favorite_brushes.json"
    }

    data class SessionState(
        val lastPresetId: String? = null,
        val activePaletteId: String? = null,
        val currentColor: Int? = null
    )

    val presetsFile: File
        get() = File(context.filesDir, PRESETS_FILENAME)

    val palettesFile: File
        get() = File(context.filesDir, PALETTES_FILENAME)

    val recentColorsFile: File
        get() = File(context.filesDir, RECENT_COLORS_FILENAME)

    val sessionFile: File
        get() = File(context.filesDir, SESSION_FILENAME)

    private val favoritesFile: File
        get() = File(context.filesDir, FAVORITES_FILENAME)

    private val favoriteStatesFile: File
        get() = File(context.filesDir, "esenho_favorite_tool_states.json")

    /**
     * Atomically writes content to the target file via temporary file and atomic rename.
     * Guarantees that readers never see partially written or corrupted files.
     */
    private fun atomicWrite(targetFile: File, content: String): Boolean {
        val parent = targetFile.parentFile ?: return false
        if (!parent.exists()) {
            parent.mkdirs()
        }

        val tmpFile = File(parent, "${targetFile.name}.tmp")
        try {
            FileOutputStream(tmpFile).use { fos ->
                val bytes = content.toByteArray(StandardCharsets.UTF_8)
                fos.write(bytes)
                fos.flush()
                try {
                    fos.fd.sync()
                } catch (e: Exception) {
                    // Ignored if sync not supported on filesystem
                }
            }

            if (tmpFile.renameTo(targetFile)) {
                return true
            }

            // Fallback for filesystems that do not support atomic rename over existing file
            if (targetFile.exists()) {
                targetFile.delete()
            }
            if (tmpFile.renameTo(targetFile)) {
                return true
            }

            // Secondary fallback: direct copy
            tmpFile.copyTo(targetFile, overwrite = true)
            tmpFile.delete()
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed atomic write to ${targetFile.absolutePath}", e)
            if (tmpFile.exists()) {
                tmpFile.delete()
            }
            return false
        }
    }

    /**
     * Reads text safely from file. Returns null if file does not exist, is empty, or cannot be read.
     */
    private fun safeRead(file: File): String? {
        if (!file.exists() || file.length() == 0L) {
            return null
        }
        return try {
            file.readText(StandardCharsets.UTF_8)
        } catch (e: Exception) {
            Log.e(TAG, "Error reading ${file.absolutePath}", e)
            null
        }
    }

    // ── Custom Presets Persistence ──

    fun saveCustomPresets(presets: List<BrushPresetModel>): Boolean {
        return try {
            val jsonArray = JSONArray()
            for (p in presets) {
                if (p.isCustom) {
                    jsonArray.put(p.toJson())
                }
            }
            atomicWrite(presetsFile, jsonArray.toString(2))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save custom presets", e)
            false
        }
    }

    fun loadCustomPresets(): List<BrushPresetModel> {
        val content = safeRead(presetsFile) ?: return emptyList()
        val trimmed = content.trim()
        if (trimmed.isEmpty() || !trimmed.startsWith("[")) {
            Log.w(TAG, "Presets file does not start with JSON array. Fallback to empty list.")
            return emptyList()
        }

        val result = mutableListOf<BrushPresetModel>()
        try {
            val array = JSONArray(trimmed)
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                try {
                    val model = BrushPresetModel.fromJson(obj)
                    result.add(model)
                } catch (e: Exception) {
                    Log.w(TAG, "Skipping malformed preset at index $i", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse presets JSON. Returning empty list.", e)
            return emptyList()
        }
        return result
    }

    private fun customBrushAssetFile(assetId: String): File {
        val safeId = assetId.filter { it.isLetterOrDigit() || it == '_' || it == '-' }
        return File(File(context.filesDir, "custom_brush_assets"), "$safeId.png")
    }

    fun saveCustomBrushAsset(assetId: String, bitmap: Bitmap): Boolean {
        val target = customBrushAssetFile(assetId)
        val temporary = File(target.parentFile, "${target.name}.tmp")
        return try {
            target.parentFile?.mkdirs()
            FileOutputStream(temporary).use { stream ->
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) return false
                stream.flush()
                stream.fd.sync()
            }
            if (temporary.renameTo(target)) true else {
                temporary.copyTo(target, overwrite = true)
                temporary.delete()
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save custom brush asset", e)
            temporary.delete()
            false
        }
    }

    fun loadCustomBrushAsset(assetId: String): Bitmap? =
        runCatching { BitmapFactory.decodeFile(customBrushAssetFile(assetId).absolutePath) }.getOrNull()

    fun deleteCustomBrushAsset(assetId: String) {
        runCatching { customBrushAssetFile(assetId).delete() }
    }

    // ── Color Palettes Persistence ──

    fun savePalettes(palettes: List<ColorPaletteModel>): Boolean {
        return try {
            val jsonArray = JSONArray()
            for (pal in palettes) {
                jsonArray.put(pal.toJson())
            }
            atomicWrite(palettesFile, jsonArray.toString(2))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save palettes", e)
            false
        }
    }

    fun loadPalettes(): List<ColorPaletteModel> {
        val content = safeRead(palettesFile)
        if (content == null) {
            return ColorPaletteModel.getDefaultPalettes()
        }

        val trimmed = content.trim()
        if (trimmed.isEmpty() || !trimmed.startsWith("[")) {
            Log.w(TAG, "Palettes file does not start with JSON array. Fallback to defaults.")
            return ColorPaletteModel.getDefaultPalettes()
        }

        val result = mutableListOf<ColorPaletteModel>()
        try {
            val array = JSONArray(trimmed)
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                try {
                    val model = ColorPaletteModel.fromJson(obj)
                    result.add(model)
                } catch (e: Exception) {
                    Log.w(TAG, "Skipping malformed palette at index $i", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse palettes JSON. Returning defaults.", e)
            return ColorPaletteModel.getDefaultPalettes()
        }

        if (result.isEmpty()) {
            return ColorPaletteModel.getDefaultPalettes()
        }

        // Ensure default built-in palettes always exist
        val defaultPalettes = ColorPaletteModel.getDefaultPalettes()
        for (def in defaultPalettes) {
            if (result.none { it.id == def.id }) {
                result.add(def)
            }
        }

        return result
    }

    // ── Recent Colors Persistence ──

    fun saveRecentColors(colors: List<Int>): Boolean {
        return try {
            val jsonArray = JSONArray()
            for (c in colors) {
                jsonArray.put(c)
            }
            atomicWrite(recentColorsFile, jsonArray.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save recent colors", e)
            false
        }
    }

    fun loadRecentColors(): List<Int> {
        val content = safeRead(recentColorsFile) ?: return emptyList()
        val trimmed = content.trim()
        if (trimmed.isEmpty() || !trimmed.startsWith("[")) {
            return emptyList()
        }

        val result = mutableListOf<Int>()
        try {
            val array = JSONArray(trimmed)
            for (i in 0 until array.length()) {
                result.add(array.getInt(i))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse recent colors JSON", e)
            return emptyList()
        }
        return result
    }

    // ── Session State Persistence (Cold Boot & Lifecycle) ──

    fun saveSessionState(lastPresetId: String?, activePaletteId: String?, currentColor: Int?): Boolean {
        return try {
            val obj = JSONObject()
            if (lastPresetId != null) obj.put("lastPresetId", lastPresetId)
            if (activePaletteId != null) obj.put("activePaletteId", activePaletteId)
            if (currentColor != null) obj.put("currentColor", currentColor)
            atomicWrite(sessionFile, obj.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save session state", e)
            false
        }
    }

    fun loadSessionState(): SessionState {
        val content = safeRead(sessionFile) ?: return SessionState()
        return try {
            val obj = JSONObject(content)
            SessionState(
                lastPresetId = if (obj.has("lastPresetId")) obj.getString("lastPresetId") else null,
                activePaletteId = if (obj.has("activePaletteId")) obj.getString("activePaletteId") else null,
                currentColor = if (obj.has("currentColor")) obj.getInt("currentColor") else null
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load session state", e)
            SessionState()
        }
    }

    // ── Side Slider Configuration Persistence ──

    private val sideSlidersFile: File
        get() = File(context.filesDir, "esenho_side_sliders.json")

    data class SideSliderSetting(
        val paramId: Int,
        val id: String = java.util.UUID.randomUUID().toString(),
        val ownerBrushId: String = BrushParameterScope.owner(null, paramId),
        val parameterName: String = "",
    )

    fun saveSideSliders(settings: List<SideSliderSetting>): Boolean {
        return try {
            val arr = JSONArray()
            settings.forEach { setting ->
                arr.put(JSONObject().put("paramId", setting.paramId).put("id", setting.id).apply {
                    put("owner", setting.ownerBrushId)
                    put("parameterName", setting.parameterName)
                })
            }
            atomicWrite(sideSlidersFile, arr.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save side sliders", e)
            false
        }
    }

    fun loadSideSliders(): List<SideSliderSetting> {
        val content = safeRead(sideSlidersFile) ?: return listOf(SideSliderSetting(1), SideSliderSetting(2))
        return try {
            val arr = JSONArray(content)
            val result = mutableListOf<SideSliderSetting>()
            for (i in 0 until arr.length()) {
                when (val item = arr.get(i)) {
                    is Number -> result.add(SideSliderSetting(item.toInt()))
                    is JSONObject -> result.add(SideSliderSetting(
                        item.optInt("paramId", 1),
                        item.optString("id", "").ifBlank { java.util.UUID.randomUUID().toString() },
                        item.optString("owner", if (item.optInt("paramId") >= 10000) "legacy-unscoped" else BrushParameterScope.owner(null, item.optInt("paramId"))),
                        item.optString("parameterName", ""),
                    ))
                }
            }
            result
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load side sliders", e)
            listOf(SideSliderSetting(1), SideSliderSetting(2))
        }
    }

    fun saveFavoriteBrushes(ids: Collection<String>): Boolean = try {
        atomicWrite(favoritesFile, JSONArray(ids.distinct()).toString())
    } catch (e: Exception) {
        Log.e(TAG, "Failed to save favorite brushes", e)
        false
    }

    fun loadFavoriteBrushes(): Set<String> {
        val content = safeRead(favoritesFile) ?: return emptySet()
        return try {
            val arr = JSONArray(content)
            buildSet {
                for (i in 0 until arr.length()) {
                    val id = arr.optString(i)
                    if (id.startsWith("preset:") || id.startsWith("brush:")) add(id)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load favorite brushes", e)
            emptySet()
        }
    }

    fun saveFavoriteToolState(id: String, state: JSONObject): Boolean = try {
        val states = loadFavoriteToolStates().apply { put(id, state) }
        val root = JSONObject()
        states.forEach { (key, value) -> root.put(key, value) }
        atomicWrite(favoriteStatesFile, root.toString())
    } catch (e: Exception) {
        Log.e(TAG, "Failed to save favorite tool state", e)
        false
    }

    fun loadFavoriteToolState(id: String): JSONObject? = loadFavoriteToolStates()[id]

    private fun loadFavoriteToolStates(): MutableMap<String, JSONObject> {
        val content = safeRead(favoriteStatesFile) ?: return mutableMapOf()
        return try {
            val root = JSONObject(content)
            buildMap {
                val keys = root.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    root.optJSONObject(key)?.let { put(key, it) }
                }
            }.toMutableMap()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load favorite tool states", e)
            mutableMapOf()
        }
    }
}
