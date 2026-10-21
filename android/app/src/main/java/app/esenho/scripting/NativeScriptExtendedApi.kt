package app.esenho.scripting

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.net.Uri
import app.esenho.nativeengine.*
import app.esenho.ui.*
import app.esenho.ui.components.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import kotlin.math.*

/** The remaining native editor operations. All document access runs on the UI thread. */
class NativeScriptExtendedApi(private val e: EsenhoEngine, private val canvas: EsenhoCanvasView) {
    private fun JSONObject.f(key: String, default: Double = 0.0): Float = optDouble(key, default).toFloat().also {
        require(it.isFinite()) { "$key deve ser finito" }
    }
    private fun layer(a: JSONObject) = a.optInt("id", e.activeLayerIndex).also { id -> require(e.layers.any { it.id == id }) { "Camada inexistente" } }
    private fun color(value: Any) = if (value is Number) value.toLong().toInt() else Color.parseColor(value.toString())
    private fun group(id: String) = e.rasterLayerGroups[id] ?: error("Grupo inexistente: $id")
    private fun groupJson(g: RasterLayerGroup) = JSONObject().put("id", g.id).put("name", g.name).put("visible", g.visible)
        .put("collapsed", g.collapsed).put("parentId", g.parentId ?: JSONObject.NULL).put("layers", JSONArray(g.layerIds)).put("children", JSONArray(g.childGroupIds))
    private val ioJobs = mutableListOf<ScriptIoJob>()
    fun finish() { ioJobs.forEach { it.cancel() }; ioJobs.clear() }
    fun prepareIo(op: String, args: JSONObject): ScriptIoJob {
        val path = args.optString("path")
        val job = when (op) {
            "project.save" -> {
                val snapshot = EsenhoProjectIO.capture(e)
                ScriptIoJob({ output(path).use { EsenhoProjectIO.write(snapshot,it) }; path }, { EsenhoProjectIO.recycle(snapshot) })
            }
            "export.image" -> {
                val format = args.optString("format","png").lowercase()
                val type = when(format) { "png" -> Bitmap.CompressFormat.PNG; "jpg","jpeg" -> Bitmap.CompressFormat.JPEG; "webp" -> Bitmap.CompressFormat.WEBP; else -> error("Formato inválido") }
                val bitmap = e.getRenderBitmap()?.copy(Bitmap.Config.ARGB_8888,false) ?: error("Documento vazio")
                ScriptIoJob({ output(path).use { check(bitmap.compress(type,args.optInt("quality",95).coerceIn(0,100),it)) }; path }, { bitmap.recycle() })
            }
            "export.animation" -> {
                val format = args.optString("format","gif").lowercase()
                require(format in listOf("gif","webm"))
                val fps = args.optInt("fps",e.animationFps).coerceIn(1,60)
                val loop = args.optBoolean("loop",e.animationLoop)
                val required = e.totalAnimationTicks().toLong()*e.width*e.height*4
                val vm = Runtime.getRuntime()
                require(required <= (vm.maxMemory()-vm.totalMemory()+vm.freeMemory())/2) { "Animação grande demais para exportar em memória neste aparelho" }
                val frames = e.renderAnimationFrames()
                ScriptIoJob({
                    if(format=="gif") output(path).use { GifWriter.write(frames,fps,loop,it) }
                    else { val temp=File.createTempFile("script-animation-",".webm",e.context.cacheDir);try { WebmWriter.write(frames,fps,temp);output(path).use { dest -> temp.inputStream().use { it.copyTo(dest) } } } finally { temp.delete() } }
                    path
                }, { frames.forEach { it.recycle() } })
            }
            else -> ScriptIoJob({ invoke(op,args) })
        }
        ioJobs.removeAll { it.isReleased() }
        ioJobs.add(job)
        return job
    }
    private fun privateFile(path: String): File {
        val root = File(e.context.filesDir, "script-files").apply { mkdirs() }.canonicalFile
        val target = File(root, path).canonicalFile
        require(target == root || target.path.startsWith(root.path + File.separator)) { "Caminho fora da pasta de scripts" }
        return target
    }
    private fun input(path: String): InputStream = if (path.startsWith("content://"))
        e.context.contentResolver.openInputStream(Uri.parse(path)) ?: error("Não foi possível abrir o arquivo") else privateFile(path).inputStream()
    private fun output(path: String): OutputStream = if (path.startsWith("content://"))
        e.context.contentResolver.openOutputStream(Uri.parse(path), "wt") ?: error("Não foi possível gravar o arquivo") else privateFile(path).also { it.parentFile?.mkdirs() }.outputStream()
    private fun curveDefaults() = e.presetCatalog.associate { "preset:${it.id}" to it.curveBindings } + e.brushCatalog.associate { "brush:${it.id}" to it.curveBindings }
    private fun parameter(id: Int) = availableSliderParameters(e).firstOrNull { it.paramId == id } ?: error("Parâmetro inexistente: $id")

    fun invoke(op: String, a: JSONObject): Any? = when (op) {
        "document.new" -> {
            val w = a.getInt("width"); val h = a.getInt("height")
            require(w in 1..16384 && h in 1..16384 && w.toLong()*h <= 67_108_864) { "Dimensões excessivas" }
            e.createDocument(w,h,if(a.has("background"))color(a.get("background"))else Color.WHITE)
            canvas.scripting.pivots.clear()
            canvas.resetView(); null
        }
        "document.resize" -> {
            val w = a.getInt("width"); val h = a.getInt("height")
            require(w in 1..16384 && h in 1..16384 && w.toLong()*h <= 67_108_864)
            e.resizeCanvas(w, h, a.optBoolean("resample", true))
        }
        "document.crop" -> e.cropCanvasToSelection()
        "document.clear" -> { e.clearCanvas(); null }
        "document.flipH" -> { e.flipCanvasH(); null }
        "document.flipV" -> { e.flipCanvasV(); null }
        "project.save" -> { output(a.getString("path")).use { EsenhoProjectIO.save(e, it) }; a.getString("path") }
        "project.open" -> { input(a.getString("path")).use { EsenhoProjectIO.load(e, it) }; canvas.scripting.pivots.clear(); canvas.resetView(); null }
        "files.readText" -> input(a.getString("path")).bufferedReader().use { reader ->
            val b = CharArray(4*1024*1024 + 1); var count = 0
            while (count < b.size) { val n = reader.read(b, count, b.size-count); if (n < 0) break; count += n }
            require(count < b.size) { "Arquivo maior que 4 MB" }; String(b, 0, count)
        }
        "files.writeText" -> { output(a.getString("path")).use { it.write(a.getString("text").toByteArray(Charsets.UTF_8)) }; null }
        "files.list" -> JSONArray(privateFile(a.optString("path", ".") + "/.").list()?.sorted().orEmpty())
        "files.remove" -> privateFile(a.getString("path")).let { require(it.isFile); it.delete() }
        "image.import" -> {
            val path = a.getString("path")
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            input(path).use { BitmapFactory.decodeStream(it, null, bounds) }
            require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong()*bounds.outHeight <= 67_108_864) { "Imagem inválida ou excessiva" }
            val bitmap = input(path).use { BitmapFactory.decodeStream(it) } ?: error("Imagem inválida")
            try { e.importImageToLayer(bitmap, a.optBoolean("newLayer", true)) } finally { bitmap.recycle() }
        }
        "export.image", "export.animation" -> prepareIo(op, a).execute()
        "layers.move" -> { e.moveLayerByOrderDelta(layer(a), a.getInt("delta")); null }
        "layers.mergeDown" -> { e.mergeDown(layer(a)); null }
        "layers.flipH" -> { e.flipLayerH(layer(a)); null }
        "layers.flipV" -> { e.flipLayerV(layer(a)); null }
        "groups.list" -> JSONArray(e.rasterLayerGroups.values.map(::groupJson))
        "groups.create" -> {
            val g = e.createRasterLayerGroup(a.optString("name"))
            if (!a.isNull("parentId") && a.has("parentId")) { group(a.getString("parentId")); e.nestRasterLayerGroup(g.id, a.getString("parentId")) }
            groupJson(g)
        }
        "groups.set" -> {
            val g = group(a.getString("id"))
            if (a.has("name")) e.renameRasterLayerGroup(g.id, a.getString("name"))
            if (a.has("visible") && g.visible != a.getBoolean("visible")) e.toggleRasterLayerGroupVisibility(g.id)
            if (a.has("collapsed")) g.collapsed = a.getBoolean("collapsed")
            if (a.has("parentId")) {
                val parent = if (a.isNull("parentId")) null else a.getString("parentId").also { group(it) }
                e.nestRasterLayerGroup(g.id, parent)
                check(g.parentId == parent) { "Grupos não podem formar ciclos" }
            }
            groupJson(g)
        }
        "groups.assign" -> {
            val id = if (a.isNull("groupId")) null else a.getString("groupId").also { group(it) }
            e.moveLayerToRasterGroup(layer(a), id); null
        }
        "groups.remove" -> { group(a.getString("id")); e.deleteRasterLayerGroup(a.getString("id")); null }
        "groups.move" -> { group(a.getString("id")); e.moveRasterLayerGroup(a.getString("id"),a.getInt("delta")); null }
        "brush.state" -> JSONObject().put("preset", e.selectedPreset?.toJson()).put("procedural", e.selectedBrush?.id ?: JSONObject.NULL)
            .put("size", e.brushSize).put("opacity", e.brushOpacity).put("color", e.currentColor.toLong() and 0xffffffffL)
        "brush.parameters" -> JSONArray(availableSliderParameters(e).map { config ->
            curveTarget(e, config).toJson().put("value", if (config.kind == QuickParameterKind.CHOICE) quickChoiceValue(e, config.paramId) else readSliderParameter(e, config.paramId))
                .put("choices", JSONArray(config.options.map { JSONObject().put("id", it.first).put("name", it.second) }))
        })
        "brush.getParameter" -> { val c = parameter(a.getInt("id")); if (c.kind == QuickParameterKind.CHOICE) quickChoiceValue(e,c.paramId) else readSliderParameter(e,c.paramId) }
        "brush.setParameter" -> {
            val c = parameter(a.getInt("id"))
            if (c.kind == QuickParameterKind.CHOICE) {
                val raw=a.get("value")
                val key = if(raw is String) raw else {
                    val number=a.f("value"); val index=number.toInt()
                    require(number == index.toFloat() && index in c.options.indices) { "Índice de escolha inválido" }
                    c.options[index].first
                }
                require(c.options.any { it.first == key }) { "Opção inválida: $key" }
                writeQuickChoice(e,c.paramId,key)
            } else writeSliderParameter(e,c.paramId,a.f("value").coerceIn(c.minVal,c.maxVal))
            null
        }
        "brush.shape" -> { e.setPresetShape(a.getString("name")); null }
        "brush.texture" -> { e.setPresetTexture(a.getString("name")); null }
        "brush.reset" -> { e.resetPresetToDefaults(); null }
        "brush.save" -> e.saveCurrentPresetAsCustom(a.getString("name"),a.optString("category","Personalizado")).let { it.toJson().put("id","preset:${it.id}") }
        "brush.remove" -> e.deleteCustomPreset(a.getString("id").removePrefix("preset:"))
        "brush.pressure" -> { e.setPressureResponse(a.optString("curve","linear"),a.optInt("min",0),a.optInt("max",100)); null }
        "brush.asset" -> when (a.optString("source","selection") to a.getString("kind")) {
            "selection" to "tip" -> e.createBrushTipFromSelection(a.getString("name"))
            "selection" to "grain" -> e.createGrainTextureFromSelection(a.getString("name"))
            "layer" to "tip" -> e.createBrushTipFromActiveLayer(a.getString("name"))
            "layer" to "grain" -> e.createGrainTextureFromActiveLayer(a.getString("name"))
            else -> error("Use source selection/layer e kind tip/grain")
        }
        "brush.dynamicSettings" -> JSONArray(DYNAMIC_SETTING_KEYS.mapIndexed { i,key -> JSONObject().put("id",i).put("name",key) })
        "brush.dynamicInputs" -> JSONArray(listOf("pressure","speed_fine","speed_coarse","random","stroke_distance","direction","declination","ascension","custom","attack_angle","tilt_x","tilt_y","gridmap_x","gridmap_y","viewzoom","stroke_duration").mapIndexed { i,key -> JSONObject().put("id",i).put("name",key) })
        "brush.dynamicBase" -> { val index = a.getInt("setting"); require(index in DYNAMIC_SETTING_KEYS.indices); if (a.has("value")) e.setDynamicBase(index,a.f("value")); e.dynamicBaseValue(index) }
        "brush.dynamicCurve" -> {
            val setting = a.getInt("setting"); val input = a.getInt("input")
            require(setting in DYNAMIC_SETTING_KEYS.indices && input in 0..15)
            val points = a.optJSONArray("points")?.let { array -> List(array.length()) { val p = array.getJSONArray(it); p.getDouble(0).toFloat() to p.getDouble(1).toFloat() } }
            require(points == null || points.size in 2..16 && points.all { it.first.isFinite() && it.second.isFinite() })
            e.setDynamicCurve(setting,input,points); null
        }
        "curves.list" -> JSONArray(e.brushCurves.curves.map { it.toJson().put("builtin",it.builtin) })
        "curves.inputs" -> JSONArray(listOf("pressure","speed","distance","time","tilt","direction","noise"))
        "curves.targets" -> JSONArray(availableSliderParameters(e).map { curveTarget(e,it) }.filter { e.supportsCurveTarget(it) }.map { it.toJson() })
        "curves.bindings" -> JSONArray(e.brushCurves.bindings.map { it.toJson() })
        "curves.save" -> {
            val json = JSONObject(a.toString()).apply { if (!has("id")) put("id",UUID.randomUUID().toString()) }
            val c = SavedBrushCurve.fromJson(json)
            require(e.brushCurves.curves.none { it.id == c.id && it.builtin }) { "Copie a curva de fábrica com outro ID" }
            require(c.points.size in 2..256 && c.points.all { it.first.isFinite() && it.second.isFinite() && it.first in 0f..1f && it.second in 0f..1f }) { "Curva exige 2–256 pontos normalizados" }
            require(c.points.zipWithNext().all { it.first.first < it.second.first }) { "X dos pontos deve ser crescente" }
            check(e.brushCurves.save(c)) { "Nome já usado ou falha ao salvar curva" }; c.toJson()
        }
        "curves.bind" -> {
            val target = curveTarget(e,parameter(a.getInt("parameter")))
            require(e.supportsCurveTarget(target)) { "Parâmetro não suporta curva neste pincel" }
            val b = BrushParameterCurve.fromJson(JSONObject(a.toString()).put("target",target.toJson()))
            check(e.brushCurves.bind(b)) { "Curva inexistente ou falha ao salvar vínculo" }; b.toJson()
        }
        "curves.unbind" -> e.brushCurves.unbind(a.getInt("parameter"))
        "curves.reset" -> e.brushCurves.resetActiveBindings()
        "curves.remove" -> e.brushCurves.delete(a.getString("id"),curveDefaults())
        "curves.evaluate" -> {
            val c = e.brushCurves.curves.firstOrNull { it.id == a.getString("id") } ?: error("Curva inexistente")
            c.evaluator.valueAt(a.f("value"))
        }
        "palettes.list" -> JSONArray(e.palettes.map { it.toJson().put("active",it.id == e.activePaletteId) })
        "palettes.create" -> e.createCustomPalette(a.getString("name")).toJson()
        "palettes.select" -> { require(e.palettes.any { it.id == a.getString("id") }); e.activePaletteId = a.getString("id"); null }
        "palettes.remove" -> e.deletePalette(a.getString("id"))
        "palettes.addColor" -> e.addColorToPalette(a.optString("id",e.activePaletteId),color(a.get("color")))
        "palettes.removeColor" -> e.removeColorFromPalette(a.optString("id",e.activePaletteId),a.getInt("index"))
        "color.set" -> { e.currentColor = color(a.get("color")); null }
        "color.sample" -> {
            val point = floatArrayOf(a.f("x"),a.f("y")); a.optJSONObject("space")?.let { canvas.scripting.resolve(it).mapPoints(point) }
            e.pickColorAt(point[0],point[1]).toLong() and 0xffffffffL
        }
        "color.adjust" -> { e.adjustActiveLayerHsv(a.optInt("hue"),a.optInt("saturation"),a.optInt("value")); null }
        "selection.state" -> JSONObject().put("active",e.selectionActive).put("operation",e.selectionOp.name.lowercase()).put("hasMask",e.selectionHasMask)
            .put("bounds",e.selectionBounds?.let { JSONObject().put("x",it.left).put("y",it.top).put("width",it.width()).put("height",it.height()) })
        "selection.configure" -> {
            if (a.has("tolerance")) e.wandTolerance = a.getInt("tolerance").coerceIn(0,255)
            if (a.has("contiguous")) e.wandContiguous = a.getBoolean("contiguous")
            null
        }
        "selection.mask" -> {
            val info = IntArray(6); EsenhoNativeBridge.nativeSelectGetInfo(info)
            require(info[3].toLong()*info[4] <= 1_048_576) { "Máscara maior que 1 milhão de pixels; use uma região menor" }
            val data = if (info[0] != 0 && info[5] != 0) ByteArray(info[3]*info[4]).also { EsenhoNativeBridge.nativeSelectGetMask(it) } else ByteArray(0)
            require(data.size <= 1_048_576) { "Máscara maior que 1 milhão de pixels; use uma região menor" }
            JSONObject().put("x",info[1]).put("y",info[2]).put("width",info[3]).put("height",info[4]).put("data",JSONArray(data.map { it.toInt() and 255 }))
        }
        "selection.setMask" -> {
            val w = a.getInt("width"); val h = a.getInt("height"); val data = a.getJSONArray("data")
            require(w > 0 && h > 0 && w.toLong()*h <= 1_048_576 && data.length() == w*h)
            val bytes = ByteArray(data.length()) { data.getInt(it).also { n -> require(n in 0..255) }.toByte() }
            EsenhoNativeBridge.nativeSelectApplyMask(bytes,a.optInt("x"),a.optInt("y"),w,h,e.selectionOp.id); e.updateSelectionInfo(); null
        }
        "guides.list" -> JSONArray(e.canvasGuides.mapIndexed { i,g -> JSONObject().put("id",i).put("type",g.type.name.lowercase()).put("paths",JSONArray(g.paths.map { path -> JSONArray(path.map { JSONArray(listOf(it.x,it.y)) }) })) })
        "guides.create" -> {
            val paths = a.getJSONArray("paths")
            val parsed = List(paths.length()) { i -> val path=paths.getJSONArray(i); require(path.length() in 2..10000); List(path.length()) { j -> val p=path.getJSONArray(j); GuidePoint(p.getDouble(0).toFloat(),p.getDouble(1).toFloat()).also { require(it.x.isFinite() && it.y.isFinite()) } } }
            val g=CanvasGuide(DrawingGuideType.valueOf(a.optString("type","curve").uppercase()),parsed)
            e.canvasGuides.add(g); e.canvasGuides.lastIndex
        }
        "guides.remove" -> { e.removeCanvasGuide(a.getInt("id")); null }
        "guides.clear" -> { e.canvasGuides.clear(); e.snapGuideIndices.clear(); e.activeCanvasGuideIndex = -1; null }
        "assist.state" -> JSONObject().put("symmetry",e.symmetryMode.name.lowercase()).put("grid",e.pixelArtGrid).put("gridStep",e.pixelArtGridStep).put("snap",e.guideSnapEnabled).put("snapAll",e.snapToAllVisibleGuides).put("guides",JSONArray(e.snapGuideIndices.toList()))
        "assist.set" -> {
            if (a.has("symmetry")) e.symmetryMode = SymmetryMode.valueOf(a.getString("symmetry").uppercase())
            if (a.has("grid")) e.pixelArtGrid = a.getBoolean("grid")
            if (a.has("gridStep")) e.pixelArtGridStep = a.getInt("gridStep").coerceAtLeast(1)
            if (a.has("snap")) e.guideSnapEnabled = a.getBoolean("snap")
            if (a.has("snapAll")) e.snapToAllVisibleGuides = a.getBoolean("snapAll")
            a.optJSONArray("guides")?.let { ids -> e.snapGuideIndices.clear(); repeat(ids.length()) { val id=ids.getInt(it); require(id in e.canvasGuides.indices); e.snapGuideIndices.add(id) } }; null
        }
        "paint.dry" -> { e.dryPaintWater(); null }
        "paint.diffuse" -> { e.diffusePaintWater(a.optInt("steps",1).coerceIn(1,100)); null }
        "animation.state" -> JSONObject().put("frame",e.currentFrameIndex).put("count",e.animationFrames.size).put("fps",e.animationFps).put("tick",e.currentAnimationTick)
            .put("ticks",e.totalAnimationTicks()).put("playing",e.isAnimationPlaying).put("loop",e.animationLoop)
            .put("tracks",JSONArray(e.animationTracks.values.map { t -> JSONObject().put("layerId",t.layerId).put("frame",t.activeCelIndex).put("frames",JSONArray(t.frames.mapIndexed { i,c -> JSONObject().put("id",c.id).put("index",i).put("duration",c.duration).put("visible",c.visible).put("opacity",c.opacity/255.0) })) }))
        "animation.configure" -> {
            if (a.has("fps")) e.animationFps = a.getInt("fps").coerceIn(1,60)
            if (a.has("loop")) e.animationLoop = a.getBoolean("loop")
            null
        }
        "animation.play" -> { e.startAnimationPlayback(); null }
        "animation.pause" -> { e.isAnimationPlaying = false; null }
        "animation.stop" -> { e.isAnimationPlaying = false; e.applyAnimationTick(0); null }
        "animation.seek" -> { val tick=a.getInt("tick"); require(tick in 0 until e.totalAnimationTicks().coerceAtLeast(1)); e.applyAnimationTick(tick); null }
        "animation.move" -> { val from=a.getInt("from"); val to=a.getInt("to"); require(from in e.animationFrames.indices && to in e.animationFrames.indices); e.moveAnimationFrame(from,to); null }
        "animation.clear" -> { e.clearCurrentAnimationFrame(); null }
        "animation.cel" -> { if (a.has("visible")) e.setCurrentCelVisible(a.getBoolean("visible")); if (a.has("opacity")) e.setCurrentCelOpacity((a.f("opacity").coerceIn(0f,1f)*255).roundToInt()); null }
        "animation.onion" -> {
            if (a.has("enabled")) e.onionSkinEnabled=a.getBoolean("enabled")
            if (a.has("previous")) e.onionPrevFrames=a.getInt("previous").coerceIn(0,20)
            if (a.has("next")) e.onionNextFrames=a.getInt("next").coerceIn(0,20)
            if (a.has("opacity")) e.onionOpacity=a.f("opacity").coerceIn(0f,1f)
            if (a.has("previousTint")) e.onionPrevTint=color(a.get("previousTint"))
            if (a.has("nextTint")) e.onionNextTint=color(a.get("nextTint"))
            JSONObject().put("enabled",e.onionSkinEnabled).put("previous",e.onionPrevFrames).put("next",e.onionNextFrames).put("opacity",e.onionOpacity)
        }
        "transform.configure" -> {
            val t=e.transformState
            if (a.has("mode")) { val m=TransformState.Mode.valueOf(a.getString("mode").uppercase()); e.transformModePreference=m; t?.mode=m }
            if (a.has("interpolation")) { val i=TransformState.Interpolation.valueOf(a.getString("interpolation").uppercase()); e.transformInterpolation=i; t?.interpolation=i }
            if (a.has("lockAspect")) e.transformLockAspect=a.getBoolean("lockAspect"); null
        }
        "transform.corners" -> {
            val t=e.transformState ?: error("Inicie uma transformação"); val points=a.optJSONArray("points")
            if (points != null) { require(points.length()==4); repeat(4) { i -> val p=points.getJSONObject(i); val xy=floatArrayOf(p.f("x"),p.f("y")); a.optJSONObject("space")?.let { canvas.scripting.resolve(it).mapPoints(xy) }; require(xy.all { it.isFinite() && abs(it)<1_000_000 }); t.dstPts[i*2]=xy[0]; t.dstPts[i*2+1]=xy[1] }; t.updatePoints() }
            JSONArray((0..3).map { JSONObject().put("x",t.dstPts[it*2]).put("y",t.dstPts[it*2+1]) })
        }
        "pivots.create", "pivots.update" -> canvas.scripting.update(a, op == "pivots.create")
        "preferences.get" -> {
            val s=e.storageManager
            JSONObject().put("favoriteBrushes",JSONArray(s.loadFavoriteBrushes().toList())).put("activePalette",e.activePaletteId)
                .put("quickParameters",JSONArray(s.loadSideSliders().map { JSONObject().put("paramId",it.paramId).put("id",it.id).put("owner",it.ownerBrushId).put("name",it.parameterName) }))
        }
        "preferences.set" -> {
            a.optJSONArray("quickParameters")?.let { ids ->
                val settings=List(ids.length()) { i ->
                    val v=ids.optJSONObject(i)
                    if (v != null && v.has("owner")) {
                        EsenhoStorageManager.SideSliderSetting(v.getInt("paramId"),
                            id=v.optString("id").ifBlank { UUID.randomUUID().toString() },
                            ownerBrushId=v.getString("owner"),parameterName=v.optString("name"))
                    } else {
                        val config=parameter(v?.getInt("paramId") ?: ids.getInt(i))
                        EsenhoStorageManager.SideSliderSetting(config.paramId,ownerBrushId=BrushParameterScope.owner(e.selectedBrush?.id,config.paramId),parameterName=config.name)
                    }
                }
                check(e.storageManager.saveSideSliders(settings))
            }
            a.optJSONArray("favoriteBrushes")?.let { ids -> check(e.storageManager.saveFavoriteBrushes(List(ids.length()) { ids.getString(it) })) }; if(a.has("activePalette")) { val id=a.getString("activePalette"); require(e.palettes.any { it.id==id }); e.activePaletteId=id }; null }
        "scripts.list" -> JSONArray((NativeScriptCatalog.all + NativeScriptPresets(e.context.getSharedPreferences("esenho_native_scripts",0)).load()).map { JSONObject().put("id",it.id).put("name",it.name).put("source",it.source).put("builtin",it.id.startsWith("example:")) })
        "scripts.save" -> {
            val store=NativeScriptPresets(e.context.getSharedPreferences("esenho_native_scripts",0))
            val id=a.optString("id").takeIf { it.isNotBlank() }
            require(id == null || store.load().any { it.id == id }) { "Preset inexistente ou de fábrica" }
            val (_,saved)=store.save(store.load(),id,a.getString("name"),a.getString("source"))
            JSONObject().put("id",saved.id).put("name",saved.name).put("source",saved.source)
        }
        "scripts.remove" -> NativeScriptPresets(e.context.getSharedPreferences("esenho_native_scripts",0)).remove(a.getString("id"))
        "storage.get" -> e.context.getSharedPreferences("esenho_script_data",0).getString(a.getString("key"),null)
        "storage.set" -> { e.context.getSharedPreferences("esenho_script_data",0).edit().putString(a.getString("key"),a.getString("value")).apply(); null }
        "storage.remove" -> { e.context.getSharedPreferences("esenho_script_data",0).edit().remove(a.getString("key")).apply(); null }
        else -> error("Comando desconhecido: $op")
    }

}
