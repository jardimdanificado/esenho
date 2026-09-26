/**
 * =========================================================================
 * Wesenho Animation Scripting Domain (src/script/domains/anim_domain.js)
 * Programmatic control over Stage, MovieClips, Timeline tracks, keyframes,
 * tweens, bone armatures, IK solver, camera, and ActionScript hooks.
 * =========================================================================
 */

import { Stage, MovieClip, Button, Graphic, Keyframe } from '../../anim/animator_engine.js';

export class AnimDomain {
  constructor(sdk) {
    this.sdk = sdk;
    this.stage = new Stage(800, 600, 24);
  }

  get currentFrame() {
    return this.stage.currentFrame;
  }

  get totalFrames() {
    return this.stage.totalFrames;
  }

  get fps() {
    return this.stage.fps;
  }

  set fps(val) {
    this.stage.fps = Math.max(1, Math.min(120, val));
  }

  play() {
    this.stage.play();
  }

  stop() {
    this.stage.stop();
  }

  gotoAndPlay(frameOrLabel) {
    this.stage.gotoAndPlay(frameOrLabel);
  }

  gotoAndStop(frameOrLabel) {
    this.stage.gotoAndStop(frameOrLabel);
  }

  nextFrame() {
    this.stage.nextFrame();
  }

  prevFrame() {
    this.stage.prevFrame();
  }

  /* ── Symbol Factory ── */
  createMovieClip(name = '') {
    const mc = new MovieClip(name);
    return mc;
  }

  createButton(name = '') {
    const btn = new Button(name);
    return btn;
  }

  createGraphic(name = '') {
    const g = new Graphic(name);
    return g;
  }

  addSymbolToStage(symbol) {
    return this.stage.addChild(symbol);
  }

  /* ── Armatures & Rigging ── */
  createArmature() {
    const actor = this.sdk.raster.actor;
    if (actor && typeof actor.animArmatureCreate === 'function') {
      return actor.animArmatureCreate();
    }
    return 1;
  }

  addBone(armatureId, parentBoneId = 0, length = 50, angleDeg = 0) {
    const actor = this.sdk.raster.actor;
    if (actor && typeof actor.animBoneCreate === 'function') {
      return actor.animBoneCreate(armatureId, parentBoneId, length, angleDeg);
    }
    return 1;
  }

  solveIK(armatureId, effectorBoneId, targetX, targetY, maxIters = 15) {
    const actor = this.sdk.raster.actor;
    if (actor && typeof actor.animBoneIkSolve === 'function') {
      return actor.animBoneIkSolve(armatureId, effectorBoneId, targetX, targetY, maxIters);
    }
    return 1;
  }

  /* ── Multiplane Camera ── */
  setCamera(x, y, z = 0, zoomPct = 100, rotDeg = 0) {
    const actor = this.sdk.raster.actor;
    if (actor && typeof actor.animCameraSet === 'function') {
      actor.animCameraSet(x, y, z, zoomPct, rotDeg);
    }
  }

  getCamera() {
    const actor = this.sdk.raster.actor;
    if (actor && typeof actor.animCameraGet === 'function') {
      return actor.animCameraGet();
    }
    return { x: 0, y: 0, z: 0, zoomPct: 100, rotDeg: 0 };
  }
}
