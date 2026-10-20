package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.EsenhoEngine

private data class ShelfBrush(val id: String, val name: String, val group: String)

/** Shared or separate rows, each strip keeps its own scroll position. */
@Composable
fun WorkspaceQuickShelf(
    engine: EsenhoEngine,
    favoriteBrushIds: Set<String>,
    recent: Boolean,
    separateRows: Boolean,
    revision: Int,
    onChanged: () -> Unit,
    onOpenBrushes: () -> Unit,
    onOpenColors: () -> Unit,
) {
    val brushes =
        remember(revision, favoriteBrushIds, recent) {
            val catalog =
                engine.presetCatalog.map {
                    ShelfBrush("preset:${it.id}", it.name, mapPresetCategory(it.category))
                } +
                    engine.brushCatalog.map {
                        ShelfBrush("brush:${it.id}", it.title, mapWasmCategory(it.category))
                    }
            if (recent) {
                val byId = catalog.associateBy { it.id }
                engine.recentBrushIds.mapNotNull { byId[it] }
            } else catalog.filter { it.id in favoriteBrushIds }
        }
    val colors =
        if (recent) engine.recentColors
        else
            engine.palettes.firstOrNull { it.id == engine.activePaletteId }?.colors
                ?: engine.palettes.firstOrNull()?.colors.orEmpty()
    val selected =
        engine.selectedPreset?.let { "preset:${it.id}" }
            ?: engine.selectedBrush?.let { "brush:${it.id}" }
    val colorScroll = rememberLazyListState()
    val brushScroll = rememberLazyListState()
    val colorStrip: @Composable (Modifier) -> Unit = { modifier ->
        Row(modifier, verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(32.dp).clickable(onClick = onOpenColors).semantics {
                    contentDescription =
                        "Cor atual #%06X; abrir Color Studio"
                            .format(engine.currentColor and 0xFFFFFF)
                },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(24.dp)
                        .clip(CircleShape)
                        .background(Color(engine.currentColor))
                        .border(1.dp, MaterialTheme.colorScheme.onSurfaceVariant, CircleShape)
                )
            }
            if (colors.isEmpty())
                Text(
                    "Escolher cores",
                    Modifier.weight(1f).clickable(onClick = onOpenColors),
                    style = MaterialTheme.typography.labelSmall,
                )
            else
                LazyRow(
                    Modifier.weight(1f),
                    state = colorScroll,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(end = 4.dp),
                ) {
                    items(colors.size) { index ->
                        val color = colors[index]
                        Box(
                            Modifier.size(26.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(color))
                                .border(
                                    if (engine.currentColor == color) 2.dp else 1.dp,
                                    if (engine.currentColor == color)
                                        MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.outline,
                                    RoundedCornerShape(4.dp),
                                )
                                .clickable {
                                    engine.currentColor = color
                                    onChanged()
                                }
                                .semantics {
                                    contentDescription = "Usar cor #%06X".format(color and 0xFFFFFF)
                                }
                        )
                    }
                }
        }
    }
    val brushStrip: @Composable (Modifier) -> Unit = { modifier ->
        Row(modifier, verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Default.Brush,
                "Abrir seletor de presets de pincel",
                Modifier.size(28.dp).clickable(onClick = onOpenBrushes).padding(6.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (brushes.isEmpty())
                Text(
                    if (recent) "Escolher pincel" else "Favoritar pincéis",
                    Modifier.weight(1f).clickable(onClick = onOpenBrushes),
                    style = MaterialTheme.typography.labelSmall,
                )
            else
                LazyRow(
                    Modifier.weight(1f),
                    state = brushScroll,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(end = 4.dp),
                ) {
                    items(brushes, key = { it.id }) { brush ->
                        Row(
                            Modifier.height(27.dp)
                                .widthIn(max = 116.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(
                                    if (brush.id == selected)
                                        MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant
                                )
                                .clickable {
                                    if (brush.id.startsWith("preset:"))
                                        engine.presetCatalog
                                            .firstOrNull { "preset:${it.id}" == brush.id }
                                            ?.let { engine.selectPreset(it) }
                                    else
                                        engine.brushCatalog
                                            .firstOrNull { "brush:${it.id}" == brush.id }
                                            ?.let { engine.selectBrush(it) }
                                    onChanged()
                                }
                                .semantics { contentDescription = "Usar pincel ${brush.name}" }
                                .padding(horizontal = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                if (brush.id.startsWith("preset:")) getPresetIcon(brush.group)
                                else getWasmIcon(brush.group),
                                null,
                                Modifier.size(15.dp),
                            )
                            Text(
                                brush.name,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
        }
    }
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            if (separateRows) {
                colorStrip(Modifier.fillMaxWidth().height(35.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                brushStrip(Modifier.fillMaxWidth().height(35.dp))
            } else {
                Row(
                    Modifier.fillMaxWidth().height(35.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    colorStrip(Modifier.weight(1f))
                    VerticalDivider(
                        Modifier.height(24.dp),
                        color = MaterialTheme.colorScheme.outlineVariant,
                    )
                    brushStrip(Modifier.weight(1f))
                }
            }
        }
    }
}
