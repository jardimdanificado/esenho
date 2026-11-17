package app.esenho.desktop

import java.awt.Component
import java.awt.Container
import java.io.File
import javax.imageio.ImageIO
import org.jetbrains.skia.Image
import org.jetbrains.skiko.SkiaLayer

internal var desktopUiTestCommand: ((String) -> Unit)? = null

private fun children(component: Component): Sequence<Component> = sequence {
    yield(component)
    if (component is Container) component.components.forEach { yieldAll(children(it)) }
}

/** Captures only this application's render buffers, including the interop canvas. */
fun captureEditor(window: java.awt.Window, output: File) {
    val windows =
        java.awt.Window.getWindows().filter { candidate ->
            candidate.isShowing && generateSequence(candidate) { it.owner }.any { it === window }
        }
    val layers =
        windows
            .flatMap { children(it).filterIsInstance<SkiaLayer>().toList() }
            .filter { it.isShowing }
    check(layers.isNotEmpty())
    val bounds =
        layers
            .map { java.awt.Rectangle(it.locationOnScreen, it.size) }
            .reduce { a, b -> a.union(b) }
    val result =
        java.awt.image.BufferedImage(
            bounds.width,
            bounds.height,
            java.awt.image.BufferedImage.TYPE_INT_ARGB,
        )
    val graphics = result.createGraphics()
    try {
        for (layer in layers) {
            val point = layer.locationOnScreen
            val bitmap = layer.screenshot() ?: continue
            val chrome =
                bitmap.use {
                    Image.makeFromBitmap(it).use { image ->
                        image.encodeToData()!!.use { data ->
                            ImageIO.read(data.bytes.inputStream())
                        }
                    }
                }
            for (view in
                children(layer.parent).filterIsInstance<app.esenho.ui.EsenhoCanvasView>()) {
                val position = view.locationOnScreen
                val copy = graphics.create() as java.awt.Graphics2D
                try {
                    copy.translate(position.x - bounds.x, position.y - bounds.y)
                    copy.clipRect(0, 0, view.width, view.height)
                    view.paint(copy)
                } finally {
                    copy.dispose()
                }
            }
            graphics.drawImage(
                chrome,
                point.x - bounds.x,
                point.y - bounds.y,
                layer.width,
                layer.height,
                null,
            )
        }
    } finally {
        graphics.dispose()
    }
    output.parentFile?.mkdirs()
    ImageIO.write(result, "png", output)
    println("Desktop UI screenshot: ${output.absolutePath} (${layers.size} render buffers)")
}

fun exerciseDesktopCanvas(window: java.awt.Window) {
    val view = children(window).filterIsInstance<app.esenho.ui.EsenhoCanvasView>().first()
    check(view.width > 0 && view.height > 0)
    val engine = checkNotNull(view.engine)
    val before =
        engine
            .getRenderBitmap()!!
            .toImage()
            .getRGB(0, 0, engine.width, engine.height, null, 0, engine.width)
    val x = view.width / 2
    val y = view.height / 2
    val time = System.currentTimeMillis()
    view.dispatchEvent(
        java.awt.event.MouseEvent(
            view,
            java.awt.event.MouseEvent.MOUSE_PRESSED,
            time,
            java.awt.event.InputEvent.BUTTON1_DOWN_MASK,
            x,
            y,
            1,
            false,
            1,
        )
    )
    view.dispatchEvent(
        java.awt.event.MouseEvent(
            view,
            java.awt.event.MouseEvent.MOUSE_DRAGGED,
            time + 20,
            java.awt.event.InputEvent.BUTTON1_DOWN_MASK,
            x + 40,
            y + 20,
            0,
            false,
            0,
        )
    )
    view.dispatchEvent(
        java.awt.event.MouseEvent(
            view,
            java.awt.event.MouseEvent.MOUSE_RELEASED,
            time + 40,
            0,
            x + 40,
            y + 20,
            1,
            false,
            1,
        )
    )
    val after =
        engine
            .getRenderBitmap()!!
            .toImage()
            .getRGB(0, 0, engine.width, engine.height, null, 0, engine.width)
    check(!before.contentEquals(after)) { "Mouse desktop não desenhou no documento" }
    check(engine.canUndo)
    println("Desktop UI: entrada de mouse e renderização OK")
}
