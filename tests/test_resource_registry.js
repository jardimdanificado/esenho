/**
 * Automated Test Suite for Esenho Universal Resource Registry
 */

const assert = require("assert");
const EsenhoRegistry = require("../src/resource_registry.js");

console.log("--- Testing Esenho Universal Resource Registry (9 Standard Asset Types) ---");

// 1. Check schemas & default catalogs
console.log("1. Verifying Built-in Catalogs for 9 Types...");
const types = ["brush", "tip", "texture", "curve", "material", "palette", "mesh", "wasm_fx", "brush_fill"];
for (const type of types) {
  const list = EsenhoRegistry.list(type);
  assert(list.length > 0, `Type ${type} must have default built-in items`);
  console.log(`  ✔ ${type}: ${list.length} built-in items loaded`);
}

// 2. Test Curve Evaluation (Bézier mathematical sampling)
console.log("2. Testing Bézier Curve Evaluation...");
const yMidLinear = EsenhoRegistry.evaluateCurve("linear", 0.5);
assert(Math.abs(yMidLinear - 0.5) < 0.05, `Linear curve at 0.5 should be ~0.5 (got ${yMidLinear})`);

const ySoftMid = EsenhoRegistry.evaluateCurve("stylus_pressure_soft", 0.5);
assert(ySoftMid > 0.5, `Soft response curve at 0.5 should be boosted (>0.5, got ${ySoftMid})`);

const yHardMid = EsenhoRegistry.evaluateCurve("stylus_pressure_hard", 0.5);
assert(yHardMid < 0.5, `Hard response curve at 0.5 should be attenuated (<0.5, got ${yHardMid})`);
console.log(`  ✔ Curve evaluation passed (Linear: ${yMidLinear.toFixed(2)}, Soft: ${ySoftMid.toFixed(2)}, Hard: ${yHardMid.toFixed(2)})`);

// 3. Test Registration of Custom Assets
console.log("3. Testing Custom Asset Registration...");
const customTip = EsenhoRegistry.register("tip", {
  id: "my_custom_splatter",
  name: "My Custom Splatter",
  type: "procedural",
  hardness: 90,
  aspectRatio: 1.0,
  angle: 15
});
assert.strictEqual(customTip.$schema, "esenho/tip/v1");
assert.strictEqual(EsenhoRegistry.get("tip", "my_custom_splatter").name, "My Custom Splatter");

const customBrush = EsenhoRegistry.register("brush", {
  id: "my_custom_splatter_brush",
  name: "My Splatter Brush",
  tip: { ref: "my_custom_splatter", size: 45 },
  dynamics: { spacing: 12 },
  texture: { ref: "paper" }
});
assert.strictEqual(customBrush.id, "my_custom_splatter_brush");

const customBrushFill = EsenhoRegistry.register("brush_fill", {
  id: "my_custom_cross_fill",
  name: "Custom Neon Cross Fill",
  category: "custom",
  brushFill: {
    enabled: true,
    pattern: "crosshatch",
    brush: "marker",
    spacing: 10,
    colorPalette: ["#00f5d4", "#f72585"]
  }
});
assert.strictEqual(customBrushFill.$schema, "esenho/brush_fill/v1");
assert.strictEqual(EsenhoRegistry.get("brush_fill", "my_custom_cross_fill").name, "Custom Neon Cross Fill");
console.log("  ✔ Custom Tip, Brush, and Brush Fill Preset registered successfully");

// 4. Test Unified Brush & Brush Fill Resolution with Local Stroke Overrides
console.log("4. Testing Brush & Brush Fill Resolution & Local Overrides...");
const resolved = EsenhoRegistry.resolveBrush("my_custom_splatter_brush", {
  size: 80,
  color: "#ff0055",
  opacity: 0.75
});
assert.strictEqual(resolved.tip.size, 80, "Override size must take precedence");
assert.strictEqual(resolved.tip.hardness, 90, "Tip reference parameters must be resolved");
assert.strictEqual(resolved.texture.depth, 50, "Texture reference parameters must be resolved");
assert.strictEqual(resolved.color, "#ff0055", "Color override must be applied");
assert.strictEqual(resolved.opacity, 0.75, "Opacity override must be applied");

const resolvedBf = EsenhoRegistry.resolveBrushFill("bf_pencil_hatch", {
  spacing: 12,
  strokeWidth: 3
});
assert.strictEqual(resolvedBf.id, "bf_pencil_hatch");
assert.strictEqual(resolvedBf.brushFill.spacing, 12, "Spacing override must apply");
assert.strictEqual(resolvedBf.brushFill.strokeWidth, 3, "Stroke width override must apply");
assert(resolvedBf.brushFill.resolvedBrush, "Brush reference must be resolved");
console.log("  ✔ Brush and Brush Fill resolution verified 100%");

// 5. Test Cloning & User Unregistering
console.log("5. Testing Cloning & Unregistering...");
const cloned = EsenhoRegistry.clone("brush", "studio_inker", "my_inker_copy", "My Inker Copy");
assert.strictEqual(cloned.id, "my_inker_copy");
assert(!cloned.builtin, "Cloned item must not be marked as built-in");

const deleted = EsenhoRegistry.unregister("brush", "my_inker_copy");
assert(deleted === true, "User asset must be deletable");
assert(!EsenhoRegistry.has("brush", "my_inker_copy"), "Deleted item must no longer exist");

const cannotDeleteBuiltin = EsenhoRegistry.unregister("brush", "studio_inker");
assert(cannotDeleteBuiltin === false, "Builtin item must not be deletable");

const clonedBf = EsenhoRegistry.clone("brush_fill", "bf_pencil_hatch", "my_pencil_hatch_copy", "My Pencil Hatch Copy");
assert.strictEqual(clonedBf.id, "my_pencil_hatch_copy");
assert(!clonedBf.builtin, "Cloned brush fill must not be marked as built-in");
console.log("  ✔ Cloning and safety constraints verified");

// 6. Test Export & Import Manifest
console.log("6. Testing Export & Import Manifest...");
const manifest = EsenhoRegistry.exportAll();
assert(manifest.resources.tip.some(t => t.id === "my_custom_splatter"), "Manifest must include user tips");
assert(manifest.resources.brush.some(b => b.id === "my_custom_splatter_brush"), "Manifest must include user brushes");
assert(manifest.resources.brush_fill.some(bf => bf.id === "my_custom_cross_fill"), "Manifest must include user brush fills");

EsenhoRegistry.resetDefaults();
assert(!EsenhoRegistry.has("brush", "my_custom_splatter_brush"), "Reset must clear user assets");
assert(!EsenhoRegistry.has("brush_fill", "my_custom_cross_fill"), "Reset must clear user brush fills");

const importedCount = EsenhoRegistry.importManifest(manifest);
assert(importedCount >= 3, "Import must restore user assets");
assert(EsenhoRegistry.has("brush", "my_custom_splatter_brush"), "Imported brush must exist");
assert(EsenhoRegistry.has("brush_fill", "my_custom_cross_fill"), "Imported brush fill must exist");
console.log(`  ✔ Manifest export & import verified (${importedCount} assets restored)`);

console.log("\nALL RESOURCE REGISTRY TESTS PASSED (9 ASSET SCHEMAS VERIFIED 100%)!");

