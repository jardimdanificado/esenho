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

/** Four independent strips: favorite/recent colors and favorite/recent brushes. */
@Composable
fun WorkspaceQuickShelf(
    engine: EsenhoEngine,
    favoriteBrushIds: Set<String>,
    revision: Int,
    onChanged: () -> Unit,
    onOpenCurrentBrush: () -> Unit,
    onColor: () -> Unit,
    onPresets: () -> Unit,
    showFavoriteColors: Boolean,
    showRecentColors: Boolean,
    showFavoriteBrushes: Boolean,
    showRecentBrushes: Boolean,
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
    val favoriteBrushScroll = rememberLazyListState()
    val recentBrushScroll = rememberLazyListState()
    LaunchedEffect(selected) {
        favoriteBrushScroll.scrollToItem(0)
        recentBrushScroll.scrollToItem(0)
    }

    fun colorsFor(recent: Boolean): List<Int> =
        if (recent) engine.recentColors
        else
            engine.palettes.firstOrNull { it.id == engine.activePaletteId }?.colors
                ?: engine.palettes.firstOrNull()?.colors.orEmpty()

    fun brushesFor(recent: Boolean): List<ShelfBrush> {
        val remaining =
            if (recent) engine.recentBrushIds.mapNotNull { byId[it] }
            else catalog.filter { it.id in favoriteBrushIds }
        return listOfNotNull(byId[selected]) + remaining.filter { it.id != selected }
    }

    val colorStrip: @Composable (List<Int>, String) -> Unit = { colors, label ->
        Row(Modifier.fillMaxWidth().height(40.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onColor, modifier = Modifier.size(36.dp)) {
                Box(
                    Modifier.size(20.dp)
                        .clip(CircleShape)
                        .background(Color(engine.currentColor))
                        .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                        .semantics { contentDescription = "Abrir ou fechar estúdio de cores" }
                )
            }
            if (colors.isEmpty())
                Text(
                    label,
                    Modifier.weight(1f).padding(horizontal = 6.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            else
                LazyRow(
                    Modifier.weight(1f),
                    state = rememberLazyListState(),
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
    val brushStrip: @Composable (List<ShelfBrush>, String, androidx.compose.foundation.lazy.LazyListState) -> Unit = { brushes, label, scrollState ->
        Row(Modifier.fillMaxWidth().height(40.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onPresets, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Default.CollectionsBookmark,
                    "Abrir ou fechar presets de pincel",
                    Modifier.size(20.dp),
                )
            }
            if (brushes.isEmpty())
                Text(
                    label,
                    Modifier.weight(1f).padding(horizontal = 6.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            else
                LazyRow(
                    Modifier.weight(1f),
                    state = scrollState,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(end = 4.dp),
                ) {
                    items(brushes, key = { it.id }) { brush ->
                        Row(
                            Modifier.height(30.dp)
                                .widthIn(max = 116.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(
                                    if (brush.id == selected)
                                        MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant
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
        }
    }

    Surface(color = MaterialTheme.colorScheme.surface) {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            if (showFavoriteColors) colorStrip(colorsFor(false), "Cores favoritas")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            if (showRecentColors) colorStrip(colorsFor(true), "Cores recentes")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            if (showFavoriteBrushes) brushStrip(brushesFor(false), "Pincéis favoritos", favoriteBrushScroll)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            if (showRecentBrushes) brushStrip(brushesFor(true), "Pincéis recentes", recentBrushScroll)
        }
    }
}
