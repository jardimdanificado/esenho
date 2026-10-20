package app.esenho.nativeengine

import kotlin.math.ln
import kotlin.math.roundToInt

/** Transient modulation writes to the renderer, never to preset/favorite values. */
internal class BrushCurveRuntime(private val engine: EsenhoEngine) {
    private val inputs = BrushCurveInputs()
    private var prepared = emptyList<Pair<BrushParameterCurve, SavedBrushCurve>>()
    private val bases = linkedMapOf<Int, Pair<BrushCurveTarget, Float>>()
    private val values = mutableMapOf<Int, Float>()
    private val dynamicBases = mutableMapOf<Int, Float>()
    private val intrinsicFlags = mutableMapOf<Int, Int>()
    private var lastPressure = .85f
    private var lastTiltX = 0
    private var lastTiltY = 0
    private var lastEventAt = 0.0
    val active get() = prepared.isNotEmpty()
    val needsTimeTicks get() = prepared.any { it.first.input == "time" } &&
        if (engine.usesContinuousBrush) {
            EsenhoNativeBridge.nativeDynBrushGetBase(7) > 0f || prepared.any { it.first.target.id == -1007 && it.first.input == "time" }
        } else {
            effective(42, engine.getPresetParam(42)) == 1 || prepared.any { it.first.target.id == 42 && it.first.input == "time" }
        }
    fun effective(id: Int, fallback: Int): Int = values[id]?.roundToInt() ?: fallback

    fun supports(target: BrushCurveTarget): Boolean {
        val brush = engine.selectedBrush
        if (target.id < 0 && target.id !in -1047..-1000 && target.id !in setOf(-3001, -3002, -2001, -2002, -2003)) return false
        if (engine.usesContinuousBrush && target.id >= 0 && target.id !in setOf(1, 2, 3, 4, 5, 6, 7, 19, 20) && target.id !in 58..77) return false
        if (engine.usesContinuousBrush && target.id in setOf(-3001, -3002)) return false
        if (target.id in -1047..-1000 && !engine.usesContinuousBrush) return false
        val name = if (target.id >= 10000) brush?.params?.getOrNull(target.id - 10000)?.name ?: return false else ""
        return BrushParameterScope.matches(target.owner, if (target.id >= 10000) target.name else "",
            brush?.id, target.id, name)
    }
    fun base(target: BrushCurveTarget): Float {
        val p = engine.selectedPreset
        return when {
            target.id >= 10000 -> engine.selectedBrush?.params?.getOrNull(target.id - 10000)?.currentVal?.toFloat() ?: target.min
            target.id in -1047..-1000 -> engine.dynamicBaseValue(-1000 - target.id)
            target.id == -3001 -> target.options.indexOf(p?.shape ?: "circle").coerceAtLeast(0).toFloat()
            target.id == -3002 -> target.options.indexOf(p?.texture ?: "none").coerceAtLeast(0).toFloat()
            target.id == -2003 -> target.options.indexOf(p?.dynamicConfig?.optString("pressure_curve", "linear") ?: "linear").coerceAtLeast(0).toFloat()
            target.id == -2001 -> p?.dynamicConfig?.optInt("pressure_min", 0)?.toFloat() ?: 0f
            target.id == -2002 -> p?.dynamicConfig?.optInt("pressure_max", 100)?.toFloat() ?: 100f
            target.id == 1 -> engine.brushSize
            target.id == 2 -> engine.brushOpacity * 100f
            else -> engine.getPresetParam(target.id).toFloat()
        }
    }
    fun begin(x: Float, y: Float, pressure: Float, tiltX: Int, tiltY: Int) {
        end()
        prepared = engine.brushCurves.bindings.filter { it.enabled && supports(it.target) }.mapNotNull { binding ->
            engine.brushCurves.curves.firstOrNull { it.id == binding.curveId }?.let { binding to it }
        }
        if (!active) return
        prepared.forEach { (binding, _) -> bases[binding.target.id] = binding.target to base(binding.target) }
        if (engine.usesContinuousBrush) {
            val indices = setOf(0, 3, 4, 5, 6, 7, 38, 39) + bases.keys.filter { it in -1047..-1000 }.map { -1000 - it }
            indices.forEach { dynamicBases[it] = EsenhoNativeBridge.nativeDynBrushGetBase(it) }
        } else if (engine.selectedPreset != null) {
            // A response bound directly to size/flow replaces their simple pressure switches.
            listOf(1 to 39, 4 to 40, 2 to 77).forEach { (target, flag) ->
                if (target in bases && flag !in bases) {
                    intrinsicFlags[flag] = engine.getPresetParam(flag)
                    EsenhoNativeBridge.nativeBrushSetParam(flag, 0)
                }
            }
        }
        lastEventAt = System.nanoTime() / 1e9
        inputs.begin(x, y, pressure, tiltX.toFloat(), tiltY.toFloat(), lastEventAt)
        lastPressure = pressure; lastTiltX = tiltX; lastTiltY = tiltY
    }
    fun event(x: Float, y: Float, pressure: Float, tiltX: Int, tiltY: Int) {
        if (!active) return
        lastEventAt = System.nanoTime() / 1e9
        lastPressure = pressure; lastTiltX = tiltX; lastTiltY = tiltY
        inputs.event(x, y, pressure, tiltX.toFloat(), tiltY.toFloat(), lastEventAt)
    }
    fun tick(x: Float, y: Float): Boolean {
        if (!needsTimeTicks || System.nanoTime() / 1e9 - lastEventAt < .016) return false
        event(x, y, lastPressure, lastTiltX, lastTiltY)
        applyAt(x, y)
        EsenhoNativeBridge.nativeStrokeExt(1, x, y, x, y, engine.nativeCurveStrokeColor(),
            if (engine.currentTool == ToolMode.ERASER) 1 else 0, (lastPressure * 1000).roundToInt(), lastTiltX, lastTiltY)
        return true
    }
    fun applyAt(x: Float, y: Float) {
        if (!active) return
        inputs.dab(x, y)
        val changed = mutableListOf<BrushCurveTarget>()
        prepared.forEach { (binding, curve) ->
            val target = binding.target
            val input = inputs.value(binding.input, binding.scale, binding.repeat, target.id)
            var output = BrushResponseCurve.mapOutput(curve.evaluator.valueAt(input), binding.low, binding.high,
                target.min, target.max, target.kind != "slider")
            if (target.id >= 0 && target.id != 1) output = output.roundToInt().toFloat()
            if (values[target.id] != output) {
                values[target.id] = output
                changed += target
            }
        }
        // Host controls first, explicit continuous-engine bases afterwards.
        val impactedDynamicSettings = changed.flatMap { target -> when (target.id) {
            1 -> listOf(3); 3 -> listOf(4); 5 -> listOf(5, 6, 7); 6 -> listOf(39); 7 -> listOf(38); else -> emptyList()
        } }.toSet()
        val explicitDynamic = prepared.map { it.first.target }.filter {
            it.id in -1047..-1000 && -1000 - it.id in impactedDynamicSettings
        }
        (changed + explicitDynamic).distinctBy { it.id }.sortedBy { if (it.id < 0) 1 else 0 }
            .forEach { send(it, values.getValue(it.id)) }
        if (changed.any { it.id in setOf(2, 4, -1000) } && engine.usesContinuousBrush) {
            val opacity = values[2] ?: engine.brushOpacity * 100
            val flow = values[4] ?: engine.getPresetParam(4).toFloat()
            val opaque = values[-1000] ?: engine.dynamicBaseValue(0)
            EsenhoNativeBridge.nativeDynBrushSetBase(0, opaque * opacity * flow / 10000f)
        }
        if (changed.any { it.id in -2003..-2001 }) sendPressureMap()
    }
    private fun send(target: BrushCurveTarget, value: Float) {
        val id = target.id
        when {
            id >= 10000 -> engine.selectedBrush?.params?.getOrNull(id - 10000)?.let {
                EsenhoNativeBridge.nativeSetBrushParam(id - 10000, value.roundToInt().coerceIn(it.min, it.max))
            }
            id in -1047..-1000 -> EsenhoNativeBridge.nativeDynBrushSetBase(-1000 - id,
                if (id == -1003) value.coerceIn(ln(.5f), ln(50f)) else value)
            id == -3001 -> {
                val key = target.options.getOrNull(value.roundToInt()) ?: return
                val slot = EsenhoNativeBridge.nativeSelectShape(key)
                if (slot >= 0) EsenhoNativeBridge.nativeBrushSetParam(14, slot)
            }
            id == -3002 -> {
                val key = target.options.getOrNull(value.roundToInt()) ?: return
                val slot = EsenhoNativeBridge.nativeSelectTexture(key)
                EsenhoNativeBridge.nativeBrushSetParam(18, if (key == "none") -1 else slot)
                EsenhoNativeBridge.nativeBrushSetParam(13, if (key == "none") 0 else 1)
            }
            id in -2003..-2001 -> Unit // Combined pressure map is applied after all outputs.
            id == 1 -> {
                EsenhoNativeBridge.nativeBrushSetSize(value.coerceIn(1f, 100f))
                if (engine.usesContinuousBrush) EsenhoNativeBridge.nativeDynBrushSetBase(3, ln((value / 2).coerceIn(.5f, 50f)))
            }
            else -> {
                EsenhoNativeBridge.nativeBrushSetParam(id, value.roundToInt())
                if (id == 2) EsenhoNativeBridge.nativeBrushSetProceduralOpacity((value/100).coerceIn(0f, 1f))
                if (id == 5 && engine.selectedBrush != null) EsenhoNativeBridge.nativeBrushSetProceduralSpacing(value.coerceIn(2f, 100f)/100)
                if (engine.usesContinuousBrush) when (id) {
                    3 -> EsenhoNativeBridge.nativeDynBrushSetBase(4, value/100)
                    5 -> {
                        EsenhoNativeBridge.nativeDynBrushSetBase(5, 0f)
                        EsenhoNativeBridge.nativeDynBrushSetBase(6, 100/value.coerceAtLeast(1f))
                        EsenhoNativeBridge.nativeDynBrushSetBase(7, 0f)
                    }
                    6 -> EsenhoNativeBridge.nativeDynBrushSetBase(39, value)
                    7 -> EsenhoNativeBridge.nativeDynBrushSetBase(38, 100/value.coerceAtLeast(1f))
                }
            }
        }
    }
    private fun sendPressureMap() {
        val config = engine.selectedPreset?.dynamicConfig
        val low = (values[-2001]?.roundToInt() ?: config?.optInt("pressure_min", 0) ?: 0).coerceIn(0, 99)
        val high = (values[-2002]?.roundToInt() ?: config?.optInt("pressure_max", 100) ?: 100).coerceIn(low + 1, 100)
        val target = bases[-2003]?.first
        val key = target?.options?.getOrNull(values[-2003]?.roundToInt() ?: -1)
            ?: config?.optString("pressure_curve", "linear") ?: "linear"
        val type = when (key) { "soft" -> 1; "hard" -> 2; "s-curve" -> 3; else -> if (key.toFloatOrNull() != null) 4 else 0 }
        EsenhoNativeBridge.nativeBrushSetPressureMap(low, high, type, key.toFloatOrNull() ?: 1f)
    }
    fun end() {
        if (!active) return
        values.clear()
        bases.values.forEach { (target, value) ->
            when (target.id) {
                -3001 -> EsenhoNativeBridge.nativeBrushSetParam(14, engine.selectedPreset?.shapeId ?: 0)
                -3002 -> engine.restoreCurveTexture()
                else -> send(target, value)
            }
        }
        if (bases.keys.any { it in -2003..-2001 }) sendPressureMap()
        dynamicBases.forEach { (id, value) -> EsenhoNativeBridge.nativeDynBrushSetBase(id, value) }
        intrinsicFlags.forEach { (id, value) -> EsenhoNativeBridge.nativeBrushSetParam(id, value) }
        bases.clear(); dynamicBases.clear(); intrinsicFlags.clear(); prepared = emptyList()
    }
}
