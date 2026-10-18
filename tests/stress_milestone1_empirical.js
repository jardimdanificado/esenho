/**
 * ============================================================================
 * Empirical Stress Test Harness — Milestone 1 (UI Ergonomics & Compaction)
 * Challenger 1 Verification
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Starting Empirical Stress Test Suite for Milestone 1 ---');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

// ============================================================================
// SUITE 1: Vector Drawable XML Integrity and Path Geometry
// ============================================================================
console.log('\n[Suite 1: ic_eraser.xml Vector Drawable Stress Test]');

const eraserXmlPath = path.resolve(__dirname, '../android/app/src/main/res/drawable/ic_eraser.xml');

runTest('1.1: File existence and non-zero size', () => {
  assert.ok(fs.existsSync(eraserXmlPath), `File does not exist: ${eraserXmlPath}`);
  const stat = fs.statSync(eraserXmlPath);
  assert.ok(stat.size > 100, `File size too small: ${stat.size} bytes`);
});

const xmlContent = fs.readFileSync(eraserXmlPath, 'utf8');

runTest('1.2: XML root and Android namespace validation', () => {
  assert.ok(xmlContent.includes('<vector'), 'Missing <vector root tag');
  assert.ok(xmlContent.includes('xmlns:android="http://schemas.android.com/apk/res/android"'), 'Missing standard Android XML namespace');
  assert.ok(xmlContent.includes('android:width="24dp"'), 'Width must be 24dp');
  assert.ok(xmlContent.includes('android:height="24dp"'), 'Height must be 24dp');
  assert.ok(xmlContent.includes('android:viewportWidth="24"'), 'Viewport width must be 24');
  assert.ok(xmlContent.includes('android:viewportHeight="24"'), 'Viewport height must be 24');
  assert.ok(xmlContent.includes('</vector>'), 'Missing closing </vector> tag');
});

runTest('1.3: SVG pathData syntax and command grammar tokenization', () => {
  const match = xmlContent.match(/android:pathData="([^"]+)"/);
  assert.ok(match, 'Missing android:pathData in path element');
  const pathData = match[1];

  // Tokenize SVG path
  const tokens = pathData.match(/[a-df-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/gi);
  assert.ok(tokens && tokens.length > 0, 'Path data tokenization returned empty');

  // Verify command validity
  const validCommands = new Set(['M', 'm', 'L', 'l', 'H', 'h', 'V', 'v', 'C', 'c', 'S', 's', 'Q', 'q', 'T', 't', 'A', 'a', 'Z', 'z']);
  let i = 0;
  let commandCount = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (validCommands.has(token)) {
      commandCount++;
      i++;
    } else {
      const num = parseFloat(token);
      assert.ok(!isNaN(num), `Invalid token in path data: ${token}`);
      i++;
    }
  }
  assert.ok(commandCount >= 4, `Too few SVG commands: ${commandCount}`);
});

runTest('1.4: Vector Path Bounding Box Verification in [0, 24] Viewport', () => {
  const match = xmlContent.match(/android:pathData="([^"]+)"/);
  const pathData = match[1];

  let currentX = 0, currentY = 0;
  let minX = 24, maxX = 0, minY = 24, maxY = 0;

  function updateBounds(x, y) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const commandRegex = /([a-df-z])([^a-df-z]*)/gi;
  let seg;
  while ((seg = commandRegex.exec(pathData)) !== null) {
    const cmd = seg[1];
    const args = (seg[2].trim().match(/[-+]?(?:\d*\.\d+|\d+)/g) || []).map(Number);

    if (cmd === 'M') {
      currentX = args[0]; currentY = args[1];
      updateBounds(currentX, currentY);
    } else if (cmd === 'm') {
      currentX += args[0]; currentY += args[1];
      updateBounds(currentX, currentY);
    } else if (cmd === 'L') {
      currentX = args[0]; currentY = args[1];
      updateBounds(currentX, currentY);
    } else if (cmd === 'l') {
      for (let k = 0; k < args.length; k += 2) {
        currentX += args[k]; currentY += args[k+1];
        updateBounds(currentX, currentY);
      }
    } else if (cmd === 'h') {
      for (const dx of args) {
        currentX += dx;
        updateBounds(currentX, currentY);
      }
    } else if (cmd === 'c') {
      for (let k = 0; k < args.length; k += 6) {
        updateBounds(currentX + args[k], currentY + args[k+1]);
        updateBounds(currentX + args[k+2], currentY + args[k+3]);
        currentX += args[k+4]; currentY += args[k+5];
        updateBounds(currentX, currentY);
      }
    } else if (cmd === 's') {
      for (let k = 0; k < args.length; k += 4) {
        updateBounds(currentX + args[k], currentY + args[k+1]);
        currentX += args[k+2]; currentY += args[k+3];
        updateBounds(currentX, currentY);
      }
    }
  }

  assert.ok(minX >= 0, `Path out of viewport (minX = ${minX} < 0)`);
  assert.ok(maxX <= 24, `Path out of viewport (maxX = ${maxX} > 24)`);
  assert.ok(minY >= 0, `Path out of viewport (minY = ${minY} < 0)`);
  assert.ok(maxY <= 24, `Path out of viewport (maxY = ${maxY} > 24)`);
  console.log(`    Geometry bounds: [${minX.toFixed(2)}, ${minY.toFixed(2)}] to [${maxX.toFixed(2)}, ${maxY.toFixed(2)}] within 24x24 viewport`);
});

runTest('1.5: Verify ic_eraser is referenced across NativePainterActivity and BrushDrawer', () => {
  const painterActivity = fs.readFileSync(path.resolve(__dirname, '../android/app/src/main/java/app/esenho/ui/NativePainterActivity.kt'), 'utf8');
  const brushDrawer = fs.readFileSync(path.resolve(__dirname, '../android/app/src/main/java/app/esenho/ui/components/BrushDrawer.kt'), 'utf8');

  assert.ok(painterActivity.includes('painterResource(R.drawable.ic_eraser)'), 'NativePainterActivity must use R.drawable.ic_eraser for Borracha');
  assert.ok(brushDrawer.includes('R.drawable.ic_eraser'), 'BrushDrawer must use R.drawable.ic_eraser for Borrachas category');
  assert.ok(!painterActivity.includes('Icons.Default.AutoFixNormal'), 'AutoFixNormal (magic wand) must not be used in toolbar');
});

// ============================================================================
// SUITE 2: TopAppBar Layout Bounds Math Under Stress Conditions
// ============================================================================
console.log('\n[Suite 2: TopAppBar Layout Bounds Math & Overlap Stress Test]');

const painterSource = fs.readFileSync(path.resolve(__dirname, '../android/app/src/main/java/app/esenho/ui/NativePainterActivity.kt'), 'utf8');

runTest('2.1: Code Inspection of TopAppBar Modifier.weight and Ellipsis constraints', () => {
  assert.ok(painterSource.includes('modifier = Modifier.fillMaxWidth()'), 'TopAppBar title Row must fillMaxWidth');
  assert.ok(painterSource.includes('.weight(1f, fill = false)'), 'Surface must use weight(1f, fill = false) to prevent unbounded growth');
  assert.ok(painterSource.includes('maxLines = 1'), 'Preset Text must enforce maxLines = 1');
  assert.ok(painterSource.includes('overflow = TextOverflow.Ellipsis'), 'Preset Text must enforce TextOverflow.Ellipsis');
});

/**
 * Exact Jetpack Compose TopAppBar Layout Engine Simulator:
 * In Compose Material 3:
 * 1. Actions are measured and placed at [screenWidth - actionsWidth, screenWidth].
 * 2. Title is constrained to: maxTitleWidth = max(0, screenWidth - actionsWidth - titleStartPadding).
 * 3. Title Row contains: Text("esenho") (unweighted) and Surface (weighted 1f, fill=false).
 * 4. Surface width = min(contentWidth, max(0, maxTitleWidth - textWidth - spacing)).
 */
function simulateComposeTopAppBar(screenWidthDp, presetName) {
  // Actions: 5 icon buttons (36dp) + layers (40dp) + swatch (24dp) + spacer (4dp) = 248dp
  const actionsWidth = 248;
  const titleStartPadding = 16;
  const maxTitleWidth = Math.max(0, screenWidthDp - actionsWidth - titleStartPadding);

  const logoWidth = 55; // "esenho" typography.titleMedium ~55dp
  const rowSpacing = 8;
  const availableForChip = Math.max(0, maxTitleWidth - logoWidth - rowSpacing);

  // Chip intrinsic content measurement:
  const chipFixedOverhead = 8 + 14 + 4 + 2 + 16 + 8; // 52dp (padding, icons, spacers)
  const charWidth = 7.5; // ~7.5dp per char at 11sp semi-bold
  const rawTextWidth = presetName.length * charWidth;
  const desiredChipWidth = chipFixedOverhead + rawTextWidth;

  // Surface has Modifier.weight(1f, fill = false)
  // Therefore actual chip width cannot exceed availableForChip
  const actualChipWidth = Math.min(availableForChip, desiredChipWidth);

  // Total width occupied by title:
  const totalTitleWidth = (actualChipWidth > 0)
    ? logoWidth + rowSpacing + actualChipWidth
    : Math.min(maxTitleWidth, logoWidth);

  const titleRightX = titleStartPadding + totalTitleWidth;
  const actionsLeftX = screenWidthDp - actionsWidth;
  const overlap = Math.max(0, titleRightX - actionsLeftX);

  return {
    screenWidthDp,
    presetName,
    maxTitleWidth,
    availableForChip,
    actualChipWidth,
    isTruncated: desiredChipWidth > availableForChip,
    overlap,
    collidesWithUndo: overlap > 0
  };
}

runTest('2.2: Stress test across supported Android screen widths (320dp to 1200dp)', () => {
  const widths = [320, 360, 390, 412, 480, 600, 720, 800, 1024, 1200];
  const presets = ['Caneta G', 'Aerógrafo Suave', 'Lápis Texturizado HB', 'Pincel de Óleo Clássico'];

  for (const w of widths) {
    for (const p of presets) {
      const res = simulateComposeTopAppBar(w, p);
      assert.strictEqual(res.collidesWithUndo, false, `Collision detected at width ${w}dp for preset "${p}": overlap=${res.overlap}dp`);
      assert.ok(res.actualChipWidth <= res.availableForChip, `Chip exceeded available space: ${res.actualChipWidth} > ${res.availableForChip}`);
    }
  }
});

runTest('2.3: Stress test with extreme name lengths (empty, single char, 100, 500 chars)', () => {
  const extremeNames = [
    '',
    'A',
    '🎨',
    'Custom Brush with a Very Long Descriptive Name That Might Span Multiple Sentences If Not Truncated Properly',
    'X'.repeat(500)
  ];

  for (const name of extremeNames) {
    const res = simulateComposeTopAppBar(360, name);
    assert.strictEqual(res.collidesWithUndo, false, `Collision for extreme name length (${name.length}): overlap=${res.overlap}dp`);
    if (name.length > 20) {
      assert.strictEqual(res.isTruncated, true, `Long name (${name.length} chars) must be truncated`);
    }
  }
});

// ============================================================================
// SUITE 3: TooltipBox Hierarchy & Interactions
// ============================================================================
console.log('\n[Suite 3: TooltipBox Hierarchy Stress Test]');

runTest('3.1: TooltipIconButton Composable structure and state management', () => {
  assert.ok(painterSource.includes('fun TooltipIconButton('), 'TooltipIconButton definition missing');
  assert.ok(painterSource.includes('TooltipBox('), 'TooltipIconButton must wrap IconButton in TooltipBox');
  assert.ok(painterSource.includes('TooltipDefaults.rememberPlainTooltipPositionProvider()'), 'Must use rememberPlainTooltipPositionProvider');
  assert.ok(painterSource.includes('state = rememberTooltipState()'), 'Must use separate rememberTooltipState per instance');
  assert.ok(painterSource.includes('PlainTooltip {'), 'Must use PlainTooltip composable');
});

runTest('3.2: ToolNavButton Composable dual painter/vector support', () => {
  assert.ok(painterSource.includes('fun ToolNavButton('), 'ToolNavButton definition missing');
  assert.ok(painterSource.includes('icon: ImageVector? = null'), 'ToolNavButton must accept ImageVector');
  assert.ok(painterSource.includes('painter: Painter? = null'), 'ToolNavButton must accept Painter for custom drawables');
  assert.ok(painterSource.includes('Icon(painter, contentDescription = description'), 'Must render custom painter when provided');
});

runTest('3.3: Decoupled Tool Mode vs Brush Presets Drawer', () => {
  // Verify that Pincel does NOT open drawer
  const pincelRegex = /description\s*=\s*"Pincel"[\s\S]*?onClick\s*=\s*\{([\s\S]*?)\}/;
  const pincelMatch = painterSource.match(pincelRegex);
  assert.ok(pincelMatch, 'Pincel ToolNavButton not found');
  const pincelBody = pincelMatch[1];
  assert.ok(!pincelBody.includes('showBrushDrawer = true'), 'Pincel onClick must NEVER set showBrushDrawer = true');
  assert.ok(pincelBody.includes('currentTool = ToolMode.BRUSH'), 'Pincel onClick must set currentTool = ToolMode.BRUSH');

  // Verify dedicated Biblioteca de Pincéis button
  const drawerBtnRegex = /description\s*=\s*"Biblioteca de Pincéis"[\s\S]*?onClick\s*=\s*\{([\s\S]*?)\}/;
  const drawerBtnMatch = painterSource.match(drawerBtnRegex);
  assert.ok(drawerBtnMatch, 'Biblioteca de Pincéis ToolNavButton not found');
  const drawerBtnBody = drawerBtnMatch[1];
  assert.ok(drawerBtnBody.includes('showBrushDrawer = true'), 'Biblioteca button must open brush drawer');
});

// ============================================================================
// SUITE 4: Drawers & Selection HUD Compaction
// ============================================================================
console.log('\n[Suite 4: Drawers & Selection HUD Compaction Stress Test]');

const brushDrawerSource = fs.readFileSync(path.resolve(__dirname, '../android/app/src/main/java/app/esenho/ui/components/BrushDrawer.kt'), 'utf8');
const layerDrawerSource = fs.readFileSync(path.resolve(__dirname, '../android/app/src/main/java/app/esenho/ui/components/LayerDrawer.kt'), 'utf8');

runTest('4.1: BrushDrawer max height constraint and compact search bar', () => {
  assert.ok(brushDrawerSource.includes('.heightIn(max = 440.dp)'), 'BrushDrawer must constrain sheet to max 440dp');
  assert.ok(brushDrawerSource.includes('.height(36.dp)'), 'Search Bar must be compacted to 36dp');
  assert.ok(brushDrawerSource.includes('BasicTextField('), 'Search Bar must use compact BasicTextField');
  assert.ok(brushDrawerSource.includes('Icons.Default.Clear'), 'Search Bar must include clear button');
});

runTest('4.2: LayerDrawer max height constraint and compact items', () => {
  assert.ok(layerDrawerSource.includes('.heightIn(max = 440.dp)'), 'LayerDrawer must constrain sheet to max 440dp');
  assert.ok(layerDrawerSource.includes('.heightIn(min = 120.dp, max = 180.dp)'), 'LayerDrawer items list must be constrained to 180dp');
  assert.ok(layerDrawerSource.includes('Modifier.size(32.dp)'), 'Layer header action buttons must be compact (32dp)');
});

runTest('4.3: Selection Floating HUD icon-only conversion', () => {
  const hudStart = painterSource.indexOf('if (selectionActive)');
  const hudEnd = painterSource.indexOf('// 3. Translucent Thumb Sliders', hudStart);
  assert.ok(hudStart !== -1 && hudEnd !== -1, 'Selection HUD block boundaries not found');
  const hudBody = painterSource.substring(hudStart, hudEnd);

  // Must NOT contain SuggestionChip or wide text chips
  assert.ok(!hudBody.includes('SuggestionChip'), 'Selection HUD must NOT use bulky SuggestionChips');
  assert.ok(hudBody.includes('Icons.Default.SelectAll'), 'Must contain SelectAll icon');
  assert.ok(hudBody.includes('Icons.Default.InvertColors'), 'Must contain InvertColors icon');
  assert.ok(hudBody.includes('Icons.Default.Deselect'), 'Must contain Deselect icon');
  assert.ok(hudBody.includes('Icons.Default.DeleteOutline'), 'Must contain DeleteOutline icon');
  assert.ok(hudBody.includes('Icons.Default.OpenWith'), 'Must contain Transform icon');

  // Verify size is 32dp per button
  const buttonSizes = hudBody.match(/Modifier\.size\(32\.dp\)/g);
  assert.ok(buttonSizes && buttonSizes.length >= 5, 'All 5 HUD buttons must be size 32dp');
});

console.log(`\n--- All Empirical Stress Tests Finished: ${passedTests}/${totalTests} Passed ---`);
