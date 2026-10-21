package app.esenho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import kotlin.math.atan2

@Composable
fun ScriptPivotsPanel(pivots:List<JSONObject>,onPick:(String)->Unit,onUpdate:(String,JSONObject)->Unit,onMove:(String)->Unit,onRemove:(String)->Unit) {
    var editing by remember { mutableStateOf<JSONObject?>(null) }
    Column(Modifier.fillMaxSize()) {
        Row { TextButton(onClick={onPick("document")}){Text("Novo na arte")};TextButton(onClick={onPick("screen")}){Text("Novo na tela")} }
        if(pivots.isEmpty())Text("Marque um pivot por touch ou use esenho.pickPivot().",style=MaterialTheme.typography.bodySmall)
        LazyColumn(Modifier.weight(1f)) {
            items(pivots,key={it.getString("name")}) { pivot ->
                val name=pivot.getString("name")
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(name,style=MaterialTheme.typography.bodyMedium);Text(if(pivot.getString("kind")=="screen")"Fixo na tela" else "Fixo no documento",style=MaterialTheme.typography.labelSmall) }
                    IconButton(onClick={editing=pivot}){Icon(Icons.Default.Edit,"Renomear e editar $name",Modifier.size(18.dp))}
                    IconButton(onClick={onMove(name)}){Icon(Icons.Default.OpenWith,"Reposicionar $name por touch",Modifier.size(18.dp))}
                    IconButton(onClick={onRemove(name)}){Icon(Icons.Default.Delete,"Apagar $name",Modifier.size(18.dp))}
                }
            }
        }
    }
    editing?.let { pivot ->
        val old=pivot.getString("name");val m=pivot.getJSONArray("matrix")
        var name by remember(old){mutableStateOf(old)}
        var x by remember(old){mutableStateOf(m.getDouble(4).toString())}
        var y by remember(old){mutableStateOf(m.getDouble(5).toString())}
        var angle by remember(old){mutableStateOf(Math.toDegrees(atan2(m.getDouble(1),m.getDouble(0))).toString())}
        var error by remember { mutableStateOf<String?>(null) }
        AlertDialog(onDismissRequest={editing=null},title={Text("Editar pivot")},text={Column {
            OutlinedTextField(name,{name=it},label={Text("Nome")},singleLine=true)
            OutlinedTextField(x,{x=it},label={Text("X")},singleLine=true)
            OutlinedTextField(y,{y=it},label={Text("Y")},singleLine=true)
            OutlinedTextField(angle,{angle=it},label={Text("Rotação em graus")},singleLine=true)
            error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
        }},confirmButton={TextButton(onClick={runCatching {
            val px=x.toDouble();val py=y.toDouble();val rotation=angle.toDouble();require(px.isFinite()&&py.isFinite()&&rotation.isFinite())
            onUpdate(old,JSONObject().put("newName",name.trim()).put("x",px).put("y",py).put("rotation",rotation))
        }.onSuccess{editing=null}.onFailure{error=it.message ?: "Valores inválidos"}}){Text("Salvar")}},dismissButton={TextButton(onClick={editing=null}){Text("Cancelar")}})
    }
}
