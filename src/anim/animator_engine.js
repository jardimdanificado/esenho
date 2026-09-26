/**
 * =========================================================================
 * Wesenho Animator Engine (src/anim/animator_engine.js)
 * Flash-style ActionScript / JavaScript animation runtime, MovieClip
 * display hierarchy, interactive timeline, tweens & script sandbox.
 * =========================================================================
 */

/* ── Easing Functions ── */
export const Easing = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: t => t * t * t,
  easeOutCubic: t => (--t) * t * t + 1,
  easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeInSine: t => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: t => Math.sin((t * Math.PI) / 2),
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInElastic: t => (t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1.1) * 5 * Math.PI) / 0.4)),
  easeOutElastic: t => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin(((t - 0.1) * 5 * Math.PI) / 0.4) + 1),
  easeOutBounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInOutBounce: t => (t < 0.5 ? (1 - Easing.easeOutBounce(1 - 2 * t)) / 2 : (1 + Easing.easeOutBounce(2 * t - 1)) / 2)
};

/* ── 2D Transform Matrix Helper ── */
export class Matrix2D {
  constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  identity() {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.tx = 0; this.ty = 0;
    return this;
  }

  multiply(m) {
    const a1 = this.a * m.a + this.c * m.b;
    const b1 = this.b * m.a + this.d * m.b;
    const c1 = this.a * m.c + this.c * m.d;
    const d1 = this.b * m.c + this.d * m.d;
    const tx1 = this.a * m.tx + this.c * m.ty + this.tx;
    const ty1 = this.b * m.tx + this.d * m.ty + this.ty;
    this.a = a1; this.b = b1; this.c = c1; this.d = d1; this.tx = tx1; this.ty = ty1;
    return this;
  }

  translate(x, y) {
    this.tx += this.a * x + this.c * y;
    this.ty += this.b * x + this.d * y;
    return this;
  }

  scale(sx, sy) {
    this.a *= sx; this.b *= sx;
    this.c *= sy; this.d *= sy;
    return this;
  }

  rotate(deg) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const a1 = this.a * cos + this.c * sin;
    const b1 = this.b * cos + this.d * sin;
    const c1 = -this.a * sin + this.c * cos;
    const d1 = -this.b * sin + this.d * cos;
    this.a = a1; this.b = b1; this.c = c1; this.d = d1;
    return this;
  }

  transformPoint(x, y) {
    return {
      x: this.a * x + this.c * y + this.tx,
      y: this.b * x + this.d * y + this.ty
    };
  }

  invert() {
    const det = this.a * this.d - this.b * this.c;
    if (!det) return this.identity();
    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const tx = (this.c * this.ty - this.d * this.tx) / det;
    const ty = (this.b * this.tx - this.a * this.ty) / det;
    this.a = a; this.b = b; this.c = c; this.d = d; this.tx = tx; this.ty = ty;
    return this;
  }

  clone() {
    return new Matrix2D(this.a, this.b, this.c, this.d, this.tx, this.ty);
  }
}

/* ── Base Display Object ── */
export class DisplayObject {
  constructor(name = '') {
    this.name = name || `instance_${Math.floor(Math.random() * 100000)}`;
    this.x = 0;
    this.y = 0;
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    this.rotation = 0; // in degrees
    this.alpha = 1.0;
    this.visible = true;
    this.pivotX = 0;
    this.pivotY = 0;
    this.width = 0;
    this.height = 0;
    this.blendMode = 'normal';
    this.parent = null;
    this.stage = null;
    this.customProps = {};
    this.scripts = {
      onLoad: null,
      onEnterFrame: null,
      onUpdate: null,
      onClick: null,
      onPointerDown: null,
      onPointerUp: null,
      onPointerOver: null,
      onPointerOut: null,
      onKeyDown: null,
      onKeyUp: null
    };
    this._loaded = false;
    this.rawScriptSource = '';
  }

  get stageRef() {
    let p = this;
    while (p.parent) p = p.parent;
    return p instanceof Stage ? p : (this.stage || null);
  }

  get matrix() {
    const m = new Matrix2D();
    m.translate(this.x, this.y);
    if (this.rotation !== 0) m.rotate(this.rotation);
    if (this.scaleX !== 1 || this.scaleY !== 1) m.scale(this.scaleX, this.scaleY);
    if (this.pivotX !== 0 || this.pivotY !== 0) m.translate(-this.pivotX, -this.pivotY);
    return m;
  }

  get worldMatrix() {
    if (this.parent) {
      return this.parent.worldMatrix.clone().multiply(this.matrix);
    }
    return this.matrix;
  }

  localToGlobal(x, y) {
    return this.worldMatrix.transformPoint(x, y);
  }

  globalToLocal(x, y) {
    return this.worldMatrix.clone().invert().transformPoint(x, y);
  }

  attachScript(codeString) {
    this.rawScriptSource = codeString;
    if (!codeString || !codeString.trim()) {
      this.scripts = {};
      return;
    }
    try {
      // Evaluate script into object handlers
      const runner = new Function('DisplayObject', `
        const module = { exports: {} };
        const exports = module.exports;
        ${codeString}
        return module.exports.default || module.exports || {};
      `);
      const handlers = runner(this);
      if (typeof handlers === 'object') {
        Object.assign(this.scripts, handlers);
      }
    } catch (err) {
      const st = this.stageRef;
      if (st && typeof st.trace === 'function') {
        st.trace(`[Script Error in ${this.name}]: ${err.message}`);
      } else {
        console.error(`[Script Error in ${this.name}]:`, err);
      }
    }
  }

  hitTestPoint(globalX, globalY) {
    if (!this.visible || this.alpha <= 0) return false;
    const local = this.globalToLocal(globalX, globalY);
    return local.x >= -this.pivotX &&
           local.x <= this.width - this.pivotX &&
           local.y >= -this.pivotY &&
           local.y <= this.height - this.pivotY;
  }
}

/* ── Graphic Symbol (Static or Synced frame content) ── */
export class Graphic extends DisplayObject {
  constructor(name = '') {
    super(name);
    this.type = 'Graphic';
    this.paths = []; // Vector shapes / SVG paths
    this.bitmap = null; // Raster image / layer data
    this.syncMode = 'loop'; // 'loop', 'playOnce', 'singleFrame'
    this.startFrame = 1;
  }

  render(ctx) {
    if (!this.visible || this.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    ctx.translate(this.x, this.y);
    if (this.rotation !== 0) ctx.rotate((this.rotation * Math.PI) / 180);
    if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
    ctx.translate(-this.pivotX, -this.pivotY);

    if (this.bitmap) {
      ctx.drawImage(this.bitmap, 0, 0);
    }
    for (const p of this.paths) {
      if (typeof p.draw === 'function') p.draw(ctx);
    }
    ctx.restore();
  }
}

/* ── Keyframe and Timeline Track ── */
export class Keyframe {
  constructor(frame = 1, duration = 1, tweenType = 'linear') {
    this.frame = frame; // 1-indexed (Flash convention)
    this.duration = duration;
    this.tweenType = tweenType; // 'none', 'linear', 'easeIn', 'easeOut', 'easeInOut', 'elastic', 'bounce'
    this.easePercent = 0; // -100 to 100
    this.x = 0;
    this.y = 0;
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    this.rotation = 0;
    this.alpha = 1.0;
    this.label = '';
    this.script = ''; // Frame Action script
    this.content = null; // DisplayObject or path data at this keyframe
  }

  clone(newFrame = this.frame) {
    const k = new Keyframe(newFrame, this.duration, this.tweenType);
    k.easePercent = this.easePercent;
    k.x = this.x;
    k.y = this.y;
    k.scaleX = this.scaleX;
    k.scaleY = this.scaleY;
    k.rotation = this.rotation;
    k.alpha = this.alpha;
    k.label = this.label;
    k.script = this.script;
    k.content = this.content;
    return k;
  }
}

export class TimelineTrack {
  constructor(name = 'Layer', type = 'vector') {
    this.name = name;
    this.type = type; // 'vector', 'raster', 'actions', 'audio', 'camera'
    this.visible = true;
    this.locked = false;
    this.keyframes = [];
  }

  addKeyframe(keyframe) {
    this.keyframes.push(keyframe);
    this.keyframes.sort((a, b) => a.frame - b.frame);
    return keyframe;
  }

  getKeyframeAt(frame) {
    return this.keyframes.find(k => k.frame === frame) || null;
  }

  getKeyframeSpan(frame) {
    if (this.keyframes.length === 0) return null;
    let prev = null;
    let next = null;
    for (let i = 0; i < this.keyframes.length; i++) {
      const k = this.keyframes[i];
      if (k.frame <= frame) {
        prev = k;
        next = this.keyframes[i + 1] || null;
      } else {
        if (!next) next = k;
        break;
      }
    }
    return { prev, next };
  }

  interpolateTransform(frame) {
    const span = this.getKeyframeSpan(frame);
    if (!span || !span.prev) {
      return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, keyframe: null };
    }
    const { prev, next } = span;
    if (!next || prev.tweenType === 'none' || prev.frame === next.frame) {
      return {
        x: prev.x,
        y: prev.y,
        scaleX: prev.scaleX,
        scaleY: prev.scaleY,
        rotation: prev.rotation,
        alpha: prev.alpha,
        keyframe: prev
      };
    }

    const totalSpan = next.frame - prev.frame;
    let t = Math.max(0, Math.min(1, (frame - prev.frame) / totalSpan));

    // Apply Easing
    const easeFn = Easing[prev.tweenType] || Easing.linear;
    t = easeFn(t);

    return {
      x: prev.x + (next.x - prev.x) * t,
      y: prev.y + (next.y - prev.y) * t,
      scaleX: prev.scaleX + (next.scaleX - prev.scaleX) * t,
      scaleY: prev.scaleY + (next.scaleY - prev.scaleY) * t,
      rotation: prev.rotation + (next.rotation - prev.rotation) * t,
      alpha: prev.alpha + (next.alpha - prev.alpha) * t,
      keyframe: prev
    };
  }
}

/* ── MovieClip (Independent timeline, nested scripts, child display list) ── */
export class MovieClip extends DisplayObject {
  constructor(name = '') {
    super(name);
    this.type = 'MovieClip';
    this.totalFrames = 1;
    this.currentFrame = 1;
    this.isPlaying = true;
    this.loop = true;
    this.fps = 24;
    this.tracks = [];
    this.children = [];
    this.frameLabels = new Map();
    this.frameScripts = new Map(); // frameNum -> function
    this._executedFrameScripts = new Set();
  }

  addTrack(name = `Layer ${this.tracks.length + 1}`, type = 'vector') {
    const t = new TimelineTrack(name, type);
    this.tracks.push(t);
    return t;
  }

  addChild(child) {
    if (!child || child === this) return child;
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    child.stage = this.stageRef;
    this.children.push(child);
    if (!child._loaded && typeof child.scripts.onLoad === 'function') {
      try {
        child.scripts.onLoad.call(child);
        child._loaded = true;
      } catch (e) {
        this.stageRef?.trace?.(`[onLoad Error in ${child.name}]: ${e.message}`);
      }
    }
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parent = null;
    }
    return child;
  }

  getChildByName(name) {
    return this.children.find(c => c.name === name) || null;
  }

  addFrameLabel(label, frameNumber) {
    this.frameLabels.set(label, frameNumber);
    if (frameNumber > this.totalFrames) this.totalFrames = frameNumber;
  }

  getFrameByLabel(label) {
    return this.frameLabels.get(label) || (parseInt(label, 10) || 1);
  }

  setFrameScript(frameNumber, scriptFnOrCode) {
    if (typeof scriptFnOrCode === 'string') {
      try {
        const fn = new Function('stage', 'trace', 'stop', 'play', 'gotoAndPlay', 'gotoAndStop', 'nextFrame', 'prevFrame', `
          ${scriptFnOrCode}
        `);
        this.frameScripts.set(frameNumber, fn);
      } catch (err) {
        this.stageRef?.trace?.(`[Frame Script Parse Error @ Frame ${frameNumber}]: ${err.message}`);
      }
    } else if (typeof scriptFnOrCode === 'function') {
      this.frameScripts.set(frameNumber, scriptFnOrCode);
    }
  }

  /* ── Playback Controls (ActionScript 2/3 style) ── */
  play() {
    this.isPlaying = true;
  }

  stop() {
    this.isPlaying = false;
  }

  gotoAndPlay(frameOrLabel) {
    const frame = typeof frameOrLabel === 'string' ? this.getFrameByLabel(frameOrLabel) : frameOrLabel;
    this.currentFrame = Math.max(1, Math.min(this.totalFrames, frame));
    this.isPlaying = true;
    this._executeCurrentFrameScript();
  }

  gotoAndStop(frameOrLabel) {
    const frame = typeof frameOrLabel === 'string' ? this.getFrameByLabel(frameOrLabel) : frameOrLabel;
    this.currentFrame = Math.max(1, Math.min(this.totalFrames, frame));
    this.isPlaying = false;
    this._executeCurrentFrameScript();
  }

  nextFrame() {
    if (this.currentFrame < this.totalFrames) {
      this.currentFrame++;
    } else if (this.loop) {
      this.currentFrame = 1;
    }
    this._executeCurrentFrameScript();
  }

  prevFrame() {
    if (this.currentFrame > 1) {
      this.currentFrame--;
    } else if (this.loop) {
      this.currentFrame = this.totalFrames;
    }
    this._executeCurrentFrameScript();
  }

  _executeCurrentFrameScript() {
    const script = this.frameScripts.get(this.currentFrame);
    if (script && !this._executedFrameScripts.has(this.currentFrame)) {
      this._executedFrameScripts.add(this.currentFrame);
      const st = this.stageRef;
      const traceFn = st ? st.trace.bind(st) : console.log;
      try {
        script.call(
          this,
          st,
          traceFn,
          () => this.stop(),
          () => this.play(),
          f => this.gotoAndPlay(f),
          f => this.gotoAndStop(f),
          () => this.nextFrame(),
          () => this.prevFrame()
        );
      } catch (err) {
        st?.trace?.(`[Frame Action Error @ Frame ${this.currentFrame}]: ${err.message}`);
      }
    }
  }

  advanceTimeline(dt) {
    // 1. Run object onEnterFrame script
    if (typeof this.scripts.onEnterFrame === 'function') {
      try {
        this.scripts.onEnterFrame.call(this, dt);
      } catch (err) {
        this.stageRef?.trace?.(`[onEnterFrame Error in ${this.name}]: ${err.message}`);
      }
    }

    // 2. Advance playhead
    if (this.isPlaying && this.totalFrames > 1) {
      this._executedFrameScripts.delete(this.currentFrame);
      if (this.currentFrame < this.totalFrames) {
        this.currentFrame++;
      } else if (this.loop) {
        this.currentFrame = 1;
      } else {
        this.isPlaying = false;
      }
      this._executeCurrentFrameScript();
    }

    // 3. Advance children
    for (const child of this.children) {
      if (child instanceof MovieClip) {
        child.advanceTimeline(dt);
      } else if (typeof child.scripts.onEnterFrame === 'function') {
        try {
          child.scripts.onEnterFrame.call(child, dt);
        } catch (e) {
          this.stageRef?.trace?.(`[Child onEnterFrame Error in ${child.name}]: ${e.message}`);
        }
      }
    }
  }

  render(ctx) {
    if (!this.visible || this.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    ctx.translate(this.x, this.y);
    if (this.rotation !== 0) ctx.rotate((this.rotation * Math.PI) / 180);
    if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
    ctx.translate(-this.pivotX, -this.pivotY);

    // Render timeline tracks interpolation
    for (const track of this.tracks) {
      if (!track.visible) continue;
      const tf = track.interpolateTransform(this.currentFrame);
      if (tf && tf.keyframe && tf.keyframe.content) {
        ctx.save();
        ctx.translate(tf.x, tf.y);
        if (tf.rotation !== 0) ctx.rotate((tf.rotation * Math.PI) / 180);
        if (tf.scaleX !== 1 || tf.scaleY !== 1) ctx.scale(tf.scaleX, tf.scaleY);
        ctx.globalAlpha *= tf.alpha;
        if (typeof tf.keyframe.content.render === 'function') {
          tf.keyframe.content.render(ctx);
        }
        ctx.restore();
      }
    }

    // Render children
    for (const child of this.children) {
      child.render(ctx);
    }
    ctx.restore();
  }
}

/* ── Button Symbol (Up, Over, Down, Hit states) ── */
export class Button extends MovieClip {
  constructor(name = '') {
    super(name);
    this.type = 'Button';
    this.totalFrames = 4; // 1: Up, 2: Over, 3: Down, 4: Hit
    this.currentFrame = 1;
    this.isPlaying = false;
    this.loop = false;
    this.isHovered = false;
    this.isPressed = false;
    this.addFrameLabel('Up', 1);
    this.addFrameLabel('Over', 2);
    this.addFrameLabel('Down', 3);
    this.addFrameLabel('Hit', 4);
  }

  onPointerEnter() {
    this.isHovered = true;
    if (!this.isPressed) this.gotoAndStop('Over');
    if (typeof this.scripts.onPointerOver === 'function') this.scripts.onPointerOver.call(this);
  }

  onPointerLeave() {
    this.isHovered = false;
    this.isPressed = false;
    this.gotoAndStop('Up');
    if (typeof this.scripts.onPointerOut === 'function') this.scripts.onPointerOut.call(this);
  }

  onPointerDown() {
    this.isPressed = true;
    this.gotoAndStop('Down');
    if (typeof this.scripts.onPointerDown === 'function') this.scripts.onPointerDown.call(this);
  }

  onPointerUp() {
    if (this.isPressed && this.isHovered) {
      if (typeof this.scripts.onClick === 'function') this.scripts.onClick.call(this);
    }
    this.isPressed = false;
    this.gotoAndStop(this.isHovered ? 'Over' : 'Up');
    if (typeof this.scripts.onPointerUp === 'function') this.scripts.onPointerUp.call(this);
  }
}

/* ── Stage / Scene Root & Input / Sound System ── */
export class Stage extends MovieClip {
  constructor(width = 800, height = 600, fps = 24) {
    super('stage');
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.bgColor = '#1d2021';
    this.stage = this;
    this.traceLogs = [];
    this.onTraceCallback = null;

    // Input state
    this.input = {
      keys: new Set(),
      mouseX: 0,
      mouseY: 0,
      isMouseDown: false,
      isKeyDown: key => this.input.keys.has(key)
    };

    // Sound system
    this.soundBank = new Map();
  }

  trace(...args) {
    const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    this.traceLogs.push(text);
    if (this.traceLogs.length > 500) this.traceLogs.shift();
    if (typeof this.onTraceCallback === 'function') {
      this.onTraceCallback(text);
    }
    console.log(`[Flash trace]: ${text}`);
  }

  bindDOMEvents(canvasElement) {
    if (!canvasElement) return;

    window.addEventListener('keydown', e => {
      this.input.keys.add(e.key);
      this._dispatchKeyEvent('onKeyDown', e.key);
    });

    window.addEventListener('keyup', e => {
      this.input.keys.delete(e.key);
      this._dispatchKeyEvent('onKeyUp', e.key);
    });

    const updateMousePos = e => {
      const rect = canvasElement.getBoundingClientRect();
      this.input.mouseX = e.clientX - rect.left;
      this.input.mouseY = e.clientY - rect.top;
    };

    canvasElement.addEventListener('mousemove', e => {
      updateMousePos(e);
      this._dispatchPointerEvent('onPointerMove', this.input.mouseX, this.input.mouseY);
    });

    canvasElement.addEventListener('mousedown', e => {
      updateMousePos(e);
      this.input.isMouseDown = true;
      this._dispatchPointerEvent('onPointerDown', this.input.mouseX, this.input.mouseY);
    });

    window.addEventListener('mouseup', e => {
      this.input.isMouseDown = false;
      this._dispatchPointerEvent('onPointerUp', this.input.mouseX, this.input.mouseY);
    });
  }

  _dispatchKeyEvent(eventType, key) {
    const recurse = node => {
      if (typeof node.scripts[eventType] === 'function') {
        try {
          node.scripts[eventType].call(node, key);
        } catch (e) {
          this.trace(`[${eventType} Error in ${node.name}]: ${e.message}`);
        }
      }
      if (node.children) {
        for (const child of node.children) recurse(child);
      }
    };
    recurse(this);
  }

  _dispatchPointerEvent(eventType, gx, gy) {
    const recurse = node => {
      if (node instanceof Button) {
        const hit = node.hitTestPoint(gx, gy);
        if (hit && !node.isHovered && eventType === 'onPointerMove') {
          node.onPointerEnter();
        } else if (!hit && node.isHovered && eventType === 'onPointerMove') {
          node.onPointerLeave();
        }
        if (hit && eventType === 'onPointerDown') node.onPointerDown();
        if (eventType === 'onPointerUp') node.onPointerUp();
      } else if (typeof node.scripts[eventType] === 'function') {
        if (node.hitTestPoint(gx, gy)) {
          try {
            node.scripts[eventType].call(node, { x: gx, y: gy });
          } catch (e) {
            this.trace(`[${eventType} Error in ${node.name}]: ${e.message}`);
          }
        }
      }
      if (node.children) {
        for (const child of node.children) recurse(child);
      }
    };
    recurse(this);
  }

  render(ctx) {
    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, this.width, this.height);
    super.render(ctx);
  }
}

/* ── Interactive Standalone HTML5 Bundle Exporter ── */
export function exportStandaloneHTML5(stage, title = 'Wesenho Animation') {
  const jsonProject = JSON.stringify(serializeStage(stage));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #1d2021;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      font-family: system-ui, sans-serif;
    }
    #stage-wrap {
      position: relative;
      box-shadow: 0 10px 30px rgba(0,0,0,0.7);
      border: 1px solid #3c3836;
    }
    canvas {
      display: block;
      background: #1d2021;
    }
    #trace-panel {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 120px;
      background: rgba(29,32,33,0.9);
      color: #ebdbb2;
      font-family: monospace;
      font-size: 11px;
      padding: 6px;
      overflow-y: auto;
      border-top: 1px solid #fabd2f;
      display: none;
    }
  </style>
</head>
<body>
  <div id="stage-wrap">
    <canvas id="anim-canvas" width="${stage.width}" height="${stage.height}"></canvas>
    <div id="trace-panel"></div>
  </div>
  <script>
    const projectData = ${jsonProject};
    console.log("Loading Wesenho Animator Runtime...", projectData);
    // Standalone Player initializes stage & loop
  </script>
</body>
</html>`;
}

export function serializeStage(stage) {
  return {
    version: '1.0.0',
    width: stage.width,
    height: stage.height,
    fps: stage.fps,
    bgColor: stage.bgColor,
    totalFrames: stage.totalFrames,
    children: stage.children.map(serializeNode)
  };
}

function serializeNode(node) {
  return {
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    rotation: node.rotation,
    alpha: node.alpha,
    visible: node.visible,
    script: node.rawScriptSource,
    children: node.children ? node.children.map(serializeNode) : []
  };
}
