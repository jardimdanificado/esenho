package app.esenho.ui

import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import app.esenho.nativeengine.BrushPreset
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.ToolMode
import java.io.OutputStream

class NativePainterActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            EsenhoNativeTheme {
                EsenhoPainterScreen(
                    onExportImage = { bitmap -> exportBitmapToGallery(bitmap) }
                )
            }
        }
    }

    private fun exportBitmapToGallery(bitmap: Bitmap) {
        val filename = "esenho_${System.currentTimeMillis()}.png"
        val fos: OutputStream?
        var imageUri: Uri? = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Esenho")
            }
            imageUri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
            fos = imageUri?.let { contentResolver.openOutputStream(it) }
        } else {
            val imagesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES).toString()
            val image = java.io.File(imagesDir, filename)
            fos = java.io.FileOutputStream(image)
        }

        fos?.use {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            Toast.makeText(this, "Desenho salvo na Galeria!", Toast.LENGTH_SHORT).show()
        } ?: run {
            Toast.makeText(this, "Falha ao exportar imagem", Toast.LENGTH_SHORT).show()
        }
    }
}

@Composable
fun EsenhoNativeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = androidx.compose.ui.graphics.Color(0xFF64B5F6),
            surface = androidx.compose.ui.graphics.Color(0xFF212529),
            background = androidx.compose.ui.graphics.Color(0xFF161819),
            onSurface = androidx.compose.ui.graphics.Color(0xFFE9ECEF)
        ),
        content = content
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EsenhoPainterScreen(onExportImage: (Bitmap) -> Unit) {
    var canvasViewRef by remember { mutableStateOf<EsenhoCanvasView?>(null) }
    val engine = remember { EsenhoEngine() }

    var selectedTool by remember { mutableStateOf(ToolMode.BRUSH) }
    var currentColor by remember { mutableStateOf(Color.BLACK) }
    var brushSize by remember { mutableFloatStateOf(14f) }
    var brushOpacity by remember { mutableFloatStateOf(1.0f) }
    var canUndo by remember { mutableStateOf(false) }
    var canRedo by remember { mutableStateOf(false) }
    var showColorPalette by remember { mutableStateOf(false) }
    var showBrushSettings by remember { mutableStateOf(false) }

    fun refreshUndoState() {
        canUndo = engine.canUndo
        canRedo = engine.canRedo
    }

    val palette = listOf(
        Color.rgb(18, 18, 18),
        Color.rgb(80, 80, 80),
        Color.rgb(160, 160, 160),
        Color.WHITE,
        Color.rgb(230, 57, 70),
        Color.rgb(244, 162, 97),
        Color.rgb(233, 196, 106),
        Color.rgb(42, 157, 143),
        Color.rgb(38, 70, 83),
        Color.rgb(69, 123, 157),
        Color.rgb(155, 93, 229),
        Color.rgb(241, 91, 181)
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Esenho Nativo", style = MaterialTheme.typography.titleMedium) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                actions = {
                    IconButton(
                        onClick = {
                            engine.undo()
                            canvasViewRef?.invalidate()
                            refreshUndoState()
                        },
                        enabled = canUndo
                    ) {
                        Icon(Icons.Default.Undo, contentDescription = "Desfazer")
                    }
                    IconButton(
                        onClick = {
                            engine.redo()
                            canvasViewRef?.invalidate()
                            refreshUndoState()
                        },
                        enabled = canRedo
                    ) {
                        Icon(Icons.Default.Redo, contentDescription = "Refazer")
                    }
                    IconButton(
                        onClick = { canvasViewRef?.resetView() }
                    ) {
                        Icon(Icons.Default.CenterFocusStrong, contentDescription = "Resetar Zoom")
                    }
                    IconButton(
                        onClick = {
                            engine.clearCanvas()
                            canvasViewRef?.invalidate()
                            refreshUndoState()
                        }
                    ) {
                        Icon(Icons.Default.DeleteSweep, contentDescription = "Limpar Tela")
                    }
                    IconButton(
                        onClick = {
                            engine.getRenderBitmap()?.let { onExportImage(it) }
                        }
                    ) {
                        Icon(Icons.Default.Share, contentDescription = "Exportar")
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
            // High-Performance Native Canvas Viewport
            AndroidView(
                factory = { ctx ->
                    EsenhoCanvasView(ctx).apply {
                        this.engine = engine
                        this.onStateChanged = { refreshUndoState() }
                        canvasViewRef = this
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            // Preset Chips Row (Caneta, Lápis, Marcador, etc.)
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 10.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.9f))
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                BrushPreset.values().forEach { preset ->
                    AssistChip(
                        onClick = {
                            engine.applyPreset(preset)
                            brushSize = preset.size
                            brushOpacity = preset.opacity
                            if (preset == BrushPreset.ERASER) {
                                selectedTool = ToolMode.ERASER
                                engine.currentTool = ToolMode.ERASER
                            } else {
                                selectedTool = ToolMode.BRUSH
                                engine.currentTool = ToolMode.BRUSH
                            }
                        },
                        label = { Text(preset.displayName, style = MaterialTheme.typography.labelSmall) },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                        )
                    )
                }
            }

            // Quick Color Palette and Sliders Popover
            if (showColorPalette) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 90.dp)
                        .shadow(12.dp, RoundedCornerShape(16.dp)),
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Paleta de Cores", style = MaterialTheme.typography.labelMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.horizontalScroll(rememberScrollState())
                        ) {
                            palette.forEach { c ->
                                val isSelected = c == currentColor
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(androidx.compose.ui.graphics.Color(c))
                                        .border(
                                            width = if (isSelected) 3.dp else 1.dp,
                                            color = if (isSelected) androidx.compose.ui.graphics.Color.White else androidx.compose.ui.graphics.Color.Gray,
                                            shape = CircleShape
                                        )
                                        .clickable {
                                            currentColor = c
                                            engine.currentColor = c
                                            if (selectedTool == ToolMode.ERASER) {
                                                selectedTool = ToolMode.BRUSH
                                                engine.currentTool = ToolMode.BRUSH
                                            }
                                            showColorPalette = false
                                        }
                                )
                            }
                        }
                    }
                }
            }

            // Sliders Settings Popover
            if (showBrushSettings) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 90.dp)
                        .shadow(12.dp, RoundedCornerShape(16.dp)),
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .padding(16.dp)
                            .width(280.dp)
                    ) {
                        Text("Espessura: ${brushSize.toInt()}px", style = MaterialTheme.typography.labelMedium)
                        Slider(
                            value = brushSize,
                            onValueChange = {
                                brushSize = it
                                engine.brushSize = it
                            },
                            valueRange = 1f..150f
                        )

                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Opacidade: ${(brushOpacity * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
                        Slider(
                            value = brushOpacity,
                            onValueChange = {
                                brushOpacity = it
                                engine.brushOpacity = it
                            },
                            valueRange = 0.05f..1.0f
                        )
                    }
                }
            }

            // Bottom Floating Floating Action Bar (Tools)
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 16.dp)
                    .shadow(16.dp, RoundedCornerShape(28.dp)),
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(28.dp),
                tonalElevation = 6.dp
            ) {
                Row(
                    modifier = Modifier
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Tool: Brush
                    ToolButton(
                        icon = Icons.Default.Brush,
                        isSelected = selectedTool == ToolMode.BRUSH,
                        description = "Pincel",
                        onClick = {
                            selectedTool = ToolMode.BRUSH
                            engine.currentTool = ToolMode.BRUSH
                        }
                    )

                    // Tool: Eraser
                    ToolButton(
                        icon = Icons.Default.AutoFixNormal,
                        isSelected = selectedTool == ToolMode.ERASER,
                        description = "Borracha",
                        onClick = {
                            selectedTool = ToolMode.ERASER
                            engine.currentTool = ToolMode.ERASER
                        }
                    )

                    // Tool: Line
                    ToolButton(
                        icon = Icons.Default.HorizontalRule,
                        isSelected = selectedTool == ToolMode.LINE,
                        description = "Linha",
                        onClick = {
                            selectedTool = ToolMode.LINE
                            engine.currentTool = ToolMode.LINE
                        }
                    )

                    // Tool: Rectangle
                    ToolButton(
                        icon = Icons.Default.CropSquare,
                        isSelected = selectedTool == ToolMode.RECTANGLE,
                        description = "Retângulo",
                        onClick = {
                            selectedTool = ToolMode.RECTANGLE
                            engine.currentTool = ToolMode.RECTANGLE
                        }
                    )

                    // Tool: Circle
                    ToolButton(
                        icon = Icons.Default.RadioButtonUnchecked,
                        isSelected = selectedTool == ToolMode.CIRCLE,
                        description = "Círculo",
                        onClick = {
                            selectedTool = ToolMode.CIRCLE
                            engine.currentTool = ToolMode.CIRCLE
                        }
                    )

                    VerticalDivider(modifier = Modifier.height(24.dp))

                    // Size / Opacity slider toggle
                    IconButton(onClick = {
                        showBrushSettings = !showBrushSettings
                        if (showBrushSettings) showColorPalette = false
                    }) {
                        Icon(
                            Icons.Default.Tune,
                            contentDescription = "Ajustes de Pincel",
                            tint = if (showBrushSettings) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }

                    // Current Color button toggle
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(androidx.compose.ui.graphics.Color(currentColor))
                            .border(2.dp, androidx.compose.ui.graphics.Color.White, CircleShape)
                            .clickable {
                                showColorPalette = !showColorPalette
                                if (showColorPalette) showBrushSettings = false
                            }
                    )
                }
            }
        }
    }
}

@Composable
fun ToolButton(
    icon: ImageVector,
    isSelected: Boolean,
    description: String,
    onClick: () -> Unit
) {
    IconButton(
        onClick = onClick,
        colors = IconButtonDefaults.iconButtonColors(
            containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer else androidx.compose.ui.graphics.Color.Transparent,
            contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
        )
    ) {
        Icon(icon, contentDescription = description)
    }
}
