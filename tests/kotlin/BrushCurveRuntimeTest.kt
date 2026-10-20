package app.esenho.nativeengine

import java.io.File
import org.json.JSONObject
import org.json.JSONArray

// Renderer and Android storage boundary doubles. The curve models, serializer,
// library and stroke runtime below are the production implementations.
class EsenhoStorageManager(private val file: File) {
    var failWrites = false
    fun loadBrushCurveLibrary() = if (file.exists()) BrushCurveLibraryState.fromJson(JSONObject(file.readText())) else BrushCurveLibraryState()
    fun saveBrushCurveLibrary(state: BrushCurveLibraryState): Boolean {
        if (failWrites) return false
        file.writeText(state.toJson().toString())
        return true
    }
}
data class TestPreset(val shape: String = "circle", val texture: String = "none", val shapeId: Int = 17, val dynamicConfig: JSONObject = JSONObject())
data class TestParameter(val name: String, val min: Int = 0, val max: Int = 100, val currentVal: Int = 78)
data class TestKernel(val id: String, val params: List<TestParameter>)
enum class ToolMode { BRUSH, ERASER }
class EsenhoEngine(val storage: EsenhoStorageManager) {
    val brushCurves = BrushCurveLibrary(storage)
    var selectedPreset: TestPreset? = TestPreset()
    var selectedBrush: TestKernel? = null
    var usesContinuousBrush = false
    var brushSize = 14f
    var brushOpacity = .8f
    var currentTool = ToolMode.BRUSH
    val params = mutableMapOf(2 to 80, 4 to 75, 5 to 7, 6 to 25, 7 to 90, 39 to 1, 40 to 1, 42 to 0, 70 to 2, 77 to 0)
    fun getPresetParam(id: Int) = params[id] ?: 0
    fun dynamicBaseValue(index: Int) = if (index == 0) .8f else .5f
    fun nativeCurveStrokeColor() = 0xff336699.toInt()
    fun restoreCurveTexture() { EsenhoNativeBridge.nativeBrushSetParam(18, 29) }
}
object EsenhoNativeBridge {
    var size = 14f
    var opacity = .8f
    var spacing = .07f
    var strokes = 0
    val parameters = mutableMapOf<Int, Int>()
    val kernel = mutableMapOf<Int, Int>()
    val dynamic = (0..47).associateWith { it*.013f+.1f }.toMutableMap()
    fun nativeSetBrushParam(id: Int, value: Int) { kernel[id] = value }
    fun nativeDynBrushGetBase(id: Int) = dynamic.getValue(id)
    fun nativeDynBrushSetBase(id: Int, value: Float) { dynamic[id] = value }
    fun nativeBrushSetParam(id: Int, value: Int) { parameters[id] = value }
    fun nativeBrushSetSize(value: Float) { size = value }
    fun nativeBrushSetProceduralOpacity(value: Float) { opacity = value }
    fun nativeBrushSetProceduralSpacing(value: Float) { spacing = value }
    fun nativeSelectShape(key: String): Int = 21
    fun nativeSelectTexture(key: String): Int = 29
    fun nativeBrushSetPressureMap(low: Int, high: Int, type: Int, gamma: Float) { check(high > low) }
    fun nativeStrokeExt(state: Int, x: Float, y: Float, previousX: Float, previousY: Float, color: Int, eraser: Int, pressure: Int, tiltX: Int, tiltY: Int) { strokes++ }
}
private fun near(actual: Float, expected: Float) { check(kotlin.math.abs(actual-expected) < .0001f) { "$actual != $expected" } }

fun main(args: Array<String>) {
    val root = File(args[0]); val file = File(args[1], "library.json")
    val metadata = JSONObject(File(root, "android/app/src/main/res/raw/esenho_native_metadata.json").readText())
    val storage = EsenhoStorageManager(file)
    val engine = EsenhoEngine(storage)
    engine.brushCurves.installBuiltins(metadata.getJSONArray("responseCurves"))
    val user = SavedBrushCurve("user_arch", "Arco pessoal", listOf(0f to 0f, .5f to 1f, 1f to 0f))
    check(engine.brushCurves.save(user))
    val size = BrushCurveTarget(1, "Tamanho", 1f, 100f)
    val binding = BrushParameterCurve(size, user.id, low = 0f, high = .2f)
    engine.brushCurves.activate("preset:test", emptyList())
    check(engine.brushCurves.bind(binding))
    val runtime = BrushCurveRuntime(engine)
    runtime.begin(0f, 0f, .5f, 0, 0)
    runtime.applyAt(0f, 0f)
    near(EsenhoNativeBridge.size, 20.8f)
    near(engine.brushSize, 14f)
    check(EsenhoNativeBridge.parameters[39] == 0)
    val edited = user.copy(points = listOf(0f to .25f, 1f to .25f))
    check(engine.brushCurves.save(edited))
    runtime.applyAt(10f, 0f)
    near(EsenhoNativeBridge.size, 20.8f) // An in-progress stroke keeps its compiled curves.
    runtime.end()
    near(EsenhoNativeBridge.size, 14f)
    check(EsenhoNativeBridge.parameters[39] == 1)
    runtime.begin(0f, 0f, .5f, 0, 0); runtime.applyAt(0f, 0f)
    near(EsenhoNativeBridge.size, 5.95f)
    runtime.end()

    val restored = BrushCurveLibrary(EsenhoStorageManager(file))
    restored.installBuiltins(metadata.getJSONArray("responseCurves"))
    restored.activate("preset:test", emptyList())
    check(restored.bindings.single().target.id == 1)
    near(restored.curves.first { it.id == user.id }.evaluator.valueAt(.5f), .25f)
    restored.activate("preset:other", emptyList()); check(restored.bindings.isEmpty())
    check(!engine.brushCurves.save(edited.copy(id = "other_id"))) // Duplicate names do not overwrite saved curves.
    val beforeFile = file.readText()
    storage.failWrites = true
    check(!engine.brushCurves.save(edited.copy(name = "Falha de gravação")))
    check(!engine.brushCurves.unbind(1))
    check(file.readText() == beforeFile && engine.brushCurves.bindings.size == 1)
    storage.failWrites = false

    engine.brushCurves.activate("preset:choices", emptyList())
    val selector = BrushCurveTarget(70, "Perfil", 0f, 4f, "choice", listOf("0","1","2","3","4"))
    val full = user.copy(id = "user_full", name = "Carga inteira", points = listOf(0f to 1f, 1f to 1f))
    check(engine.brushCurves.save(full))
    check(engine.brushCurves.bind(BrushParameterCurve(selector, full.id)))
    runtime.begin(0f, 0f, .5f, 0, 0); runtime.applyAt(0f, 0f)
    check(EsenhoNativeBridge.parameters[70] == 4)
    runtime.end(); check(EsenhoNativeBridge.parameters[70] == 2)

    engine.selectedPreset = null
    engine.selectedBrush = TestKernel("graphite_pencil", listOf(TestParameter("Paper Tooth"), TestParameter("Graphite Load")))
    val procedural = readBrushParameterCurves(metadata.getJSONObject("proceduralCurveBindings").getJSONArray("graphite_pencil"))
    engine.brushCurves.activate("brush:graphite_pencil", procedural)
    runtime.begin(0f, 0f, .8f, 0, 0); runtime.applyAt(0f, 0f)
    check(EsenhoNativeBridge.kernel[1] != 78 && engine.selectedBrush!!.params[1].currentVal == 78)
    runtime.end(); check(EsenhoNativeBridge.kernel[1] == 78)
    engine.selectedBrush = TestKernel("soft_pastel", listOf(TestParameter("Paper Tooth"), TestParameter("Graphite Load")))
    engine.brushCurves.activate("brush:soft_pastel", procedural)
    runtime.begin(0f, 0f, .8f, 0, 0)
    check(!runtime.active)

    engine.selectedBrush = null; engine.selectedPreset = TestPreset(); engine.usesContinuousBrush = true
    engine.brushCurves.activate("preset:continuous", emptyList())
    check(engine.brushCurves.bind(BrushParameterCurve(size, full.id, high = .4f)))
    val angle = BrushCurveTarget(6,"Ângulo",0f,360f)
    check(engine.brushCurves.bind(BrushParameterCurve(angle, full.id, high = .5f)))
    val originalDynamic = EsenhoNativeBridge.dynamic.toMap()
    runtime.begin(0f, 0f, .8f, 0, 0); runtime.applyAt(0f, 0f)
    near(EsenhoNativeBridge.dynamic.getValue(39),180f)
    near(EsenhoNativeBridge.dynamic.getValue(37),originalDynamic.getValue(37))
    runtime.end()
    check(EsenhoNativeBridge.dynamic == originalDynamic) { "Every affected continuous base must be restored exactly" }
    val radius = BrushCurveTarget(-1003, "Raio contínuo", -1f, 4f)
    check(engine.brushCurves.bind(BrushParameterCurve(radius, full.id, high = .5f)))
    runtime.begin(0f, 0f, .2f, 0, 0); runtime.applyAt(0f, 0f)
    val explicitRadius = EsenhoNativeBridge.dynamic.getValue(3)
    // A constant explicit engine curve wins even when its host alias changes.
    check(engine.brushCurves.bind(BrushParameterCurve(size, "curve_linear", high = .4f)))
    runtime.end(); runtime.begin(0f,0f,.2f,0,0); runtime.applyAt(0f,0f)
    runtime.event(10f,0f,.8f,0,0); runtime.applyAt(10f,0f)
    near(EsenhoNativeBridge.dynamic.getValue(3), explicitRadius)
    runtime.end(); check(EsenhoNativeBridge.dynamic == originalDynamic)

    engine.usesContinuousBrush = false; engine.params[42] = 1
    engine.brushCurves.activate("preset:time", emptyList())
    check(engine.brushCurves.bind(BrushParameterCurve(size, "curve_pulse", input = "time", scale = .2f, repeat = true)))
    runtime.begin(80f,80f,.6f,0,0); runtime.applyAt(80f,80f)
    Thread.sleep(25)
    check(runtime.needsTimeTicks && runtime.tick(80f,80f) && EsenhoNativeBridge.strokes > 0)
    runtime.end()
    near(EsenhoNativeBridge.size,14f)
    check(!runtime.needsTimeTicks)

    check(engine.brushCurves.delete(user.id, mapOf("preset:saved_custom" to listOf(binding))))
    val afterDelete = EsenhoStorageManager(file).loadBrushCurveLibrary()
    check(afterDelete.curves.none { it.id == user.id } && afterDelete.bindings.values.flatten().none { it.curveId == user.id })
    check(afterDelete.bindings["preset:saved_custom"].orEmpty().isEmpty())
    val malformed = JSONObject().put("version",1).put("curves", JSONArray().put(JSONObject().put("id","bad")))
    check(BrushCurveLibraryState.fromJson(malformed).curves.isEmpty())
    println("Brush curve runtime: persistent library, reuse, failed saves, transient rendering, discrete controls, WASM isolation, exact restoration and time ticks passed.")
}
