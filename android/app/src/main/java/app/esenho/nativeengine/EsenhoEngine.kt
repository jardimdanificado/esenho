package app.esenho.nativeengine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayDeque
import kotlin.math.*

val DYNAMIC_SETTING_KEYS = listOf("opaque", "opaque_multiply", "opaque_linearize", "radius_log", "hardness", "dabs_per_basic_radius", "dabs_per_actual_radius", "dabs_per_second", "radius_by_random", "speed_fine_slowness", "speed_coarse_slowness", "speed_fine_gamma", "speed_coarse_gamma", "offset_by_random", "offset_by_speed", "offset_by_speed_slowness", "lazy_tracking", "lazy_tracking_per_dab", "tracking_noise", "color_h", "color_s", "color_v", "restore_color", "change_color_h", "change_color_l", "change_color_hsl_s", "change_color_vrx", "smudge", "smudge_length", "smudge_radius_log", "smudge_bucket", "smudge_transparency", "eraser", "stroke_threshold", "stroke_duration_log", "stroke_holdtime", "custom_input", "custom_input_slowness", "ellipse_ratio", "ellipse_angle", "direction_filter", "lock_alpha", "colorize", "snap_to_pixel", "pressure_gain_log", "posterize", "posterize_num", "smudge_length_log")
private val DYNAMIC_ALIASES = mapOf("dyn_dabs_per_actual" to "dyn_dabs_per_actual_radius", "dyn_dabs_per_basic" to "dyn_dabs_per_basic_radius", "dyn_jitter_offset" to "dyn_offset_by_random", "mypaint_dabs_per_actual" to "dyn_dabs_per_actual_radius", "mypaint_dabs_per_basic" to "dyn_dabs_per_basic_radius", "mypaint_speed1_slowness" to "dyn_speed_fine_slowness", "mypaint_speed2_slowness" to "dyn_speed_coarse_slowness", "mypaint_slow_tracking" to "dyn_lazy_tracking", "mypaint_elliptical_ratio" to "dyn_ellipse_ratio", "mypaint_elliptical_angle" to "dyn_ellipse_angle", "mypaint_offset_random" to "dyn_offset_by_random")
private fun normalizeDynamicConfig(config: JSONObject): JSONObject {
    DYNAMIC_ALIASES.forEach { (alias, canonical) -> if (!config.has(canonical) && config.has(alias)) config.put(canonical, config.opt(alias)) }
    return config
}

enum class ToolMode(val id: Int, val displayName: String) {
    BRUSH(0, "Pincel"),
    ERASER(0, "Borracha"),
    SMUDGE(1, "Borrar (Smudge)"),
    BLEND(2, "Mesclar (Blend)"),
    FILL(3, "Balde de Tinta"),
    LASSO_FILL(4, "Laço Preenchido"),
    EYEDROPPER(5, "Conta-gotas"),
    LINE(6, "Linha"),
    RECTANGLE(7, "Retângulo"),
    ELLIPSE(8, "Elipse"),
    SELECT_RECT(9, "Seleção Retangular"),
    SELECT_LASSO(9, "Seleção com Laço"),
    SELECT_ELLIPSE(9, "Seleção Elíptica"),
    SELECT_BRUSH_MASK(9, "Pincel de Seleção"),
    SELECT_WAND(12, "Varinha Mágica"),
    PAN(10, "Mover Tela"),
    TRANSFORM(11, "Transformar"),
    ERASE_RECTANGLE(13, "Apagar Retângulo"),
    ERASE_ELLIPSE(14, "Apagar Elipse")
}

enum class SymmetryMode(val id: Int, val displayName: String) {
    OFF(0, "Desativado"),
    MIRROR_X(1, "Espelho X"),
    MIRROR_Y(2, "Espelho Y"),
    QUAD(3, "Espelho 4x"),
    RADIAL(4, "Radial (8x)")
}

enum class SelectionOp(val id: Int, val displayName: String) {
    REPLACE(0, "Nova"),
    ADD(1, "Adicionar +"),
    SUB(2, "Subtrair −"),
    INTERSECT(3, "Intersecção")
}

enum class LayerBlendMode(val id: Int, val displayName: String) {
    NORMAL(0, "Normal"),
    MULTIPLY(1, "Multiplicação"),
    SCREEN(2, "Divisão (Screen)"),
    OVERLAY(3, "Sobreposição"),
    DODGE(4, "Subexposição (Dodge)"),
    ADD(5, "Adição (Add)")
}

data class BrushParamModel(
    val name: String,
    val min: Int,
    val max: Int,
    val defaultVal: Int,
    val unit: String,
    var currentVal: Int
)

data class BrushPresetModel(
    val id: String,
    var name: String,
    var desc: String,
    var category: String,
    var isCustom: Boolean = false,
    var shape: String = "circle",
    var shapeId: Int = 0,
    var customShapeAsset: String = "",
    var customTextureAsset: String = "",
    var size: Int = 16,
    var opacity: Int = 100,
    var hardness: Int = 100,
    var flow: Int = 100,
    var spacing: Int = 5,
    var tolerance: Int = 32,
    var roundness: Int = 100,
    var angle: Int = 0,
    var smoothing: Int = 15,
    var midpoint: Int = 50,
    var scatter: Int = 0,
    var grain: Int = 0,
    var texMode: Int = 0,
    var texture: String = "",
    var textureScale: Int = 100,
    var textureContrast: Int = 100,
    var texScaleWithSize: Int = 0,
    var texAngle: Int = 0,
    var autoRotate: Int = 0,
    var velocity: Int = 0,
    var taperIn: Int = 0,
    var taperOut: Int = 0,
    var fade: Int = 0,
    var sizeJitter: Int = 0,
    var angleJitter: Int = 0,
    var opacityJitter: Int = 0,
    var colorJitter: Int = 0,
    var dabBlend: Int = 0,
    var subpixel: Int = 1,
    var smudge: Int = 0,
    var wetness: Int = 0,
    var depletion: Int = 0,
    var colorPickup: Int = 0,
    var pressureSize: Int = 1,
    var pressureFlow: Int = 1,
    var tiltAngle: Int = 0,
    var buildup: Int = 0,
    var water: Int = 0,
    var bleed: Int = 0,
    var granulation: Int = 0,
    var fringe: Int = 0,
    var pigmentMode: Int = 0,
    var impasto: Int = 0,
    var dryingRate: Int = 0,
    var mode: Int = 0,
    var eraser: Int = 0,
    var color: String = "",
    var engine: String = "classic",
    var dynamicConfig: JSONObject = JSONObject(),
    var realismConfig: JSONObject = JSONObject(),
    var curveBindings: List<BrushParameterCurve> = emptyList()
) {
    fun toJson(): JSONObject {
        val obj = JSONObject()
        obj.put("id", id)
        obj.put("name", name)
        obj.put("desc", desc)
        obj.put("category", category)
        obj.put("isCustom", isCustom)
        obj.put("shape", shape)
        obj.put("shape_id", shapeId)
        obj.put("custom_shape_asset", customShapeAsset)
        obj.put("custom_texture_asset", customTextureAsset)
        obj.put("size", size)
        obj.put("opacity", opacity)
        obj.put("hardness", hardness)
        obj.put("flow", flow)
        obj.put("spacing", spacing)
        obj.put("tolerance", tolerance)
        obj.put("roundness", roundness)
        obj.put("angle", angle)
        obj.put("smoothing", smoothing)
        obj.put("midpoint", midpoint)
        obj.put("scatter", scatter)
        obj.put("grain", grain)
        obj.put("tex_mode", texMode)
        obj.put("texture", texture)
        obj.put("texture_scale", textureScale)
        obj.put("texture_contrast", textureContrast)
        obj.put("tex_scale_with_size", texScaleWithSize)
        obj.put("tex_angle", texAngle)
        obj.put("auto_rotate", autoRotate)
        obj.put("velocity", velocity)
        obj.put("taper_in", taperIn)
        obj.put("taper_out", taperOut)
        obj.put("fade", fade)
        obj.put("size_jitter", sizeJitter)
        obj.put("angle_jitter", angleJitter)
        obj.put("opacity_jitter", opacityJitter)
        obj.put("color_jitter", colorJitter)
        obj.put("dab_blend", dabBlend)
        obj.put("subpixel", subpixel)
        obj.put("smudge", smudge)
        obj.put("wetness", wetness)
        obj.put("depletion", depletion)
        obj.put("color_pickup", colorPickup)
        obj.put("pressure_size", pressureSize)
        obj.put("pressure_flow", pressureFlow)
        obj.put("tilt_angle", tiltAngle)
        obj.put("buildup", buildup)
        obj.put("water", water)
        obj.put("bleed", bleed)
        obj.put("granulation", granulation)
        obj.put("fringe", fringe)
        obj.put("pigment_mode", pigmentMode)
        obj.put("impasto", impasto)
        obj.put("drying_rate", dryingRate)
        obj.put("mode", mode)
        obj.put("eraser", eraser)
        obj.put("color", color)
        obj.put("engine", engine)
        obj.put("curve_bindings", JSONArray().also { arr -> curveBindings.forEach { arr.put(it.toJson()) } })
        val realismKeys = realismConfig.keys()
        while (realismKeys.hasNext()) {
            val key = realismKeys.next()
            obj.put(key, realismConfig.opt(key))
        }
        val dynKeys = dynamicConfig.keys()
        while (dynKeys.hasNext()) {
            val key = dynKeys.next()
            if (!obj.has(key)) obj.put(key, dynamicConfig.opt(key))
        }
        return obj
    }

    companion object {
        fun fromJson(obj: JSONObject): BrushPresetModel {
            return BrushPresetModel(
                id = obj.optString("id", "custom_${System.currentTimeMillis()}"),
                name = obj.optString("name", "Custom Preset"),
                desc = obj.optString("desc", ""),
                category = obj.optString("category", "Personalizado"),
                isCustom = obj.optBoolean("isCustom", true),
                shape = obj.optString("shape", "circle"),
                shapeId = obj.optInt("shape_id", 0),
                customShapeAsset = obj.optString("custom_shape_asset", ""),
                customTextureAsset = obj.optString("custom_texture_asset", ""),
                size = obj.optInt("size", 16),
                opacity = obj.optInt("opacity", 100),
                hardness = obj.optInt("hardness", 100),
                flow = obj.optInt("flow", 100),
                spacing = obj.optInt("spacing", 5),
                tolerance = obj.optInt("tolerance", 32),
                roundness = obj.optInt("roundness", 100),
                angle = obj.optInt("angle", 0),
                smoothing = obj.optInt("smoothing", 15),
                midpoint = obj.optInt("midpoint", 50),
                scatter = obj.optInt("scatter", 0),
                grain = obj.optInt("grain", 0),
                texMode = obj.optInt("tex_mode", 0),
                texture = obj.optString("texture", ""),
                textureScale = obj.optInt("texture_scale", 100),
                textureContrast = obj.optInt("texture_contrast", 100),
                texScaleWithSize = obj.optInt("tex_scale_with_size", 0),
                texAngle = obj.optInt("tex_angle", 0),
                autoRotate = obj.optInt("auto_rotate", 0),
                velocity = obj.optInt("velocity", 0),
                taperIn = obj.optInt("taper_in", 0),
                taperOut = obj.optInt("taper_out", 0),
                fade = obj.optInt("fade", 0),
                sizeJitter = obj.optInt("size_jitter", 0),
                angleJitter = obj.optInt("angle_jitter", 0),
                opacityJitter = obj.optInt("opacity_jitter", 0),
                colorJitter = obj.optInt("color_jitter", 0),
                dabBlend = obj.optInt("dab_blend", 0),
                subpixel = obj.optInt("subpixel", 1),
                smudge = obj.optInt("smudge", 0),
                wetness = obj.optInt("wetness", 0),
                depletion = obj.optInt("depletion", 0),
                colorPickup = obj.optInt("color_pickup", 0),
                pressureSize = obj.optInt("pressure_size", 1),
                pressureFlow = obj.optInt("pressure_flow", 1),
                tiltAngle = obj.optInt("tilt_angle", 0),
                buildup = obj.optInt("buildup", 0),
                water = obj.optInt("water", 0),
                bleed = obj.optInt("bleed", 0),
                granulation = obj.optInt("granulation", 0),
                fringe = obj.optInt("fringe", 0),
                pigmentMode = obj.optInt("pigment_mode", 0),
                impasto = obj.optInt("impasto", 0),
                dryingRate = obj.optInt("drying_rate", 0),
                mode = obj.optInt("mode", 0),
                eraser = obj.optInt("eraser", 0),
                color = obj.optString("color", ""),
                engine = obj.optString("engine", "classic"),
                realismConfig = brushRealismConfig(obj),
                curveBindings = readBrushParameterCurves(obj.optJSONArray("curve_bindings")),
                dynamicConfig = normalizeDynamicConfig(JSONObject().also { config ->
                    val keys = obj.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        if (key.startsWith("dyn_") || key.startsWith("mypaint_") || key.startsWith("pressure_")) config.put(key, obj.opt(key))
                    }
                })
            )
        }
    }
}

data class ColorPaletteModel(
    val id: String,
    var name: String,
    val colors: MutableList<Int>,
    val isBuiltIn: Boolean = false
) {
    fun toJson(): JSONObject {
        val obj = JSONObject()
        obj.put("id", id)
        obj.put("name", name)
        obj.put("isBuiltIn", isBuiltIn)
        val arr = JSONArray()
        for (c in colors) {
            arr.put(c)
        }
        obj.put("colors", arr)
        return obj
    }

    companion object {
        fun fromJson(obj: JSONObject): ColorPaletteModel {
            val id = obj.optString("id", "pal_${System.currentTimeMillis()}")
            val name = obj.optString("name", "Paleta")
            val isBuiltIn = obj.optBoolean("isBuiltIn", false)
            val colorsList = mutableListOf<Int>()
            val arr = obj.optJSONArray("colors")
            if (arr != null) {
                for (i in 0 until arr.length()) {
                    colorsList.add(arr.getInt(i))
                }
            }
            return ColorPaletteModel(id, name, colorsList, isBuiltIn)
        }

        fun getDefaultPalettes(): List<ColorPaletteModel> {
            return listOf(
                ColorPaletteModel(
                    id = "classic",
                    name = "Clássico",
                    colors = mutableListOf(
                        0xFFFFFFFF.toInt(), 0xFF000000.toInt(), 0xFFE63946.toInt(),
                        0xFFF4A261.toInt(), 0xFFE9C46A.toInt(), 0xFF2A9D8F.toInt(),
                        0xFF264653.toInt(), 0xFF457B9D.toInt(), 0xFF9C27B0.toInt(), 0xFFE91E63.toInt()
                    ),
                    isBuiltIn = true
                ),
                ColorPaletteModel(
                    id = "skin",
                    name = "Pele",
                    colors = mutableListOf(
                        0xFFFFDFC4.toInt(), 0xFFF0D5BE.toInt(), 0xFFEECEB3.toInt(),
                        0xFFE1B899.toInt(), 0xFFCEAB93.toInt(), 0xFFB68B68.toInt(),
                        0xFF966847.toInt(), 0xFF654321.toInt(), 0xFF3D2314.toInt()
                    ),
                    isBuiltIn = true
                ),
                ColorPaletteModel(
                    id = "cyberpunk",
                    name = "Cyberpunk",
                    colors = mutableListOf(
                        0xFF00FFCC.toInt(), 0xFFFF0055.toInt(), 0xFF7928CA.toInt(),
                        0xFF0070F3.toInt(), 0xFFF5A623.toInt(), 0xFF50E3C2.toInt(),
                        0xFFFF007F.toInt(), 0xFF00F0FF.toInt(), 0xFF7000FF.toInt()
                    ),
                    isBuiltIn = true
                ),
                ColorPaletteModel(
                    id = "pastel",
                    name = "Pastel",
                    colors = mutableListOf(
                        0xFFFFB3BA.toInt(), 0xFFFFDFBA.toInt(), 0xFFFFFFBA.toInt(),
                        0xFFBAFFC9.toInt(), 0xFFBAE1FF.toInt(), 0xFFE8BAFF.toInt(),
                        0xFFC5BAFF.toInt(), 0xFFFFBAED.toInt()
                    ),
                    isBuiltIn = true
                ),
                ColorPaletteModel(
                    id = "manga",
                    name = "Manga",
                    colors = mutableListOf(
                        0xFF1A1A24.toInt(), 0xFF2E3440.toInt(), 0xFF4C566A.toInt(),
                        0xFFD8DEE9.toInt(), 0xFFECEFF4.toInt(), 0xFF88C0D0.toInt(),
                        0xFFBF616A.toInt(), 0xFFA3BE8C.toInt()
                    ),
                    isBuiltIn = true
                )
            )
        }
    }
}

data class BrushModel(
    val id: String,
    val title: String,
    val category: String,
    val spacing: Float,
    val minRadius: Float,
    val maxRadius: Float,
    val params: List<BrushParamModel>,
    val curveBindings: List<BrushParameterCurve> = emptyList()
)

data class FilterParamModel(
    val name: String,
    val min: Int,
    val max: Int,
    val defaultVal: Int,
    val unit: String,
    var currentVal: Int
)

data class FilterModel(
    val id: String,
    val title: String,
    val params: List<FilterParamModel>
)

data class LayerModel(
    val id: Int,
    var name: String,
    var opacity: Int = 255,
    var visible: Boolean = true,
    var blendMode: LayerBlendMode = LayerBlendMode.NORMAL,
    var alphaLock: Boolean = false,
    var clipping: Boolean = false
)

enum class DrawingGuideType { LINE, CURVE, ELLIPSE, SPHERE }

data class GuidePoint(val x: Float, val y: Float)

data class CanvasGuide(val type: DrawingGuideType, val paths: List<List<GuidePoint>>)

data class AnimationCel(
    val id: String,
    var bitmap: Bitmap,
    var duration: Int = 1,
    var visible: Boolean = true,
    var opacity: Int = 255
)

data class AnimationTrack(
    val layerId: Int,
    val frames: MutableList<AnimationCel> = mutableListOf(),
    var activeCelIndex: Int = 0
)

data class RasterLayerGroup(
    val id: String,
    var name: String,
    val layerIds: MutableList<Int> = mutableListOf(),
    val childGroupIds: MutableList<String> = mutableListOf(),
    var collapsed: Boolean = false,
    var visible: Boolean = true,
    var parentId: String? = null
)

data class OnionSkinPreview(val bitmap: Bitmap, val alpha: Int, val isPrevious: Boolean, val tint: Int)

class EsenhoEngine(
    val context: Context,
    var width: Int = 1080,
    var height: Int = 1920
) {

    private val rasterUiPreferences = context.getSharedPreferences("esenho_raster_preferences", Context.MODE_PRIVATE)

    // Catalogs
    val recentBrushIds = mutableListOf<String>().apply {
        try {
            val saved = JSONArray(rasterUiPreferences.getString("recent_brush_ids", "[]") ?: "[]")
            for (i in 0 until saved.length()) {
                val id = BrushPresetAliases.canonicalToolId(saved.optString(i))
                if (id.isNotBlank() && id !in this) add(id)
            }
        } catch (_: Exception) { }
    }

    private val strokeUsageHistory = StrokeUsageHistory()

    private fun commitStrokeHistory() {
        val changed = strokeUsageHistory.commit(recentBrushIds, recentColors)
        if (changed and StrokeUsageHistory.BRUSH_CHANGED != 0) {
            rasterUiPreferences.edit().putString("recent_brush_ids", JSONArray(recentBrushIds).toString()).apply()
        }
        if (changed and StrokeUsageHistory.COLOR_CHANGED != 0) storageManager.saveRecentColors(recentColors)
    }

    val brushCurves by lazy { BrushCurveLibrary(storageManager) }
    private val curveRuntime = BrushCurveRuntime(this)
    val usesContinuousBrush: Boolean get() = selectedPreset?.let { isDynamicPreset(it) } == true
    val needsCurveTimeTicks: Boolean get() = curveRuntime.needsTimeTicks
    fun curveParameterBase(target: BrushCurveTarget): Float = curveRuntime.base(target)
    fun supportsCurveTarget(target: BrushCurveTarget): Boolean = curveRuntime.supports(target)
    fun endCurveStroke() = curveRuntime.end()
    fun tickCurveStroke() { if (isStrokeActive) curveRuntime.tick(strokeSmoothX, strokeSmoothY) }
    internal fun nativeCurveStrokeColor(): Int = toNativeColor(currentColor)
    internal fun restoreCurveTexture() {
        val preset = selectedPreset ?: return
        val slot = customBrushAssetSlots[preset.customTextureAsset]
            ?: EsenhoNativeBridge.nativeSelectTexture(preset.texture.ifBlank { "none" })
        EsenhoNativeBridge.nativeBrushSetParam(18, slot)
        EsenhoNativeBridge.nativeBrushSetParam(13, preset.texMode)
    }
    private fun emitCurveStroke(state: Int, x: Float, y: Float, previousX: Float, previousY: Float,
        color: Int, eraser: Int, pressure: Int, tiltX: Int, tiltY: Int) {
        curveRuntime.applyAt(x, y)
        EsenhoNativeBridge.nativeStrokeExt(state, x, y, previousX, previousY, color, eraser, pressure, tiltX, tiltY)
    }
    val realismParameters = mutableListOf<BrushRealismParameter>()
    val presetCatalog = mutableListOf<BrushPresetModel>()
    val brushCatalog = mutableListOf<BrushModel>()
    val filterCatalog = mutableListOf<FilterModel>()
    var selectedPreset: BrushPresetModel? = null
        private set
    private val liveBrushSliderParams = mutableMapOf(
        3 to 75, 4 to 100, 5 to 5, 6 to 0, 7 to 100, 8 to 0, 9 to 32,
        10 to 0, 11 to 0, 12 to 0, 17 to 100, 19 to 30, 20 to 50, 21 to 100,
        27 to 0, 28 to 0, 29 to 0, 30 to 0
    )
    private val proceduralToolStates = mutableMapOf<String, JSONObject>()
    var selectedBrush: BrushModel? = null
        private set

    val activeBrushDisplayName: String
        get() = selectedPreset?.name ?: selectedBrush?.title ?: "Pincel Clássico"

    // Layer Stack
    val layers = mutableListOf<LayerModel>()
    val layerNames = mutableMapOf<Int, String>()
    val layerBaseOpacities = mutableMapOf<Int, Int>()
    val layerBaseVisibility = mutableMapOf<Int, Boolean>()
    val rasterLayerGroups = linkedMapOf<String, RasterLayerGroup>()
    val rasterGroupOrder = mutableListOf<String>()
    private var nextRasterGroupId = 1
    var activeLayerIndex: Int = 3

    // History / Undo / Redo
    private val undoStack = ArrayDeque<Bitmap>()
    private val redoStack = ArrayDeque<Bitmap>()
    // Keep metadata and retained cel bitmaps aligned with the JNI pixel
    // snapshot stack, which drops its oldest entry at depth 24.
    private val maxUndoSteps = 24

    // Animation / Raster Animator
    val animationTracks = linkedMapOf<Int, AnimationTrack>()
    val animationFrames: MutableList<AnimationCel>
        get() = activeAnimationTrack().frames
    var currentFrameIndex: Int
        get() = activeAnimationTrack().activeCelIndex
        set(value) {
            val track = activeAnimationTrack()
            track.activeCelIndex = if (track.frames.isEmpty()) 0 else value.coerceIn(track.frames.indices)
        }
    var currentAnimationTick: Int = 0
    var isAnimationPlaying: Boolean = false
    var animationLoop: Boolean = true
    var animationFps: Int = 12
    var onionSkinEnabled: Boolean = false
    var onionPrevFrames: Int = 2
    var onionNextFrames: Int = 1
    var onionOpacity: Float = 0.35f
    var onionPrevTint: Int = Color.rgb(255, 60, 60)
    var onionNextTint: Int = Color.rgb(60, 140, 255)

    private data class LayerResizeHistory(
        val layerId: Int,
        val cel: AnimationCel,
        val before: Bitmap,
        val after: Bitmap,
        val snapshotSerial: Long
    )
    private val layerResizeHistory = linkedMapOf<Long, LayerResizeHistory>()
    private val redoLayerResizeTokens = mutableSetOf<Long>()
    private data class LayerOrderHistory(
        val before: List<Int>,
        var after: List<Int>,
        val snapshotSerial: Long
    )
    private val layerOrderHistory = linkedMapOf<Long, LayerOrderHistory>()
    private val redoLayerOrderTokens = mutableSetOf<Long>()
    private data class RasterLayerState(
        val name: String,
        val opacity: Int,
        val visible: Boolean,
        val blendMode: Int,
        val alphaLock: Boolean,
        val clipping: Boolean
    )
    private data class RasterLayerHistory(
        val layerId: Int,
        val before: RasterLayerState,
        var after: RasterLayerState,
        val snapshotSerial: Long
    )
    private val rasterLayerHistory = linkedMapOf<Long, RasterLayerHistory>()
    private val redoRasterLayerTokens = mutableSetOf<Long>()
    private var pendingLayerOpacityEdit: Pair<Int, Long>? = null
    private data class CelTimelineState(val duration: Int, val visible: Boolean, val opacity: Int)
    private data class CelTimelineHistory(
        val track: AnimationTrack,
        val cel: AnimationCel,
        val before: CelTimelineState,
        var after: CelTimelineState,
        val beforeTick: Int,
        var afterTick: Int,
        val snapshotSerial: Long
    )
    private val celTimelineHistory = linkedMapOf<Long, CelTimelineHistory>()
    private val redoCelTimelineTokens = mutableSetOf<Long>()
    private var pendingCelDurationEdit: Pair<String, Long>? = null
    private data class AnimationStructureHistory(
        val track: AnimationTrack,
        val before: List<AnimationCel>,
        var after: List<AnimationCel>,
        val beforeTick: Int,
        var afterTick: Int,
        val snapshotSerial: Long
    )
    private val animationStructureHistory = linkedMapOf<Long, AnimationStructureHistory>()
    private val redoAnimationStructureTokens = mutableSetOf<Long>()
    private data class LayerMergeHistory(
        val sourceLayerId: Int,
        val destinationLayerId: Int,
        val sourceLayerState: RasterLayerState,
        val sourceTrack: AnimationTrack,
        val destinationTrackBefore: AnimationTrack,
        val destinationTrackAfter: AnimationTrack,
        val sourceWidth: Int,
        val sourceHeight: Int,
        val sourceOrderPosition: Int,
        val activeLayerBefore: Int,
        val tickBefore: Int,
        var tickAfter: Int,
        val groupLayerIdsBefore: Map<String, List<Int>>,
        var groupLayerIdsAfter: Map<String, List<Int>>,
        val snapshotSerial: Long
    )
    private val layerMergeHistory = linkedMapOf<Long, LayerMergeHistory>()
    private val redoLayerMergeTokens = mutableSetOf<Long>()
    private data class LayerDeleteHistory(
        val layerId: Int,
        val layerState: RasterLayerState,
        val track: AnimationTrack,
        val width: Int,
        val height: Int,
        val orderPosition: Int,
        val activeLayerBefore: Int,
        var activeLayerAfter: Int,
        val tickBefore: Int,
        var tickAfter: Int,
        val groupLayerIdsBefore: Map<String, List<Int>>,
        var groupLayerIdsAfter: Map<String, List<Int>>,
        val snapshotSerial: Long
    )
    private val layerDeleteHistory = linkedMapOf<Long, LayerDeleteHistory>()
    private val redoLayerDeleteTokens = mutableSetOf<Long>()
    private data class LayerAddHistory(
        val layerId: Int,
        val layerState: RasterLayerState,
        val track: AnimationTrack,
        val width: Int,
        val height: Int,
        val orderPosition: Int,
        val activeLayerBefore: Int,
        val activeLayerAfter: Int,
        val tickBefore: Int,
        val tickAfter: Int,
        val groupLayerIdsBefore: Map<String, List<Int>>,
        val groupLayerIdsAfter: Map<String, List<Int>>,
        val snapshotSerial: Long
    )
    private val layerAddHistory = linkedMapOf<Long, LayerAddHistory>()
    private val redoLayerAddTokens = mutableSetOf<Long>()
    private val groupEdits = linkedMapOf<Long, GroupEdit>()
    private var undoSnapshotSerial = 0L

    private fun activeAnimationTrack(): AnimationTrack {
        animationTracks[activeLayerIndex]?.let { return it }

        // Drawable layers must never borrow another layer's timeline. This can
        // happen briefly while layer state is being synchronized (for example
        // after importing a project or creating a layer).
        val activeLayerIsDrawable = layers.any { it.id == activeLayerIndex && it.id >= 3 }
        if (!activeLayerIsDrawable) {
            animationTracks.values.firstOrNull()?.let { return it }
        }

        return run {
            val layerWidth = EsenhoNativeBridge.nativeLayerGetWidth(activeLayerIndex).takeIf { it > 0 } ?: width
            val layerHeight = EsenhoNativeBridge.nativeLayerGetHeight(activeLayerIndex).takeIf { it > 0 } ?: height
            val bitmap = Bitmap.createBitmap(layerWidth, layerHeight, Bitmap.Config.ARGB_8888)
            EsenhoNativeBridge.nativeLayerGetBitmap(activeLayerIndex, bitmap)
            AnimationTrack(activeLayerIndex, mutableListOf(AnimationCel("Frame 1", bitmap))).also {
                animationTracks[activeLayerIndex] = it
            }
        }
    }

    fun syncAnimationTracks(blankLayerId: Int? = null) {
        val drawingLayerIds = layers.map { it.id }.filter { it >= 3 }.toSet()
        drawingLayerIds.forEach { layerId ->
            if (layerId !in animationTracks) {
                val layerWidth = EsenhoNativeBridge.nativeLayerGetWidth(layerId).takeIf { it > 0 } ?: width
                val layerHeight = EsenhoNativeBridge.nativeLayerGetHeight(layerId).takeIf { it > 0 } ?: height
                val bitmap = Bitmap.createBitmap(layerWidth, layerHeight, Bitmap.Config.ARGB_8888)
                if (layerId != blankLayerId) EsenhoNativeBridge.nativeLayerGetBitmap(layerId, bitmap)
                animationTracks[layerId] = AnimationTrack(layerId, mutableListOf(AnimationCel(
                    // Layer visibility and opacity are stored separately as base state.
                    // Keep a new cel neutral so applyAnimationTick doesn't apply them twice.
                    "Frame 1", bitmap, visible = true, opacity = 255
                )))
            }
        }
        (animationTracks.keys - drawingLayerIds).forEach { staleId ->
            animationTracks.remove(staleId)?.frames?.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
        }
    }

    fun totalAnimationTicks(): Int = animationTracks.values.maxOfOrNull { track ->
        track.frames.sumOf { it.duration.coerceAtLeast(1) }
    }?.coerceAtLeast(1) ?: 1

    fun advanceAnimationTick() {
        val next = currentAnimationTick + 1
        if (next >= totalAnimationTicks()) {
            if (!animationLoop) {
                isAnimationPlaying = false
                return
            }
            currentAnimationTick = 0
        } else {
            currentAnimationTick = next
        }
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun startAnimationPlayback() {
        captureCurrentFrame()
        isAnimationPlaying = true
    }

    fun renderAnimationFrames(): List<Bitmap> {
        captureCurrentFrame()
        val originalTick = currentAnimationTick
        val frames = mutableListOf<Bitmap>()
        repeat(totalAnimationTicks()) { tick ->
            applyAnimationTick(tick, captureActive = false)
            val composite = getRenderBitmap()
            composite?.let { frames += it.copy(Bitmap.Config.ARGB_8888, false) }
        }
        applyAnimationTick(originalTick, captureActive = false)
        return frames
    }

    /** Keep multi-layer edits atomic for compositing, including early returns. */
    private inline fun <T> withNativeLayerUpdate(action: () -> T): T {
        EsenhoNativeBridge.nativeBeginLayerUpdate()
        try {
            return action()
        } finally {
            EsenhoNativeBridge.nativeEndLayerUpdate()
        }
    }

    fun applyAnimationTick(tick: Int, captureActive: Boolean = true) {
        if (transformState != null) cancelTransform()
        if (captureActive) captureCurrentFrame()
        currentAnimationTick = tick.coerceIn(0, totalAnimationTicks() - 1)
        withNativeLayerUpdate {
            animationTracks.values.forEach { track ->
                val frameIndex = AnimationExposure.indexAt(
                    track.frames.map { it.duration }.toIntArray(), currentAnimationTick
                )
                track.activeCelIndex = frameIndex
                if (frameIndex < 0) {
                    EsenhoNativeBridge.nativeLayerClear(track.layerId)
                    EsenhoNativeBridge.nativeLayerSetVisible(track.layerId, 0)
                    return@forEach
                }
                track.frames.getOrNull(frameIndex)?.let { cel ->
                    if (cel.bitmap.width != width || cel.bitmap.height != height) {
                        val normalized = resizeBitmapToCanvas(cel.bitmap, width, height, true)
                        if (!cel.bitmap.isRecycled) cel.bitmap.recycle()
                        cel.bitmap = normalized
                    }
                    val layerWidth = EsenhoNativeBridge.nativeLayerGetWidth(track.layerId)
                    val layerHeight = EsenhoNativeBridge.nativeLayerGetHeight(track.layerId)
                    if (layerWidth != width || layerHeight != height) {
                        EsenhoNativeBridge.nativeLayerResize(track.layerId, width, height, 0)
                    }
                    EsenhoNativeBridge.nativeLayerClear(track.layerId)
                    EsenhoNativeBridge.nativeLayerDrawBitmap(track.layerId, cel.bitmap, 0, 0, width, height)
                    val baseVisible = layerBaseVisibility[track.layerId] ?: true
                    val baseOpacity = layerBaseOpacities[track.layerId] ?: 255
                    EsenhoNativeBridge.nativeLayerSetVisible(
                        track.layerId,
                        if (baseVisible && isRasterLayerGroupVisible(track.layerId) && cel.visible) 1 else 0
                    )
                    EsenhoNativeBridge.nativeLayerSetOpacity(track.layerId, (baseOpacity * cel.opacity.coerceIn(0, 255)) / 255)
                }
            }
        }
        getRenderBitmap()
    }

    // State
    var currentTool: ToolMode = ToolMode.BRUSH
    var brushSize: Float = 14f
        set(value) {
            endCurveStroke()
            field = value.coerceIn(1f, 100f)
            liveBrushSliderParams[1] = field.toInt()
            selectedPreset?.let { preset ->
                preset.size = field.toInt()
                if (isDynamicPreset(preset)) {
                    val radiusLog = ln((field / 2f).coerceAtLeast(.1f))
                    preset.dynamicConfig.put("dyn_radius_log", radiusLog)
                    EsenhoNativeBridge.nativeDynBrushSetBase(3, radiusLog)
                }
            }
            EsenhoNativeBridge.nativeBrushSetSize(field)
            EsenhoNativeBridge.nativeBrushSetParam(1, field.toInt())
        }

    var brushOpacity: Float = 1.0f
        set(value) {
            endCurveStroke()
            field = value.coerceIn(0f, 1.0f)
            val opInt = (field * 100).toInt()
            liveBrushSliderParams[2] = opInt
            EsenhoNativeBridge.nativeBrushSetParam(2, opInt)
            EsenhoNativeBridge.nativeBrushSetProceduralOpacity(field)
            selectedPreset?.let { it.opacity = opInt; syncDynamicCoverage(it) }
        }

    var brushHardness: Int = 75
        set(value) {
            field = value.coerceIn(0, 100)
            liveBrushSliderParams[3] = field
            EsenhoNativeBridge.nativeBrushSetParam(3, field)
        }

    var brushSmooth: Int = 30
        set(value) {
            field = value.coerceIn(0, 100)
            liveBrushSliderParams[19] = field
            selectedPreset?.smoothing = field
            EsenhoNativeBridge.nativeBrushSetParam(19, field)
        }

    // Storage & Custom Palettes
    val storageManager by lazy { EsenhoStorageManager(context) }
    private val customBrushAssetSlots = mutableMapOf<String, Int>()
    val palettes = mutableListOf<ColorPaletteModel>()
    var activePaletteId: String = "classic"

    fun getActivePalette(): ColorPaletteModel? {
        return palettes.find { it.id == activePaletteId } ?: palettes.firstOrNull()
    }

    var currentColor: Int = Color.rgb(24, 24, 24)
        set(value) {
            field = value
            try {
                storageManager.saveSessionState(selectedPreset?.id, activePaletteId, value)
            } catch (_: Exception) {}
        }

    val recentColors = mutableListOf<Int>()

    var symmetryMode: SymmetryMode = SymmetryMode.OFF
        set(value) {
            field = value
            EsenhoNativeBridge.nativeBrushSetSymmetry(value.id)
            EsenhoNativeBridge.nativeBrushSetParam(38, value.id)
        }

    var selectionOp: SelectionOp = SelectionOp.values().firstOrNull {
        it.name == rasterUiPreferences.getString("selection_op", SelectionOp.REPLACE.name)
    } ?: SelectionOp.REPLACE
        set(value) {
            field = value
            rasterUiPreferences.edit().putString("selection_op", value.name).apply()
        }
    var wandTolerance: Int = rasterUiPreferences.getInt("wand_tolerance", 30).coerceIn(0, 255)
        set(value) {
            field = value.coerceIn(0, 255)
            rasterUiPreferences.edit().putInt("wand_tolerance", field).apply()
        }
    var wandContiguous: Boolean = rasterUiPreferences.getBoolean("wand_contiguous", true)
        set(value) {
            field = value
            rasterUiPreferences.edit().putBoolean("wand_contiguous", value).apply()
        }
    var selectionActive: Boolean = false
        private set
    var selectionBounds: android.graphics.Rect? = null
        private set
    var selectionHasMask: Boolean = false
        private set
    var selectionPath: android.graphics.Path? = null
    private data class TransformSelectionBackup(val bounds: android.graphics.Rect, val mask: ByteArray?)
    private var transformSelectionBackup: TransformSelectionBackup? = null
    private var transformUndoToken = 0L
    private var selectionClipboard: Bitmap? = null
    val hasSelectionClipboard: Boolean
        get() = selectionClipboard?.isRecycled == false

    var pixelArtGrid: Boolean = false
    // The pixel art overlay follows the actual document pixel boundaries.
    var pixelArtGridStep: Int = 1
    var guideSnapEnabled: Boolean = true
    var snapToAllVisibleGuides: Boolean = false
    val snapGuideIndices = mutableSetOf<Int>()
    var guideCreationType: DrawingGuideType? = null
    val canvasGuides = mutableListOf<CanvasGuide>()
    var activeCanvasGuideIndex: Int = -1

    fun removeCanvasGuide(index: Int) {
        if (index !in canvasGuides.indices) return
        canvasGuides.removeAt(index)
        val adjusted = snapGuideIndices.mapNotNull { selected ->
            when {
                selected == index -> null
                selected > index -> selected - 1
                else -> selected
            }
        }
        snapGuideIndices.clear()
        snapGuideIndices.addAll(adjusted)
        activeCanvasGuideIndex = when {
            activeCanvasGuideIndex == index -> canvasGuides.lastIndex
            activeCanvasGuideIndex > index -> activeCanvasGuideIndex - 1
            else -> activeCanvasGuideIndex
        }
    }

    val lassoPoints = mutableListOf<Pair<Int, Int>>()
    private var selectionBrushScratchLayer = -1
    private var selectionBrushRestoreLayer = -1
    private var selectionBrushOriginalInfo: IntArray? = null
    private var selectionBrushOriginalMask: ByteArray? = null
    var strokeStartX = 0f
    var strokeStartY = 0f
    var strokeCurrentX = 0f
    var strokeCurrentY = 0f

    private var renderBitmap: Bitmap? = null
    var isStrokeActive = false
        private set
    private var activeStrokeUndoToken = 0L
    private var lastX = 0f
    private var lastY = 0f
    private var strokeSmoothX = 0f
    private var strokeSmoothY = 0f
    private var strokeLastMidX = 0f
    private var strokeLastMidY = 0f
    private var strokePrevTargetX = 0f
    private var strokePrevTargetY = 0f

    init {
        loadCatalogs()
        initEngine(width, height)
    }

    private fun loadCatalogs() {
        try {
            val resId = context.resources.getIdentifier("esenho_native_metadata", "raw", context.packageName)
            check(resId != 0) { "Catálogo nativo não gerado" }
            val jsonStr = context.resources.openRawResource(resId).bufferedReader().use { it.readText() }
            val root = JSONObject(jsonStr)

            brushCurves.installBuiltins(root.optJSONArray("responseCurves"))
            realismParameters.clear()
            root.optJSONArray("realismParameters")?.let { parameters ->
                for (i in 0 until parameters.length()) {
                    realismParameters.add(BrushRealismParameter.fromJson(parameters.getJSONObject(i)))
                }
            }

            // 1. Curated Presets (from src/presets_data.js)
            val presetsArr = root.optJSONArray("presets")
            presetCatalog.clear()
            if (presetsArr != null) {
                for (i in 0 until presetsArr.length()) {
                    val p = presetsArr.getJSONObject(i)
                    // Keep one catalog entry per brush; storage resolves legacy IDs.
                    if (BrushPresetAliases.isAlias(p.getString("id"))) continue
                    presetCatalog.add(
                        BrushPresetModel(
                            id = p.getString("id"),
                            name = p.optString("name", p.getString("id")),
                            desc = p.optString("desc", ""),
                            category = p.optString("category", "Geral"),
                            shape = p.optString("shape", "circle"),
                            shapeId = p.optInt("shape_id", 0),
                            size = p.optInt("size", 10),
                            opacity = p.optInt("opacity", 100),
                            hardness = p.optInt("hardness", 70),
                            flow = p.optInt("flow", 100),
                            spacing = p.optInt("spacing", 5),
                            tolerance = p.optInt("tolerance", 32),
                            roundness = p.optInt("roundness", 100),
                            angle = p.optInt("angle", 0),
                            smoothing = p.optInt("smoothing", 15),
                            midpoint = p.optInt("midpoint", 50),
                            scatter = p.optInt("scatter", 0),
                            grain = p.optInt("grain", 0),
                            texMode = p.optInt("tex_mode", 0),
                            texture = p.optString("texture", ""),
                            textureScale = p.optInt("texture_scale", 100),
                            textureContrast = p.optInt("texture_contrast", 100),
                            texScaleWithSize = p.optInt("tex_scale_with_size", 0),
                            texAngle = p.optInt("tex_angle", 0),
                            autoRotate = p.optInt("auto_rotate", 0),
                            velocity = p.optInt("velocity", 0),
                            taperIn = p.optInt("taper_in", 0),
                            taperOut = p.optInt("taper_out", 0),
                            fade = p.optInt("fade", 0),
                            sizeJitter = p.optInt("size_jitter", 0),
                            angleJitter = p.optInt("angle_jitter", 0),
                            opacityJitter = p.optInt("opacity_jitter", 0),
                            colorJitter = p.optInt("color_jitter", 0),
                            dabBlend = p.optInt("dab_blend", 0),
                            subpixel = p.optInt("subpixel", 1),
                            smudge = p.optInt("smudge", 0),
                            wetness = p.optInt("wetness", 0),
                            depletion = p.optInt("depletion", 0),
                            colorPickup = p.optInt("color_pickup", 0),
                            pressureSize = p.optInt("pressure_size", 1),
                            pressureFlow = p.optInt("pressure_flow", 1),
                            tiltAngle = p.optInt("tilt_angle", 0),
                            buildup = p.optInt("buildup", 0),
                            water = p.optInt("water", 0),
                            bleed = p.optInt("bleed", 0),
                            granulation = p.optInt("granulation", 0),
                            fringe = p.optInt("fringe", 0),
                            pigmentMode = p.optInt("pigment_mode", 0),
                            impasto = p.optInt("impasto", 0),
                            dryingRate = p.optInt("drying_rate", 0),
                            mode = p.optInt("mode", 0),
                            eraser = p.optInt("eraser", 0),
                            color = p.optString("color", ""),
                            engine = p.optString("engine", "classic"),
                            realismConfig = brushRealismConfig(p),
                            curveBindings = readBrushParameterCurves(p.optJSONArray("curve_bindings")),
                            dynamicConfig = normalizeDynamicConfig(JSONObject().also { config ->
                                val keys = p.keys()
                                while (keys.hasNext()) { val key = keys.next(); if (key.startsWith("dyn_") || key.startsWith("mypaint_") || key.startsWith("pressure_")) config.put(key, p.get(key)) }
                            })
                        )
                    )
                }
            }

            // 1b. User Custom Presets (persisted in filesDir)
            try {
                val customPresets = storageManager.loadCustomPresets()
                for (cp in customPresets) {
                    if (presetCatalog.none { it.id == cp.id }) {
                        presetCatalog.add(cp)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // 2. Procedural Brushes (from src/plugins/brushes/*.c)
            val brushesArr = root.optJSONArray("brushes")
            brushCatalog.clear()
            if (brushesArr != null) {
                for (i in 0 until brushesArr.length()) {
                    val obj = brushesArr.getJSONObject(i)
                    val id = obj.getString("id")
                    val title = obj.optString("title", id)
                    val category = obj.optString("category", "Geral")
                    val spacing = obj.optDouble("spacing", 0.08).toFloat()
                    val minR = obj.optDouble("minRadius", 2.0).toFloat()
                    val maxR = obj.optDouble("maxRadius", 150.0).toFloat()

                    val paramsList = mutableListOf<BrushParamModel>()
                    val paramsArr = obj.optJSONArray("params")
                    if (paramsArr != null) {
                        for (p in 0 until paramsArr.length()) {
                            val pObj = paramsArr.getJSONObject(p)
                            val pName = pObj.getString("name")
                            val pMin = pObj.optInt("min", 0)
                            val pMax = pObj.optInt("max", 100)
                            val pDef = pObj.optInt("default", 50)
                            val pUnit = pObj.optString("unit", "%")
                            paramsList.add(BrushParamModel(pName, pMin, pMax, pDef, pUnit, pDef))
                        }
                    }
                    brushCatalog.add(BrushModel(id, title, category, spacing, minR, maxR, paramsList,
                        readBrushParameterCurves(root.optJSONObject("proceduralCurveBindings")?.optJSONArray(id))))
                }
            }

            // 3. Filters (from src/plugins/*.c)
            val filtersArr = root.optJSONArray("filters")
            filterCatalog.clear()
            if (filtersArr != null) {
                for (i in 0 until filtersArr.length()) {
                    val obj = filtersArr.getJSONObject(i)
                    val id = obj.getString("id")
                    val title = obj.optString("title", id)
                    val paramsList = mutableListOf<FilterParamModel>()
                    val paramsArr = obj.optJSONArray("params")
                    if (paramsArr != null) {
                        for (p in 0 until paramsArr.length()) {
                            val pObj = paramsArr.getJSONObject(p)
                            val pName = pObj.getString("name")
                            val pMin = pObj.optInt("min", 0)
                            val pMax = pObj.optInt("max", 100)
                            val pDef = pObj.optInt("default", 50)
                            val pUnit = pObj.optString("unit", "")
                            paramsList.add(FilterParamModel(pName, pMin, pMax, pDef, pUnit, pDef))
                        }
                    }
                    filterCatalog.add(FilterModel(id, title, paramsList))
                }
            }

            // 4. Load Palettes and Recent Colors from persistent storage
            try {
                palettes.clear()
                palettes.addAll(storageManager.loadPalettes())

                val savedRecent = storageManager.loadRecentColors()
                if (savedRecent.isNotEmpty()) {
                    recentColors.clear()
                    recentColors.addAll(savedRecent)
                }

                // 5. Restore session state
                val session = storageManager.loadSessionState()
                if (session.activePaletteId != null && palettes.any { it.id == session.activePaletteId }) {
                    activePaletteId = session.activePaletteId
                }
                if (session.currentColor != null) {
                    currentColor = session.currentColor
                }
                if (selectedPreset == null && presetCatalog.isNotEmpty()) {
                    val restorePreset = if (session.lastPresetId != null) {
                        presetCatalog.find { it.id == session.lastPresetId }
                    } else null
                    val defaultPreset = restorePreset ?: presetCatalog.find { it.id == "pencil_hb" } ?: presetCatalog.first()
                    selectPreset(defaultPreset)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun initEngine(w: Int, h: Int) {
        cancelActiveStroke()
        transformState?.release()
        transformState = null
        if (renderBitmap != null) {
            // w_init() resizes an initialized native canvas; it does not discard its layers.
            // Keep one ordered layer as the new background and remove the old document stack.
            val existingLayerIds = (0 until EsenhoNativeBridge.nativeLayerGetCount())
                .mapNotNull { EsenhoNativeBridge.nativeLayerGetOrder(it).takeIf { id -> id >= 0 } }
            existingLayerIds.firstOrNull()?.let { backgroundId ->
                existingLayerIds.drop(1).forEach(EsenhoNativeBridge::nativeLayerDelete)
                EsenhoNativeBridge.nativeLayerSelect(backgroundId)
                EsenhoNativeBridge.nativeLayerClear(backgroundId)
                EsenhoNativeBridge.nativeLayerSetVisible(backgroundId, 1)
                EsenhoNativeBridge.nativeLayerSetOpacity(backgroundId, 255)
                EsenhoNativeBridge.nativeLayerSetBlendMode(backgroundId, LayerBlendMode.NORMAL.id)
                EsenhoNativeBridge.nativeLayerSetAlphaLock(backgroundId, 0)
                EsenhoNativeBridge.nativeLayerSetClipping(backgroundId, 0)
            }
        }
        renderBitmap?.takeUnless { it.isRecycled }?.recycle()
        undoStack.forEach { if (!it.isRecycled) it.recycle() }
        redoStack.forEach { if (!it.isRecycled) it.recycle() }
        undoStack.clear()
        redoStack.clear()
        layerResizeHistory.values.forEach {
            if (!it.before.isRecycled) it.before.recycle()
            if (!it.after.isRecycled) it.after.recycle()
        }
        val historyCels = animationStructureHistory.values.flatMap { it.before + it.after } +
            celTimelineHistory.values.map { it.cel } + layerResizeHistory.values.map { it.cel } +
            layerMergeHistory.values.flatMap {
                it.sourceTrack.frames + it.destinationTrackBefore.frames + it.destinationTrackAfter.frames
            } + layerDeleteHistory.values.flatMap { it.track.frames } +
            layerAddHistory.values.flatMap { it.track.frames }
        layerResizeHistory.clear()
        redoLayerResizeTokens.clear()
        layerOrderHistory.clear()
        redoLayerOrderTokens.clear()
        rasterLayerHistory.clear()
        redoRasterLayerTokens.clear()
        pendingLayerOpacityEdit = null
        celTimelineHistory.clear()
        redoCelTimelineTokens.clear()
        pendingCelDurationEdit = null
        animationStructureHistory.clear()
        redoAnimationStructureTokens.clear()
        layerMergeHistory.clear()
        redoLayerMergeTokens.clear()
        layerDeleteHistory.clear()
        redoLayerDeleteTokens.clear()
        layerAddHistory.clear()
        redoLayerAddTokens.clear()
        recycleUnreferencedAnimationCels(historyCels)
        undoSnapshotSerial = 0L
        EsenhoNativeBridge.nativeSelectClear()
        selectionActive = false
        selectionBounds = null
        selectionHasMask = false
        selectionPath = null
        transformSelectionBackup = null
        transformUndoToken = 0L
        clearSelectionBrushState()
        currentTool = ToolMode.BRUSH
        isAnimationPlaying = false
        width = w
        height = h
        selectionClipboard?.takeUnless { it.isRecycled }?.recycle()
        selectionClipboard = null
        animationTracks.values.flatMap { it.frames }.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
        animationTracks.clear()
        layerNames.clear()
        layerBaseOpacities.clear()
        layerBaseVisibility.clear()
        rasterLayerGroups.clear()
        groupEdits.clear()
        rasterGroupOrder.clear()
        canvasGuides.clear()
        snapGuideIndices.clear()
        snapToAllVisibleGuides = false
        activeCanvasGuideIndex = -1
        nextRasterGroupId = 1
        currentAnimationTick = 0
        EsenhoNativeBridge.nativeInit(width, height)
        customBrushAssetSlots.clear()
        renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        // Reset brush params
        EsenhoNativeBridge.nativeBrushSetSize(brushSize)
        EsenhoNativeBridge.nativeBrushSetParam(1, brushSize.toInt())
        EsenhoNativeBridge.nativeBrushSetParam(2, (brushOpacity * 100).toInt())
        EsenhoNativeBridge.nativeBrushSetParam(3, brushHardness)
        EsenhoNativeBridge.nativeBrushSetParam(4, 100) // Flow 100%
        EsenhoNativeBridge.nativeBrushSetParam(19, brushSmooth)

        // Draw background canvas layer white
        EsenhoNativeBridge.nativeDrawRect(0, 0, width, height, toNativeColor(Color.WHITE))

        // Create standard drawing layer directly above Background so Background is preserved during undo / erase
        val drawLayerId = EsenhoNativeBridge.nativeLayerAdd()
        if (drawLayerId >= 0) {
            EsenhoNativeBridge.nativeLayerSelect(drawLayerId)
        }

        syncLayers()

        // syncLayers creates one first cel for each drawable layer.
        currentFrameIndex = 0
        selectedPreset?.let { selectPreset(it) }
    }

    fun createDocument(w: Int, h: Int, background: Int = Color.WHITE) {
        initEngine(w,h)
        if(background != Color.WHITE) {
            val drawing = activeLayerIndex
            val base = layers.firstOrNull()?.id ?: drawing
            selectLayer(base)
            EsenhoNativeBridge.nativeLayerClear(base)
            if(background != Color.TRANSPARENT) EsenhoNativeBridge.nativeDrawRect(0,0,w,h,toNativeColor(background))
            captureCurrentFrame(base)
            selectLayer(drawing)
            getRenderBitmap()
        }
    }

    fun resize(w: Int, h: Int) {
        if (w <= 0 || h <= 0 || (w == width && h == height)) return
        width = w
        height = h
        EsenhoNativeBridge.nativeResize(w, h)
        renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        undoStack.clear()
        redoStack.clear()
        syncLayers()
    }

    /** Resize the document and every raster cel, matching the web canvas resize operation. */
    fun resizeCanvas(newWidth: Int, newHeight: Int, resample: Boolean = true): Boolean {
        if (transformState != null || newWidth !in 1..8192 || newHeight !in 1..8192 ||
            newWidth.toLong() * newHeight > 32_000_000L ||
            (newWidth == width && newHeight == height)) return false

        captureAllCurrentFrames()
        val resizedCels = mutableListOf<Pair<AnimationCel, Bitmap>>()
        val resizedLayers = mutableListOf<Pair<Int, Bitmap>>()
        try {
            layers.filter { it.id >= 3 }.forEach { layer ->
                val source = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                if (!EsenhoNativeBridge.nativeLayerGetBitmap(layer.id, source)) {
                    source.recycle()
                    error("Could not read layer ${layer.name}")
                }
                resizedLayers += layer.id to resizeBitmapToCanvas(source, newWidth, newHeight, resample)
                source.recycle()
            }
            animationTracks.values.forEach { track ->
                track.frames.forEach { cel ->
                    val scaled = resizeBitmapToCanvas(cel.bitmap, newWidth, newHeight, resample)
                    resizedCels += cel to scaled
                }
            }
        } catch (error: Exception) {
            resizedCels.forEach { (_, bitmap) -> if (!bitmap.isRecycled) bitmap.recycle() }
            resizedLayers.forEach { (_, bitmap) -> if (!bitmap.isRecycled) bitmap.recycle() }
            return false
        } catch (error: OutOfMemoryError) {
            resizedCels.forEach { (_, bitmap) -> if (!bitmap.isRecycled) bitmap.recycle() }
            resizedLayers.forEach { (_, bitmap) -> if (!bitmap.isRecycled) bitmap.recycle() }
            return false
        }

        clearSelection()
        width = newWidth
        height = newHeight
        EsenhoNativeBridge.nativeResize(newWidth, newHeight)
        resizedLayers.forEach { (layerId, bitmap) ->
            EsenhoNativeBridge.nativeLayerClear(layerId)
            EsenhoNativeBridge.nativeLayerDrawBitmap(layerId, bitmap, 0, 0, newWidth, newHeight)
            if (!bitmap.isRecycled) bitmap.recycle()
        }
        resizedCels.forEach { (cel, bitmap) ->
            if (cel.bitmap !== bitmap && !cel.bitmap.isRecycled) cel.bitmap.recycle()
            cel.bitmap = bitmap
        }
        renderBitmap?.takeUnless { it.isRecycled }?.recycle()
        renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        syncLayers()
        currentAnimationTick = currentAnimationTick.coerceIn(0, totalAnimationTicks() - 1)
        applyAnimationTick(currentAnimationTick, captureActive = false)
        return true
    }

    private fun resizeBitmapToCanvas(source: Bitmap, newWidth: Int, newHeight: Int, resample: Boolean): Bitmap {
        if (resample) return Bitmap.createScaledBitmap(source, newWidth, newHeight, true)
        return Bitmap.createBitmap(newWidth, newHeight, Bitmap.Config.ARGB_8888).also { target ->
            val canvas = android.graphics.Canvas(target)
            canvas.drawBitmap(source, ((newWidth - source.width) / 2).toFloat(), ((newHeight - source.height) / 2).toFloat(), null)
        }
    }

    /** Crops the document and every raster cel to the active selection bounds. */
    fun cropCanvasToSelection(): Boolean {
        if (transformState != null) return false
        val bounds = selectionBounds ?: return false
        val left = bounds.left.coerceIn(0, width)
        val top = bounds.top.coerceIn(0, height)
        val right = bounds.right.coerceIn(left, width)
        val bottom = bounds.bottom.coerceIn(top, height)
        val cropWidth = right - left
        val cropHeight = bottom - top
        if (cropWidth <= 0 || cropHeight <= 0 || (cropWidth == width && cropHeight == height)) return false

        captureAllCurrentFrames()
        val croppedCels = mutableListOf<Pair<AnimationCel, Bitmap>>()
        try {
            animationTracks.values.forEach { track ->
                track.frames.forEach { cel ->
                    val cropped = Bitmap.createBitmap(cropWidth, cropHeight, Bitmap.Config.ARGB_8888)
                    Canvas(cropped).drawBitmap(cel.bitmap, -left.toFloat(), -top.toFloat(), Paint(Paint.FILTER_BITMAP_FLAG))
                    croppedCels += cel to cropped
                }
            }
        } catch (error: Exception) {
            croppedCels.forEach { (_, bitmap) -> if (!bitmap.isRecycled) bitmap.recycle() }
            return false
        } catch (error: OutOfMemoryError) {
            croppedCels.forEach { (_, bitmap) -> if (!bitmap.isRecycled) bitmap.recycle() }
            return false
        }

        clearSelection()
        width = cropWidth
        height = cropHeight
        EsenhoNativeBridge.nativeResize(width, height)
        croppedCels.forEach { (cel, bitmap) ->
            if (!cel.bitmap.isRecycled) cel.bitmap.recycle()
            cel.bitmap = bitmap
        }
        renderBitmap?.takeUnless { it.isRecycled }?.recycle()
        renderBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        syncLayers()
        currentAnimationTick = currentAnimationTick.coerceIn(0, totalAnimationTicks() - 1)
        applyAnimationTick(currentAnimationTick, captureActive = false)
        return true
    }

    // ── Brush Preset & Procedural Selection & Tuning ──

    fun selectPreset(sourcePreset: BrushPresetModel, restoreFavoriteState: Boolean = true) {
        endCurveStroke()
        rememberProceduralToolState()
        val saved = (if (restoreFavoriteState) storageManager.loadFavoriteToolState("preset:${sourcePreset.id}") else null)
            ?.takeIf { it.optString("kind") == "preset" }
            ?.optJSONObject("preset")
        val preset = saved?.let(BrushPresetModel::fromJson) ?: sourcePreset
        if (!sourcePreset.isCustom && !preset.isCustom && sourcePreset.texture == "none" &&
            preset.customTextureAsset.isBlank() && preset.texture in setOf(
                "paper", "canvas", "linen", "charcoal_tooth", "pastel_board", "watercolor",
                "washi", "dry_scrape", "stipple_noise", "spatter_drops", "grunge"
            )) {
            // Migrate the former shipped masks in saved favorites, preserving
            // custom image textures and intentional decorative screens.
            preset.texture = "none"
            preset.texMode = 0
            preset.grain = sourcePreset.grain
        }
        selectedPreset = preset
        selectedBrush = null
        EsenhoNativeBridge.nativeBrushReset()
        EsenhoNativeBridge.nativeSelectBrush("classic")
        EsenhoNativeBridge.nativeDynBrushReset()
        EsenhoNativeBridge.nativeDynBrushEnable(false)

        brushSize = preset.size.toFloat()
        brushOpacity = preset.opacity / 100f
        brushHardness = preset.hardness
        brushSmooth = preset.smoothing

        // Select exact tip shape and grain texture from builtin library
        if (preset.customShapeAsset.isNotBlank()) {
            val slot = customBrushAssetSlots[preset.customShapeAsset]
                ?: storageManager.loadCustomBrushAsset(preset.customShapeAsset)?.let { bitmap ->
                    try {
                        EsenhoNativeBridge.nativeCreateBrushAsset(bitmap).takeIf { it >= 0 }
                    } finally {
                        bitmap.recycle()
                    }
                }
            if (slot != null && slot >= 0) {
                customBrushAssetSlots[preset.customShapeAsset] = slot
                preset.shapeId = slot
            } else {
                preset.shapeId = 0
            }
        } else if (preset.shape.isNotBlank()) {
            val shapeSlot = EsenhoNativeBridge.nativeSelectShape(preset.shape)
            preset.shapeId = shapeSlot
        }
        if (preset.customTextureAsset.isNotBlank()) {
            val slot = customBrushAssetSlots[preset.customTextureAsset]
                ?: storageManager.loadCustomBrushAsset(preset.customTextureAsset)?.let { bitmap ->
                    try {
                        EsenhoNativeBridge.nativeCreateBrushAsset(bitmap).takeIf { it >= 0 }
                    } finally {
                        bitmap.recycle()
                    }
                }
            if (slot != null && slot >= 0) {
                customBrushAssetSlots[preset.customTextureAsset] = slot
                EsenhoNativeBridge.nativeBrushSetParam(18, slot)
                if (preset.texMode == 0) preset.texMode = 1
            } else {
                EsenhoNativeBridge.nativeSelectTexture("none")
                EsenhoNativeBridge.nativeBrushSetParam(18, -1)
            }
        } else if (preset.texture.isNotBlank() && preset.texture != "none") {
            val texSlot = EsenhoNativeBridge.nativeSelectTexture(preset.texture)
            if (texSlot >= 0) {
                EsenhoNativeBridge.nativeBrushSetParam(18, texSlot)
                if (preset.texMode == 0) preset.texMode = 1
            }
        } else {
            EsenhoNativeBridge.nativeSelectTexture("none")
            EsenhoNativeBridge.nativeBrushSetParam(18, -1)
        }

        // Configure all C Quadro Engine physical params
        EsenhoNativeBridge.nativeBrushSetParam(1, preset.size)
        EsenhoNativeBridge.nativeBrushSetParam(2, preset.opacity)
        EsenhoNativeBridge.nativeBrushSetParam(3, preset.hardness)
        EsenhoNativeBridge.nativeBrushSetParam(4, preset.flow)
        EsenhoNativeBridge.nativeBrushSetParam(5, preset.spacing)
        EsenhoNativeBridge.nativeBrushSetParam(9, preset.tolerance.coerceIn(0, 255))
        EsenhoNativeBridge.nativeBrushSetParam(6, preset.angle)
        EsenhoNativeBridge.nativeBrushSetParam(7, preset.roundness)
        EsenhoNativeBridge.nativeBrushSetParam(8, preset.scatter)
        EsenhoNativeBridge.nativeBrushSetParam(10, preset.smudge)
        EsenhoNativeBridge.nativeBrushSetParam(11, preset.wetness)
        EsenhoNativeBridge.nativeBrushSetParam(12, preset.grain)
        EsenhoNativeBridge.nativeBrushSetParam(13, preset.texMode)
        EsenhoNativeBridge.nativeBrushSetParam(14, preset.shapeId)
        EsenhoNativeBridge.nativeBrushSetParam(15, preset.mode)
        EsenhoNativeBridge.nativeBrushSetParam(16, preset.texAngle)
        EsenhoNativeBridge.nativeBrushSetParam(17, preset.textureScale)
        EsenhoNativeBridge.nativeBrushSetParam(19, preset.smoothing)
        EsenhoNativeBridge.nativeBrushSetParam(20, preset.midpoint)
        EsenhoNativeBridge.nativeBrushSetParam(21, preset.textureContrast)
        EsenhoNativeBridge.nativeBrushSetParam(22, preset.autoRotate)
        EsenhoNativeBridge.nativeBrushSetParam(23, preset.velocity)
        EsenhoNativeBridge.nativeBrushSetParam(24, preset.taperIn)
        EsenhoNativeBridge.nativeBrushSetParam(25, preset.taperOut)
        EsenhoNativeBridge.nativeBrushSetParam(26, preset.fade)
        EsenhoNativeBridge.nativeBrushSetParam(27, preset.sizeJitter)
        EsenhoNativeBridge.nativeBrushSetParam(28, preset.angleJitter)
        EsenhoNativeBridge.nativeBrushSetParam(29, preset.opacityJitter)
        EsenhoNativeBridge.nativeBrushSetParam(30, preset.colorJitter)
        EsenhoNativeBridge.nativeBrushSetParam(31, preset.dabBlend)
        EsenhoNativeBridge.nativeBrushSetParam(32, preset.subpixel)
        EsenhoNativeBridge.nativeBrushSetParam(33, preset.depletion)
        EsenhoNativeBridge.nativeBrushSetParam(34, preset.colorPickup)
        EsenhoNativeBridge.nativeBrushSetParam(39, preset.pressureSize)
        EsenhoNativeBridge.nativeBrushSetParam(40, preset.pressureFlow)
        EsenhoNativeBridge.nativeBrushSetParam(41, preset.tiltAngle)
        EsenhoNativeBridge.nativeBrushSetParam(42, preset.buildup)
        EsenhoNativeBridge.nativeBrushSetParam(50, preset.water)
        EsenhoNativeBridge.nativeBrushSetParam(51, preset.bleed)
        EsenhoNativeBridge.nativeBrushSetParam(52, preset.granulation)
        EsenhoNativeBridge.nativeBrushSetParam(53, preset.fringe)
        EsenhoNativeBridge.nativeBrushSetParam(54, preset.pigmentMode)
        EsenhoNativeBridge.nativeBrushSetParam(55, preset.impasto)
        EsenhoNativeBridge.nativeBrushSetParam(56, preset.dryingRate)
        EsenhoNativeBridge.nativeBrushSetParam(57, preset.texScaleWithSize)

        realismParameters.forEach { param ->
            EsenhoNativeBridge.nativeBrushSetParam(param.id,
                preset.realismConfig.optInt(param.key, param.default).coerceIn(param.min, param.max))
        }
        syncDynamicBrush(preset)

        listOf(3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 17, 19, 20, 21, 27, 28, 29, 30)
            .forEach { liveBrushSliderParams[it] = getPresetParam(it) }

        if (preset.color.isNotBlank()) {
            try {
                if (preset.color.startsWith("#")) {
                    currentColor = Color.parseColor(preset.color)
                }
            } catch (_: Exception) {}
        }

        brushCurves.activate("preset:${preset.id}", preset.curveBindings)
        currentTool = if (preset.eraser == 1) ToolMode.ERASER else ToolMode.BRUSH
    }

    private fun isDynamicPreset(preset: BrushPresetModel): Boolean =
        preset.engine.equals("dynamic", true) || preset.engine.equals("mypaint", true) ||
            preset.dynamicConfig.optBoolean("dyn_continuous", false)

    private fun syncDynamicCoverage(preset: BrushPresetModel) {
        if (!isDynamicPreset(preset)) return
        val base = preset.dynamicConfig.optDouble("dyn_opaque",
            preset.dynamicConfig.optDouble("mypaint_opaque", 1.0)).toFloat()
        EsenhoNativeBridge.nativeDynBrushSetBase(0,
            base * preset.opacity.coerceIn(0, 100) * preset.flow.coerceIn(0, 100) / 10000f)
    }

    private fun syncDynamicBrush(preset: BrushPresetModel) {
        val settingKeys = DYNAMIC_SETTING_KEYS
        val dynamic = preset.engine.equals("dynamic", true) || preset.engine.equals("mypaint", true) || preset.dynamicConfig.optBoolean("dyn_continuous", false)
        val pressureCurve = preset.dynamicConfig.opt("pressure_curve")?.toString()?.lowercase().orEmpty()
        val curveType = when (pressureCurve) {
            "soft" -> 1
            "hard" -> 2
            "s-curve", "sigmoid" -> 3
            else -> if (pressureCurve.toFloatOrNull() != null) 4 else 0
        }
        EsenhoNativeBridge.nativeBrushSetPressureMap(
            preset.dynamicConfig.optInt("pressure_min", 0),
            preset.dynamicConfig.optInt("pressure_max", 100),
            curveType,
            pressureCurve.toFloatOrNull() ?: 1f
        )
        EsenhoNativeBridge.nativeDynBrushEnable(dynamic)
        if (!dynamic) return
        EsenhoNativeBridge.nativeDynBrushSetBase(0, preset.opacity.coerceIn(0, 100) * preset.flow.coerceIn(0, 100) / 10000f)
        settingKeys.forEachIndexed { index, name ->
            val value = when {
                preset.dynamicConfig.has("dyn_$name") -> preset.dynamicConfig.optDouble("dyn_$name", Double.NaN)
                preset.dynamicConfig.has("mypaint_$name") -> preset.dynamicConfig.optDouble("mypaint_$name", Double.NaN)
                else -> Double.NaN
            }
            if (!value.isNaN()) EsenhoNativeBridge.nativeDynBrushSetBase(index, if (index == 0) value.toFloat() * preset.opacity.coerceIn(0, 100) * preset.flow.coerceIn(0, 100) / 10000f else value.toFloat())
        }
        val curves = preset.dynamicConfig.optJSONObject("dyn_curves") ?: return
        val settingNames = settingKeys.withIndex().associate { it.value to it.index }
        val curveKeys = curves.keys()
        while (curveKeys.hasNext()) {
            val key = curveKeys.next()
            val setting = settingNames[key.removePrefix("dyn_")] ?: key.toIntOrNull() ?: continue
            val inputs = curves.optJSONObject(key) ?: continue
            val inputKeys = inputs.keys()
            while (inputKeys.hasNext()) {
                val inputKey = inputKeys.next()
                val input = inputKey.toIntOrNull() ?: continue
                val points = inputs.optJSONArray(inputKey) ?: continue
                if (points.length() !in 2..16) continue
                val xs = FloatArray(points.length())
                val ys = FloatArray(points.length())
                var valid = true
                for (i in 0 until points.length()) {
                    val point = points.optJSONArray(i)
                    if (point == null || point.length() < 2) { valid = false; break }
                    xs[i] = point.optDouble(0, 0.0).toFloat()
                    ys[i] = point.optDouble(1, 0.0).toFloat()
                }
                if (valid) EsenhoNativeBridge.nativeDynBrushSetCurve(setting, input, xs, ys)
            }
        }
    }

    fun setDynamicCurve(setting: Int, input: Int, points: List<Pair<Float, Float>>?) {
        val preset = selectedPreset ?: return
        if (setting !in DYNAMIC_SETTING_KEYS.indices || input !in 0..15) return
        val curves = preset.dynamicConfig.optJSONObject("dyn_curves") ?: JSONObject()
        val name = DYNAMIC_SETTING_KEYS[setting]
        val inputs = curves.optJSONObject(name) ?: JSONObject()
        if (points == null) {
            inputs.remove(input.toString())
            EsenhoNativeBridge.nativeDynBrushClearCurve(setting, input)
        } else if (points.size in 2..16) {
            val ordered = points.sortedBy { it.first }
            val xs = FloatArray(ordered.size) { ordered[it].first }
            val ys = FloatArray(ordered.size) { ordered[it].second }
            val serialized = JSONArray()
            ordered.forEach { serialized.put(JSONArray().put(it.first).put(it.second)) }
            inputs.put(input.toString(), serialized)
            EsenhoNativeBridge.nativeDynBrushSetCurve(setting, input, xs, ys)
        }
        if (inputs.length() == 0) curves.remove(name) else curves.put(name, inputs)
        if (curves.length() == 0) preset.dynamicConfig.remove("dyn_curves") else preset.dynamicConfig.put("dyn_curves", curves)
        if (preset.isCustom) storageManager.saveCustomPresets(presetCatalog.filter { it.isCustom })
    }

    fun dynamicBaseValue(setting: Int): Float {
        val preset = selectedPreset ?: return 0f
        val key = DYNAMIC_SETTING_KEYS.getOrNull(setting) ?: return 0f
        val default = when (setting) { 0 -> 1f; 3 -> ln((preset.size.coerceAtLeast(1) / 2f).coerceAtLeast(.1f)); 4 -> .8f; 6 -> 2f; 21, 38 -> 1f; else -> 0f }
        return preset.dynamicConfig.optDouble("dyn_$key", preset.dynamicConfig.optDouble("mypaint_$key", default.toDouble())).toFloat()
    }

    fun setDynamicBase(setting: Int, value: Float) {
        endCurveStroke()
        val preset = selectedPreset ?: return
        val key = DYNAMIC_SETTING_KEYS.getOrNull(setting) ?: return
        val limitedValue = if (setting == 3) value.coerceIn(ln(.5f), ln(50f)) else value
        if (setting == 3) brushSize = (2f * exp(limitedValue)).coerceIn(1f, 100f)
        preset.dynamicConfig.put("dyn_$key", limitedValue)
        val wasDynamic = preset.engine.equals("dynamic", true) || preset.engine.equals("mypaint", true) || preset.dynamicConfig.optBoolean("dyn_continuous", false)
        if (!wasDynamic) {
            preset.engine = "dynamic"
            syncDynamicBrush(preset)
        } else {
            EsenhoNativeBridge.nativeDynBrushSetBase(setting, if (setting == 0) limitedValue * preset.opacity.coerceIn(0, 100) * preset.flow.coerceIn(0, 100) / 10000f else limitedValue)
        }
        if (preset.isCustom) storageManager.saveCustomPresets(presetCatalog.filter { it.isCustom })
    }

    fun setPressureResponse(curve: String, min: Int, max: Int) {
        endCurveStroke()
        val preset = selectedPreset ?: return
        val lower = min.coerceIn(0, 99)
        preset.dynamicConfig.put("pressure_curve", curve)
        preset.dynamicConfig.put("pressure_min", lower)
        preset.dynamicConfig.put("pressure_max", max.coerceIn(lower + 1, 100))
        syncDynamicBrush(preset)
        if (preset.isCustom) storageManager.saveCustomPresets(presetCatalog.filter { it.isCustom })
    }

    fun setPresetParam(paramId: Int, value: Int) {
        endCurveStroke()
        val p = selectedPreset
        realismParameters.firstOrNull { it.id == paramId }?.let { param ->
            if (selectedBrush != null) return
            val limited = value.coerceIn(param.min, param.max)
            p?.realismConfig?.put(param.key, limited)
            liveBrushSliderParams[paramId] = limited
            EsenhoNativeBridge.nativeBrushSetParam(paramId, limited)
            return
        }
        liveBrushSliderParams[paramId] = value
        if (p == null) {
            when (paramId) {
                1 -> brushSize = value.toFloat()
                2 -> brushOpacity = value / 100f
                19 -> brushSmooth = value
                5 -> {
                    val spacing = value.coerceIn(2, 100)
                    liveBrushSliderParams[5] = spacing
                    EsenhoNativeBridge.nativeBrushSetProceduralSpacing(spacing / 100f)
                }
            }
            EsenhoNativeBridge.nativeBrushSetParam(paramId, value)
            return
        }
        when (paramId) {
            1 -> brushSize = value.toFloat()
            2 -> { p.opacity = value; brushOpacity = value / 100f }
            3 -> { p.hardness = value; brushHardness = value }
            4 -> { p.flow = value.coerceIn(0, 100); syncDynamicCoverage(p) }
            5 -> {
                p.spacing = value.coerceIn(1, 100)
                if (isDynamicPreset(p)) {
                    // Replace density sources together so spacing has one predictable meaning.
                    setDynamicBase(5, 0f)
                    setDynamicBase(6, 50f / p.spacing)
                    setDynamicBase(7, 0f)
                }
            }
            9 -> p.tolerance = value.coerceIn(0, 255)
            6 -> p.angle = value
            7 -> p.roundness = value
            8 -> p.scatter = value
            10 -> p.smudge = value
            11 -> p.wetness = value
            12 -> p.grain = value
            13 -> p.texMode = value
            14 -> p.shapeId = value
            15 -> p.mode = value
            16 -> p.texAngle = value
            17 -> p.textureScale = value
            19 -> { p.smoothing = value; brushSmooth = value }
            20 -> p.midpoint = value
            21 -> p.textureContrast = value
            22 -> p.autoRotate = value
            23 -> p.velocity = value
            24 -> p.taperIn = value
            25 -> p.taperOut = value
            26 -> p.fade = value
            27 -> p.sizeJitter = value
            28 -> p.angleJitter = value
            29 -> p.opacityJitter = value
            30 -> p.colorJitter = value
            31 -> p.dabBlend = value
            32 -> p.subpixel = value
            33 -> p.depletion = value
            34 -> p.colorPickup = value
            39 -> p.pressureSize = value
            40 -> p.pressureFlow = value
            41 -> p.tiltAngle = value
            42 -> p.buildup = value
            50 -> p.water = value
            51 -> p.bleed = value
            52 -> p.granulation = value
            53 -> p.fringe = value
            54 -> p.pigmentMode = value
            55 -> p.impasto = value
            56 -> p.dryingRate = value
            57 -> p.texScaleWithSize = value
        }
        EsenhoNativeBridge.nativeBrushSetParam(paramId, value)
    }

    fun getPresetParam(paramId: Int): Int {
        realismParameters.firstOrNull { it.id == paramId }?.let { param ->
            return selectedPreset?.realismConfig?.optInt(param.key, param.default)
                ?: liveBrushSliderParams[paramId] ?: param.default
        }
        val p = selectedPreset ?: return when (paramId) {
            1 -> brushSize.toInt()
            2 -> (brushOpacity * 100).roundToInt()
            19 -> brushSmooth
            else -> liveBrushSliderParams[paramId] ?: 0
        }
        return when (paramId) {
            1 -> p.size
            2 -> p.opacity
            3 -> p.hardness
            4 -> p.flow
            5 -> p.spacing
            9 -> p.tolerance
            6 -> p.angle
            7 -> p.roundness
            8 -> p.scatter
            10 -> p.smudge
            11 -> p.wetness
            12 -> p.grain
            13 -> p.texMode
            14 -> p.shapeId
            15 -> p.mode
            16 -> p.texAngle
            17 -> p.textureScale
            19 -> p.smoothing
            20 -> p.midpoint
            21 -> p.textureContrast
            22 -> p.autoRotate
            23 -> p.velocity
            24 -> p.taperIn
            25 -> p.taperOut
            26 -> p.fade
            27 -> p.sizeJitter
            28 -> p.angleJitter
            29 -> p.opacityJitter
            30 -> p.colorJitter
            31 -> p.dabBlend
            32 -> p.subpixel
            33 -> p.depletion
            34 -> p.colorPickup
            39 -> p.pressureSize
            40 -> p.pressureFlow
            41 -> p.tiltAngle
            42 -> p.buildup
            50 -> p.water
            51 -> p.bleed
            52 -> p.granulation
            53 -> p.fringe
            54 -> p.pigmentMode
            55 -> p.impasto
            56 -> p.dryingRate
            57 -> p.texScaleWithSize
            else -> 0
        }
    }

    fun setPresetShape(shapeName: String) {
        endCurveStroke()
        val p = selectedPreset ?: return
        p.shape = shapeName
        p.customShapeAsset = ""
        val slot = EsenhoNativeBridge.nativeSelectShape(shapeName)
        p.shapeId = slot
        EsenhoNativeBridge.nativeBrushSetParam(14, slot)
    }

    fun setPresetTexture(textureName: String) {
        endCurveStroke()
        val p = selectedPreset ?: return
        p.texture = textureName
        p.customTextureAsset = ""
        if (textureName.isNotBlank() && textureName != "none") {
            val slot = EsenhoNativeBridge.nativeSelectTexture(textureName)
            if (slot >= 0) {
                EsenhoNativeBridge.nativeBrushSetParam(18, slot)
                p.texMode = 1
                EsenhoNativeBridge.nativeBrushSetParam(13, 1)
            }
        } else {
            EsenhoNativeBridge.nativeSelectTexture("none")
            EsenhoNativeBridge.nativeBrushSetParam(18, -1)
            p.texMode = 0
            EsenhoNativeBridge.nativeBrushSetParam(13, 0)
        }
    }

    private fun proceduralToolState(brush: BrushModel): JSONObject {
        val params = org.json.JSONArray()
        brush.params.forEach { params.put(it.currentVal) }
        val liveParams = JSONObject()
        listOf(1, 2, 4, 5, 19, 20).forEach { liveParams.put(it.toString(), getPresetParam(it)) }
        return JSONObject().put("kind", "brush")
            .put("curve_bindings", JSONArray().also { arr -> brushCurves.bindings.forEach { arr.put(it.toJson()) } })
            .put("size", brushSize).put("opacity", brushOpacity)
            .put("liveParams", liveParams).put("params", params)
    }

    private fun rememberProceduralToolState() {
        selectedBrush?.let { proceduralToolStates[it.id] = proceduralToolState(it) }
    }

    fun selectBrush(brush: BrushModel?) {
        endCurveStroke()
        rememberProceduralToolState()
        val saved = brush?.let { proceduralToolStates[it.id]
            ?: storageManager.loadFavoriteToolState("brush:${it.id}")?.takeIf { state -> state.optString("kind") == "brush" } }
        val values = saved?.optJSONArray("params")
        val selected = brush?.let { source ->
            source.copy(params = source.params.mapIndexed { index, param ->
                param.copy(currentVal = values?.optInt(index, param.defaultVal) ?: param.defaultVal)
            })
        }
        selectedPreset = null
        selectedBrush = selected
        EsenhoNativeBridge.nativeDynBrushEnable(false)
        EsenhoNativeBridge.nativeBrushSetPressureMap(0, 100, 0, 1f)
        EsenhoNativeBridge.nativeBrushReset()
        EsenhoNativeBridge.nativeSelectBrush(selected?.id ?: "classic")
        // Only host controls are shared with procedural kernels; classic tip/material
        // settings must never overwrite the kernel's own parameters.
        brushSize = saved?.optDouble("size", brushSize.toDouble())?.toFloat() ?: brushSize
        brushOpacity = saved?.optDouble("opacity", brushOpacity.toDouble())?.toFloat() ?: brushOpacity
        val common = saved?.optJSONObject("liveParams")
        setPresetParam(4, common?.optInt("4", 100) ?: 100)
        setPresetParam(19, common?.optInt("19", brushSmooth) ?: brushSmooth)
        setPresetParam(20, common?.optInt("20", 50) ?: 50)
        if (selected == null) {
            EsenhoNativeBridge.nativeBrushSetProceduralSpacing(-1f)
        } else {
            setPresetParam(5, common?.optInt("5", (selected.spacing * 100).roundToInt())
                ?: (selected.spacing * 100).roundToInt())
            selected.params.forEachIndexed { idx, param ->
                EsenhoNativeBridge.nativeSetBrushParam(idx, param.currentVal)
            }
        }
        brushCurves.activate(selected?.let { "brush:${it.id}" } ?: "classic",
            if (saved?.has("curve_bindings") == true) readBrushParameterCurves(saved.optJSONArray("curve_bindings")) else selected?.curveBindings.orEmpty())
        currentTool = ToolMode.BRUSH
    }

    fun snapshotSelectedFavoriteTool(): Pair<String, JSONObject>? {
        selectedPreset?.let { preset ->
            val id = "preset:${preset.id}"
            if (id in storageManager.loadFavoriteBrushes()) {
                return id to JSONObject().put("kind", "preset").put("preset", preset.toJson().put("curve_bindings",
                    JSONArray().also { arr -> brushCurves.bindings.forEach { arr.put(it.toJson()) } }))
            }
        }
        selectedBrush?.let { brush ->
            val id = "brush:${brush.id}"
            if (id in storageManager.loadFavoriteBrushes()) {
                return id to proceduralToolState(brush)
            }
        }
        return null
    }

    fun resetPresetToDefaults() {
        val p = selectedPreset ?: return
        endCurveStroke()
        if (!brushCurves.resetActiveBindings()) return
        loadCatalogs()
        val original = presetCatalog.find { it.id == p.id } ?: return
        selectPreset(original, restoreFavoriteState = false)
    }

    // ── Custom Presets CRUD & Persistence ──

    fun saveCurrentPresetAsCustom(name: String, category: String = "Personalizado"): BrushPresetModel {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) {
            throw IllegalArgumentException("O nome do preset não pode ser vazio")
        }

        val base = selectedPreset
        val existing = presetCatalog.find { it.isCustom && it.name.equals(trimmed, ignoreCase = true) }
        val presetId = existing?.id ?: "custom_${System.currentTimeMillis()}"

        val newPreset = BrushPresetModel(
            id = presetId,
            name = trimmed,
            desc = base?.desc ?: "Preset personalizado",
            category = category,
            isCustom = true,
            shape = base?.shape ?: "circle",
            shapeId = base?.shapeId ?: 0,
            customShapeAsset = base?.customShapeAsset ?: "",
            customTextureAsset = base?.customTextureAsset ?: "",
            size = brushSize.toInt(),
            opacity = (brushOpacity * 100).toInt(),
            hardness = brushHardness,
            flow = base?.flow ?: 100,
            spacing = base?.spacing ?: 5,
            tolerance = base?.tolerance ?: 32,
            roundness = base?.roundness ?: 100,
            angle = base?.angle ?: 0,
            smoothing = brushSmooth,
            midpoint = base?.midpoint ?: 50,
            scatter = base?.scatter ?: 0,
            grain = base?.grain ?: 0,
            texMode = base?.texMode ?: 0,
            texture = base?.texture ?: "",
            textureScale = base?.textureScale ?: 100,
            textureContrast = base?.textureContrast ?: 100,
            texScaleWithSize = base?.texScaleWithSize ?: 0,
            texAngle = base?.texAngle ?: 0,
            autoRotate = base?.autoRotate ?: 0,
            velocity = base?.velocity ?: 0,
            taperIn = base?.taperIn ?: 0,
            taperOut = base?.taperOut ?: 0,
            fade = base?.fade ?: 0,
            sizeJitter = base?.sizeJitter ?: 0,
            angleJitter = base?.angleJitter ?: 0,
            opacityJitter = base?.opacityJitter ?: 0,
            colorJitter = base?.colorJitter ?: 0,
            dabBlend = base?.dabBlend ?: 0,
            subpixel = base?.subpixel ?: 1,
            smudge = base?.smudge ?: 0,
            wetness = base?.wetness ?: 0,
            depletion = base?.depletion ?: 0,
            colorPickup = base?.colorPickup ?: 0,
            pressureSize = base?.pressureSize ?: 1,
            pressureFlow = base?.pressureFlow ?: 1,
            tiltAngle = base?.tiltAngle ?: 0,
            buildup = base?.buildup ?: 0,
            water = base?.water ?: 0,
            bleed = base?.bleed ?: 0,
            granulation = base?.granulation ?: 0,
            fringe = base?.fringe ?: 0,
            pigmentMode = base?.pigmentMode ?: 0,
            impasto = base?.impasto ?: 0,
            dryingRate = base?.dryingRate ?: 0,
            mode = base?.mode ?: 0,
            eraser = if (currentTool == ToolMode.ERASER) 1 else (base?.eraser ?: 0),
            color = String.format("#%06X", 0xFFFFFF and currentColor),
            engine = base?.engine ?: "classic",
            dynamicConfig = JSONObject(base?.dynamicConfig?.toString() ?: "{}"),
            realismConfig = JSONObject(base?.realismConfig?.toString() ?: "{}"),
            curveBindings = brushCurves.bindings.toList()
        )

        if (existing != null) {
            val idx = presetCatalog.indexOf(existing)
            presetCatalog[idx] = newPreset
        } else {
            presetCatalog.add(newPreset)
        }

        selectPreset(newPreset)
        storageManager.saveCustomPresets(presetCatalog.filter { it.isCustom })
        storageManager.saveSessionState(newPreset.id, activePaletteId, currentColor)
        return newPreset
    }

    private fun createCustomAssetPreset(name: String, bitmap: Bitmap, grainTexture: Boolean): Boolean {
        val normalizedName = name.trim().take(40)
        if (normalizedName.isEmpty() || bitmap.isRecycled || bitmap.width > 2048 || bitmap.height > 2048 ||
            bitmap.width.toLong() * bitmap.height > 4_194_304L) return false
        val presetName = "${selectedPreset?.name ?: "Pincel"} · $normalizedName"
        val preset = try {
            saveCurrentPresetAsCustom(presetName)
        } catch (_: Exception) {
            return false
        }
        val assetId = "${preset.id}_${if (grainTexture) "grain" else "shape"}"
        if (!storageManager.saveCustomBrushAsset(assetId, bitmap)) {
            deleteCustomPreset(preset.id)
            return false
        }
        if (grainTexture) {
            preset.customTextureAsset = assetId
            preset.texture = "custom"
            preset.texMode = 1
        } else {
            preset.customShapeAsset = assetId
            preset.shape = "custom"
            preset.shapeId = -1
        }
        customBrushAssetSlots.remove(assetId)
        selectPreset(preset)
        if ((grainTexture && assetId !in customBrushAssetSlots) || (!grainTexture && preset.shapeId < 0)) {
            deleteCustomPreset(preset.id)
            storageManager.deleteCustomBrushAsset(assetId)
            return false
        }
        storageManager.saveCustomPresets(presetCatalog.filter { it.isCustom })
        return true
    }

    fun createGrainTextureFromSelection(name: String): Boolean {
        if (!copySelectionToClipboard()) return false
        val selectionBitmap = selectionClipboard ?: return false
        return createCustomAssetPreset(name, selectionBitmap, grainTexture = true)
    }

    fun createBrushTipFromSelection(name: String): Boolean {
        if (!copySelectionToClipboard()) return false
        val selectionBitmap = selectionClipboard ?: return false
        return createCustomAssetPreset(name, selectionBitmap, grainTexture = false)
    }

    private fun captureActiveLayerForBrushAsset(): Bitmap? {
        if (width <= 0 || height <= 0) return null
        val bitmap = runCatching { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) }.getOrNull() ?: return null
        if (!EsenhoNativeBridge.nativeLayerGetBitmap(activeLayerIndex, bitmap)) {
            bitmap.recycle()
            return null
        }
        return bitmap
    }

    fun createBrushTipFromActiveLayer(name: String): Boolean {
        val bitmap = captureActiveLayerForBrushAsset() ?: return false
        return try { createCustomAssetPreset(name, bitmap, grainTexture = false) } finally { bitmap.recycle() }
    }

    fun createGrainTextureFromActiveLayer(name: String): Boolean {
        val bitmap = captureActiveLayerForBrushAsset() ?: return false
        return try { createCustomAssetPreset(name, bitmap, grainTexture = true) } finally { bitmap.recycle() }
    }

    fun deleteCustomPreset(presetId: String): Boolean {
        val p = presetCatalog.find { it.id == presetId } ?: return false
        if (!p.isCustom) return false

        presetCatalog.remove(p)
        if (p.customShapeAsset.isNotBlank() && presetCatalog.none { it.customShapeAsset == p.customShapeAsset }) {
            customBrushAssetSlots.remove(p.customShapeAsset)
            storageManager.deleteCustomBrushAsset(p.customShapeAsset)
        }
        if (p.customTextureAsset.isNotBlank() && presetCatalog.none { it.customTextureAsset == p.customTextureAsset }) {
            customBrushAssetSlots.remove(p.customTextureAsset)
            storageManager.deleteCustomBrushAsset(p.customTextureAsset)
        }
        storageManager.saveCustomPresets(presetCatalog.filter { it.isCustom })

        if (selectedPreset?.id == presetId) {
            val fallback = presetCatalog.find { it.id == "pencil_hb" } ?: presetCatalog.firstOrNull()
            if (fallback != null) {
                selectPreset(fallback)
            }
        }
        return true
    }

    // ── Custom Palettes CRUD & Persistence ──

    fun parseColorHex(hex: String): Int {
        val clean = hex.trim()
        if (!clean.matches(Regex("^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$"))) {
            throw IllegalArgumentException("Formato de cor hexadecimal inválido: $hex")
        }
        val formatted = if (clean.startsWith("#")) clean else "#$clean"
        return Color.parseColor(formatted)
    }

    fun createCustomPalette(name: String): ColorPaletteModel {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) {
            throw IllegalArgumentException("O nome da paleta não pode ser vazio")
        }

        val id = "custom_pal_${System.currentTimeMillis()}"
        val newPal = ColorPaletteModel(
            id = id,
            name = trimmed,
            colors = mutableListOf(),
            isBuiltIn = false
        )
        palettes.add(newPal)
        activePaletteId = id
        storageManager.savePalettes(palettes)
        storageManager.saveSessionState(selectedPreset?.id, activePaletteId, currentColor)
        return newPal
    }

    fun deletePalette(paletteId: String): Boolean {
        val pal = palettes.find { it.id == paletteId } ?: return false
        if (pal.isBuiltIn) {
            throw IllegalArgumentException("Paletas padrão não podem ser excluídas")
        }
        palettes.remove(pal)
        if (activePaletteId == paletteId) {
            activePaletteId = palettes.firstOrNull()?.id ?: "classic"
        }
        storageManager.savePalettes(palettes)
        storageManager.saveSessionState(selectedPreset?.id, activePaletteId, currentColor)
        return true
    }

    fun deletePalette(index: Int): Boolean {
        if (index !in palettes.indices) return false
        val pal = palettes[index]
        if (pal.isBuiltIn) {
            throw IllegalArgumentException("Paletas padrão não podem ser excluídas")
        }
        return deletePalette(pal.id)
    }

    fun addColorToActivePalette(color: Int): Boolean {
        return addColorToPalette(activePaletteId, color)
    }

    fun addColorToActivePalette(hex: String): Boolean {
        val colorInt = parseColorHex(hex)
        return addColorToActivePalette(colorInt)
    }

    fun addColorToPalette(paletteId: String, color: Int): Boolean {
        val pal = palettes.find { it.id == paletteId } ?: return false
        if (pal.isBuiltIn) return false
        pal.colors.add(color)
        storageManager.savePalettes(palettes)
        return true
    }

    fun addColorToPalette(paletteId: String, hex: String): Boolean {
        val colorInt = parseColorHex(hex)
        return addColorToPalette(paletteId, colorInt)
    }

    fun removeColorFromActivePalette(index: Int): Boolean {
        return removeColorFromPalette(activePaletteId, index)
    }

    fun removeColorFromPalette(paletteId: String, index: Int): Boolean {
        val pal = palettes.find { it.id == paletteId } ?: return false
        if (pal.isBuiltIn) return false
        if (index in pal.colors.indices) {
            pal.colors.removeAt(index)
            storageManager.savePalettes(palettes)
            return true
        }
        return false
    }

    fun setBrushCustomParam(paramIdx: Int, value: Int) {
        endCurveStroke()
        val b = selectedBrush ?: return
        if (paramIdx in b.params.indices) {
            val param = b.params[paramIdx]
            param.currentVal = value.coerceIn(param.min, param.max)
            EsenhoNativeBridge.nativeSetBrushParam(paramIdx, param.currentVal)
        }
    }

    // ── Filter Application ──

    fun applyFilter(filter: FilterModel, p1: Int = 0, p2: Int = 0): Boolean {
        if (transformState != null) cancelTransform()
        pushUndoSnapshot()
        val ok = EsenhoNativeBridge.nativeApplyFilter(filter.id, p1, p2)
        if (ok) {
            captureCurrentFrame()
            getRenderBitmap()
        }
        return ok
    }

    /** Apply web-compatible relative HSV adjustments to the active raster cel. */
    fun adjustActiveLayerHsv(hue: Int, saturationPercent: Int, valuePercent: Int) {
        if (transformState != null) cancelTransform()
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerAdjustHsv(activeLayerIndex, hue, saturationPercent, valuePercent)
        captureCurrentFrame()
        getRenderBitmap()
    }

    // ── Layer Operations ──

    fun syncLayers(blankLayerId: Int? = null) {
        layers.clear()
        val count = EsenhoNativeBridge.nativeLayerGetCount()
        activeLayerIndex = EsenhoNativeBridge.nativeLayerGetActive()

        for (pos in 0 until count) {
            val layerIdx = EsenhoNativeBridge.nativeLayerGetOrder(pos)
            val opacity = layerBaseOpacities.getOrPut(layerIdx) { EsenhoNativeBridge.nativeLayerGetOpacity(layerIdx) }.coerceIn(0, 255)
            val visible = layerBaseVisibility.getOrPut(layerIdx) { EsenhoNativeBridge.nativeLayerGetVisible(layerIdx) == 1 }
            val blendModeInt = EsenhoNativeBridge.nativeLayerGetBlendMode(layerIdx)
            val blendMode = LayerBlendMode.values().find { it.id == blendModeInt } ?: LayerBlendMode.NORMAL
            val alphaLock = EsenhoNativeBridge.nativeLayerGetAlphaLock(layerIdx) == 1
            val clipping = EsenhoNativeBridge.nativeLayerGetClipping(layerIdx) == 1

            val defaultName = if (layerIdx <= 3) "Plano de Fundo" else "Camada ${layerIdx - 3}"
            val name = layerNames.getOrPut(layerIdx) { defaultName }
            layers.add(LayerModel(layerIdx, name, opacity, visible, blendMode, alphaLock, clipping))
        }
        layerNames.keys.retainAll(layers.map { it.id }.toSet())
        layerBaseOpacities.keys.retainAll(layers.map { it.id }.toSet())
        layerBaseVisibility.keys.retainAll(layers.map { it.id }.toSet())
        val validLayerIds = layers.map { it.id }.toSet()
        rasterLayerGroups.values.forEach { group -> group.layerIds.retainAll(validLayerIds) }
        rasterGroupOrder.retainAll(rasterLayerGroups.keys)
        rasterLayerGroups.values.forEach { group -> group.childGroupIds.retainAll(rasterLayerGroups.keys) }
        syncAnimationTracks(blankLayerId)
    }

    private data class GroupState(val groups: List<RasterLayerGroup>, val order: List<String>, val layers: List<Int>)
    private data class GroupEdit(val before: GroupState, val after: GroupState, val serial: Long)
    private fun groupState() = GroupState(rasterLayerGroups.values.map { it.copy(layerIds=it.layerIds.toMutableList(),childGroupIds=it.childGroupIds.toMutableList()) },rasterGroupOrder.toList(),layers.map { it.id })

    /** One user group operation, including membership/order/visibility metadata. */
    fun <T> editRasterGroups(action: () -> T): T {
        val before = groupState()
        val token = pushUndoSnapshot()
        val result = try { action() } catch (failure: Throwable) {
            if(token != 0L) EsenhoNativeBridge.nativeCancelStroke()
            applyGroupState(before)
            throw failure
        }
        val after = groupState()
        if(token != 0L) groupEdits[token] = GroupEdit(before,after,undoSnapshotSerial)
        return result
    }

    private fun restoreGroupEdit(token: Long, redo: Boolean): Boolean {
        val edit = groupEdits[token] ?: return false
        val state = if(redo) edit.after else edit.before
        applyGroupState(state)
        return true
    }

    private fun applyGroupState(state: GroupState) {
        rasterLayerGroups.clear()
        state.groups.forEach { rasterLayerGroups[it.id] = it.copy(layerIds=it.layerIds.toMutableList(),childGroupIds=it.childGroupIds.toMutableList()) }
        rasterGroupOrder.clear(); rasterGroupOrder.addAll(state.order)
        syncLayers()
        for ((position,id) in state.layers.withIndex()) {
            var current = (0 until EsenhoNativeBridge.nativeLayerGetCount()).firstOrNull { EsenhoNativeBridge.nativeLayerGetOrder(it) == id } ?: -1
            while(current > position) { EsenhoNativeBridge.nativeLayerMoveDown(id); current-- }
            while(current in 0 until position) { EsenhoNativeBridge.nativeLayerMoveUp(id); current++ }
        }
        syncLayers()
        applyAnimationTick(currentAnimationTick,captureActive=false)
    }

    fun createRasterLayerGroup(name: String? = null): RasterLayerGroup {
        while ("raster_group_$nextRasterGroupId" in rasterLayerGroups) nextRasterGroupId++
        val id = "raster_group_${nextRasterGroupId++}"
        return RasterLayerGroup(id, name?.trim()?.takeIf { it.isNotEmpty() } ?: "Grupo ${rasterLayerGroups.size + 1}")
            .also { rasterLayerGroups[id] = it; rasterGroupOrder.add(0, id) }
    }

    fun renameRasterLayerGroup(id: String, name: String) {
        val normalized = name.trim()
        if (normalized.isNotEmpty()) rasterLayerGroups[id]?.name = normalized
    }

    fun moveRasterLayerGroup(id: String, delta: Int) {
        val group = rasterLayerGroups[id] ?: return
        val order = group.parentId?.let { rasterLayerGroups[it]?.childGroupIds } ?: rasterGroupOrder
        val from = order.indexOf(id)
        if (from < 0) return
        val to = (from + delta).coerceIn(0,order.lastIndex)
        if (from != to) { order.removeAt(from); order.add(to,id); syncNativeLayerOrderFromRasterGroups() }
    }

    fun moveLayerToRasterGroup(layerId: Int, groupId: String?) {
        rasterLayerGroups.values.forEach { it.layerIds.remove(layerId) }
        if (groupId != null) rasterLayerGroups[groupId]?.let { group ->
            if (layerId in layers.map { it.id }) group.layerIds.add(layerId)
        }
        val celVisible = animationTracks[layerId]?.let { track -> track.frames.getOrNull(track.activeCelIndex)?.visible ?: false } ?: true
        val layerVisible = layerBaseVisibility[layerId] ?: true
        EsenhoNativeBridge.nativeLayerSetVisible(
            layerId,
            if (layerVisible && isRasterLayerGroupVisible(layerId) && celVisible) 1 else 0
        )
        syncNativeLayerOrderFromRasterGroups()
    }

    fun nestRasterLayerGroup(groupId: String, parentId: String?) {
        val group = rasterLayerGroups[groupId] ?: return
        if (groupId == parentId || (parentId != null && isRasterGroupDescendant(groupId, parentId))) return
        rasterLayerGroups.values.forEach { it.childGroupIds.remove(groupId) }
        rasterGroupOrder.remove(groupId)
        group.parentId = parentId
        if (parentId == null) rasterGroupOrder.add(0, groupId)
        else rasterLayerGroups[parentId]?.childGroupIds?.add(0, groupId) ?: run {
            group.parentId = null
            rasterGroupOrder.add(0, groupId)
        }
        applyRasterGroupVisibility(groupId)
        syncNativeLayerOrderFromRasterGroups()
    }

    private fun isRasterGroupDescendant(groupId: String, possibleDescendantId: String): Boolean {
        val group = rasterLayerGroups[groupId] ?: return false
        return possibleDescendantId in group.childGroupIds || group.childGroupIds.any { isRasterGroupDescendant(it, possibleDescendantId) }
    }

    fun rasterGroupLayerIds(groupId: String): List<Int> {
        val group = rasterLayerGroups[groupId] ?: return emptyList()
        return group.layerIds.toList() + group.childGroupIds.flatMap(::rasterGroupLayerIds)
    }

    private fun isRasterGroupEffectivelyVisible(groupId: String): Boolean {
        val group = rasterLayerGroups[groupId] ?: return true
        return group.visible && (group.parentId?.let(::isRasterGroupEffectivelyVisible) ?: true)
    }

    private fun isRasterLayerGroupVisible(layerId: Int): Boolean {
        val owner = rasterLayerGroups.values.firstOrNull { layerId in it.layerIds } ?: return true
        return isRasterGroupEffectivelyVisible(owner.id)
    }

    private fun applyRasterGroupVisibility(groupId: String) {
        rasterGroupLayerIds(groupId).forEach { layerId ->
            val celVisible = animationTracks[layerId]?.let { track -> track.frames.getOrNull(track.activeCelIndex)?.visible ?: false } ?: true
            val layerVisible = layerBaseVisibility[layerId] ?: true
            EsenhoNativeBridge.nativeLayerSetVisible(
                layerId,
                if (layerVisible && isRasterLayerGroupVisible(layerId) && celVisible) 1 else 0
            )
        }
        getRenderBitmap()
    }

    private fun syncNativeLayerOrderFromRasterGroups() {
        if (rasterLayerGroups.isEmpty() || layers.isEmpty()) return
        val orderedDrawingIds = mutableListOf<Int>()
        val visited = mutableSetOf<String>()
        fun appendGroup(id: String) {
            if (!visited.add(id)) return
            val group = rasterLayerGroups[id] ?: return
            group.layerIds.forEach { if (it >= 3 && it in layers.map(LayerModel::id)) orderedDrawingIds.add(it) }
            group.childGroupIds.forEach(::appendGroup)
        }
        rasterGroupOrder.forEach(::appendGroup)
        rasterLayerGroups.keys.forEach(::appendGroup)
        val orderedIds = layers.asSequence().map { it.id }.filter { it >= 3 && it !in orderedDrawingIds }.toList()
        val drawingOrder = (orderedDrawingIds + orderedIds).distinct()
        val drawingIterator = drawingOrder.iterator()
        val targetOrder = layers.map { layer -> if (layer.id >= 3) drawingIterator.next() else layer.id }
        for (targetPosition in targetOrder.indices) {
            val targetId = targetOrder[targetPosition]
            var currentPosition = (0 until EsenhoNativeBridge.nativeLayerGetCount())
                .firstOrNull { EsenhoNativeBridge.nativeLayerGetOrder(it) == targetId } ?: continue
            while (currentPosition > targetPosition) {
                EsenhoNativeBridge.nativeLayerMoveDown(targetId)
                currentPosition--
            }
            while (currentPosition < targetPosition) {
                EsenhoNativeBridge.nativeLayerMoveUp(targetId)
                currentPosition++
            }
        }
        syncLayers()
    }

    fun toggleRasterLayerGroupVisibility(id: String) {
        val group = rasterLayerGroups[id] ?: return
        group.visible = !group.visible
        applyRasterGroupVisibility(group.id)
    }

    fun deleteRasterLayerGroup(id: String) {
        val group = rasterLayerGroups.remove(id) ?: return
        val ungroupedLayers = group.layerIds.toList()
        if (group.parentId == null) rasterGroupOrder.remove(id)
        else rasterLayerGroups[group.parentId]?.childGroupIds?.remove(id)
        group.childGroupIds.forEach { childId -> nestRasterLayerGroup(childId, group.parentId) }
        group.layerIds.clear()
        ungroupedLayers.forEach { layerId ->
            val layerVisible = layerBaseVisibility[layerId] ?: true
            val celVisible = animationTracks[layerId]?.let { track -> track.frames.getOrNull(track.activeCelIndex)?.visible ?: false } ?: true
            EsenhoNativeBridge.nativeLayerSetVisible(layerId, if (layerVisible && celVisible) 1 else 0)
        }
        syncNativeLayerOrderFromRasterGroups()
        getRenderBitmap()
    }

    fun renameLayer(idx: Int, name: String) {
        val normalized = name.trim()
        if (normalized.isEmpty() || layers.none { it.id == idx }) return
        if (layerNames[idx] == normalized || layers.firstOrNull { it.id == idx }?.name == normalized) return
        val historyToken = beginRasterLayerEdit(idx)
        layerNames[idx] = normalized
        layers.firstOrNull { it.id == idx }?.name = normalized
        finishRasterLayerEdit(historyToken)
    }

    fun addLayer(): Int {
        if (transformState != null) cancelTransform()
        // Only the active cel can have uncaptured edits. Existing native layers
        // already represent the shared tick; creating an empty layer must not
        // copy every cel and replay the entire timeline.
        captureCurrentFrame()
        val previousActive = activeLayerIndex
        val previousTick = currentAnimationTick
        val groupsBefore = rasterGroupMembershipSnapshot()
        val token = pushUndoSnapshot()
        val idx = withNativeLayerUpdate {
            val added = EsenhoNativeBridge.nativeLayerAdd()
            if (added < 0) {
                if (token != 0L) EsenhoNativeBridge.nativeCancelStroke()
                EsenhoNativeBridge.nativeLayerSelect(previousActive)
                return@withNativeLayerUpdate added
            }
            syncLayers(blankLayerId = added)
            animationTracks[added]?.let { track ->
                // Exposures remain half-open: a new one-tick cel may not be
                // exposed at the existing global tick. Update only this layer.
                track.activeCelIndex = AnimationExposure.indexAt(
                    track.frames.map { it.duration }.toIntArray(), previousTick
                )
                if (track.activeCelIndex < 0) {
                    EsenhoNativeBridge.nativeLayerSetVisible(added, 0)
                }
            }
            if (token != 0L) recordLayerAddHistory(token, added, previousActive, previousTick, groupsBefore)
            added
        }
        if (idx >= 0) getRenderBitmap()
        return idx
    }

    fun duplicateLayer(idx: Int): Int {
        if (layers.none { it.id == idx }) return -1
        if (transformState != null) cancelTransform()
        captureAllCurrentFrames()
        val previousActive = activeLayerIndex
        val previousTick = currentAnimationTick
        val groupsBefore = rasterGroupMembershipSnapshot()
        val token = pushUndoSnapshot()
        val newIdx = EsenhoNativeBridge.nativeLayerDuplicate(idx)
        if (newIdx < 0) {
            if (token != 0L) EsenhoNativeBridge.nativeCancelStroke()
            EsenhoNativeBridge.nativeLayerSelect(previousActive)
            return newIdx
        }
        syncLayers()
        if (token != 0L) recordLayerAddHistory(token, newIdx, previousActive, previousTick, groupsBefore)
        applyAnimationTick(previousTick, captureActive = false)
        return newIdx
    }

    private fun rasterGroupMembershipSnapshot(): Map<String, List<Int>> =
        rasterLayerGroups.mapValues { (_, group) -> group.layerIds.toList() }

    private fun recordLayerAddHistory(
        token: Long,
        layerId: Int,
        activeBefore: Int,
        tickBefore: Int,
        groupsBefore: Map<String, List<Int>>
    ) {
        val track = animationTracks[layerId] ?: return
        if (track.frames.isEmpty()) return
        val width = EsenhoNativeBridge.nativeLayerGetWidth(layerId).takeIf { it > 0 }
            ?: track.frames[track.activeCelIndex.coerceIn(track.frames.indices)].bitmap.width
        val height = EsenhoNativeBridge.nativeLayerGetHeight(layerId).takeIf { it > 0 }
            ?: track.frames[track.activeCelIndex.coerceIn(track.frames.indices)].bitmap.height
        layerAddHistory[token] = LayerAddHistory(
            layerId = layerId,
            layerState = captureRasterLayerState(layerId),
            track = track,
            width = width,
            height = height,
            orderPosition = layers.indexOfFirst { it.id == layerId }.coerceAtLeast(0),
            activeLayerBefore = activeBefore,
            activeLayerAfter = layerId,
            tickBefore = tickBefore,
            tickAfter = currentAnimationTick,
            groupLayerIdsBefore = groupsBefore,
            groupLayerIdsAfter = rasterGroupMembershipSnapshot(),
            snapshotSerial = undoSnapshotSerial
        )
    }

    fun selectLayer(idx: Int) {
        if (transformState != null) cancelTransform()
        // Creation already selects and synchronizes the new layer. In
        // particular, scripting must not replay all tracks a second time.
        if (idx == activeLayerIndex) return
        val preservedTick = currentAnimationTick
        captureCurrentFrame()
        EsenhoNativeBridge.nativeLayerSelect(idx)
        activeLayerIndex = idx
        syncAnimationTracks()
        // Changing the active layer must not move the shared timeline. Resolve
        // the cel for every layer at the existing global tick instead.
        applyAnimationTick(preservedTick, captureActive = false)
    }

    fun deleteLayer(idx: Int) {
        if (layers.size <= 1) return
        if (layers.none { it.id == idx }) return
        if (transformState != null) cancelTransform()
        captureAllCurrentFrames()
        syncAnimationTracks()
        val track = animationTracks[idx] ?: return
        if (track.frames.isEmpty()) return
        val orderPosition = layers.indexOfFirst { it.id == idx }
        val layerState = captureRasterLayerState(idx)
        val groupLayerIdsBefore = rasterLayerGroups.mapValues { (_, group) -> group.layerIds.toList() }
        val previousActive = activeLayerIndex
        val previousTick = currentAnimationTick
        EsenhoNativeBridge.nativeLayerSelect(idx)
        val token = pushUndoSnapshot()
        if (token == 0L) {
            EsenhoNativeBridge.nativeLayerSelect(previousActive)
            return
        }
        val width = EsenhoNativeBridge.nativeLayerGetWidth(idx).takeIf { it > 0 }
            ?: track.frames[track.activeCelIndex.coerceIn(track.frames.indices)].bitmap.width
        val height = EsenhoNativeBridge.nativeLayerGetHeight(idx).takeIf { it > 0 }
            ?: track.frames[track.activeCelIndex.coerceIn(track.frames.indices)].bitmap.height
        val history = LayerDeleteHistory(
            layerId = idx,
            layerState = layerState,
            track = track,
            width = width,
            height = height,
            orderPosition = orderPosition,
            activeLayerBefore = previousActive,
            activeLayerAfter = previousActive,
            tickBefore = previousTick,
            tickAfter = previousTick,
            groupLayerIdsBefore = groupLayerIdsBefore,
            groupLayerIdsAfter = groupLayerIdsBefore,
            snapshotSerial = undoSnapshotSerial
        )
        layerDeleteHistory[token] = history
        animationTracks.remove(idx)
        EsenhoNativeBridge.nativeLayerDelete(idx)
        syncLayers()
        history.groupLayerIdsAfter = rasterLayerGroups.mapValues { (_, group) -> group.layerIds.toList() }
        val afterActive = previousActive.takeIf { layerId -> layers.any { it.id == layerId } }
            ?: activeLayerIndex
        EsenhoNativeBridge.nativeLayerSelect(afterActive)
        activeLayerIndex = afterActive
        history.activeLayerAfter = afterActive
        currentAnimationTick = previousTick.coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
        history.tickAfter = currentAnimationTick
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun setLayerOpacity(idx: Int, opacity: Int, commitUndo: Boolean = false) {
        val baseOpacity = opacity.coerceIn(0, 255)
        var pending = pendingLayerOpacityEdit
        if (pending != null && pending.first != idx) {
            finishRasterLayerEdit(pending.second)
            pending = null
        }
        if (pending == null) {
            pending = idx to beginRasterLayerEdit(idx)
            pendingLayerOpacityEdit = pending
        }
        layerBaseOpacities[idx] = baseOpacity
        val celOpacity = animationTracks[idx]?.frames?.getOrNull(animationTracks[idx]?.activeCelIndex ?: -1)?.opacity ?: 255
        EsenhoNativeBridge.nativeLayerSetOpacity(idx, baseOpacity * celOpacity / 255)
        finishRasterLayerEdit(pending.second, closeOpacityEdit = commitUndo)
        syncLayers()
        getRenderBitmap()
    }

    fun setLayerVisible(idx: Int, visible: Boolean) {
        if ((layerBaseVisibility[idx] ?: (EsenhoNativeBridge.nativeLayerGetVisible(idx) == 1)) == visible) return
        val historyToken = beginRasterLayerEdit(idx)
        layerBaseVisibility[idx] = visible
        val celVisible = animationTracks[idx]?.let { track -> track.frames.getOrNull(track.activeCelIndex)?.visible ?: false } ?: true
        EsenhoNativeBridge.nativeLayerSetVisible(
            idx,
            if (visible && isRasterLayerGroupVisible(idx) && celVisible) 1 else 0
        )
        finishRasterLayerEdit(historyToken)
        syncLayers()
    }

    fun setLayerBlendMode(idx: Int, mode: LayerBlendMode) {
        if (EsenhoNativeBridge.nativeLayerGetBlendMode(idx) == mode.id) return
        val historyToken = beginRasterLayerEdit(idx)
        EsenhoNativeBridge.nativeLayerSetBlendMode(idx, mode.id)
        finishRasterLayerEdit(historyToken)
        syncLayers()
    }

    fun setLayerAlphaLock(idx: Int, locked: Boolean) {
        if ((EsenhoNativeBridge.nativeLayerGetAlphaLock(idx) == 1) == locked) return
        val historyToken = beginRasterLayerEdit(idx)
        EsenhoNativeBridge.nativeLayerSetAlphaLock(idx, if (locked) 1 else 0)
        finishRasterLayerEdit(historyToken)
        syncLayers()
    }

    fun setLayerClipping(idx: Int, clipping: Boolean) {
        if ((EsenhoNativeBridge.nativeLayerGetClipping(idx) == 1) == clipping) return
        val historyToken = beginRasterLayerEdit(idx)
        EsenhoNativeBridge.nativeLayerSetClipping(idx, if (clipping) 1 else 0)
        finishRasterLayerEdit(historyToken)
        syncLayers()
    }

    fun moveLayerUp(idx: Int) {
        moveLayerByOrderDelta(idx, -1)
    }

    fun moveLayerDown(idx: Int) {
        moveLayerByOrderDelta(idx, 1)
    }

    fun beginLayerOrderChange(): Long {
        val before = layers.map { it.id }
        val token = pushUndoSnapshot()
        if (token != 0L) {
            layerOrderHistory[token] = LayerOrderHistory(before, before, undoSnapshotSerial)
        }
        return token
    }

    fun moveLayerByOrderDelta(
        idx: Int,
        delta: Int,
        captureUndo: Boolean = true,
        orderHistoryToken: Long = 0L
    ) {
        if (delta == 0) return
        val token = if (captureUndo) beginLayerOrderChange() else orderHistoryToken
        var moved = false
        if (delta < 0) {
            for (step in 0 until -delta) {
                if (EsenhoNativeBridge.nativeLayerMoveUp(idx) != 1) break
                moved = true
            }
        } else {
            for (step in 0 until delta) {
                if (EsenhoNativeBridge.nativeLayerMoveDown(idx) != 1) break
                moved = true
            }
        }
        if (moved) {
            syncLayers()
            val positions = layers.mapIndexed { index, layer -> layer.id to index }.toMap()
            rasterLayerGroups.values.forEach { group -> group.layerIds.sortBy { positions[it] ?: Int.MAX_VALUE } }
            if (rasterLayerGroups.isNotEmpty()) syncNativeLayerOrderFromRasterGroups()
            if (token != 0L) layerOrderHistory[token]?.after = layers.map { it.id }
        } else if (captureUndo && token != 0L) {
            layerOrderHistory.remove(token)
        }
    }

    private fun captureRasterLayerState(idx: Int): RasterLayerState {
        val model = layers.firstOrNull { it.id == idx }
        return RasterLayerState(
            name = layerNames[idx] ?: model?.name.orEmpty(),
            opacity = layerBaseOpacities[idx] ?: model?.opacity ?: EsenhoNativeBridge.nativeLayerGetOpacity(idx),
            visible = layerBaseVisibility[idx] ?: model?.visible ?: (EsenhoNativeBridge.nativeLayerGetVisible(idx) == 1),
            blendMode = EsenhoNativeBridge.nativeLayerGetBlendMode(idx),
            alphaLock = EsenhoNativeBridge.nativeLayerGetAlphaLock(idx) == 1,
            clipping = EsenhoNativeBridge.nativeLayerGetClipping(idx) == 1
        )
    }

    private fun beginRasterLayerEdit(idx: Int): Long {
        val before = captureRasterLayerState(idx)
        val token = pushUndoSnapshot()
        if (token != 0L) {
            rasterLayerHistory[token] = RasterLayerHistory(idx, before, before, undoSnapshotSerial)
        }
        return token
    }

    private fun finishRasterLayerEdit(token: Long, closeOpacityEdit: Boolean = true) {
        if (token != 0L) {
            rasterLayerHistory[token]?.let { it.after = captureRasterLayerState(it.layerId) }
        }
        if (closeOpacityEdit && pendingLayerOpacityEdit?.second == token) pendingLayerOpacityEdit = null
    }

    fun mergeDown(idx: Int) {
        if (layers.none { it.id == idx }) return
        if (transformState != null) cancelTransform()
        captureAllCurrentFrames()
        syncAnimationTracks()

        val sourcePosition = layers.indexOfFirst { it.id == idx }
        if (sourcePosition <= 0) return
        val destinationId = layers[sourcePosition - 1].id
        val sourceTrack = animationTracks[idx] ?: return
        val destinationTrack = animationTracks[destinationId] ?: return
        if (sourceTrack.frames.isEmpty() || destinationTrack.frames.isEmpty()) return

        val sourceState = captureRasterLayerState(idx)
        val beforeGroups = rasterLayerGroups.mapValues { (_, group) -> group.layerIds.toList() }
        val mergedFrames = buildMergedTrackFrames(destinationTrack, sourceTrack, sourceState.opacity)
            ?: return
        val previousActive = activeLayerIndex
        val previousTick = currentAnimationTick

        EsenhoNativeBridge.nativeLayerSelect(idx)
        val token = pushUndoSnapshot()
        if (token == 0L) {
            mergedFrames.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
            EsenhoNativeBridge.nativeLayerSelect(previousActive)
            return
        }
        val sourceWidth = EsenhoNativeBridge.nativeLayerGetWidth(idx).takeIf { it > 0 }
            ?: sourceTrack.frames[sourceTrack.activeCelIndex.coerceIn(sourceTrack.frames.indices)].bitmap.width
        val sourceHeight = EsenhoNativeBridge.nativeLayerGetHeight(idx).takeIf { it > 0 }
            ?: sourceTrack.frames[sourceTrack.activeCelIndex.coerceIn(sourceTrack.frames.indices)].bitmap.height
        val history = LayerMergeHistory(
            sourceLayerId = idx,
            destinationLayerId = destinationId,
            sourceLayerState = sourceState,
            sourceTrack = sourceTrack,
            destinationTrackBefore = destinationTrack,
            destinationTrackAfter = AnimationTrack(destinationId, mergedFrames),
            sourceWidth = sourceWidth,
            sourceHeight = sourceHeight,
            sourceOrderPosition = sourcePosition,
            activeLayerBefore = previousActive,
            tickBefore = previousTick,
            tickAfter = previousTick,
            groupLayerIdsBefore = beforeGroups,
            groupLayerIdsAfter = beforeGroups,
            snapshotSerial = undoSnapshotSerial
        )
        layerMergeHistory[token] = history

        animationTracks.remove(idx)
        animationTracks[destinationId] = history.destinationTrackAfter
        EsenhoNativeBridge.nativeLayerSelect(destinationId)
        EsenhoNativeBridge.nativeLayerDelete(idx)
        syncLayers()
        history.groupLayerIdsAfter = rasterLayerGroups.mapValues { (_, group) -> group.layerIds.toList() }
        currentAnimationTick = previousTick.coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
        history.tickAfter = currentAnimationTick
        activeLayerIndex = destinationId
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    private fun buildMergedTrackFrames(
        destination: AnimationTrack,
        source: AnimationTrack,
        sourceLayerOpacity: Int
    ): MutableList<AnimationCel>? {
        fun celAt(track: AnimationTrack, tick: Int): AnimationCel? {
            return track.frames.getOrNull(AnimationExposure.indexAt(
                track.frames.map { it.duration }.toIntArray(), tick
            ))
        }

        val totalTicks = maxOf(
            destination.frames.sumOf { it.duration.coerceAtLeast(1) },
            source.frames.sumOf { it.duration.coerceAtLeast(1) }
        )
        if (totalTicks <= 0) return null
        val boundaries = sortedSetOf(0, totalTicks)
        listOf(destination, source).forEach { track ->
            var boundary = 0
            track.frames.forEach { cel ->
                boundary += cel.duration.coerceAtLeast(1)
                if (boundary in 1 until totalTicks) boundaries.add(boundary)
            }
        }

        val segments = boundaries.toList().zipWithNext()
        val merged = mutableListOf<AnimationCel>()
        return try {
            segments.forEachIndexed { index, (start, end) ->
                val destinationCel = celAt(destination, start)
                val sourceCel = celAt(source, start)
                val bitmap = Bitmap.createBitmap(
                    width,
                    height,
                    Bitmap.Config.ARGB_8888
                )
                val canvas = android.graphics.Canvas(bitmap)
                val bitmapPaint = android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG)
                if (destinationCel?.visible == true) {
                    canvas.drawBitmap(destinationCel.bitmap, 0f, 0f, bitmapPaint)
                }
                val sourceOpacity = (sourceLayerOpacity.coerceIn(0, 255) * (sourceCel?.opacity ?: 0).coerceIn(0, 255)) / 255
                if (sourceCel?.visible == true && sourceOpacity > 0) {
                    val sourcePaint = android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG).apply {
                        alpha = sourceOpacity
                    }
                    canvas.drawBitmap(sourceCel.bitmap, 0f, 0f, sourcePaint)
                }
                merged += AnimationCel(
                    id = "merge_${System.nanoTime()}_$index",
                    bitmap = bitmap,
                    duration = (end - start).coerceAtLeast(1),
                    visible = destinationCel?.visible == true || sourceCel?.visible == true,
                    opacity = destinationCel?.opacity ?: 255
                )
            }
            merged
        } catch (_: OutOfMemoryError) {
            merged.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
            null
        } catch (error: RuntimeException) {
            merged.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
            throw error
        }
    }

    fun clearActiveLayer() {
        if (transformState != null) cancelTransform()
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        captureCurrentFrame()
    }

    fun dryPaintWater() {
        EsenhoNativeBridge.nativeDryAllWater()
        getRenderBitmap()
    }

    fun diffusePaintWater(steps: Int = 1) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeStepWaterDiffusion(steps.coerceIn(1, 16))
        captureCurrentFrame()
        getRenderBitmap()
    }

    /** Compatibility alias. Raster dimensions belong to the full project. */
    fun resizeActiveCel(newWidth: Int, newHeight: Int, resample: Boolean): Boolean = resizeCanvas(newWidth, newHeight, resample)

    // ── Animation Frame-by-Frame (Raster Animator) ──

    fun captureCurrentFrame(layerId: Int = activeLayerIndex) {
        val track = animationTracks[layerId] ?: return
        if (track.activeCelIndex in track.frames.indices) {
            val cel = track.frames[track.activeCelIndex]
            if (cel.bitmap.width != width || cel.bitmap.height != height) {
                val replacement = resizeBitmapToCanvas(cel.bitmap, width, height, true)
                if (!cel.bitmap.isRecycled) cel.bitmap.recycle()
                cel.bitmap = replacement
            } else {
                cel.bitmap.eraseColor(Color.TRANSPARENT)
            }
            EsenhoNativeBridge.nativeLayerGetBitmap(track.layerId, cel.bitmap)
        }
    }

    private fun captureAllCurrentFrames() {
        animationTracks.keys.toList().forEach(::captureCurrentFrame)
    }

    fun restoreFrame(index: Int) {
        if (transformState != null) cancelTransform()
        val track = animationTracks[activeLayerIndex] ?: return
        if (index !in track.frames.indices) return
        captureCurrentFrame()
        track.activeCelIndex = index
        currentAnimationTick = track.frames.take(index).sumOf { it.duration.coerceAtLeast(1) }
            .coerceAtMost(totalAnimationTicks() - 1)
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun setCurrentFrameDuration(duration: Int) {
        if (transformState != null) cancelTransform()
        val track = animationTracks[activeLayerIndex] ?: return
        captureCurrentFrame()
        val cel = track.frames.getOrNull(track.activeCelIndex) ?: return
        val nextDuration = duration.coerceAtLeast(1)
        if (cel.duration == nextDuration) return
        val pending = pendingCelDurationEdit?.takeIf { it.first == cel.id }
        val token = pending?.second ?: beginCelTimelineEdit(track, cel)
        cel.duration = nextDuration
        currentAnimationTick = track.frames.take(track.activeCelIndex).sumOf { it.duration.coerceAtLeast(1) }
            .coerceAtMost(totalAnimationTicks() - 1)
        finishCelTimelineEdit(token, closeDurationEdit = pending == null)
    }

    fun beginCelDurationEdit(): Boolean {
        if (transformState != null) cancelTransform()
        val track = animationTracks[activeLayerIndex] ?: return false
        val cel = track.frames.getOrNull(track.activeCelIndex) ?: return false
        if (pendingCelDurationEdit?.first == cel.id) return true
        val token = beginCelTimelineEdit(track, cel)
        if (token == 0L) return false
        pendingCelDurationEdit = cel.id to token
        return true
    }

    fun finishCelDurationEdit() {
        if (transformState != null) cancelTransform()
        pendingCelDurationEdit?.second?.let { finishCelTimelineEdit(it, closeDurationEdit = true) }
    }

    fun setCurrentCelVisible(visible: Boolean) {
        if (transformState != null) cancelTransform()
        val track = animationTracks[activeLayerIndex] ?: return
        captureCurrentFrame()
        val cel = track.frames.getOrNull(track.activeCelIndex) ?: return
        if (cel.visible == visible) return
        val token = beginCelTimelineEdit(track, cel)
        cel.visible = visible
        finishCelTimelineEdit(token)
    }

    fun setCurrentCelOpacity(opacity: Int) {
        if (transformState != null) cancelTransform()
        val track = animationTracks[activeLayerIndex] ?: return
        captureCurrentFrame()
        val cel = track.frames.getOrNull(track.activeCelIndex) ?: return
        val nextOpacity = opacity.coerceIn(0, 255)
        if (cel.opacity == nextOpacity) return
        val token = beginCelTimelineEdit(track, cel)
        cel.opacity = nextOpacity
        finishCelTimelineEdit(token)
    }

    private fun celTimelineState(cel: AnimationCel) =
        CelTimelineState(cel.duration, cel.visible, cel.opacity)

    private fun beginCelTimelineEdit(track: AnimationTrack, cel: AnimationCel): Long {
        val before = celTimelineState(cel)
        val tick = currentAnimationTick
        val token = pushUndoSnapshot()
        if (token != 0L) {
            celTimelineHistory[token] = CelTimelineHistory(
                track, cel, before, before, tick, tick, undoSnapshotSerial
            )
        }
        return token
    }

    private fun finishCelTimelineEdit(token: Long, closeDurationEdit: Boolean = true) {
        if (token != 0L) {
            celTimelineHistory[token]?.let { history ->
                history.after = celTimelineState(history.cel)
                history.afterTick = currentAnimationTick
            }
        }
        if (closeDurationEdit && pendingCelDurationEdit?.second == token) pendingCelDurationEdit = null
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun addAnimationFrame(): Int {
        if (transformState != null) cancelTransform()
        captureCurrentFrame()
        val track = animationTracks[activeLayerIndex] ?: return currentFrameIndex
        val historyToken = beginAnimationStructureEdit(track)
        val newIndex = if (currentFrameIndex in track.frames.indices) currentFrameIndex + 1 else track.frames.size
        val currentCel = animationFrames.getOrNull(currentFrameIndex)
        val newBmp = Bitmap.createBitmap(
            currentCel?.bitmap?.width ?: width,
            currentCel?.bitmap?.height ?: height,
            Bitmap.Config.ARGB_8888
        )
        val cel = AnimationCel(
            "Frame ${animationFrames.size + 1}", newBmp,
            visible = currentCel?.visible ?: true,
            opacity = currentCel?.opacity ?: 255
        )
        animationFrames.add(newIndex, cel)
        currentFrameIndex = newIndex
        currentAnimationTick = animationFrames.take(newIndex).sumOf { it.duration.coerceAtLeast(1) }
        finishAnimationStructureEdit(historyToken, track)
        applyAnimationTick(currentAnimationTick, captureActive = false)
        return newIndex
    }

    fun duplicateAnimationFrame(): Int {
        if (transformState != null) cancelTransform()
        captureCurrentFrame()
        val track = animationTracks[activeLayerIndex] ?: return currentFrameIndex
        val current = animationFrames.getOrNull(currentFrameIndex) ?: return currentFrameIndex
        val historyToken = beginAnimationStructureEdit(track)
        val currBmp = current.bitmap
        val copyBmp = currBmp.copy(Bitmap.Config.ARGB_8888, true)
        val newIndex = currentFrameIndex + 1
        val cel = AnimationCel("Frame ${animationFrames.size + 1}", copyBmp, current.duration, current.visible, current.opacity)
        animationFrames.add(newIndex, cel)
        currentFrameIndex = newIndex
        currentAnimationTick = animationFrames.take(newIndex).sumOf { it.duration.coerceAtLeast(1) }
        finishAnimationStructureEdit(historyToken, track)
        applyAnimationTick(currentAnimationTick, captureActive = false)
        return newIndex
    }

    fun deleteAnimationFrame() {
        if (transformState != null) cancelTransform()
        if (animationFrames.size <= 1 || currentFrameIndex !in animationFrames.indices) return
        captureCurrentFrame()
        val track = animationTracks[activeLayerIndex] ?: return
        val historyToken = beginAnimationStructureEdit(track)
        animationFrames.removeAt(currentFrameIndex)
        currentFrameIndex = currentFrameIndex.coerceIn(0, animationFrames.size - 1)
        currentAnimationTick = animationFrames.take(currentFrameIndex).sumOf { it.duration.coerceAtLeast(1) }
            .coerceAtMost(totalAnimationTicks() - 1)
        finishAnimationStructureEdit(historyToken, track)
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun moveAnimationFrame(from: Int, to: Int) {
        if (transformState != null) cancelTransform()
        val frames = animationFrames
        if (from !in frames.indices || to !in frames.indices || from == to) return
        captureCurrentFrame()
        val track = animationTracks[activeLayerIndex] ?: return
        val historyToken = beginAnimationStructureEdit(track)
        val moved = frames.removeAt(from)
        frames.add(to, moved)
        currentFrameIndex = to
        currentAnimationTick = frames.take(to).sumOf { it.duration.coerceAtLeast(1) }
            .coerceAtMost(totalAnimationTicks() - 1)
        finishAnimationStructureEdit(historyToken, track)
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    private fun beginAnimationStructureEdit(track: AnimationTrack): Long {
        val token = pushUndoSnapshot()
        if (token != 0L) {
            animationStructureHistory[token] = AnimationStructureHistory(
                track, track.frames.toList(), track.frames.toList(), currentAnimationTick,
                currentAnimationTick, undoSnapshotSerial
            )
        }
        return token
    }

    private fun finishAnimationStructureEdit(token: Long, track: AnimationTrack) {
        if (token != 0L) {
            animationStructureHistory[token]?.let { history ->
                history.after = track.frames.toList()
                history.afterTick = currentAnimationTick
            }
        }
    }

    fun clearCurrentAnimationFrame() {
        if (currentFrameIndex !in animationFrames.indices) return
        if (transformState != null) cancelTransform()
        captureCurrentFrame()
        pushUndoSnapshot()
        animationFrames.getOrNull(currentFrameIndex)?.bitmap?.eraseColor(Color.TRANSPARENT)
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        getRenderBitmap()
    }

    fun getOnionSkinPrevBitmap(): Bitmap? {
        if (!onionSkinEnabled || currentFrameIndex <= 0) return null
        return animationFrames[currentFrameIndex - 1].bitmap
    }

    fun getOnionSkinPreviews(): List<OnionSkinPreview> {
        if (!onionSkinEnabled || isAnimationPlaying) return emptyList()
        val track = animationTracks[activeLayerIndex] ?: return emptyList()
        if (track.frames.size <= 1 || track.activeCelIndex !in track.frames.indices) return emptyList()
        val result = mutableListOf<OnionSkinPreview>()
        for (step in onionPrevFrames.coerceIn(0, 5) downTo 1) {
            val idx = track.activeCelIndex - step
            if (idx in track.frames.indices) {
                val falloff = (onionPrevFrames - step + 1).toFloat() / (onionPrevFrames + 1).coerceAtLeast(1)
                result += OnionSkinPreview(track.frames[idx].bitmap, (255f * onionOpacity.coerceIn(0.1f, 0.85f) * falloff).toInt(), true, onionPrevTint)
            }
        }
        for (step in onionNextFrames.coerceIn(0, 5) downTo 1) {
            val idx = track.activeCelIndex + step
            if (idx in track.frames.indices) {
                val falloff = (onionNextFrames - step + 1).toFloat() / (onionNextFrames + 1).coerceAtLeast(1)
                result += OnionSkinPreview(track.frames[idx].bitmap, (255f * onionOpacity.coerceIn(0.1f, 0.85f) * falloff).toInt(), false, onionNextTint)
            }
        }
        return result
    }

    fun getOnionSkinNextBitmap(): Bitmap? {
        if (!onionSkinEnabled || currentFrameIndex !in animationFrames.indices || currentFrameIndex >= animationFrames.size - 1) return null
        return animationFrames[currentFrameIndex + 1].bitmap
    }

    // ── Drawing & Touch Execution ──

    private fun toNativeColor(color: Int): Int {
        val a = (color ushr 24) and 0xFF
        val r = (color ushr 16) and 0xFF
        val g = (color ushr 8) and 0xFF
        val b = color and 0xFF
        // ABGR little-endian: (A << 24) | (B << 16) | (G << 8) | R
        return (a shl 24) or (b shl 16) or (g shl 8) or r
    }

    fun pickColorAt(x: Float, y: Float): Int {
        val picked = EsenhoNativeBridge.nativePickColor(x.toInt(), y.toInt(), 1)
        if ((picked ushr 24) > 0) {
            currentColor = picked
        }
        return currentColor
    }

    fun onTouchDown(x: Float, y: Float, pressure: Float = 0.85f, tiltX: Int = 0, tiltY: Int = 0) {
        isAnimationPlaying = false
        endCurveStroke()
        strokeUsageHistory.cancel()
        if (currentTool == ToolMode.EYEDROPPER) {
            pickColorAt(x, y)
            return
        }

        activeStrokeUndoToken = 0L

        if (currentTool == ToolMode.SELECT_WAND) {
            selectionPath = null
            EsenhoNativeBridge.nativeSelectWand(
                activeLayerIndex,
                x.roundToInt().coerceIn(0, width - 1),
                y.roundToInt().coerceIn(0, height - 1),
                wandTolerance.coerceIn(0, 255),
                if (wandContiguous) 1 else 0,
                selectionOp.id
            )
            updateSelectionInfo()
            isStrokeActive = false
            return
        }

        if (currentTool != ToolMode.PAN && currentTool != ToolMode.SELECT_RECT && currentTool != ToolMode.SELECT_LASSO && currentTool != ToolMode.SELECT_ELLIPSE && currentTool != ToolMode.SELECT_BRUSH_MASK) {
            activeStrokeUndoToken = pushUndoSnapshot()
        }

        isStrokeActive = true
        val usesBrush = currentTool in setOf(ToolMode.BRUSH, ToolMode.ERASER, ToolMode.SMUDGE, ToolMode.BLEND)
        val usesColor = currentTool in setOf(ToolMode.BRUSH, ToolMode.BLEND, ToolMode.LINE,
            ToolMode.RECTANGLE, ToolMode.ELLIPSE, ToolMode.LASSO_FILL)
        strokeUsageHistory.begin(
            if (usesBrush) selectedPreset?.let { "preset:${it.id}" } ?: selectedBrush?.let { "brush:${it.id}" } else null,
            if (usesColor) currentColor else null,
        )
        strokeStartX = x
        strokeStartY = y
        strokeCurrentX = x
        strokeCurrentY = y
        lastX = x
        lastY = y
        strokeSmoothX = x
        strokeSmoothY = y
        strokeLastMidX = x
        strokeLastMidY = y
        strokePrevTargetX = x
        strokePrevTargetY = y

        if (currentTool in setOf(ToolMode.BRUSH, ToolMode.ERASER, ToolMode.SMUDGE, ToolMode.BLEND)) {
            curveRuntime.begin(x, y, pressure, tiltX, tiltY)
        }
        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0.01f, 1f) * 1000).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                EsenhoNativeBridge.nativeBrushSetType(0) // Draw mode
                emitCurveStroke(0, x, y, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            ToolMode.SMUDGE -> {
                EsenhoNativeBridge.nativeBrushSetType(1) // W_MODE_SMUDGE
                emitCurveStroke(0, x, y, x, y, nativeCol, 0, pInt, tiltX, tiltY)
            }
            ToolMode.BLEND -> {
                EsenhoNativeBridge.nativeBrushSetType(2) // W_MODE_BLEND
                emitCurveStroke(0, x, y, x, y, nativeCol, 0, pInt, tiltX, tiltY)
            }
            ToolMode.FILL -> {
                EsenhoNativeBridge.nativeBrushSetType(3) // W_MODE_FILL
                emitCurveStroke(0, x, y, x, y, nativeCol, 0, 1000, 0, 0)
                isStrokeActive = false
                captureCurrentFrame()
            }
            ToolMode.LASSO_FILL -> {
                lassoPoints.clear()
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
                EsenhoNativeBridge.nativeBrushSetType(4) // W_MODE_LASSO_FILL
                emitCurveStroke(0, x, y, x, y, nativeCol, 0, 1000, 0, 0)
            }
            ToolMode.SELECT_LASSO -> {
                lassoPoints.clear()
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
            }
            ToolMode.SELECT_BRUSH_MASK -> {
                lassoPoints.clear()
                lassoPoints.add(Pair(x.roundToInt(), y.roundToInt()))
                selectionBrushRestoreLayer = activeLayerIndex
                selectionBrushScratchLayer = EsenhoNativeBridge.nativeGetSelectionScratchLayer()
                val info = IntArray(6)
                selectionBrushOriginalInfo = if (EsenhoNativeBridge.nativeSelectGetInfo(info) && info[0] != 0) info else null
                selectionBrushOriginalMask = selectionBrushOriginalInfo?.takeIf { it[5] != 0 }?.let { selection ->
                    ByteArray(selection[3] * selection[4]).also { EsenhoNativeBridge.nativeSelectGetMask(it) }
                }
                if (selectionBrushScratchLayer >= 0) {
                    EsenhoNativeBridge.nativeSelectClear()
                    EsenhoNativeBridge.nativeLayerSelect(selectionBrushScratchLayer)
                    EsenhoNativeBridge.nativeLayerClear(selectionBrushScratchLayer)
                    EsenhoNativeBridge.nativeBrushSetType(0)
                    emitCurveStroke(0, x, y, x, y, toNativeColor(Color.WHITE), 0, pInt, tiltX, tiltY)
                    lastX = x
                    lastY = y
                }
            }
            else -> {}
        }

    }

    fun onTouchMove(x: Float, y: Float, pressure: Float = 0.85f, tiltX: Int = 0, tiltY: Int = 0) {
        if (!isStrokeActive) return
        curveRuntime.event(x, y, pressure, tiltX, tiltY)
        curveRuntime.applyAt(strokeLastMidX, strokeLastMidY)

        strokeCurrentX = x
        strokeCurrentY = y

        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0.01f, 1f) * 1000).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER, ToolMode.SMUDGE, ToolMode.BLEND -> {
                val p = selectedPreset
                val smooth = curveRuntime.effective(19, p?.smoothing ?: brushSmooth)
                val midpoint = curveRuntime.effective(20, p?.midpoint ?: getPresetParam(20))

                // Responsive Exponential Moving Average when smooth > 0; direct 1.0 tracking when smooth == 0
                val s = smooth / 100f
                val factor = if (smooth > 0) max(0.015f, (1.0f - s * 0.96f).pow(2.2f)) else 1.0f
                val targetX = strokeSmoothX + (x - strokeSmoothX) * factor
                val targetY = strokeSmoothY + (y - strokeSmoothY) * factor

                val pPrevX = strokeSmoothX
                val pPrevY = strokeSmoothY
                val pCurrX = targetX
                val pCurrY = targetY

                // Midpoint & Curvature Tension Dynamics:
                // - 0%: tension = 0 -> collapses into straight chords
                // - 50%: tension = 1.0 -> standard smooth quadratic Bézier curve
                // - 100%: tension = 2.0 -> deep elastic curvature
                val midClamped = midpoint.coerceIn(0, 100)
                val ratio = 0.15f + (midClamped / 100f) * 0.70f
                val tension = midClamped / 50f

                val midPrevX = strokeLastMidX
                val midPrevY = strokeLastMidY
                val midCurrX = pPrevX + (pCurrX - pPrevX) * ratio
                val midCurrY = pPrevY + (pCurrY - pPrevY) * ratio

                val chordMidX = (midPrevX + midCurrX) * 0.5f
                val chordMidY = (midPrevY + midCurrY) * 0.5f
                val ctrlX = chordMidX + (pPrevX - chordMidX) * tension
                val ctrlY = chordMidY + (pPrevY - chordMidY) * tension

                val chordDist = hypot(midCurrX - midPrevX, midCurrY - midPrevY)
                val arcDist = hypot(ctrlX - midPrevX, ctrlY - midPrevY) + hypot(midCurrX - ctrlX, midCurrY - ctrlY)
                val curveLen = (chordDist + arcDist) * 0.5f
                val deltaArc = arcDist - chordDist

                var steps = 1
                if (tension > 0.05f && curveLen > 1.5f && deltaArc > 0.35f) {
                    steps = min(8, max(2, ceil(curveLen / 4.0f).toInt()))
                }

                var lastSubX = midPrevX
                var lastSubY = midPrevY

                for (step in 1..steps) {
                    val t = step.toFloat() / steps.toFloat()
                    val invT = 1.0f - t
                    val bx = invT * invT * midPrevX + 2.0f * invT * t * ctrlX + t * t * midCurrX
                    val by = invT * invT * midPrevY + 2.0f * invT * t * ctrlY + t * t * midCurrY

                    val strokeEraser = if (currentTool == ToolMode.ERASER) 1 else 0
                    emitCurveStroke(1, bx, by, lastSubX, lastSubY, nativeCol, strokeEraser, pInt, tiltX, tiltY)
                    lastSubX = bx
                    lastSubY = by
                }

                strokeSmoothX = targetX
                strokeSmoothY = targetY
                strokeLastMidX = midCurrX
                strokeLastMidY = midCurrY
                strokePrevTargetX = pPrevX
                strokePrevTargetY = pPrevY
                lastX = targetX
                lastY = targetY
            }
            ToolMode.LASSO_FILL -> {
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
                emitCurveStroke(1, x, y, lastX, lastY, nativeCol, 0, 1000, 0, 0)
                lastX = x
                lastY = y
            }
            ToolMode.SELECT_LASSO -> {
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
            }
            ToolMode.SELECT_BRUSH_MASK -> {
                lassoPoints.add(Pair(x.roundToInt(), y.roundToInt()))
                if (selectionBrushScratchLayer >= 0) {
                    emitCurveStroke(
                        1, x, y, lastX, lastY, toNativeColor(Color.WHITE), 0, pInt, tiltX, tiltY
                    )
                    lastX = x
                    lastY = y
                }
            }
            else -> {}
        }
    }

    fun onTouchUp(x: Float, y: Float, pressure: Float = 0f, tiltX: Int = 0, tiltY: Int = 0) {
        if (!isStrokeActive) return
        isStrokeActive = false

        strokeCurrentX = x
        strokeCurrentY = y

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0.01f, 1f) * 1000).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER, ToolMode.SMUDGE, ToolMode.BLEND -> {
                val finalX = strokeSmoothX
                val finalY = strokeSmoothY
                val dEnd = hypot(finalX - strokeLastMidX, finalY - strokeLastMidY)
                var lastSubX = strokeLastMidX
                var lastSubY = strokeLastMidY

                if (dEnd > 0.25f) {
                    val steps = max(1, min(8, ceil(dEnd / 3.0f).toInt()))
                    for (step in 1..steps) {
                        val t = step.toFloat() / steps.toFloat()
                        val invT = 1.0f - t
                        val bx = invT * invT * strokeLastMidX + 2.0f * invT * t * finalX + t * t * finalX
                        val by = invT * invT * strokeLastMidY + 2.0f * invT * t * finalY + t * t * finalY
                        emitCurveStroke(1, bx, by, lastSubX, lastSubY, nativeCol, isEraser, pInt, tiltX, tiltY)
                        lastSubX = bx
                        lastSubY = by
                    }
                }
                emitCurveStroke(2, finalX, finalY, lastSubX, lastSubY, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            ToolMode.LASSO_FILL -> {
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
                emitCurveStroke(2, x, y, lastX, lastY, nativeCol, 0, 1000, 0, 0)
                lassoPoints.clear()
                getRenderBitmap()
            }
            ToolMode.LINE -> {
                EsenhoNativeBridge.nativeDrawLine(strokeStartX.toInt(), strokeStartY.toInt(), x.toInt(), y.toInt(), nativeCol)
            }
            ToolMode.RECTANGLE -> {
                val rx = Math.min(strokeStartX, x).toInt()
                val ry = Math.min(strokeStartY, y).toInt()
                val rw = Math.abs(x - strokeStartX).toInt()
                val rh = Math.abs(y - strokeStartY).toInt()
                if (rw > 0 && rh > 0) {
                    EsenhoNativeBridge.nativeDrawRect(rx, ry, rw, rh, nativeCol)
                }
            }
            ToolMode.ELLIPSE -> {
                val cx = ((strokeStartX + x) / 2f).toInt()
                val cy = ((strokeStartY + y) / 2f).toInt()
                val rx = (abs(x - strokeStartX) / 2f).roundToInt()
                val ry = (abs(y - strokeStartY) / 2f).roundToInt()
                if (rx > 0 && ry > 0) {
                    EsenhoNativeBridge.nativeDrawEllipse(cx, cy, rx, ry, nativeCol)
                }
            }
            ToolMode.ERASE_RECTANGLE -> {
                val rx = min(strokeStartX, x).toInt()
                val ry = min(strokeStartY, y).toInt()
                val rw = abs(x - strokeStartX).toInt()
                val rh = abs(y - strokeStartY).toInt()
                if (rw > 0 && rh > 0) EsenhoNativeBridge.nativeEraseRect(rx, ry, rw, rh)
                getRenderBitmap()
            }
            ToolMode.ERASE_ELLIPSE -> {
                val cx = ((strokeStartX + x) / 2f).roundToInt()
                val cy = ((strokeStartY + y) / 2f).roundToInt()
                val rx = (abs(x - strokeStartX) / 2f).roundToInt()
                val ry = (abs(y - strokeStartY) / 2f).roundToInt()
                if (rx > 0 && ry > 0) EsenhoNativeBridge.nativeEraseEllipse(cx, cy, rx, ry)
                getRenderBitmap()
            }
            ToolMode.SELECT_RECT -> {
                val rx = Math.min(strokeStartX, x).toInt()
                val ry = Math.min(strokeStartY, y).toInt()
                val rw = Math.abs(x - strokeStartX).toInt()
                val rh = Math.abs(y - strokeStartY).toInt()
                if (rw > 2 && rh > 2) {
                    selectRect(rx, ry, rw, rh)
                }
            }
            ToolMode.SELECT_ELLIPSE -> {
                val centerX = ((strokeStartX + x) / 2f).roundToInt()
                val centerY = ((strokeStartY + y) / 2f).roundToInt()
                val radiusX = (abs(x - strokeStartX) / 2f).roundToInt()
                val radiusY = (abs(y - strokeStartY) / 2f).roundToInt()
                if (radiusX > 0 && radiusY > 0) {
                    selectEllipse(centerX, centerY, radiusX, radiusY)
                }
            }
            ToolMode.SELECT_LASSO -> {
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
                if (lassoPoints.size >= 3) {
                    selectLasso(lassoPoints)
                }
                lassoPoints.clear()
            }
            ToolMode.SELECT_BRUSH_MASK -> {
                lassoPoints.add(Pair(x.roundToInt(), y.roundToInt()))
                if (selectionBrushScratchLayer >= 0) {
                    emitCurveStroke(2, x, y, lastX, lastY, toNativeColor(Color.WHITE), 0, pInt, tiltX, tiltY)
                    finishSelectionBrushStroke()
                } else {
                    selectBrushMask(lassoPoints, max(1, (brushSize / 2f).roundToInt()))
                }
                lassoPoints.clear()
            }
            else -> {}
        }

        if (currentTool in setOf(ToolMode.RECTANGLE, ToolMode.ELLIPSE) &&
            (x == strokeStartX || y == strokeStartY)) strokeUsageHistory.cancel()
        commitStrokeHistory()

        // Keep the active cel and its timeline thumbnail in sync with edits as
        // soon as a stroke or raster shape is committed.
        captureCurrentFrame()
        endCurveStroke()
        activeStrokeUndoToken = 0L
    }

    // ── Selection Operations ──

    fun updateSelectionInfo() {
        val info = IntArray(6)
        val hasSel = EsenhoNativeBridge.nativeSelectGetInfo(info)
        if (hasSel && info[0] != 0 && info[3] > 0 && info[4] > 0) {
            selectionActive = true
            selectionBounds = android.graphics.Rect(info[1], info[2], info[1] + info[3], info[2] + info[4])
            selectionHasMask = (info.size >= 6 && info[5] != 0)
            selectionPath = if (selectionHasMask) buildSelectionOutline(info) else null
        } else {
            selectionActive = false
            selectionBounds = null
            selectionHasMask = false
            selectionPath = null
        }
    }

    private fun buildSelectionOutline(info: IntArray): android.graphics.Path? {
        val left = info[1]
        val top = info[2]
        val maskWidth = info[3]
        val maskHeight = info[4]
        if (maskWidth <= 0 || maskHeight <= 0 || maskWidth.toLong() * maskHeight > Int.MAX_VALUE) return null
        val mask = ByteArray(maskWidth * maskHeight)
        if (!EsenhoNativeBridge.nativeSelectGetMask(mask)) return null
        fun isSelected(x: Int, y: Int): Boolean =
            x in 0 until maskWidth && y in 0 until maskHeight && mask[y * maskWidth + x].toInt() != 0

        val outline = android.graphics.Path()
        for (y in 0 until maskHeight) {
            for (x in 0 until maskWidth) {
                if (!isSelected(x, y)) continue
                val docX = (left + x).toFloat()
                val docY = (top + y).toFloat()
                if (!isSelected(x, y - 1)) { outline.moveTo(docX, docY); outline.lineTo(docX + 1f, docY) }
                if (!isSelected(x + 1, y)) { outline.moveTo(docX + 1f, docY); outline.lineTo(docX + 1f, docY + 1f) }
                if (!isSelected(x, y + 1)) { outline.moveTo(docX + 1f, docY + 1f); outline.lineTo(docX, docY + 1f) }
                if (!isSelected(x - 1, y)) { outline.moveTo(docX, docY + 1f); outline.lineTo(docX, docY) }
            }
        }
        return outline
    }

    /** Filled shape expressed in an affine document reference, with normal editor history. */
    fun drawAffineShape(x0: Float, y0: Float, x1: Float, y1: Float, matrix: Matrix, ellipse: Boolean, erase: Boolean) {
        isAnimationPlaying = false
        if (x0 == x1 || y0 == y1) return
        check(transformState == null && !isStrokeActive)
        val values = FloatArray(9)
        matrix.getValues(values)
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeDrawAffineShape(x0, y0, x1, y1,
            floatArrayOf(values[0], values[3], values[1], values[4], values[2], values[5]),
            ellipse, erase, toNativeColor(currentColor))
        if (!erase) {
            strokeUsageHistory.begin(null, currentColor)
            commitStrokeHistory()
        }
        captureCurrentFrame()
        getRenderBitmap()
    }

    fun selectRect(x: Int, y: Int, w: Int, h: Int, op: SelectionOp = selectionOp) {
        selectionPath = null
        EsenhoNativeBridge.nativeSelectRect(x, y, w, h, op.id)
        updateSelectionInfo()
    }

    fun selectLasso(points: List<Pair<Int, Int>>, op: SelectionOp = selectionOp) {
        if (points.size < 3) return
        val arr = IntArray(points.size * 2)
        points.forEachIndexed { i, p ->
            arr[i * 2] = p.first
            arr[i * 2 + 1] = p.second
        }
        EsenhoNativeBridge.nativeSelectLasso(arr, points.size, op.id)
        val path = android.graphics.Path()
        path.moveTo(points[0].first.toFloat(), points[0].second.toFloat())
        for (i in 1 until points.size) {
            path.lineTo(points[i].first.toFloat(), points[i].second.toFloat())
        }
        path.close()
        selectionPath = path
        updateSelectionInfo()
    }

    fun selectBrushMask(points: List<Pair<Int, Int>>, radius: Int, op: SelectionOp = selectionOp) {
        if (points.isEmpty()) return
        val arr = IntArray(points.size * 2)
        points.forEachIndexed { i, point ->
            arr[i * 2] = point.first
            arr[i * 2 + 1] = point.second
        }
        EsenhoNativeBridge.nativeSelectBrushMask(arr, points.size, radius.coerceAtLeast(1), op.id)
        selectionPath = null
        updateSelectionInfo()
    }

    private fun finishSelectionBrushStroke() {
        val scratchId = selectionBrushScratchLayer
        val originalLayerId = selectionBrushRestoreLayer
        var brushBounds: android.graphics.Rect? = null
        var brushMask: ByteArray? = null

        if (scratchId >= 0 && width > 0 && height > 0) {
            val scratchBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            if (EsenhoNativeBridge.nativeLayerGetBitmap(scratchId, scratchBitmap)) {
                val rowPixels = IntArray(width)
                var minX = width
                var minY = height
                var maxX = -1
                var maxY = -1
                for (y in 0 until height) {
                    scratchBitmap.getPixels(rowPixels, 0, width, 0, y, width, 1)
                    for (x in 0 until width) {
                        if ((rowPixels[x] ushr 24) != 0) {
                            if (x < minX) minX = x
                            if (x > maxX) maxX = x
                            if (y < minY) minY = y
                            if (y > maxY) maxY = y
                        }
                    }
                }
                if (maxX >= minX && maxY >= minY) {
                    val maskWidth = maxX - minX + 1
                    val maskHeight = maxY - minY + 1
                    val mask = ByteArray(maskWidth * maskHeight)
                    for (y in 0 until maskHeight) {
                        scratchBitmap.getPixels(rowPixels, 0, width, 0, minY + y, width, 1)
                        for (x in 0 until maskWidth) {
                            if ((rowPixels[minX + x] ushr 24) != 0) mask[y * maskWidth + x] = 1
                        }
                    }
                    brushBounds = android.graphics.Rect(minX, minY, maxX + 1, maxY + 1)
                    brushMask = mask
                }
            }
            scratchBitmap.recycle()
            EsenhoNativeBridge.nativeLayerClear(scratchId)
        }

        if (originalLayerId >= 0) EsenhoNativeBridge.nativeLayerSelect(originalLayerId)
        restoreSelectionBrushOriginal()
        if (brushBounds != null && brushMask != null) {
            EsenhoNativeBridge.nativeSelectApplyMask(
                brushMask,
                brushBounds.left,
                brushBounds.top,
                brushBounds.width(),
                brushBounds.height(),
                selectionOp.id
            )
        }

        clearSelectionBrushState()
        updateSelectionInfo()
        getRenderBitmap()
    }

    private fun restoreSelectionBrushOriginal() {
        selectionBrushOriginalInfo?.let { info ->
            val mask = selectionBrushOriginalMask
            if (info[5] != 0 && mask != null) {
                EsenhoNativeBridge.nativeSelectApplyMask(mask, info[1], info[2], info[3], info[4], SelectionOp.REPLACE.id)
            } else {
                EsenhoNativeBridge.nativeSelectRect(info[1], info[2], info[3], info[4], SelectionOp.REPLACE.id)
            }
        }
    }

    private fun clearSelectionBrushState() {
        selectionBrushScratchLayer = -1
        selectionBrushRestoreLayer = -1
        selectionBrushOriginalInfo = null
        selectionBrushOriginalMask = null
    }

    fun selectEllipse(centerX: Int, centerY: Int, radiusX: Int, radiusY: Int, op: SelectionOp = selectionOp) {
        if (radiusX <= 0 || radiusY <= 0) return
        selectionPath = android.graphics.Path().apply {
            addOval(android.graphics.RectF((centerX - radiusX).toFloat(), (centerY - radiusY).toFloat(), (centerX + radiusX).toFloat(), (centerY + radiusY).toFloat()), android.graphics.Path.Direction.CW)
        }
        EsenhoNativeBridge.nativeSelectEllipse(centerX, centerY, radiusX, radiusY, op.id)
        updateSelectionInfo()
    }

    // Match the web command: Select All replaces the current selection,
    // regardless of the boolean operation chosen for subsequent marquee tools.
    fun selectAll(op: SelectionOp = SelectionOp.REPLACE) {
        selectionPath = null
        EsenhoNativeBridge.nativeSelectAll(op.id)
        updateSelectionInfo()
    }

    fun clearSelection() {
        selectionPath = null
        selectionHasMask = false
        EsenhoNativeBridge.nativeSelectClear()
        updateSelectionInfo()
    }

    fun invertSelection() {
        selectionPath = null
        EsenhoNativeBridge.nativeSelectInvert()
        updateSelectionInfo()
    }

    fun featherSelection(radius: Int) {
        EsenhoNativeBridge.nativeSelectFeather(radius.coerceIn(1, 16))
        selectionPath = null
        updateSelectionInfo()
        getRenderBitmap()
    }

    fun clearSelectedPixels() {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeClearSelectedPixels()
        captureCurrentFrame()
        getRenderBitmap()
    }

    fun fillSelection(color: Int = currentColor): Boolean {
        val bounds = selectionBounds ?: return false
        val left = bounds.left.coerceIn(0, width)
        val top = bounds.top.coerceIn(0, height)
        val right = bounds.right.coerceIn(left, width)
        val bottom = bounds.bottom.coerceIn(top, height)
        val fillWidth = right - left
        val fillHeight = bottom - top
        if (fillWidth <= 0 || fillHeight <= 0) return false

        val fillPixels = IntArray(fillWidth * fillHeight)
        if (selectionHasMask) {
            val mask = ByteArray(fillPixels.size)
            if (!EsenhoNativeBridge.nativeSelectGetMask(mask)) return false
            for (i in fillPixels.indices) {
                if ((mask[i].toInt() and 0xFF) != 0) fillPixels[i] = color
            }
        } else {
            fillPixels.fill(color)
        }

        val fillBitmap = Bitmap.createBitmap(fillWidth, fillHeight, Bitmap.Config.ARGB_8888)
        try {
            fillBitmap.setPixels(fillPixels, 0, fillWidth, 0, 0, fillWidth, fillHeight)
            pushUndoSnapshot()
            EsenhoNativeBridge.nativeLayerDrawBitmap(activeLayerIndex, fillBitmap, left, top, fillWidth, fillHeight)
            captureCurrentFrame()
            getRenderBitmap()
            return true
        } finally {
            fillBitmap.recycle()
        }
    }

    fun copySelectionToClipboard(): Boolean {
        val bounds = selectionBounds ?: return false
        val left = bounds.left.coerceIn(0, width)
        val top = bounds.top.coerceIn(0, height)
        val right = bounds.right.coerceIn(left, width)
        val bottom = bounds.bottom.coerceIn(top, height)
        val copyWidth = right - left
        val copyHeight = bottom - top
        if (copyWidth <= 0 || copyHeight <= 0) return false

        val layerBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        if (!EsenhoNativeBridge.nativeLayerGetBitmap(activeLayerIndex, layerBitmap)) {
            layerBitmap.recycle()
            return false
        }
        val cropped = Bitmap.createBitmap(layerBitmap, left, top, copyWidth, copyHeight)
        layerBitmap.recycle()
        val copied = cropped.copy(Bitmap.Config.ARGB_8888, true)
        if (cropped !== copied) cropped.recycle()
        if (selectionHasMask) {
            val mask = ByteArray(copyWidth * copyHeight)
            if (EsenhoNativeBridge.nativeSelectGetMask(mask)) {
                val pixels = IntArray(copyWidth * copyHeight)
                copied.getPixels(pixels, 0, copyWidth, 0, 0, copyWidth, copyHeight)
                for (y in 0 until copyHeight) for (x in 0 until copyWidth) {
                    if ((mask[y * copyWidth + x].toInt() and 0xFF) == 0) {
                        pixels[y * copyWidth + x] = 0
                    }
                }
                copied.setPixels(pixels, 0, copyWidth, 0, 0, copyWidth, copyHeight)
            }
        }
        selectionClipboard?.takeUnless { it.isRecycled }?.recycle()
        selectionClipboard = copied
        return true
    }

    fun cutSelectionToClipboard(): Boolean {
        if (!copySelectionToClipboard()) return false
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeClearSelectedPixels()
        captureCurrentFrame()
        getRenderBitmap()
        return true
    }

    fun pasteSelectionClipboard(): Boolean {
        val clipboard = selectionClipboard?.takeUnless { it.isRecycled } ?: return false
        pushUndoSnapshot()
        val bounds = selectionBounds
        val x = bounds?.left ?: ((width - clipboard.width) / 2)
        val y = bounds?.top ?: ((height - clipboard.height) / 2)
        EsenhoNativeBridge.nativeLayerDrawBitmap(activeLayerIndex, clipboard, x, y, clipboard.width, clipboard.height)
        EsenhoNativeBridge.nativeSelectRect(x, y, clipboard.width, clipboard.height, SelectionOp.REPLACE.id)
        selectionPath = null
        updateSelectionInfo()
        captureCurrentFrame()
        getRenderBitmap()
        return true
    }

    // ── Flip & Transform Operations ──

    fun flipLayerH(layerIdx: Int = activeLayerIndex) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerFlipH(layerIdx)
        captureCurrentFrame(layerIdx)
        getRenderBitmap()
    }

    fun flipLayerV(layerIdx: Int = activeLayerIndex) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerFlipV(layerIdx)
        captureCurrentFrame(layerIdx)
        getRenderBitmap()
    }

    fun flipCanvasH() {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeCanvasFlipH()
        captureAllCurrentFrames()
        getRenderBitmap()
    }

    fun flipCanvasV() {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeCanvasFlipV()
        captureAllCurrentFrames()
        getRenderBitmap()
    }

    fun importImageToLayer(bitmap: Bitmap, addNewLayer: Boolean = true): Int {
        // addLayer() already snapshots the pre-import document. Avoid pushing
        // the same state twice when the image gets its own layer.
        if (!addNewLayer) pushUndoSnapshot()
        val targetLayer = if (addNewLayer) addLayer() else activeLayerIndex
        // Match the web import path: preserve aspect ratio, shrink only when
        // needed, and center the image on the canvas before starting transform.
        val scale = min(width.toFloat() / bitmap.width, height.toFloat() / bitmap.height).coerceAtMost(1f)
        val drawWidth = (bitmap.width * scale).roundToInt().coerceAtLeast(1)
        val drawHeight = (bitmap.height * scale).roundToInt().coerceAtLeast(1)
        val drawX = (width - drawWidth) / 2
        val drawY = (height - drawHeight) / 2
        val drawBitmap = if (drawWidth != bitmap.width || drawHeight != bitmap.height) {
            Bitmap.createScaledBitmap(bitmap, drawWidth, drawHeight, true)
        } else bitmap
        try {
            EsenhoNativeBridge.nativeLayerDrawBitmap(targetLayer, drawBitmap, drawX, drawY, drawWidth, drawHeight)
        } finally {
            if (drawBitmap !== bitmap && !drawBitmap.isRecycled) drawBitmap.recycle()
        }
        syncLayers()
        captureCurrentFrame(targetLayer)
        getRenderBitmap()
        return targetLayer
    }

    private fun releaseResizeHistory(token: Long) {
        layerResizeHistory.remove(token)?.let { history ->
            if (!history.before.isRecycled) history.before.recycle()
            if (!history.after.isRecycled) history.after.recycle()
            recycleUnreferencedAnimationCels(listOf(history.cel))
        }
        redoLayerResizeTokens.remove(token)
    }

    private fun releaseLayerOrderHistory(token: Long) {
        layerOrderHistory.remove(token)
        redoLayerOrderTokens.remove(token)
    }

    private fun releaseRasterLayerHistory(token: Long) {
        rasterLayerHistory.remove(token)
        redoRasterLayerTokens.remove(token)
        if (pendingLayerOpacityEdit?.second == token) pendingLayerOpacityEdit = null
    }

    private fun releaseCelTimelineHistory(token: Long) {
        celTimelineHistory.remove(token)?.let { recycleUnreferencedAnimationCels(listOf(it.cel)) }
        redoCelTimelineTokens.remove(token)
        if (pendingCelDurationEdit?.second == token) pendingCelDurationEdit = null
    }

    private fun releaseAnimationStructureHistory(token: Long) {
        val removed = animationStructureHistory.remove(token) ?: return
        redoAnimationStructureTokens.remove(token)
        recycleUnreferencedAnimationCels(removed.before + removed.after)
    }

    private fun releaseLayerMergeHistory(token: Long) {
        val removed = layerMergeHistory.remove(token) ?: return
        redoLayerMergeTokens.remove(token)
        recycleUnreferencedAnimationCels(
            removed.sourceTrack.frames + removed.destinationTrackBefore.frames + removed.destinationTrackAfter.frames
        )
    }

    private fun releaseLayerDeleteHistory(token: Long) {
        val removed = layerDeleteHistory.remove(token) ?: return
        redoLayerDeleteTokens.remove(token)
        recycleUnreferencedAnimationCels(removed.track.frames)
    }

    private fun releaseLayerAddHistory(token: Long) {
        val removed = layerAddHistory.remove(token) ?: return
        redoLayerAddTokens.remove(token)
        recycleUnreferencedAnimationCels(removed.track.frames)
    }

    private fun recycleUnreferencedAnimationCels(candidates: List<AnimationCel>) {
        val retained = animationTracks.values.flatMap { it.frames }.toMutableList()
        animationStructureHistory.values.forEach { retained.addAll(it.before); retained.addAll(it.after) }
        celTimelineHistory.values.forEach { retained.add(it.cel) }
        layerResizeHistory.values.forEach { retained.add(it.cel) }
        layerMergeHistory.values.forEach {
            retained.addAll(it.sourceTrack.frames)
            retained.addAll(it.destinationTrackBefore.frames)
            retained.addAll(it.destinationTrackAfter.frames)
        }
        layerDeleteHistory.values.forEach { retained.addAll(it.track.frames) }
        layerAddHistory.values.forEach { retained.addAll(it.track.frames) }
        candidates.forEach { cel ->
            if (retained.none { it === cel } && !cel.bitmap.isRecycled) cel.bitmap.recycle()
        }
    }

    private fun pushUndoSnapshot(): Long {
        if (transformState != null) cancelTransform()
        pendingLayerOpacityEdit?.second?.let { finishRasterLayerEdit(it) }
        pendingCelDurationEdit?.second?.let { finishCelTimelineEdit(it, closeDurationEdit = true) }
        redoLayerResizeTokens.toList().forEach(::releaseResizeHistory)
        redoLayerOrderTokens.toList().forEach(::releaseLayerOrderHistory)
        redoRasterLayerTokens.toList().forEach(::releaseRasterLayerHistory)
        redoCelTimelineTokens.toList().forEach(::releaseCelTimelineHistory)
        redoAnimationStructureTokens.toList().forEach(::releaseAnimationStructureHistory)
        redoLayerMergeTokens.toList().forEach(::releaseLayerMergeHistory)
        redoLayerDeleteTokens.toList().forEach(::releaseLayerDeleteHistory)
        redoLayerAddTokens.toList().forEach(::releaseLayerAddHistory)
        undoSnapshotSerial++
        groupEdits.entries.removeAll { undoSnapshotSerial - it.value.serial >= maxUndoSteps }
        layerResizeHistory.filterValues { undoSnapshotSerial - it.snapshotSerial >= maxUndoSteps }
            .keys.toList().forEach(::releaseResizeHistory)
        layerOrderHistory.filterValues { undoSnapshotSerial - it.snapshotSerial >= maxUndoSteps }
            .keys.toList().forEach(::releaseLayerOrderHistory)
        rasterLayerHistory.filterValues { undoSnapshotSerial - it.snapshotSerial >= maxUndoSteps }
            .keys.toList().forEach(::releaseRasterLayerHistory)
        celTimelineHistory.filterValues { undoSnapshotSerial - it.snapshotSerial >= maxUndoSteps }
            .keys.toList().forEach(::releaseCelTimelineHistory)
        animationStructureHistory.filterValues { undoSnapshotSerial - it.snapshotSerial >= maxUndoSteps }
            .keys.toList().forEach(::releaseAnimationStructureHistory)
        layerMergeHistory.filterValues { undoSnapshotSerial - it.snapshotSerial >= maxUndoSteps }
            .keys.toList().forEach(::releaseLayerMergeHistory)
        layerDeleteHistory.filterValues { undoSnapshotSerial - it.snapshotSerial >= maxUndoSteps }
            .keys.toList().forEach(::releaseLayerDeleteHistory)
        layerAddHistory.filterValues { undoSnapshotSerial - it.snapshotSerial >= maxUndoSteps }
            .keys.toList().forEach(::releaseLayerAddHistory)
        return EsenhoNativeBridge.nativePushUndo()
    }

    private fun restoreLayerResizeHistory(token: Long, redo: Boolean): Boolean {
        val history = layerResizeHistory[token] ?: return false
        val source = if (redo) history.after else history.before
        if (source.isRecycled) return false
        val replacement = source.copy(Bitmap.Config.ARGB_8888, true) ?: return false
        if (!history.cel.bitmap.isRecycled) history.cel.bitmap.recycle()
        history.cel.bitmap = replacement
        if (redo) redoLayerResizeTokens.remove(token) else redoLayerResizeTokens.add(token)
        applyAnimationTick(currentAnimationTick, captureActive = false)
        return true
    }

    private fun restoreLayerOrderHistory(token: Long, redo: Boolean): Boolean {
        val history = layerOrderHistory[token] ?: return false
        val target = if (redo) history.after else history.before
        if (target.size != layers.size || target.toSet() != layers.map { it.id }.toSet()) return false
        target.forEachIndexed { targetPosition, layerId ->
            var currentPosition = (0 until EsenhoNativeBridge.nativeLayerGetCount())
                .firstOrNull { EsenhoNativeBridge.nativeLayerGetOrder(it) == layerId } ?: return@forEachIndexed
            while (currentPosition > targetPosition) {
                if (EsenhoNativeBridge.nativeLayerMoveDown(layerId) != 1) break
                currentPosition--
            }
            while (currentPosition < targetPosition) {
                if (EsenhoNativeBridge.nativeLayerMoveUp(layerId) != 1) break
                currentPosition++
            }
        }
        syncLayers()
        if (redo) redoLayerOrderTokens.remove(token) else redoLayerOrderTokens.add(token)
        val positions = layers.mapIndexed { index, layer -> layer.id to index }.toMap()
        rasterLayerGroups.values.forEach { group -> group.layerIds.sortBy { positions[it] ?: Int.MAX_VALUE } }
        getRenderBitmap()
        return true
    }

    private fun restoreRasterLayerHistory(token: Long, redo: Boolean): Boolean {
        val history = rasterLayerHistory[token] ?: return false
        val idx = history.layerId
        if (layers.none { it.id == idx }) return false
        val state = if (redo) history.after else history.before
        layerNames[idx] = state.name
        layerBaseOpacities[idx] = state.opacity
        layerBaseVisibility[idx] = state.visible
        EsenhoNativeBridge.nativeLayerSetBlendMode(idx, state.blendMode)
        EsenhoNativeBridge.nativeLayerSetAlphaLock(idx, if (state.alphaLock) 1 else 0)
        EsenhoNativeBridge.nativeLayerSetClipping(idx, if (state.clipping) 1 else 0)
        val cel = animationTracks[idx]?.frames?.getOrNull(animationTracks[idx]?.activeCelIndex ?: -1)
        EsenhoNativeBridge.nativeLayerSetOpacity(idx, state.opacity * (cel?.opacity ?: 255) / 255)
        EsenhoNativeBridge.nativeLayerSetVisible(
            idx,
            if (state.visible && isRasterLayerGroupVisible(idx) && (cel?.visible ?: (idx !in animationTracks))) 1 else 0
        )
        syncLayers()
        if (redo) redoRasterLayerTokens.remove(token) else redoRasterLayerTokens.add(token)
        getRenderBitmap()
        return true
    }

    private fun restoreCelTimelineHistory(token: Long, redo: Boolean): Boolean {
        val history = celTimelineHistory[token] ?: return false
        val state = if (redo) history.after else history.before
        history.cel.duration = state.duration
        history.cel.visible = state.visible
        history.cel.opacity = state.opacity
        currentAnimationTick = (if (redo) history.afterTick else history.beforeTick)
            .coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
        applyAnimationTick(currentAnimationTick, captureActive = false)
        if (redo) redoCelTimelineTokens.remove(token) else redoCelTimelineTokens.add(token)
        return true
    }

    private fun restoreAnimationStructureHistory(token: Long, redo: Boolean): Boolean {
        val history = animationStructureHistory[token] ?: return false
        if (animationTracks[history.track.layerId] !== history.track) return false
        val target = if (redo) history.after else history.before
        history.track.frames.clear()
        history.track.frames.addAll(target)
        currentAnimationTick = (if (redo) history.afterTick else history.beforeTick)
            .coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
        applyAnimationTick(currentAnimationTick, captureActive = false)
        if (redo) redoAnimationStructureTokens.remove(token) else redoAnimationStructureTokens.add(token)
        return true
    }

    private fun restoreLayerMergeUndoSlot(history: LayerMergeHistory): Boolean {
        if (layers.any { it.id == history.sourceLayerId }) return true
        val restored = EsenhoNativeBridge.nativeLayerRestoreSlot(
            history.sourceLayerId,
            history.sourceWidth,
            history.sourceHeight,
            1,
            history.sourceOrderPosition
        )
        if (restored != history.sourceLayerId) return false

        layerNames[history.sourceLayerId] = history.sourceLayerState.name
        layerBaseOpacities[history.sourceLayerId] = history.sourceLayerState.opacity
        layerBaseVisibility[history.sourceLayerId] = history.sourceLayerState.visible
        EsenhoNativeBridge.nativeLayerSetOpacity(history.sourceLayerId, history.sourceLayerState.opacity)
        EsenhoNativeBridge.nativeLayerSetVisible(
            history.sourceLayerId,
            if (history.sourceLayerState.visible) 1 else 0
        )
        EsenhoNativeBridge.nativeLayerSetBlendMode(history.sourceLayerId, history.sourceLayerState.blendMode)
        EsenhoNativeBridge.nativeLayerSetAlphaLock(
            history.sourceLayerId,
            if (history.sourceLayerState.alphaLock) 1 else 0
        )
        EsenhoNativeBridge.nativeLayerSetClipping(
            history.sourceLayerId,
            if (history.sourceLayerState.clipping) 1 else 0
        )
        animationTracks[history.sourceLayerId] = history.sourceTrack
        animationTracks[history.destinationLayerId] = history.destinationTrackBefore
        restoreGroupLayerMemberships(history.groupLayerIdsBefore)
        syncLayers()
        return true
    }

    private fun restoreLayerDeleteUndoSlot(history: LayerDeleteHistory): Boolean {
        if (layers.any { it.id == history.layerId }) return true
        val restored = EsenhoNativeBridge.nativeLayerRestoreSlot(
            history.layerId,
            history.width,
            history.height,
            1,
            history.orderPosition
        )
        if (restored != history.layerId) return false
        val state = history.layerState
        layerNames[history.layerId] = state.name
        layerBaseOpacities[history.layerId] = state.opacity
        layerBaseVisibility[history.layerId] = state.visible
        EsenhoNativeBridge.nativeLayerSetOpacity(history.layerId, state.opacity)
        EsenhoNativeBridge.nativeLayerSetVisible(history.layerId, if (state.visible) 1 else 0)
        EsenhoNativeBridge.nativeLayerSetBlendMode(history.layerId, state.blendMode)
        EsenhoNativeBridge.nativeLayerSetAlphaLock(history.layerId, if (state.alphaLock) 1 else 0)
        EsenhoNativeBridge.nativeLayerSetClipping(history.layerId, if (state.clipping) 1 else 0)
        animationTracks[history.layerId] = history.track
        restoreGroupLayerMemberships(history.groupLayerIdsBefore)
        syncLayers()
        return true
    }

    private fun restoreLayerAddRedoSlot(history: LayerAddHistory): Boolean {
        if (layers.any { it.id == history.layerId }) return true
        val restored = EsenhoNativeBridge.nativeLayerRestoreSlot(
            history.layerId,
            history.width,
            history.height,
            1,
            history.orderPosition
        )
        if (restored != history.layerId) return false
        val state = history.layerState
        layerNames[history.layerId] = state.name
        layerBaseOpacities[history.layerId] = state.opacity
        layerBaseVisibility[history.layerId] = state.visible
        EsenhoNativeBridge.nativeLayerSetOpacity(history.layerId, state.opacity)
        EsenhoNativeBridge.nativeLayerSetVisible(history.layerId, if (state.visible) 1 else 0)
        EsenhoNativeBridge.nativeLayerSetBlendMode(history.layerId, state.blendMode)
        EsenhoNativeBridge.nativeLayerSetAlphaLock(history.layerId, if (state.alphaLock) 1 else 0)
        EsenhoNativeBridge.nativeLayerSetClipping(history.layerId, if (state.clipping) 1 else 0)
        animationTracks[history.layerId] = history.track
        restoreGroupLayerMemberships(history.groupLayerIdsAfter)
        syncLayers()
        return true
    }

    private fun restoreGroupLayerMemberships(memberships: Map<String, List<Int>>) {
        rasterLayerGroups.forEach { (id, group) ->
            group.layerIds.clear()
            group.layerIds.addAll(memberships[id].orEmpty())
        }
    }

    private fun restoreLayerMergeHistory(token: Long, redo: Boolean): Boolean {
        val history = layerMergeHistory[token] ?: return false
        if (redo) {
            if (layers.none { it.id == history.sourceLayerId }) return false
            EsenhoNativeBridge.nativeLayerSelect(history.destinationLayerId)
            EsenhoNativeBridge.nativeLayerDelete(history.sourceLayerId)
            animationTracks.remove(history.sourceLayerId)
            animationTracks[history.destinationLayerId] = history.destinationTrackAfter
            restoreGroupLayerMemberships(history.groupLayerIdsAfter)
            activeLayerIndex = history.destinationLayerId
            syncLayers()
            currentAnimationTick = history.tickAfter.coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
            applyAnimationTick(currentAnimationTick, captureActive = false)
            redoLayerMergeTokens.remove(token)
        } else {
            if (!restoreLayerMergeUndoSlot(history)) return false
            val desiredActive = history.activeLayerBefore
                .takeIf { layerId -> layers.any { it.id == layerId } }
                ?: history.sourceLayerId
            EsenhoNativeBridge.nativeLayerSelect(desiredActive)
            activeLayerIndex = desiredActive
            syncLayers()
            currentAnimationTick = history.tickBefore.coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
            applyAnimationTick(currentAnimationTick, captureActive = false)
            redoLayerMergeTokens.add(token)
        }
        return true
    }

    private fun restoreLayerDeleteHistory(token: Long, redo: Boolean): Boolean {
        val history = layerDeleteHistory[token] ?: return false
        if (redo) {
            if (layers.none { it.id == history.layerId }) return false
            EsenhoNativeBridge.nativeLayerDelete(history.layerId)
            animationTracks.remove(history.layerId)
            restoreGroupLayerMemberships(history.groupLayerIdsAfter)
            val desiredActive = history.activeLayerAfter
                .takeIf { layerId -> layers.any { it.id == layerId } && layerId != history.layerId }
                ?: EsenhoNativeBridge.nativeLayerGetActive()
            EsenhoNativeBridge.nativeLayerSelect(desiredActive)
            activeLayerIndex = desiredActive
            syncLayers()
            currentAnimationTick = history.tickAfter.coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
            applyAnimationTick(currentAnimationTick, captureActive = false)
            redoLayerDeleteTokens.remove(token)
        } else {
            if (!restoreLayerDeleteUndoSlot(history)) return false
            val desiredActive = history.activeLayerBefore
                .takeIf { layerId -> layers.any { it.id == layerId } }
                ?: history.layerId
            EsenhoNativeBridge.nativeLayerSelect(desiredActive)
            activeLayerIndex = desiredActive
            syncLayers()
            currentAnimationTick = history.tickBefore.coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
            applyAnimationTick(currentAnimationTick, captureActive = false)
            redoLayerDeleteTokens.add(token)
        }
        return true
    }

    private fun restoreLayerAddHistory(token: Long, redo: Boolean): Boolean {
        val history = layerAddHistory[token] ?: return false
        if (redo) {
            if (!restoreLayerAddRedoSlot(history)) return false
            val desiredActive = history.activeLayerAfter
                .takeIf { layerId -> layers.any { it.id == layerId } }
                ?: history.layerId
            EsenhoNativeBridge.nativeLayerSelect(desiredActive)
            activeLayerIndex = desiredActive
            syncLayers()
            currentAnimationTick = history.tickAfter.coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
            applyAnimationTick(currentAnimationTick, captureActive = false)
            redoLayerAddTokens.remove(token)
        } else {
            if (layers.none { it.id == history.layerId }) return false
            EsenhoNativeBridge.nativeLayerDelete(history.layerId)
            animationTracks.remove(history.layerId)
            restoreGroupLayerMemberships(history.groupLayerIdsBefore)
            syncLayers()
            val desiredActive = history.activeLayerBefore
                .takeIf { layerId -> layers.any { it.id == layerId } }
                ?: EsenhoNativeBridge.nativeLayerGetActive()
            EsenhoNativeBridge.nativeLayerSelect(desiredActive)
            activeLayerIndex = desiredActive
            syncLayers()
            currentAnimationTick = history.tickBefore.coerceIn(0, (totalAnimationTicks() - 1).coerceAtLeast(0))
            applyAnimationTick(currentAnimationTick, captureActive = false)
            redoLayerAddTokens.add(token)
        }
        return true
    }

    fun cancelActiveStroke() {
        endCurveStroke()
        strokeUsageHistory.cancel()
        val hadActiveStroke = isStrokeActive
        isStrokeActive = false
        // Cancellation pops the latest native undo snapshot. Marquee and
        // selection-brush gestures have no snapshot, so they must not consume
        // an unrelated preceding edit.
        if (hadActiveStroke && activeStrokeUndoToken != 0L) EsenhoNativeBridge.nativeCancelStroke()
        activeStrokeUndoToken = 0L
        if (selectionBrushScratchLayer >= 0) {
            EsenhoNativeBridge.nativeLayerClear(selectionBrushScratchLayer)
            if (selectionBrushRestoreLayer >= 0) EsenhoNativeBridge.nativeLayerSelect(selectionBrushRestoreLayer)
            restoreSelectionBrushOriginal()
            clearSelectionBrushState()
            lassoPoints.clear()
            updateSelectionInfo()
        }
        getRenderBitmap()
    }

    fun undo(): Boolean {
        if (transformState != null) {
            cancelTransform()
            return true
        }
        val pendingToken = EsenhoNativeBridge.nativePeekUndoToken()
        val pendingMerge = layerMergeHistory[pendingToken]
        if (pendingMerge != null && pendingToken !in redoLayerMergeTokens &&
            !restoreLayerMergeUndoSlot(pendingMerge)) return false
        val pendingDelete = layerDeleteHistory[pendingToken]
        if (pendingDelete != null && pendingToken !in redoLayerDeleteTokens &&
            !restoreLayerDeleteUndoSlot(pendingDelete)) return false
        val token = EsenhoNativeBridge.nativeUndo()
        if (token != 0L) {
            if (!restoreGroupEdit(token, redo = false) && !restoreLayerMergeHistory(token, redo = false) &&
                !restoreLayerDeleteHistory(token, redo = false) &&
                !restoreLayerAddHistory(token, redo = false) &&
                !restoreLayerResizeHistory(token, redo = false) &&
                !restoreLayerOrderHistory(token, redo = false) &&
                !restoreRasterLayerHistory(token, redo = false) &&
                !restoreCelTimelineHistory(token, redo = false) &&
                !restoreAnimationStructureHistory(token, redo = false)) captureCurrentFrame()
            getRenderBitmap()
        }
        return token != 0L
    }

    fun redo(): Boolean {
        if (transformState != null) return false
        val pendingToken = EsenhoNativeBridge.nativePeekRedoToken()
        val pendingMerge = layerMergeHistory[pendingToken]
        if (pendingMerge != null && pendingToken in redoLayerMergeTokens) {
            if (layers.none { it.id == pendingMerge.sourceLayerId }) return false
            EsenhoNativeBridge.nativeLayerSelect(pendingMerge.sourceLayerId)
        }
        val pendingDelete = layerDeleteHistory[pendingToken]
        if (pendingDelete != null && pendingToken in redoLayerDeleteTokens) {
            if (layers.none { it.id == pendingDelete.layerId }) return false
            EsenhoNativeBridge.nativeLayerSelect(pendingDelete.layerId)
        }
        val pendingAdd = layerAddHistory[pendingToken]
        if (pendingAdd != null && pendingToken in redoLayerAddTokens &&
            !restoreLayerAddRedoSlot(pendingAdd)) return false
        val token = EsenhoNativeBridge.nativeRedo()
        if (token != 0L) {
            if (!restoreGroupEdit(token, redo = true) && !restoreLayerMergeHistory(token, redo = true) &&
                !restoreLayerDeleteHistory(token, redo = true) &&
                !restoreLayerAddHistory(token, redo = true) &&
                !restoreLayerResizeHistory(token, redo = true) &&
                !restoreLayerOrderHistory(token, redo = true) &&
                !restoreRasterLayerHistory(token, redo = true) &&
                !restoreCelTimelineHistory(token, redo = true) &&
                !restoreAnimationStructureHistory(token, redo = true)) captureCurrentFrame()
            getRenderBitmap()
        }
        return token != 0L
    }

    fun clearCanvas() {
        if (transformState != null) cancelTransform()
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        if (activeLayerIndex <= 3) {
            EsenhoNativeBridge.nativeDrawRect(0, 0, width, height, toNativeColor(Color.WHITE))
        }
        captureCurrentFrame()
        getRenderBitmap()
    }

    fun render(targetBitmap: Bitmap): Boolean {
        return EsenhoNativeBridge.nativeRenderToBitmap(targetBitmap)
    }

    fun getRenderBitmap(): Bitmap? {
        renderBitmap?.let { bmp ->
            EsenhoNativeBridge.nativeRenderDisplayBitmap(bmp)
        }
        return renderBitmap
    }

    // ── Floating Transform Tool (M4 / R1) ──

    var transformState: TransformState? = null
    var transformInterpolation: TransformState.Interpolation = TransformState.Interpolation.NEAREST
    var transformLockAspect: Boolean = rasterUiPreferences.getBoolean("transform_lock_aspect", false)
        set(value) {
            field = value
            rasterUiPreferences.edit().putBoolean("transform_lock_aspect", value).apply()
        }
    var transformModePreference: TransformState.Mode = TransformState.Mode.values().firstOrNull {
        it.name == rasterUiPreferences.getString("transform_mode", TransformState.Mode.SCALE.name)
    } ?: TransformState.Mode.SCALE
        set(value) {
            field = value
            rasterUiPreferences.edit().putString("transform_mode", value.name).apply()
        }

    fun beginTransform(selectionOnly: Boolean = false): Boolean {
        if (width <= 0 || height <= 0 || transformState != null) return false

        val fullLayerBackup = try {
            Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        } catch (_: OutOfMemoryError) {
            return false
        }
        if (!EsenhoNativeBridge.nativeLayerGetBitmap(activeLayerIndex, fullLayerBackup)) {
            fullLayerBackup.recycle()
            return false
        }

        val isSel = selectionOnly || selectionActive
        if (isSel && selectionActive) {
            val info = IntArray(6)
            if (EsenhoNativeBridge.nativeSelectGetInfo(info) && info[0] == 1) {
                val sx = info[1].coerceIn(0, width - 1)
                val sy = info[2].coerceIn(0, height - 1)
                val sw = info[3].coerceIn(1, width - sx)
                val sh = info[4].coerceIn(1, height - sy)
                val hasMask = info[5] == 1
                var originalMask: ByteArray? = null

                val sourceBmp = try {
                    val cropped = Bitmap.createBitmap(fullLayerBackup, sx, sy, sw, sh)
                    try {
                        cropped.copy(Bitmap.Config.ARGB_8888, true)
                            ?: throw OutOfMemoryError("Could not copy selection transform source")
                    } finally {
                        // createBitmap may return the input itself when the
                        // selection covers the complete layer.
                        if (cropped !== fullLayerBackup) cropped.recycle()
                    }
                } catch (_: OutOfMemoryError) {
                    fullLayerBackup.recycle()
                    return false
                }

                if (hasMask) {
                    try {
                        val maskBytes = ByteArray(sw * sh)
                        if (!EsenhoNativeBridge.nativeSelectGetMask(maskBytes)) {
                            // Do not degrade a masked selection to its bounding
                            // rectangle: that would transform unselected pixels.
                            sourceBmp.recycle()
                            fullLayerBackup.recycle()
                            return false
                        }
                        originalMask = maskBytes
                        val pixels = IntArray(sw * sh)
                        sourceBmp.getPixels(pixels, 0, sw, 0, 0, sw, sh)
                        for (index in pixels.indices) {
                            val maskValue = maskBytes[index].toInt() and 0xFF
                            // The native mask is binary (0/1); accept 0..255 too.
                            val maskAlpha = if (maskValue <= 1) maskValue * 255 else maskValue
                            val pixel = pixels[index]
                            val alpha = ((pixel ushr 24) * maskAlpha) / 255
                            pixels[index] = (alpha shl 24) or (pixel and 0x00FFFFFF)
                        }
                        sourceBmp.setPixels(pixels, 0, sw, 0, 0, sw, sh)
                    } catch (_: OutOfMemoryError) {
                        sourceBmp.recycle()
                        fullLayerBackup.recycle()
                        return false
                    }
                }

                val undoToken = pushUndoSnapshot()
                if (undoToken == 0L) {
                    sourceBmp.recycle()
                    fullLayerBackup.recycle()
                    return false
                }
                if (EsenhoNativeBridge.nativeLayerResize(activeLayerIndex, width, height, 0) != 0) {
                    if (EsenhoNativeBridge.nativePeekUndoToken() == undoToken) EsenhoNativeBridge.nativeCancelStroke()
                    sourceBmp.recycle()
                    fullLayerBackup.recycle()
                    return false
                }
                transformUndoToken = undoToken
                transformSelectionBackup = TransformSelectionBackup(
                    android.graphics.Rect(sx, sy, sx + sw, sy + sh), originalMask
                )
                EsenhoNativeBridge.nativeClearSelectedPixels()

                transformState?.release()
                transformState = TransformState(
                    sourceBitmap = sourceBmp,
                    initialBounds = RectF(sx.toFloat(), sy.toFloat(), (sx + sw).toFloat(), (sy + sh).toFloat()),
                    isSelectionOnly = true,
                    originalLayerBackup = fullLayerBackup
                ).also {
                    it.mode = transformModePreference
                    it.interpolation = transformInterpolation
                }
                clearSelection()
                currentTool = ToolMode.TRANSFORM
                getRenderBitmap()
                return true
            }
        }

        // Whole active layer transform. Prepare the source before mutating the
        // layer so allocation failure can leave the document untouched.
        var minX = width
        var minY = height
        var maxX = 0
        var maxY = 0
        val rowPixels = try {
            IntArray(width)
        } catch (_: OutOfMemoryError) {
            fullLayerBackup.recycle()
            return false
        }
        for (y in 0 until height) {
            fullLayerBackup.getPixels(rowPixels, 0, width, 0, y, width, 1)
            for (x in 0 until width) {
                if ((rowPixels[x] ushr 24) > 0) {
                    if (x < minX) minX = x
                    if (x > maxX) maxX = x
                    if (y < minY) minY = y
                    if (y > maxY) maxY = y
                }
            }
        }

        val initialBounds: RectF
        val sourceBmp: Bitmap
        if (minX <= maxX && minY <= maxY) {
            val bw = (maxX - minX + 1).coerceAtLeast(1)
            val bh = (maxY - minY + 1).coerceAtLeast(1)
            initialBounds = RectF(minX.toFloat(), minY.toFloat(), (maxX + 1).toFloat(), (maxY + 1).toFloat())
            sourceBmp = try {
                val cropped = Bitmap.createBitmap(fullLayerBackup, minX, minY, bw, bh)
                try {
                    cropped.copy(Bitmap.Config.ARGB_8888, true) ?: throw OutOfMemoryError("Could not copy transform source")
                } finally {
                    cropped.recycle()
                }
            } catch (_: OutOfMemoryError) {
                fullLayerBackup.recycle()
                return false
            }
        } else {
            initialBounds = RectF(0f, 0f, width.toFloat(), height.toFloat())
            sourceBmp = try {
                fullLayerBackup.copy(Bitmap.Config.ARGB_8888, true)
                    ?: throw OutOfMemoryError("Could not copy transform source")
            } catch (_: OutOfMemoryError) {
                fullLayerBackup.recycle()
                return false
            }
        }

        val undoToken = pushUndoSnapshot()
        if (undoToken == 0L) {
            sourceBmp.recycle()
            fullLayerBackup.recycle()
            return false
        }
        if (EsenhoNativeBridge.nativeLayerResize(activeLayerIndex, width, height, 0) != 0) {
            if (EsenhoNativeBridge.nativePeekUndoToken() == undoToken) EsenhoNativeBridge.nativeCancelStroke()
            sourceBmp.recycle()
            fullLayerBackup.recycle()
            return false
        }
        transformUndoToken = undoToken
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        transformState?.release()
        transformState = TransformState(
            sourceBitmap = sourceBmp,
            initialBounds = initialBounds,
            isSelectionOnly = false,
            originalLayerBackup = fullLayerBackup
        ).also {
            it.mode = transformModePreference
            it.interpolation = transformInterpolation
        }
        transformSelectionBackup = null
        clearSelection()
        currentTool = ToolMode.TRANSFORM
        getRenderBitmap()
        return true
    }

    fun commitTransform() {
        val state = transformState ?: run {
            currentTool = ToolMode.BRUSH
            return
        }

        val resultBmp = try {
            Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        } catch (_: OutOfMemoryError) {
            cancelTransform()
            return
        }
        try {
            val canvas = Canvas(resultBmp)

            if (state.isSelectionOnly) {
                val existingLayerBmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                EsenhoNativeBridge.nativeLayerGetBitmap(activeLayerIndex, existingLayerBmp)
                canvas.drawBitmap(existingLayerBmp, 0f, 0f, null)
                existingLayerBmp.recycle()
            }

            state.drawTransformedBitmapExact(canvas)

            // Transformed content can extend beyond a previously resized cel.
            // Expand the backing layer to the document bounds before writing it.
            EsenhoNativeBridge.nativeLayerResize(activeLayerIndex, width, height, 0)
            EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
            EsenhoNativeBridge.nativeLayerDrawBitmap(activeLayerIndex, resultBmp, 0, 0, width, height)
            // A transform edits the active animation cel just like a brush
            // stroke; keep its timeline thumbnail and saved pixels in sync.
            captureCurrentFrame()
        } catch (e: Exception) {
            e.printStackTrace()
            state.originalLayerBackup?.takeUnless { it.isRecycled }?.let { backup ->
                EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
                EsenhoNativeBridge.nativeLayerDrawBitmap(activeLayerIndex, backup, 0, 0, width, height)
                captureCurrentFrame()
            }
        } catch (e: OutOfMemoryError) {
            e.printStackTrace()
            state.originalLayerBackup?.takeUnless { it.isRecycled }?.let { backup ->
                EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
                EsenhoNativeBridge.nativeLayerDrawBitmap(activeLayerIndex, backup, 0, 0, width, height)
                captureCurrentFrame()
            }
        } finally {
            resultBmp.takeUnless { it.isRecycled }?.recycle()
            transformSelectionBackup = null
            transformUndoToken = 0L
            state.release()
            transformState = null
            currentTool = ToolMode.BRUSH
            getRenderBitmap()
        }
    }

    fun cancelTransform() {
        val state = transformState ?: run {
            currentTool = ToolMode.BRUSH
            return
        }

        try {
            // beginTransform reserves one undo snapshot before clearing the
            // layer. Rolling it back also removes that pending history entry.
            if (transformUndoToken != 0L && EsenhoNativeBridge.nativePeekUndoToken() == transformUndoToken) {
                EsenhoNativeBridge.nativeCancelStroke()
            } else {
                state.originalLayerBackup?.takeUnless { it.isRecycled }?.let { backup ->
                    EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
                    EsenhoNativeBridge.nativeLayerDrawBitmap(activeLayerIndex, backup, 0, 0, width, height)
                }
            }
            captureCurrentFrame()
            transformSelectionBackup?.let { selection ->
                val bounds = selection.bounds
                if (selection.mask != null) {
                    EsenhoNativeBridge.nativeSelectApplyMask(
                        selection.mask, bounds.left, bounds.top, bounds.width(), bounds.height(), SelectionOp.REPLACE.id
                    )
                } else {
                    EsenhoNativeBridge.nativeSelectRect(
                        bounds.left, bounds.top, bounds.width(), bounds.height(), SelectionOp.REPLACE.id
                    )
                }
                updateSelectionInfo()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            state.originalLayerBackup?.let { backup ->
                if (!backup.isRecycled) {
                    EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
                    EsenhoNativeBridge.nativeLayerDrawBitmap(activeLayerIndex, backup, 0, 0, width, height)
                    captureCurrentFrame()
                }
            }
        } finally {
            transformSelectionBackup = null
            transformUndoToken = 0L
            state.release()
            transformState = null
            currentTool = ToolMode.BRUSH
            getRenderBitmap()
        }
    }

    fun flipTransformH() {
        transformState?.flipHorizontal()
        getRenderBitmap()
    }

    fun flipTransformV() {
        transformState?.flipVertical()
        getRenderBitmap()
    }

    fun rotateTransform90() {
        transformState?.rotate90()
        getRenderBitmap()
    }

    fun rotateTransformBy(degrees: Float) {
        val state = transformState ?: return
        val center = state.getCenter()
        state.rotate(degrees, center.x, center.y)
        getRenderBitmap()
    }

    fun resetTransform() {
        transformState?.reset()
        getRenderBitmap()
    }

    fun centerTransform() {
        transformState?.centerOnCanvas(width, height)
        getRenderBitmap()
    }

    fun fitTransformToCanvas() {
        transformState?.fitToCanvas(width, height)
        getRenderBitmap()
    }

    val canUndo: Boolean get() = EsenhoNativeBridge.nativeCanUndo()
    val canRedo: Boolean get() = EsenhoNativeBridge.nativeCanRedo()
}
