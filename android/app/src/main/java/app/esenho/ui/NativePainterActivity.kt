package app.esenho.ui

import android.content.ContentValues
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.esenho.nativeengine.*
import app.esenho.ui.components.*
import java.io.OutputStream

class NativePainterActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            EsenhoNativeTheme {
                EsenhoMainScreen(
                    onExportImage = { bitmap -> exportBitmapToGallery(bitmap) }
                )
            }
        }
    }

    private fun exportBitmapToGallery(bitmap: Bitmap) {
        val filename = "esenho_${System.currentTimeMillis()}.png"
        val fos: OutputStream?

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
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
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            Toast.makeText(this, "Desenho salvo com sucesso na Galeria!", Toast.LENGTH_SHORT).show()
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
fun EsenhoMainScreen(onExportImage: (Bitmap) -> Unit) {
    val context = LocalContext.current
    var canvasViewRef by remember { mutableStateOf<EsenhoCanvasView?>(null) }
    val engine = remember { EsenhoEngine(context) }

    // UI Dialog & Drawer States
    var showBrushDrawer by remember { mutableStateOf(false) }
    var showColorStudio by remember { mutableStateOf(false) }
    var showLayerDrawer by remember { mutableStateOf(false) }
    var showFilterModal by remember { mutableStateOf(false) }
    var showAnimationTimeline by remember { mutableStateOf(false) }

    // Reactive State
    var canUndo by remember { mutableStateOf(false) }
    var canRedo by remember { mutableStateOf(false) }
    var currentTool by remember { mutableStateOf(engine.currentTool) }
    var currentColor by remember { mutableIntStateOf(engine.currentColor) }
    var brushSize by remember { mutableFloatStateOf(engine.brushSize) }
    var brushOpacity by remember { mutableFloatStateOf(engine.brushOpacity) }
    var selectedBrush by remember { mutableStateOf(engine.selectedBrush) }
    var activeLayerCount by remember { mutableIntStateOf(engine.layers.size) }

    fun refreshState() {
        canUndo = engine.canUndo
        canRedo = engine.canRedo
        currentTool = engine.currentTool
        currentColor = engine.currentColor
        brushSize = engine.brushSize
        brushOpacity = engine.brushOpacity
        selectedBrush = engine.selectedBrush
        activeLayerCount = engine.layers.size
        canvasViewRef?.invalidate()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("esenho", style = MaterialTheme.typography.titleMedium)
                        // Active Brush Chip Button (Quick Catalog & Tuning)
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.85f),
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { showBrushDrawer = true }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Brush,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = engine.activeBrushDisplayName,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    maxLines = 1
                                )
                                Spacer(modifier = Modifier.width(4.dp))
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
                    IconButton(
                        onClick = {
                            engine.undo()
                            refreshState()
                        },
                        enabled = canUndo
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = "Desfazer")
                    }

                    // Redo
                    IconButton(
                        onClick = {
                            engine.redo()
                            refreshState()
                        },
                        enabled = canRedo
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Redo, contentDescription = "Refazer")
                    }

                    // Animation Toggle
                    IconButton(
                        onClick = { showAnimationTimeline = !showAnimationTimeline }
                    ) {
                        Icon(
                            Icons.Default.Animation,
                            contentDescription = "Animação",
                            tint = if (showAnimationTimeline) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }

                    // Filters Gallery
                    IconButton(onClick = { showFilterModal = true }) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = "Filtros")
                    }

                    // Layers Drawer
                    BadgedBox(
                        badge = {
                            Badge { Text("$activeLayerCount") }
                        },
                        modifier = Modifier.padding(end = 6.dp)
                    ) {
                        IconButton(onClick = { showLayerDrawer = true }) {
                            Icon(Icons.Default.Layers, contentDescription = "Camadas")
                        }
                    }

                    // Active Color Circle Swatch
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(Color(currentColor))
                            .border(2.dp, Color.White, CircleShape)
                            .clickable { showColorStudio = true }
                    )

                    Spacer(modifier = Modifier.width(6.dp))

                    // Overflow Menu (Export, Reset View, Clear)
                    var showMenu by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { showMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Mais")
                        }
                        DropdownMenu(
                            expanded = showMenu,
                            onDismissRequest = { showMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Exportar Imagem (PNG)") },
                                leadingIcon = { Icon(Icons.Default.Share, null) },
                                onClick = {
                                    showMenu = false
                                    engine.getRenderBitmap()?.let { onExportImage(it) }
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Resetar Zoom & Posição") },
                                leadingIcon = { Icon(Icons.Default.CenterFocusStrong, null) },
                                onClick = {
                                    showMenu = false
                                    canvasViewRef?.resetView()
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Limpar Camada") },
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

            // 2. Translucent Thumb Sliders (Infinite Painter style on Left Edge)
            ThumbSliders(
                size = brushSize,
                opacity = brushOpacity,
                onSizeChange = {
                    brushSize = it
                    engine.brushSize = it
                    canvasViewRef?.previewBrushSize = it
                },
                onSizeChangeActive = { active ->
                    canvasViewRef?.previewBrushSize = if (active) brushSize else 0f
                },
                onOpacityChange = {
                    brushOpacity = it
                    engine.brushOpacity = it
                },
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 6.dp)
            )

            // 3. Floating Bottom Toolbar (Tools & Shapes)
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
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Pincel (Clique abre o catálogo de 59 pincéis procedurais)
                    ToolNavButton(
                        icon = Icons.Default.Brush,
                        isSelected = currentTool == ToolMode.BRUSH,
                        description = "Pincel",
                        onClick = {
                            currentTool = ToolMode.BRUSH
                            engine.currentTool = ToolMode.BRUSH
                            showBrushDrawer = true
                        }
                    )

                    // Borracha
                    ToolNavButton(
                        icon = Icons.Default.AutoFixNormal,
                        isSelected = currentTool == ToolMode.ERASER,
                        description = "Borracha",
                        onClick = {
                            currentTool = ToolMode.ERASER
                            engine.currentTool = ToolMode.ERASER
                        }
                    )

                    // Balde de Tinta / Preenchimento
                    ToolNavButton(
                        icon = Icons.Default.FormatColorFill,
                        isSelected = currentTool == ToolMode.FILL,
                        description = "Preenchimento",
                        onClick = {
                            currentTool = ToolMode.FILL
                            engine.currentTool = ToolMode.FILL
                        }
                    )

                    // Linha
                    ToolNavButton(
                        icon = Icons.Default.HorizontalRule,
                        isSelected = currentTool == ToolMode.LINE,
                        description = "Linha",
                        onClick = {
                            currentTool = ToolMode.LINE
                            engine.currentTool = ToolMode.LINE
                        }
                    )

                    // Retângulo
                    ToolNavButton(
                        icon = Icons.Default.CropSquare,
                        isSelected = currentTool == ToolMode.RECTANGLE,
                        description = "Retângulo",
                        onClick = {
                            currentTool = ToolMode.RECTANGLE
                            engine.currentTool = ToolMode.RECTANGLE
                        }
                    )

                    // Círculo
                    ToolNavButton(
                        icon = Icons.Default.RadioButtonUnchecked,
                        isSelected = currentTool == ToolMode.CIRCLE,
                        description = "Círculo",
                        onClick = {
                            currentTool = ToolMode.CIRCLE
                            engine.currentTool = ToolMode.CIRCLE
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

            // 4. Animation Timeline Bar (Raster Animator)
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
        if (showBrushDrawer) {
            BrushDrawer(
                engine = engine,
                onBrushUpdated = { refreshState() },
                onDismiss = { showBrushDrawer = false }
            )
        }

        if (showColorStudio) {
            ColorStudioModal(
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

@Composable
fun ToolNavButton(
    icon: ImageVector,
    isSelected: Boolean,
    description: String,
    onClick: () -> Unit
) {
    IconButton(
        onClick = onClick,
        colors = IconButtonDefaults.iconButtonColors(
            containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
            contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
        ),
        modifier = Modifier.size(40.dp)
    ) {
        Icon(icon, contentDescription = description, modifier = Modifier.size(20.dp))
    }
}
