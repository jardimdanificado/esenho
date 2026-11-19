package app.esenho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.mesh3d.Vec3

@Composable
fun MeshObjectPanel(
    engine: app.esenho.nativeengine.EsenhoEngine,
    revision: Int,
    onChanged: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    onDismiss: () -> Unit,
) {
    val mesh = engine.meshes
    val selected = mesh.selected
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        EditorPanelHeader("Modelos 3D", onDismiss)
        Text("${mesh.scene.objects.size} objeto(s) · ${mesh.scene.objects.sumOf { it.triangleCount() }} triângulos")
        Row {
            Button(onClick = { mesh.addCube(); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Cubo")
            }
            Spacer(Modifier.width(6.dp))
            Button(onClick = { mesh.addPlane(); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Plano")
            }
        }
        Row {
            Button(onClick = onImport, modifier = Modifier.weight(1f)) { Text("Importar OBJ") }
            Spacer(Modifier.width(6.dp))
            Button(onClick = onExport, modifier = Modifier.weight(1f)) { Text("Exportar OBJ") }
        }
        HorizontalDivider()
        Text("Câmera", style = MaterialTheme.typography.titleSmall)
        Text("Campo de visão: ${mesh.scene.camera.fov.toInt()}°")
        Slider(
            value = mesh.scene.camera.fov.coerceIn(5f, 150f),
            valueRange = 5f..150f,
            onValueChange = {
                mesh.scene.camera.fov = it
                mesh.render()
                onChanged()
            },
        )
        Row {
            Button(onClick = { mesh.zoom(.8f); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Aproximar")
            }
            Spacer(Modifier.width(6.dp))
            Button(onClick = { mesh.zoom(1.25f); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Afastar")
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = mesh.scene.wireframe,
                onCheckedChange = { mesh.setRenderSettings(wireframe = it); onChanged() },
            )
            Text("Arame")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = mesh.scene.cullBackfaces,
                onCheckedChange = { mesh.setRenderSettings(cull = it); onChanged() },
            )
            Text("Ocultar faces traseiras")
        }
        HorizontalDivider()
        Text("Objetos", style = MaterialTheme.typography.titleSmall)
        mesh.scene.objects.forEach { obj ->
            Surface(
                onClick = { mesh.selectedId = obj.id; onChanged() },
                color =
                    if (obj.id == mesh.selectedId)
                        MaterialTheme.colorScheme.secondaryContainer
                    else MaterialTheme.colorScheme.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(obj.name.ifBlank { "Modelo" }, modifier = Modifier.weight(1f))
                    Text("${obj.triangleCount()} tri")
                }
            }
        }
        if (selected != null) {
            Text("Transformação", style = MaterialTheme.typography.titleSmall)
            var x by remember(selected.id) { mutableStateOf(fmt(selected.transform.position.x)) }
            var y by remember(selected.id) { mutableStateOf(fmt(selected.transform.position.y)) }
            var z by remember(selected.id) { mutableStateOf(fmt(selected.transform.position.z)) }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MeshNumber("X", x, { x = it }, Modifier.weight(1f))
                MeshNumber("Y", y, { y = it }, Modifier.weight(1f))
                MeshNumber("Z", z, { z = it }, Modifier.weight(1f))
            }
            val values = listOf(x, y, z).map { it.replace(',', '.').toFloatOrNull() }
            TextButton(
                enabled = values.all { it != null },
                onClick = {
                    mesh.setTransform(position = Vec3(values[0]!!, values[1]!!, values[2]!!))
                    onChanged()
                },
            ) {
                Text("Aplicar posição")
            }
            TextButton(onClick = { mesh.removeSelected(); onChanged() }) {
                Text("Excluir objeto")
            }
        }
    }
}

@Composable
private fun MeshNumber(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = modifier,
    )
}

private fun fmt(value: Float) = String.format(java.util.Locale.ROOT, "%.2f", value)
