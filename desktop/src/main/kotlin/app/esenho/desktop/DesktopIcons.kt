package app.esenho.desktop

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

object DesktopIcons {
    val Eraser =
        ImageVector.Builder("Eraser", 24.dp, 24.dp, 24f, 24f)
            .apply {
                addPath(
                    pathData =
                        addPathNodes(
                            "M15.14,3c-0.51,0 -1.02,0.2 -1.41,0.59L2.59,14.73c-0.78,0.78 -0.78,2.05 0,2.83L5.03,20c0.39,0.39 0.9,0.59 1.41,0.59h12.55c0.55,0 1,-0.45 1,-1s-0.45,-1 -1,-1h-9.72l9.83,-9.83c0.78,-0.78 0.78,-2.05 0,-2.83l-3.55,-3.55c-0.39,-0.39 -0.9,-0.59 -1.41,-0.59zM15.14,5.83l3.55,3.55 -6.07,6.07 -3.55,-3.55 6.07,-6.07z"
                        ),
                    fill = SolidColor(Color.White),
                )
            }
            .build()
}
