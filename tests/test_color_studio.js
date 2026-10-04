const assert = require('assert');
const ColorStudio = require('../src/color_studio.js');

console.log('--- Testing ColorStudio High-Performance Engine ---');

// 1. Math & Conversions
console.log('1. Testing RGB <-> HEX conversions...');
assert.strictEqual(ColorStudio.rgbToHex(250, 189, 47), '#fabd2f');
assert.strictEqual(ColorStudio.rgbToHex(0, 0, 0), '#000000');
assert.strictEqual(ColorStudio.rgbToHex(255, 255, 255), '#ffffff');

const rgb = ColorStudio.hexToRgb('#fabd2f');
assert.strictEqual(rgb.r, 250);
assert.strictEqual(rgb.g, 189);
assert.strictEqual(rgb.b, 47);

// 2. HSV Math
console.log('2. Testing RGB <-> HSV conversions...');
const hsv = ColorStudio.rgbToHsv(250, 189, 47);
assert(hsv.h >= 40 && hsv.h <= 44, `Expected Hue around 42, got ${hsv.h}`);
assert(hsv.s >= 80 && hsv.s <= 82, `Expected Saturation around 81, got ${hsv.s}`);
assert(hsv.v >= 97 && hsv.v <= 99, `Expected Value around 98, got ${hsv.v}`);

const rgbBack = ColorStudio.hsvToRgb(hsv.h, hsv.s, hsv.v);
assert(Math.abs(rgbBack.r - 250) <= 2);
assert(Math.abs(rgbBack.g - 189) <= 2);
assert(Math.abs(rgbBack.b - 47) <= 2);

// 3. HSL Math
console.log('3. Testing RGB <-> HSL conversions...');
const hsl = ColorStudio.rgbToHsl(250, 189, 47);
const rgbFromHsl = ColorStudio.hslToRgb(hsl.h, hsl.s, hsl.l);
assert(Math.abs(rgbFromHsl.r - 250) <= 2);
assert(Math.abs(rgbFromHsl.g - 189) <= 2);
assert(Math.abs(rgbFromHsl.b - 47) <= 2);

// 4. Parse Color
console.log('4. Testing parseColor...');
assert.strictEqual(ColorStudio.parseColor('none').isNone, true);
assert.strictEqual(ColorStudio.parseColor('transparent').isNone, true);
assert.strictEqual(ColorStudio.parseColor('#fe8019').hex, '#fe8019');

// 5. Zero-Lag Sync verification (no DOM crash when window/document is headless)
console.log('5. Testing headless sync safety...');
ColorStudio.syncFromSelection();
ColorStudio.onPanelActivated();

console.log('--- ALL COLOR STUDIO TESTS PASSED ---');
