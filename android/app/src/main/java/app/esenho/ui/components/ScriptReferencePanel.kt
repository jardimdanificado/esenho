package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.esenho.R

@Composable
fun ScriptReferencePanel(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val sections = remember(context) {
        context.resources.openRawResource(R.raw.esenho_script_reference).bufferedReader().use {
            parseScriptReference(it.readText())
        }
    }
    var query by remember { mutableStateOf("") }
    var selectedSection by remember { mutableStateOf<Int?>(null) }
    var menuExpanded by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val visibleSections = sections.withIndex().filter { (index, section) ->
        (selectedSection == null || selectedSection == index) &&
            (query.isBlank() || section.searchText.contains(query.trim(), ignoreCase = true))
    }
    LaunchedEffect(query, selectedSection) { listState.scrollToItem(0) }
    Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it; selectedSection = null },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Buscar comando ou assunto") },
            shape = RoundedCornerShape(6.dp),
            trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Default.Close, "Limpar busca") } }
        )
        Box {
            OutlinedButton(
                onClick = { menuExpanded = true },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(6.dp),
                contentPadding = PaddingValues(horizontal = 10.dp)
            ) {
                Text(selectedSection?.let { sections[it].title } ?: "Todos os assuntos", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icons.Default.ArrowDropDown, "Escolher assunto")
            }
            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                DropdownMenuItem(text = { Text("Todos os assuntos") }, onClick = { selectedSection = null; query = ""; menuExpanded = false })
                sections.forEachIndexed { index, section ->
                    DropdownMenuItem(text = { Text(section.title) }, onClick = { selectedSection = index; query = ""; menuExpanded = false })
                }
            }
        }
        if (visibleSections.isEmpty()) {
            Text("Nenhum assunto encontrado. Busque, por exemplo, brush, pivot ou seleção.", style = MaterialTheme.typography.bodyMedium)
        } else {
            if (query.isNotBlank()) Text("${visibleSections.size} assuntos encontrados", style = MaterialTheme.typography.labelSmall)
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 20.dp)
            ) {
                visibleSections.forEach { (sectionIndex, section) ->
                    item(key = "heading-$sectionIndex") {
                        Column {
                            HorizontalDivider(Modifier.padding(bottom = 12.dp))
                            ReferenceText(section.title, heading = true)
                        }
                    }
                    itemsIndexed(section.blocks, key = { index, _ -> "$sectionIndex-$index" }) { _, block ->
                        when (block) {
                            is ScriptReferenceBlock.Paragraph -> ReferenceText(block.text)
                            is ScriptReferenceBlock.Code -> ReferenceCode(block)
                            is ScriptReferenceBlock.Bullet -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(block.marker, color = MaterialTheme.colorScheme.primary)
                                Box(Modifier.weight(1f)) { ReferenceText(block.text) }
                            }
                            is ScriptReferenceBlock.Table -> ReferenceTable(block)
                        }
                    }
                }
            }
        }
    }
}

/** Inline code and emphasis are styled, never shown as raw Markdown markers. */
@Composable
private fun referenceInline(text: String): AnnotatedString {
    val codeColor = MaterialTheme.colorScheme.primary
    val codeBackground = MaterialTheme.colorScheme.surfaceVariant
    val tokens = remember { Regex("`([^`]+)`|\\*\\*(.+?)\\*\\*|\\[([^]]+)]\\(([^)]+)\\)") }
    return buildAnnotatedString {
        var position = 0
        tokens.findAll(text).forEach { match ->
            append(text.substring(position, match.range.first))
            when {
                match.groupValues[1].isNotEmpty() -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = codeColor, background = codeBackground)) { append(match.groupValues[1]) }
                match.groupValues[2].isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(match.groupValues[2]) }
                else -> withStyle(SpanStyle(color = codeColor)) { append(match.groupValues[3]) }
            }
            position = match.range.last + 1
        }
        append(text.substring(position))
    }
}

@Composable
private fun ReferenceText(text: String, heading: Boolean = false) {
    val content = referenceInline(text)
    SelectionContainer {
        Text(content, modifier = Modifier.fillMaxWidth(), style = if (heading) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ReferenceCode(block: ScriptReferenceBlock.Code) {
    val clipboard = LocalClipboardManager.current
    val highlight = remember { JavaScriptHighlight() }
    var copied by remember(block.text) { mutableStateOf(false) }
    Surface(shape = RoundedCornerShape(6.dp), color = Color(0xff1d2021), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(block.language.ifBlank { "Código" }, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = Color(0xffbdae93))
                TextButton(onClick = { clipboard.setText(AnnotatedString(block.text)); copied = true }) {
                    Text(if (copied) "Copiado" else "Copiar", color = Color(0xff83a598))
                }
            }
            SelectionContainer {
                Text(
                    if (block.language in listOf("js", "javascript", "")) highlight.filter(AnnotatedString(block.text)).text else AnnotatedString(block.text),
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = Color(0xffebdbb2), softWrap = false
                )
            }
        }
    }
}

/** Stack table cells as labeled records so API tables fit narrow docks. */
@Composable
private fun ReferenceTable(table: ScriptReferenceBlock.Table) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        table.rows.forEach { row ->
            Surface(shape = RoundedCornerShape(6.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEachIndexed { index, value ->
                        Text(table.headers.getOrNull(index) ?: "Detalhes", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        ReferenceText(value)
                    }
                }
            }
        }
    }
}
