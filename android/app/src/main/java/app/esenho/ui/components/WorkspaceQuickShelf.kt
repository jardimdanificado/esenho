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
import androidx.compose.runtime.LaunchedEffect
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

/**
 * Two flat, independent strips: swatches and brush presets. Each strip keeps its
 * own scroll state and its own favorites/history toggle. Entries select the
 * brush by catalog id, so a stale item can never swallow a tap.
 */
@Composable
fun WorkspaceQuickShelf(
    engine: EsenhoEngine,
    favoriteBrushIds: Set<String>,
    revision: Int,
    onChanged: () -> Unit,
    onOpenCurrentBrush: () -> Unit,
    onColor: () -> Unit,
    onPresets: () -> Unit,
    colorsRecent: Boolean,
    onToggleColorsRecent: () -> Unit,
    brushesRecent: Boolean,
    onToggleBrushesRecent: () -> Unit,
) {
    val brushes =
        remember(
            revision,
            favoriteBrushIds,
            brushesRecent,
            engine.presetCatalog.size,
            engine.brushCatalog.size,
        ) {
            val catalog =
                engine.presetCatalog.map {
                    ShelfBrush("preset:${it.id}", it.name, mapPresetCategory(it.category))
                } +
                    engine.brushCatalog.map {
                        ShelfBrush("brush:${it.id}", it.title, mapWasmCategory(it.category))
                    }
            if (brushesRecent) {
                val byId = catalog.associateBy { it.id }
                engine.recentBrushIds.mapNotNull { byId[it] }
            } else catalog.filter { it.id in favoriteBrushIds }
        }
    val colors =
        if (colorsRecent) engine.recentColors
        else
            engine.palettes.firstOrNull { it.id == engine.activePaletteId }?.colors
                ?: engine.palettes.firstOrNull()?.colors.orEmpty()
    val selected =
        engine.selectedPreset?.let { "preset:${it.id}" }
            ?: engine.selectedBrush?.let { "brush:${it.id}" }
    val colorScroll = rememberLazyListState()
    val brushScroll = rememberLazyListState()
    // Keep the active brush visible so a tap always shows a visible result.
    LaunchedEffect(selected, brushes) {
        val index = brushes.indexOfFirst { it.id == selected }
        if (index >= 0) brushScroll.animateScrollToItem(index)
    }

    val colorStrip: @Composable (Modifier) -> Unit = { modifier ->
        Row(
            modifier,
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Box(
                Modifier.size(32.dp).clickable(onClick = onColor).semantics {
                    contentDescription =
                        "Cor atual #%06X; abrir Color Studio"
                            .format(engine.currentColor and 0xFFFFFF)
                },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(20.dp)
                        .clip(CircleShape)
                        .background(Color(engine.currentColor))
                        .border(1.dp, MaterialTheme.colorScheme.onSurfaceVariant, CircleShape)
                )
            }
            if (colors.isEmpty())
                Text(
                    if (colorsRecent) "Cores recentes" else "Cores favoritas",
                    Modifier.weight(1f).clickable(onClick = onColor),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
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
                            Modifier.size(24.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color(color))
                                .border(
                                    if (engine.currentColor == color) 2.dp else 1.dp,
                                    if (engine.currentColor == color)
                                        MaterialTheme.colorScheme.onSurface
                                    else
                                        MaterialTheme.colorScheme.outlineVariant,
                                    RoundedCornerShape(3.dp),
                                )
                                .clickable { engine.currentColor = color; onChanged() }
                                .semantics {
                                    contentDescription = "Usar cor #%06X".format(color and 0xFFFFFF)
                                }
                        )
                    }
                }
            Box(
                Modifier.size(32.dp).clickable(onClick = onToggleColorsRecent).semantics {
                    contentDescription =
                        if (colorsRecent) "Mostrar cores favoritas"
                        else "Mostrar cores recentes"
                },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (colorsRecent) Icons.Default.History else Icons.Default.Star,
                    null,
                    Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    val brushStrip: @Composable (Modifier) -> Unit = { modifier ->
        Row(
            modifier,
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Box(
                Modifier.size(32.dp).clickable(onClick = onPresets).semantics {
                    contentDescription = "Abrir seletor de presets de pincel"
                },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Default.Brush,
                    null,
                    Modifier.size(19.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (brushes.isEmpty())
                Text(
                    if (brushesRecent) "Pincéis recentes" else "Pincéis favoritos",
                    Modifier.weight(1f).clickable(onClick = onPresets),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
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
                            Modifier.height(28.dp)
                                .widthIn(max = 116.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(
                                    if (brush.id == selected)
                                        MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
                                )
                                .clickable {
                                    val picked =
                                        if (brush.id.startsWith("preset:"))
                                            engine.selectPresetById(brush.id.removePrefix("preset:"))
                                        else
                                            engine.selectBrushById(brush.id.removePrefix("brush:"))
                                    // A tap must always produce a visible result. If the entry
                                    // points at a brush that no longer exists, open the drawer
                                    // instead of doing nothing.
                                    if (!picked) onOpenCurrentBrush()
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
            Box(
                Modifier.size(32.dp).clickable(onClick = onToggleBrushesRecent).semantics {
                    contentDescription =
                        if (brushesRecent) "Mostrar pincéis favoritos"
                        else "Mostrar pincéis recentes"
                },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (brushesRecent) Icons.Default.History else Icons.Default.Star,
                    null,
                    Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    Surface(color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxWidth()) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            colorStrip(Modifier.fillMaxWidth().height(40.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            brushStrip(Modifier.fillMaxWidth().height(40.dp))
        }
    }
}
