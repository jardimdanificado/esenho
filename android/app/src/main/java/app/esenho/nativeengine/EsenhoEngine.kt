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
    var color: String = ""
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
                color = obj.optString("color", "")
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
    val params: List<BrushParamModel>
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
    private val maxUndoSteps = 25

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
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            EsenhoNativeBridge.nativeLayerGetBitmap(activeLayerIndex, bitmap)
            AnimationTrack(activeLayerIndex, mutableListOf(AnimationCel("Frame 1", bitmap))).also {
                animationTracks[activeLayerIndex] = it
            }
        }
    }

    fun syncAnimationTracks() {
        val drawingLayerIds = layers.map { it.id }.filter { it >= 3 }.toSet()
        drawingLayerIds.forEach { layerId ->
            if (layerId !in animationTracks) {
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                EsenhoNativeBridge.nativeLayerGetBitmap(layerId, bitmap)
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

    fun applyAnimationTick(tick: Int, captureActive: Boolean = true) {
        if (captureActive) captureCurrentFrame()
        currentAnimationTick = tick.coerceIn(0, totalAnimationTicks() - 1)
        animationTracks.values.forEach { track ->
            var remaining = currentAnimationTick
            var frameIndex = 0
            while (frameIndex < track.frames.lastIndex && remaining >= track.frames[frameIndex].duration.coerceAtLeast(1)) {
                remaining -= track.frames[frameIndex].duration.coerceAtLeast(1)
                frameIndex++
            }
            track.activeCelIndex = frameIndex
            track.frames.getOrNull(frameIndex)?.let { cel ->
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
        getRenderBitmap()
    }

    // State
    var currentTool: ToolMode = ToolMode.BRUSH
    var brushSize: Float = 14f
        set(value) {
            field = value.coerceIn(1f, 300f)
            liveBrushSliderParams[1] = field.toInt()
            EsenhoNativeBridge.nativeBrushSetSize(field)
            EsenhoNativeBridge.nativeBrushSetParam(1, field.toInt())
        }

    var brushOpacity: Float = 1.0f
        set(value) {
            field = value.coerceIn(0.01f, 1.0f)
            val opInt = (field * 100).toInt()
            liveBrushSliderParams[2] = opInt
            EsenhoNativeBridge.nativeBrushSetParam(2, opInt)
            selectedPreset?.let { it.opacity = opInt }
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
            EsenhoNativeBridge.nativeBrushSetParam(19, field)
        }

    // Storage & Custom Palettes
    val storageManager by lazy { EsenhoStorageManager(context) }
    val palettes = mutableListOf<ColorPaletteModel>()
    var activePaletteId: String = "classic"

    fun getActivePalette(): ColorPaletteModel? {
        return palettes.find { it.id == activePaletteId } ?: palettes.firstOrNull()
    }

    var currentColor: Int = Color.rgb(24, 24, 24)
        set(value) {
            field = value
            if (!recentColors.contains(value)) {
                recentColors.add(0, value)
                if (recentColors.size > 16) recentColors.removeLast()
                try {
                    storageManager.saveRecentColors(recentColors)
                } catch (_: Exception) {}
            }
            try {
                storageManager.saveSessionState(selectedPreset?.id, activePaletteId, value)
            } catch (_: Exception) {}
        }

    val recentColors = mutableListOf<Int>().apply {
        addAll(listOf(
            Color.rgb(20, 20, 20),
            Color.WHITE,
            Color.rgb(230, 57, 70),
            Color.rgb(244, 162, 97),
            Color.rgb(233, 196, 106),
            Color.rgb(42, 157, 143),
            Color.rgb(38, 70, 83),
            Color.rgb(69, 123, 157)
        ))
    }

    var symmetryMode: SymmetryMode = SymmetryMode.OFF
        set(value) {
            field = value
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
    private var selectionClipboard: Bitmap? = null
    val hasSelectionClipboard: Boolean
        get() = selectionClipboard?.isRecycled == false

    var pixelArtGrid: Boolean = false
    // The pixel art overlay follows the actual document pixel boundaries.
    var pixelArtGridStep: Int = 1

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

            // 1. Curated Presets (from src/presets_data.js)
            val presetsArr = root.optJSONArray("presets")
            presetCatalog.clear()
            if (presetsArr != null) {
                for (i in 0 until presetsArr.length()) {
                    val p = presetsArr.getJSONObject(i)
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
                            color = p.optString("color", "")
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
                    brushCatalog.add(BrushModel(id, title, category, spacing, minR, maxR, paramsList))
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
        EsenhoNativeBridge.nativeSelectClear()
        selectionActive = false
        selectionBounds = null
        selectionHasMask = false
        selectionPath = null
        transformSelectionBackup = null
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
        rasterGroupOrder.clear()
        nextRasterGroupId = 1
        currentAnimationTick = 0
        EsenhoNativeBridge.nativeInit(width, height)
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

    // ── Brush Preset & Procedural Selection & Tuning ──

    fun selectPreset(preset: BrushPresetModel) {
        selectedPreset = preset
        selectedBrush = null
        EsenhoNativeBridge.nativeBrushReset()
        EsenhoNativeBridge.nativeSelectBrush("classic")

        brushSize = preset.size.toFloat()
        brushOpacity = preset.opacity / 100f
        brushHardness = preset.hardness
        brushSmooth = preset.smoothing

        // Select exact tip shape and grain texture from builtin library
        if (preset.shape.isNotBlank()) {
            val shapeSlot = EsenhoNativeBridge.nativeSelectShape(preset.shape)
            preset.shapeId = shapeSlot
        }
        if (preset.texture.isNotBlank() && preset.texture != "none") {
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

        listOf(3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 17, 19, 20, 21, 27, 28, 29, 30)
            .forEach { liveBrushSliderParams[it] = getPresetParam(it) }

        if (preset.color.isNotBlank()) {
            try {
                if (preset.color.startsWith("#")) {
                    currentColor = Color.parseColor(preset.color)
                }
            } catch (_: Exception) {}
        }

        currentTool = if (preset.eraser == 1) ToolMode.ERASER else ToolMode.BRUSH
    }

    fun setPresetParam(paramId: Int, value: Int) {
        val p = selectedPreset
        liveBrushSliderParams[paramId] = value
        if (p == null) {
            EsenhoNativeBridge.nativeBrushSetParam(paramId, value)
            return
        }
        when (paramId) {
            1 -> { p.size = value; brushSize = value.toFloat() }
            2 -> { p.opacity = value; brushOpacity = value / 100f }
            3 -> { p.hardness = value; brushHardness = value }
            4 -> p.flow = value
            5 -> p.spacing = value
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
        val p = selectedPreset ?: return liveBrushSliderParams[paramId] ?: 0
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
        val p = selectedPreset ?: return
        p.shape = shapeName
        val slot = EsenhoNativeBridge.nativeSelectShape(shapeName)
        p.shapeId = slot
        EsenhoNativeBridge.nativeBrushSetParam(14, slot)
    }

    fun setPresetTexture(textureName: String) {
        val p = selectedPreset ?: return
        p.texture = textureName
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

    fun selectBrush(brush: BrushModel?) {
        selectedBrush = brush
        selectedPreset = null
        EsenhoNativeBridge.nativeBrushReset()
        if (brush == null) {
            EsenhoNativeBridge.nativeSelectBrush("classic")
        } else {
            EsenhoNativeBridge.nativeSelectBrush(brush.id)
            EsenhoNativeBridge.nativeBrushSetSize(brushSize)
            // Apply current values of parameters
            brush.params.forEachIndexed { idx, p ->
                EsenhoNativeBridge.nativeSetBrushParam(idx, p.currentVal)
            }
        }
        liveBrushSliderParams.forEach { (paramId, value) ->
            EsenhoNativeBridge.nativeBrushSetParam(paramId, value)
        }
        currentTool = ToolMode.BRUSH
    }

    fun resetPresetToDefaults() {
        val p = selectedPreset ?: return
        loadCatalogs()
        val original = presetCatalog.find { it.id == p.id } ?: return
        selectPreset(original)
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
            color = String.format("#%06X", 0xFFFFFF and currentColor)
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

    fun deleteCustomPreset(presetId: String): Boolean {
        val p = presetCatalog.find { it.id == presetId } ?: return false
        if (!p.isCustom) return false

        presetCatalog.remove(p)
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
        val b = selectedBrush ?: return
        if (paramIdx in b.params.indices) {
            b.params[paramIdx].currentVal = value
            EsenhoNativeBridge.nativeSetBrushParam(paramIdx, value)
        }
    }

    // ── Filter Application ──

    fun applyFilter(filter: FilterModel, p1: Int = 0, p2: Int = 0): Boolean {
        pushUndoSnapshot()
        val ok = EsenhoNativeBridge.nativeApplyFilter(filter.id, p1, p2)
        if (ok) {
            captureCurrentFrame()
            getRenderBitmap()
        }
        return ok
    }

    // ── Layer Operations ──

    fun syncLayers() {
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
        syncAnimationTracks()
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

    fun moveLayerToRasterGroup(layerId: Int, groupId: String?) {
        rasterLayerGroups.values.forEach { it.layerIds.remove(layerId) }
        if (groupId != null) rasterLayerGroups[groupId]?.let { group ->
            if (layerId in layers.map { it.id }) group.layerIds.add(layerId)
        }
        val celVisible = animationTracks[layerId]?.let { track -> track.frames.getOrNull(track.activeCelIndex)?.visible } ?: true
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
            val celVisible = animationTracks[layerId]?.let { track -> track.frames.getOrNull(track.activeCelIndex)?.visible } ?: true
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
            val celVisible = animationTracks[layerId]?.let { track -> track.frames.getOrNull(track.activeCelIndex)?.visible } ?: true
            EsenhoNativeBridge.nativeLayerSetVisible(layerId, if (layerVisible && celVisible) 1 else 0)
        }
        syncNativeLayerOrderFromRasterGroups()
        getRenderBitmap()
    }

    fun renameLayer(idx: Int, name: String) {
        val normalized = name.trim()
        if (normalized.isEmpty() || layers.none { it.id == idx }) return
        layerNames[idx] = normalized
        layers.firstOrNull { it.id == idx }?.name = normalized
    }

    fun addLayer(): Int {
        pushUndoSnapshot()
        val idx = EsenhoNativeBridge.nativeLayerAdd()
        syncLayers()
        return idx
    }

    fun duplicateLayer(idx: Int): Int {
        pushUndoSnapshot()
        val newIdx = EsenhoNativeBridge.nativeLayerDuplicate(idx)
        syncLayers()
        return newIdx
    }

    fun selectLayer(idx: Int) {
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
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerDelete(idx)
        syncLayers()
    }

    fun setLayerOpacity(idx: Int, opacity: Int, commitUndo: Boolean = false) {
        if (commitUndo) {
            pushUndoSnapshot()
        }
        val baseOpacity = opacity.coerceIn(0, 255)
        layerBaseOpacities[idx] = baseOpacity
        val celOpacity = animationTracks[idx]?.frames?.getOrNull(animationTracks[idx]?.activeCelIndex ?: -1)?.opacity ?: 255
        EsenhoNativeBridge.nativeLayerSetOpacity(idx, baseOpacity * celOpacity / 255)
        syncLayers()
        getRenderBitmap()
    }

    fun setLayerVisible(idx: Int, visible: Boolean) {
        pushUndoSnapshot()
        layerBaseVisibility[idx] = visible
        val celVisible = animationTracks[idx]?.frames?.getOrNull(animationTracks[idx]?.activeCelIndex ?: -1)?.visible ?: true
        EsenhoNativeBridge.nativeLayerSetVisible(
            idx,
            if (visible && isRasterLayerGroupVisible(idx) && celVisible) 1 else 0
        )
        syncLayers()
    }

    fun setLayerBlendMode(idx: Int, mode: LayerBlendMode) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerSetBlendMode(idx, mode.id)
        syncLayers()
    }

    fun setLayerAlphaLock(idx: Int, locked: Boolean) {
        EsenhoNativeBridge.nativeLayerSetAlphaLock(idx, if (locked) 1 else 0)
        syncLayers()
    }

    fun setLayerClipping(idx: Int, clipping: Boolean) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerSetClipping(idx, if (clipping) 1 else 0)
        syncLayers()
    }

    fun moveLayerUp(idx: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerMoveUp(idx)
        syncLayers()
    }

    fun moveLayerDown(idx: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerMoveDown(idx)
        syncLayers()
    }

    fun moveLayerByOrderDelta(idx: Int, delta: Int) {
        if (delta == 0) return
        pushUndoSnapshot()
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
        if (moved) syncLayers()
    }

    fun mergeDown(idx: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerMergeDown(idx)
        syncLayers()
        captureCurrentFrame()
    }

    fun clearActiveLayer() {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        captureCurrentFrame()
    }

    // ── Animation Frame-by-Frame (Raster Animator) ──

    fun captureCurrentFrame(layerId: Int = activeLayerIndex) {
        val track = animationTracks[layerId] ?: return
        if (track.activeCelIndex in track.frames.indices) {
            val cel = track.frames[track.activeCelIndex]
            val bmp = cel.bitmap
            EsenhoNativeBridge.nativeLayerGetBitmap(track.layerId, bmp)
        }
    }

    private fun captureAllCurrentFrames() {
        animationTracks.keys.toList().forEach(::captureCurrentFrame)
    }

    fun restoreFrame(index: Int) {
        val track = animationTracks[activeLayerIndex] ?: return
        if (index !in track.frames.indices) return
        captureCurrentFrame()
        track.activeCelIndex = index
        currentAnimationTick = track.frames.take(index).sumOf { it.duration.coerceAtLeast(1) }
            .coerceAtMost(totalAnimationTicks() - 1)
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun setCurrentFrameDuration(duration: Int) {
        val track = animationTracks[activeLayerIndex] ?: return
        captureCurrentFrame()
        track.frames.getOrNull(track.activeCelIndex)?.duration = duration.coerceAtLeast(1)
        currentAnimationTick = track.frames.take(track.activeCelIndex).sumOf { it.duration.coerceAtLeast(1) }
            .coerceAtMost(totalAnimationTicks() - 1)
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun setCurrentCelVisible(visible: Boolean) {
        val track = animationTracks[activeLayerIndex] ?: return
        captureCurrentFrame()
        track.frames.getOrNull(track.activeCelIndex)?.visible = visible
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun setCurrentCelOpacity(opacity: Int) {
        val track = animationTracks[activeLayerIndex] ?: return
        captureCurrentFrame()
        track.frames.getOrNull(track.activeCelIndex)?.opacity = opacity.coerceIn(0, 255)
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun addAnimationFrame(): Int {
        captureCurrentFrame()
        val newBmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val newIndex = currentFrameIndex + 1
        val currentCel = animationFrames.getOrNull(currentFrameIndex)
        val cel = AnimationCel(
            "Frame ${animationFrames.size + 1}", newBmp,
            visible = currentCel?.visible ?: true,
            opacity = currentCel?.opacity ?: 255
        )
        animationFrames.add(newIndex, cel)
        currentFrameIndex = newIndex
        currentAnimationTick = animationFrames.take(newIndex).sumOf { it.duration.coerceAtLeast(1) }
        applyAnimationTick(currentAnimationTick, captureActive = false)
        return newIndex
    }

    fun duplicateAnimationFrame(): Int {
        captureCurrentFrame()
        val currBmp = animationFrames[currentFrameIndex].bitmap
        val copyBmp = currBmp.copy(Bitmap.Config.ARGB_8888, true)
        val newIndex = currentFrameIndex + 1
        val current = animationFrames[currentFrameIndex]
        val cel = AnimationCel("Frame ${animationFrames.size + 1}", copyBmp, current.duration, current.visible, current.opacity)
        animationFrames.add(newIndex, cel)
        currentFrameIndex = newIndex
        currentAnimationTick = animationFrames.take(newIndex).sumOf { it.duration.coerceAtLeast(1) }
        applyAnimationTick(currentAnimationTick, captureActive = false)
        return newIndex
    }

    fun deleteAnimationFrame() {
        if (animationFrames.size <= 1) return
        captureCurrentFrame()
        animationFrames.removeAt(currentFrameIndex).bitmap.let { if (!it.isRecycled) it.recycle() }
        currentFrameIndex = currentFrameIndex.coerceIn(0, animationFrames.size - 1)
        currentAnimationTick = animationFrames.take(currentFrameIndex).sumOf { it.duration.coerceAtLeast(1) }
            .coerceAtMost(totalAnimationTicks() - 1)
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun moveAnimationFrame(from: Int, to: Int) {
        val frames = animationFrames
        if (from !in frames.indices || to !in frames.indices || from == to) return
        captureCurrentFrame()
        val moved = frames.removeAt(from)
        frames.add(to, moved)
        currentFrameIndex = to
        currentAnimationTick = frames.take(to).sumOf { it.duration.coerceAtLeast(1) }
            .coerceAtMost(totalAnimationTicks() - 1)
        applyAnimationTick(currentAnimationTick, captureActive = false)
    }

    fun clearCurrentAnimationFrame() {
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
        if (track.frames.size <= 1) return emptyList()
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
        if (!onionSkinEnabled || currentFrameIndex >= animationFrames.size - 1) return null
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
        if (currentTool == ToolMode.EYEDROPPER) {
            pickColorAt(x, y)
            return
        }

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
            pushUndoSnapshot()
        }

        isStrokeActive = true
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

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0.01f, 1f) * 1000).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                EsenhoNativeBridge.nativeBrushSetType(0) // Draw mode
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            ToolMode.SMUDGE -> {
                EsenhoNativeBridge.nativeBrushSetType(1) // W_MODE_SMUDGE
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, 0, pInt, tiltX, tiltY)
            }
            ToolMode.BLEND -> {
                EsenhoNativeBridge.nativeBrushSetType(2) // W_MODE_BLEND
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, 0, pInt, tiltX, tiltY)
            }
            ToolMode.FILL -> {
                EsenhoNativeBridge.nativeBrushSetType(3) // W_MODE_FILL
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, 0, 1000, 0, 0)
                isStrokeActive = false
                captureCurrentFrame()
            }
            ToolMode.LASSO_FILL -> {
                lassoPoints.clear()
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
                EsenhoNativeBridge.nativeBrushSetType(4) // W_MODE_LASSO_FILL
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, 0, 1000, 0, 0)
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
                    EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, toNativeColor(Color.WHITE), 0, pInt, tiltX, tiltY)
                    lastX = x
                    lastY = y
                }
            }
            else -> {}
        }

    }

    fun onTouchMove(x: Float, y: Float, pressure: Float = 0.85f, tiltX: Int = 0, tiltY: Int = 0) {
        if (!isStrokeActive) return

        strokeCurrentX = x
        strokeCurrentY = y

        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0.01f, 1f) * 1000).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER, ToolMode.SMUDGE, ToolMode.BLEND -> {
                val p = selectedPreset
                val smooth = p?.smoothing ?: brushSmooth
                val midpoint = p?.midpoint ?: 50

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
                    EsenhoNativeBridge.nativeStrokeExt(1, bx, by, lastSubX, lastSubY, nativeCol, strokeEraser, pInt, tiltX, tiltY)
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
                EsenhoNativeBridge.nativeStrokeExt(1, x, y, lastX, lastY, nativeCol, 0, 1000, 0, 0)
                lastX = x
                lastY = y
            }
            ToolMode.SELECT_LASSO -> {
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
            }
            ToolMode.SELECT_BRUSH_MASK -> {
                lassoPoints.add(Pair(x.roundToInt(), y.roundToInt()))
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
                        EsenhoNativeBridge.nativeStrokeExt(1, bx, by, lastSubX, lastSubY, nativeCol, isEraser, pInt, tiltX, tiltY)
                        lastSubX = bx
                        lastSubY = by
                    }
                }
                EsenhoNativeBridge.nativeStrokeExt(2, finalX, finalY, lastSubX, lastSubY, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            ToolMode.LASSO_FILL -> {
                lassoPoints.add(Pair(x.toInt(), y.toInt()))
                EsenhoNativeBridge.nativeStrokeExt(2, x, y, lastX, lastY, nativeCol, 0, 1000, 0, 0)
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
                    EsenhoNativeBridge.nativeStrokeExt(2, x, y, lastX, lastY, toNativeColor(Color.WHITE), 0, pInt, tiltX, tiltY)
                    finishSelectionBrushStroke()
                } else {
                    selectBrushMask(lassoPoints, max(1, (brushSize / 2f).roundToInt()))
                }
                lassoPoints.clear()
            }
            else -> {}
        }

        // Keep the active cel and its timeline thumbnail in sync with edits as
        // soon as a stroke or raster shape is committed.
        captureCurrentFrame()
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
        pushUndoSnapshot()
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

    private fun pushUndoSnapshot() {
        EsenhoNativeBridge.nativePushUndo()
    }

    fun cancelActiveStroke() {
        val hadActiveStroke = isStrokeActive
        isStrokeActive = false
        // nativeCancelStroke rolls back and pops the latest undo snapshot, so
        // only call it when this engine actually began a stroke. Multi-touch
        // gestures and other idle cancellations must not consume history.
        if (hadActiveStroke) EsenhoNativeBridge.nativeCancelStroke()
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
        val ok = EsenhoNativeBridge.nativeUndo()
        if (ok) {
            captureCurrentFrame()
            getRenderBitmap()
        }
        return ok
    }

    fun redo(): Boolean {
        val ok = EsenhoNativeBridge.nativeRedo()
        if (ok) {
            captureCurrentFrame()
            getRenderBitmap()
        }
        return ok
    }

    fun clearCanvas() {
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
            EsenhoNativeBridge.nativeRenderToBitmap(bmp)
        }
        return renderBitmap
    }

    // ── Floating Transform Tool (M4 / R1) ──

    var transformState: TransformState? = null
    var transformInterpolation: TransformState.Interpolation = TransformState.Interpolation.NEAREST
    var transformModePreference: TransformState.Mode = TransformState.Mode.values().firstOrNull {
        it.name == rasterUiPreferences.getString("transform_mode", TransformState.Mode.SCALE.name)
    } ?: TransformState.Mode.SCALE
        set(value) {
            field = value
            rasterUiPreferences.edit().putString("transform_mode", value.name).apply()
        }

    fun beginTransform(selectionOnly: Boolean = false): Boolean {
        if (width <= 0 || height <= 0) return false

        val fullLayerBackup = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
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

                val selBmp = Bitmap.createBitmap(fullLayerBackup, sx, sy, sw, sh)
                val sourceBmp = selBmp.copy(Bitmap.Config.ARGB_8888, true)
                if (selBmp != sourceBmp) selBmp.recycle()

                if (hasMask) {
                    val maskBytes = ByteArray(sw * sh)
                    if (!EsenhoNativeBridge.nativeSelectGetMask(maskBytes)) {
                        // Do not degrade a masked selection to its bounding
                        // rectangle: that would transform pixels the user did
                        // not select. No history snapshot has been reserved yet.
                        sourceBmp.recycle()
                        fullLayerBackup.recycle()
                        return false
                    }
                    originalMask = maskBytes
                    val pixels = IntArray(sw * sh)
                    sourceBmp.getPixels(pixels, 0, sw, 0, 0, sw, sh)
                    for (y in 0 until sh) {
                        for (x in 0 until sw) {
                            val mVal = maskBytes[y * sw + x].toInt() and 0xFF
                            val p = pixels[y * sw + x]
                            // The native selection mask is binary (0/1);
                            // tolerate 0..255 masks as well if that changes.
                            val maskAlpha = if (mVal <= 1) mVal * 255 else mVal
                            val a = ((p ushr 24) * maskAlpha) / 255
                            pixels[y * sw + x] = (a shl 24) or (p and 0x00FFFFFF)
                        }
                    }
                    sourceBmp.setPixels(pixels, 0, sw, 0, 0, sw, sh)
                }

                transformSelectionBackup = TransformSelectionBackup(
                    android.graphics.Rect(sx, sy, sx + sw, sy + sh), originalMask
                )

                pushUndoSnapshot()
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

        // Whole active layer transform
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)

        var minX = width
        var minY = height
        var maxX = 0
        var maxY = 0
        val rowPixels = IntArray(width)
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
            val cropped = Bitmap.createBitmap(fullLayerBackup, minX, minY, bw, bh)
            sourceBmp = cropped.copy(Bitmap.Config.ARGB_8888, true)
            if (cropped != sourceBmp) cropped.recycle()
        } else {
            initialBounds = RectF(0f, 0f, width.toFloat(), height.toFloat())
            sourceBmp = fullLayerBackup.copy(Bitmap.Config.ARGB_8888, true)
        }

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

        val resultBmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        try {
            val canvas = Canvas(resultBmp)

            if (state.isSelectionOnly) {
                val existingLayerBmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                EsenhoNativeBridge.nativeLayerGetBitmap(activeLayerIndex, existingLayerBmp)
                canvas.drawBitmap(existingLayerBmp, 0f, 0f, null)
                existingLayerBmp.recycle()
            }

            val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
            state.drawTransformedBitmap(canvas, paint)

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
        } finally {
            resultBmp.takeUnless { it.isRecycled }?.recycle()
            transformSelectionBackup = null
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
            EsenhoNativeBridge.nativeCancelStroke()
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
