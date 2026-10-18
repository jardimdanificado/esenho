package app.esenho.ui

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
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

class NativePainterActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        setContent {
            EsenhoNativeTheme {
                EsenhoMainScreen(
                    onExportImage = { bitmap, format -> exportBitmapToGallery(bitmap, format) }
                )
            }
        }
    }

    private fun exportBitmapToGallery(bitmap: Bitmap, format: Bitmap.CompressFormat = Bitmap.CompressFormat.PNG) {
        val isJpeg = (format == Bitmap.CompressFormat.JPEG)
        val ext = if (isJpeg) "jpg" else "png"
        val mime = if (isJpeg) "image/jpeg" else "image/png"
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
}

@Composable
fun EsenhoNativeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xFF64B5F6),
            primaryContainer = Color(0xFF1E3A5F),
            surface = Color(0xFF202326),
            surfaceVariant = Color(0xFF2C3035),
            background = Color(0xFF121416),
            onSurface = Color(0xFFE6E8EA)
        ),
        content = content
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EsenhoMainScreen(onExportImage: (Bitmap, Bitmap.CompressFormat) -> Unit) {
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

    // Floating Tool Dropdowns
    var showSelectMenu by remember { mutableStateOf(false) }
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
        symmetryMode = engine.symmetryMode
        pixelArtGrid = engine.pixelArtGrid
        isTransformActive = engine.transformState != null
        activeBrushName = engine.activeBrushDisplayName
        canvasViewRef?.invalidate()
    }

    // Image Picker Launcher (Import image from Android Gallery to Layer)
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val bitmap = BitmapFactory.decodeStream(inputStream)
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
                                text = { Text("Importar Imagem...") },
                                leadingIcon = { Icon(Icons.Default.Image, null) },
                                onClick = {
                                    showMenu = false
                                    imagePickerLauncher.launch("image/*")
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
                                    engine.clearActiveLayer()
                                    refreshState()
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
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
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
                        .padding(bottom = if (showAnimationTimeline) 120.dp else 24.dp)
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
                        ToolMode.SELECT_RECT, ToolMode.SELECT_LASSO -> Icons.Default.CropFree
                        ToolMode.TRANSFORM -> Icons.Default.OpenWith
                        ToolMode.LINE, ToolMode.RECTANGLE, ToolMode.CIRCLE -> Icons.Default.Category
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
                                Triple(ToolMode.SELECT_LASSO, "Seleção com laço", Icons.Default.Gesture),
                                Triple(ToolMode.TRANSFORM, "Transformar", Icons.Default.OpenWith),
                                Triple(ToolMode.LINE, "Linha", Icons.Default.HorizontalRule),
                                Triple(ToolMode.RECTANGLE, "Retângulo", Icons.Default.CropSquare),
                                Triple(ToolMode.CIRCLE, "Círculo", Icons.Default.RadioButtonUnchecked),
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
                                        if (mode == ToolMode.TRANSFORM) {
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
                            Icon(Icons.Default.Palette, contentDescription = "Color Studio", modifier = Modifier.size(18.dp), tint = Color(currentColor))
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
