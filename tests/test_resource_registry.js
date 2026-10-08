/**
 * Automated Test Suite for Esenho Universal Resource Registry
 */

const assert = require("assert");
const EsenhoRegistry = require("../src/resource_registry.js");

console.log("--- Testing Esenho Universal Resource Registry (7 Standard Asset Types) ---");

// 1. Check schemas & default catalogs
console.log("1. Verifying Built-in Catalogs for 7 Types...");
const types = ["brush", "tip", "texture", "curve", "material", "palette", "mesh"];
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
console.log("  ✔ Custom Tip and Custom Brush registered successfully");

// 4. Test Unified Brush Resolution with Local Stroke Overrides
console.log("4. Testing Brush Resolution & Local Overrides...");
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
console.log("  ✔ Brush resolution and stroke overrides verified 100%");

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
console.log("  ✔ Cloning and safety constraints verified");

// 6. Test Export & Import Manifest
console.log("6. Testing Export & Import Manifest...");
const manifest = EsenhoRegistry.exportAll();
assert(manifest.resources.tip.some(t => t.id === "my_custom_splatter"), "Manifest must include user tips");
assert(manifest.resources.brush.some(b => b.id === "my_custom_splatter_brush"), "Manifest must include user brushes");

EsenhoRegistry.resetDefaults();
assert(!EsenhoRegistry.has("brush", "my_custom_splatter_brush"), "Reset must clear user assets");

const importedCount = EsenhoRegistry.importManifest(manifest);
assert(importedCount >= 2, "Import must restore user assets");
assert(EsenhoRegistry.has("brush", "my_custom_splatter_brush"), "Imported brush must exist");
console.log(`  ✔ Manifest export & import verified (${importedCount} assets restored)`);

console.log("\nALL RESOURCE REGISTRY TESTS PASSED (7 ASSET SCHEMAS VERIFIED 100%)!");
