package app.esenho.ui.components

import app.esenho.nativeengine.*
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

internal data class LayerTreeRow(val key: String, val layer: LayerModel? = null, val group: RasterLayerGroup? = null, val depth: Int = 0)

internal fun layerTree(engine: EsenhoEngine, layers: List<LayerModel>): List<LayerTreeRow> = buildList {
    val seen = mutableSetOf<String>()
    fun emitGroup(id: String, depth: Int) {
        if (!seen.add(id)) return
        val g = engine.rasterLayerGroups[id] ?: return
        add(LayerTreeRow("group:$id", group=g, depth=depth))
        if (!g.collapsed) {
            g.childGroupIds.reversed().forEach { emitGroup(it,depth+1) }
            layers.filter { it.id in g.layerIds }.forEach { add(LayerTreeRow("layer:${it.id}",layer=it,depth=depth+1)) }
        }
    }
    layers.forEach { layer ->
        var g = engine.rasterLayerGroups.values.firstOrNull { layer.id in it.layerIds }
        if (g == null) add(LayerTreeRow("layer:${layer.id}",layer=layer))
        else {
            val parents = mutableSetOf<String>()
            while(g?.parentId != null && parents.add(g!!.id)) g = engine.rasterLayerGroups[g!!.parentId] ?: break
            g?.let { emitGroup(it.id,0) }
        }
    }
    engine.rasterGroupOrder.reversed().forEach { emitGroup(it,0) }
    engine.rasterLayerGroups.values.filter { it.parentId == null }.forEach { emitGroup(it.id,0) }
}

@Composable
internal fun LayerGroupRow(engine: EsenhoEngine, group: RasterLayerGroup, depth: Int, refresh: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    var rename by remember { mutableStateOf(false) }
    var name by remember(group.name) { mutableStateOf(group.name) }
    var move by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(start=(depth*12).dp).height(40.dp), verticalAlignment=Alignment.CenterVertically) {
        IconButton(onClick={group.collapsed=!group.collapsed;refresh()},modifier=Modifier.size(32.dp)) {
            Icon(if(group.collapsed) Icons.Default.ChevronRight else Icons.Default.ExpandMore,"Expandir/recolher ${group.name}")
        }
        Icon(Icons.Default.Folder,null,Modifier.size(18.dp))
        Text(group.name,Modifier.weight(1f).padding(start=6.dp),style=MaterialTheme.typography.labelMedium,maxLines=1)
        IconButton(onClick={engine.editRasterGroups { engine.toggleRasterLayerGroupVisibility(group.id) };refresh()},modifier=Modifier.size(32.dp)) {
            Icon(if(group.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,"Visibilidade de ${group.name}",Modifier.size(18.dp))
        }
        Box {
            IconButton(onClick={menu=true},modifier=Modifier.size(32.dp)) { Icon(Icons.Default.MoreVert,"Ações do grupo",Modifier.size(18.dp)) }
            DropdownMenu(menu,{menu=false}) {
                DropdownMenuItem(text={Text("Renomear grupo")},onClick={menu=false;rename=true})
                DropdownMenuItem(text={Text("Mover grupo para…")},onClick={menu=false;move=true})
                DropdownMenuItem(text={Text("Subir grupo")},onClick={menu=false;engine.editRasterGroups { engine.moveRasterLayerGroup(group.id,1) };refresh()})
                DropdownMenuItem(text={Text("Descer grupo")},onClick={menu=false;engine.editRasterGroups { engine.moveRasterLayerGroup(group.id,-1) };refresh()})
                DropdownMenuItem(text={Text("Criar subgrupo")},onClick={menu=false;engine.editRasterGroups { val child=engine.createRasterLayerGroup();engine.nestRasterLayerGroup(child.id,group.id);group.collapsed=false };refresh()})
                DropdownMenuItem(text={Text("Desagrupar (manter camadas)")},onClick={menu=false;engine.editRasterGroups { engine.deleteRasterLayerGroup(group.id) };refresh()})
            }
        }
    }
    if(rename) AlertDialog(onDismissRequest={rename=false},title={Text("Renomear grupo")},text={OutlinedTextField(name,{name=it},singleLine=true)},confirmButton={TextButton(enabled=name.isNotBlank(),onClick={engine.editRasterGroups { engine.renameRasterLayerGroup(group.id,name) };rename=false;refresh()}){Text("Salvar")}},dismissButton={TextButton(onClick={rename=false}){Text("Cancelar")}})
    if(move) LayerGroupPicker(engine,"Mover grupo",group.id,{move=false}) { id -> engine.editRasterGroups { engine.nestRasterLayerGroup(group.id,id) };refresh() }
}

@Composable
internal fun LayerGroupPicker(engine: EsenhoEngine,title: String,excludeGroup: String?=null,onDismiss: () -> Unit,onSelect: (String?) -> Unit) {
    fun allowed(id: String): Boolean {
        val visited=mutableSetOf<String>(); var next: String?=id
        while(next!=null && visited.add(next)) { if(next==excludeGroup)return false;next=engine.rasterLayerGroups[next]?.parentId }
        return true
    }
    AlertDialog(onDismissRequest=onDismiss,title={Text(title)},text={
        androidx.compose.foundation.lazy.LazyColumn(Modifier.heightIn(max=360.dp)) {
            item { TextButton(onClick={onSelect(null);onDismiss()}) { Text("Sem grupo / raiz") } }
            items(engine.rasterLayerGroups.values.filter { allowed(it.id) }.size) { i ->
                val g=engine.rasterLayerGroups.values.filter { allowed(it.id) }[i]
                TextButton(onClick={onSelect(g.id);onDismiss()}) { Text(g.name) }
            }
        }
    },confirmButton={TextButton(onClick=onDismiss){Text("Fechar")}})
}
