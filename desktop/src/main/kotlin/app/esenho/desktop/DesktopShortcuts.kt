package app.esenho.desktop

import androidx.compose.runtime.*
import app.esenho.ui.EsenhoCanvasView
import java.awt.KeyboardFocusManager
import java.awt.event.KeyEvent

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
                            .any { it === canvas.editorWindow }
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
                            control && canvas.hasEditorFocus && event.keyCode == KeyEvent.VK_Z ->
                                if (event.isShiftDown) "redo" else "undo"
                            control && canvas.hasEditorFocus && event.keyCode == KeyEvent.VK_Y ->
                                "redo"
                            control && canvas.hasEditorFocus && canvas.engine?.vectors?.enabled == true && event.keyCode == KeyEvent.VK_A -> "vectorAll"
                            control && canvas.hasEditorFocus && canvas.engine?.vectors?.enabled == true && event.keyCode == KeyEvent.VK_C -> "vectorCopy"
                            control && canvas.hasEditorFocus && canvas.engine?.vectors?.enabled == true && event.keyCode == KeyEvent.VK_V -> "vectorPaste"
                            control && canvas.hasEditorFocus && canvas.engine?.vectors?.enabled == true && event.keyCode == KeyEvent.VK_D -> "vectorDuplicate"
                            control && canvas.hasEditorFocus && canvas.engine?.vectors?.enabled == true && event.keyCode == KeyEvent.VK_G -> if (event.isShiftDown) "vectorUngroup" else "vectorGroup"
                            canvas.hasEditorFocus && !control && !event.isAltDown &&
                                canvas.engine?.meshes?.enabled == true ->
                                when (event.keyCode) {
                                    KeyEvent.VK_Q -> "meshSelect"
                                    KeyEvent.VK_W -> "meshOrbit"
                                    KeyEvent.VK_E -> "meshPan"
                                    KeyEvent.VK_R -> "meshMove"
                                    KeyEvent.VK_T -> "meshRotate"
                                    KeyEvent.VK_Y -> "meshScale"
                                    KeyEvent.VK_U -> "meshVertex"
                                    KeyEvent.VK_I -> "meshFace"
                                    KeyEvent.VK_F -> "meshFrame"
                                    KeyEvent.VK_0 -> "meshResetCamera"
                                    KeyEvent.VK_DELETE -> "meshRemove"
                                    else -> null
                                }
                            event.keyCode == KeyEvent.VK_F6 -> "layers"
                            event.keyCode == KeyEvent.VK_F7 -> "timeline"
                            event.keyCode == KeyEvent.VK_F8 -> "scripts"
                            event.keyCode == KeyEvent.VK_F9 -> "filters"
                            canvas.hasEditorFocus && !control && !event.isAltDown ->
                                when (event.keyCode) {
                                    KeyEvent.VK_DELETE -> if (canvas.engine?.vectors?.enabled == true) "vectorDelete" else null
                                    KeyEvent.VK_ESCAPE -> if (canvas.engine?.vectors?.enabled == true) "vectorClear" else null
                                    KeyEvent.VK_V -> if (canvas.engine?.vectors?.enabled == true) "vectorSelect" else null
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
