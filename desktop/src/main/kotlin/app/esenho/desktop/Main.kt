package app.esenho.desktop

import androidx.compose.runtime.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.*
import app.esenho.desktop.platform.*
import app.esenho.ui.*
import java.io.File
import javax.swing.JFileChooser
import javax.swing.JOptionPane

@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
fun main(args: Array<String>) {
    if (args.contains("--smoke-test")) {
        smokeTest()
        return
    }
    System.setProperty("compose.interop.blending", "true")
    System.setProperty("esenho.uiSmoke", args.contains("--ui-smoke-test").toString())
    application {
        val state = rememberWindowState(width = 1440.dp, height = 960.dp)
        val defaultErrors = LocalWindowExceptionHandlerFactory.current
        val errors = remember {
            object : WindowExceptionHandlerFactory {
                override fun exceptionHandler(window: java.awt.Window) =
                    object : WindowExceptionHandler {
                        override fun onException(throwable: Throwable) {
                            throwable.printStackTrace()
                            if (args.contains("--ui-smoke-test")) kotlin.system.exitProcess(1)
                            defaultErrors.exceptionHandler(window).onException(throwable)
                        }
                    }
            }
        }
        CompositionLocalProvider(LocalWindowExceptionHandlerFactory provides errors) {
            Window(onCloseRequest = ::exitApplication, title = "Esenho", state = state) {
                if (args.contains("--ui-smoke-test")) {
                    LaunchedEffect(Unit) {
                        kotlinx.coroutines.delay(3000)
                        exerciseDesktopCanvas(window)
                        captureEditor(window, File("desktop/build/ui-smoke.png"))
                        for (panel in listOf("layers", "timeline", "scripts", "filters")) {
                            checkNotNull(desktopUiTestCommand)(panel)
                            kotlinx.coroutines.delay(500)
                            captureEditor(window, File("desktop/build/ui-$panel.png"))
                        }
                        exitApplication()
                    }
                }
                val context = remember { Context() }
                CompositionLocalProvider(
                    LocalContext provides context,
                    LocalConfiguration provides
                        Configuration(
                            state.size.width.value.toInt(),
                            state.size.height.value.toInt(),
                        ),
                ) {
                    EsenhoNativeTheme { EsenhoMainScreen(onExport = ::export) }
                }
            }
        }
    }
}

private fun export(request: NativeExportRequest) {
    val extension = request.format.name.lowercase().let { if (it == "jpeg") "jpg" else it }
    val chooser =
        JFileChooser().apply {
            selectedFile = File("esenho_${System.currentTimeMillis()}.$extension")
        }
    if (chooser.showSaveDialog(null) != JFileChooser.APPROVE_OPTION) {
        request.frames.forEach { it.recycle() }
        return
    }
    val file = chooser.selectedFile
    if (
        file.exists() &&
            JOptionPane.showConfirmDialog(
                null,
                "Substituir ${file.name}?",
                "Esenho",
                JOptionPane.YES_NO_OPTION,
            ) != JOptionPane.YES_OPTION
    ) {
        request.frames.forEach { it.recycle() }
        return
    }
    // The live composite belongs to the editor. The encoder owns this snapshot.
    val snapshot =
        request.copy(
            bitmap =
                request.bitmap?.copy(app.esenho.desktop.graphics.Bitmap.Config.ARGB_8888, false)
        )
    Thread(
            {
                try {
                    when (snapshot.format) {
                        NativeExportRequest.Format.GIF ->
                            file.outputStream().use {
                                GifWriter.write(snapshot.frames, snapshot.fps, snapshot.loop, it)
                            }
                        NativeExportRequest.Format.WEBM ->
                            WebmWriter.write(snapshot.frames, snapshot.fps, file)
                        else ->
                            file.outputStream().use {
                                check(
                                    snapshot.bitmap!!.compress(
                                        app.esenho.desktop.graphics.Bitmap.CompressFormat.valueOf(
                                            snapshot.format.name
                                        ),
                                        95,
                                        it,
                                    )
                                ) {
                                    "Falha ao exportar imagem"
                                }
                            }
                    }
                    javax.swing.SwingUtilities.invokeLater {
                        Toast.makeText(
                                Context(),
                                "Arquivo exportado: ${file.name}",
                                Toast.LENGTH_SHORT,
                            )
                            .show()
                    }
                } catch (failure: Exception) {
                    javax.swing.SwingUtilities.invokeLater {
                        JOptionPane.showMessageDialog(
                            null,
                            failure.message,
                            "Falha ao exportar",
                            JOptionPane.ERROR_MESSAGE,
                        )
                    }
                } finally {
                    snapshot.bitmap?.recycle()
                    snapshot.frames.forEach { if (!it.isRecycled) it.recycle() }
                }
            },
            "Esenho-Export",
        )
        .start()
}
