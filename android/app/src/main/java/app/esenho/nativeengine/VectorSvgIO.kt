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
            return buildList {
                repeat(layers.length()) { l ->
                    val objects = layers.getJSONObject(l).getJSONArray("objects")
                    repeat(objects.length()) { index ->
                        val obj = VectorObject.read(objects.getJSONObject(index))
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
                        add(obj.copy(id = java.util.UUID.randomUUID().toString()))
                    }
                }
            }
        }
        return SvgDocumentReader(root).read()
    }
}
