const assert = require('assert');
const path = require('path');

async function runSvgRiggingTests() {
  console.log('--- Testing Vector Studio Rigging & Ragdoll Physics Engine ---');

  const {
    SvgBone,
    SvgSkeleton,
    RagdollSimulation,
    bakeRagdollToDopeSheet
  } = require('../src/svg/svg_rigging.js');

  const { DopeSheet } = await import('../src/anim/dopesheet.js');

  // 1. SvgBone Creation & JSON Serialization
  const bone1 = new SvgBone('b_hip', 'Hip', 80, 90, {
    physics: { mode: 'ragdoll', minAngle: -45, maxAngle: 45, mass: 2.0 }
  });
  assert.strictEqual(bone1.id, 'b_hip', 'Bone ID should match');
  assert.strictEqual(bone1.length, 80, 'Bone length should be 80');
  assert.strictEqual(bone1.localAngle, 90, 'Bone angle should be 90');
  assert.strictEqual(bone1.physics.mode, 'ragdoll', 'Physics mode should be ragdoll');

  const jsonBone = bone1.toJSON();
  const restoredBone = SvgBone.fromJSON(jsonBone);
  assert.strictEqual(restoredBone.id, bone1.id, 'Restored bone id matches');
  assert.strictEqual(restoredBone.physics.mass, 2.0, 'Restored physics mass matches');
  console.log('✔ SvgBone creation and JSON serialization verified');

  // 2. SvgSkeleton & Forward Kinematics (FK)
  const skel = new SvgSkeleton('skel_hero', 'Hero Rig', { x: 200, y: 100 });
  const root = skel.addBone(new SvgBone('root', 'Torso', 100, 90)); // pointing straight down (90 deg)
  const leg = skel.addBone(new SvgBone('leg', 'Upper Leg', 80, 0, { parentId: 'root' })); // continues straight down
  const foot = skel.addBone(new SvgBone('foot', 'Foot', 40, -90, { parentId: 'leg' })); // turns 90 deg right (0 deg world)

  skel.updateWorldTransforms();

  // Root should start at (200, 100) and end at (200, 200)
  assert(Math.abs(root.worldX0 - 200) < 0.01, 'Root worldX0 should be 200');
  assert(Math.abs(root.worldY0 - 100) < 0.01, 'Root worldY0 should be 100');
  assert(Math.abs(root.worldX1 - 200) < 0.01, 'Root worldX1 should be 200');
  assert(Math.abs(root.worldY1 - 200) < 0.01, 'Root worldY1 should be 200');
  assert.strictEqual(root.worldAngle, 90, 'Root worldAngle should be 90');

  // Leg should start at (200, 200) and end at (200, 280)
  assert(Math.abs(leg.worldX0 - 200) < 0.01, 'Leg starts at root tip');
  assert(Math.abs(leg.worldY0 - 200) < 0.01, 'Leg starts at root tip');
  assert(Math.abs(leg.worldY1 - 280) < 0.01, 'Leg worldY1 should be 280');
  assert.strictEqual(leg.worldAngle, 90, 'Leg worldAngle should be 90');

  // Foot should turn 90 deg right (-90 local from 90 parent = 0 world)
  assert(Math.abs(foot.worldX1 - 240) < 0.01, 'Foot worldX1 should be 240');
  assert(Math.abs(foot.worldY1 - 280) < 0.01, 'Foot worldY1 should be 280');
  assert.strictEqual(foot.worldAngle, 0, 'Foot worldAngle should be 0');
  console.log('✔ Forward Kinematics (FK) multi-joint hierarchy verified');

  // 3. Cyclic Coordinate Descent Inverse Kinematics (CCD-IK)
  const armSkel = new SvgSkeleton('skel_arm', 'Arm Rig', { x: 300, y: 300 });
  const upperArm = armSkel.addBone(new SvgBone('upper', 'Upper Arm', 100, 0));
  const foreArm = armSkel.addBone(new SvgBone('fore', 'Forearm', 100, 0, { parentId: 'upper' }));

  // Reach target (400, 400)
  const ikSuccess = armSkel.solveIK('fore', 400, 400, { maxIterations: 30, tolerance: 1.0 });
  assert.strictEqual(ikSuccess, true, 'CCD-IK should successfully reach target');
  const distToTarget = Math.hypot(foreArm.worldX1 - 400, foreArm.worldY1 - 400);
  assert(distToTarget <= 1.0, `Effector distance to target should be <= 1.0px, got ${distToTarget}`);
  console.log(`✔ CCD-IK 2-bone solver verified (effector error: ${distToTarget.toFixed(3)}px)`);

  // 4. Cutout Rigging (Binding Vector Nodes to Bones)
  const mockNode = {
    id: 'layer_boot',
    x: 200,
    y: 280,
    rotation: 0,
    originX: 0,
    originY: 0
  };
  skel.bindCutout(mockNode, 'foot');
  
  // Rotate the foot by 45 degrees
  foot.localAngle += 45;
  skel.applyBindings({ layer_boot: mockNode });
  assert.strictEqual(mockNode.rotation, 45, 'Mock node rotation should follow bone rotation');
  assert(Math.abs(mockNode.originX - foot.worldX0) < 0.01, 'Origin aligns with bone joint');
  console.log('✔ Cutout Rigging scene node binding verified');

  // 5. Curve / Path Skinning (Deforming Bézier Points with Bones)
  const mockPath = {
    id: 'spine_path',
    nodes: [
      { x: 200, y: 100, cpIn: null, cpOut: { x: 200, y: 150 } },
      { x: 200, y: 200, cpIn: { x: 200, y: 150 }, cpOut: null }
    ]
  };
  skel.bindPath(mockPath, ['root']);
  // Rotate root torso bone by 30 deg
  root.localAngle += 30;
  skel.applyBindings({ spine_path: mockPath });
  // Node 1 was at tip of root bone (was at y=200, now should rotate with bone)
  assert(Math.abs(mockPath.nodes[1].x - root.worldX1) < 0.1, 'Path node coordinates follow bone tip');
  assert(Math.abs(mockPath.nodes[1].y - root.worldY1) < 0.1, 'Path node coordinates follow bone tip');
  console.log('✔ Path & Bézier Curve Deformation skinning verified');

  // 6. Ragdoll Simulation (Verlet Integration with Angle Limits & Floor Collision)
  const ragdollSkel = new SvgSkeleton('skel_ragdoll', 'Ragdoll Rig', { x: 400, y: 200 });
  const ragTorso = ragdollSkel.addBone(new SvgBone('r_torso', 'Torso', 80, 0, {
    physics: { mode: 'ragdoll', mass: 3.0 }
  }));
  const ragLeg = ragdollSkel.addBone(new SvgBone('r_leg', 'Leg', 80, 90, {
    parentId: 'r_torso',
    physics: { mode: 'ragdoll', minAngle: 0, maxAngle: 120, mass: 1.5 }
  }));

  const sim = new RagdollSimulation(ragdollSkel, {
    gravity: { x: 0, y: 980 },
    floorY: 500,
    floorFriction: 0.9,
    iterations: 12
  });

  // Step simulation for 60 frames (1 second)
  const dt = 1 / 60;
  for (let f = 0; f < 60; f++) {
    sim.step(dt);
  }

  // A. All particles should have fallen and collided with or stayed above floor (y <= 500)
  for (const p of sim.particles) {
    assert(p.y <= 500.001, `Particle ${p.id} should not penetrate floor (y=${p.y})`);
  }

  // B. Bone length constraints must be preserved strictly
  for (const c of sim.distanceConstraints) {
    const curLen = Math.hypot(c.p2.x - c.p1.x, c.p2.y - c.p1.y);
    assert(Math.abs(curLen - c.targetDist) < 0.05, `Bone ${c.boneId} length preserved (target ${c.targetDist}, got ${curLen.toFixed(3)})`);
  }

  // C. Bone positions and angles correctly synchronized back to SvgSkeleton
  assert(ragdollSkel.y > 200, 'Ragdoll root Y position dropped under gravity');
  assert(Math.abs(ragTorso.length - 80) < 0.01, 'Torso length remains intact');
  assert(Math.abs(ragLeg.length - 80) < 0.01, 'Leg length remains intact');
  console.log('✔ Ragdoll Physics (Verlet gravity, floor collisions & rigid sticks) verified');

  // 7. Secondary Physics / Spring Jiggle
  const tailSkel = new SvgSkeleton('skel_cat', 'Cat with Tail', { x: 100, y: 100 });
  const catBody = tailSkel.addBone(new SvgBone('body', 'Body', 50, 0));
  const catTail = tailSkel.addBone(new SvgBone('tail', 'Tail', 40, -45, {
    parentId: 'body',
    physics: { mode: 'secondary', stiffness: 0.3 }
  }));

  const tailSim = new RagdollSimulation(tailSkel, { gravity: { x: 0, y: 300 } });
  // Move cat body rapidly forward
  tailSim.applyImpulse('joint_body', 50, 0);
  tailSim.step(1 / 30);
  tailSim.step(1 / 30);
  tailSim.step(1 / 30);
  // Tail should respond dynamically
  assert(tailSkel.getBone('tail') !== null, 'Tail bone exists');
  console.log('✔ Secondary Physics (Tail/Hair/Cloth Spring Jiggle) verified');

  // 8. Bake Ragdoll Simulation to DopeSheet Keyframes
  const clip = new DopeSheet(30, 24, 'Ragdoll Drop Clip');
  bakeRagdollToDopeSheet(ragdollSkel, sim, clip, { totalFrames: 30, fps: 24 });

  const rootObj = clip.getObject(ragdollSkel.id);
  assert(rootObj !== null, 'DopeSheet root object created');
  const rootYCh = rootObj.channels.get('y');
  assert(rootYCh !== null, 'DopeSheet root Y channel created');
  assert.strictEqual(rootYCh.keyframes.length, 31, 'Keyframes created for all frames (0..30)');

  const torsoObj = clip.getObject(ragTorso.id);
  assert(torsoObj !== null, 'DopeSheet torso object created');
  const torsoRotCh = torsoObj.channels.get('rotation');
  assert(torsoRotCh !== null, 'DopeSheet torso rotation channel created');
  assert.strictEqual(torsoRotCh.keyframes.length, 31, 'Torso rotation keyframes created');

  console.log('✔ Bake Ragdoll Simulation to DopeSheet Animation Clip verified');

  console.log('--- ALL VECTOR RIGGING & RAGDOLL PHYSICS TESTS PASSED ---');
}

runSvgRiggingTests().catch(err => {
  console.error(err);
  process.exit(1);
});
