const assert = require('assert');
const path = require('path');

// Dynamically import ESM animator_engine.js
async function runAnimatorRuntimeTests() {
  console.log('--- Testing Flash-like Wesenho Animator Runtime & Scripting Engine ---');

  const {
    Stage,
    MovieClip,
    Graphic,
    Button,
    TimelineTrack,
    Keyframe,
    Easing,
    Matrix2D,
    exportStandaloneHTML5,
    serializeStage
  } = await import('../src/anim/animator_engine.js');

  // 1. Test Matrix2D Transformations
  const m = new Matrix2D();
  m.translate(100, 50);
  m.rotate(90);
  m.scale(2, 2);
  const pt = m.transformPoint(10, 0);
  // (10, 0) rotated 90 deg -> (0, 10), scaled 2x -> (0, 20), translated -> (100, 70)
  assert(Math.abs(pt.x - 100) < 0.001, 'Matrix translation X should be 100');
  assert(Math.abs(pt.y - 70) < 0.001, 'Matrix translation Y should be 70');
  console.log('[animator] 2D matrix transformation verified');

  // 2. Test Stage & Display Object Hierarchy
  const stage = new Stage(800, 600, 30);
  const logs = [];
  stage.onTraceCallback = (msg) => logs.push(msg);

  const hero = new MovieClip('hero');
  hero.x = 200;
  hero.y = 150;
  stage.addChild(hero);

  assert.strictEqual(hero.parent, stage, 'Hero parent should be stage');
  assert.strictEqual(stage.getChildByName('hero'), hero, 'getChildByName should find hero');

  // 3. Test Object Script Attachment (ActionScript style)
  hero.attachScript(`
    module.exports = {
      onLoad() {
        this.speed = 10;
        this.score = 0;
        this.stageRef.trace("Hero initialized! speed=" + this.speed);
      },
      onEnterFrame(dt) {
        this.x += this.speed;
        this.score += 1;
      },
      onClick() {
        this.speed *= 2;
      }
    };
  `);

  // Manually trigger onLoad if attached after adding to stage
  hero.scripts.onLoad.call(hero);
  assert(logs.some(l => l.includes('Hero initialized! speed=10')), 'trace log should contain onLoad output');
  assert.strictEqual(hero.speed, 10, 'hero speed property should be 10');

  // Step game loop / tick
  stage.advanceTimeline(1 / 30);
  assert.strictEqual(hero.x, 210, 'hero x should advance to 210');
  assert.strictEqual(hero.score, 1, 'hero score should advance to 1');

  stage.advanceTimeline(1 / 30);
  assert.strictEqual(hero.x, 220, 'hero x should advance to 220');
  console.log('[animator] ActionScript-style object scripts & onEnterFrame loop verified');

  // 4. Test Timeline Tracks & Keyframe Tweening
  const animClip = new MovieClip('animClip');
  animClip.totalFrames = 60;
  animClip.fps = 30;

  const track = animClip.addTrack('MotionLayer', 'vector');
  const kf0 = new Keyframe(1, 29, 'easeInOutQuad');
  kf0.x = 0;
  kf0.y = 0;
  kf0.scaleX = 1;
  kf0.rotation = 0;
  track.addKeyframe(kf0);

  const kf1 = new Keyframe(30, 30, 'linear');
  kf1.x = 300;
  kf1.y = 150;
  kf1.scaleX = 2;
  kf1.rotation = 180;
  track.addKeyframe(kf1);

  // Interpolate at frame 15 (halfway between 1 and 30)
  const tfMid = track.interpolateTransform(15);
  console.log(`[animator] Frame 15 Tween Transform: x=${tfMid.x.toFixed(1)}, y=${tfMid.y.toFixed(1)}, rot=${tfMid.rotation.toFixed(1)}`);
  assert(tfMid.x > 0 && tfMid.x < 300, 'Interpolated X should be between 0 and 300');
  assert(tfMid.rotation > 0 && tfMid.rotation < 180, 'Interpolated rotation should be between 0 and 180');

  // 5. Test Frame Actions (stop, gotoAndPlay)
  animClip.addFrameLabel('jumpStart', 10);
  animClip.addFrameLabel('jumpPeak', 25);
  animClip.addFrameLabel('endScene', 60);

  let frameActionExecuted = false;
  animClip.setFrameScript(25, function(stage, trace, stop, play, gotoAndPlay) {
    frameActionExecuted = true;
    trace("Hit frame 25 action: stopping timeline!");
    stop();
  });

  animClip.gotoAndPlay('jumpStart');
  assert.strictEqual(animClip.currentFrame, 10, 'currentFrame should be 10');
  assert.strictEqual(animClip.isPlaying, true, 'animClip should be playing');

  // Advance 15 frames -> reaches frame 25
  for (let f = 10; f < 25; f++) {
    animClip.advanceTimeline(1 / 30);
  }
  assert.strictEqual(animClip.currentFrame, 25, 'currentFrame should be 25');
  assert.strictEqual(frameActionExecuted, true, 'frame action at frame 25 should have executed');
  assert.strictEqual(animClip.isPlaying, false, 'timeline should be stopped by frame action');
  console.log('[animator] Frame Actions (gotoAndPlay, stop, labels) verified');

  // 6. Test Button Symbol State Machine
  const btn = new Button('myBtn');
  btn.width = 100;
  btn.height = 40;
  let clickCount = 0;
  btn.scripts.onClick = () => { clickCount++; };

  assert.strictEqual(btn.currentFrame, 1, 'Button should start in Up state (frame 1)');
  btn.onPointerEnter();
  assert.strictEqual(btn.currentFrame, 2, 'Button should transition to Over state (frame 2)');
  btn.onPointerDown();
  assert.strictEqual(btn.currentFrame, 3, 'Button should transition to Down state (frame 3)');
  btn.onPointerUp();
  assert.strictEqual(clickCount, 1, 'Button onClick should fire');
  btn.onPointerLeave();
  assert.strictEqual(btn.currentFrame, 1, 'Button should return to Up state');
  console.log('[animator] Button Symbol states (Up, Over, Down, Hit) verified');

  // 7. Test Standalone HTML5 Export Serialization
  stage.addChild(animClip);
  stage.addChild(btn);
  const serialized = serializeStage(stage);
  assert.strictEqual(serialized.width, 800, 'Serialized width should be 800');
  assert.strictEqual(serialized.children.length, 3, 'Stage should have 3 children');

  const htmlBundle = exportStandaloneHTML5(stage, 'My Epic Cartoon');
  assert(htmlBundle.includes('<!DOCTYPE html>'), 'HTML bundle should be valid HTML5');
  assert(htmlBundle.includes('My Epic Cartoon'), 'HTML bundle should contain title');
  console.log('[animator] Standalone HTML5 bundle export verified');

  console.log('--- ALL ANIMATOR ENGINE & ACTIONSCRIPT TESTS PASSED ---');
}

runAnimatorRuntimeTests().catch(err => {
  console.error('Animator Runtime test failed:', err);
  process.exit(1);
});
