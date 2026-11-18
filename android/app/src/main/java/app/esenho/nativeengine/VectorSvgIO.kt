package app.esenho.nativeengine

import javax.xml.parsers.DocumentBuilderFactory
import org.json.JSONObject
import org.w3c.dom.Element

/** SVG exports retain native brush data so reopening does not flatten the source. */
object VectorSvgIO {
    fun readEditable(svg: String): List<VectorObject> {
        val factory =
            DocumentBuilderFactory.newInstance().apply {
                isNamespaceAware = true
                setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
                setFeature("http://xml.org/sax/features/external-general-entities", false)
                setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            }
        val root = factory.newDocumentBuilder().parse(svg.byteInputStream()).documentElement
        require(
            root.localName == "svg" &&
                (root.namespaceURI.isNullOrEmpty() ||
                    root.namespaceURI == "http://www.w3.org/2000/svg")
        ) {
            "Arquivo SVG inválido"
        }
        val metadata = root.getElementsByTagNameNS("http://www.w3.org/2000/svg", "metadata")
        for (i in 0 until metadata.length) {
            val item = metadata.item(i) as Element
            if (item.getAttribute("id") != "esenho-vector") continue
            val layers = JSONObject(item.textContent).getJSONArray("layers")
            val groups = mutableMapOf<String, String>()
            val ids = mutableMapOf<String, String>()
            val objects = mutableListOf<VectorObject>()
            repeat(layers.length()) { l ->
                val layerObjects = layers.getJSONObject(l).getJSONArray("objects")
                repeat(layerObjects.length()) { index ->
                    val obj = VectorObject.read(layerObjects.getJSONObject(index))
                    require(
                        obj.allNodes().all { n ->
                            listOf(n.x, n.y, n.inX, n.inY, n.outX, n.outY, n.pressure).all {
                                it.isFinite()
                            }
                        }
                    ) {
                        "Coordenadas SVG inválidas"
                    }
                    obj.groupId =
                        obj.groupId?.let {
                            groups.getOrPut(it) { java.util.UUID.randomUUID().toString() }
                        }
                    val newId = java.util.UUID.randomUUID().toString()
                    ids[obj.id] = newId
                    objects.add(obj.copy(id = newId))
                }
            }
            objects.forEach { obj -> obj.pathId = obj.pathId?.let { ids[it] ?: it } }
            return objects
        }
        val parsed = SvgDocumentReader(root).read()
        val byName = parsed.associate { it.name to it.id }
        parsed.forEach { obj -> obj.pathId = obj.pathId?.let { byName[it] ?: it } }
        return parsed
    }
}
