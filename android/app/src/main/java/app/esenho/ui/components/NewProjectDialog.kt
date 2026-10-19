package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog

data class CanvasPreset(val name: String, val width: Int, val height: Int)

@Composable
fun NewProjectDialog(
    currentW: Int,
    currentH: Int,
    onConfirm: (width: Int, height: Int, bgColor: Int) -> Unit,
    onDismiss: () -> Unit
) {
    val presets = remember {
        listOf(
            CanvasPreset("Vertical FHD", 1080, 1920),
            CanvasPreset("Horizontal FHD", 1920, 1080),
            CanvasPreset("Quadrado 2K", 2048, 2048),
            CanvasPreset("Quadrado 1K", 1080, 1080),
            CanvasPreset("Pixel 128", 128, 128),
            CanvasPreset("Pixel 64", 64, 64),
            CanvasPreset("A4", 2480, 3508)
        )
    }

    var selectedWidth by remember { mutableStateOf(currentW.toString()) }
    var selectedHeight by remember { mutableStateOf(currentH.toString()) }
    var selectedBg by remember { mutableIntStateOf(0xFFFFFFFF.toInt()) } // White

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            modifier = Modifier.width(340.dp)
        ) {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Novo Projeto", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(14.dp))

                // Presets row
                Text("Predefinições", style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.Start))
                Spacer(modifier = Modifier.height(6.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(presets) { p ->
                        FilterChip(
                            selected = (selectedWidth == p.width.toString() && selectedHeight == p.height.toString()),
                            onClick = {
                                selectedWidth = p.width.toString()
                                selectedHeight = p.height.toString()
                            },
                            label = { Text(p.name, fontSize = 10.sp) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Custom dimensions
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = selectedWidth,
                        onValueChange = { selectedWidth = it.filter { ch -> ch.isDigit() } },
                        label = { Text("Largura (px)", fontSize = 11.sp) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = selectedHeight,
                        onValueChange = { selectedHeight = it.filter { ch -> ch.isDigit() } },
                        label = { Text("Altura (px)", fontSize = 11.sp) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Background Color
                Text("Cor de Fundo", style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.Start))
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    val bgChoices = listOf(
                        "Branco" to 0xFFFFFFFF.toInt(),
                        "Escuro" to 0xFF181A1B.toInt(),
                        "Transparente" to 0x00000000
                    )
                    bgChoices.forEach { (name, col) ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { selectedBg = col }
                                .padding(4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(20.dp)
                                    .clip(CircleShape)
                                    .background(if (col == 0) Color.Transparent else Color(col))
                                    .border(
                                        2.dp,
                                        if (selectedBg == col) MaterialTheme.colorScheme.primary else Color.Gray,
                                        CircleShape
                                    )
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(name, fontSize = 11.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Actions
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancelar")
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val w = selectedWidth.toIntOrNull()?.coerceIn(32, 8192) ?: 1080
                            val h = selectedHeight.toIntOrNull()?.coerceIn(32, 8192) ?: 1920
                            onConfirm(w, h, selectedBg)
                        }
                    ) {
                        Text("Criar Tela")
                    }
                }
            }
        }
    }
}
