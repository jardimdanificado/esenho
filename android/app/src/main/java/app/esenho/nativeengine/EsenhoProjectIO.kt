package app.esenho.nativeengine

import android.graphics.Bitmap
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** Editable project archive: canvas metadata plus one lossless PNG per layer. */
object EsenhoProjectIO {
    data class LayerSnapshot(
        val bitmap: Bitmap,
        val opacity: Int,
        val visible: Boolean,
        val blend: Int,
        val alphaLock: Boolean,
        val clipping: Boolean
    )
    data class Snapshot(
        val width: Int,
        val height: Int,
        val active: Int,
        val layers: List<LayerSnapshot>,
        val frames: List<Bitmap>,
        val frameDurations: List<Int>,
        val fps: Int,
        val currentFrame: Int
    )

    fun capture(engine: EsenhoEngine): Snapshot {
        engine.captureCurrentFrame()
        val layers = mutableListOf<LayerSnapshot>()
        val frames = mutableListOf<Bitmap>()
        val frameDurations = mutableListOf<Int>()
        try {
            engine.layers.forEach { layer ->
                val bitmap = Bitmap.createBitmap(engine.width, engine.height, Bitmap.Config.ARGB_8888)
                check(EsenhoNativeBridge.nativeLayerGetBitmap(layer.id, bitmap)) { "Não foi possível ler a camada ${layer.name}" }
                layers += LayerSnapshot(bitmap, layer.opacity, layer.visible, layer.blendMode.id, layer.alphaLock, layer.clipping)
            }
            engine.animationFrames.forEach { frame ->
                frames += frame.bitmap.copy(Bitmap.Config.ARGB_8888, false)
                frameDurations += frame.duration
            }
            return Snapshot(
                engine.width,
                engine.height,
                engine.layers.indexOfFirst { it.id == engine.activeLayerIndex },
                layers,
                frames,
                frameDurations,
                engine.animationFps,
                engine.currentFrameIndex
            )
        } catch (failure: Throwable) {
            layers.forEach { it.bitmap.recycle() }
            frames.forEach { it.recycle() }
            throw failure
        }
    }

    fun save(engine: EsenhoEngine, output: OutputStream) {
        val snapshot = capture(engine)
        try {
            write(snapshot, output)
        } finally {
            recycle(snapshot)
        }
    }

    fun recycle(snapshot: Snapshot) {
        snapshot.layers.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
        snapshot.frames.forEach { if (!it.isRecycled) it.recycle() }
    }

    fun write(snapshot: Snapshot, output: OutputStream) {
        val zip = ZipOutputStream(output)
        val layersJson = org.json.JSONArray()
        snapshot.layers.forEach { layer ->
            layersJson.put(org.json.JSONObject().put("opacity", layer.opacity).put("visible", layer.visible)
                .put("blend", layer.blend).put("alphaLock", layer.alphaLock).put("clipping", layer.clipping))
        }
        val metadata = org.json.JSONObject().put("format", 1).put("width", snapshot.width).put("height", snapshot.height)
            .put("active", snapshot.active).put("layers", layersJson).put("fps", snapshot.fps)
            .put("currentFrame", snapshot.currentFrame).put("frameCount", snapshot.frames.size)
            .put("frameDurations", org.json.JSONArray(snapshot.frameDurations))
        zip.putNextEntry(ZipEntry("project.json"))
        zip.write(metadata.toString().toByteArray(Charsets.UTF_8))
        zip.closeEntry()
        snapshot.layers.forEachIndexed { i, layer ->
            zip.putNextEntry(ZipEntry("layers/$i.png"))
            layer.bitmap.compress(Bitmap.CompressFormat.PNG, 100, zip)
            zip.closeEntry()
        }
        snapshot.frames.forEachIndexed { i, frame ->
            zip.putNextEntry(ZipEntry("animation/$i.png"))
            frame.compress(Bitmap.CompressFormat.PNG, 100, zip)
            zip.closeEntry()
        }
        zip.finish()
    }

    fun load(engine: EsenhoEngine, input: InputStream) {
        val entries = mutableMapOf<String, ByteArray>()
        ZipInputStream(input).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (!entry.isDirectory) entries[entry.name] = zip.readBytes()
                zip.closeEntry()
            }
        }
        val meta = entries["project.json"] ?: error("Arquivo de projeto inválido")
        val json = org.json.JSONObject(meta.toString(Charsets.UTF_8))
        require(json.optInt("format") == 1) { "Versão de projeto não suportada" }
        val width = json.getInt("width").coerceIn(1, 8192)
        val height = json.getInt("height").coerceIn(1, 8192)
        val savedLayers = json.getJSONArray("layers")
        require(savedLayers.length() > 0) { "O projeto não contém camadas" }

        engine.initEngine(width, height)
        while (engine.layers.size > savedLayers.length() && engine.layers.size > 1) {
            EsenhoNativeBridge.nativeLayerDelete(engine.layers.last().id)
            engine.syncLayers()
        }
        while (engine.layers.size < savedLayers.length()) engine.addLayer()
        val layerList = engine.layers.toList()
        layerList.forEachIndexed { index, layer ->
            EsenhoNativeBridge.nativeLayerClear(layer.id)
            entries["layers/$index.png"]?.let { bytes ->
                val bitmap = BitmapFactoryCompat.decode(bytes) ?: error("Imagem da camada ${index + 1} inválida")
                EsenhoNativeBridge.nativeLayerDrawBitmap(layer.id, bitmap, 0, 0, width, height)
                bitmap.recycle()
            }
            if (index < savedLayers.length()) {
                val item = savedLayers.getJSONObject(index)
                EsenhoNativeBridge.nativeLayerSetOpacity(layer.id, item.optInt("opacity", 255))
                EsenhoNativeBridge.nativeLayerSetVisible(layer.id, if (item.optBoolean("visible", true)) 1 else 0)
                EsenhoNativeBridge.nativeLayerSetBlendMode(layer.id, item.optInt("blend", LayerBlendMode.NORMAL.id))
                EsenhoNativeBridge.nativeLayerSetAlphaLock(layer.id, if (item.optBoolean("alphaLock")) 1 else 0)
                EsenhoNativeBridge.nativeLayerSetClipping(layer.id, if (item.optBoolean("clipping")) 1 else 0)
            }
        }
        layerList.getOrNull(json.optInt("active", 0).coerceIn(layerList.indices))?.let { EsenhoNativeBridge.nativeLayerSelect(it.id) }
        engine.animationFrames.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
        engine.animationFrames.clear()
        val frameCount = json.optInt("frameCount", 0).coerceAtLeast(0)
        repeat(frameCount) { index ->
            val bytes = entries["animation/$index.png"] ?: error("Quadro de animação ${index + 1} ausente")
            val decoded = BitmapFactoryCompat.decode(bytes) ?: error("Quadro de animação ${index + 1} inválido")
            val bitmap = decoded.copy(Bitmap.Config.ARGB_8888, true)
            decoded.recycle()
            val durations = json.optJSONArray("frameDurations")
            engine.animationFrames += AnimationCel("Frame ${index + 1}", bitmap, durations?.optInt(index, 1)?.coerceIn(1, 120) ?: 1)
        }
        if (engine.animationFrames.isEmpty()) {
            val frame = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            engine.render(frame)
            engine.animationFrames += AnimationCel("Frame 1", frame)
        }
        engine.animationFps = json.optInt("fps", 12).coerceIn(1, 30)
        engine.currentFrameIndex = json.optInt("currentFrame", 0).coerceIn(engine.animationFrames.indices)
        engine.syncLayers()
        engine.getRenderBitmap()
    }
}

private object BitmapFactoryCompat {
    fun decode(bytes: ByteArray): Bitmap? = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}
