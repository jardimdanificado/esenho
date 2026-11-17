package app.esenho.desktop

import androidx.compose.runtime.*
import app.esenho.ui.EsenhoCanvasView
import java.awt.KeyboardFocusManager
import java.awt.event.KeyEvent
import javax.swing.SwingUtilities

/** Editor shortcuts stay scoped to its window and leave text editing commands with Compose. */
@Composable
fun DesktopShortcuts(canvas: EsenhoCanvasView?, onCommand: (String) -> Unit) {
    val command by rememberUpdatedState(onCommand)
    SideEffect {
        if (java.lang.Boolean.getBoolean("esenho.uiSmoke")) desktopUiTestCommand = onCommand
    }
    DisposableEffect(canvas) {
        val manager = KeyboardFocusManager.getCurrentKeyboardFocusManager()
        val dispatcher =
            java.awt.KeyEventDispatcher { event ->
                if (
                    canvas == null ||
                        event.id != KeyEvent.KEY_PRESSED ||
                        !generateSequence(manager.activeWindow) { it.owner }
                            .any { it === SwingUtilities.getWindowAncestor(canvas) }
                )
                    false
                else {
                    val control = event.isControlDown || event.isMetaDown
                    val action =
                        when {
                            control && event.keyCode == KeyEvent.VK_S -> "save"
                            control && event.keyCode == KeyEvent.VK_O -> "open"
                            control && event.keyCode == KeyEvent.VK_N -> "new"
                            control && event.keyCode == KeyEvent.VK_E -> "export"
                            control && canvas.isFocusOwner && event.keyCode == KeyEvent.VK_Z ->
                                if (event.isShiftDown) "redo" else "undo"
                            control && canvas.isFocusOwner && event.keyCode == KeyEvent.VK_Y ->
                                "redo"
                            event.keyCode == KeyEvent.VK_F6 -> "layers"
                            event.keyCode == KeyEvent.VK_F7 -> "timeline"
                            event.keyCode == KeyEvent.VK_F8 -> "scripts"
                            event.keyCode == KeyEvent.VK_F9 -> "filters"
                            canvas.isFocusOwner && !control && !event.isAltDown ->
                                when (event.keyCode) {
                                    KeyEvent.VK_B -> "brush"
                                    KeyEvent.VK_E -> "eraser"
                                    KeyEvent.VK_I -> "eyedropper"
                                    KeyEvent.VK_H -> "pan"
                                    KeyEvent.VK_0 -> "resetView"
                                    else -> null
                                }
                            else -> null
                        }
                    if (action == null) false
                    else {
                        command(action)
                        event.consume()
                        true
                    }
                }
            }
        manager.addKeyEventDispatcher(dispatcher)
        onDispose { manager.removeKeyEventDispatcher(dispatcher) }
    }
}
