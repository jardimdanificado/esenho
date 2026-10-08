/**
 * Automated Test Suite for Esenho Unified Resource Standard (data.json & Runner Separation)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const EsenhoRegistry = require("../src/resource_registry.js");

console.log("=== Testing Esenho Unified Resource Data & Runner Architecture ===");

// 1. Validate data.json file exists and is valid JSON
console.log("1. Validating data.json file integrity & schema...");
const dataJsonPath = path.join(__dirname, "../data.json");
assert(fs.existsSync(dataJsonPath), "data.json must exist on disk");

const rawData = fs.readFileSync(dataJsonPath, "utf8");
const dataPackage = JSON.parse(rawData);

assert.strictEqual(dataPackage.$schema, "esenho/data/v1", "Master schema must be esenho/data/v1");
assert.strictEqual(typeof dataPackage.version, "string", "Version string must be present");
assert(dataPackage.stats && typeof dataPackage.stats === "object", "Stats metadata must be present");

console.log("  ✔ data.json loaded successfully with stats:", JSON.stringify(dataPackage.stats));

// 2. Validate all 8 Resource Categories in data.json
console.log("2. Validating 8 Core Standard Resource Domains...");
const requiredCategories = [
  "brushPresets",
  "textures",
  "brushTips",
  "materials",
  "curves",
  "meshes",
  "wasmFx",
  "palettes"
];

for (const cat of requiredCategories) {
  assert(dataPackage[cat] && typeof dataPackage[cat] === "object", `Category "${cat}" must exist in data.json`);
  const count = Object.keys(dataPackage[cat]).length;
  assert(count > 0, `Category "${cat}" must contain items (got ${count})`);
  console.log(`  ✔ [${cat}]: ${count} resources defined in data.json`);
}

// 3. Verify Decoupled Runner (EsenhoRegistry) initializes from data.json
console.log("3. Verifying EsenhoRegistry Runner initializes all 8 domains...");
assert(EsenhoRegistry.list("brush").length >= 70, "Must load brush presets into registry");
assert(EsenhoRegistry.list("tip").length >= 10, "Must load tips into registry");
assert(EsenhoRegistry.list("texture").length >= 15, "Must load textures into registry");
assert(EsenhoRegistry.list("curve").length >= 5, "Must load curves into registry");
assert(EsenhoRegistry.list("material").length >= 50, "Must load materials into registry");
assert(EsenhoRegistry.list("mesh").length >= 15, "Must load meshes into registry");
assert(EsenhoRegistry.list("wasm_fx").length === 29, "Must load all 29 WASM FX into registry");
assert(EsenhoRegistry.list("palette").length >= 10, "Must load palettes into registry");
console.log("  ✔ All 8 domains verified in live registry stores");

// 4. Test Bézier Curve Evaluation Runner
console.log("4. Testing Bézier Curve Transfer Function Runner...");
const yLinear = EsenhoRegistry.evaluateCurve("linear", 0.5);
assert(Math.abs(yLinear - 0.5) < 0.05, "Linear curve at 0.5 must be ~0.5");
const ySoft = EsenhoRegistry.evaluateCurve("stylus_pressure_soft", 0.5);
assert(ySoft > 0.5, "Soft pressure curve at 0.5 must be > 0.5");
const yHard = EsenhoRegistry.evaluateCurve("stylus_pressure_hard", 0.5);
assert(yHard < 0.5, "Hard pressure curve at 0.5 must be < 0.5");
console.log(`  ✔ Curve Math Runner evaluated correctly (Linear: ${yLinear.toFixed(2)}, Soft: ${ySoft.toFixed(2)}, Hard: ${yHard.toFixed(2)})`);

// 5. Test Brush Preset Resolution Runner with overrides
console.log("5. Testing Dynamic Brush Preset Resolution Runner...");
const resolvedInker = EsenhoRegistry.resolveBrush("studio_inker", {
  size: 14,
  color: "#ff0055",
  opacity: 0.8
});
assert.strictEqual(resolvedInker.tip.size, 14, "Size override must apply");
assert.strictEqual(resolvedInker.color, "#ff0055", "Color override must apply");
assert.strictEqual(resolvedInker.opacity, 0.8, "Opacity override must apply");
assert(resolvedInker.tip.hardness !== undefined, "Tip properties must be resolved");
console.log("  ✔ Dynamic Brush Resolution verified");

// 6. Test Material Resolution Runner (with Texture & WASM FX references)
console.log("6. Testing Material Resolution Runner...");
const resolvedMat = EsenhoRegistry.resolveMaterial("art_impasto");
assert(resolvedMat, "Material art_impasto must exist");
assert.strictEqual(resolvedMat.filter.plugin, "kuwahara", "Filter plugin must match");
assert(resolvedMat.resolvedWasmFx, "WASM FX plugin info must be resolved");
assert.strictEqual(resolvedMat.resolvedWasmFx.wasmFile, "kuwahara.wasm", "WASM file reference must match");
console.log("  ✔ Material & WASM FX Resolution Runner verified");

// 7. Test Mesh Pattern Resolution Runner
console.log("7. Testing Mesh Pattern Resolution Runner...");
const resolvedMesh = EsenhoRegistry.resolveMesh("crosshatch", { spacing: 15 });
assert.strictEqual(resolvedMesh.pattern, "crosshatch", "Pattern name must match");
assert.strictEqual(resolvedMesh.spacing, 15, "Spacing override must apply");
console.log("  ✔ Mesh Resolution Runner verified");

// 8. Test WASM FX Embedded Base64 & In-Memory Instantiation Runner
console.log("8. Testing WASM FX Specs & Embedded Binary Base64 Payload...");
const bloomFx = EsenhoRegistry.resolveWasmFx("bloom");
assert(bloomFx, "Bloom WASM FX must exist");
assert(bloomFx.params.length >= 2, "Bloom must have at least 2 parameters defined");
assert.strictEqual(bloomFx.target, "backdrop", "Bloom must target backdrop");
assert(typeof bloomFx.wasmBase64 === "string" && bloomFx.wasmBase64.length > 100, "Bloom must contain embedded wasmBase64");
assert(bloomFx.byteLength > 1000, "Bloom byteLength must be recorded");

// Test decoding base64 to WASM binary
const bloomBytes = EsenhoRegistry.getWasmBytes("bloom");
assert(bloomBytes instanceof Uint8Array, "getWasmBytes must return a Uint8Array");
assert.strictEqual(bloomBytes.length, bloomFx.byteLength, "Decoded bytes length must match byteLength");
// Verify WASM Magic number: 0x00 0x61 0x73 0x6d (\0asm)
assert.strictEqual(bloomBytes[0], 0x00);
assert.strictEqual(bloomBytes[1], 0x61);
assert.strictEqual(bloomBytes[2], 0x73);
assert.strictEqual(bloomBytes[3], 0x6d);
console.log(`  ✔ Bloom WASM Base64 verified (Magic: \\0asm, ${bloomBytes.length} bytes embedded)`);

// Test Quadro Canvas Core WASM
const canvasBytes = EsenhoRegistry.getWasmBytes("quadro_canvas");
assert(canvasBytes && canvasBytes.length > 100000, "quadro_canvas core WASM must be embedded in base64");
assert.strictEqual(canvasBytes[0], 0x00);
assert.strictEqual(canvasBytes[1], 0x61);
console.log(`  ✔ Quadro Canvas Core WASM Base64 verified (${canvasBytes.length} bytes embedded)`);

// Test in-memory WebAssembly Module compilation from base64
(async () => {
  const bloomModule = await EsenhoRegistry.compileWasmFx("bloom");
  assert(bloomModule instanceof WebAssembly.Module, "compileWasmFx must compile WebAssembly.Module from memory");
  console.log("  ✔ In-memory WASM compilation from embedded base64 successful");

  // 9. Test Palette Resolution
  console.log("9. Testing Palette Resolution...");
  const gruvboxPal = EsenhoRegistry.resolvePalette("gruvbox");
  assert(gruvboxPal, "Gruvbox palette must exist");
  assert(gruvboxPal.colors.length >= 8, "Gruvbox must have standard colors");
  assert(gruvboxPal.gradients.length >= 1, "Gruvbox must have gradients");
  console.log(`  ✔ Palette verified (${gruvboxPal.colors.length} swatches, ${gruvboxPal.gradients.length} gradients)`);

  // 10. Test Dynamic Data Export & Reload (Separation of Data from Engine)
  console.log("10. Testing Dynamic Export & Live Reload...");
  const exported = EsenhoRegistry.exportData();
  assert.strictEqual(exported.$schema, "esenho/data/v1");
  assert.strictEqual(Object.keys(exported.brushPresets).length, Object.keys(dataPackage.brushPresets).length);
  assert(exported.wasmCore && exported.wasmCore.wasmBase64, "Exported data must include wasmCore base64");
  assert(exported.wasmFx.bloom && exported.wasmFx.bloom.wasmBase64, "Exported data must include wasmFx base64");

  // Custom resource addition and reload
  EsenhoRegistry.register("brush", {
    id: "custom_neon_pen",
    name: "Custom Neon Pen",
    tip: { size: 10 },
    color: "#00ffcc"
  });
  assert(EsenhoRegistry.has("brush", "custom_neon_pen"));

  // Reload factory data
  EsenhoRegistry.resetDefaults();
  assert(!EsenhoRegistry.has("brush", "custom_neon_pen"), "Factory reset must restore pure standard dataset");
  console.log("  ✔ Pure Data & Runner separation confirmed");

  console.log("\n=======================================================");
  console.log("ALL UNIFIED DATA & RUNNER TESTS PASSED (100% VERIFIED)!");
  console.log("=======================================================");
})();
