const assert = require('assert');
const path = require('path');

async function runUniversalScriptingTests() {
  console.log('--- Testing Universal Wesenho Deep Scripting Platform (wesenho.*) ---');

  const { WesenhoSDK } = await import('../src/script/wesenho_sdk.js');

  // Mock platform context
  const mockHost = {
    brushParams: { size: 20, opacity: 100, hardness: 80 },
    brushColor: 0xff0000ff,
    layers: [{ id: 'l1', name: 'Background' }]
  };

  const sdk = new WesenhoSDK({
    context: { host: mockHost }
  });

  // 1. Test Command Dispatch & State Mutation
  assert.strictEqual(sdk.raster.brush.size, 20, 'Initial brush size should be 20');
  sdk.raster.brush.size = 50;
  assert.strictEqual(mockHost.brushParams.size, 50, 'Brush size should be updated to 50 via CommandBus');
  assert.strictEqual(sdk.raster.brush.size, 50, 'Getter should reflect 50');

  // 2. Test Undo / Redo
  assert(sdk.commands.canUndo, 'Should be able to undo brush size change');
  sdk.commands.undo();
  assert.strictEqual(mockHost.brushParams.size, 20, 'Undo should restore brush size to 20');

  assert(sdk.commands.canRedo, 'Should be able to redo');
  sdk.commands.redo();
  assert.strictEqual(mockHost.brushParams.size, 50, 'Redo should re-apply brush size 50');
  console.log('[sdk] Command Bus dispatch, state mutation & undo/redo verified');

  // 3. Test Command Interceptors (Middleware)
  let interceptorFired = false;
  const unintercept = sdk.commands.intercept('raster.setColor', (cmd, next, ctx) => {
    interceptorFired = true;
    // Mutate payload on the fly (e.g. enforce full alpha as unsigned 32-bit uint)
    cmd.payload.color = (((cmd.payload.color & 0x00ffffff) | 0xff000000) >>> 0);
    next();
  });

  sdk.raster.brush.color = 0x00aabbcc;
  assert(interceptorFired, 'Interceptor should have fired');
  assert.strictEqual(mockHost.brushColor, 0xffaabbcc, 'Color alpha should be enforced by interceptor');
  unintercept();
  console.log('[sdk] Low-level Command interceptors & middleware verified');

  // 4. Test Transactions (Atomic compound undo)
  sdk.commands.transaction('Change Brush Setup', () => {
    sdk.raster.brush.size = 12;
    sdk.raster.brush.opacity = 60;
    sdk.raster.brush.hardness = 100;
  });

  assert.strictEqual(mockHost.brushParams.size, 12, 'Size should be 12');
  assert.strictEqual(mockHost.brushParams.opacity, 60, 'Opacity should be 60');
  assert.strictEqual(mockHost.brushParams.hardness, 100, 'Hardness should be 100');

  // Single undo should revert all 3 changes atomically
  sdk.commands.undo();
  assert.strictEqual(mockHost.brushParams.size, 50, 'Atomic undo should restore size to 50');
  assert.strictEqual(mockHost.brushParams.opacity, 100, 'Atomic undo should restore opacity to 100');
  assert.strictEqual(mockHost.brushParams.hardness, 80, 'Atomic undo should restore hardness to 80');
  console.log('[sdk] Atomic Transactions & compound undo verified');

  // 5. Test Live Macro Recording
  sdk.commands.startMacroRecording();
  sdk.raster.brush.size = 35;
  sdk.raster.brush.color = 0xffffaa00;
  const recordedScript = sdk.commands.stopMacroRecording();

  console.log('[sdk] Recorded Macro Script:\n' + recordedScript);
  assert(recordedScript.includes('wesenho.raster.brush.size = 35;'), 'Macro should contain size assignment');
  assert(recordedScript.includes('wesenho.raster.brush.color = 4294945280;'), 'Macro should contain color assignment');

  // 6. Test Pipeline Hook Registry (Priority & Waterfall)
  let hookContextPassed = false;
  sdk.hooks.register('onBrushStroke', (ctx) => {
    hookContextPassed = true;
    ctx.dabCount = 10;
  }, 10);

  const res = sdk.hooks.trigger('onBrushStroke', { strokeId: 1 });
  assert(hookContextPassed, 'Hook should have triggered');
  assert.strictEqual(res.dabCount, 10, 'Hook should have mutated context');

  // Waterfall pipe test
  sdk.hooks.register('filterMultiplier', (val) => val * 2, 1);
  sdk.hooks.register('filterMultiplier', (val) => val + 5, 2); // Priority 2 runs first: (10 + 5) * 2 = 30
  const piped = sdk.hooks.pipe('filterMultiplier', 10);
  assert.strictEqual(piped, 30, 'Waterfall hook pipeline calculation should be 30');
  console.log('[sdk] Pipeline Hook Registry (priority & waterfall) verified');

  // 7. Test Audio & Vector Domains
  const track = sdk.audio.createTrack('Bass Synth', 'synth');
  assert.strictEqual(track.name, 'Bass Synth', 'Track name should match');

  const note = sdk.audio.addNote('Bass Synth', { pitch: 'C3', start: 0, duration: 2.0 });
  assert.strictEqual(note.pitch, 48, 'C3 should convert to MIDI pitch 48');

  sdk.audio.setBpm(140);
  assert.strictEqual(sdk.audio.bpm, 140, 'BPM should update to 140');
  console.log('[sdk] Audio DAW domain verified');

  // 8. Test Dynamic Script Evaluation (wesenho.eval)
  sdk.eval(`
    raster.brush.size = 77;
    audio.setBpm(160);
  `);
  assert.strictEqual(mockHost.brushParams.size, 77, 'eval() should mutate raster brush size to 77');
  assert.strictEqual(sdk.audio.bpm, 160, 'eval() should mutate audio bpm to 160');
  console.log('[sdk] wesenho.eval() dynamic runtime script evaluation verified');

  console.log('--- ALL UNIVERSAL SCRIPTING PLATFORM TESTS PASSED ---');
}

runUniversalScriptingTests().catch(err => {
  console.error('Universal Scripting Platform test failed:', err);
  process.exit(1);
});
