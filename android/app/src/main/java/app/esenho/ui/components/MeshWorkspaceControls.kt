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
            Button(onClick = { mesh.addCylinder(); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Cilindro")
            }
            Spacer(Modifier.width(6.dp))
            Button(onClick = { mesh.addSphere(); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Esfera")
            }
        }
        Row {
            Button(onClick = onImport, modifier = Modifier.weight(1f)) { Text("Importar OBJ") }
            Spacer(Modifier.width(6.dp))
            Button(onClick = onExport, modifier = Modifier.weight(1f)) { Text("Exportar OBJ") }
        }
        HorizontalDivider()
        Text("Ferramentas", style = MaterialTheme.typography.titleSmall)
        val tools =
            listOf(
                app.esenho.nativeengine.mesh3d.MeshTool.SELECT to "Sel",
                app.esenho.nativeengine.mesh3d.MeshTool.ORBIT to "Girar",
                app.esenho.nativeengine.mesh3d.MeshTool.PAN to "Mover tela",
                app.esenho.nativeengine.mesh3d.MeshTool.MOVE to "Mover",
                app.esenho.nativeengine.mesh3d.MeshTool.ROTATE to "Rot",
                app.esenho.nativeengine.mesh3d.MeshTool.SCALE to "Esc",
                app.esenho.nativeengine.mesh3d.MeshTool.VERTEX to "Vértice",
                app.esenho.nativeengine.mesh3d.MeshTool.FACE to "Face",
            )
        tools.chunked(4).forEach { row ->
            Row {
                row.forEach { (value, label) ->
                    FilterChip(
                        selected = mesh.tool == value,
                        onClick = {
                            mesh.tool = value
                            if (value != app.esenho.nativeengine.mesh3d.MeshTool.VERTEX) mesh.selectedVertex = -1
                            onChanged()
                        },
                        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.padding(end = 4.dp).weight(1f),
                    )
                }
            }
        }
        Text(
            "Clique seleciona. Arraste o eixo colorido ou o quadrado central do gizmo.",
            style = MaterialTheme.typography.bodySmall,
        )
        if (selected != null && mesh.scene.objects.size > 1) {
            Text("Booleanas de malha", style = MaterialTheme.typography.titleSmall)
            val others = mesh.scene.objects.filter { it.id != selected.id }
            var target by remember(selected.id) { mutableStateOf(others.firstOrNull()?.id ?: "") }
            TextButton(onClick = { target = others.firstOrNull { it.id != target }?.id ?: target }) {
                Text("Outro objeto: ${others.firstOrNull { it.id == target }?.name ?: "nenhum"}")
            }
            Row {
                app.esenho.nativeengine.mesh3d.MeshBooleanOp.values().forEach { op ->
                    TextButton(
                        enabled = target.isNotBlank(),
                        onClick = { mesh.boolean(op, target); onChanged() },
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(2.dp),
                    ) {
                        Text(op.name.take(3), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        HorizontalDivider()
        Text("Animação", style = MaterialTheme.typography.titleSmall)
        var playing by remember { mutableStateOf(false) }
        LaunchedEffect(playing) {
            while (playing) {
                kotlinx.coroutines.delay(1000L / 24)
                mesh.seekFrame(mesh.animation.currentFrame + 1)
            }
        }
        Row {
            TextButton(onClick = { playing = !playing }, modifier = Modifier.weight(1f)) {
                Text(if (playing) "Pausar" else "Reproduzir")
            }
            TextButton(onClick = { mesh.seekFrame(mesh.animation.currentFrame - 1) }) { Text("◀") }
            TextButton(onClick = { mesh.seekFrame(mesh.animation.currentFrame + 1) }) { Text("▶") }
        }
        Text("Quadro ${mesh.animation.currentFrame + 1} / ${mesh.animation.duration}")
        Slider(
            value = mesh.animation.currentFrame.toFloat(),
            valueRange = 0f..mesh.animation.duration.toFloat().coerceAtLeast(1f),
            onValueChange = { mesh.seekFrame(it.toInt()) },
        )
        Row {
            TextButton(onClick = { mesh.keyframeObject(mesh.animation.currentFrame); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Keyframe objeto")
            }
            TextButton(onClick = { mesh.keyframeCamera(mesh.animation.currentFrame); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Câmera")
            }
            TextButton(onClick = { mesh.keyframeLight(mesh.animation.currentFrame); onChanged() }, modifier = Modifier.weight(1f)) {
                Text("Luz")
            }
        }
        HorizontalDivider()
        if (mesh.tool == app.esenho.nativeengine.mesh3d.MeshTool.FACE && mesh.selectedFace >= 0) {
            Row {
                Button(onClick = { mesh.extrudeFace(mesh.selectedFace); onChanged() }, modifier = Modifier.weight(1f)) {
                    Text("Extrudar")
                }
                Spacer(Modifier.width(6.dp))
                Button(onClick = { mesh.deleteFace(mesh.selectedFace); onChanged() }, modifier = Modifier.weight(1f)) {
                    Text("Excluir face")
                }
            }
        }
        if (selected != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = selected.smooth,
                    onCheckedChange = { mesh.setSmooth(it); onChanged() },
                )
                Text("Normais suaves", style = MaterialTheme.typography.bodySmall)
            }
            Button(onClick = { mesh.setMaterial(color = engine.currentColor); onChanged() }) {
                Text("Aplicar cor atual ao material")
            }
            var opacity by remember(selected.id) { mutableStateOf(fmt(selected.materials.firstOrNull()?.opacity ?: 1f)) }
            MeshNumber("Opacidade", opacity, { opacity = it }, Modifier.fillMaxWidth())
            TextButton(onClick = {
                mesh.setMaterial(opacity = opacity.replace(',', '.').toFloatOrNull())
                onChanged()
            }) {
                Text("Aplicar opacidade")
            }
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
