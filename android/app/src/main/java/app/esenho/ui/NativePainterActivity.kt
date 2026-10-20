package app.esenho.ui

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.AtomicFile
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import app.esenho.R
import app.esenho.nativeengine.*
import app.esenho.ui.components.*
import java.io.OutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

class NativePainterActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        setContent { EsenhoNativeTheme { EsenhoMainScreen(onExport = ::export) } }
    }

    private fun export(request: NativeExportRequest) {
        when (request.format) {
            NativeExportRequest.Format.PNG ->
                request.bitmap?.let { exportBitmapToGallery(it, Bitmap.CompressFormat.PNG) }
            NativeExportRequest.Format.JPEG ->
                request.bitmap?.let { exportBitmapToGallery(it, Bitmap.CompressFormat.JPEG) }
            NativeExportRequest.Format.WEBP ->
                request.bitmap?.let {
                    val format =
                        if (Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSY
                        else Bitmap.CompressFormat.WEBP
                    exportBitmapToGallery(it, format)
                }
            NativeExportRequest.Format.GIF ->
                exportGifToGallery(request.frames, request.fps, request.loop)
            NativeExportRequest.Format.WEBM -> exportWebmToGallery(request.frames, request.fps)
        }
    }

    private fun exportBitmapToGallery(
        bitmap: Bitmap,
        format: Bitmap.CompressFormat = Bitmap.CompressFormat.PNG,
    ) {
        val isJpeg = format == Bitmap.CompressFormat.JPEG
        val isWebp =
            format == Bitmap.CompressFormat.WEBP ||
                (Build.VERSION.SDK_INT >= 30 && format == Bitmap.CompressFormat.WEBP_LOSSY)
        val ext =
            when {
                isJpeg -> "jpg"
                isWebp -> "webp"
                else -> "png"
            }
        val mime =
            when {
                isJpeg -> "image/jpeg"
                isWebp -> "image/webp"
                else -> "image/png"
            }
        val filename = "esenho_${System.currentTimeMillis()}.$ext"
        val fos: OutputStream?

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val contentValues =
                ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(
                        MediaStore.MediaColumns.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/Esenho",
                    )
                }
            val uri =
                contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
            fos = uri?.let { contentResolver.openOutputStream(it) }
        } else {
            val imagesDir =
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                    .toString()
            val image = java.io.File(imagesDir, filename)
            fos = java.io.FileOutputStream(image)
        }

        fos?.use {
            val quality = if (isJpeg) 95 else 100
            bitmap.compress(format, quality, it)
            Toast.makeText(this, "Desenho salvo com sucesso na Galeria ($ext)!", Toast.LENGTH_SHORT)
                .show()
        } ?: run { Toast.makeText(this, "Falha ao exportar imagem", Toast.LENGTH_SHORT).show() }
    }

    private fun exportGifToGallery(frames: List<Bitmap>, fps: Int, loop: Boolean) {
        val filename = "esenho_${System.currentTimeMillis()}.gif"
        val output =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values =
                    ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                        put(MediaStore.MediaColumns.MIME_TYPE, "image/gif")
                        put(
                            MediaStore.MediaColumns.RELATIVE_PATH,
                            Environment.DIRECTORY_PICTURES + "/Esenho",
                        )
                    }
                contentResolver
                    .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                    ?.let(contentResolver::openOutputStream)
            } else {
                val dir =
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                java.io.FileOutputStream(java.io.File(dir, filename))
            }
        runCatching {
                val stream = output ?: error("Não foi possível criar o arquivo")
                stream.use { GifWriter.write(frames, fps, loop, it) }
            }
            .onSuccess {
                Toast.makeText(this, "GIF exportado para a Galeria", Toast.LENGTH_SHORT).show()
            }
            .onFailure { Toast.makeText(this, "Falha ao exportar GIF", Toast.LENGTH_SHORT).show() }
            .also { frames.forEach { frame -> if (!frame.isRecycled) frame.recycle() } }
    }

    private fun exportWebmToGallery(frames: List<Bitmap>, fps: Int) {
        val filename = "esenho_${System.currentTimeMillis()}.webm"
        val temp = java.io.File(cacheDir, filename)
        Thread {
                val result = runCatching {
                    WebmWriter.write(frames, fps, temp)
                    val output =
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            val values =
                                ContentValues().apply {
                                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                                    put(MediaStore.MediaColumns.MIME_TYPE, "video/webm")
                                    put(
                                        MediaStore.MediaColumns.RELATIVE_PATH,
                                        Environment.DIRECTORY_MOVIES + "/Esenho",
                                    )
                                }
                            contentResolver
                                .insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                                ?.let(contentResolver::openOutputStream)
                        } else {
                            val dir =
                                Environment.getExternalStoragePublicDirectory(
                                    Environment.DIRECTORY_MOVIES
                                )
                            java.io.FileOutputStream(java.io.File(dir, filename))
                        } ?: error("Não foi possível criar o arquivo de vídeo")
                    output.use { stream -> temp.inputStream().use { it.copyTo(stream) } }
                }
                runOnUiThread {
                    result
                        .onSuccess {
                            Toast.makeText(
                                    this,
                                    "WebM exportado para os vídeos",
                                    Toast.LENGTH_SHORT,
                                )
                                .show()
                        }
                        .onFailure {
                            Toast.makeText(
                                    this,
                                    "Falha ao exportar WebM: ${it.message}",
                                    Toast.LENGTH_LONG,
                                )
                                .show()
                        }
                }
                temp.delete()
                frames.forEach { frame -> if (!frame.isRecycled) frame.recycle() }
            }
            .start()
    }
}

@Composable
fun EsenhoNativeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme =
            darkColorScheme(
                // Gruvbox Dark: warm surfaces, cream text and yellow interaction accents.
                primary = Color(0xFFFABD2F),
                onPrimary = Color(0xFF282828),
                onPrimaryContainer = Color(0xFFFBF1C7),
                primaryContainer = Color(0xFF504945),
                secondary = Color(0xFFB8BB26),
                onSecondary = Color(0xFF282828),
                secondaryContainer = Color(0xFF3C3836),
                onSecondaryContainer = Color(0xFFEBDBB2),
                tertiary = Color(0xFF83A598),
                onTertiary = Color(0xFF282828),
                tertiaryContainer = Color(0xFF3C3836),
                onTertiaryContainer = Color(0xFFEBDBB2),
                error = Color(0xFFFB4934),
                onError = Color(0xFF282828),
                errorContainer = Color(0xFF9D0006),
                onErrorContainer = Color(0xFFFBF1C7),
                surface = Color(0xFF282828),
                surfaceVariant = Color(0xFF3C3836),
                background = Color(0xFF1D2021),
                onBackground = Color(0xFFEBDBB2),
                onSurface = Color(0xFFEBDBB2),
                onSurfaceVariant = Color(0xFFA89984),
                outline = Color(0xFF928374),
                outlineVariant = Color(0xFF504945),
                scrim = Color(0x99000000),
                surfaceTint = Color.Transparent,
            ),
        typography =
            Typography(
                titleLarge =
                    TextStyle(
                        fontSize = 20.sp,
                        lineHeight = 26.sp,
                        fontWeight = FontWeight.SemiBold,
                    ),
                titleMedium =
                    TextStyle(
                        fontSize = 16.sp,
                        lineHeight = 22.sp,
                        fontWeight = FontWeight.SemiBold,
                    ),
                titleSmall =
                    TextStyle(
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    ),
                bodyLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
                bodyMedium = TextStyle(fontSize = 13.sp, lineHeight = 18.sp),
                bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
                labelLarge =
                    TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium),
                labelMedium =
                    TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
                labelSmall =
                    TextStyle(fontSize = 11.sp, lineHeight = 15.sp, fontWeight = FontWeight.Medium),
            ),
        shapes =
            Shapes(
                small = RoundedCornerShape(8.dp),
                medium = RoundedCornerShape(12.dp),
                large = RoundedCornerShape(16.dp),
            ),
        content = content,
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EsenhoMainScreen(onExport: (NativeExportRequest) -> Unit) {
    val context = LocalContext.current
    var canvasViewRef by remember { mutableStateOf<EsenhoCanvasView?>(null) }
    val engine = remember { EsenhoEngine(context, 1080, 1920) }
    val storageManager = remember { EsenhoStorageManager(context) }
    var sideSliderSettings by remember { mutableStateOf(storageManager.loadSideSliders()) }
    var favoriteBrushIds by remember { mutableStateOf(storageManager.loadFavoriteBrushes()) }
    val workspacePreferences = remember {
        context.getSharedPreferences("esenho_workspace", android.content.Context.MODE_PRIVATE)
    }
    var quickShelfVisible by remember {
        mutableStateOf(workspacePreferences.getBoolean("quick_shelf_visible", true))
    }
    var quickShelfRecent by remember {
        mutableStateOf(workspacePreferences.getBoolean("quick_shelf_recent", false))
    }

    var quickShelfSeparateRows by remember {
        mutableStateOf(workspacePreferences.getBoolean("quick_shelf_separate_rows", false))
    }

    var focusMode by remember { mutableStateOf(false) }
    var quickSlidersOpen by remember { mutableStateOf(false) }
    var activePanel by remember { mutableStateOf<WorkspacePanel?>(null) }
    var brushPresetRequest by remember { mutableIntStateOf(0) }
    var showWorkspaceActions by remember { mutableStateOf(false) }
    var documentTab by remember { mutableIntStateOf(0) }
    var showAssistMenu by remember { mutableStateOf(false) }
    BackHandler(enabled = focusMode) { focusMode = false }

    // UI Dialog & Drawer States
    var showExportDialog by remember { mutableStateOf(false) }
    var showNewProjectDialog by remember { mutableStateOf(false) }
    var showProjectManager by remember { mutableStateOf(false) }
    var showClearLayerConfirm by remember { mutableStateOf(false) }
    var showCanvasResizeDialog by remember { mutableStateOf(false) }
    var canvasResizeWidth by remember { mutableStateOf(engine.width.toString()) }
    var canvasResizeHeight by remember { mutableStateOf(engine.height.toString()) }
    var canvasResizeError by remember { mutableStateOf<String?>(null) }

    // Floating Tool Dropdowns
    var showSelectMenu by remember { mutableStateOf(false) }
    var toolMenuCategory by remember { mutableStateOf<String?>(null) }
    var showSelectionOpMenu by remember { mutableStateOf(false) }
    var showSelectionFeatherDialog by remember { mutableStateOf(false) }
    var selectionFeatherRadius by remember { mutableFloatStateOf(4f) }
    var showCreateBrushTipDialog by remember { mutableStateOf(false) }
    var customBrushTipName by remember { mutableStateOf("") }
    var showCreateGrainDialog by remember { mutableStateOf(false) }
    var customGrainName by remember { mutableStateOf("") }
    var showWandSettings by remember { mutableStateOf(false) }
    var showTransformModeMenu by remember { mutableStateOf(false) }
    var showTransformActions by remember { mutableStateOf(false) }
    var activeTransformMode by remember { mutableStateOf(engine.transformModePreference) }
    var activeTransformInterpolation by remember { mutableStateOf(engine.transformInterpolation) }
    var transformLockAspect by remember { mutableStateOf(engine.transformLockAspect) }
    var wandTolerance by remember { mutableFloatStateOf(engine.wandTolerance.toFloat()) }
    var wandContiguous by remember { mutableStateOf(engine.wandContiguous) }
    var showSymmetryMenu by remember { mutableStateOf(false) }
    var showGuidesMenu by remember { mutableStateOf(false) }
    var guideMenuRevision by remember { mutableIntStateOf(0) }

    // Reactive State
    var canUndo by remember { mutableStateOf(false) }
    var canRedo by remember { mutableStateOf(false) }
    var currentTool by remember { mutableStateOf(engine.currentTool) }
    var currentColor by remember { mutableIntStateOf(engine.currentColor) }
    var brushSize by remember { mutableFloatStateOf(engine.brushSize) }
    var brushOpacity by remember { mutableFloatStateOf(engine.brushOpacity) }
    var activeLayerCount by remember { mutableIntStateOf(engine.layers.size) }
    var selectionActive by remember { mutableStateOf(engine.selectionActive) }
    var canPasteSelection by remember { mutableStateOf(engine.hasSelectionClipboard) }
    var symmetryMode by remember { mutableStateOf(engine.symmetryMode) }
    var pixelArtGrid by remember { mutableStateOf(engine.pixelArtGrid) }
    var isTransformActive by remember { mutableStateOf(engine.transformState != null) }
    var activeBrushName by remember { mutableStateOf(engine.activeBrushDisplayName) }

    var engineRevision by remember { mutableIntStateOf(0) }
    fun refreshState() {
        engineRevision++
        canUndo = engine.canUndo
        canRedo = engine.canRedo
        currentTool = engine.currentTool
        currentColor = engine.currentColor
        brushSize = engine.brushSize
        brushOpacity = engine.brushOpacity
        activeLayerCount = engine.layers.size
        selectionActive = engine.selectionActive
        canPasteSelection = engine.hasSelectionClipboard
        symmetryMode = engine.symmetryMode
        pixelArtGrid = engine.pixelArtGrid
        isTransformActive = engine.transformState != null
        engine.transformState?.let { activeTransformMode = it.mode }
        activeTransformInterpolation =
            engine.transformState?.interpolation ?: engine.transformInterpolation
        activeBrushName = engine.activeBrushDisplayName
        engine.snapshotSelectedFavoriteTool()?.let { (id, state) ->
            storageManager.saveFavoriteToolState(id, state)
        }
        canvasViewRef?.invalidate()
    }

    fun chooseTool(mode: ToolMode) {
        showSelectMenu = false
        toolMenuCategory = null
        if (mode.name.startsWith("SELECT_") || mode == ToolMode.LASSO_FILL)
            activePanel = WorkspacePanel.SELECTION
        else if (activePanel == WorkspacePanel.SELECTION || activePanel == WorkspacePanel.TRANSFORM)
            activePanel = null
        if (mode == ToolMode.SELECT_WAND) {
            if (isTransformActive) engine.cancelTransform()
            isTransformActive = false
            currentTool = mode
            engine.currentTool = mode
            showWandSettings = true
        } else if (mode == ToolMode.TRANSFORM) {
            if (engine.beginTransform(selectionOnly = engine.selectionActive)) {
                isTransformActive = true
                activePanel = WorkspacePanel.TRANSFORM
                currentTool = mode
            }
        } else {
            if (isTransformActive) engine.cancelTransform()
            isTransformActive = false
            currentTool = mode
            engine.currentTool = mode
        }
        refreshState()
    }

    val saveProjectLauncher =
        rememberLauncherForActivityResult(
            contract = ActivityResultContracts.CreateDocument("application/x-esenho")
        ) { uri ->
            if (uri != null)
                runCatching {
                        context.contentResolver.openOutputStream(uri)?.use {
                            EsenhoProjectIO.save(engine, it)
                        } ?: error("Não foi possível criar o arquivo")
                    }
                    .onSuccess {
                        Toast.makeText(context, "Projeto salvo", Toast.LENGTH_SHORT).show()
                    }
                    .onFailure {
                        Toast.makeText(
                                context,
                                "Falha ao salvar projeto: ${it.message}",
                                Toast.LENGTH_LONG,
                            )
                            .show()
                    }
        }
    val openProjectLauncher =
        rememberLauncherForActivityResult(contract = ActivityResultContracts.OpenDocument()) { uri
            ->
            if (uri != null)
                runCatching {
                        context.contentResolver.openInputStream(uri)?.use {
                            EsenhoProjectIO.load(engine, it)
                        } ?: error("Não foi possível abrir o arquivo")
                    }
                    .onSuccess {
                        refreshState()
                        Toast.makeText(context, "Projeto aberto", Toast.LENGTH_SHORT).show()
                    }
                    .onFailure {
                        Toast.makeText(
                                context,
                                "Falha ao abrir projeto: ${it.message}",
                                Toast.LENGTH_LONG,
                            )
                            .show()
                    }
        }

    // Keep an editable layered recovery copy in private app storage.
    LaunchedEffect(engine) {
        while (true) {
            delay(5 * 60 * 1000L)
            val snapshot = runCatching { EsenhoProjectIO.capture(engine) }.getOrNull() ?: continue
            withContext(Dispatchers.IO) {
                val atomic = AtomicFile(context.filesDir.resolve("autosave.esenho"))
                var stream: java.io.FileOutputStream? = null
                try {
                    stream = atomic.startWrite()
                    EsenhoProjectIO.write(snapshot, stream)
                    atomic.finishWrite(stream)
                } catch (failure: Throwable) {
                    stream?.let { atomic.failWrite(it) }
                } finally {
                    EsenhoProjectIO.recycle(snapshot)
                }
            }
        }
    }

    // Image Picker Launcher (Import image from Android Gallery to Layer)
    val imagePickerLauncher =
        rememberLauncherForActivityResult(contract = ActivityResultContracts.GetContent()) {
            uri: Uri? ->
            if (uri != null) {
                var bitmap: Bitmap? = null
                try {
                    bitmap =
                        context.contentResolver.openInputStream(uri)?.use {
                            BitmapFactory.decodeStream(it)
                        }
                    if (bitmap != null) {
                        engine.importImageToLayer(bitmap)
                        engine.clearSelection()
                        val transforming = engine.beginTransform()
                        isTransformActive = transforming
                        if (transforming) currentTool = ToolMode.TRANSFORM
                        refreshState()
                        Toast.makeText(
                                context,
                                "Imagem importada para nova camada!",
                                Toast.LENGTH_SHORT,
                            )
                            .show()
                    }
                } catch (e: Exception) {
                    Toast.makeText(context, "Erro ao importar imagem", Toast.LENGTH_SHORT).show()
                } finally {
                    bitmap?.takeUnless { it.isRecycled }?.recycle()
                }
            }
        }

    val panelContent: @Composable () -> Unit = {
        when (activePanel) {
            WorkspacePanel.BRUSHES ->
                BrushDrawer(
                    engine = engine,
                    favoriteBrushIds = favoriteBrushIds,
                    embedded = true,
                    presetRequest = brushPresetRequest,
                    onToggleFavorite = { id ->
                        val updated =
                            favoriteBrushIds.toMutableSet().apply { if (!add(id)) remove(id) }
                        favoriteBrushIds = updated
                        storageManager.saveFavoriteBrushes(updated)
                    },
                    onBrushUpdated = { refreshState() },
                    onDismiss = { activePanel = null },
                )
            WorkspacePanel.COLOR ->
                ColorStudioModal(
                    engine = engine,
                    initialColor = currentColor,
                    recentColors = engine.recentColors,
                    embedded = true,
                    onPaletteChanged = { refreshState() },
                    onColorChanged = { c ->
                        currentColor = c
                        engine.currentColor = c
                        refreshState()
                    },
                    onDismiss = { activePanel = null },
                )
            WorkspacePanel.LAYERS ->
                LayerDrawer(
                    engine = engine,
                    revision = engineRevision,
                    embedded = true,
                    onLayersUpdated = { refreshState() },
                    onDismiss = { activePanel = null },
                )
            WorkspacePanel.ANIMATION ->
                Column(Modifier.fillMaxSize()) {
                    AnimationTimelineBar(
                        engine = engine,
                        revision = engineRevision,
                        embedded = true,
                        onFrameChanged = { canvasViewRef?.invalidate() },
                        onClose = { activePanel = null },
                        modifier = Modifier.weight(1f),
                    )
                }
            WorkspacePanel.EFFECTS ->
                FilterModal(
                    engine = engine,
                    embedded = true,
                    onFilterApplied = { refreshState() },
                    onDismiss = { activePanel = null },
                )
            WorkspacePanel.SELECTION ->
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)
                ) {
                    EditorPanelHeader("Seleção", { activePanel = null })
                    Text(
                        if (selectionActive) "Edite a área selecionada"
                        else "Desenhe uma seleção na tela ou use Selecionar tudo.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box {
                            TextButton(
                                onClick = { showSelectionOpMenu = true },
                                contentPadding = PaddingValues(horizontal = 5.dp),
                                modifier = Modifier.height(30.dp),
                            ) {
                                Text(engine.selectionOp.displayName, fontSize = 10.sp, maxLines = 1)
                                Icon(
                                    Icons.Default.ExpandMore,
                                    null,
                                    modifier = Modifier.size(14.dp),
                                )
                            }
                            DropdownMenu(
                                expanded = showSelectionOpMenu,
                                onDismissRequest = { showSelectionOpMenu = false },
                            ) {
                                SelectionOp.values().forEach { operation ->
                                    DropdownMenuItem(
                                        text = { Text(operation.displayName) },
                                        trailingIcon =
                                            if (engine.selectionOp == operation) {
                                                { Icon(Icons.Default.Check, null) }
                                            } else null,
                                        onClick = {
                                            engine.selectionOp = operation
                                            showSelectionOpMenu = false
                                        },
                                    )
                                }
                            }
                        }
                        WorkspaceActionButton(
                            onClick = {
                                if (engine.copySelectionToClipboard()) canPasteSelection = true
                                refreshState()
                            },
                            enabled = selectionActive,
                            description = "Copiar seleção",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = "Copiar seleção",
                                modifier = Modifier.size(17.dp),
                            )
                        }
                        WorkspaceActionButton(
                            onClick = {
                                if (engine.cutSelectionToClipboard()) canPasteSelection = true
                                refreshState()
                            },
                            enabled = selectionActive,
                            description = "Recortar seleção",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.ContentCut,
                                contentDescription = "Recortar seleção",
                                modifier = Modifier.size(17.dp),
                            )
                        }
                        WorkspaceActionButton(
                            onClick = {
                                engine.fillSelection(currentColor)
                                refreshState()
                            },
                            enabled = selectionActive,
                            description = "Preencher",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.FormatColorFill,
                                contentDescription = "Preencher seleção",
                                modifier = Modifier.size(17.dp),
                            )
                        }
                        WorkspaceActionButton(
                            onClick = { if (engine.cropCanvasToSelection()) refreshState() },
                            enabled = selectionActive,
                            description = "Cortar tela",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.Crop,
                                contentDescription = "Cortar tela para seleção",
                                modifier = Modifier.size(17.dp),
                            )
                        }
                        WorkspaceActionButton(
                            onClick = {
                                customBrushTipName =
                                    "Ponta ${engine.presetCatalog.count { it.isCustom } + 1}"
                                showCreateBrushTipDialog = true
                            },
                            enabled = selectionActive,
                            description = "Criar ponta",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.Brush,
                                contentDescription = "Criar ponta de pincel",
                                modifier = Modifier.size(17.dp),
                            )
                        }
                        WorkspaceActionButton(
                            onClick = {
                                customGrainName =
                                    "Textura ${engine.presetCatalog.count { it.isCustom } + 1}"
                                showCreateGrainDialog = true
                            },
                            enabled = selectionActive,
                            description = "Criar textura",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.GridOn,
                                contentDescription = "Criar textura de grão",
                                modifier = Modifier.size(17.dp),
                            )
                        }
                        WorkspaceActionButton(
                            onClick = {
                                engine.pasteSelectionClipboard()
                                refreshState()
                            },
                            description = "Colar seleção",
                            enabled = canPasteSelection,
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.ContentPaste,
                                contentDescription = "Colar seleção",
                                modifier = Modifier.size(17.dp),
                            )
                        }
                        // Select All
                        WorkspaceActionButton(
                            onClick = {
                                engine.selectAll()
                                refreshState()
                            },
                            description = "Selecionar Tudo",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.SelectAll,
                                contentDescription = "Selecionar Tudo",
                                modifier = Modifier.size(18.dp),
                            )
                        }

                        // Invert Selection
                        WorkspaceActionButton(
                            onClick = {
                                engine.invertSelection()
                                refreshState()
                            },
                            enabled = selectionActive,
                            description = "Inverter Seleção",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.InvertColors,
                                contentDescription = "Inverter Seleção",
                                modifier = Modifier.size(18.dp),
                            )
                        }

                        TextButton(
                            onClick = { showSelectionFeatherDialog = true },
                            contentPadding = PaddingValues(horizontal = 5.dp),
                            modifier = Modifier.height(32.dp),
                        ) {
                            Text("Suavizar borda", fontSize = 10.sp, maxLines = 1)
                        }

                        // Deselect
                        WorkspaceActionButton(
                            onClick = {
                                engine.clearSelection()
                                refreshState()
                            },
                            enabled = selectionActive,
                            description = "Deselecionar",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.Deselect,
                                contentDescription = "Deselecionar",
                                modifier = Modifier.size(18.dp),
                            )
                        }

                        // Delete Selected Pixels
                        WorkspaceActionButton(
                            onClick = {
                                engine.clearSelectedPixels()
                                refreshState()
                            },
                            enabled = selectionActive,
                            description = "Apagar Pixels Selecionados",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.DeleteOutline,
                                contentDescription = "Apagar Pixels Selecionados",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp),
                            )
                        }

                        // Transform Selection (M4 / R1)
                        WorkspaceActionButton(
                            onClick = {
                                val ok = engine.beginTransform(selectionOnly = true)
                                if (ok) {
                                    isTransformActive = true
                                    activePanel = WorkspacePanel.TRANSFORM
                                    currentTool = ToolMode.TRANSFORM
                                    refreshState()
                                }
                            },
                            enabled = selectionActive,
                            description = "Transformar Seleção",
                            modifier = Modifier.width(140.dp),
                        ) {
                            Icon(
                                Icons.Default.OpenWith,
                                contentDescription = "Transformar Seleção",
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            WorkspacePanel.TRANSFORM ->
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)
                ) {
                    EditorPanelHeader("Transformação", { activePanel = null })
                    if (!isTransformActive)
                        Text(
                            "Escolha uma área para transformar.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    else
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = "Transformar",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(end = 4.dp),
                            )
                            Box {
                                TextButton(
                                    onClick = { showTransformModeMenu = true },
                                    contentPadding = PaddingValues(horizontal = 6.dp),
                                ) {
                                    Text(activeTransformMode.title, fontSize = 11.sp)
                                    Icon(
                                        Icons.Default.ExpandMore,
                                        contentDescription = "Modo de transformação",
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                                DropdownMenu(
                                    expanded = showTransformModeMenu,
                                    onDismissRequest = { showTransformModeMenu = false },
                                ) {
                                    TransformState.Mode.values().forEach { mode ->
                                        DropdownMenuItem(
                                            text = { Text(mode.title) },
                                            trailingIcon =
                                                if (activeTransformMode == mode) {
                                                    { Icon(Icons.Default.Check, null) }
                                                } else null,
                                            onClick = {
                                                activeTransformMode = mode
                                                engine.transformModePreference = mode
                                                engine.transformState?.mode = mode
                                                showTransformModeMenu = false
                                                canvasViewRef?.invalidate()
                                            },
                                        )
                                    }
                                }
                            }

                            WorkspaceActionButton(
                                onClick = {
                                    transformLockAspect = !transformLockAspect
                                    engine.transformLockAspect = transformLockAspect
                                    canvasViewRef?.invalidate()
                                },
                                description =
                                    if (transformLockAspect) "Proporção bloqueada"
                                    else "Bloquear proporção",
                                modifier = Modifier.width(140.dp),
                            ) {
                                Icon(
                                    if (transformLockAspect) Icons.Default.Lock
                                    else Icons.Default.LockOpen,
                                    contentDescription =
                                        if (transformLockAspect) "Proporção bloqueada"
                                        else "Proporção livre",
                                    tint =
                                        if (transformLockAspect) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(19.dp),
                                )
                            }

                            TextButton(
                                onClick = {
                                    activeTransformInterpolation =
                                        if (
                                            activeTransformInterpolation ==
                                                TransformState.Interpolation.NEAREST
                                        )
                                            TransformState.Interpolation.BILINEAR
                                        else TransformState.Interpolation.NEAREST
                                    engine.transformInterpolation = activeTransformInterpolation
                                    engine.transformState?.interpolation =
                                        activeTransformInterpolation
                                    canvasViewRef?.invalidate()
                                },
                                contentPadding = PaddingValues(horizontal = 6.dp),
                            ) {
                                Text(activeTransformInterpolation.title, fontSize = 10.sp)
                            }

                            WorkspaceActionButton(
                                onClick = {
                                    engine.flipTransformH()
                                    canvasViewRef?.invalidate()
                                },
                                description = "Espelhar Horizontal",
                                modifier = Modifier.width(140.dp),
                            ) {
                                Icon(
                                    Icons.Default.Flip,
                                    contentDescription = "Espelhar Horizontal",
                                    modifier = Modifier.size(20.dp),
                                )
                            }

                            WorkspaceActionButton(
                                onClick = {
                                    engine.rotateTransform90()
                                    canvasViewRef?.invalidate()
                                },
                                description = "Girar 90°",
                                modifier = Modifier.width(140.dp),
                            ) {
                                Icon(
                                    Icons.Default.RotateRight,
                                    contentDescription = "Girar 90°",
                                    modifier = Modifier.size(20.dp),
                                )
                            }

                            Box {
                                WorkspaceActionButton(
                                    onClick = { showTransformActions = true },
                                    description = "Mais ações de transformação",
                                    modifier = Modifier.width(140.dp),
                                ) {
                                    Icon(
                                        Icons.Default.MoreVert,
                                        contentDescription = "Ações de transformação",
                                        modifier = Modifier.size(20.dp),
                                    )
                                }
                                DropdownMenu(
                                    expanded = showTransformActions,
                                    onDismissRequest = { showTransformActions = false },
                                ) {
                                    DropdownMenuItem(
                                        text = { Text("Girar 90° anti-horário") },
                                        leadingIcon = { Icon(Icons.Default.RotateLeft, null) },
                                        onClick = {
                                            showTransformActions = false
                                            engine.rotateTransformBy(-90f)
                                            canvasViewRef?.invalidate()
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Girar 180°") },
                                        leadingIcon = {
                                            Icon(Icons.Default.Rotate90DegreesCw, null)
                                        },
                                        onClick = {
                                            showTransformActions = false
                                            engine.rotateTransformBy(180f)
                                            canvasViewRef?.invalidate()
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Centralizar no canvas") },
                                        leadingIcon = {
                                            Icon(Icons.Default.CenterFocusStrong, null)
                                        },
                                        onClick = {
                                            showTransformActions = false
                                            engine.centerTransform()
                                            canvasViewRef?.invalidate()
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Ajustar ao canvas") },
                                        leadingIcon = { Icon(Icons.Default.FitScreen, null) },
                                        onClick = {
                                            showTransformActions = false
                                            engine.fitTransformToCanvas()
                                            canvasViewRef?.invalidate()
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Redefinir transformação") },
                                        leadingIcon = { Icon(Icons.Default.Refresh, null) },
                                        onClick = {
                                            showTransformActions = false
                                            engine.resetTransform()
                                            canvasViewRef?.invalidate()
                                        },
                                    )
                                }
                            }

                            WorkspaceActionButton(
                                onClick = {
                                    isTransformActive = false
                                    activePanel = null
                                    engine.cancelTransform()
                                    currentTool = ToolMode.BRUSH
                                    refreshState()
                                },
                                description = "Cancelar Transformação",
                                modifier = Modifier.width(140.dp),
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = "Cancelar",
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(20.dp),
                                )
                            }

                            WorkspaceActionButton(
                                onClick = {
                                    isTransformActive = false
                                    activePanel = null
                                    engine.commitTransform()
                                    currentTool = ToolMode.BRUSH
                                    refreshState()
                                },
                                description = "Confirmar Transformação",
                                emphasized = true,
                                modifier = Modifier.width(140.dp),
                            ) {
                                Icon(
                                    Icons.Default.Check,
                                    contentDescription = "Confirmar Transformação",
                                    tint = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                }
            WorkspacePanel.CONTROLS ->
                ParameterSettingsPanel(
                    engine = engine,
                    configuredSliders = sideSliderSettings,
                    onMoveParameter = { id, steps ->
                        val from = sideSliderSettings.indexOfFirst { it.id == id }
                        if (from >= 0) {
                            val to = (from + steps).coerceIn(0, sideSliderSettings.lastIndex)
                            if (to != from)
                                sideSliderSettings =
                                    sideSliderSettings.toMutableList().apply {
                                        add(to, removeAt(from))
                                    }
                        }
                    },
                    onReorderFinished = { storageManager.saveSideSliders(sideSliderSettings) },
                    revision = engineRevision,
                    onConfiguredSlidersChange = { settings ->
                        sideSliderSettings = settings
                        storageManager.saveSideSliders(settings)
                    },
                    onValuesChanged = { refreshState() },
                    onDismiss = { activePanel = null },
                )
            null -> Unit
        }
    }
    BackHandler(enabled = activePanel != null && !focusMode) { activePanel = null }

    Scaffold(
        modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing),
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            if (!focusMode)
                WorkspaceHeader(
                    dimensions = "${engine.width} × ${engine.height} px",
                    canUndo = canUndo,
                    canRedo = canRedo,
                    onUndo = {
                        if (isTransformActive) {
                            isTransformActive = false
                            engine.cancelTransform()
                        }
                        engine.undo()
                        refreshState()
                    },
                    onRedo = {
                        if (isTransformActive) {
                            isTransformActive = false
                            engine.cancelTransform()
                        }
                        engine.redo()
                        refreshState()
                    },
                    onDocument = { showWorkspaceActions = true },
                    onFocus = { focusMode = true },
                )
        },
        bottomBar = {
            if (!focusMode)
                Column {
                    WorkspaceProperties(
                        toolName = currentTool.displayName,
                        onToolOptions = {
                            if (isTransformActive) activePanel = WorkspacePanel.TRANSFORM
                            else if (selectionActive || currentTool.name.startsWith("SELECT_"))
                                activePanel = WorkspacePanel.SELECTION
                            else showSelectMenu = true
                        },
                        quickShelfVisible = quickShelfVisible,
                        quickShelfRecent = quickShelfRecent,
                        quickShelfSeparateRows = quickShelfSeparateRows,
                        onQuickShelfSeparateRowsChange = { separate ->
                            quickShelfSeparateRows = separate
                            workspacePreferences
                                .edit()
                                .putBoolean("quick_shelf_separate_rows", separate)
                                .apply()
                        },
                        onToggleQuickShelf = {
                            quickShelfVisible = !quickShelfVisible
                            workspacePreferences
                                .edit()
                                .putBoolean("quick_shelf_visible", quickShelfVisible)
                                .apply()
                        },
                        onQuickShelfRecentChange = { recent ->
                            quickShelfRecent = recent
                            workspacePreferences
                                .edit()
                                .putBoolean("quick_shelf_recent", recent)
                                .apply()
                        },
                        brushName = activeBrushName,
                        color = currentColor,
                        engine = engine,
                        configuredSliders = sideSliderSettings,
                        onMoveParameter = { id, steps ->
                            val from = sideSliderSettings.indexOfFirst { it.id == id }
                            if (from >= 0) {
                                val to = (from + steps).coerceIn(0, sideSliderSettings.lastIndex)
                                if (to != from)
                                    sideSliderSettings =
                                        sideSliderSettings.toMutableList().apply {
                                            add(to, removeAt(from))
                                        }
                            }
                        },
                        onReorderFinished = { storageManager.saveSideSliders(sideSliderSettings) },
                        revision = engineRevision,
                        quickSlidersOpen = quickSlidersOpen,
                        onToggleQuickSliders = {
                            quickSlidersOpen = !quickSlidersOpen
                            if (!quickSlidersOpen) canvasViewRef?.previewBrushSize = 0f
                        },
                        onParameterChanged = { paramId, active ->
                            brushSize = engine.brushSize
                            brushOpacity = engine.brushOpacity
                            if (active) engineRevision++
                            if (paramId == 1)
                                canvasViewRef?.previewBrushSize =
                                    if (active) engine.brushSize else 0f
                            if (!active) refreshState()
                        },
                        toolPicker = {
                            WorkspaceToolPicker(
                                currentTool,
                                showSelectMenu,
                                onOpen = { showSelectMenu = !showSelectMenu },
                                onDismiss = { showSelectMenu = false },
                                onTool = { chooseTool(it) },
                            )
                        },
                        onBrush = {
                            brushPresetRequest = 0
                            activePanel =
                                if (activePanel == WorkspacePanel.BRUSHES) null
                                else WorkspacePanel.BRUSHES
                        },
                        onColor = {
                            activePanel =
                                if (activePanel == WorkspacePanel.COLOR) null
                                else WorkspacePanel.COLOR
                        },
                        onParameters = { activePanel = WorkspacePanel.CONTROLS },
                        activePanel = activePanel,
                        onLayers = {
                            activePanel =
                                if (activePanel == WorkspacePanel.LAYERS) null
                                else WorkspacePanel.LAYERS
                        },
                        onAnimation = {
                            activePanel =
                                if (activePanel == WorkspacePanel.ANIMATION) null
                                else WorkspacePanel.ANIMATION
                        },
                        onEffects = {
                            activePanel =
                                if (activePanel == WorkspacePanel.EFFECTS) null
                                else WorkspacePanel.EFFECTS
                        },
                    )
                    if (quickShelfVisible)
                        WorkspaceQuickShelf(
                            engine = engine,
                            favoriteBrushIds = favoriteBrushIds,
                            recent = quickShelfRecent,
                            separateRows = quickShelfSeparateRows,
                            revision = engineRevision,
                            onChanged = { refreshState() },
                            onOpenBrushes = {
                                brushPresetRequest++
                                activePanel = WorkspacePanel.BRUSHES
                            },
                            onOpenColors = { activePanel = WorkspacePanel.COLOR },
                        )
                }
        },
    ) { paddingValues ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(paddingValues)) {
            val useSideInspector =
                activePanel != WorkspacePanel.ANIMATION &&
                    (maxWidth >= 700.dp || (maxWidth >= 600.dp && maxWidth > maxHeight * 1.4f))
            val dockDensity = LocalDensity.current
            var bottomDockHeight by remember { mutableStateOf<Dp?>(null) }
            var sideDockWidth by remember { mutableStateOf<Dp?>(null) }
            val maxDockHeight =
                (maxHeight - 96.dp.coerceAtMost(maxHeight * 0.35f)).coerceAtLeast(0.dp)
            val minDockHeight = 128.dp.coerceAtMost(maxDockHeight)
            val defaultDockHeight =
                (maxHeight * 0.32f).coerceAtMost(240.dp).coerceIn(minDockHeight, maxDockHeight)
            val mobilePanelHeight =
                (bottomDockHeight ?: defaultDockHeight).coerceIn(minDockHeight, maxDockHeight)
            val expandedDockHeight = (maxHeight * 0.62f).coerceIn(minDockHeight, maxDockHeight)
            val minDockWidth = 220.dp
            val maxDockWidth = (maxWidth - 240.dp).coerceAtLeast(minDockWidth)
            val defaultDockWidth =
                (maxWidth * 0.32f).coerceIn(260.dp, 300.dp).coerceIn(minDockWidth, maxDockWidth)
            val inspectorWidth =
                (sideDockWidth ?: defaultDockWidth).coerceIn(minDockWidth, maxDockWidth)
            Row(Modifier.fillMaxSize()) {
                Column(Modifier.weight(1f).fillMaxHeight()) {
                    Box(
                        Modifier.weight(1f)
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(2.dp))
                            .background(MaterialTheme.colorScheme.background)
                    ) {
                        AndroidView(
                            factory = { ctx ->
                                EsenhoCanvasView(ctx).apply {
                                    this.engine = engine
                                    this.onStateChanged = { refreshState() }
                                    this.onColorPicked = { c ->
                                        currentColor = c
                                        engine.currentColor = c
                                    }
                                    canvasViewRef = this
                                }
                            },
                            modifier = Modifier.fillMaxSize(),
                        )

                        if (focusMode) {
                            Surface(
                                Modifier.align(Alignment.TopEnd).padding(12.dp),
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                IconButton(onClick = { focusMode = false }) {
                                    Icon(Icons.Default.FullscreenExit, "Sair do modo de foco")
                                }
                            }
                        }
                    }
                    if (!focusMode) {

                        if (!useSideInspector && activePanel != null) {
                            WorkspaceInspector(
                                activePanel!!,
                                Modifier.fillMaxWidth().height(mobilePanelHeight),
                                panelContent,
                                onResize = { deltaPixels ->
                                    val delta = with(dockDensity) { deltaPixels.toDp() }
                                    bottomDockHeight =
                                        ((bottomDockHeight ?: defaultDockHeight).coerceIn(
                                                minDockHeight,
                                                maxDockHeight,
                                            ) - delta)
                                            .coerceIn(minDockHeight, maxDockHeight)
                                },
                                onToggleResize = {
                                    bottomDockHeight =
                                        if (mobilePanelHeight > defaultDockHeight + 1.dp)
                                            defaultDockHeight
                                        else expandedDockHeight
                                },
                            )
                        }
                    }
                }
                if (!focusMode && useSideInspector && activePanel != null) {
                    WorkspaceInspector(
                        activePanel!!,
                        Modifier.width(inspectorWidth).fillMaxHeight(),
                        panelContent,
                        sideDock = true,
                        onResize = { deltaPixels ->
                            val delta = with(dockDensity) { deltaPixels.toDp() }
                            sideDockWidth =
                                ((sideDockWidth ?: defaultDockWidth).coerceIn(
                                        minDockWidth,
                                        maxDockWidth,
                                    ) - delta)
                                    .coerceIn(minDockWidth, maxDockWidth)
                        },
                        onToggleResize = {
                            sideDockWidth =
                                if (inspectorWidth > defaultDockWidth + 1.dp) defaultDockWidth
                                else maxDockWidth
                        },
                    )
                }
            }
        }

        if (showWorkspaceActions) {
            ModalBottomSheet(
                onDismissRequest = { showWorkspaceActions = false },
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
                containerColor = MaterialTheme.colorScheme.surface,
            ) {
                Column(
                    Modifier.fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp)
                        .padding(bottom = 20.dp)
                ) {
                    EditorPanelHeader(
                        "Documento e espaço de trabalho",
                        { showWorkspaceActions = false },
                    )
                    WorkspaceSectionTabs(
                        listOf("Projeto", "Tela", "Seleção"),
                        documentTab,
                        { documentTab = it },
                    )
                    when (documentTab) {
                        0 -> {
                            DropdownMenuItem(
                                text = { Text("Nova tela") },
                                leadingIcon = { Icon(Icons.Default.AddBox, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    showNewProjectDialog = true
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Salvar e abrir projetos") },
                                leadingIcon = { Icon(Icons.Default.FolderOpen, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    showProjectManager = true
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Importar imagem") },
                                leadingIcon = { Icon(Icons.Default.Image, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    imagePickerLauncher.launch("image/*")
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Exportar…") },
                                leadingIcon = { Icon(Icons.Default.Share, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    showExportDialog = true
                                },
                            )
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        "esenho v${context.getString(R.string.app_version).substringBefore('-')}"
                                    )
                                },
                                leadingIcon = { Icon(Icons.Default.Info, null) },
                                enabled = false,
                                onClick = {},
                            )
                        }
                        1 -> {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "Guias, grade e simetria",
                                    Modifier.weight(1f),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Box {
                                    TooltipIconButton(
                                        onClick = { showAssistMenu = true },
                                        description = "Auxiliares: guias, grade e simetria",
                                        modifier = Modifier.size(40.dp),
                                    ) {
                                        Icon(
                                            Icons.Default.Tune,
                                            "Auxiliares",
                                            modifier = Modifier.size(20.dp),
                                            tint =
                                                if (
                                                    pixelArtGrid ||
                                                        symmetryMode != SymmetryMode.OFF ||
                                                        engine.guideSnapEnabled
                                                )
                                                    MaterialTheme.colorScheme.primary
                                                else MaterialTheme.colorScheme.onSurface,
                                        )
                                    }
                                    DropdownMenu(
                                        expanded = showAssistMenu,
                                        onDismissRequest = { showAssistMenu = false },
                                    ) {
                                        DropdownMenuItem(
                                            text = { Text("Guias de traçado") },
                                            leadingIcon = { Icon(Icons.Default.Straighten, null) },
                                            onClick = {
                                                showAssistMenu = false
                                                showGuidesMenu = true
                                            },
                                        )
                                        DropdownMenuItem(
                                            text = { Text("Grade Pixel Art") },
                                            leadingIcon = { Icon(Icons.Default.GridOn, null) },
                                            trailingIcon =
                                                if (pixelArtGrid) {
                                                    { Icon(Icons.Default.Check, null) }
                                                } else null,
                                            onClick = {
                                                engine.pixelArtGrid = !engine.pixelArtGrid
                                                refreshState()
                                                showAssistMenu = false
                                            },
                                        )
                                        DropdownMenuItem(
                                            text = {
                                                Text("Simetria · ${symmetryMode.displayName}")
                                            },
                                            leadingIcon = { Icon(Icons.Default.Stream, null) },
                                            onClick = {
                                                showAssistMenu = false
                                                showSymmetryMenu = true
                                            },
                                        )
                                    }
                                    DropdownMenu(
                                        expanded = showGuidesMenu,
                                        onDismissRequest = { showGuidesMenu = false },
                                    ) {
                                        DropdownMenuItem(
                                            text = {
                                                Text(
                                                    if (engine.guideSnapEnabled)
                                                        "Desativar aderência"
                                                    else "Ativar aderência"
                                                )
                                            },
                                            onClick = {
                                                engine.guideSnapEnabled = !engine.guideSnapEnabled
                                                showGuidesMenu = false
                                                canvasViewRef?.invalidate()
                                            },
                                        )
                                        DropdownMenuItem(
                                            text = { Text("Aderir a todas as guias visíveis") },
                                            leadingIcon = {
                                                Icon(
                                                    if (engine.snapToAllVisibleGuides)
                                                        Icons.Default.CheckBox
                                                    else Icons.Default.CheckBoxOutlineBlank,
                                                    null,
                                                )
                                            },
                                            onClick = {
                                                engine.snapToAllVisibleGuides =
                                                    !engine.snapToAllVisibleGuides
                                                engine.guideSnapEnabled = true
                                                showGuidesMenu = false
                                                canvasViewRef?.invalidate()
                                            },
                                        )
                                        HorizontalDivider()
                                        listOf(
                                                DrawingGuideType.LINE to "Criar linha",
                                                DrawingGuideType.CURVE to "Criar curva livre",
                                                DrawingGuideType.ELLIPSE to "Criar elipse",
                                                DrawingGuideType.SPHERE to "Criar esfera",
                                            )
                                            .forEach { (type, label) ->
                                                DropdownMenuItem(
                                                    text = { Text(label) },
                                                    onClick = {
                                                        engine.guideCreationType = type
                                                        engine.guideSnapEnabled = true
                                                        showGuidesMenu = false
                                                        canvasViewRef?.invalidate()
                                                    },
                                                )
                                            }
                                        key(guideMenuRevision) {
                                            if (engine.canvasGuides.isNotEmpty()) {
                                                HorizontalDivider()
                                                engine.canvasGuides.indices.forEach { index ->
                                                    val isGuideSelected =
                                                        engine.snapToAllVisibleGuides ||
                                                            index in engine.snapGuideIndices
                                                    val guideTypeName =
                                                        when (engine.canvasGuides[index].type) {
                                                            DrawingGuideType.LINE -> "Linha"
                                                            DrawingGuideType.CURVE -> "Curva"
                                                            DrawingGuideType.ELLIPSE -> "Elipse"
                                                            DrawingGuideType.SPHERE -> "Esfera"
                                                        }
                                                    DropdownMenuItem(
                                                        text = {
                                                            Text(
                                                                "Guia ${index + 1} · $guideTypeName"
                                                            )
                                                        },
                                                        leadingIcon = {
                                                            Icon(
                                                                if (isGuideSelected)
                                                                    Icons.Default.CheckBox
                                                                else
                                                                    Icons.Default
                                                                        .CheckBoxOutlineBlank,
                                                                contentDescription =
                                                                    if (isGuideSelected)
                                                                        "Aderência ativada"
                                                                    else "Aderência desativada",
                                                            )
                                                        },
                                                        trailingIcon = {
                                                            IconButton(
                                                                onClick = {
                                                                    engine.removeCanvasGuide(index)
                                                                    guideMenuRevision++
                                                                    canvasViewRef?.invalidate()
                                                                },
                                                                modifier = Modifier.size(32.dp),
                                                            ) {
                                                                Icon(
                                                                    Icons.Default.DeleteOutline,
                                                                    contentDescription =
                                                                        "Apagar guia",
                                                                    modifier = Modifier.size(18.dp),
                                                                    tint =
                                                                        MaterialTheme.colorScheme
                                                                            .error,
                                                                )
                                                            }
                                                        },
                                                        onClick = {
                                                            if (engine.snapToAllVisibleGuides) {
                                                                engine.snapToAllVisibleGuides =
                                                                    false
                                                                engine.snapGuideIndices.clear()
                                                                engine.snapGuideIndices.addAll(
                                                                    engine.canvasGuides.indices
                                                                )
                                                            }
                                                            if (isGuideSelected)
                                                                engine.snapGuideIndices.remove(
                                                                    index
                                                                )
                                                            else engine.snapGuideIndices.add(index)
                                                            engine.activeCanvasGuideIndex = index
                                                            engine.guideSnapEnabled = true
                                                            guideMenuRevision++
                                                            canvasViewRef?.invalidate()
                                                        },
                                                    )
                                                }
                                            }
                                        }
                                    }
                                    DropdownMenu(
                                        expanded = showSymmetryMenu,
                                        onDismissRequest = { showSymmetryMenu = false },
                                    ) {
                                        SymmetryMode.values().forEach { mode ->
                                            DropdownMenuItem(
                                                text = { Text(mode.displayName) },
                                                trailingIcon =
                                                    if (symmetryMode == mode) {
                                                        { Icon(Icons.Default.Check, null) }
                                                    } else null,
                                                onClick = {
                                                    showSymmetryMenu = false
                                                    engine.symmetryMode = mode
                                                    refreshState()
                                                },
                                            )
                                        }
                                    }
                                }
                            }
                            DropdownMenuItem(
                                text = { Text("Redimensionar Tela...") },
                                leadingIcon = { Icon(Icons.Default.AspectRatio, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    canvasResizeWidth = engine.width.toString()
                                    canvasResizeHeight = engine.height.toString()
                                    canvasResizeError = null
                                    showCanvasResizeDialog = true
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Resetar Zoom & Posição") },
                                leadingIcon = { Icon(Icons.Default.CenterFocusStrong, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    canvasViewRef?.resetView()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Espelhar Tela Horizontal") },
                                leadingIcon = { Icon(Icons.Default.Flip, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    engine.flipCanvasH()
                                    refreshState()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Espelhar Tela Vertical") },
                                leadingIcon = { Icon(Icons.Default.FlipCameraAndroid, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    engine.flipCanvasV()
                                    refreshState()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Remover todas as guias") },
                                leadingIcon = { Icon(Icons.Default.DeleteOutline, null) },
                                enabled = engine.canvasGuides.isNotEmpty(),
                                onClick = {
                                    showWorkspaceActions = false
                                    engine.canvasGuides.clear()
                                    engine.snapGuideIndices.clear()
                                    engine.snapToAllVisibleGuides = false
                                    engine.activeCanvasGuideIndex = -1
                                    canvasViewRef?.invalidate()
                                },
                            )
                        }
                        else -> {
                            DropdownMenuItem(
                                text = { Text("Selecionar Tudo") },
                                leadingIcon = { Icon(Icons.Default.SelectAll, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    engine.selectAll()
                                    refreshState()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Inverter Seleção") },
                                leadingIcon = { Icon(Icons.Default.InvertColors, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    engine.invertSelection()
                                    refreshState()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Colar seleção") },
                                leadingIcon = { Icon(Icons.Default.ContentPaste, null) },
                                enabled = canPasteSelection,
                                onClick = {
                                    showWorkspaceActions = false
                                    engine.pasteSelectionClipboard()
                                    refreshState()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Limpar Camada Atual") },
                                leadingIcon = { Icon(Icons.Default.DeleteSweep, null) },
                                onClick = {
                                    showWorkspaceActions = false
                                    showClearLayerConfirm = true
                                },
                            )
                        }
                    }
                }
            }
        }

        // Modals & Drawers
        if (showClearLayerConfirm) {
            AlertDialog(
                onDismissRequest = { showClearLayerConfirm = false },
                title = { Text("Limpar camada?") },
                text = { Text("Todo o conteúdo da camada atual será removido.") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            engine.clearActiveLayer()
                            showClearLayerConfirm = false
                            refreshState()
                        }
                    ) {
                        Text("Limpar", color = MaterialTheme.colorScheme.error)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showClearLayerConfirm = false }) { Text("Cancelar") }
                },
            )
        }
        if (showWandSettings) {
            AlertDialog(
                onDismissRequest = { showWandSettings = false },
                title = { Text("Varinha mágica") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            "Tolerância: ${wandTolerance.toInt()}",
                            style = MaterialTheme.typography.labelMedium,
                        )
                        Slider(
                            value = wandTolerance,
                            onValueChange = {
                                wandTolerance = it
                                engine.wandTolerance = it.toInt()
                            },
                            valueRange = 0f..255f,
                            steps = 254,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = wandContiguous,
                                onCheckedChange = {
                                    wandContiguous = it
                                    engine.wandContiguous = it
                                },
                            )
                            Text("Selecionar apenas pixels conectados")
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showWandSettings = false }) { Text("Pronto") }
                },
            )
        }
        if (showCreateBrushTipDialog) {
            AlertDialog(
                onDismissRequest = { showCreateBrushTipDialog = false },
                title = { Text("Criar ponta de pincel") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("A área selecionada será salva como um preset personalizado.")
                        OutlinedTextField(
                            value = customBrushTipName,
                            onValueChange = { customBrushTipName = it.take(40) },
                            label = { Text("Nome da ponta") },
                            singleLine = true,
                        )
                    }
                },
                confirmButton = {
                    TextButton(
                        enabled = customBrushTipName.isNotBlank(),
                        onClick = {
                            val created = engine.createBrushTipFromSelection(customBrushTipName)
                            showCreateBrushTipDialog = false
                            if (created) {
                                currentTool = ToolMode.BRUSH
                                engine.currentTool = ToolMode.BRUSH
                                Toast.makeText(
                                        context,
                                        "Ponta criada e salva nos presets",
                                        Toast.LENGTH_SHORT,
                                    )
                                    .show()
                            } else {
                                Toast.makeText(
                                        context,
                                        "Não foi possível criar a ponta (limite de 2048 px por lado)",
                                        Toast.LENGTH_LONG,
                                    )
                                    .show()
                            }
                            refreshState()
                        },
                    ) {
                        Text("Criar")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showCreateBrushTipDialog = false }) { Text("Cancelar") }
                },
            )
        }
        if (showCreateGrainDialog) {
            AlertDialog(
                onDismissRequest = { showCreateGrainDialog = false },
                title = { Text("Criar textura de grão") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("A seleção será salva como textura do preset personalizado.")
                        OutlinedTextField(
                            value = customGrainName,
                            onValueChange = { customGrainName = it.take(40) },
                            label = { Text("Nome da textura") },
                            singleLine = true,
                        )
                    }
                },
                confirmButton = {
                    TextButton(
                        enabled = customGrainName.isNotBlank(),
                        onClick = {
                            val created = engine.createGrainTextureFromSelection(customGrainName)
                            showCreateGrainDialog = false
                            if (created) {
                                currentTool = ToolMode.BRUSH
                                engine.currentTool = ToolMode.BRUSH
                                Toast.makeText(
                                        context,
                                        "Textura criada e salva nos presets",
                                        Toast.LENGTH_SHORT,
                                    )
                                    .show()
                            } else {
                                Toast.makeText(
                                        context,
                                        "Não foi possível criar a textura (limite de 2048 px por lado)",
                                        Toast.LENGTH_LONG,
                                    )
                                    .show()
                            }
                            refreshState()
                        },
                    ) {
                        Text("Criar")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showCreateGrainDialog = false }) { Text("Cancelar") }
                },
            )
        }
        if (showSelectionFeatherDialog) {
            AlertDialog(
                onDismissRequest = { showSelectionFeatherDialog = false },
                title = { Text("Suavizar borda da seleção") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "Raio: ${selectionFeatherRadius.toInt()} px",
                            style = MaterialTheme.typography.labelMedium,
                        )
                        Slider(
                            value = selectionFeatherRadius,
                            onValueChange = { selectionFeatherRadius = it },
                            valueRange = 1f..16f,
                            steps = 14,
                        )
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            engine.featherSelection(selectionFeatherRadius.toInt())
                            showSelectionFeatherDialog = false
                            refreshState()
                        }
                    ) {
                        Text("Aplicar")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showSelectionFeatherDialog = false }) {
                        Text("Cancelar")
                    }
                },
            )
        }
        if (showCanvasResizeDialog) {
            AlertDialog(
                onDismissRequest = { showCanvasResizeDialog = false },
                title = { Text("Redimensionar tela") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            "Todos os cels de animação serão redimensionados com interpolação suave."
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = canvasResizeWidth,
                                onValueChange = {
                                    canvasResizeWidth = it.filter(Char::isDigit).take(5)
                                    canvasResizeError = null
                                },
                                label = { Text("Largura") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = canvasResizeHeight,
                                onValueChange = {
                                    canvasResizeHeight = it.filter(Char::isDigit).take(5)
                                    canvasResizeError = null
                                },
                                label = { Text("Altura") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        canvasResizeError?.let {
                            Text(
                                it,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Text(
                            "Máximo: 8192 px por lado e 32 megapixels.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            val newWidth = canvasResizeWidth.toIntOrNull()
                            val newHeight = canvasResizeHeight.toIntOrNull()
                            if (
                                newWidth == null ||
                                    newHeight == null ||
                                    newWidth !in 1..8192 ||
                                    newHeight !in 1..8192 ||
                                    newWidth.toLong() * newHeight > 32_000_000L
                            ) {
                                canvasResizeError = "Informe dimensões válidas dentro do limite."
                            } else if (engine.resizeCanvas(newWidth, newHeight)) {
                                showCanvasResizeDialog = false
                                canvasViewRef?.resetView()
                                refreshState()
                            } else if (newWidth == engine.width && newHeight == engine.height) {
                                showCanvasResizeDialog = false
                            } else {
                                canvasResizeError =
                                    "Falha ao redimensionar. Feche a transformação ou tente dimensões menores."
                            }
                        }
                    ) {
                        Text("Aplicar")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showCanvasResizeDialog = false }) { Text("Cancelar") }
                },
            )
        }
        if (showProjectManager) {
            WorkspacePanelContainer(false, { showProjectManager = false }) {
                Column(
                    Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    EditorPanelHeader("Seus projetos", { showProjectManager = false })
                    Text(
                        "Continue uma criação ou guarde uma cópia editável com camadas e animação.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    WorkspaceActionButton(
                        description = "Salvar projeto editável",
                        emphasized = true,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            showProjectManager = false
                            saveProjectLauncher.launch("esenho.esenho")
                        },
                    ) {
                        Icon(Icons.Default.Save, null)
                    }
                    WorkspaceActionButton(
                        description = "Abrir um projeto",
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            showProjectManager = false
                            openProjectLauncher.launch(
                                arrayOf("application/x-esenho", "application/octet-stream", "*/*")
                            )
                        },
                    ) {
                        Icon(Icons.Default.FolderOpen, null)
                    }
                    WorkspaceActionButton(
                        description = "Restaurar cópia automática",
                        modifier = Modifier.fillMaxWidth(),
                        enabled = context.filesDir.resolve("autosave.esenho").exists(),
                        onClick = {
                            showProjectManager = false
                            runCatching {
                                    context.filesDir.resolve("autosave.esenho").inputStream().use {
                                        EsenhoProjectIO.load(engine, it)
                                    }
                                }
                                .onSuccess {
                                    refreshState()
                                    Toast.makeText(
                                            context,
                                            "Autosave restaurado",
                                            Toast.LENGTH_SHORT,
                                        )
                                        .show()
                                }
                                .onFailure {
                                    Toast.makeText(
                                            context,
                                            "Falha ao restaurar autosave: ${it.message}",
                                            Toast.LENGTH_LONG,
                                        )
                                        .show()
                                }
                        },
                    ) {
                        Icon(Icons.Default.History, null)
                    }
                    Text(
                        "Uma cópia de recuperação é salva a cada 5 minutos.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (showNewProjectDialog) {
            NewProjectDialog(
                currentW = engine.width,
                currentH = engine.height,
                onConfirm = { w, h, bg ->
                    showNewProjectDialog = false
                    engine.initEngine(w, h)
                    if (bg != 0xFFFFFFFF.toInt()) {
                        engine.clearActiveLayer()
                        if (bg != 0) {
                            EsenhoNativeBridge.nativeDrawRect(0, 0, w, h, bg)
                            engine.captureCurrentFrame()
                        }
                    }
                    canvasViewRef?.centerCanvas()
                    refreshState()
                },
                onDismiss = { showNewProjectDialog = false },
            )
        }

        if (showExportDialog) {
            NativeExportDialog(
                engine = engine,
                onExport = onExport,
                onDismiss = { showExportDialog = false },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TooltipIconButton(
    onClick: () -> Unit,
    description: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    colors: IconButtonColors = IconButtonDefaults.iconButtonColors(),
    content: @Composable () -> Unit,
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(description, fontSize = 11.sp) } },
        state = rememberTooltipState(),
    ) {
        IconButton(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            colors = colors,
            content = content,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolNavButton(
    icon: ImageVector? = null,
    painter: Painter? = null,
    isSelected: Boolean,
    description: String,
    onClick: () -> Unit,
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(description, fontSize = 11.sp) } },
        state = rememberTooltipState(),
    ) {
        IconButton(
            onClick = onClick,
            colors =
                IconButtonDefaults.iconButtonColors(
                    containerColor =
                        if (isSelected) MaterialTheme.colorScheme.primaryContainer
                        else Color.Transparent,
                    contentColor =
                        if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurface,
                ),
            modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)),
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = description, modifier = Modifier.size(19.dp))
            } else if (painter != null) {
                Icon(painter, contentDescription = description, modifier = Modifier.size(19.dp))
            }
        }
    }
}
