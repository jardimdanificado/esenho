package app.esenho.nativeengine

/**
 * Screen-space sizes for node and transform handles.
 *
 * Canvas coordinates are device pixels, so fixed pixel constants shrink on
 * high-density Android screens. Every size here is expressed in dp and
 * converted with the device density before being divided by the view scale.
 * The host view sets [density]; desktop keeps the default of 1.
 */
object HandleMetrics {
    var density: Float = 1f

    /** Convert a dp length to document units at the current view scale. */
    fun dp(value: Float, scale: Float): Float =
        value * density / scale.coerceAtLeast(.01f)

    const val NODE_HIT_DP = 18f
    const val NODE_DOT_DP = 6f
    const val HANDLE_DOT_DP = 5f
    const val SHAPE_DOT_DP = 5f
    const val PEN_CLOSE_HIT_DP = 18f

    const val SELECT_HIT_DP = 16f
    const val SELECT_DOT_DP = 6f
    const val SELECT_ROT_OFFSET_DP = 28f

    const val TRANSFORM_HIT_DP = 18f
    const val TRANSFORM_DOT_DP = 8f
    const val TRANSFORM_ROT_OFFSET_DP = 36f
    const val GUIDE_HIT_DP = 8f
}
