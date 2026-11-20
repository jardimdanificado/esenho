#!/usr/bin/env python3
"""Adapt Android editor sources for the JVM without maintaining a second editor."""
from pathlib import Path
import re, shutil, json
root = Path(__file__).resolve().parent.parent
out = root / 'desktop/build/generated/editor'
if out.exists(): shutil.rmtree(out)
base = root / 'android/app/src/main/java'
for src in base.rglob('*'):
    if src.suffix not in ('.kt', '.java') or src.name in ('WebmWriter.kt', 'VectorFont.kt'): continue
    text = src.read_text()
    if src.name == 'NativePainterActivity.kt':
        start = text.index('@Composable\nfun EsenhoNativeTheme')
        imports = text[:text.index('class NativePainterActivity')]
        imports = '\n'.join(line for line in imports.splitlines() if not any(x in line for x in ('ContentValues','android.os.Build','android.os.Bundle','android.os.Environment','MediaStore','ComponentActivity','setContent','WindowCompat','androidx.lifecycle','LocalLifecycleOwner')))
        text = imports + '\n' + text[start:]
        a = text.index('    val lifecycleOwner =')
        b = text.index('    BackHandler(', a)
        text = text[:a] + '    DisposableEffect(Unit) { onDispose { engine.isAnimationPlaying = false; currentScriptSession?.close() } }\n' + text[b:]
    text = text.replace('import androidx.compose.ui.res.vectorResource', '')
    text = text.replace('import androidx.compose.ui.res.painterResource', 'import androidx.compose.ui.graphics.vector.rememberVectorPainter')
    text = text.replace('ImageVector.vectorResource(R.drawable.ic_eraser)', 'app.esenho.desktop.DesktopIcons.Eraser')
    text = text.replace('painterResource(R.drawable.ic_eraser)', 'rememberVectorPainter(app.esenho.desktop.DesktopIcons.Eraser)')
    text = text.replace('System.loadLibrary("esenho_core")', 'app.esenho.desktop.NativeLibraries.load("esenho_core")')
    text = text.replace('System.loadLibrary("esenho_script")', 'app.esenho.desktop.NativeLibraries.load("esenho_script")')
    text = text.replace('path.startsWith("content://")', '(path.startsWith("content://") || path.startsWith("file:"))')
    if src.name == 'NativePainterActivity.kt':
        text = text.replace('    fun markScriptPivot(', """    app.esenho.desktop.DesktopShortcuts(canvasViewRef) { command ->
        when(command) {
            "save" -> saveProjectLauncher.launch("projeto.esenho")
            "open" -> openProjectLauncher.launch(arrayOf("application/x-esenho", "application/octet-stream"))
            "new" -> showNewProjectDialog = true
            "export" -> showExportDialog = true
            "undo" -> { engine.undo(); refreshState() }
            "redo" -> { engine.redo(); refreshState() }
            "vector" -> { activePanel = null; engine.vectors.switchMode(true); refreshState(false) }
            "raster" -> { activePanel = null; engine.vectors.switchMode(false); refreshState(false) }
            "toggleTools" -> { toggleTools() }
            "vectorObjects" -> { vectorTabRequest = null; activePanel = WorkspacePanel.VECTOR; refreshState(false) }
            "vectorColor" -> { activePanel = WorkspacePanel.COLOR; refreshState(false) }
            "vectorSelect" -> { engine.cancelActiveStroke(); engine.vectors.tool = app.esenho.nativeengine.VectorTool.SELECT; engine.currentTool = ToolMode.BRUSH; refreshState(false) }
            "vectorAll" -> { engine.vectors.selection.all(); refreshState(false) }
            "vectorClear" -> { engine.cancelActiveStroke(); engine.vectors.selection.clear(); refreshState(false) }
            "vectorCopy" -> { engine.vectors.selection.copy(); refreshState(false) }
            "vectorPaste" -> { engine.vectors.selection.paste(); refreshState(false) }
            "vectorDuplicate" -> { engine.vectors.selection.duplicate(); refreshState(false) }
            "vectorGroup" -> { engine.vectors.selection.group(); refreshState(false) }
            "vectorUngroup" -> { engine.vectors.selection.ungroup(); refreshState(false) }
            "vectorDelete" -> { engine.vectors.selection.delete(); refreshState(false) }
            "vectorNodes" -> { engine.vectors.tool = app.esenho.nativeengine.VectorTool.NODES; refreshState(false) }
            "layers" -> activePanel = WorkspacePanel.LAYERS
            "timeline" -> activePanel = WorkspacePanel.ANIMATION
            "scripts" -> activePanel = WorkspacePanel.SCRIPTS
            "filters" -> activePanel = WorkspacePanel.EFFECTS
            "brush" -> { engine.vectors.tool = app.esenho.nativeengine.VectorTool.DRAW; chooseTool(ToolMode.BRUSH) }
            "eraser" -> if (engine.vectors.enabled) { engine.vectors.deleteSelected(); refreshState(false) } else chooseTool(ToolMode.ERASER)
            "eyedropper" -> chooseTool(ToolMode.EYEDROPPER)
            "pan" -> chooseTool(ToolMode.PAN)
            "resetView" -> canvasViewRef?.resetView()
        }
    }

    fun markScriptPivot(""")
    text = text.replace('VectorFont.', 'app.esenho.desktop.graphics.VectorFont.')
    text = text.replace('android.graphics', 'app.esenho.desktop.graphics')
    text = text.replace('android.content', 'app.esenho.desktop.platform')
    text = text.replace('android.net', 'app.esenho.desktop.platform')
    text = text.replace('android.os', 'app.esenho.desktop.platform')
    text = text.replace('android.util', 'app.esenho.desktop.platform')
    text = text.replace('android.widget', 'app.esenho.desktop.platform')
    text = text.replace('android.view', 'app.esenho.desktop.platform')
    text = text.replace('import androidx.annotation.Keep', 'import app.esenho.desktop.platform.Keep')
    text = text.replace('import androidx.compose.ui.platform.LocalContext', 'import app.esenho.desktop.platform.LocalContext')
    text = text.replace('import androidx.compose.ui.platform.LocalConfiguration', 'import app.esenho.desktop.platform.LocalConfiguration')
    text = text.replace('import androidx.activity.compose.', 'import app.esenho.desktop.platform.')
    text = text.replace('import androidx.activity.result.contract.ActivityResultContracts', 'import app.esenho.desktop.platform.ActivityResultContracts')
    text = text.replace('import androidx.compose.ui.viewinterop.AndroidView', 'import app.esenho.desktop.platform.DesktopCanvasView')
    text = text.replace('AndroidView(', 'DesktopCanvasView(')
    target = out / src.relative_to(base)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)

shutil.copyfile(root / 'desktop/EsenhoDesktop.kt', out / 'EsenhoDesktop.kt')

version = json.loads((root / 'package.json').read_text())['version']
target = out / 'app/esenho/desktop/BuildVersion.kt'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text('package app.esenho.desktop\nobject BuildVersion { const val VERSION = ' + json.dumps(version) + ' }\n')
