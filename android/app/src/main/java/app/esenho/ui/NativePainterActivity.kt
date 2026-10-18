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
import androidx.core.view.WindowCompat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
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

        setContent {
            EsenhoNativeTheme {
                EsenhoMainScreen(
                    onExportImage = { bitmap, format -> exportBitmapToGallery(bitmap, format) },
                    onExportGif = { frames, fps, loop -> exportGifToGallery(frames, fps, loop) },
                    onExportWebm = { frames, fps -> exportWebmToGallery(frames, fps) }
                )
            }
        }
    }

    private fun exportBitmapToGallery(bitmap: Bitmap, format: Bitmap.CompressFormat = Bitmap.CompressFormat.PNG) {
        val isJpeg = format == Bitmap.CompressFormat.JPEG
        val isWebp = format == Bitmap.CompressFormat.WEBP ||
            (Build.VERSION.SDK_INT >= 30 && format == Bitmap.CompressFormat.WEBP_LOSSY)
        val ext = when { isJpeg -> "jpg"; isWebp -> "webp"; else -> "png" }
        val mime = when { isJpeg -> "image/jpeg"; isWebp -> "image/webp"; else -> "image/png" }
        val filename = "esenho_${System.currentTimeMillis()}.$ext"
        val fos: OutputStream?

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Esenho")
            }
            val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
            fos = uri?.let { contentResolver.openOutputStream(it) }
        } else {
            val imagesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES).toString()
            val image = java.io.File(imagesDir, filename)
            fos = java.io.FileOutputStream(image)
        }

        fos?.use {
            val quality = if (isJpeg) 95 else 100
            bitmap.compress(format, quality, it)
            Toast.makeText(this, "Desenho salvo com sucesso na Galeria ($ext)!", Toast.LENGTH_SHORT).show()
        } ?: run {
            Toast.makeText(this, "Falha ao exportar imagem", Toast.LENGTH_SHORT).show()
        }
    }

    private fun exportGifToGallery(frames: List<Bitmap>, fps: Int, loop: Boolean) {
        val filename = "esenho_${System.currentTimeMillis()}.gif"
        val output = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "image/gif")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Esenho")
            }
            contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?.let(contentResolver::openOutputStream)
        } else {
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
            java.io.FileOutputStream(java.io.File(dir, filename))
        }
        runCatching {
            val stream = output ?: error("Não foi possível criar o arquivo")
            stream.use { GifWriter.write(frames, fps, loop, it) }
        }.onSuccess { Toast.makeText(this, "GIF exportado para a Galeria", Toast.LENGTH_SHORT).show() }
            .onFailure { Toast.makeText(this, "Falha ao exportar GIF", Toast.LENGTH_SHORT).show() }
            .also { frames.forEach { frame -> if (!frame.isRecycled) frame.recycle() } }
    }

    private fun exportWebmToGallery(frames: List<Bitmap>, fps: Int) {
        val filename = "esenho_${System.currentTimeMillis()}.webm"
        val temp = java.io.File(cacheDir, filename)
        Thread {
            val result = runCatching {
                WebmWriter.write(frames, fps, temp)
                val output = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                        put(MediaStore.MediaColumns.MIME_TYPE, "video/webm")
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Esenho")
                    }
                    contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                        ?.let(contentResolver::openOutputStream)
                } else {
                    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
                    java.io.FileOutputStream(java.io.File(dir, filename))
                } ?: error("Não foi possível criar o arquivo de vídeo")
                output.use { stream -> temp.inputStream().use { it.copyTo(stream) } }
            }
            runOnUiThread {
                result.onSuccess { Toast.makeText(this, "WebM exportado para os vídeos", Toast.LENGTH_SHORT).show() }
                    .onFailure { Toast.makeText(this, "Falha ao exportar WebM: ${it.message}", Toast.LENGTH_LONG).show() }
            }
            temp.delete()
            frames.forEach { frame -> if (!frame.isRecycled) frame.recycle() }
        }.start()
    }
}

@Composable
fun EsenhoNativeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            // Keep large surfaces neutral; reserve color for interaction and
            // selection accents so the editor does not read as green overall.
            primary = Color(0xFFFFC857),
            onPrimary = Color(0xFF241E12),
            primaryContainer = Color(0xFF4A402B),
            secondary = Color(0xFFB7BCC1),
            onSecondary = Color(0xFF202326),
            secondaryContainer = Color(0xFF34383C),
            onSecondaryContainer = Color(0xFFE1E4E7),
            tertiary = Color(0xFFE58A7B),
            tertiaryContainer = Color(0xFF49302E),
            onTertiaryContainer = Color(0xFFFFDAD4),
            error = Color(0xFFFFB4AB),
            onError = Color(0xFF690005),
            errorContainer = Color(0xFF93000A),
            onErrorContainer = Color(0xFFFFDAD6),
            surface = Color(0xFF202326),
            surfaceVariant = Color(0xFF303438),
            background = Color(0xFF151719),
            onSurface = Color(0xFFE6E8EA),
            outline = Color(0xFF777D82),
            outlineVariant = Color(0xFF41464A),
            scrim = Color(0x99000000),
            surfaceTint = Color.Transparent
        ),
        content = content
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EsenhoMainScreen(
    onExportImage: (Bitmap, Bitmap.CompressFormat) -> Unit,
    onExportGif: (List<Bitmap>, Int, Boolean) -> Unit,
    onExportWebm: (List<Bitmap>, Int) -> Unit
) {
    val context = LocalContext.current
    var canvasViewRef by remember { mutableStateOf<EsenhoCanvasView?>(null) }
    val engine = remember { EsenhoEngine(context, 1080, 1920) }
    val storageManager = remember { EsenhoStorageManager(context) }
    var sideSliderParams by remember { mutableStateOf<List<Int>>(storageManager.loadSideSliders()) }

    // UI Dialog & Drawer States
    var showBrushDrawer by remember { mutableStateOf(false) }
    var showColorStudio by remember { mutableStateOf(false) }
    var showLayerDrawer by remember { mutableStateOf(false) }
    var showFilterModal by remember { mutableStateOf(false) }
    var showAnimationTimeline by remember { mutableStateOf(false) }
    var showNewProjectDialog by remember { mutableStateOf(false) }
    var showProjectManager by remember { mutableStateOf(false) }
    var showClearLayerConfirm by remember { mutableStateOf(false) }
    var showCanvasResizeDialog by remember { mutableStateOf(false) }
    var canvasResizeWidth by remember { mutableStateOf(engine.width.toString()) }
    var canvasResizeHeight by remember { mutableStateOf(engine.height.toString()) }
    var canvasResizeError by remember { mutableStateOf<String?>(null) }

    // Floating Tool Dropdowns
    var showSelectMenu by remember { mutableStateOf(false) }
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

    fun refreshState() {
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
        activeTransformInterpolation = engine.transformState?.interpolation ?: engine.transformInterpolation
        activeBrushName = engine.activeBrushDisplayName
        canvasViewRef?.invalidate()
    }

    val saveProjectLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/x-esenho")
    ) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openOutputStream(uri)?.use { EsenhoProjectIO.save(engine, it) }
                ?: error("Não foi possível criar o arquivo")
        }.onSuccess { Toast.makeText(context, "Projeto salvo", Toast.LENGTH_SHORT).show() }
            .onFailure { Toast.makeText(context, "Falha ao salvar projeto: ${it.message}", Toast.LENGTH_LONG).show() }
    }
    val openProjectLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openInputStream(uri)?.use { EsenhoProjectIO.load(engine, it) }
                ?: error("Não foi possível abrir o arquivo")
        }.onSuccess { refreshState(); Toast.makeText(context, "Projeto aberto", Toast.LENGTH_SHORT).show() }
            .onFailure { Toast.makeText(context, "Falha ao abrir projeto: ${it.message}", Toast.LENGTH_LONG).show() }
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
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            var bitmap: Bitmap? = null
            try {
                bitmap = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
                if (bitmap != null) {
                    engine.importImageToLayer(bitmap)
                    engine.clearSelection()
                    val transforming = engine.beginTransform()
                    isTransformActive = transforming
                    if (transforming) currentTool = ToolMode.TRANSFORM
                    refreshState()
                    Toast.makeText(context, "Imagem importada para nova camada!", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Erro ao importar imagem", Toast.LENGTH_SHORT).show()
            } finally {
                bitmap?.takeUnless { it.isRecycled }?.recycle()
            }
        }
    }

    Scaffold(
        modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing),
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                    // Undo
                    TooltipIconButton(
                        onClick = {
                            if (isTransformActive) {
                                isTransformActive = false
                                engine.cancelTransform()
                            }
                            engine.undo()
                            refreshState()
                        },
                        enabled = canUndo,
                        description = "Desfazer",
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = "Desfazer", modifier = Modifier.size(18.dp))
                    }

                    // Redo
                    TooltipIconButton(
                        onClick = {
                            if (isTransformActive) {
                                isTransformActive = false
                                engine.cancelTransform()
                            }
                            engine.redo()
                            refreshState()
                        },
                        enabled = canRedo,
                        description = "Refazer",
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Redo, contentDescription = "Refazer", modifier = Modifier.size(18.dp))
                    }

                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                actions = {
                    TooltipIconButton(
                        onClick = { engine.pixelArtGrid = !engine.pixelArtGrid; refreshState() },
                        description = if (pixelArtGrid) "Ocultar grade Pixel Art" else "Mostrar grade Pixel Art",
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.GridOn, contentDescription = "Grade Pixel Art", modifier = Modifier.size(18.dp), tint = if (pixelArtGrid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                    }
                    Box {
                        TooltipIconButton(
                            onClick = { showSymmetryMenu = true },
                            description = "Simetria: ${symmetryMode.displayName}",
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.Stream, contentDescription = "Simetria", modifier = Modifier.size(18.dp), tint = if (symmetryMode != SymmetryMode.OFF) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                        }
                        DropdownMenu(expanded = showSymmetryMenu, onDismissRequest = { showSymmetryMenu = false }) {
                            SymmetryMode.values().forEach { mode ->
                                DropdownMenuItem(
                                    text = { Text(mode.displayName) },
                                    trailingIcon = if (symmetryMode == mode) {{ Icon(Icons.Default.Check, null) }} else null,
                                    onClick = { showSymmetryMenu = false; engine.symmetryMode = mode; refreshState() }
                                )
                            }
                        }
                    }
                    // Animation Toggle
                    TooltipIconButton(
                        onClick = { showAnimationTimeline = !showAnimationTimeline },
                        description = "Animação",
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            Icons.Default.Animation,
                            contentDescription = "Animação",
                            tint = if (showAnimationTimeline) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Filters Gallery
                    TooltipIconButton(
                        onClick = { showFilterModal = true },
                        description = "Filtros",
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = "Filtros", modifier = Modifier.size(18.dp))
                    }

                    // Layers Drawer
                    BadgedBox(
                        badge = {
                            Badge { Text("$activeLayerCount") }
                        },
                        modifier = Modifier.padding(end = 4.dp)
                    ) {
                        TooltipIconButton(
                            onClick = { showLayerDrawer = true },
                            description = "Camadas",
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(Icons.Default.Layers, contentDescription = "Camadas", modifier = Modifier.size(18.dp))
                        }
                    }

                    Spacer(modifier = Modifier.width(4.dp))

                    // Overflow Menu (Full project & canvas operations)
                    var showMenu by remember { mutableStateOf(false) }
                    Box {
                        TooltipIconButton(
                            onClick = { showMenu = true },
                            description = "Mais Opções",
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Mais", modifier = Modifier.size(18.dp))
                        }
                        DropdownMenu(
                            expanded = showMenu,
                            onDismissRequest = { showMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Novo Projeto...") },
                                leadingIcon = { Icon(Icons.Default.AddBox, null) },
                                onClick = {
                                    showMenu = false
                                    showNewProjectDialog = true
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Gerenciar Projetos...") },
                                leadingIcon = { Icon(Icons.Default.FolderOpen, null) },
                                onClick = { showMenu = false; showProjectManager = true }
                            )
                            DropdownMenuItem(
                                text = { Text("Importar Imagem...") },
                                leadingIcon = { Icon(Icons.Default.Image, null) },
                                onClick = {
                                    showMenu = false
                                    imagePickerLauncher.launch("image/*")
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Redimensionar Tela...") },
                                leadingIcon = { Icon(Icons.Default.AspectRatio, null) },
                                onClick = {
                                    showMenu = false
                                    canvasResizeWidth = engine.width.toString()
                                    canvasResizeHeight = engine.height.toString()
                                    canvasResizeError = null
                                    showCanvasResizeDialog = true
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Selecionar Tudo") },
                                leadingIcon = { Icon(Icons.Default.SelectAll, null) },
                                onClick = {
                                    showMenu = false
                                    engine.selectAll()
                                    refreshState()
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Inverter Seleção") },
                                leadingIcon = { Icon(Icons.Default.InvertColors, null) },
                                onClick = {
                                    showMenu = false
                                    engine.invertSelection()
                                    refreshState()
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Colar seleção") },
                                leadingIcon = { Icon(Icons.Default.ContentPaste, null) },
                                enabled = canPasteSelection,
                                onClick = {
                                    showMenu = false
                                    engine.pasteSelectionClipboard()
                                    refreshState()
                                }
                            )
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("Exportar Imagem (PNG)") },
                                leadingIcon = { Icon(Icons.Default.Share, null) },
                                onClick = {
                                    showMenu = false
                                    engine.getRenderBitmap()?.let { onExportImage(it, Bitmap.CompressFormat.PNG) }
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Exportar Imagem (JPEG)") },
                                leadingIcon = { Icon(Icons.Default.Share, null) },
                                onClick = {
                                    showMenu = false
                                    engine.getRenderBitmap()?.let { onExportImage(it, Bitmap.CompressFormat.JPEG) }
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Exportar Imagem (WebP)") },
                                leadingIcon = { Icon(Icons.Default.Share, null) },
                                onClick = {
                                    showMenu = false
                                    val webpFormat = if (Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
                                    engine.getRenderBitmap()?.let { onExportImage(it, webpFormat) }
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Exportar Animação (GIF)") },
                                leadingIcon = { Icon(Icons.Default.Share, null) },
                                onClick = {
                                    showMenu = false
                                    engine.captureCurrentFrame()
                                    onExportGif(engine.renderAnimationFrames(), engine.animationFps, engine.animationLoop)
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Exportar Animação (WebM)") },
                                leadingIcon = { Icon(Icons.Default.Movie, null) },
                                onClick = {
                                    showMenu = false
                                    onExportWebm(engine.renderAnimationFrames(), engine.animationFps)
                                }
                            )
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("Espelhar Tela Horizontal") },
                                leadingIcon = { Icon(Icons.Default.Flip, null) },
                                onClick = {
                                    showMenu = false
                                    engine.flipCanvasH()
                                    refreshState()
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Espelhar Tela Vertical") },
                                leadingIcon = { Icon(Icons.Default.FlipCameraAndroid, null) },
                                onClick = {
                                    showMenu = false
                                    engine.flipCanvasV()
                                    refreshState()
                                }
                            )
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("Resetar Zoom & Posição") },
                                leadingIcon = { Icon(Icons.Default.CenterFocusStrong, null) },
                                onClick = {
                                    showMenu = false
                                    canvasViewRef?.resetView()
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Limpar Camada Atual") },
                                leadingIcon = { Icon(Icons.Default.DeleteSweep, null) },
                                onClick = {
                                    showMenu = false
                                    showClearLayerConfirm = true
                                }
                            )
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("esenho v${context.getString(R.string.app_version).substringBefore('-')}") },
                                leadingIcon = { Icon(Icons.Default.Info, null) },
                                enabled = false,
                                onClick = {}
                            )
                        }
                    }


                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // 1. Hardware-Accelerated Native Canvas Viewport
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
                modifier = Modifier.fillMaxSize()
            )

            // 2. Active Selection Floating HUD Bar
            if (selectionActive) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 16.dp)
                        .shadow(8.dp, RoundedCornerShape(18.dp)),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.95f),
                    shape = RoundedCornerShape(18.dp)
                ) {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box {
                            TextButton(
                                onClick = { showSelectionOpMenu = true },
                                contentPadding = PaddingValues(horizontal = 5.dp),
                                modifier = Modifier.height(30.dp)
                            ) {
                                Text(engine.selectionOp.displayName, fontSize = 10.sp, maxLines = 1)
                                Icon(Icons.Default.ExpandMore, null, modifier = Modifier.size(14.dp))
                            }
                            DropdownMenu(expanded = showSelectionOpMenu, onDismissRequest = { showSelectionOpMenu = false }) {
                                SelectionOp.values().forEach { operation ->
                                    DropdownMenuItem(
                                        text = { Text(operation.displayName) },
                                        trailingIcon = if (engine.selectionOp == operation) {{ Icon(Icons.Default.Check, null) }} else null,
                                        onClick = { engine.selectionOp = operation; showSelectionOpMenu = false }
                                    )
                                }
                            }
                        }
                        TooltipIconButton(
                            onClick = {
                                if (engine.copySelectionToClipboard()) canPasteSelection = true
                                refreshState()
                            },
                            description = "Copiar seleção",
                            modifier = Modifier.size(32.dp)
                        ) { Icon(Icons.Default.ContentCopy, contentDescription = "Copiar seleção", modifier = Modifier.size(17.dp)) }
                        TooltipIconButton(
                            onClick = {
                                if (engine.cutSelectionToClipboard()) canPasteSelection = true
                                refreshState()
                            },
                            description = "Recortar seleção",
                            modifier = Modifier.size(32.dp)
                        ) { Icon(Icons.Default.ContentCut, contentDescription = "Recortar seleção", modifier = Modifier.size(17.dp)) }
                        TooltipIconButton(
                            onClick = { engine.fillSelection(currentColor); refreshState() },
                            description = "Preencher seleção com a cor atual",
                            modifier = Modifier.size(32.dp)
                        ) { Icon(Icons.Default.FormatColorFill, contentDescription = "Preencher seleção", modifier = Modifier.size(17.dp)) }
                        TooltipIconButton(
                            onClick = { if (engine.cropCanvasToSelection()) refreshState() },
                            description = "Cortar tela para os limites da seleção",
                            modifier = Modifier.size(32.dp)
                        ) { Icon(Icons.Default.Crop, contentDescription = "Cortar tela para seleção", modifier = Modifier.size(17.dp)) }
                        TooltipIconButton(
                            onClick = {
                                customBrushTipName = "Ponta ${engine.presetCatalog.count { it.isCustom } + 1}"
                                showCreateBrushTipDialog = true
                            },
                            description = "Criar ponta de pincel da seleção",
                            modifier = Modifier.size(32.dp)
                        ) { Icon(Icons.Default.Brush, contentDescription = "Criar ponta de pincel", modifier = Modifier.size(17.dp)) }
                        TooltipIconButton(
                            onClick = {
                                customGrainName = "Textura ${engine.presetCatalog.count { it.isCustom } + 1}"
                                showCreateGrainDialog = true
                            },
                            description = "Criar textura de grão da seleção",
                            modifier = Modifier.size(32.dp)
                        ) { Icon(Icons.Default.GridOn, contentDescription = "Criar textura de grão", modifier = Modifier.size(17.dp)) }
                        TooltipIconButton(
                            onClick = { engine.pasteSelectionClipboard(); refreshState() },
                            description = "Colar seleção",
                            enabled = canPasteSelection,
                            modifier = Modifier.size(32.dp)
                        ) { Icon(Icons.Default.ContentPaste, contentDescription = "Colar seleção", modifier = Modifier.size(17.dp)) }
                        // Select All
                        TooltipIconButton(
                            onClick = { engine.selectAll(); refreshState() },
                            description = "Selecionar Tudo",
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.SelectAll, contentDescription = "Selecionar Tudo", modifier = Modifier.size(18.dp))
                        }

                        // Invert Selection
                        TooltipIconButton(
                            onClick = { engine.invertSelection(); refreshState() },
                            description = "Inverter Seleção",
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.InvertColors, contentDescription = "Inverter Seleção", modifier = Modifier.size(18.dp))
                        }

                        TextButton(
                            onClick = { showSelectionFeatherDialog = true },
                            contentPadding = PaddingValues(horizontal = 5.dp),
                            modifier = Modifier.height(32.dp)
                        ) { Text("Suavizar borda", fontSize = 10.sp, maxLines = 1) }

                        // Deselect
                        TooltipIconButton(
                            onClick = { engine.clearSelection(); refreshState() },
                            description = "Deselecionar",
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.Deselect, contentDescription = "Deselecionar", modifier = Modifier.size(18.dp))
                        }

                        // Delete Selected Pixels
                        TooltipIconButton(
                            onClick = { engine.clearSelectedPixels(); refreshState() },
                            description = "Apagar Pixels Selecionados",
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                Icons.Default.DeleteOutline,
                                contentDescription = "Apagar Pixels Selecionados",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        // Transform Selection (M4 / R1)
                        TooltipIconButton(
                            onClick = {
                                val ok = engine.beginTransform(selectionOnly = true)
                                if (ok) {
                                    isTransformActive = true
                                    currentTool = ToolMode.TRANSFORM
                                    refreshState()
                                }
                            },
                            description = "Transformar Seleção",
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.OpenWith, contentDescription = "Transformar Seleção", modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }

            // 3. Translucent Configurable Thumb Sliders (Left Edge)
            ThumbSliders(
                engine = engine,
                configuredParamIds = sideSliderParams,
                onConfiguredParamsChange = { newParams ->
                    sideSliderParams = newParams
                    storageManager.saveSideSliders(newParams)
                },
                onSizeChangeActive = { active ->
                    canvasViewRef?.previewBrushSize = if (active) engine.brushSize else 0f
                },
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 6.dp)
            )

            // 4. Floating Action & Toolbars (Transform HUD or Main Tools)
            if (isTransformActive) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = if (showAnimationTimeline) 252.dp else 24.dp)
                        .shadow(16.dp, RoundedCornerShape(24.dp)),
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(24.dp),
                    tonalElevation = 6.dp
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Transformar",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(end = 4.dp)
                        )
                        Box {
                            TextButton(
                                onClick = { showTransformModeMenu = true },
                                contentPadding = PaddingValues(horizontal = 6.dp)
                            ) {
                                Text(activeTransformMode.title, fontSize = 11.sp)
                                Icon(Icons.Default.ExpandMore, contentDescription = "Modo de transformação", modifier = Modifier.size(16.dp))
                            }
                            DropdownMenu(
                                expanded = showTransformModeMenu,
                                onDismissRequest = { showTransformModeMenu = false }
                            ) {
                                TransformState.Mode.values().forEach { mode ->
                                    DropdownMenuItem(
                                        text = { Text(mode.title) },
                                        trailingIcon = if (activeTransformMode == mode) {{ Icon(Icons.Default.Check, null) }} else null,
                                        onClick = {
                                            activeTransformMode = mode
                                            engine.transformModePreference = mode
                                            engine.transformState?.mode = mode
                                            showTransformModeMenu = false
                                            canvasViewRef?.invalidate()
                                        }
                                    )
                                }
                            }
                        }

                        TooltipIconButton(
                            onClick = {
                                transformLockAspect = !transformLockAspect
                                engine.transformLockAspect = transformLockAspect
                                canvasViewRef?.invalidate()
                            },
                            description = if (transformLockAspect) "Proporção bloqueada" else "Bloquear proporção",
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                if (transformLockAspect) Icons.Default.Lock else Icons.Default.LockOpen,
                                contentDescription = if (transformLockAspect) "Proporção bloqueada" else "Proporção livre",
                                tint = if (transformLockAspect) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.size(19.dp)
                            )
                        }

                        TextButton(
                            onClick = {
                                activeTransformInterpolation = if (activeTransformInterpolation == TransformState.Interpolation.NEAREST)
                                    TransformState.Interpolation.BILINEAR else TransformState.Interpolation.NEAREST
                                engine.transformInterpolation = activeTransformInterpolation
                                engine.transformState?.interpolation = activeTransformInterpolation
                                canvasViewRef?.invalidate()
                            },
                            contentPadding = PaddingValues(horizontal = 6.dp)
                        ) {
                            Text(activeTransformInterpolation.title, fontSize = 10.sp)
                        }

                        TooltipIconButton(
                            onClick = { engine.flipTransformH(); canvasViewRef?.invalidate() },
                            description = "Espelhar Horizontal",
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(Icons.Default.Flip, contentDescription = "Espelhar Horizontal", modifier = Modifier.size(20.dp))
                        }

                        TooltipIconButton(
                            onClick = { engine.rotateTransform90(); canvasViewRef?.invalidate() },
                            description = "Girar 90°",
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(Icons.Default.RotateRight, contentDescription = "Girar 90°", modifier = Modifier.size(20.dp))
                        }

                        Box {
                            TooltipIconButton(
                                onClick = { showTransformActions = true },
                                description = "Mais ações de transformação",
                                modifier = Modifier.size(36.dp)
                            ) { Icon(Icons.Default.MoreVert, contentDescription = "Ações de transformação", modifier = Modifier.size(20.dp)) }
                            DropdownMenu(
                                expanded = showTransformActions,
                                onDismissRequest = { showTransformActions = false }
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Girar 90° anti-horário") },
                                    leadingIcon = { Icon(Icons.Default.RotateLeft, null) },
                                    onClick = {
                                        showTransformActions = false
                                        engine.rotateTransformBy(-90f)
                                        canvasViewRef?.invalidate()
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("Girar 180°") },
                                    leadingIcon = { Icon(Icons.Default.Rotate90DegreesCw, null) },
                                    onClick = {
                                        showTransformActions = false
                                        engine.rotateTransformBy(180f)
                                        canvasViewRef?.invalidate()
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("Centralizar no canvas") },
                                    leadingIcon = { Icon(Icons.Default.CenterFocusStrong, null) },
                                    onClick = { showTransformActions = false; engine.centerTransform(); canvasViewRef?.invalidate() }
                                )
                                DropdownMenuItem(
                                    text = { Text("Ajustar ao canvas") },
                                    leadingIcon = { Icon(Icons.Default.FitScreen, null) },
                                    onClick = { showTransformActions = false; engine.fitTransformToCanvas(); canvasViewRef?.invalidate() }
                                )
                                DropdownMenuItem(
                                    text = { Text("Redefinir transformação") },
                                    leadingIcon = { Icon(Icons.Default.Refresh, null) },
                                    onClick = { showTransformActions = false; engine.resetTransform(); canvasViewRef?.invalidate() }
                                )
                            }
                        }

                        TooltipIconButton(
                            onClick = {
                                isTransformActive = false
                                engine.cancelTransform()
                                currentTool = ToolMode.BRUSH
                                refreshState()
                            },
                            description = "Cancelar Transformação",
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Cancelar",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        TooltipIconButton(
                            onClick = {
                                isTransformActive = false
                                engine.commitTransform()
                                currentTool = ToolMode.BRUSH
                                refreshState()
                            },
                            description = "Confirmar Transformação",
                            colors = IconButtonDefaults.filledIconButtonColors(containerColor = MaterialTheme.colorScheme.primary),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = "Confirmar Transformação",
                                tint = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            } else {
                Surface(
                    modifier = Modifier
                         .align(Alignment.BottomCenter)
                        .fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surface,
                    shape = androidx.compose.ui.graphics.RectangleShape,
                    tonalElevation = 6.dp
                ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val modeIcon = when (currentTool) {
                        ToolMode.ERASER -> null
                        ToolMode.SMUDGE -> Icons.Default.WaterDrop
                        ToolMode.BLEND -> Icons.Default.BlurCircular
                        ToolMode.FILL -> Icons.Default.FormatColorFill
                        ToolMode.LASSO_FILL -> Icons.Default.Gesture
                        ToolMode.SELECT_RECT, ToolMode.SELECT_LASSO, ToolMode.SELECT_ELLIPSE, ToolMode.SELECT_BRUSH_MASK -> Icons.Default.CropFree
                        ToolMode.SELECT_WAND -> Icons.Default.AutoFixHigh
                        ToolMode.TRANSFORM -> Icons.Default.OpenWith
                        ToolMode.LINE, ToolMode.RECTANGLE, ToolMode.ELLIPSE, ToolMode.ERASE_RECTANGLE, ToolMode.ERASE_ELLIPSE -> Icons.Default.Category
                        ToolMode.EYEDROPPER -> Icons.Default.Colorize
                        ToolMode.PAN -> Icons.Default.PanTool
                        else -> Icons.Default.Brush
                    }
                    Box {
                        ToolNavButton(
                            icon = modeIcon,
                            painter = if (currentTool == ToolMode.ERASER) painterResource(R.drawable.ic_eraser) else null,
                            isSelected = true,
                            description = "Modo: ${currentTool.displayName}",
                            onClick = { showSelectMenu = true }
                        )
                        DropdownMenu(expanded = showSelectMenu, onDismissRequest = { showSelectMenu = false }) {
                            val modes = listOf(
                                Triple(ToolMode.BRUSH, "Pincel", Icons.Default.Brush),
                                Triple(ToolMode.ERASER, "Borracha", Icons.Default.Delete),
                                Triple(ToolMode.SMUDGE, "Borrar (Smudge)", Icons.Default.WaterDrop),
                                Triple(ToolMode.BLEND, "Mesclar", Icons.Default.BlurCircular),
                                Triple(ToolMode.FILL, "Balde de tinta", Icons.Default.FormatColorFill),
                                Triple(ToolMode.LASSO_FILL, "Laço preenchido", Icons.Default.Gesture),
                                Triple(ToolMode.SELECT_RECT, "Seleção retangular", Icons.Default.CropSquare),
                                Triple(ToolMode.SELECT_ELLIPSE, "Seleção elíptica", Icons.Default.Circle),
                                Triple(ToolMode.SELECT_LASSO, "Seleção com laço", Icons.Default.Gesture),
                                Triple(ToolMode.SELECT_BRUSH_MASK, "Pincel de seleção", Icons.Default.Brush),
                                Triple(ToolMode.SELECT_WAND, "Varinha mágica", Icons.Default.AutoFixHigh),
                                Triple(ToolMode.TRANSFORM, "Transformar", Icons.Default.OpenWith),
                                Triple(ToolMode.LINE, "Linha", Icons.Default.HorizontalRule),
                                Triple(ToolMode.RECTANGLE, "Retângulo", Icons.Default.CropSquare),
                                Triple(ToolMode.ELLIPSE, "Elipse / círculo", Icons.Default.RadioButtonUnchecked),
                                Triple(ToolMode.ERASE_RECTANGLE, "Apagar retângulo", Icons.Default.CropSquare),
                                Triple(ToolMode.ERASE_ELLIPSE, "Apagar elipse", Icons.Default.Circle),
                                Triple(ToolMode.EYEDROPPER, "Conta-gotas", Icons.Default.Colorize),
                                Triple(ToolMode.PAN, "Mover tela", Icons.Default.PanTool)
                            )
                            modes.forEach { (mode, label, icon) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    leadingIcon = { if (mode == ToolMode.ERASER) Icon(painterResource(R.drawable.ic_eraser), null) else Icon(icon, null) },
                                    trailingIcon = if (currentTool == mode) {{ Icon(Icons.Default.Check, null) }} else null,
                                    onClick = {
                                        showSelectMenu = false
                                        if (mode == ToolMode.SELECT_WAND) {
                                            if (isTransformActive) engine.cancelTransform()
                                            isTransformActive = false
                                            currentTool = mode
                                            engine.currentTool = mode
                                            showWandSettings = true
                                        } else if (mode == ToolMode.TRANSFORM) {
                                            if (engine.beginTransform(selectionOnly = engine.selectionActive)) {
                                                isTransformActive = true
                                                currentTool = ToolMode.TRANSFORM
                                            }
                                        } else {
                                            if (isTransformActive) engine.cancelTransform()
                                            isTransformActive = false
                                            currentTool = mode
                                            engine.currentTool = mode
                                        }
                                        refreshState()
                                    }
                                )
                            }
                        }
                    }

                    val presetTypeIcon = engine.selectedPreset?.let { preset ->
                        getPresetIcon(mapPresetCategory(preset.category))
                    } ?: if (engine.selectedBrush != null) Icons.Default.AutoAwesome else Icons.Default.Brush
                    ToolNavButton(
                        icon = presetTypeIcon,
                        isSelected = showBrushDrawer,
                        description = "Preset: $activeBrushName",
                        onClick = { showBrushDrawer = true }
                    )

                    Spacer(Modifier.weight(1f))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                        modifier = Modifier.padding(start = 2.dp, end = 6.dp)
                    ) {
                        (engine.getActivePalette()?.colors?.take(4) ?: emptyList()).forEach { chipColor ->
                            Box(
                                Modifier.size(16.dp).clip(CircleShape).background(Color(chipColor))
                                    .border(1.dp, if (chipColor == currentColor) Color.White else Color.Gray, CircleShape)
                                    .clickable { currentColor = chipColor; engine.currentColor = chipColor; refreshState() }
                            )
                        }
                        TooltipIconButton(onClick = { showColorStudio = true }, description = "Color Studio", modifier = Modifier.size(36.dp)) {
                            Box(
                                Modifier.size(27.dp).clip(RoundedCornerShape(7.dp))
                                    .background(Color(currentColor))
                                    .border(2.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f), RoundedCornerShape(7.dp))
                            )
                        }
                    }
                }
            }
        }

            // 5. Animation Timeline Bar (Raster Animator)
            if (showAnimationTimeline) {
                AnimationTimelineBar(
                    engine = engine,
                    onFrameChanged = { canvasViewRef?.invalidate() },
                    onClose = { showAnimationTimeline = false },
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 56.dp)
                )
            }
        }

        // Modals & Drawers
        if (showClearLayerConfirm) {
            AlertDialog(
                onDismissRequest = { showClearLayerConfirm = false },
                title = { Text("Limpar camada?") },
                text = { Text("Todo o conteúdo da camada atual será removido.") },
                confirmButton = {
                    TextButton(onClick = {
                        engine.clearActiveLayer()
                        showClearLayerConfirm = false
                        refreshState()
                    }) { Text("Limpar", color = MaterialTheme.colorScheme.error) }
                },
                dismissButton = {
                    TextButton(onClick = { showClearLayerConfirm = false }) { Text("Cancelar") }
                }
            )
        }
        if (showWandSettings) {
            AlertDialog(
                onDismissRequest = { showWandSettings = false },
                title = { Text("Varinha mágica") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Tolerância: ${wandTolerance.toInt()}", style = MaterialTheme.typography.labelMedium)
                        Slider(
                            value = wandTolerance,
                            onValueChange = { wandTolerance = it; engine.wandTolerance = it.toInt() },
                            valueRange = 0f..255f,
                            steps = 254
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = wandContiguous,
                                onCheckedChange = { wandContiguous = it; engine.wandContiguous = it }
                            )
                            Text("Selecionar apenas pixels conectados")
                        }
                    }
                },
                confirmButton = { TextButton(onClick = { showWandSettings = false }) { Text("Pronto") } }
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
                            singleLine = true
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
                                Toast.makeText(context, "Ponta criada e salva nos presets", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "Não foi possível criar a ponta (limite de 2048 px por lado)", Toast.LENGTH_LONG).show()
                            }
                            refreshState()
                        }
                    ) { Text("Criar") }
                },
                dismissButton = { TextButton(onClick = { showCreateBrushTipDialog = false }) { Text("Cancelar") } }
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
                            singleLine = true
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
                                Toast.makeText(context, "Textura criada e salva nos presets", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "Não foi possível criar a textura (limite de 2048 px por lado)", Toast.LENGTH_LONG).show()
                            }
                            refreshState()
                        }
                    ) { Text("Criar") }
                },
                dismissButton = { TextButton(onClick = { showCreateGrainDialog = false }) { Text("Cancelar") } }
            )
        }
        if (showSelectionFeatherDialog) {
            AlertDialog(
                onDismissRequest = { showSelectionFeatherDialog = false },
                title = { Text("Suavizar borda da seleção") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Raio: ${selectionFeatherRadius.toInt()} px", style = MaterialTheme.typography.labelMedium)
                        Slider(
                            value = selectionFeatherRadius,
                            onValueChange = { selectionFeatherRadius = it },
                            valueRange = 1f..16f,
                            steps = 14
                        )
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        engine.featherSelection(selectionFeatherRadius.toInt())
                        showSelectionFeatherDialog = false
                        refreshState()
                    }) { Text("Aplicar") }
                },
                dismissButton = { TextButton(onClick = { showSelectionFeatherDialog = false }) { Text("Cancelar") } }
            )
        }
        if (showCanvasResizeDialog) {
            AlertDialog(
                onDismissRequest = { showCanvasResizeDialog = false },
                title = { Text("Redimensionar tela") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Todos os cels de animação serão redimensionados com interpolação suave.")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = canvasResizeWidth,
                                onValueChange = { canvasResizeWidth = it.filter(Char::isDigit).take(5); canvasResizeError = null },
                                label = { Text("Largura") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = canvasResizeHeight,
                                onValueChange = { canvasResizeHeight = it.filter(Char::isDigit).take(5); canvasResizeError = null },
                                label = { Text("Altura") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        canvasResizeError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        Text("Máximo: 8192 px por lado e 32 megapixels.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        val newWidth = canvasResizeWidth.toIntOrNull()
                        val newHeight = canvasResizeHeight.toIntOrNull()
                        if (newWidth == null || newHeight == null || newWidth !in 1..8192 || newHeight !in 1..8192 || newWidth.toLong() * newHeight > 32_000_000L) {
                            canvasResizeError = "Informe dimensões válidas dentro do limite."
                        } else if (engine.resizeCanvas(newWidth, newHeight)) {
                            showCanvasResizeDialog = false
                            canvasViewRef?.resetView()
                            refreshState()
                        } else if (newWidth == engine.width && newHeight == engine.height) {
                            showCanvasResizeDialog = false
                        } else {
                            canvasResizeError = "Falha ao redimensionar. Feche a transformação ou tente dimensões menores."
                        }
                    }) { Text("Aplicar") }
                },
                dismissButton = { TextButton(onClick = { showCanvasResizeDialog = false }) { Text("Cancelar") } }
            )
        }
        if (showProjectManager) {
            AlertDialog(
                onDismissRequest = { showProjectManager = false },
                title = { Text("Projetos") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Salve e abra projetos editáveis com camadas e quadros de animação. Uma cópia de recuperação é criada automaticamente a cada 5 minutos.")
                        Button(
                            onClick = { showProjectManager = false; saveProjectLauncher.launch("esenho.esenho") },
                            modifier = Modifier.fillMaxWidth()
                        ) { Icon(Icons.Default.Save, null); Spacer(Modifier.width(8.dp)); Text("Salvar projeto") }
                        OutlinedButton(
                            onClick = { showProjectManager = false; openProjectLauncher.launch(arrayOf("application/x-esenho", "application/octet-stream", "*/*")) },
                            modifier = Modifier.fillMaxWidth()
                        ) { Icon(Icons.Default.FolderOpen, null); Spacer(Modifier.width(8.dp)); Text("Abrir projeto") }
                        OutlinedButton(
                            enabled = context.filesDir.resolve("autosave.esenho").exists(),
                            onClick = {
                                showProjectManager = false
                                runCatching {
                                    context.filesDir.resolve("autosave.esenho").inputStream().use { EsenhoProjectIO.load(engine, it) }
                                }.onSuccess { refreshState(); Toast.makeText(context, "Autosave restaurado", Toast.LENGTH_SHORT).show() }
                                    .onFailure { Toast.makeText(context, "Falha ao restaurar autosave: ${it.message}", Toast.LENGTH_LONG).show() }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) { Icon(Icons.Default.History, null); Spacer(Modifier.width(8.dp)); Text("Restaurar autosave") }
                    }
                },
                confirmButton = { TextButton(onClick = { showProjectManager = false }) { Text("Fechar") } }
            )
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
                onDismiss = { showNewProjectDialog = false }
            )
        }

        if (showBrushDrawer) {
            BrushDrawer(
                engine = engine,
                onBrushUpdated = { refreshState() },
                onDismiss = { showBrushDrawer = false }
            )
        }

        if (showColorStudio) {
            ColorStudioModal(
                engine = engine,
                initialColor = currentColor,
                recentColors = engine.recentColors,
                onColorChanged = { c ->
                    currentColor = c
                    engine.currentColor = c
                    refreshState()
                },
                onDismiss = { showColorStudio = false }
            )
        }

        if (showLayerDrawer) {
            LayerDrawer(
                engine = engine,
                onLayersUpdated = { refreshState() },
                onDismiss = { showLayerDrawer = false }
            )
        }

        if (showFilterModal) {
            FilterModal(
                engine = engine,
                onFilterApplied = { refreshState() },
                onDismiss = { showFilterModal = false }
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
    content: @Composable () -> Unit
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = {
            PlainTooltip {
                Text(description, fontSize = 11.sp)
            }
        },
        state = rememberTooltipState()
    ) {
        IconButton(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            colors = colors,
            content = content
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
    onClick: () -> Unit
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = {
            PlainTooltip {
                Text(description, fontSize = 11.sp)
            }
        },
        state = rememberTooltipState()
    ) {
        IconButton(
            onClick = onClick,
            colors = IconButtonDefaults.iconButtonColors(
                containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
            ),
            modifier = Modifier.size(38.dp)
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = description, modifier = Modifier.size(19.dp))
            } else if (painter != null) {
                Icon(painter, contentDescription = description, modifier = Modifier.size(19.dp))
            }
        }
    }
}
