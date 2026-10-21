package app.esenho.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation

/** Lexical coloring preserves the original text and UTF-16 cursor offsets. */
class JavaScriptHighlight : VisualTransformation {
    private val tokens=Regex("""//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|if|else|for|while|function|return|throw|new|try|catch|finally|class|extends|of|in|typeof|switch|case|break|continue|async|await)\b|\b(?:true|false|null|undefined)\b|\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b|[\p{L}_$][\p{L}\p{N}_$]*(?=\s*\()|\besenho\b""")
    override fun filter(text: AnnotatedString): TransformedText {
        if(text.length>200_000)return TransformedText(text,OffsetMapping.Identity)
        val result=AnnotatedString.Builder(text)
        tokens.findAll(text.text).forEach { token ->
            val v=token.value
            val color=when {
                v.startsWith("//") || v.startsWith("/*") -> Color(0xff928374)
                v.startsWith("\"") || v.startsWith("'") || v.startsWith("`") -> Color(0xffb8bb26)
                v.first().isDigit() || v in listOf("true","false","null","undefined") -> Color(0xffd3869b)
                v=="esenho" -> Color(0xff83a598)
                v in setOf("const","let","var","if","else","for","while","function","return","throw","new","try","catch","finally","class","extends","of","in","typeof","switch","case","break","continue","async","await") -> Color(0xfffb4934)
                else -> Color(0xfffabd2f)
            }
            result.addStyle(SpanStyle(color=color),token.range.first,token.range.last+1)
        }
        return TransformedText(result.toAnnotatedString(),OffsetMapping.Identity)
    }
}
