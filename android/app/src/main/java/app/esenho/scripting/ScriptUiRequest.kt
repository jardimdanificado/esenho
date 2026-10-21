package app.esenho.scripting

import org.json.JSONObject

data class ScriptUiRequest(val options: JSONObject, val complete: (Any?) -> Unit)
