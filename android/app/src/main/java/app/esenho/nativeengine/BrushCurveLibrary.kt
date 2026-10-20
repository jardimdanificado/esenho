package app.esenho.nativeengine

import org.json.JSONArray
import org.json.JSONObject

data class BrushCurveLibraryState(
    val curves: List<SavedBrushCurve> = emptyList(),
    val bindings: Map<String, List<BrushParameterCurve>> = emptyMap(),
) {
    fun toJson(): JSONObject {
        val curvesJson = JSONArray().also { arr -> curves.forEach { arr.put(it.toJson()) } }
        val bindingsJson = JSONObject().also { root -> bindings.forEach { (key, values) ->
            root.put(BrushPresetAliases.canonicalToolId(key), JSONArray().also { arr -> values.forEach { arr.put(it.toJson()) } })
        } }
        return JSONObject().put("version", 1).put("curves", curvesJson).put("bindings", bindingsJson)
    }
    companion object {
        fun fromJson(root: JSONObject): BrushCurveLibraryState {
            val array = root.optJSONArray("curves") ?: JSONArray()
            val curves = (0 until array.length()).mapNotNull {
                runCatching { SavedBrushCurve.fromJson(array.getJSONObject(it)) }.getOrNull()
            }.distinctBy { it.id }
            val raw = root.optJSONObject("bindings") ?: JSONObject()
            val bindings = buildMap {
                val keys = raw.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val canonical = BrushPresetAliases.canonicalToolId(key)
                    if (canonical == key || !containsKey(canonical)) put(canonical, readBrushParameterCurves(raw.optJSONArray(key)))
                }
            }
            return BrushCurveLibraryState(curves, bindings)
        }
    }
}

class BrushCurveLibrary(private val storage: EsenhoStorageManager) {
    private var state = storage.loadBrushCurveLibrary()
    private var builtins = emptyList<SavedBrushCurve>()
    private var activeKey = ""
    private var defaults = emptyList<BrushParameterCurve>()
    val curves: List<SavedBrushCurve> get() = builtins + state.curves
    val bindings: List<BrushParameterCurve> get() = state.bindings[activeKey] ?: defaults
    var revision: Int = 0
        private set

    fun installBuiltins(array: JSONArray?) {
        builtins = if (array == null) emptyList() else (0 until array.length()).mapNotNull {
            runCatching { SavedBrushCurve.fromJson(array.getJSONObject(it), true) }.getOrNull()
        }
        revision++
    }
    fun activate(toolKey: String, defaults: List<BrushParameterCurve>) {
        activeKey = toolKey
        this.defaults = defaults
        revision++
    }
    fun save(curve: SavedBrushCurve): Boolean {
        require(!curve.builtin && curve.name.isNotBlank())
        if (curves.any { it.id != curve.id && it.name.equals(curve.name.trim(), true) }) return false
        val next = state.copy(curves = state.curves.filterNot { it.id == curve.id } + curve.copy(name = curve.name.trim()))
        return commit(next)
    }
    fun bind(binding: BrushParameterCurve): Boolean {
        if (activeKey.isBlank() || curves.none { it.id == binding.curveId }) return false
        val next = bindings.filterNot { it.target.id == binding.target.id } + binding
        return commit(state.copy(bindings = state.bindings + (activeKey to next)))
    }
    fun resetActiveBindings(): Boolean = commit(state.copy(bindings = state.bindings - activeKey))
    fun unbind(parameterId: Int): Boolean = commit(state.copy(bindings = state.bindings +
        (activeKey to bindings.filterNot { it.target.id == parameterId })))

    fun delete(curveId: String, presetDefaults: Map<String, List<BrushParameterCurve>>): Boolean {
        if (builtins.any { it.id == curveId }) return false
        val all = presetDefaults + state.bindings + (activeKey to bindings)
        val cleaned = all.mapValues { (_, bindings) -> bindings.filterNot { it.curveId == curveId } }
        val next = state.copy(curves = state.curves.filterNot { it.id == curveId }, bindings = cleaned)
        return commit(next)
    }
    private fun commit(next: BrushCurveLibraryState): Boolean {
        if (!storage.saveBrushCurveLibrary(next)) return false
        state = next
        revision++
        return true
    }
}
