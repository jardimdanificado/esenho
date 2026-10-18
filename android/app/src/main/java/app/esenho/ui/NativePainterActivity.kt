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
    var showShapesMenu by remember { mutableStateOf(false) }
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
                    refreshState()
                    Toast.makeText(context, "Imagem importada para nova camada!", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Erro ao importar imagem", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("esenho", style = MaterialTheme.typography.titleMedium)
                        // Active Brush Chip Button (Quick Catalog & Tuning)
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.85f),
                            modifier = Modifier
                                .weight(1f, fill = false)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { showBrushDrawer = true }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Brush,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = engine.activeBrushDisplayName,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Spacer(modifier = Modifier.width(2.dp))
                                Icon(
                                    Icons.Default.ArrowDropDown,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                actions = {
                    // Undo
                    TooltipIconButton(
                        onClick = {
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
                            engine.redo()
                            refreshState()
                        },
                        enabled = canRedo,
                        description = "Refazer",
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Redo, contentDescription = "Refazer", modifier = Modifier.size(18.dp))
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

                    // Active Color Circle Swatch & Quick Palette Color Chips (F17)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        modifier = Modifier.padding(horizontal = 2.dp)
                    ) {
                        TooltipBox(
                            positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                            tooltip = { PlainTooltip { Text("Seletor de Cores", fontSize = 11.sp) } },
                            state = rememberTooltipState()
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .clip(CircleShape)
                                    .background(Color(currentColor))
                                    .border(2.dp, Color.White, CircleShape)
                                    .clickable { showColorStudio = true }
                            )
                        }

                        // Compact horizontal strip of active palette colors (capped at 6 chips)
                        val activePalette = engine.getActivePalette()
                        val quickChips = activePalette?.colors?.take(6) ?: emptyList()
                        for (chipColor in quickChips) {
                            val isSelected = chipColor == currentColor
                            Box(
                                modifier = Modifier
                                    .size(if (isSelected) 18.dp else 14.dp)
                                    .clip(CircleShape)
                                    .background(Color(chipColor))
                                    .border(
                                        width = if (isSelected) 2.dp else 1.dp,
                                        color = if (isSelected) MaterialTheme.colorScheme.primary else Color.White.copy(alpha = 0.5f),
                                        shape = CircleShape
                                    )
                                    .clickable {
                                        currentColor = chipColor
                                        engine.currentColor = chipColor
                                        refreshState()
                                    }
                            )
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
                            DropdownMenuItem(
                                text = { Text(if (engine.pixelArtGrid) "Desativar Grade" else "Grade Pixel Art") },
                                leadingIcon = { Icon(Icons.Default.GridOn, null) },
                                onClick = {
                                    showMenu = false
                                    engine.pixelArtGrid = !engine.pixelArtGrid
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
            if (engine.transformState != null || currentTool == ToolMode.TRANSFORM) {
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

                        FilledTonalIconButton(
                            onClick = {
                                engine.cancelTransform()
                                currentTool = ToolMode.BRUSH
                                refreshState()
                            },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Cancelar",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        IconButton(
                            onClick = {
                                engine.commitTransform()
                                currentTool = ToolMode.BRUSH
                                refreshState()
                            },
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
                        .padding(bottom = if (showAnimationTimeline) 120.dp else 16.dp)
                        .shadow(16.dp, RoundedCornerShape(28.dp)),
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(28.dp),
                    tonalElevation = 6.dp
                ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Pincel
                    ToolNavButton(
                        icon = Icons.Default.Brush,
                        isSelected = currentTool == ToolMode.BRUSH,
                        description = "Pincel",
                        onClick = {
                            currentTool = ToolMode.BRUSH
                            engine.currentTool = ToolMode.BRUSH
                        }
                    )

                    // Biblioteca de Pincéis
                    ToolNavButton(
                        icon = Icons.Default.AutoAwesomeMosaic,
                        isSelected = showBrushDrawer,
                        description = "Biblioteca de Pincéis",
                        onClick = {
                            showBrushDrawer = true
                        }
                    )

                    // Borracha
                    ToolNavButton(
                        painter = painterResource(R.drawable.ic_eraser),
                        isSelected = currentTool == ToolMode.ERASER,
                        description = "Borracha",
                        onClick = {
                            currentTool = ToolMode.ERASER
                            engine.currentTool = ToolMode.ERASER
                        }
                    )

                    // Borrar (Smudge)
                    ToolNavButton(
                        icon = Icons.Default.WaterDrop,
                        isSelected = currentTool == ToolMode.SMUDGE,
                        description = "Borrar (Smudge)",
                        onClick = {
                            currentTool = ToolMode.SMUDGE
                            engine.currentTool = ToolMode.SMUDGE
                        }
                    )

                    // Mesclar (Blend)
                    ToolNavButton(
                        icon = Icons.Default.BlurCircular,
                        isSelected = currentTool == ToolMode.BLEND,
                        description = "Mesclar (Blend)",
                        onClick = {
                            currentTool = ToolMode.BLEND
                            engine.currentTool = ToolMode.BLEND
                        }
                    )

                    // Balde de Tinta
                    ToolNavButton(
                        icon = Icons.Default.FormatColorFill,
                        isSelected = currentTool == ToolMode.FILL,
                        description = "Balde de Tinta",
                        onClick = {
                            currentTool = ToolMode.FILL
                            engine.currentTool = ToolMode.FILL
                        }
                    )

                    // Laço Preenchido
                    ToolNavButton(
                        icon = Icons.Default.Gesture,
                        isSelected = currentTool == ToolMode.LASSO_FILL,
                        description = "Laço Preenchido",
                        onClick = {
                            currentTool = ToolMode.LASSO_FILL
                            engine.currentTool = ToolMode.LASSO_FILL
                        }
                    )

                    // Seleção (Dropdown: Retângulo / Laço)
                    Box {
                        ToolNavButton(
                            icon = Icons.Default.CropFree,
                            isSelected = currentTool == ToolMode.SELECT_RECT || currentTool == ToolMode.SELECT_LASSO,
                            description = "Seleção",
                            onClick = { showSelectMenu = true }
                        )
                        DropdownMenu(
                            expanded = showSelectMenu,
                            onDismissRequest = { showSelectMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Seleção Retangular (Marquee)") },
                                leadingIcon = { Icon(Icons.Default.CropSquare, null) },
                                onClick = {
                                    showSelectMenu = false
                                    currentTool = ToolMode.SELECT_RECT
                                    engine.currentTool = ToolMode.SELECT_RECT
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Seleção com Laço (Lasso)") },
                                leadingIcon = { Icon(Icons.Default.Gesture, null) },
                                onClick = {
                                    showSelectMenu = false
                                    currentTool = ToolMode.SELECT_LASSO
                                    engine.currentTool = ToolMode.SELECT_LASSO
                                }
                            )
                            if (engine.selectionActive) {
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = { Text("Deselecionar") },
                                    leadingIcon = { Icon(Icons.Default.Close, null) },
                                    onClick = {
                                        showSelectMenu = false
                                        engine.clearSelection()
                                        refreshState()
                                    }
                                )
                            }
                        }
                    }

                    // Transformar (M4 / R1)
                    ToolNavButton(
                        icon = Icons.Default.OpenWith,
                        isSelected = currentTool == ToolMode.TRANSFORM,
                        description = "Transformar (Mover / Redimensionar / Girar)",
                        onClick = {
                            val ok = engine.beginTransform(selectionOnly = engine.selectionActive)
                            if (ok) {
                                currentTool = ToolMode.TRANSFORM
                                refreshState()
                            }
                        }
                    )

                    // Formas (Dropdown: Linha, Retângulo, Círculo)
                    Box {
                        ToolNavButton(
                            icon = Icons.Default.Category,
                            isSelected = currentTool == ToolMode.LINE || currentTool == ToolMode.RECTANGLE || currentTool == ToolMode.CIRCLE,
                            description = "Formas",
                            onClick = { showShapesMenu = true }
                        )
                        DropdownMenu(
                            expanded = showShapesMenu,
                            onDismissRequest = { showShapesMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Linha Reta") },
                                leadingIcon = { Icon(Icons.Default.HorizontalRule, null) },
                                onClick = {
                                    showShapesMenu = false
                                    currentTool = ToolMode.LINE
                                    engine.currentTool = ToolMode.LINE
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Retângulo") },
                                leadingIcon = { Icon(Icons.Default.CropSquare, null) },
                                onClick = {
                                    showShapesMenu = false
                                    currentTool = ToolMode.RECTANGLE
                                    engine.currentTool = ToolMode.RECTANGLE
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Círculo") },
                                leadingIcon = { Icon(Icons.Default.RadioButtonUnchecked, null) },
                                onClick = {
                                    showShapesMenu = false
                                    currentTool = ToolMode.CIRCLE
                                    engine.currentTool = ToolMode.CIRCLE
                                }
                            )
                        }
                    }

                    // Simetria (Dropdown: Off, X, Y, Quad, Radial)
                    Box {
                        ToolNavButton(
                            icon = Icons.Default.Stream,
                            isSelected = symmetryMode != SymmetryMode.OFF,
                            description = "Simetria",
                            onClick = { showSymmetryMenu = true }
                        )
                        DropdownMenu(
                            expanded = showSymmetryMenu,
                            onDismissRequest = { showSymmetryMenu = false }
                        ) {
                            SymmetryMode.values().forEach { mode ->
                                DropdownMenuItem(
                                    text = { Text(mode.displayName) },
                                    trailingIcon = if (symmetryMode == mode) {
                                        { Icon(Icons.Default.Check, null) }
                                    } else null,
                                    onClick = {
                                        showSymmetryMenu = false
                                        engine.symmetryMode = mode
                                        refreshState()
                                    }
                                )
                            }
                        }
                    }

                    // Grade Pixel Art Toggle
                    ToolNavButton(
                        icon = Icons.Default.GridOn,
                        isSelected = pixelArtGrid,
                        description = "Grade Pixel Art",
                        onClick = {
                            engine.pixelArtGrid = !engine.pixelArtGrid
                            refreshState()
                        }
                    )

                    // Conta-gotas
                    ToolNavButton(
                        icon = Icons.Default.Colorize,
                        isSelected = currentTool == ToolMode.EYEDROPPER,
                        description = "Conta-gotas",
                        onClick = {
                            currentTool = ToolMode.EYEDROPPER
                            engine.currentTool = ToolMode.EYEDROPPER
                        }
                    )

                    // Mover Tela (Pan)
                    ToolNavButton(
                        icon = Icons.Default.PanTool,
                        isSelected = currentTool == ToolMode.PAN,
                        description = "Mover Tela",
                        onClick = {
                            currentTool = ToolMode.PAN
                            engine.currentTool = ToolMode.PAN
                        }
                    )
                }
            }
        }

            // 5. Animation Timeline Bar (Raster Animator)
            if (showAnimationTimeline) {
                AnimationTimelineBar(
                    engine = engine,
                    onFrameChanged = { canvasViewRef?.invalidate() },
                    onClose = { showAnimationTimeline = false },
                    modifier = Modifier.align(Alignment.BottomCenter)
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
