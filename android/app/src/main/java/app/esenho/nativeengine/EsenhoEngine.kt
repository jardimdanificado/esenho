package app.esenho.nativeengine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import org.json.JSONObject
import java.util.ArrayDeque
import kotlin.math.hypot

enum class ToolMode(val id: Int, val displayName: String) {
    BRUSH(0, "Pincel"),
    ERASER(0, "Borracha"),
    FILL(3, "Preenchimento"),
    LINE(6, "Linha"),
    RECTANGLE(7, "Retângulo"),
    CIRCLE(8, "Círculo"),
    EYEDROPPER(5, "Conta-gotas"),
    PAN(9, "Mover Tela")
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
    val name: String,
    val desc: String,
    val category: String,
    var shape: String = "circle",
    var shapeId: Int = 0,
    var size: Int = 16,
    var opacity: Int = 100,
    var hardness: Int = 100,
    var flow: Int = 100,
    var spacing: Int = 5,
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
    val color: String = ""
)

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
    var bitmap: Bitmap
)

class EsenhoEngine(
    val context: Context,
    var width: Int = 1080,
    var height: Int = 1920
) {

    // Catalogs
    val presetCatalog = mutableListOf<BrushPresetModel>()
    val brushCatalog = mutableListOf<BrushModel>()
    val filterCatalog = mutableListOf<FilterModel>()
    var selectedPreset: BrushPresetModel? = null
        private set
    var selectedBrush: BrushModel? = null
        private set

    val activeBrushDisplayName: String
        get() = selectedPreset?.name ?: selectedBrush?.title ?: "Pincel Clássico"

    // Layer Stack
    val layers = mutableListOf<LayerModel>()
    var activeLayerIndex: Int = 3

    // History / Undo / Redo
    private val undoStack = ArrayDeque<Bitmap>()
    private val redoStack = ArrayDeque<Bitmap>()
    private val maxUndoSteps = 25

    // Animation / Raster Animator
    val animationFrames = mutableListOf<AnimationCel>()
    var currentFrameIndex: Int = 0
    var isAnimationPlaying: Boolean = false
    var animationFps: Int = 12
    var onionSkinEnabled: Boolean = false

    // State
    var currentTool: ToolMode = ToolMode.BRUSH
    var brushSize: Float = 14f
        set(value) {
            field = value.coerceIn(1f, 300f)
            EsenhoNativeBridge.nativeBrushSetSize(field)
            EsenhoNativeBridge.nativeBrushSetParam(1, field.toInt())
        }

    var brushOpacity: Float = 1.0f
        set(value) {
            field = value.coerceIn(0.01f, 1.0f)
            val opInt = (field * 100).toInt()
            EsenhoNativeBridge.nativeBrushSetParam(2, opInt)
            selectedPreset?.let { it.opacity = opInt }
        }

    var brushHardness: Int = 75
        set(value) {
            field = value.coerceIn(0, 100)
            EsenhoNativeBridge.nativeBrushSetParam(3, field)
        }

    var brushSmooth: Int = 30
        set(value) {
            field = value.coerceIn(0, 100)
            EsenhoNativeBridge.nativeBrushSetParam(19, field)
        }

    var currentColor: Int = Color.rgb(24, 24, 24)
        set(value) {
            field = value
            if (!recentColors.contains(value)) {
                recentColors.add(0, value)
                if (recentColors.size > 16) recentColors.removeLast()
            }
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

    private var renderBitmap: Bitmap? = null
    private var isStrokeActive = false
    private var lastX = 0f
    private var lastY = 0f

    init {
        loadCatalogs()
        initEngine(width, height)
    }

    private fun loadCatalogs() {
        try {
            val jsonStr = try {
                val resId = context.resources.getIdentifier("esenho_native_metadata", "raw", context.packageName)
                if (resId != 0) {
                    context.resources.openRawResource(resId).bufferedReader().use { it.readText() }
                } else {
                    context.assets.open("esenho_native_metadata.json").bufferedReader().use { it.readText() }
                }
            } catch (e: Exception) {
                context.assets.open("esenho_native_metadata.json").bufferedReader().use { it.readText() }
            }
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
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun initEngine(w: Int, h: Int) {
        width = w
        height = h
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

        syncLayers()

        // Init initial animation frame
        animationFrames.clear()
        val firstFrame = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        render(firstFrame)
        animationFrames.add(AnimationCel("Frame 1", firstFrame))
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

        // Configure all C Quadro Engine physical params
        EsenhoNativeBridge.nativeBrushSetParam(1, preset.size)
        EsenhoNativeBridge.nativeBrushSetParam(2, preset.opacity)
        EsenhoNativeBridge.nativeBrushSetParam(3, preset.hardness)
        EsenhoNativeBridge.nativeBrushSetParam(4, preset.flow)
        EsenhoNativeBridge.nativeBrushSetParam(5, preset.spacing)
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
        val p = selectedPreset ?: return
        when (paramId) {
            1 -> { p.size = value; brushSize = value.toFloat() }
            2 -> { p.opacity = value; brushOpacity = value / 100f }
            3 -> { p.hardness = value; brushHardness = value }
            4 -> p.flow = value
            5 -> p.spacing = value
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
        currentTool = ToolMode.BRUSH
    }

    fun resetPresetToDefaults() {
        val p = selectedPreset ?: return
        loadCatalogs()
        val original = presetCatalog.find { it.id == p.id } ?: return
        selectPreset(original)
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
        return ok
    }

    // ── Layer Operations ──

    fun syncLayers() {
        layers.clear()
        val count = EsenhoNativeBridge.nativeLayerGetCount()
        activeLayerIndex = EsenhoNativeBridge.nativeLayerGetActive()

        for (pos in 0 until count) {
            val layerIdx = EsenhoNativeBridge.nativeLayerGetOrder(pos)
            val opacity = EsenhoNativeBridge.nativeLayerGetOpacity(layerIdx)
            val visible = EsenhoNativeBridge.nativeLayerGetVisible(layerIdx) == 1
            val blendModeInt = EsenhoNativeBridge.nativeLayerGetBlendMode(layerIdx)
            val blendMode = LayerBlendMode.values().find { it.id == blendModeInt } ?: LayerBlendMode.NORMAL
            val alphaLock = EsenhoNativeBridge.nativeLayerGetAlphaLock(layerIdx) == 1
            val clipping = EsenhoNativeBridge.nativeLayerGetClipping(layerIdx) == 1

            val name = if (layerIdx <= 2) "Plano de Fundo" else "Camada ${layerIdx - 2}"
            layers.add(LayerModel(layerIdx, name, opacity, visible, blendMode, alphaLock, clipping))
        }
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
        EsenhoNativeBridge.nativeLayerSelect(idx)
        activeLayerIndex = idx
    }

    fun deleteLayer(idx: Int) {
        if (layers.size <= 1) return
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerDelete(idx)
        syncLayers()
    }

    fun setLayerOpacity(idx: Int, opacity: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerSetOpacity(idx, opacity.coerceIn(0, 255))
        syncLayers()
    }

    fun setLayerVisible(idx: Int, visible: Boolean) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerSetVisible(idx, if (visible) 1 else 0)
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

    fun mergeDown(idx: Int) {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerMergeDown(idx)
        syncLayers()
    }

    fun clearActiveLayer() {
        pushUndoSnapshot()
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
    }

    // ── Animation Frame-by-Frame (Raster Animator) ──

    fun captureCurrentFrame() {
        if (currentFrameIndex in animationFrames.indices) {
            val bmp = animationFrames[currentFrameIndex].bitmap
            render(bmp)
        }
    }

    fun restoreFrame(index: Int) {
        if (index !in animationFrames.indices) return
        captureCurrentFrame()
        currentFrameIndex = index
        val bmp = animationFrames[index].bitmap
        // Clear active layer and draw frame bitmap
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        // Draw bitmap into canvas
        renderBitmap?.let { compBmp ->
            val canvas = android.graphics.Canvas(compBmp)
            canvas.drawBitmap(bmp, 0f, 0f, null)
        }
    }

    fun addAnimationFrame(): Int {
        captureCurrentFrame()
        val newBmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val newIndex = currentFrameIndex + 1
        val cel = AnimationCel("Frame ${animationFrames.size + 1}", newBmp)
        animationFrames.add(newIndex, cel)
        // Clear active layer for new blank drawing
        EsenhoNativeBridge.nativeLayerClear(activeLayerIndex)
        currentFrameIndex = newIndex
        return newIndex
    }

    fun duplicateAnimationFrame(): Int {
        captureCurrentFrame()
        val currBmp = animationFrames[currentFrameIndex].bitmap
        val copyBmp = currBmp.copy(Bitmap.Config.ARGB_8888, true)
        val newIndex = currentFrameIndex + 1
        val cel = AnimationCel("Frame ${animationFrames.size + 1}", copyBmp)
        animationFrames.add(newIndex, cel)
        currentFrameIndex = newIndex
        return newIndex
    }

    fun deleteAnimationFrame() {
        if (animationFrames.size <= 1) return
        animationFrames.removeAt(currentFrameIndex)
        currentFrameIndex = currentFrameIndex.coerceIn(0, animationFrames.size - 1)
        restoreFrame(currentFrameIndex)
    }

    fun getOnionSkinPrevBitmap(): Bitmap? {
        if (!onionSkinEnabled || currentFrameIndex <= 0) return null
        return animationFrames[currentFrameIndex - 1].bitmap
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

        pushUndoSnapshot()
        isStrokeActive = true
        lastX = x
        lastY = y

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0.01f, 1f) * 1000).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                EsenhoNativeBridge.nativeBrushSetType(0) // Draw mode
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            ToolMode.FILL -> {
                EsenhoNativeBridge.nativeBrushSetType(3) // W_MODE_FILL
                EsenhoNativeBridge.nativeStrokeExt(0, x, y, x, y, nativeCol, 0, 1000, 0, 0)
                isStrokeActive = false
            }
            else -> {}
        }
    }

    fun onTouchMove(x: Float, y: Float, pressure: Float = 0.85f, tiltX: Int = 0, tiltY: Int = 0) {
        if (!isStrokeActive) return

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0.01f, 1f) * 1000).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                EsenhoNativeBridge.nativeStrokeExt(1, lastX, lastY, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
                lastX = x
                lastY = y
            }
            else -> {}
        }
    }

    fun onTouchUp(x: Float, y: Float, pressure: Float = 0f, tiltX: Int = 0, tiltY: Int = 0) {
        if (!isStrokeActive) return
        isStrokeActive = false

        val isEraser = if (currentTool == ToolMode.ERASER) 1 else 0
        val nativeCol = toNativeColor(currentColor)
        val pInt = (pressure.coerceIn(0.01f, 1f) * 1000).toInt()

        when (currentTool) {
            ToolMode.BRUSH, ToolMode.ERASER -> {
                EsenhoNativeBridge.nativeStrokeExt(2, lastX, lastY, x, y, nativeCol, isEraser, pInt, tiltX, tiltY)
            }
            ToolMode.LINE -> {
                EsenhoNativeBridge.nativeDrawLine(lastX.toInt(), lastY.toInt(), x.toInt(), y.toInt(), nativeCol)
            }
            ToolMode.RECTANGLE -> {
                val rx = Math.min(lastX, x).toInt()
                val ry = Math.min(lastY, y).toInt()
                val rw = Math.abs(x - lastX).toInt()
                val rh = Math.abs(y - lastY).toInt()
                EsenhoNativeBridge.nativeDrawRect(rx, ry, rw, rh, nativeCol)
            }
            ToolMode.CIRCLE -> {
                val cx = ((lastX + x) / 2f).toInt()
                val cy = ((lastY + y) / 2f).toInt()
                val dx = x - lastX
                val dy = y - lastY
                val r = (hypot(dx.toDouble(), dy.toDouble()) / 2.0).toInt()
                EsenhoNativeBridge.nativeDrawCircle(cx, cy, r, nativeCol)
            }
            else -> {}
        }
    }

    private fun pushUndoSnapshot() {
        EsenhoNativeBridge.nativePushUndo()
    }

    fun cancelActiveStroke() {
        isStrokeActive = false
        EsenhoNativeBridge.nativeCancelStroke()
        getRenderBitmap()
    }

    fun undo(): Boolean {
        val ok = EsenhoNativeBridge.nativeUndo()
        if (ok) {
            getRenderBitmap()
        }
        return ok
    }

    fun redo(): Boolean {
        val ok = EsenhoNativeBridge.nativeRedo()
        if (ok) {
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

    val canUndo: Boolean get() = EsenhoNativeBridge.nativeCanUndo()
    val canRedo: Boolean get() = EsenhoNativeBridge.nativeCanRedo()
}
