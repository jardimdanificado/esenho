package app.esenho.ui.components

/** Small Markdown reader for the bundled reference, independent of Compose.
 * Parses whole blocks before searching, preserving code fences and table rows.
 */
internal sealed interface ScriptReferenceBlock {
    data class Paragraph(val text: String) : ScriptReferenceBlock
    data class Code(val text: String, val language: String) : ScriptReferenceBlock
    data class Bullet(val text: String, val marker: String) : ScriptReferenceBlock
    data class Table(val headers: List<String>, val rows: List<List<String>>) : ScriptReferenceBlock
}

internal data class ScriptReferenceSection(
    val title: String,
    val level: Int,
    val blocks: List<ScriptReferenceBlock>,
    val searchText: String,
)

internal fun parseScriptReference(source: String): List<ScriptReferenceSection> {
    val lines = source.lines()
    val sections = mutableListOf<ScriptReferenceSection>()
    val blocks = mutableListOf<ScriptReferenceBlock>()
    var title = "Comece aqui"
    var level = 1
    var index = 0
    val heading = Regex("^(#{1,6})\\s+(.+)$")
    val bullet = Regex("^\\s*(?:([-*+])|([0-9]+)[.)])\\s+(.+)$")
    fun tableCells(line: String) = line.trim().removePrefix("|").removeSuffix("|").split('|').map { it.trim() }
    fun flush() {
        if (blocks.isNotEmpty()) {
            sections += ScriptReferenceSection(title, level, blocks.toList(), buildString {
                append(title)
                blocks.forEach { append('\n'); append(when (it) {
                    is ScriptReferenceBlock.Paragraph -> it.text
                    is ScriptReferenceBlock.Code -> it.text
                    is ScriptReferenceBlock.Bullet -> it.text
                    is ScriptReferenceBlock.Table -> (listOf(it.headers) + it.rows).joinToString("\n") { row -> row.joinToString(" ") }
                }) }
            })
            blocks.clear()
        }
    }
    while (index < lines.size) {
        val line = lines[index].trimEnd()
        val match = heading.matchEntire(line)
        when {
            line.isBlank() -> index++
            match != null -> {
                flush()
                title = match.groupValues[2]
                level = match.groupValues[1].length
                index++
            }
            line.trimStart().startsWith("```") -> {
                val language = line.trim().removePrefix("```").trim()
                index++
                val code = mutableListOf<String>()
                while (index < lines.size && !lines[index].trimStart().startsWith("```")) code += lines[index++]
                if (index < lines.size) index++
                blocks += ScriptReferenceBlock.Code(code.joinToString("\n"), language)
            }
            line.trimStart().startsWith("|") -> {
                val headers = tableCells(line)
                index++
                val rows = mutableListOf<List<String>>()
                while (index < lines.size && lines[index].trimStart().startsWith("|")) {
                    val cells = tableCells(lines[index++])
                    if (!cells.all { it.matches(Regex(":?-{3,}:?")) }) rows += cells
                }
                blocks += ScriptReferenceBlock.Table(headers, rows)
            }
            bullet.matches(line) -> {
                val item = bullet.matchEntire(line)!!
                val text = StringBuilder(item.groupValues[3])
                index++
                while (index < lines.size && lines[index].isNotBlank() && lines[index].startsWith("  ") && !bullet.matches(lines[index]) && !lines[index].trimStart().startsWith("```")) {
                    text.append(' ').append(lines[index++].trim())
                }
                blocks += ScriptReferenceBlock.Bullet(text.toString(), item.groupValues[2].let { if (it.isEmpty()) "•" else "$it." })
            }
            else -> {
                val text = mutableListOf(line.trim())
                index++
                while (index < lines.size && lines[index].isNotBlank() && !heading.matches(lines[index]) &&
                    !lines[index].trimStart().startsWith("```") && !lines[index].trimStart().startsWith("|") && !bullet.matches(lines[index])) {
                    text += lines[index++].trim()
                }
                blocks += ScriptReferenceBlock.Paragraph(text.joinToString(" "))
            }
        }
    }
    flush()
    return sections
}
