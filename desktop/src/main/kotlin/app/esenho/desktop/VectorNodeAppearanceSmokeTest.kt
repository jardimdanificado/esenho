package app.esenho.desktop

import app.esenho.desktop.graphics.*
import app.esenho.desktop.platform.Context
import app.esenho.nativeengine.*
import kotlin.math.abs
import kotlin.math.hypot
import org.json.JSONObject

/** Node types, absolute node position and SVG contour caps/joins use the production engine. */
fun vectorNodeAppearanceSmokeTest(context: Context) {
    val engine = EsenhoEngine(context, 256, 256)
    engine.selectPreset(engine.presetCatalog.first())
    val v = engine.vectors
    v.switchMode(true)
    val layer = engine.activeLayerIndex
    val obj =
        VectorObject(
            "node-test",
            mutableListOf(
                VectorNode(50f, 50f, 1f),
                VectorNode(150f, 50f, 1f),
                VectorNode(150f, 150f, 1f),
                VectorNode(50f, 150f, 1f),
            ),
            engine.captureVectorStyle(),
            true,
            0xff334455.toInt(),
        )
    v.layers[layer] = mutableListOf(obj)
    v.render()
    v.tool = VectorTool.NODES
    v.selectedId = "node-test"

    fun node(): VectorNode = v.layers.getValue(layer).first { it.id == "node-test" }.nodes[1]
    fun collinear(n: VectorNode) =
        abs((n.outX - n.x) * (n.inY - n.y) - (n.outY - n.y) * (n.inX - n.x)) < .01f
    fun selectSecondNode() {
        val a = node()
        v.selectedId = "node-test"
        engine.onTouchDown(a.x, a.y)
        engine.onTouchUp(a.x, a.y)
        v.selectedId = "node-test"
    }
    selectSecondNode()

    // Smooth: conversion seeds handles from neighbours, dragging keeps them collinear.
    v.setNodeType(VectorNodeType.SMOOTH)
    check(node().type == VectorNodeType.SMOOTH)
    var n = node()
    val smoothIn = hypot(n.inX - n.x, n.inY - n.y)
    val smoothOut = hypot(n.outX - n.x, n.outY - n.y)
    check(smoothIn > 0f && smoothOut > 0f)
    check(collinear(n))
    val outX = n.outX
    val outY = n.outY
    engine.onTouchDown(outX, outY)
    engine.onTouchMove(outX + 20f, outY - 10f)
    engine.onTouchUp(outX + 20f, outY - 10f)
    v.selectedId = "node-test"
    n = node()
    check(abs(hypot(n.inX - n.x, n.inY - n.y) - smoothIn) < .05f)
    check(collinear(n))
    check(abs(hypot(n.outX - n.x, n.outY - n.y) - hypot(outX - n.x, outY - n.y)) > 5f)
    check(engine.undo())
    selectSecondNode()
    check(node().type == VectorNodeType.SMOOTH)

    // Symmetric: both handles share a length and stay on one line after a drag.
    v.setNodeType(VectorNodeType.SYMMETRIC)
    n = node()
    check(n.type == VectorNodeType.SYMMETRIC)
    check(abs(hypot(n.inX - n.x, n.inY - n.y) - hypot(n.outX - n.x, n.outY - n.y)) < .01f)
    check(collinear(n))
    val inX = n.inX
    val inY = n.inY
    engine.onTouchDown(inX, inY)
    engine.onTouchMove(inX - 12f, inY + 18f)
    engine.onTouchUp(inX - 12f, inY + 18f)
    v.selectedId = "node-test"
    n = node()
    check(collinear(n))
    check(abs(hypot(n.inX - n.x, n.inY - n.y) - hypot(n.outX - n.x, n.outY - n.y)) < .01f)

    // Corner collapses both handles and is part of the same history.
    v.setNodeType(VectorNodeType.CORNER)
    n = node()
    check(n.type == VectorNodeType.CORNER && n.inX == n.x && n.outX == n.x)
    check(engine.undo())
    selectSecondNode()
    check(node().type == VectorNodeType.SYMMETRIC)

    // Absolute node coordinates move the anchor and both handles as a unit.
    val beforeX = node().x
    val beforeInX = node().inX
    v.moveNode(140f, 60f)
    n = node()
    check(n.x == 140f && n.y == 60f)
    check(abs(n.inX - beforeInX - (140f - beforeX)) < .01f)
    check(engine.undo())
    selectSecondNode()
    check(node().x == beforeX)

    // Node type survives the project archive; older nodes default to corner.
    v.setNodeType(VectorNodeType.SYMMETRIC)
    val archive =
        JSONObject(
            v.layers
                .getValue(layer)
                .first { it.id == "node-test" }
                .json()
                .toString()
        )
    check(VectorObject.read(archive).nodes[1].type == VectorNodeType.SYMMETRIC)
    archive.getJSONArray("nodes").getJSONArray(1).remove(9)
    check(VectorObject.read(archive).nodes[1].type == VectorNodeType.CORNER)

    // Cap, join and miter are editable properties and reach exported SVG.
    v.selectedId = "node-test"
    v.setObjectCap("square")
    v.setObjectJoin("bevel")
    v.setObjectMiter(7f)
    val svg = v.exportSvg()
    check(svg.contains("stroke-linecap=\"square\""))
    check(svg.contains("stroke-linejoin=\"bevel\""))
    check(svg.contains("stroke-miterlimit=\"7.0\""))
    check(engine.undo())
    check(
        v.layers
            .getValue(layer)
            .first { it.id == "node-test" }
            .style
            .optDouble("miter", 4.0) == 4.0
    )

    println("Vector nodes and appearance: node types, handle constraints, numeric move, caps/joins OK")
}
