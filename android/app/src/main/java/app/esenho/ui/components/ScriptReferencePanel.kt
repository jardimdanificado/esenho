package app.esenho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import app.esenho.R

@Composable
fun ScriptReferencePanel(modifier: Modifier = Modifier) {
    val context=LocalContext.current
    val sections=remember {
        val lines=context.resources.openRawResource(R.raw.esenho_script_reference).bufferedReader().use { it.readLines() }
        buildList {
            val block=mutableListOf<String>();var fenced=false
            for(line in lines) {
                if(line.startsWith("```"))fenced=!fenced
                if(line.isBlank() && !fenced) { if(block.isNotEmpty()){add(block.joinToString("\n"));block.clear()} }
                else block.add(line)
            }
            if(block.isNotEmpty())add(block.joinToString("\n"))
        }
    }
    val highlight=remember { JavaScriptHighlight() }
    var query by remember { mutableStateOf("") }
    Column(modifier.fillMaxSize(),verticalArrangement=Arrangement.spacedBy(4.dp)) {
        OutlinedTextField(query,{query=it},Modifier.fillMaxWidth(),singleLine=true,label={Text("Buscar na documentação")})
        LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(10.dp),contentPadding=PaddingValues(bottom=12.dp)) {
            items(sections.filter { query.isBlank() || it.contains(query,true) }) { section ->
                val code=section.startsWith("```")
                val table=section.startsWith("|")
                val text=if(code)section.lines().drop(1).dropLast(1).joinToString("\n") else section.trim().trimStart('#').trimStart()
                val annotated=if(code)highlight.filter(AnnotatedString(text)).text else AnnotatedString(text)
                SelectionContainer {
                    Text(annotated,
                        modifier=if(code || table)Modifier.horizontalScroll(rememberScrollState()) else Modifier,
                        style=when { code || table -> MaterialTheme.typography.bodySmall.copy(fontFamily=FontFamily.Monospace);section.startsWith("#")->MaterialTheme.typography.titleSmall;else->MaterialTheme.typography.bodySmall })
                }
            }
        }
    }
}
