package app.esenho.scripting

import android.graphics.Color
import android.graphics.Matrix
import app.esenho.nativeengine.*
import app.esenho.ui.EsenhoCanvasView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.*

/** Explicit editor operations. Invoked exclusively on the Android main thread. */
class NativeScriptApi(
    val engine: EsenhoEngine,
    val canvas: EsenhoCanvasView,
    private val refresh: () -> Unit,
    private val chooseTool: (ToolMode) -> Unit,
    private val ui: (String, JSONObject) -> Unit,
) {
    private var strokeMatrix: Matrix? = null
    private var previousTool: ToolMode? = null
    private var ownTransform = false
    private val extended = NativeScriptExtendedApi(engine, canvas)

    private fun JSONObject.number(key: String, default: Double? = null): Float {
        val value = if (has(key)) getDouble(key) else default ?: error("Argumento obrigatório: $key")
        require(value.isFinite() && value.toFloat().isFinite()) { "$key precisa ser finito" }
        return value.toFloat()
    }
    private fun tool(name: String) = ToolMode.values().firstOrNull { it.name.equals(name, true) }
        ?: error("Ferramenta desconhecida: $name")
    private fun JSONObject.layerId(): Int {
        val id = optInt("id", engine.activeLayerIndex)
        require(engine.layers.any { it.id == id }) { "Camada não encontrada: $id" }
        return id
    }
    private fun layer(layer: LayerModel) = JSONObject().put("id", layer.id).put("name", layer.name)
        .put("opacity", layer.opacity / 255.0).put("visible", layer.visible)
        .put("blendMode", layer.blendMode.name.lowercase()).put("alphaLock", layer.alphaLock).put("clipping", layer.clipping)
    private fun color(value: Any): Int = when (value) {
        is String -> Color.parseColor(value)
        is Number -> value.toLong().toInt()
        else -> error("Cor precisa ser hexadecimal ou ARGB numérico")
    }

    fun invoke(operation: String, args: JSONObject): Any? {
        val editing = operation.startsWith("document.") && operation != "document.state" ||
            operation.startsWith("layers.") && operation != "layers.list" ||
            operation.startsWith("groups.") && operation != "groups.list" ||
            operation.startsWith("transform.") || operation.startsWith("paint.") ||
            operation in listOf("project.open","image.import","filters.apply","color.adjust","selection.fill","selection.erase","selection.cut","selection.paste") ||
            operation.startsWith("animation.") && operation !in listOf("animation.state","animation.play","animation.configure","animation.onion")
        if (editing) engine.isAnimationPlaying = false
        if (strokeMatrix != null && !operation.startsWith("stroke.") &&
            !operation.endsWith(".state") && !operation.endsWith(".list") && operation !in listOf("state","spaces.resolve")) {
            error("Termine ou cancele o traço antes de alterar outro recurso")
        }
        // Prevent document operations from invalidating a floating transform.
        if (ownTransform && !(operation.startsWith("transform.") || operation.startsWith("pivots.") || operation.startsWith("spaces.") || operation in listOf("state", "view.state"))) {
            error("Confirme ou cancele a transformação antes de outra operação")
        }
        val result: Any? = when (operation) {
            "state" -> JSONObject().put("width", engine.width).put("height", engine.height)
                .put("tool", engine.currentTool.name.lowercase()).put("color", engine.currentColor.toLong() and 0xffffffffL)
                .put("brushSize", engine.brushSize).put("brushOpacity", engine.brushOpacity)
                .put("layer", engine.layers.firstOrNull { it.id == engine.activeLayerIndex }?.let(::layer))
                .put("selectionActive", engine.selectionActive).put("canUndo", engine.canUndo).put("canRedo", engine.canRedo)
            "spaces.view" -> {
                val matrix = canvas.scripting.inverseView()
                when (args.optString("units", "screen")) {
                    "document" -> {
                        val v = FloatArray(9)
                        matrix.getValues(v)
                        val scale = hypot(v[0], v[3]).coerceAtLeast(0.000001f)
                        v[0] /= scale; v[1] /= scale; v[3] /= scale; v[4] /= scale
                        matrix.setValues(v)
                    }
                    "screen" -> Unit
                    else -> error("Unidade deve ser screen ou document")
                }
                canvas.scripting.reference(matrix)
            }
            "spaces.resolve" -> canvas.scripting.reference(canvas.scripting.resolve(args.getJSONObject("space")))
            "pivots.get" -> canvas.scripting.pivots[args.getString("name")] ?: error("Pivot não encontrado")
            "pivots.list" -> JSONArray(canvas.scripting.pivots.values.toList())
            "pivots.remove" -> canvas.scripting.pivots.remove(args.getString("name")) != null
            "pivots.clear" -> { canvas.scripting.pivots.clear(); null }
            "tools.list" -> JSONArray(ToolMode.values().map { it.name.lowercase() })
            "tools.select" -> {
                chooseTool(tool(args.getString("name")))
                ownTransform = engine.transformState != null
                null
            }
            "brush.set" -> {
                if (args.has("size")) engine.brushSize = args.number("size")
                if (args.has("opacity")) engine.brushOpacity = args.number("opacity")
                if (args.has("color")) engine.currentColor = color(args.get("color"))
                if (args.has("hardness")) engine.brushHardness = args.number("hardness").toInt()
                if (args.has("smoothing")) engine.brushSmooth = args.number("smoothing").toInt()
                null
            }
            "brush.presets" -> JSONArray(engine.presetCatalog.map { JSONObject().put("id", "preset:${it.id}").put("name", it.name) } +
                engine.brushCatalog.map { JSONObject().put("id", "brush:${it.id}").put("name", it.title) })
            "brush.select" -> {
                val id = args.getString("id")
                val preset = engine.presetCatalog.firstOrNull { "preset:${it.id}" == id || it.id == id }
                val brush = engine.brushCatalog.firstOrNull { "brush:${it.id}" == id || it.id == id }
                when { preset != null -> engine.selectPreset(preset); brush != null -> engine.selectBrush(brush); else -> error("Pincel não encontrado: $id") }
                null
            }
            "brush.param" -> { engine.setPresetParam(args.getInt("id"), args.getInt("value")); null }
            "stroke.begin" -> { beginStroke(args); null }
            "stroke.cancel" -> { engine.cancelActiveStroke(); restoreStrokeTool(); null }
            "shape" -> { shape(args); null }
            "stroke.move" -> {
                check(strokeMatrix != null) { "Nenhum traço em andamento" }
                val points = args.getJSONArray("points")
                require(points.length() <= 64)
                repeat(points.length()) { touch(points.getJSONObject(it), 1) }
                null
            }
            "stroke.end" -> {
                check(strokeMatrix != null) { "Nenhum traço em andamento" }
                touch(args.getJSONObject("point"), 2)
                restoreStrokeTool()
                null
            }
            "layers.list" -> JSONArray(engine.layers.map(::layer))
            "layers.create", "layers.duplicate" -> {
                val id = if (operation == "layers.create") engine.addLayer() else engine.duplicateLayer(args.layerId())
                check(id >= 0) { "Não foi possível criar a camada" }
                engine.selectLayer(id)
                if (args.has("name") && !args.isNull("name")) engine.renameLayer(id, args.getString("name"))
                layer(engine.layers.first { it.id == id })
            }
            "layers.select" -> { engine.selectLayer(args.layerId()); null }
            "layers.remove" -> { engine.deleteLayer(args.layerId()); null }
            "layers.clear" -> { engine.clearActiveLayer(); null }
            "layers.set" -> {
                val id = args.layerId()
                if (args.has("name")) engine.renameLayer(id, args.getString("name"))
                if (args.has("opacity")) engine.setLayerOpacity(id, (args.number("opacity").coerceIn(0f, 1f)*255).roundToInt(), commitUndo = true)
                if (args.has("visible")) engine.setLayerVisible(id, args.getBoolean("visible"))
                if (args.has("alphaLock")) engine.setLayerAlphaLock(id, args.getBoolean("alphaLock"))
                if (args.has("clipping")) engine.setLayerClipping(id, args.getBoolean("clipping"))
                if (args.has("blendMode")) engine.setLayerBlendMode(id, LayerBlendMode.valueOf(args.getString("blendMode").uppercase()))
                null
            }
            "selection.all" -> { engine.selectAll(); null }
            "selection.clear" -> { engine.clearSelection(); null }
            "selection.invert" -> { engine.invertSelection(); null }
            "selection.feather" -> { engine.featherSelection(args.number("radius").toInt().coerceIn(0, 256)); null }
            "selection.fill" -> engine.fillSelection(if (args.has("color")) color(args.get("color")) else engine.currentColor)
            "selection.erase" -> { engine.clearSelectedPixels(); null }
            "selection.copy" -> engine.copySelectionToClipboard()
            "selection.cut" -> engine.cutSelectionToClipboard()
            "selection.paste" -> engine.pasteSelectionClipboard()
            "selection.operation" -> { engine.selectionOp = SelectionOp.valueOf(args.getString("name").uppercase()); null }
            "filters.list" -> JSONArray(engine.filterCatalog.map { filter -> JSONObject().put("id", filter.id).put("name", filter.title)
                .put("params", JSONArray(filter.params.mapIndexed { index, param -> JSONObject().put("id", index).put("name", param.name).put("min", param.min).put("max", param.max).put("value", param.currentVal) })) })
            "filters.apply" -> engine.applyFilter(engine.filterCatalog.firstOrNull { it.id == args.getString("id") }
                ?: error("Filtro não encontrado"), args.optInt("p1"), args.optInt("p2"))
            "animation.state" -> extended.invoke(operation, args)
            "animation.add" -> engine.addAnimationFrame()
            "animation.duplicate" -> engine.duplicateAnimationFrame()
            "animation.remove" -> { engine.deleteAnimationFrame(); null }
            "animation.select" -> {
                val index = args.getInt("index")
                require(index in engine.animationFrames.indices) { "Frame inexistente" }
                engine.restoreFrame(index); null
            }
            "animation.duration" -> { engine.setCurrentFrameDuration(args.getInt("duration").coerceIn(1, 10000)); null }
            "transform.begin" -> engine.beginTransform(args.optBoolean("selectionOnly")).also { ownTransform = it }
            "transform.rotate", "transform.scale", "transform.translate" -> {
                val transform = engine.transformState ?: error("Inicie uma transformação")
                val center = transform.getCenter()
                val pivot = args.optJSONObject("pivot")?.let {
                    floatArrayOf(0f, 0f).also { point -> canvas.scripting.resolve(it).mapPoints(point) }
                } ?: floatArrayOf(center.x, center.y)
                when (operation) {
                    "transform.rotate" -> transform.rotate(args.number("degrees"), pivot[0], pivot[1])
                    "transform.scale" -> {
                        val sx = args.number("x"); val sy = args.number("y")
                        require(abs(sx) in 0.001f..1000f && abs(sy) in 0.001f..1000f) { "Escala fora dos limites" }
                        transform.scale(sx, sy, pivot[0], pivot[1])
                    }
                    else -> {
                        val offset = floatArrayOf(args.number("x"), args.number("y"))
                        canvas.scripting.resolve(args.getJSONObject("space")).mapVectors(offset)
                        require(offset.all { it.isFinite() && abs(it) <= 1_000_000f }) { "Deslocamento fora dos limites" }
                        transform.translate(offset[0], offset[1])
                    }
                }
                engine.getRenderBitmap()
                null
            }
            "transform.flipH" -> { engine.flipTransformH(); null }
            "transform.flipV" -> { engine.flipTransformV(); null }
            "transform.center" -> { engine.centerTransform(); null }
            "transform.fit" -> { engine.fitTransformToCanvas(); null }
            "transform.reset" -> { engine.resetTransform(); null }
            "transform.commit" -> { engine.commitTransform(); ownTransform = false; null }
            "transform.cancel" -> { engine.cancelTransform(); ownTransform = false; null }
            "view.reset" -> { canvas.resetView(); null }
            "view.set" -> { setView(args); null }
            "view.state" -> {
                val values=FloatArray(9).also { canvas.transformMatrix.getValues(it) }
                val center=floatArrayOf(canvas.width/2f,canvas.height/2f).also { canvas.scripting.inverseView().mapPoints(it) }
                JSONObject().put("matrix", canvas.scripting.affine(canvas.transformMatrix)).put("width", canvas.width).put("height", canvas.height)
                    .put("zoom",hypot(values[0],values[3])).put("rotation",Math.toDegrees(atan2(values[3],values[0]).toDouble())).put("x",center[0]).put("y",center[1])
            }
            "ui.panel", "ui.export", "ui.configure" -> { ui(operation, args); null }
            "undo" -> engine.undo()
            "redo" -> engine.redo()
            else -> if(operation.startsWith("groups.") && operation != "groups.list") engine.editRasterGroups { extended.invoke(operation,args) }
                else extended.invoke(operation, args)
        }
        refresh()
        return result
    }

    private fun beginStroke(args: JSONObject) {
        check(strokeMatrix == null && !engine.isStrokeActive) { "Já existe um traço em andamento" }
        check(engine.transformState == null) { "Confirme a transformação antes de desenhar" }
        val selectedTool = if (args.has("tool")) tool(args.getString("tool")) else engine.currentTool
        require(selectedTool !in listOf(ToolMode.PAN, ToolMode.TRANSFORM)) { "Use view ou transform para essa ferramenta" }
        // Validate before changing editor state.
        val matrix = canvas.scripting.resolve(args.getJSONObject("space"))
        previousTool = engine.currentTool
        engine.currentTool = selectedTool
        strokeMatrix = matrix
        touch(args.getJSONObject("point"), 0)
    }

    private fun shape(args: JSONObject) {
        check(strokeMatrix == null && !engine.isStrokeActive && engine.transformState == null)
        val selectedTool = tool(args.getString("tool"))
        val matrix = canvas.scripting.resolve(args.getJSONObject("space"))
        val start = args.getJSONObject("start")
        val end = args.getJSONObject("end")
        val x0 = start.number("x"); val y0 = start.number("y")
        val x1 = end.number("x"); val y1 = end.number("y")
        val isEllipse = selectedTool in listOf(ToolMode.ELLIPSE, ToolMode.ERASE_ELLIPSE, ToolMode.SELECT_ELLIPSE)
        if (selectedTool in listOf(ToolMode.SELECT_RECT, ToolMode.SELECT_ELLIPSE)) {
            val points = if (isEllipse) {
                (0 until 360).map { i ->
                    val angle = i * Math.PI / 180
                    floatArrayOf((x0+x1)/2 + cos(angle).toFloat()*abs(x1-x0)/2,
                        (y0+y1)/2 + sin(angle).toFloat()*abs(y1-y0)/2)
                }
            } else listOf(floatArrayOf(x0,y0), floatArrayOf(x1,y0), floatArrayOf(x1,y1), floatArrayOf(x0,y1))
            engine.selectLasso(points.map { p ->
                matrix.mapPoints(p)
                require(p.all { it.isFinite() && abs(it) <= 1_000_000f }) { "Seleção fora dos limites" }
                p[0].roundToInt() to p[1].roundToInt()
            })
        } else {
            require(selectedTool in listOf(ToolMode.RECTANGLE, ToolMode.ELLIPSE, ToolMode.ERASE_RECTANGLE, ToolMode.ERASE_ELLIPSE))
            engine.drawAffineShape(x0, y0, x1, y1, matrix, isEllipse,
                selectedTool in listOf(ToolMode.ERASE_RECTANGLE, ToolMode.ERASE_ELLIPSE))
        }
    }

    private fun touch(point: JSONObject, phase: Int) {
        val xy = floatArrayOf(point.number("x"), point.number("y"))
        strokeMatrix!!.mapPoints(xy)
        require(xy.all { it.isFinite() && abs(it) <= 1_000_000f }) { "Ponto fora dos limites de execução" }
        val pressure = point.number("pressure", 0.85).coerceIn(0f, 1f)
        val tiltX = point.number("tiltX", 0.0).toInt().coerceIn(-90, 90)
        val tiltY = point.number("tiltY", 0.0).toInt().coerceIn(-90, 90)
        when (phase) {
            0 -> engine.onTouchDown(xy[0], xy[1], pressure, tiltX, tiltY)
            1 -> engine.onTouchMove(xy[0], xy[1], pressure, tiltX, tiltY)
            2 -> engine.onTouchUp(xy[0], xy[1], pressure, tiltX, tiltY)
        }
    }

    private fun restoreStrokeTool() {
        previousTool?.let { engine.currentTool = it }
        previousTool = null
        strokeMatrix = null
    }

    private fun setView(args: JSONObject) {
        // Absolute scale and rotation, with a document point centered in the view.
        val current = FloatArray(9).also { canvas.transformMatrix.getValues(it) }
        val center = floatArrayOf(canvas.width / 2f, canvas.height / 2f).also { canvas.scripting.inverseView().mapPoints(it) }
        val zoom = args.number("zoom", hypot(current[0], current[3]).toDouble()).coerceIn(0.05f, 64f)
        val rotation = args.number("rotation", Math.toDegrees(atan2(current[3], current[0]).toDouble()))
        val x = args.number("x", center[0].toDouble())
        val y = args.number("y", center[1].toDouble())
        canvas.transformMatrix.apply {
            reset(); postTranslate(-x, -y); postScale(zoom, zoom); postRotate(rotation)
            postTranslate(canvas.width / 2f, canvas.height / 2f)
        }
        canvas.invalidate()
    }

    fun prepareIo(operation: String, args: JSONObject): ScriptIoJob {
        if(operation == "project.save" || operation.startsWith("export.")) {
            check(strokeMatrix == null && engine.transformState == null) { "Termine o traço ou a transformação antes de salvar/exportar" }
        }
        return extended.prepareIo(operation,args)
    }

    fun finish() {
        extended.finish()
        if (strokeMatrix != null) engine.cancelActiveStroke()
        restoreStrokeTool()
        if (ownTransform) engine.cancelTransform()
        ownTransform = false
        canvas.scripting.running = false
        canvas.scripting.cancelPick()
        refresh()
    }
}
