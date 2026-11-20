package app.esenho.ui.components

import androidx.compose.foundation.background
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

/** Single strip: swatches on the left, brushes on the right, star toggles favorites/history. */
@Composable
fun WorkspaceQuickShelf(
    engine: EsenhoEngine,
    favoriteBrushIds: Set<String>,
    revision: Int,
    onChanged: () -> Unit,
    onOpenCurrentBrush: () -> Unit,
    onColor: () -> Unit,
    onPresets: () -> Unit,
    recent: Boolean,
    onToggleRecent: () -> Unit,
) {
    val selected = engine.selectedPreset?.let { "preset:${it.id}" }
        ?: engine.selectedBrush?.let { "brush:${it.id}" }
    val catalog =
        remember(revision) {
            engine.presetCatalog.map {
                ShelfBrush("preset:${it.id}", it.name, mapPresetCategory(it.category))
            } +
                engine.brushCatalog.map {
                    ShelfBrush("brush:${it.id}", it.title, mapWasmCategory(it.category))
                }
        }
    val byId = catalog.associateBy { it.id }
    val colorScroll = rememberLazyListState()
    val brushScroll = rememberLazyListState()
    LaunchedEffect(selected) { brushScroll.scrollToItem(0) }

    val colors =
        if (recent) engine.recentColors
        else
            engine.palettes.firstOrNull { it.id == engine.activePaletteId }?.colors
                ?: engine.palettes.firstOrNull()?.colors.orEmpty()
    val remaining =
        if (recent) engine.recentBrushIds.mapNotNull { byId[it] }
        else catalog.filter { it.id in favoriteBrushIds }
    val brushes = listOfNotNull(byId[selected]) + remaining.filter { it.id != selected }

    CompactBarSurface {
        Row(
            Modifier.weight(1f).fillMaxHeight(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            IconButton(onClick = onColor, modifier = Modifier.size(36.dp)) {
                Box(
                    Modifier.size(20.dp)
                        .clip(CircleShape)
                        .background(Color(engine.currentColor))
                        .semantics { contentDescription = "Abrir ou fechar estúdio de cores" }
                )
            }
            if (colors.isEmpty())
                Text(
                    if (recent) "Cores recentes" else "Cores favoritas",
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
                            Modifier.size(26.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(color))
                                .clickable { engine.currentColor = color; onChanged() }
                                .semantics {
                                    contentDescription = "Usar cor #%06X".format(color and 0xFFFFFF)
                                }
                        )
                    }
                }
        }
        IconButton(onClick = onToggleRecent, modifier = Modifier.size(36.dp)) {
            Icon(
                if (recent) Icons.Default.History else Icons.Default.Star,
                if (recent) "Mostrar favoritos" else "Mostrar histórico",
                Modifier.size(18.dp),
            )
        }
        Row(
            Modifier.weight(1f).fillMaxHeight(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End,
        ) {
            if (brushes.isEmpty())
                Text(
                    if (recent) "Pincéis recentes" else "Pincéis favoritos",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            else
                LazyRow(
                    Modifier.widthIn(max = 600.dp),
                    state = brushScroll,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(end = 4.dp),
                ) {
                    items(brushes.asReversed(), key = { it.id }) { brush ->
                        Row(
                            Modifier.height(28.dp)
                                .widthIn(max = 116.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(
                                    if (brush.id == selected)
                                        MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
                                )
                                .clickable {
                                    if (brush.id == selected) onOpenCurrentBrush()
                                    else if (brush.id.startsWith("preset:"))
                                        engine.presetCatalog
                                            .firstOrNull { "preset:${it.id}" == brush.id }
                                            ?.let { engine.selectPreset(it) }
                                    else
                                        engine.brushCatalog
                                            .firstOrNull { "brush:${brush.id}" == brush.id }
                                            ?.let { engine.selectBrush(it) }
                                    onChanged()
                                }
                                .semantics {
                                    contentDescription = if (brush.id == selected) "Pincel atual ${brush.name}; abrir parâmetros"
                                    else "Usar pincel ${brush.name}"
                                }
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
            IconButton(onClick = onPresets, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Default.CollectionsBookmark,
                    "Abrir ou fechar presets de pincel",
                    Modifier.size(20.dp),
                )
            }
        }
    }
}
