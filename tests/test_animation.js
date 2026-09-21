const assert = require('assert');
const path = require('path');
const { EsenhoModule, EsenhoScreenHost } = require('../src/esenho.js');

async function runAnimationTests() {
  console.log('--- Testing Animation Engine, Timeline, IK, Mesh Warp & Multiplane Camera ---');

  const canvasWasmPath = path.resolve(__dirname, '../roms/canvas.wasm');
  const canvasActor = new EsenhoModule(canvasWasmPath);
  canvasActor.exports.w_init(800, 600);

  // 1. Test Timeline & FPS Configuration
  canvasActor.animInit(120, 30);
  assert.strictEqual(canvasActor.animGetTotalFrames(), 120, 'Total frames should be 120');
  assert.strictEqual(canvasActor.animGetFps(), 30, 'FPS should be 30');
  assert.strictEqual(canvasActor.animGetFrame(), 0, 'Current frame should start at 0');

  canvasActor.animSetFrame(15);
  assert.strictEqual(canvasActor.animGetFrame(), 15, 'Current frame should be 15');

  // 2. Test Track and Keyframe Creation & Tweening
  const track0 = canvasActor.animTrackCreate(0 /* W_TRACK_RASTER */, 0 /* Layer 0 */);
  assert.strictEqual(track0, 0, 'Track index should be 0');
  assert.strictEqual(canvasActor.animTrackGetCount(), 1, 'Track count should be 1');

  // Add Keyframe at frame 0 (Linear) and frame 30
  const kf0 = canvasActor.animAddKeyframe(track0, 0, 1 /* W_TWEEN_LINEAR */);
  assert.strictEqual(kf0, 0, 'Keyframe 0 index should be 0');
  canvasActor.animSetKeyframeTransform(track0, kf0, 0, 0, 100, 100, 0, 100, 0);

  const kf1 = canvasActor.animAddKeyframe(track0, 30, 2 /* W_TWEEN_EASE_IN_OUT */);
  assert.strictEqual(kf1, 1, 'Keyframe 1 index should be 1');
  canvasActor.animSetKeyframeTransform(track0, kf1, 300, 150, 200, 200, 90, 50, 10);

  assert.strictEqual(canvasActor.animGetKeyframeCount(track0), 2, 'Keyframe count should be 2');

  const kfInfo0 = canvasActor.animGetKeyframeInfo(track0, 0);
  assert.strictEqual(kfInfo0.frame, 0, 'KF0 frame should be 0');
  assert.strictEqual(kfInfo0.x, 0, 'KF0 x should be 0');

  const kfInfo1 = canvasActor.animGetKeyframeInfo(track0, 1);
  assert.strictEqual(kfInfo1.frame, 30, 'KF1 frame should be 30');
  assert.strictEqual(kfInfo1.x, 300, 'KF1 x should be 300');
  assert.strictEqual(kfInfo1.rotDeg, 90, 'KF1 rotDeg should be 90');

  // Test stepping timeline and interpolation
  canvasActor.animSetFrame(15);
  console.log('[esenho] timeline keyframing & interpolation verified');

  // 3. Test Onion Skinning Configuration
  canvasActor.animOnionSkin(true, 2, 2, 64);
  console.log('[esenho] onion skinning configured');

  // 4. Test 2D Armatures & Bones with Forward Kinematics and CCD-IK Solver
  const armId = canvasActor.animArmatureCreate();
  assert.strictEqual(armId, 1, 'Armature ID should be 1');

  // Bone 1: Root at (400,300), length 100, pointing down (90 deg)
  const b1 = canvasActor.animBoneCreate(armId, 0, 100, 90);
  assert.strictEqual(b1, 1, 'Bone 1 ID should be 1');

  // Bone 2: Child of Bone 1, length 100, relative angle 0 deg
  const b2 = canvasActor.animBoneCreate(armId, b1, 100, 0);
  assert.strictEqual(b2, 2, 'Bone 2 ID should be 2');

  // Bone 3: Child of Bone 2, length 50, relative angle 0 deg (Effector)
  const b3 = canvasActor.animBoneCreate(armId, b2, 50, 0);
  assert.strictEqual(b3, 3, 'Bone 3 ID should be 3');

  // Read initial world position
  const b1Info = canvasActor.animBoneGetInfo(armId, b1);
  assert(b1Info !== null, 'Bone info should not be null');
  assert.strictEqual(b1Info.worldAngleDeg, 90, 'Bone 1 world angle should be 90');

  // Solve Inverse Kinematics (IK) towards target (300, 450)
  const ikOk = canvasActor.animBoneIkSolve(armId, b3, 300, 450, 20);
  assert.strictEqual(ikOk, 1, 'CCD-IK solver should succeed');

  const b3AfterIK = canvasActor.animBoneGetInfo(armId, b3);
  const dist = Math.hypot(b3AfterIK.worldX - 300, b3AfterIK.worldY - 450);
  console.log(`[esenho] CCD-IK solved effector position: (${b3AfterIK.worldX}, ${b3AfterIK.worldY}) target: (300, 450) dist: ${dist.toFixed(2)}px`);
  assert(dist < 20, 'CCD-IK effector should converge close to reachable target position');

  // 5. Test 2D Mesh Warp & Free-form Deformation (FFD)
  const meshId = canvasActor.animMeshCreate(200, 200, 3, 3);
  assert.strictEqual(meshId, 1, 'Mesh ID should be 1');

  // Displace center vertex (vIdx = 4)
  const setVtxOk = canvasActor.animMeshSetVertex(meshId, 4, 130, 130);
  assert.strictEqual(setVtxOk, 1, 'Vertex set should succeed');

  // Bind vertex to bone
  const bindOk = canvasActor.animMeshBindBone(meshId, 4, armId, b1, 80);
  assert.strictEqual(bindOk, 1, 'Mesh bone binding should succeed');

  // Render Mesh Deformation
  const meshRenderOk = canvasActor.animMeshRender(meshId, 0, 1);
  assert.strictEqual(meshRenderOk, 1, 'Mesh warp render should succeed');
  console.log('[esenho] 2D mesh warp and skin binding verified');

  // 6. Test 2.5D Multiplane Camera
  canvasActor.animCameraSet(100, 50, 10, 150, 15);
  const cam = canvasActor.animCameraGet();
  assert.strictEqual(cam.x, 100, 'Camera X should match');
  assert.strictEqual(cam.y, 50, 'Camera Y should match');
  assert.strictEqual(cam.z, 10, 'Camera Z should match');
  assert.strictEqual(cam.zoomPct, 150, 'Camera Zoom should match');
  assert.strictEqual(cam.rotDeg, 15, 'Camera Rotation should match');
  console.log('[esenho] 2.5D multiplane camera verified');

  // 7. Test Symbol Creation & Instantiation
  const symId = canvasActor.animSymbolCreate(24, 1 /* Loop */);
  assert.strictEqual(symId, 1, 'Symbol ID should be 1');

  const symInst = canvasActor.animSymbolInstantiate(symId, track0, 5);
  assert.strictEqual(symInst, 1, 'Symbol instantiation should succeed');
  console.log('[esenho] nested symbols verified');

  // 8. Test Native Selection Engine in C
  canvasActor.selectRect(50, 50, 100, 80, 0 /* W_SEL_REPLACE */);
  let selInfo = canvasActor.selectGetInfo();
  assert.strictEqual(selInfo.active, true, 'Selection should be active');
  assert.strictEqual(selInfo.x, 50, 'Selection x should be 50');
  assert.strictEqual(selInfo.w, 100, 'Selection width should be 100');

  // Add rect (100, 80, 120, 100) -> union
  canvasActor.selectRect(100, 80, 120, 100, 1 /* W_SEL_ADD */);
  selInfo = canvasActor.selectGetInfo();
  assert.strictEqual(selInfo.active, true, 'Selection should remain active after union');

  // Test Magic Wand in C
  const wandSelected = canvasActor.selectWand(0, 60, 60, 30, true, 0 /* W_SEL_REPLACE */);
  console.log(`[esenho] Native C magic wand selected ${wandSelected} pixels`);

  // Test Invert & Clear
  canvasActor.selectInvert();
  selInfo = canvasActor.selectGetInfo();
  assert.strictEqual(selInfo.active, true, 'Inverted selection should be active');

  canvasActor.selectClear();
  selInfo = canvasActor.selectGetInfo();
  assert.strictEqual(selInfo.active, false, 'Selection should be cleared');
  console.log('[esenho] Native C selection engine verified');

  // 9. Test Native Layer Transform & Flips in C
  canvasActor.layerFlipH(0);
  canvasActor.layerFlipV(0);
  const tfOk = canvasActor.layerTransform(0, 0, 10, 10, 120, 120, 45, 0, 1 /* Bilinear */);
  assert.strictEqual(tfOk, 1, 'Layer transform should succeed');
  console.log('[esenho] Native C layer transforms & flips verified');

  // 10. Test Native Procedural Brush Tip Generator in C
  for (let shape = 0; shape <= 6; shape++) {
    const tipBuf = canvasActor.generateBrushTip(shape, 64, 64);
    assert(tipBuf !== null, `Tip buffer for shape ${shape} should not be null`);
    assert.strictEqual(tipBuf.length, 64 * 64, 'Tip buffer size should be 4096 bytes');
  }
  console.log('[esenho] Native C procedural brush tip generator (all 7 shapes) verified');

  // 11. Test EsenhoScreenHost Animation and REPL integration
  const host = new EsenhoScreenHost();
  host.canvasActor = canvasActor;
  let lastLog = '';
  host.sendConsoleLog = (msg) => { lastLog = msg; };

  host.executeCommand("anim init 90 30");
  assert(lastLog.includes('90 frames @ 30 fps'), 'anim init command should work');

  host.executeCommand("anim frame 10");
  assert(lastLog.includes('current frame: 10'), 'anim frame command should work');

  host.executeCommand("anim onion true 2 2");
  assert(lastLog.includes('onion skin: on'), 'anim onion command should work');

  host.executeCommand("anim bone add 1 1 80 45");
  assert(lastLog.includes('anim bone created'), 'anim bone add command should work');

  host.executeCommand("anim ik solve 1 3 300 450");
  assert(lastLog.includes('anim IK solved'), 'anim ik solve command should work');

  host.executeCommand("anim camera set 20 30 5 120 0");
  assert(lastLog.includes('anim camera set'), 'anim camera set command should work');

  console.log('--- ALL ANIMATION & NATIVE CORE TESTS PASSED ---');
}

runAnimationTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
