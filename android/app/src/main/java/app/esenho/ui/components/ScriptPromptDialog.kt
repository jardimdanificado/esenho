package app.esenho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.esenho.scripting.ScriptUiRequest
import org.json.JSONObject

@Composable
fun ScriptPromptDialog(request: ScriptUiRequest, finish: (Any?) -> Unit) {
    val fields = request.options.optJSONArray("fields") ?: org.json.JSONArray()
    val values = remember(request) { mutableStateMapOf<String,String>().apply {
        repeat(fields.length()) { val f=fields.getJSONObject(it);put(f.getString("name"),f.opt("value")?.toString() ?: "") }
    } }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(onDismissRequest={finish(null)}, title={Text(request.options.optString("title","Parâmetros do script"))},
        text={Column(Modifier.heightIn(max=420.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            repeat(fields.length()) { index ->
                val f=fields.getJSONObject(index); val name=f.getString("name")
                if (f.optString("type")=="boolean") {
                    Row { Checkbox(values[name]=="true",{values[name]=it.toString()});Text(f.optString("label",name)) }
                } else OutlinedTextField(values[name].orEmpty(),{values[name]=it},label={Text(f.optString("label",name))},singleLine=true)
            }
            error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
        }},
        confirmButton={TextButton(onClick={
            runCatching {
                val result=JSONObject()
                repeat(fields.length()) { index ->
                    val f=fields.getJSONObject(index);val name=f.getString("name");val value=values[name].orEmpty()
                    val parsed:Any=when(f.optString("type","text")) {
                        "number" -> value.toDouble().also { require(it.isFinite() && (!f.has("min") || it>=f.getDouble("min")) && (!f.has("max") || it<=f.getDouble("max"))) { "Valor fora dos limites: $name" } }
                        "boolean" -> (value=="true")
                        else -> value
                    }
                    result.put(name,parsed)
                }
                result
            }.onSuccess { finish(it) }.onFailure { error=it.message ?: "Parâmetro inválido" }
        }){Text("Executar")}},dismissButton={TextButton(onClick={finish(null)}){Text("Cancelar")}})
}
