package app.esenho.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.Icon
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.BrushParameterScope
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.EsenhoStorageManager.SideSliderSetting

internal data class BrushTrackingContext(
    val engine: EsenhoEngine,
    val settings: List<SideSliderSetting>,
    val onBrushUpdated: () -> Unit = {},
    val onChanged: (List<SideSliderSetting>) -> Unit,
)
internal val LocalBrushTracking = staticCompositionLocalOf<BrushTrackingContext?> { null }

@Composable
internal fun TrackParameterButton(parameterId: Int?) {
    val context = LocalBrushTracking.current ?: return
    val id = parameterId ?: return
    val config = availableSliderParameters(context.engine).firstOrNull { it.paramId == id } ?: return
    val owner = BrushParameterScope.owner(context.engine.selectedBrush?.id, id)
    val name = if (id >= PROCEDURAL_PARAM_BASE) config.name else ""
    val tracked = relevantQuickSliders(context.engine, context.settings).any { it.paramId == id }
    IconToggleButton(
        checked = tracked,
        onCheckedChange = { checked ->
            val remaining = context.settings.filterNot {
                it.paramId == id && it.ownerBrushId == owner && it.parameterName == name
            }
            context.onChanged(if (checked) remaining + SideSliderSetting(id, ownerBrushId = owner, parameterName = name) else remaining)
        },
        modifier = Modifier.size(32.dp),
    ) {
        Icon(
            if (tracked) Icons.Filled.PushPin else Icons.Outlined.PushPin,
            if (tracked) "Deixar de acompanhar ${config.name}" else "Acompanhar ${config.name} nos parâmetros rápidos",
            Modifier.size(18.dp),
            tint = if (tracked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    BrushCurveLinkButton(context.engine, config, context.onBrushUpdated)
}
