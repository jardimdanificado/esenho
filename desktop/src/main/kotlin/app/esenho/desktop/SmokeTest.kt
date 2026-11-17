package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import app.esenho.scripting.*
import app.esenho.ui.EsenhoCanvasView
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.swing.SwingUtilities

/** Exercises shared editor behavior against the real desktop JNI libraries, without a display. */
fun smokeTest() {
    val context = Context()
    val engine = EsenhoEngine(context, 128, 128)
    check(EsenhoNativeBridge.nativeGetBrushCount() > 0)
    check(EsenhoNativeBridge.nativeGetFilterCount() > 0)
    val transparent = Bitmap(2, 2).apply { eraseColor(0x8080ff40.toInt()) }
    val imported = engine.importImageToLayer(transparent)
    val restored = Bitmap(engine.width, engine.height)
    check(EsenhoNativeBridge.nativeLayerGetBitmap(imported, restored))
    check(restored.getPixel(engine.width / 2, engine.height / 2) == transparent.getPixel(0, 0)) {
        "Canais semitransparentes alterados no JNI"
    }
    engine.deleteLayer(imported)
    val initialLayerCount = engine.layers.size
    engine.currentColor = Color.rgb(220, 30, 40)
    val before = engine.getRenderBitmap()!!.getPixel(64, 64)
    engine.onTouchDown(64f, 64f, 1f)
    engine.onTouchMove(80f, 64f, 1f)
    engine.onTouchUp(80f, 64f)
    val after = engine.getRenderBitmap()!!.getPixel(64, 64)
    check(before != after) { "Traço desktop não alterou pixels" }
    check(engine.undo())
    check(engine.getRenderBitmap()!!.getPixel(64, 64) == before)
    check(engine.redo())
    check(engine.getRenderBitmap()!!.getPixel(64, 64) == after)
    engine.addLayer()
    check(engine.layers.size == initialLayerCount + 1)
    engine.selectRect(10, 10, 30, 30)
    check(engine.selectionActive)
    check(engine.fillSelection(Color.rgb(20, 90, 200)))
    engine.clearSelection()
    val archive = ByteArrayOutputStream().also { EsenhoProjectIO.save(engine, it) }.toByteArray()
    engine.createDocument(64, 64)
    EsenhoProjectIO.load(engine, archive.inputStream())
    check(
        engine.width == 128 && engine.height == 128 && engine.layers.size == initialLayerCount + 1
    )
    check(engine.getRenderBitmap()!!.getPixel(15, 15) == Color.rgb(20, 90, 200))
    engine.addAnimationFrame()
    check(engine.renderAnimationFrames().isNotEmpty())
    val bitmap = engine.getRenderBitmap()!!
    for (format in
        listOf(Bitmap.CompressFormat.PNG, Bitmap.CompressFormat.JPEG, Bitmap.CompressFormat.WEBP)) {
        val bytes =
            ByteArrayOutputStream().also { check(bitmap.compress(format, 95, it)) }.toByteArray()
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeStream(bytes.inputStream(), null, bounds)
        check(bounds.outWidth == engine.width && bounds.outHeight == engine.height) {
            "Dimensões inválidas: $format"
        }
        val decoded =
            checkNotNull(BitmapFactory.decodeStream(bytes.inputStream())) {
                "Falha ao reabrir $format"
            }
        check(decoded.width == bitmap.width && decoded.height == bitmap.height)
    }
    val gif =
        ByteArrayOutputStream()
            .also { app.esenho.ui.GifWriter.write(listOf(bitmap, bitmap), 12, true, it) }
            .toByteArray()
    check(String(gif.copyOfRange(0, 3)) == "GIF")
    val video = java.io.File.createTempFile("esenho-export-", ".webm")
    try {
        app.esenho.ui.WebmWriter.write(listOf(bitmap, bitmap), 12, video)
        check(video.length() > 0)
    } finally {
        video.delete()
    }
    val invert = engine.filterCatalog.first { it.id.contains("invert") }
    check(engine.applyFilter(invert))
    val matrix = Matrix()
    val source = floatArrayOf(0f, 0f, 10f, 0f, 10f, 10f, 0f, 10f)
    val destination = floatArrayOf(1f, 2f, 15f, 0f, 12f, 16f, 3f, 12f)
    check(matrix.setPolyToPoly(source, 0, destination, 0, 4))
    val mapped = source.clone()
    matrix.mapPoints(mapped)
    check(mapped.indices.all { kotlin.math.abs(mapped[it] - destination[it]) < .001f })
    val inverse = Matrix()
    check(matrix.invert(inverse))
    inverse.mapPoints(mapped)
    check(mapped.indices.all { kotlin.math.abs(mapped[it] - source[it]) < .001f })
    val done = CountDownLatch(1)
    var scriptError: String? = null
    SwingUtilities.invokeAndWait {
        val canvas = EsenhoCanvasView(context).apply { this.engine = engine }
        val api = NativeScriptApi(engine, canvas, {}, { engine.currentTool = it }, { _, _ -> })
        ScriptSession(
                context,
                api,
                {},
                {},
                {
                    scriptError = it
                    done.countDown()
                },
            )
            .run(
                "esenho.layers.create('Script desktop'); esenho.color.set('#ff0000'); esenho.brush.stroke({points:[{x:1,y:1,pressure:1},{x:8,y:8,pressure:1}]});"
            )
    }
    check(done.await(20, TimeUnit.SECONDS)) { "Runtime JavaScript não concluiu" }
    check(scriptError == null) { "Runtime JavaScript: $scriptError" }
    check(engine.layers.size == initialLayerCount + 2) { "Script não criou camada" }
    println(
        "Desktop smoke test: pincéis, filtros, traço, undo/redo, camadas, seleção, projeto, animação, PNG/JPEG/WebP/GIF/WebM, filtro, homografia e QuickJS OK"
    )
}
