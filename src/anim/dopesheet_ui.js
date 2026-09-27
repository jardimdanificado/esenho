/**
 * =========================================================================
 * Wesenho DopeSheet UI Widget (src/anim/dopesheet_ui.js)
 * Interactive Bottom Dock for Frame Scrubbing, Playback, and Keyframing
 * across all Quadro engine parameters.
 * =========================================================================
 */

import { PARAMETER_REGISTRY } from './dopesheet.js';

export class DopeSheetUI {
  constructor(containerEl, dopeSheet, onFrameChange = null) {
    this.container = containerEl;
    this.ds = dopeSheet;
    this.onFrameChange = onFrameChange;
    this.frameWidth = 14; // pixels per frame on timeline ruler
    this.selectedObjectId = null;
    this.isScrubbing = false;
    this._playInterval = null;

    this.render();
    this.ds.subscribe((event, payload) => {
      if (event === 'frameChanged') {
        this.updatePlayhead();
        if (this.onFrameChange) this.onFrameChange(this.ds.currentFrame, this.ds.sampleAll(this.ds.currentFrame));
      } else if (event === 'playStateChanged') {
        this.updatePlayButton();
      } else {
        this.updateGrid();
      }
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="dopesheet-panel" style="display: flex; flex-direction: column; height: 100%; width: 100%; background: #1d2021; color: #ebdbb2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; font-size: 11px; border-top: 2px solid #3c3836; user-select: none; box-sizing: border-box;">
        
        <!-- Header Toolbar -->
        <div class="ds-toolbar" style="display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: #282828; border-bottom: 1px solid #3c3836; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <button id="ds-btn-prev" class="ds-btn" title="Previous Frame (Left Arrow)" style="background: #3c3836; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; cursor: pointer;">⏮</button>
            <button id="ds-btn-play" class="ds-btn" title="Play / Pause (Space)" style="background: #d79921; color: #282828; font-weight: bold; border: 1px solid #fabd2f; border-radius: 4px; padding: 3px 12px; cursor: pointer;">▶</button>
            <button id="ds-btn-next" class="ds-btn" title="Next Frame (Right Arrow)" style="background: #3c3836; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; cursor: pointer;">⏭</button>
            <button id="ds-btn-loop" class="ds-btn" title="Toggle Loop" style="background: ${this.ds.loop ? '#458588' : '#3c3836'}; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; cursor: pointer;">🔁</button>
          </div>

          <div style="height: 16px; width: 1px; background: #504945; margin: 0 4px;"></div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <span>Frame:</span>
            <input id="ds-input-frame" type="number" min="1" max="${this.ds.totalFrames}" value="${this.ds.currentFrame}" style="width: 48px; background: #1d2021; color: #fabd2f; border: 1px solid #504945; border-radius: 3px; padding: 2px 4px; text-align: center; font-weight: bold;">
            <span style="color: #928374;">/</span>
            <input id="ds-input-total" type="number" min="1" max="9999" value="${this.ds.totalFrames}" style="width: 48px; background: #1d2021; color: #ebdbb2; border: 1px solid #504945; border-radius: 3px; padding: 2px 4px; text-align: center;">
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <span>FPS:</span>
            <select id="ds-select-fps" style="background: #1d2021; color: #ebdbb2; border: 1px solid #504945; border-radius: 3px; padding: 2px;">
              <option value="12" ${this.ds.fps === 12 ? 'selected' : ''}>12</option>
              <option value="24" ${this.ds.fps === 24 ? 'selected' : ''}>24</option>
              <option value="30" ${this.ds.fps === 30 ? 'selected' : ''}>30</option>
              <option value="60" ${this.ds.fps === 60 ? 'selected' : ''}>60</option>
            </select>
          </div>

          <div style="height: 16px; width: 1px; background: #504945; margin: 0 4px;"></div>

          <button id="ds-btn-add-kf" class="ds-btn" title="Add Keyframe at Current Frame" style="background: #b8bb26; color: #282828; font-weight: bold; border: 1px solid #b8bb26; border-radius: 4px; padding: 3px 8px; cursor: pointer;">◆ Add Keyframe</button>
          <button id="ds-btn-del-kf" class="ds-btn" title="Remove Keyframe" style="background: #ea6962; color: #282828; font-weight: bold; border: 1px solid #ea6962; border-radius: 4px; padding: 3px 8px; cursor: pointer;">◇ Remove</button>
          
          <label style="display: flex; align-items: center; gap: 4px; margin-left: auto; cursor: pointer; color: #d3869b;">
            <input type="checkbox" id="ds-check-autokf" ${this.ds.autoKeyframe ? 'checked' : ''}> Auto-Keyframe
          </label>
        </div>

        <!-- Main Body: Split View (Channel Tree on Left, Timeline Grid on Right) -->
        <div style="display: flex; flex: 1; min-height: 0; position: relative; overflow: hidden;">
          
          <!-- Left: Channels Tree Sidebar -->
          <div id="ds-tree-sidebar" style="width: 220px; min-width: 180px; max-width: 320px; background: #282828; border-right: 1px solid #3c3836; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column;">
            <!-- Tree Header -->
            <div style="height: 24px; padding: 4px 8px; background: #32302f; border-bottom: 1px solid #3c3836; font-weight: bold; color: #a89984; display: flex; align-items: center;">
              Layers & Channels
            </div>
            <!-- Tree Rows Container -->
            <div id="ds-tree-rows" style="flex: 1;"></div>
          </div>

          <!-- Right: Timeline Grid & Ruler Scrollable View -->
          <div id="ds-timeline-scroll" style="flex: 1; overflow: auto; position: relative; background: #1d2021;">
            
            <!-- Timeline Ruler (Top Sticky) -->
            <div id="ds-ruler-container" style="position: sticky; top: 0; left: 0; height: 24px; background: #32302f; border-bottom: 1px solid #3c3836; z-index: 10; cursor: pointer;">
              <canvas id="ds-ruler-canvas" style="display: block; height: 24px;"></canvas>
            </div>

            <!-- Grid Keyframe Rows -->
            <div id="ds-grid-rows" style="position: relative;">
              <canvas id="ds-grid-canvas" style="display: block;"></canvas>
            </div>

            <!-- Playhead Vertical Bar -->
            <div id="ds-playhead" style="position: absolute; top: 0; bottom: 0; width: 2px; background: #fb4934; z-index: 20; pointer-events: none; left: 0;">
              <div style="position: absolute; top: 0; left: -5px; width: 12px; height: 14px; background: #fb4934; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%);"></div>
            </div>

          </div>

        </div>

      </div>
    `;

    this.bindEvents();
    this.updateGrid();
    this.updatePlayhead();
  }

  bindEvents() {
    const playBtn = this.container.querySelector('#ds-btn-play');
    const prevBtn = this.container.querySelector('#ds-btn-prev');
    const nextBtn = this.container.querySelector('#ds-btn-next');
    const loopBtn = this.container.querySelector('#ds-btn-loop');
    const frameInput = this.container.querySelector('#ds-input-frame');
    const totalInput = this.container.querySelector('#ds-input-total');
    const fpsSelect = this.container.querySelector('#ds-select-fps');
    const autoKfCheck = this.container.querySelector('#ds-check-autokf');
    const addKfBtn = this.container.querySelector('#ds-btn-add-kf');
    const delKfBtn = this.container.querySelector('#ds-btn-del-kf');

    playBtn.onclick = () => this.togglePlayback();
    prevBtn.onclick = () => this.ds.prevFrame();
    nextBtn.onclick = () => this.ds.nextFrame();
    loopBtn.onclick = () => {
      this.ds.loop = !this.ds.loop;
      loopBtn.style.background = this.ds.loop ? '#458588' : '#3c3836';
    };
    frameInput.onchange = (e) => this.ds.setFrame(Number(e.target.value));
    totalInput.onchange = (e) => {
      this.ds.totalFrames = Math.max(1, Number(e.target.value));
      this.updateGrid();
    };
    fpsSelect.onchange = (e) => {
      this.ds.fps = Number(e.target.value);
    };
    autoKfCheck.onchange = (e) => {
      this.ds.autoKeyframe = e.target.checked;
    };

    addKfBtn.onclick = () => {
      let targetId = this.selectedObjectId;
      if (!targetId && typeof window !== 'undefined' && window.doc) {
        const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects() : [];
        if (sel && sel.length > 0) targetId = sel[0].id;
        else if (window.doc.objects && window.doc.objects.length > 0) targetId = window.doc.objects[0].id;
      }
      if (targetId) {
        const obj = this.ds.getOrCreateObject(targetId);
        let liveObj = null;
        if (typeof window !== 'undefined' && window.doc) {
          liveObj = window.doc.findObject ? window.doc.findObject(targetId) : window.doc.objects.find(o => o.id === targetId);
        }

        if (liveObj) {
          const props = {
            x: liveObj.cx !== undefined ? liveObj.cx : (liveObj.x !== undefined ? liveObj.x : 0),
            y: liveObj.cy !== undefined ? liveObj.cy : (liveObj.y !== undefined ? liveObj.y : 0),
            rotation: liveObj.rotation || 0,
            scaleX: liveObj.scaleX !== undefined ? liveObj.scaleX : 1.0,
            scaleY: liveObj.scaleY !== undefined ? liveObj.scaleY : 1.0,
            opacity: liveObj.opacity !== undefined ? liveObj.opacity : 1.0,
            fillColor: (liveObj.fill && liveObj.fill !== 'none') ? liveObj.fill : undefined,
            strokeColor: (liveObj.stroke && liveObj.stroke !== 'none') ? liveObj.stroke : undefined,
            strokeWidth: liveObj.strokeWidth
          };
          for (const [key, val] of Object.entries(props)) {
            if (val !== undefined) {
              obj.setKeyframe(key, this.ds.currentFrame, val);
            }
          }
        } else {
          for (const [key, ch] of obj.channels.entries()) {
            const val = ch.sample(this.ds.currentFrame);
            ch.addKeyframe(this.ds.currentFrame, val);
          }
        }
        this.selectedObjectId = targetId;
        this.updateGrid();
      }
    };

    delKfBtn.onclick = () => {
      let targetId = this.selectedObjectId;
      if (!targetId && typeof window !== 'undefined' && window.doc) {
        const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects() : [];
        if (sel && sel.length > 0) targetId = sel[0].id;
      }
      if (targetId) {
        const obj = this.ds.objects.get(targetId);
        if (obj) {
          for (const ch of obj.channels.values()) {
            ch.removeKeyframe(this.ds.currentFrame);
          }
          this.updateGrid();
        }
      }
    };

    // Scrubbing on Timeline Ruler
    const rulerEl = this.container.querySelector('#ds-ruler-container');
    const onScrub = (e) => {
      const rect = rulerEl.getBoundingClientRect();
      const scrollEl = this.container.querySelector('#ds-timeline-scroll');
      const clickX = e.clientX - rect.left + scrollEl.scrollLeft;
      const targetFrame = Math.max(1, Math.min(this.ds.totalFrames, Math.round(clickX / this.frameWidth) + 1));
      this.ds.setFrame(targetFrame);
    };

    rulerEl.onpointerdown = (e) => {
      this.isScrubbing = true;
      onScrub(e);
      window.addEventListener('pointermove', rulerMove);
      window.addEventListener('pointerup', rulerUp);
    };

    const rulerMove = (e) => {
      if (this.isScrubbing) onScrub(e);
    };

    const rulerUp = () => {
      this.isScrubbing = false;
      window.removeEventListener('pointermove', rulerMove);
      window.removeEventListener('pointerup', rulerUp);
    };
  }

  togglePlayback() {
    if (this.ds.isPlaying) {
      this.ds.pause();
      if (this._playInterval) clearInterval(this._playInterval);
      this._playInterval = null;
    } else {
      this.ds.play();
      const intervalMs = 1000 / this.ds.fps;
      this._playInterval = setInterval(() => {
        this.ds.nextFrame();
      }, intervalMs);
    }
  }

  updatePlayButton() {
    const playBtn = this.container.querySelector('#ds-btn-play');
    if (playBtn) {
      playBtn.textContent = this.ds.isPlaying ? '⏸' : '▶';
      playBtn.style.background = this.ds.isPlaying ? '#fe8019' : '#d79921';
    }
  }

  updatePlayhead() {
    const frameInput = this.container.querySelector('#ds-input-frame');
    if (frameInput) frameInput.value = this.ds.currentFrame;

    const playheadEl = this.container.querySelector('#ds-playhead');
    if (playheadEl) {
      const pos = (this.ds.currentFrame - 1) * this.frameWidth + this.frameWidth / 2;
      playheadEl.style.left = `${pos}px`;
    }
  }

  updateGrid() {
    const totalW = Math.max(800, this.ds.totalFrames * this.frameWidth + 100);
    const treeRowsEl = this.container.querySelector('#ds-tree-rows');
    const rulerCanvas = this.container.querySelector('#ds-ruler-canvas');
    const gridCanvas = this.container.querySelector('#ds-grid-canvas');
    if (!treeRowsEl || !rulerCanvas || !gridCanvas) return;

    // 1. Build Flat List of Visible Channel Rows
    const flatRows = [];
    for (const obj of this.ds.objects.values()) {
      flatRows.push({ type: 'object', object: obj, id: obj.id, label: obj.name });
      if (!obj.collapsed) {
        for (const [paramKey, ch] of obj.channels.entries()) {
          flatRows.push({ type: 'channel', object: obj, channel: ch, paramKey, label: ch.label });
        }
      }
    }

    const rowHeight = 22;
    const totalH = Math.max(120, flatRows.length * rowHeight);

    // 2. Render Left Sidebar DOM Rows
    treeRowsEl.innerHTML = '';
    flatRows.forEach((r, idx) => {
      const rowEl = document.createElement('div');
      rowEl.style.height = `${rowHeight}px`;
      rowEl.style.display = 'flex';
      rowEl.style.alignItems = 'center';
      rowEl.style.padding = '0 6px';
      rowEl.style.borderBottom = '1px solid #32302f';
      rowEl.style.background = (r.object.id === this.selectedObjectId) ? '#3c3836' : (idx % 2 === 0 ? '#282828' : '#242424');
      rowEl.style.cursor = 'pointer';
      rowEl.onclick = () => {
        this.selectedObjectId = r.object.id;
        this.updateGrid();
      };

      if (r.type === 'object') {
        rowEl.innerHTML = `
          <span style="margin-right: 4px; color: #d79921; cursor: pointer;">${r.object.collapsed ? '▶' : '▼'}</span>
          <span style="font-weight: bold; color: #fabd2f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.label}</span>
        `;
        rowEl.querySelector('span').onclick = (e) => {
          e.stopPropagation();
          r.object.collapsed = !r.object.collapsed;
          this.updateGrid();
        };
      } else {
        rowEl.innerHTML = `
          <span style="margin-left: 14px; color: #a89984; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.label}</span>
        `;
      }
      treeRowsEl.appendChild(rowEl);
    });

    // 3. Render Ruler Canvas
    rulerCanvas.width = totalW;
    rulerCanvas.height = 24;
    const rctx = rulerCanvas.getContext('2d');
    rctx.fillStyle = '#32302f';
    rctx.fillRect(0, 0, totalW, 24);
    rctx.strokeStyle = '#504945';
    rctx.fillStyle = '#a89984';
    rctx.font = '9px monospace';

    for (let f = 1; f <= this.ds.totalFrames; f++) {
      const x = (f - 1) * this.frameWidth;
      const isMajor = f === 1 || f % 5 === 0;
      rctx.beginPath();
      rctx.moveTo(x, isMajor ? 6 : 14);
      rctx.lineTo(x, 24);
      rctx.stroke();
      if (isMajor) {
        rctx.fillText(String(f), x + 2, 12);
      }
    }

    // 4. Render Grid Canvas & Keyframe Diamonds
    gridCanvas.width = totalW;
    gridCanvas.height = totalH;
    const gctx = gridCanvas.getContext('2d');
    gctx.fillStyle = '#1d2021';
    gctx.fillRect(0, 0, totalW, totalH);

    // Grid vertical frame dividers
    gctx.strokeStyle = '#282828';
    gctx.lineWidth = 1;
    for (let f = 1; f <= this.ds.totalFrames; f++) {
      const x = (f - 1) * this.frameWidth;
      gctx.beginPath();
      gctx.moveTo(x, 0);
      gctx.lineTo(x, totalH);
      gctx.stroke();
    }

    // Draw row backgrounds & keyframes
    flatRows.forEach((r, idx) => {
      const y = idx * rowHeight;
      gctx.fillStyle = idx % 2 === 0 ? 'rgba(40,40,40,0.3)' : 'rgba(29,32,33,0.3)';
      gctx.fillRect(0, y, totalW, rowHeight);
      gctx.strokeStyle = '#32302f';
      gctx.strokeRect(0, y, totalW, rowHeight);

      if (r.type === 'object') {
        // Draw summarized keyframe dots
        for (let f = 1; f <= this.ds.totalFrames; f++) {
          if (r.object.hasAnyKeyframeAt(f)) {
            const kx = (f - 1) * this.frameWidth + this.frameWidth / 2;
            const ky = y + rowHeight / 2;
            gctx.fillStyle = '#fabd2f';
            gctx.beginPath();
            gctx.arc(kx, ky, 3.5, 0, Math.PI * 2);
            gctx.fill();
          }
        }
      } else if (r.type === 'channel') {
        // Draw Keyframe Diamonds
        for (const kf of r.channel.keyframes) {
          const kx = (kf.frame - 1) * this.frameWidth + this.frameWidth / 2;
          const ky = y + rowHeight / 2;
          const size = 5;

          gctx.fillStyle = kf.selected ? '#fb4934' : '#83a598';
          gctx.strokeStyle = '#1d2021';
          gctx.lineWidth = 1.2;

          gctx.beginPath();
          gctx.moveTo(kx, ky - size);
          gctx.lineTo(kx + size, ky);
          gctx.lineTo(kx, ky + size);
          gctx.lineTo(kx - size, ky);
          gctx.closePath();
          gctx.fill();
          gctx.stroke();
        }
      }
    });

    this.updatePlayhead();
  }
}
