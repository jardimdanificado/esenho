/**
 * =========================================================================
 * Esenho DopeSheet UI Widget (src/anim/dopesheet_ui.js)
 * Interactive Bottom Dock for Frame Scrubbing, Playback, Auto-Keyframing
 * and Parameter Tracks across all Quadro engine subsystems.
 * =========================================================================
 */

import * as DopeSheetModule from './dopesheet.js';
import { solveCubicBezier, createBounceEasing, createSpringEasing, createSplineEasing, getEasingFunction } from './animator_engine.js';

const PARAMETER_REGISTRY = DopeSheetModule.PARAMETER_REGISTRY || {};
const extractLiveObjectProperties = typeof DopeSheetModule.extractLiveObjectProperties === 'function'
  ? DopeSheetModule.extractLiveObjectProperties
  : function(o) { return {}; };
const getParameterGroups = typeof DopeSheetModule.getParameterGroups === 'function' ? DopeSheetModule.getParameterGroups : function() {
  const groups = {};
  for (const [key, def] of Object.entries(PARAMETER_REGISTRY)) {
    const groupName = def.group || 'General';
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push({ key, ...def });
  }
  return groups;
};

export class DopeSheetUI {
  constructor(containerEl, dopeSheet, onFrameChange = null) {
    this.container = containerEl;
    this.ds = dopeSheet;
    this.onFrameChange = onFrameChange;
    this.frameWidth = 14; // pixels per frame on timeline ruler
    this.selectedObjectId = null;
    this.isScrubbing = false;
    this._playInterval = null;
    this._activeMenu = null;

    this.render();
    if (typeof document !== 'undefined') {
      const curvesEl = document.getElementById('curve-editor-dock-mount') || document.getElementById('dock-panel-curves');
      if (curvesEl) this.mountCurveEditor(curvesEl);
    }
    this._unsubscribe = this.ds.subscribe((event, payload) => {
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
      <div class="dopesheet-panel" style="display: flex; flex-direction: column; height: 100%; width: 100%; min-height: 0; background: var(--bg-panel); color: var(--text); font-family: var(--font-sans); font-size: 11px; user-select: none; box-sizing: border-box; position: relative;">
        <!-- Header Toolbar -->
        <div class="ds-toolbar" style="display: flex; align-items: center; gap: 5px; padding: 4px 8px; background: var(--bg-panel-sub); border-bottom: 1px solid var(--border); flex-wrap: wrap; z-index: 30; min-height: 28px; box-sizing: border-box;">
          <div style="display: flex; align-items: center; gap: 2px;">
            <button id="ds-btn-prev-key" class="ds-btn" title="Jump to Previous Keyframe ([ or Alt+Left)" style="background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px; cursor: pointer; font-size: 10px;">⏮</button>
            <button id="ds-btn-step-prev" class="ds-btn" title="Step 1 Frame Back (Left)" style="background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px; cursor: pointer; font-size: 10px;">◀</button>
            <button id="ds-btn-play" class="ds-btn" title="Play / Pause (Space)" style="background: var(--primary); color: var(--bg-dark); font-weight: 700; border: 1px solid var(--primary); border-radius: 3px; padding: 2px 10px; cursor: pointer; font-size: 11px;">▶</button>
            <button id="ds-btn-step-next" class="ds-btn" title="Step 1 Frame Forward (Right)" style="background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px; cursor: pointer; font-size: 10px;">▶</button>
            <button id="ds-btn-next-key" class="ds-btn" title="Jump to Next Keyframe (] or Alt+Right)" style="background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px; cursor: pointer; font-size: 10px;">⏭</button>
            <button id="ds-btn-loop" class="ds-btn" title="Toggle Loop" style="background: ${this.ds.loop ? '#b16286' : 'var(--bg-input)'}; color: ${this.ds.loop ? '#ffffff' : 'var(--text-muted)'}; border: 1px solid ${this.ds.loop ? '#d3869b' : 'var(--border)'}; border-radius: 3px; padding: 2px 8px; font-weight: ${this.ds.loop ? '700' : '600'}; font-size: 10px; cursor: pointer;">Loop</button>
          </div>

          <div style="height: 14px; width: 1px; background: var(--border); margin: 0 2px;"></div>

          <!-- Animation Clip Selector & Management -->
          <div id="ds-anim-clip-group" style="display: flex; align-items: center; gap: 3px;">
            <span style="color: var(--text-dim); font-size: 10px; font-weight: 700; letter-spacing: 0.3px;">CLIP:</span>
            <select id="ds-select-clip" title="Active Animation Clip" style="background: var(--bg-input); color: var(--text-bright); border: 1px solid var(--border); border-radius: 3px; padding: 2px 4px; font-size: 11px; font-weight: 600; height: 22px; max-width: 130px; cursor: pointer;"></select>
            <button id="ds-btn-add-clip" class="ds-btn" title="Create New Animation Clip (+)" style="background: var(--bg-panel); color: var(--primary); border: 1px solid var(--border); border-radius: 3px; padding: 2px 6px; font-size: 11px; font-weight: bold; cursor: pointer;">＋</button>
            <button id="ds-btn-clone-clip" class="ds-btn" title="Duplicate Active Clip" style="background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px; font-size: 10.5px; cursor: pointer;">⧉</button>
            <button id="ds-btn-rename-clip" class="ds-btn" title="Rename Active Clip" style="background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px; font-size: 10.5px; cursor: pointer;">✎</button>
            <button id="ds-btn-del-clip" class="ds-btn" title="Delete Active Clip" style="background: var(--bg-panel); color: var(--danger); border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px; font-size: 10.5px; cursor: pointer;">✕</button>
          </div>

          <div style="height: 14px; width: 1px; background: var(--border); margin: 0 2px;"></div>

          <div style="display: flex; align-items: center; gap: 3px;">
            <span style="color: var(--text-dim); font-size: 10.5px;">Frame:</span>
            <input id="ds-input-frame" type="number" min="1" max="${this.ds.totalFrames}" value="${this.ds.currentFrame}" style="width: 52px; min-width: 48px; background: var(--bg-input); color: var(--primary); border: 1px solid var(--border); border-radius: 3px; padding: 2px 4px; text-align: center; font-weight: bold; font-size: 11px; font-family: var(--font-mono); box-sizing: border-box;">
            <span style="color: var(--text-muted);">/</span>
            <input id="ds-input-total" type="number" min="1" max="9999" value="${this.ds.totalFrames}" style="width: 52px; min-width: 48px; background: var(--bg-input); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 2px 4px; text-align: center; font-size: 11px; font-family: var(--font-mono); box-sizing: border-box;">
          </div>

          <div style="display: flex; align-items: center; gap: 3px;">
            <span style="color: var(--text-dim); font-size: 10.5px;">FPS:</span>
            <input id="ds-input-fps" type="number" min="1" max="240" step="1" value="${this.ds.fps}" style="width: 46px; min-width: 42px; background: var(--bg-input); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 2px 4px; text-align: center; font-size: 11px; font-family: var(--font-mono); box-sizing: border-box;">
          </div>

          <div style="display: flex; align-items: center; gap: 3px;">
            <span style="color: var(--text-dim); font-size: 10.5px;">Curve:</span>
            <select id="ds-select-easing" title="Easing Curve for Keyframe(s)" style="background: var(--bg-input); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 1px 3px; font-size: 10.5px; height: 21px;">
              <option value="linear">Linear</option>
              <option value="easeInQuad">Ease In (Quad)</option>
              <option value="easeOutQuad">Ease Out (Quad)</option>
              <option value="easeInOutQuad">Ease In/Out (Quad)</option>
              <option value="easeInCubic">Ease In (Cubic)</option>
              <option value="easeOutCubic">Ease Out (Cubic)</option>
              <option value="easeInOutCubic">Ease In/Out (Cubic)</option>
              <option value="easeInElastic">Elastic In</option>
              <option value="easeOutElastic">Elastic Out</option>
              <option value="easeOutBounce">Bounce Out</option>
              <option value="step">Step (Hold)</option>
              <option value="custom">Custom Bézier...</option>
              <optgroup id="ds-easing-shared-curves" label="Shared Curve Presets"></optgroup>
            </select>
            <button id="ds-btn-custom-curve" class="ds-btn" title="Open Bézier Curve Visual Graph Editor" style="background: var(--bg-panel); color: var(--primary); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-size: 10.5px; cursor: pointer; display: flex; align-items: center; gap: 2px;">
              <span>Curve</span>
            </button>
          </div>

          <div style="height: 14px; width: 1px; background: var(--border); margin: 0 2px;"></div>

          <button id="ds-btn-add-kf" class="ds-btn" title="Add Keyframe at Current Frame" style="background: #2e7d32; color: #ffffff; font-weight: 700; border: 1px solid #4caf50; border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 10.5px;">◆ Add</button>
          <button id="ds-btn-del-kf" class="ds-btn" title="Remove Keyframe" style="background: #c62828; color: #ffffff; font-weight: 700; border: 1px solid #ef5350; border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 10.5px;">◇ Remove</button>
          
          <button id="ds-btn-autokf" class="ds-btn" title="Toggle Auto-Keyframe Recording" style="background: ${this.ds.autoKeyframe ? 'var(--danger)' : 'var(--bg-panel)'}; color: ${this.ds.autoKeyframe ? '#ffffff' : 'var(--text)'}; border: 1px solid ${this.ds.autoKeyframe ? 'var(--danger)' : 'var(--border)'}; border-radius: 3px; padding: 2px 6px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-weight: 600; font-size: 10.5px;">
            <span id="ds-autokf-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${this.ds.autoKeyframe ? '#fb4934' : 'var(--text-muted)'}; box-shadow: ${this.ds.autoKeyframe ? '0 0 5px #fb4934' : 'none'};"></span>
            Auto
          </button>

          <!-- Timeline Zoom Controls -->
          <div style="display: flex; align-items: center; gap: 2px; margin-left: auto;">
            <span style="font-size: 10px; color: var(--text-muted);">Zoom:</span>
            <button id="ds-btn-zoom-out" class="ds-btn" title="Zoom Out Timeline" style="background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-size: 11px; cursor: pointer;">−</button>
            <button id="ds-btn-zoom-in" class="ds-btn" title="Zoom In Timeline" style="background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-size: 11px; cursor: pointer;">＋</button>
          </div>
        </div>

        <!-- Main Body: Split View (Object Tracks List on Left, Timeline Grid on Right) -->
        <div id="ds-body" style="display: flex; flex: 1; min-height: 0; position: relative; overflow: hidden;">
          
          <!-- Left: Objects / Animation Tracks Sidebar -->
          <div id="ds-tree-sidebar" style="width: 270px; min-width: 200px; max-width: 400px; background: var(--bg-panel-sub); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden;">
            <!-- Tree Header (Matches 24px ruler height exactly) -->
            <div style="height: 24px; min-height: 24px; padding: 0 8px; background: var(--bg-panel); border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
              <span style="font-size: 10px; font-weight: 700; color: var(--text); letter-spacing: 0.5px;">ANIMATION TRACKS</span>
              <span id="ds-tracks-summary" style="font-size: 9.5px; color: var(--text-muted);"></span>
            </div>
            <!-- Scrollable Track Labels Container -->
            <div id="ds-tree-scroll" style="flex: 1; overflow-y: hidden; overflow-x: hidden; position: relative;">
              <div id="ds-tree-rows"></div>
            </div>
          </div>

          <!-- Right: Timeline Grid & Ruler Scrollable View -->
          <div id="ds-timeline-scroll" style="flex: 1; overflow: auto; position: relative; background: var(--bg-dark);">
            
            <!-- Timeline Ruler (Top Sticky) -->
            <div id="ds-ruler-container" style="position: sticky; top: 0; left: 0; height: 24px; background: var(--bg-panel); border-bottom: 1px solid var(--border); z-index: 10; cursor: pointer; width: max-content;">
              <canvas id="ds-ruler-canvas" style="display: block; height: 24px;"></canvas>
            </div>

            <!-- Grid Keyframe Rows -->
            <div id="ds-grid-rows" style="position: relative; width: max-content; cursor: crosshair;">
              <canvas id="ds-grid-canvas" style="display: block;"></canvas>
            </div>

            <!-- Playhead Vertical Bar -->
            <div id="ds-playhead" style="position: absolute; top: 0; bottom: 0; width: 2px; background: var(--danger); z-index: 20; pointer-events: none; left: 0;">
              <div style="position: absolute; top: 0; left: -5px; width: 12px; height: 14px; background: var(--danger); clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%);"></div>
            </div>

          </div>

        </div>

      </div>
    `;

    this.bindEvents();
    this.populateCurvePresetOptions();
    if (typeof window !== 'undefined') {
      window.addEventListener('esenho:registry-updated', () => this.populateCurvePresetOptions());
      window.addEventListener('esenho:data-loaded', () => this.populateCurvePresetOptions());
    }
    this.updateGrid();
    this.updatePlayhead();
  }

  populateCurvePresetOptions() {
    const group = this.container?.querySelector('#ds-easing-shared-curves');
    const registry = typeof globalThis !== 'undefined' ? globalThis.EsenhoRegistry : null;
    if (!group || !registry?.list) return;
    group.replaceChildren();
    const curves = registry.list('curve').sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    curves.forEach(curve => {
      const option = document.createElement('option');
      option.value = `curve:${curve.id}`;
      option.textContent = curve.name || curve.id;
      group.appendChild(option);
    });
    this.syncEasingUI();
  }

  bindEvents() {
    // ── Prevent click-through from Timeline to underlying viewport canvas ──
    const stopEvt = (e) => e.stopPropagation();
    const eventsToStop = [
      'pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'touchstart'
    ];
    eventsToStop.forEach(evtName => {
      this.container.addEventListener(evtName, stopEvt);
    });

    // ── Resizable Dock Adaptability (ResizeObserver) ──
    if (typeof ResizeObserver !== 'undefined' && this.container) {
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      }
      this._resizeObserver = new ResizeObserver(() => {
        this.updateGrid();
        this.updatePlayhead();
      });
      this._resizeObserver.observe(this.container);
    }

    // ── Synchronous Vertical Scrolling between Track Labels and Grid Rows ──
    const treeScroll = this.container.querySelector('#ds-tree-scroll');
    const timelineScroll = this.container.querySelector('#ds-timeline-scroll');

    let isSyncingTree = false;
    let isSyncingTimeline = false;

    if (treeScroll && timelineScroll) {
      treeScroll.addEventListener('scroll', () => {
        if (isSyncingTree) { isSyncingTree = false; return; }
        isSyncingTimeline = true;
        timelineScroll.scrollTop = treeScroll.scrollTop;
      });

      timelineScroll.addEventListener('scroll', () => {
        if (isSyncingTimeline) { isSyncingTimeline = false; return; }
        isSyncingTree = true;
        treeScroll.scrollTop = timelineScroll.scrollTop;
      });

      treeScroll.addEventListener('wheel', (e) => {
        timelineScroll.scrollTop += e.deltaY;
      }, { passive: true });
    }

    const playBtn = this.container.querySelector('#ds-btn-play');
    const prevKeyBtn = this.container.querySelector('#ds-btn-prev-key');
    const prevStepBtn = this.container.querySelector('#ds-btn-step-prev');
    const nextStepBtn = this.container.querySelector('#ds-btn-step-next');
    const nextKeyBtn = this.container.querySelector('#ds-btn-next-key');
    const loopBtn = this.container.querySelector('#ds-btn-loop');
    const collapseBtn = this.container.querySelector('#ds-btn-collapse-timeline');
    const frameInput = this.container.querySelector('#ds-input-frame');
    const totalInput = this.container.querySelector('#ds-input-total');
    const fpsInput = this.container.querySelector('#ds-input-fps');
    const easingSelect = this.container.querySelector('#ds-select-easing');
    const autoKfBtn = this.container.querySelector('#ds-btn-autokf');
    const addKfBtn = this.container.querySelector('#ds-btn-add-kf');
    const delKfBtn = this.container.querySelector('#ds-btn-del-kf');

    playBtn.onclick = (e) => {
      if (e && e.target && typeof e.target.blur === 'function') e.target.blur();
      this.togglePlayback();
    };

    if (prevKeyBtn) {
      prevKeyBtn.onclick = () => {
        this.ds.prevKeyframe(this.selectedObjectId);
      };
    }
    if (prevStepBtn) {
      prevStepBtn.onclick = () => {
        this.ds.prevFrame();
      };
    }
    if (nextStepBtn) {
      nextStepBtn.onclick = () => {
        this.ds.nextFrame();
      };
    }
    if (nextKeyBtn) {
      nextKeyBtn.onclick = () => {
        this.ds.nextKeyframe(this.selectedObjectId);
      };
    }
    loopBtn.onclick = () => {
      this.ds.loop = !this.ds.loop;
      loopBtn.style.background = this.ds.loop ? '#b16286' : 'var(--bg-input)';
      loopBtn.style.color = this.ds.loop ? '#ffffff' : 'var(--text-muted)';
      loopBtn.style.border = this.ds.loop ? '1px solid #d3869b' : '1px solid var(--border)';
      loopBtn.style.fontWeight = this.ds.loop ? '700' : '600';
    };
    const zoomInBtn = this.container.querySelector('#ds-btn-zoom-in');
    if (zoomInBtn) {
      zoomInBtn.onclick = () => {
        this.frameWidth = Math.min(48, this.frameWidth + 3);
        this.updateGrid();
        this.updatePlayhead();
      };
    }
    const zoomOutBtn = this.container.querySelector('#ds-btn-zoom-out');
    if (zoomOutBtn) {
      zoomOutBtn.onclick = () => {
        this.frameWidth = Math.max(6, this.frameWidth - 3);
        this.updateGrid();
        this.updatePlayhead();
      };
    }
    if (collapseBtn) {
      collapseBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && typeof window.toggleTimelineDock === 'function') {
          window.toggleTimelineDock();
        } else {
          this.container.classList.toggle('collapsed');
        }
      };
    }
    const adjustInput = (el) => this.adjustInputWidth(el);
    frameInput.oninput = () => adjustInput(frameInput);
    frameInput.onchange = (e) => {
      this.ds.setFrame(Number(e.target.value));
      adjustInput(frameInput);
    };
    totalInput.oninput = () => adjustInput(totalInput);
    totalInput.onchange = (e) => {
      this.ds.totalFrames = Math.max(1, Number(e.target.value));
      adjustInput(totalInput);
      this.updateGrid();
    };
    if (fpsInput) {
      fpsInput.oninput = (e) => {
        const val = Math.max(1, Math.min(240, Number(e.target.value) || 24));
        this.ds.fps = val;
        adjustInput(fpsInput);
      };
      fpsInput.onchange = (e) => {
        const val = Math.max(1, Math.min(240, Number(e.target.value) || 24));
        this.ds.fps = val;
        fpsInput.value = val;
        adjustInput(fpsInput);
      };
    }
    adjustInput(frameInput);
    adjustInput(totalInput);
    adjustInput(fpsInput);
    const customCurveBtn = this.container.querySelector('#ds-btn-custom-curve');
    if (customCurveBtn) {
      customCurveBtn.onclick = () => this.openCurveEditorModal();
    }
    if (easingSelect) {
      easingSelect.onchange = (e) => {
        const curve = e.target.value;
        if (curve === 'custom') {
          this.openCurveEditorModal();
          return;
        }
        this.applyCurve(curve);
      };
    }

    this.selectedParamKey = null;

    autoKfBtn.onclick = () => {
      this.ds.autoKeyframe = !this.ds.autoKeyframe;
      this.updateAutoKeyframeUI();
    };

    addKfBtn.onclick = () => {
      let targetId = this.selectedObjectId;
      if (!targetId && typeof window !== 'undefined' && window.doc) {
        const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects() : [];
        if (sel && sel.length > 0) targetId = sel[0].id;
        else if (window.doc.objects && window.doc.objects.length > 0) targetId = window.doc.objects[0].id;
      }
      if (!targetId && this.ds.objects.size > 0) {
        targetId = Array.from(this.ds.objects.keys())[0];
      }
      if (targetId) {
        const obj = this.ds.getOrCreateObject(targetId);
        let liveObj = null;
        if (typeof window !== 'undefined' && window.doc) {
          liveObj = window.doc.findObject ? window.doc.findObject(targetId) : window.doc.objects.find(o => o.id === targetId);
        }

        const curve = this.activeEasing || 'linear';
        if (this.selectedParamKey && obj.channels.has(this.selectedParamKey)) {
          const ch = obj.channels.get(this.selectedParamKey);
          let val = ch.sample(this.ds.currentFrame);
          if (liveObj) {
            const props = extractLiveObjectProperties(liveObj);
            if (props[this.selectedParamKey] !== undefined) val = props[this.selectedParamKey];
          }
          ch.addKeyframe(this.ds.currentFrame, val, curve);
          this.ds.deselectAllKeyframes();
          ch.setKeyframeSelectedAt(this.ds.currentFrame, true);
        } else if (liveObj) {
          const props = extractLiveObjectProperties(liveObj);
          for (const [key, val] of Object.entries(props)) {
            if (val !== undefined && val !== null) {
              obj.setKeyframe(key, this.ds.currentFrame, val, curve);
            }
          }
          this.ds.deselectAllKeyframes();
          obj.setKeyframeSelectedAt(this.ds.currentFrame, true);
        } else {
          for (const [key, ch] of obj.channels.entries()) {
            const val = ch.sample(this.ds.currentFrame);
            ch.addKeyframe(this.ds.currentFrame, val, curve);
          }
          this.ds.deselectAllKeyframes();
          obj.setKeyframeSelectedAt(this.ds.currentFrame, true);
        }
        this.selectedObjectId = targetId;
        this.updateGrid();
        if (typeof window !== 'undefined' && window.renderDoc) window.renderDoc();
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
          if (this.selectedParamKey && obj.channels.has(this.selectedParamKey)) {
            obj.channels.get(this.selectedParamKey).removeKeyframe(this.ds.currentFrame);
          } else {
            obj.removeKeyframesAtFrame(this.ds.currentFrame);
          }
          this.updateGrid();
          if (typeof window !== 'undefined' && window.renderDoc) window.renderDoc();
        }
      }
    };

    // ── Scrubbing and Keyframe Selection / Dragging on Timeline Grid & Ruler ──
    const rulerEl = this.container.querySelector('#ds-ruler-container');
    const gridEl = this.container.querySelector('#ds-grid-rows');
    const onScrub = (e) => {
      const rect = rulerEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const targetFrame = Math.max(1, Math.min(this.ds.totalFrames, Math.floor(clickX / this.frameWidth) + 1));
      this.ds.setFrame(targetFrame);
    };

    const startScrub = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isScrubbing = true;
      onScrub(e);
      window.addEventListener('pointermove', rulerMove, { capture: true });
      window.addEventListener('pointerup', rulerUp, { capture: true });
    };

    const rulerMove = (e) => {
      if (this.isScrubbing) {
        e.stopPropagation();
        e.preventDefault();
        onScrub(e);
      }
    };

    const rulerUp = (e) => {
      if (this.isScrubbing) {
        e.stopPropagation();
        e.preventDefault();
      }
      this.isScrubbing = false;
      window.removeEventListener('pointermove', rulerMove, { capture: true });
      window.removeEventListener('pointerup', rulerUp, { capture: true });
    };

    if (rulerEl) rulerEl.onpointerdown = startScrub;

    let dragKeyframe = null; // { type, object, channel?, initialFrame, currentFrame }
    if (gridEl) {
      gridEl.onpointerdown = (e) => {
        const gridRect = gridEl.getBoundingClientRect();
        const clickX = e.clientX - gridRect.left;
        const clickY = e.clientY - gridRect.top;

        if (this._displayRows && this._displayRows.length > 0) {
          const hitRow = this._displayRows.find(r => clickY >= r.y && clickY < r.y + r.height);
          if (hitRow) {
            if (hitRow.type === 'channel') {
              const kfFrames = hitRow.channel.keyframes.map(k => k.frame);
              const hitFrame = kfFrames.find(f => {
                const kx = (f - 1) * this.frameWidth + this.frameWidth / 2;
                return Math.abs(kx - clickX) <= 8;
              });

              if (hitFrame !== undefined) {
                e.stopPropagation();
                e.preventDefault();
                if (!e.shiftKey) {
                  this.ds.deselectAllKeyframes();
                }
                hitRow.channel.setKeyframeSelectedAt(hitFrame, true);
                this.selectedObjectId = hitRow.object.id;
                this.selectedParamKey = hitRow.paramKey;
                const targetKf = hitRow.channel.getKeyframeAt(hitFrame);
                this.activeEasing = targetKf ? targetKf.tweenType : 'linear';
                this.syncEasingUI();
                this.ds.setFrame(hitFrame);
                if (typeof window !== 'undefined' && window.doc) {
                  if (window.doc.select) window.doc.select(hitRow.object.id);
                  if (window.render) window.render();
                  if (window.updateInspector) window.updateInspector();
                  if (window.drawOverlay) window.drawOverlay();
                }
                this.updateGrid();

                dragKeyframe = {
                  type: 'channel',
                  object: hitRow.object,
                  channel: hitRow.channel,
                  initialFrame: hitFrame,
                  currentFrame: hitFrame
                };

                const onDragMove = (me) => {
                  if (!dragKeyframe) return;
                  me.stopPropagation();
                  me.preventDefault();
                  const curRect = gridEl.getBoundingClientRect();
                  const curClickX = me.clientX - curRect.left;
                  const targetF = Math.max(1, Math.min(this.ds.totalFrames, Math.floor(curClickX / this.frameWidth) + 1));
                  if (targetF !== dragKeyframe.currentFrame) {
                    dragKeyframe.channel.moveKeyframe(dragKeyframe.currentFrame, targetF);
                    dragKeyframe.currentFrame = targetF;
                    this.ds.setFrame(targetF);
                    this.updateGrid();
                    if (typeof window !== 'undefined' && window.renderDoc) window.renderDoc();
                  }
                };

                const onDragUp = (ue) => {
                  dragKeyframe = null;
                  window.removeEventListener('pointermove', onDragMove, { capture: true });
                  window.removeEventListener('pointerup', onDragUp, { capture: true });
                };

                window.addEventListener('pointermove', onDragMove, { capture: true });
                window.addEventListener('pointerup', onDragUp, { capture: true });
                return;
              }

              // Clicked on channel empty space
              this.selectedObjectId = hitRow.object.id;
              this.selectedParamKey = hitRow.paramKey;
              this.ds.deselectAllKeyframes();
              if (typeof window !== 'undefined' && window.doc) {
                if (window.doc.select) window.doc.select(hitRow.object.id);
                if (window.render) window.render();
                if (window.updateInspector) window.updateInspector();
                if (window.drawOverlay) window.drawOverlay();
              }
              this.updateGrid();
            } else {
              // Object row
              const kfFrames = hitRow.object.getKeyframeFrames();
              const hitFrame = kfFrames.find(f => {
                const kx = (f - 1) * this.frameWidth + this.frameWidth / 2;
                return Math.abs(kx - clickX) <= 8;
              });

              if (hitFrame !== undefined) {
                e.stopPropagation();
                e.preventDefault();
                if (!e.shiftKey) {
                  this.ds.deselectAllKeyframes();
                }
                hitRow.object.setKeyframeSelectedAt(hitFrame, true);
                this.selectedObjectId = hitRow.object.id;
                this.selectedParamKey = null;
                this.activeEasing = hitRow.object.getKeyframeTweenAt(hitFrame);
                this.syncEasingUI();
                this.ds.setFrame(hitFrame);
                if (typeof window !== 'undefined' && window.doc) {
                  if (window.doc.select) window.doc.select(hitRow.object.id);
                  if (window.render) window.render();
                  if (window.updateInspector) window.updateInspector();
                  if (window.drawOverlay) window.drawOverlay();
                }
                this.updateGrid();

                dragKeyframe = {
                  type: 'object',
                  object: hitRow.object,
                  initialFrame: hitFrame,
                  currentFrame: hitFrame
                };

                const onDragMove = (me) => {
                  if (!dragKeyframe) return;
                  me.stopPropagation();
                  me.preventDefault();
                  const curRect = gridEl.getBoundingClientRect();
                  const curClickX = me.clientX - curRect.left;
                  const targetF = Math.max(1, Math.min(this.ds.totalFrames, Math.floor(curClickX / this.frameWidth) + 1));
                  if (targetF !== dragKeyframe.currentFrame) {
                    dragKeyframe.object.moveKeyframe(dragKeyframe.currentFrame, targetF);
                    dragKeyframe.currentFrame = targetF;
                    this.ds.setFrame(targetF);
                    this.updateGrid();
                    if (typeof window !== 'undefined' && window.renderDoc) window.renderDoc();
                  }
                };

                const onDragUp = (ue) => {
                  dragKeyframe = null;
                  window.removeEventListener('pointermove', onDragMove, { capture: true });
                  window.removeEventListener('pointerup', onDragUp, { capture: true });
                };

                window.addEventListener('pointermove', onDragMove, { capture: true });
                window.addEventListener('pointerup', onDragUp, { capture: true });
                return;
              }

              // Clicked on object track empty space
              this.selectedObjectId = hitRow.object.id;
              this.selectedParamKey = null;
              this.ds.deselectAllKeyframes();
              if (typeof window !== 'undefined' && window.doc) {
                if (window.doc.select) window.doc.select(hitRow.object.id);
                if (window.render) window.render();
                if (window.updateInspector) window.updateInspector();
                if (window.drawOverlay) window.drawOverlay();
              }
              this.updateGrid();
            }
          }
        } else {
          this.ds.deselectAllKeyframes();
          this.updateGrid();
        }
        startScrub(e);
      };

      gridEl.ondblclick = (e) => {
        const gridRect = gridEl.getBoundingClientRect();
        const clickX = e.clientX - gridRect.left;
        const clickY = e.clientY - gridRect.top;
        if (this._displayRows && this._displayRows.length > 0) {
          const hitRow = this._displayRows.find(r => clickY >= r.y && clickY < r.y + r.height);
          if (hitRow) {
            const targetFrame = Math.max(1, Math.min(this.ds.totalFrames, Math.floor(clickX / this.frameWidth) + 1));
            this.selectedObjectId = hitRow.object.id;
            this.ds.setFrame(targetFrame);
            if (hitRow.type === 'channel') {
              this.selectedParamKey = hitRow.paramKey;
            } else {
              this.selectedParamKey = null;
            }
            const addKfBtn = this.container.querySelector('#ds-btn-add-kf');
            if (addKfBtn) addKfBtn.click();
          }
        }
      };
    }

    // Clip Manager Controls
    const selectClip = this.container.querySelector('#ds-select-clip');
    const addClipBtn = this.container.querySelector('#ds-btn-add-clip');
    const cloneClipBtn = this.container.querySelector('#ds-btn-clone-clip');
    const renameClipBtn = this.container.querySelector('#ds-btn-rename-clip');
    const delClipBtn = this.container.querySelector('#ds-btn-del-clip');

    if (selectClip) {
      selectClip.onchange = (e) => {
        if (typeof window !== 'undefined' && typeof window.switchAnimation === 'function') {
          window.switchAnimation(e.target.value);
        }
      };
    }
    if (addClipBtn) {
      addClipBtn.onclick = () => {
        if (typeof window !== 'undefined' && typeof window.createAnimation === 'function') {
          window.createAnimation();
        }
      };
    }
    if (cloneClipBtn) {
      cloneClipBtn.onclick = () => {
        if (typeof window !== 'undefined' && typeof window.duplicateAnimation === 'function') {
          window.duplicateAnimation(this.ds.id);
        }
      };
    }
    if (renameClipBtn) {
      renameClipBtn.onclick = () => {
        if (typeof window !== 'undefined' && typeof window.renameAnimation === 'function') {
          window.renameAnimation(this.ds.id);
        }
      };
    }
    if (delClipBtn) {
      delClipBtn.onclick = () => {
        if (typeof window !== 'undefined' && typeof window.deleteAnimation === 'function') {
          window.deleteAnimation(this.ds.id);
        }
      };
    }

    this.updateAnimationClipsDropdown();

    // Dismiss active popup menus on outside click
    window.addEventListener('pointerdown', () => {
      this.closeActiveMenu();
    });
  }

  updateAnimationClipsDropdown() {
    const selectClip = this.container?.querySelector('#ds-select-clip');
    if (!selectClip) return;
    const clips = (typeof window !== 'undefined' && typeof window.getAnimationClips === 'function')
      ? window.getAnimationClips()
      : ((typeof window !== 'undefined' && window.animationClips) ? window.animationClips : [this.ds]);

    selectClip.innerHTML = '';
    for (const clip of clips) {
      const opt = document.createElement('option');
      opt.value = clip.id;
      opt.textContent = `${clip.name} (${clip.totalFrames}f)`;
      if (clip.id === this.ds.id) {
        opt.selected = true;
      }
      selectClip.appendChild(opt);
    }
    selectClip.value = this.ds.id;
  }

  setDopeSheet(newDopeSheet) {
    if (!newDopeSheet) return;
    if (this._unsubscribe) {
      try { this._unsubscribe(); } catch (_) {}
    }
    this.ds = newDopeSheet;
    this._unsubscribe = this.ds.subscribe((event, payload) => {
      if (event === 'frameChanged') {
        this.updatePlayhead();
        if (this.onFrameChange) this.onFrameChange(this.ds.currentFrame, this.ds.sampleAll(this.ds.currentFrame));
      } else if (event === 'playStateChanged') {
        this.updatePlayButton();
      } else {
        this.updateGrid();
      }
    });

    const frameInput = this.container?.querySelector('#ds-input-frame');
    const totalInput = this.container?.querySelector('#ds-input-total');
    const fpsInput = this.container?.querySelector('#ds-input-fps');
    const loopBtn = this.container?.querySelector('#ds-btn-loop');
    const autoKfBtn = this.container?.querySelector('#ds-btn-autokf');
    const autoKfDot = this.container?.querySelector('#ds-autokf-dot');

    if (frameInput) frameInput.value = this.ds.currentFrame || 1;
    if (totalInput) totalInput.value = this.ds.totalFrames || 60;
    if (fpsInput) fpsInput.value = this.ds.fps || 24;
    if (loopBtn) {
      loopBtn.style.background = this.ds.loop ? '#b16286' : 'var(--bg-input)';
      loopBtn.style.color = this.ds.loop ? '#ffffff' : 'var(--text-muted)';
      loopBtn.style.border = this.ds.loop ? '1px solid #d3869b' : '1px solid var(--border)';
      loopBtn.style.fontWeight = this.ds.loop ? '700' : '600';
    }
    if (autoKfBtn && autoKfDot) {
      const active = !!this.ds.autoKeyframe;
      autoKfBtn.style.background = active ? '#cc241d' : '#3c3836';
      autoKfBtn.style.color = active ? '#ffffff' : '#ebdbb2';
      autoKfBtn.style.borderColor = active ? '#fb4934' : '#504945';
      autoKfDot.style.background = active ? '#fb4934' : '#7c6f64';
      autoKfDot.style.boxShadow = active ? '0 0 6px #fb4934' : 'none';
    }

    this.updateAnimationClipsDropdown();
    this.updateGrid();
    this.updatePlayhead();
    this.updatePlayButton();
    if (this.curveEditor) {
      const activeObj = this.selectedObjectId ? this.ds.getObject(this.selectedObjectId) : null;
      if (activeObj && this.selectedParamKey) {
        const ch = activeObj.channels.get(this.selectedParamKey);
        if (ch) this.curveEditor.setKeyframes(ch.keyframes);
      }
    }
  }

  updateAutoKeyframeUI() {
    const autoKfBtn = this.container.querySelector('#ds-btn-autokf');
    const autoKfDot = this.container.querySelector('#ds-autokf-dot');
    if (autoKfBtn && autoKfDot) {
      const active = !!this.ds.autoKeyframe;
      autoKfBtn.style.background = active ? '#cc241d' : '#3c3836';
      autoKfBtn.style.color = active ? '#ffffff' : '#ebdbb2';
      autoKfBtn.style.borderColor = active ? '#fb4934' : '#504945';
      autoKfDot.style.background = active ? '#fb4934' : '#7c6f64';
      autoKfDot.style.boxShadow = active ? '0 0 6px #fb4934' : 'none';
    }
  }

  togglePlayback() {
    if (typeof window !== 'undefined' && typeof window.toggleScenePlay === 'function') {
      window.toggleScenePlay();
      return;
    }
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

  applyCurve(curve) {
    this.activeEasing = curve;
    const selectedKfs = this.ds.getSelectedKeyframes();
    if (selectedKfs.length > 0) {
      for (const item of selectedKfs) {
        item.keyframe.tweenType = curve;
      }
    } else {
      let targetId = this.selectedObjectId;
      if (!targetId && typeof window !== 'undefined' && window.doc) {
        const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects() : [];
        if (sel && sel.length > 0) targetId = sel[0].id;
      }

      if (targetId) {
        const obj = this.ds.getOrCreateObject(targetId);
        obj.setKeyframeTweenAt(this.ds.currentFrame, curve);
      }
    }

    this.updateGrid();
    this.ds.setFrame(this.ds.currentFrame);
    if (typeof window !== 'undefined') {
      if (window.renderDoc) window.renderDoc();
      if (window.render) window.render();
    }
  }

  mountCurveEditor(targetEl = null) {
    const container = targetEl || (typeof document !== 'undefined' ? (document.getElementById('curve-editor-dock-mount') || document.getElementById('dock-panel-curves')) : null);
    if (!container) return;

    let currentMode = 'bezier'; // 'bezier', 'bounce', 'spring', 'spline'
    let p1 = { x: 0.42, y: 0.0 };
    let p2 = { x: 0.58, y: 1.0 };
    let bounceCount = 3;
    let bounceDecay = 0.45;
    let springOsc = 3;
    let springDamp = 0.5;
    let splineNodes = [
      { x: 0.0, y: 0.0, cpOut: { x: 0.15, y: 0.0 } },
      { x: 0.4, y: 1.0, cpIn: { x: -0.1, y: 0.0 }, cpOut: { x: 0.1, y: 0.0 } },
      { x: 0.7, y: 0.6, cpIn: { x: -0.08, y: 0.0 }, cpOut: { x: 0.08, y: 0.0 } },
      { x: 1.0, y: 1.0, cpIn: { x: -0.1, y: 0.0 } }
    ];

    const curveRegistry = typeof globalThis !== 'undefined' ? globalThis.EsenhoRegistry : null;
    const activeCurveRef = typeof this.activeEasing === 'string' && this.activeEasing.startsWith('curve:')
      ? curveRegistry?.get?.('curve', this.activeEasing.slice(6))
      : null;
    const activeCurveEditor = activeCurveRef?.editor || null;
    if (activeCurveEditor) {
      currentMode = activeCurveEditor.mode || currentMode;
      p1 = activeCurveEditor.p1 || p1;
      p2 = activeCurveEditor.p2 || p2;
      bounceCount = activeCurveEditor.bounceCount ?? bounceCount;
      bounceDecay = activeCurveEditor.bounceDecay ?? bounceDecay;
      springOsc = activeCurveEditor.springOsc ?? springOsc;
      springDamp = activeCurveEditor.springDamp ?? springDamp;
      splineNodes = activeCurveEditor.splineNodes || splineNodes;
    } else if (activeCurveRef?.points?.length >= 4) {
      currentMode = 'bezier';
      p1 = { x: activeCurveRef.points[1][0], y: activeCurveRef.points[1][1] };
      p2 = { x: activeCurveRef.points[2][0], y: activeCurveRef.points[2][1] };
    }

    if (typeof this.activeEasing === 'string') {
      if (this.activeEasing.startsWith('bounce(') || this.activeEasing.startsWith('custom-bounce:')) {
        currentMode = 'bounce';
        const m = this.activeEasing.match(/-?[\d.]+/g);
        if (m) {
          if (m[0]) bounceCount = Number(m[0]);
          if (m[1]) bounceDecay = Number(m[1]);
        }
      } else if (this.activeEasing === 'easeOutBounce' || this.activeEasing === 'bounce') {
        currentMode = 'bounce';
        bounceCount = 3;
        bounceDecay = 0.45;
      } else if (this.activeEasing.startsWith('spring(') || this.activeEasing.startsWith('custom-spring:')) {
        currentMode = 'spring';
        const m = this.activeEasing.match(/-?[\d.]+/g);
        if (m) {
          if (m[0]) springOsc = Number(m[0]);
          if (m[1]) springDamp = Number(m[1]);
        }
      } else if (this.activeEasing === 'easeOutElastic' || this.activeEasing === 'elastic') {
        currentMode = 'spring';
        springOsc = 3;
        springDamp = 0.4;
      } else if (this.activeEasing.startsWith('spline:')) {
        currentMode = 'spline';
        try {
          const parsed = JSON.parse(this.activeEasing.slice(7));
          if (Array.isArray(parsed) && parsed.length >= 2) splineNodes = parsed;
        } catch (_) {}
      } else if (this.activeEasing.startsWith('cubic-bezier') || this.activeEasing.startsWith('custom:')) {
        currentMode = 'bezier';
        const m = this.activeEasing.match(/-?[\d.]+/g);
        if (m && m.length >= 4) {
          p1 = { x: Math.max(0, Math.min(1, parseFloat(m[0]))), y: parseFloat(m[1]) };
          p2 = { x: Math.max(0, Math.min(1, parseFloat(m[2]))), y: parseFloat(m[3]) };
        }
      }
    }

    container.innerHTML = `
      <div class="ds-curve-editor-panel" style="display: flex; flex-direction: column; gap: 4px; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; padding: 4px 6px; box-sizing: border-box;">
        <div style="display: flex; gap: 3px; align-items: center; flex-shrink: 0;">
          <select id="ds-ce-preset-select" title="Shared curve presets" style="flex: 1; min-width: 70px; height: 23px; font-size: 10px; background: var(--bg-input); color: var(--text-bright); border: 1px solid var(--border); border-radius: 3px;"><option value="">New curve</option></select>
          <input id="ds-ce-preset-name" type="text" placeholder="Preset name" aria-label="Curve preset name" style="width: 90px; min-width: 50px; height: 23px; box-sizing: border-box; font-size: 10px; background: var(--bg-input); color: var(--text-bright); border: 1px solid var(--border); border-radius: 3px; padding: 2px 4px;">
          <button id="ds-ce-preset-new" class="btn-sm" title="Create a new curve" style="padding: 2px 5px;">New</button>
          <button id="ds-ce-preset-save" class="btn-sm" title="Save or update shared curve" style="padding: 2px 5px;">Save</button>
          <button id="ds-ce-preset-delete" class="btn-sm" title="Delete local curve" style="padding: 2px 5px; color: var(--danger);">×</button>
        </div>
        <!-- Mode Switcher Dropdown -->
        <div style="display: flex; gap: 4px; align-items: center; background: var(--bg-panel-sub); padding: 2px 5px; border-radius: var(--radius-sm); border: 1px solid var(--border); flex-shrink: 0;">
          <label style="font-size: 10px; font-weight: 700; color: var(--text-muted); flex: 0 0 38px;">Type</label>
          <select id="ds-ce-mode-select" style="flex: 1; height: 21px; font-size: 10.5px; padding: 1px 4px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-bright); font-weight: 600; font-family: var(--font-sans);">
            <option value="bezier">Bézier (Cubic)</option>
            <option value="bounce">Physics (Bounce)</option>
            <option value="spring">Physics (Spring)</option>
            <option value="spline">Catmull-Rom (Spline)</option>
          </select>
        </div>

        <!-- Sub-controls container -->
        <div id="ds-ce-controls-container" style="flex-shrink: 0;"></div>

        <!-- Canvas Graph Area -->
        <div style="background: var(--bg-canvas); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1px; display: flex; justify-content: center; position: relative; flex-shrink: 0; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
          <canvas id="ds-ce-canvas" width="260" height="72" style="cursor: crosshair; touch-action: none; border-radius: 2px; width: 100%; max-width: 260px; height: 72px; display: block;"></canvas>
        </div>

        <!-- Motion Preview Indicator -->
        <div style="padding: 2px 5px; background: var(--bg-panel-sub); border-radius: var(--radius-sm); border: 1px solid var(--border); display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <span style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Live:</span>
          <div style="flex: 1; height: 5px; background: var(--bg-input); border-radius: 3px; position: relative; overflow: hidden; border: 1px solid var(--border);">
            <div id="ds-ce-preview-dot" style="position: absolute; top: 0px; left: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--success); box-shadow: 0 0 4px var(--success);"></div>
          </div>
        </div>

        <!-- Actions & Status Footer -->
        <div style="margin-top: auto; padding-top: 3px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 3px; flex-shrink: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 2px;">
            <span style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Easing:</span>
            <span id="ds-ce-curve-str" style="color: var(--text-dim); font-family: var(--font-mono); font-size: 9px; overflow: hidden; text-overflow: ellipsis; max-width: 200px; white-space: nowrap; text-align: right;">...</span>
          </div>
          <button id="ds-ce-apply" class="btn-primary" style="width: 100%; padding: 3px 6px; font-weight: 700; font-size: 10px; cursor: pointer; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; gap: 4px;">
            <span>Apply to Keyframe</span>
          </button>
        </div>
      </div>
    `;

    const canvas = container.querySelector('#ds-ce-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const padX = 16, padY = 8;
    let yMin = -0.3, yMax = 1.3;

    const toPixelX = (x) => padX + x * (W - 2 * padX);
    const toPixelY = (y) => H - padY - ((y - yMin) / (yMax - yMin)) * (H - 2 * padY);
    const fromPixelX = (px) => Math.max(0, Math.min(1, (px - padX) / (W - 2 * padX)));
    const fromPixelY = (py) => Math.max(yMin, Math.min(yMax, yMin + (H - padY - py) / (H - 2 * padY) * (yMax - yMin)));

    const getCanvasCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || canvas.width);
      const scaleY = canvas.height / (rect.height || canvas.height);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    const controlsContainer = container.querySelector('#ds-ce-controls-container');
    const strLabel = container.querySelector('#ds-ce-curve-str');
    const previewDot = container.querySelector('#ds-ce-preview-dot');

    let draggingTarget = null;
    let currentCurveFn = solveCubicBezier(p1.x, p1.y, p2.x, p2.y);
    let curvePresetDirty = Boolean(activeCurveRef);

    const adjustCurveInputWidth = (inputEl) => {
      if (!inputEl) return;
      const valStr = String(inputEl.value ?? '');
      const charLen = Math.max(valStr.length, 3);
      inputEl.style.width = `${Math.max(34, charLen * 7.5 + 12)}px`;
    };

    const modeSelect = container.querySelector('#ds-ce-mode-select');
    if (modeSelect) {
      modeSelect.value = currentMode;
      modeSelect.onchange = (e) => {
        currentMode = e.target.value;
        updateControlsUI();
        syncGraph();
      };
    }

    const updateControlsUI = () => {
      if (modeSelect) modeSelect.value = currentMode;

      if (currentMode === 'bezier') {
        yMin = -0.3; yMax = 1.3;
        controlsContainer.innerHTML = `
          <div style="display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 4px;">
            <button class="ds-ce-preset" data-vals="0,0,1,1" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Linear</button>
            <button class="ds-ce-preset" data-vals="0.42,0,1,1" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Ease In</button>
            <button class="ds-ce-preset" data-vals="0,0,0.58,1" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Ease Out</button>
            <button class="ds-ce-preset" data-vals="0.42,0,0.58,1" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Ease In-Out</button>
            <button class="ds-ce-preset" data-vals="0.1,0.9,0.2,1" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Fast-Slow</button>
            <button class="ds-ce-preset" data-vals="0.34,1.56,0.64,1" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Overshoot</button>
            <button class="ds-ce-preset" data-vals="0.36,0,0.66,-0.56" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Anticipate</button>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: space-between; align-items: center; font-size: 10px; background: var(--bg-panel-sub); padding: 3px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 2px;">
              <span style="color: var(--accent); font-weight: bold; font-size: 9.5px;">P1:</span>
              <input id="ds-ce-x1" type="number" step="0.01" value="${Math.round(p1.x * 100) / 100}" style="min-width: 34px; background: var(--bg-input); color: var(--accent); border: 1px solid var(--border); border-radius: 3px; padding: 1px 2px; text-align: center; font-size: 9.5px; font-family: var(--font-mono); box-sizing: border-box;">
              <input id="ds-ce-y1" type="number" step="0.01" value="${Math.round(p1.y * 100) / 100}" style="min-width: 34px; background: var(--bg-input); color: var(--accent); border: 1px solid var(--border); border-radius: 3px; padding: 1px 2px; text-align: center; font-size: 9.5px; font-family: var(--font-mono); box-sizing: border-box;">
            </div>
            <div style="display: flex; align-items: center; gap: 2px;">
              <span style="color: var(--primary); font-weight: bold; font-size: 9.5px;">P2:</span>
              <input id="ds-ce-x2" type="number" step="0.01" value="${Math.round(p2.x * 100) / 100}" style="min-width: 34px; background: var(--bg-input); color: var(--primary); border: 1px solid var(--border); border-radius: 3px; padding: 1px 2px; text-align: center; font-size: 9.5px; font-family: var(--font-mono); box-sizing: border-box;">
              <input id="ds-ce-y2" type="number" step="0.01" value="${Math.round(p2.y * 100) / 100}" style="min-width: 34px; background: var(--bg-input); color: var(--primary); border: 1px solid var(--border); border-radius: 3px; padding: 1px 2px; text-align: center; font-size: 9.5px; font-family: var(--font-mono); box-sizing: border-box;">
            </div>
          </div>
        `;
        const ix1 = controlsContainer.querySelector('#ds-ce-x1');
        const iy1 = controlsContainer.querySelector('#ds-ce-y1');
        const ix2 = controlsContainer.querySelector('#ds-ce-x2');
        const iy2 = controlsContainer.querySelector('#ds-ce-y2');
        [ix1, iy1, ix2, iy2].forEach(adjustCurveInputWidth);

        controlsContainer.querySelectorAll('.ds-ce-preset').forEach(btn => {
          btn.onclick = () => {
            const [x1, y1, x2, y2] = btn.getAttribute('data-vals').split(',').map(Number);
            p1 = { x: x1, y: y1 }; p2 = { x: x2, y: y2 };
            if (ix1) { ix1.value = Math.round(p1.x * 100) / 100; adjustCurveInputWidth(ix1); }
            if (iy1) { iy1.value = Math.round(p1.y * 100) / 100; adjustCurveInputWidth(iy1); }
            if (ix2) { ix2.value = Math.round(p2.x * 100) / 100; adjustCurveInputWidth(ix2); }
            if (iy2) { iy2.value = Math.round(p2.y * 100) / 100; adjustCurveInputWidth(iy2); }
            syncGraph();
          };
        });

        if (ix1) ix1.oninput = () => { p1.x = Math.max(0, Math.min(1, parseFloat(ix1.value) || 0)); adjustCurveInputWidth(ix1); syncGraph(); };
        if (iy1) iy1.oninput = () => { p1.y = parseFloat(iy1.value) || 0; adjustCurveInputWidth(iy1); syncGraph(); };
        if (ix2) ix2.oninput = () => { p2.x = Math.max(0, Math.min(1, parseFloat(ix2.value) || 0)); adjustCurveInputWidth(ix2); syncGraph(); };
        if (iy2) iy2.oninput = () => { p2.y = parseFloat(iy2.value) || 0; adjustCurveInputWidth(iy2); syncGraph(); };
      } else if (currentMode === 'bounce') {
        yMin = -0.1; yMax = 1.1;
        controlsContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 3px; font-size: 10px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Bounces: <b id="lbl-bounce-cnt" style="color: var(--primary);">${bounceCount}</b></span>
              <input id="slider-bounce-cnt" type="range" min="1" max="6" step="1" value="${bounceCount}" style="width: 120px;">
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Decay: <b id="lbl-bounce-dec" style="color: var(--primary);">${Math.round(bounceDecay * 100)}%</b></span>
              <input id="slider-bounce-dec" type="range" min="0.15" max="0.80" step="0.05" value="${bounceDecay}" style="width: 120px;">
            </div>
            <div style="display: flex; gap: 3px; margin-top: 1px;">
              <button class="ds-ce-b-preset" data-b="2" data-d="0.4" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">2 Soft</button>
              <button class="ds-ce-b-preset" data-b="3" data-d="0.45" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">3 Standard</button>
              <button class="ds-ce-b-preset" data-b="4" data-d="0.55" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">4 Active</button>
              <button class="ds-ce-b-preset" data-b="5" data-d="0.65" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">5 Rubbery</button>
            </div>
          </div>
        `;
        const sb = controlsContainer.querySelector('#slider-bounce-cnt');
        const sd = controlsContainer.querySelector('#slider-bounce-dec');
        const lb = controlsContainer.querySelector('#lbl-bounce-cnt');
        const ld = controlsContainer.querySelector('#lbl-bounce-dec');
        sb.oninput = (e) => { bounceCount = Number(e.target.value); lb.textContent = bounceCount; syncGraph(); };
        sd.oninput = (e) => { bounceDecay = Number(e.target.value); ld.textContent = `${Math.round(bounceDecay * 100)}%`; syncGraph(); };
        controlsContainer.querySelectorAll('.ds-ce-b-preset').forEach(btn => {
          btn.onclick = () => {
            bounceCount = Number(btn.getAttribute('data-b'));
            bounceDecay = Number(btn.getAttribute('data-d'));
            sb.value = bounceCount; sd.value = bounceDecay;
            lb.textContent = bounceCount; ld.textContent = `${Math.round(bounceDecay * 100)}%`;
            syncGraph();
          };
        });
      } else if (currentMode === 'spring') {
        yMin = -0.4; yMax = 1.6;
        controlsContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 3px; font-size: 10px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Oscillations: <b id="lbl-spring-osc" style="color: var(--primary);">${springOsc}</b></span>
              <input id="slider-spring-osc" type="range" min="1" max="8" step="1" value="${springOsc}" style="width: 120px;">
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Damping: <b id="lbl-spring-damp" style="color: var(--primary);">${Math.round(springDamp * 100)}%</b></span>
              <input id="slider-spring-damp" type="range" min="0.10" max="0.90" step="0.05" value="${springDamp}" style="width: 120px;">
            </div>
            <div style="display: flex; gap: 3px; margin-top: 1px;">
              <button class="ds-ce-s-preset" data-o="2" data-d="0.7" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Subtle</button>
              <button class="ds-ce-s-preset" data-o="3" data-d="0.5" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Standard</button>
              <button class="ds-ce-s-preset" data-o="5" data-d="0.3" style="background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 3px; font-size: 8.5px; padding: 1px 4px; cursor: pointer;">Wild Jiggle</button>
            </div>
          </div>
        `;
        const so = controlsContainer.querySelector('#slider-spring-osc');
        const sd = controlsContainer.querySelector('#slider-spring-damp');
        const lo = controlsContainer.querySelector('#lbl-spring-osc');
        const ld = controlsContainer.querySelector('#lbl-spring-damp');
        so.oninput = (e) => { springOsc = Number(e.target.value); lo.textContent = springOsc; syncGraph(); };
        sd.oninput = (e) => { springDamp = Number(e.target.value); ld.textContent = `${Math.round(springDamp * 100)}%`; syncGraph(); };
        controlsContainer.querySelectorAll('.ds-ce-s-preset').forEach(btn => {
          btn.onclick = () => {
            springOsc = Number(btn.getAttribute('data-o'));
            springDamp = Number(btn.getAttribute('data-d'));
            so.value = springOsc; sd.value = springDamp;
            lo.textContent = springOsc; ld.textContent = `${Math.round(springDamp * 100)}%`;
            syncGraph();
          };
        });
      } else if (currentMode === 'spline') {
        yMin = -0.3; yMax = 1.3;
        controlsContainer.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; background: var(--bg-panel-sub); padding: 3px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="color: var(--text-dim); font-size: 9.5px;">Nodes:</span>
              <b style="color: var(--primary); font-size: 10px;">${splineNodes.length} pts</b>
            </div>
            <button id="btn-add-spline-node" class="btn-sm" style="font-size: 9.5px; padding: 1px 6px; font-weight: 600; cursor: pointer; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-bright);">+ node</button>
          </div>
          <div style="font-size: 9px; color: var(--text-muted); margin-top: 2px; padding: 0 1px;">Click &amp; drag nodes. Double-click canvas to insert.</div>
        `;
        controlsContainer.querySelector('#btn-add-spline-node').onclick = () => {
          const midX = 0.5;
          const newY = currentCurveFn(midX);
          splineNodes.push({ x: midX, y: newY, cpIn: { x: -0.08, y: 0 }, cpOut: { x: 0.08, y: 0 } });
          splineNodes.sort((a, b) => a.x - b.x);
          syncGraph();
          updateControlsUI();
        };
      }
    };

    const syncGraph = () => {
      curvePresetDirty = true;
      if (currentMode === 'bezier') {
        currentCurveFn = solveCubicBezier(p1.x, p1.y, p2.x, p2.y);
        if (strLabel) strLabel.textContent = `cubic-bezier(${Math.round(p1.x * 100) / 100}, ${Math.round(p1.y * 100) / 100}, ${Math.round(p2.x * 100) / 100}, ${Math.round(p2.y * 100) / 100})`;
      } else if (currentMode === 'bounce') {
        currentCurveFn = createBounceEasing(bounceCount, bounceDecay);
        if (strLabel) strLabel.textContent = `bounce(${bounceCount}, ${bounceDecay})`;
      } else if (currentMode === 'spring') {
        currentCurveFn = createSpringEasing(springOsc, springDamp);
        if (strLabel) strLabel.textContent = `spring(${springOsc}, ${springDamp})`;
      } else if (currentMode === 'spline') {
        currentCurveFn = createSplineEasing(splineNodes);
        if (strLabel) strLabel.textContent = `spline (${splineNodes.length} nodes)`;
      }
      drawCanvas();
    };

    const drawCanvas = () => {
      const computedStyles = typeof window !== 'undefined' ? getComputedStyle(document.body) : null;
      const isSkeuo = typeof document !== 'undefined' && document.body && (document.body.getAttribute('data-theme') === 'skeuo' || document.body.classList.contains('theme-skeuo'));
      const colBgCanvas = computedStyles ? (computedStyles.getPropertyValue('--bg-canvas').trim() || '#17191a') : '#17191a';
      const colBorder = computedStyles ? (computedStyles.getPropertyValue('--border').trim() || '#2e3234') : '#2e3234';
      const colBorderBright = computedStyles ? (computedStyles.getPropertyValue('--border-bright').trim() || '#484d50') : '#484d50';
      const colPrimary = computedStyles ? (computedStyles.getPropertyValue('--primary').trim() || '#fabd2f') : '#fabd2f';
      const colAccent = computedStyles ? (computedStyles.getPropertyValue('--accent').trim() || '#83a598') : '#83a598';
      const colText = computedStyles ? (computedStyles.getPropertyValue('--text').trim() || '#ebdbb2') : '#ebdbb2';
      const colSuccess = computedStyles ? (computedStyles.getPropertyValue('--success').trim() || '#b8bb26') : '#b8bb26';

      ctx.fillStyle = isSkeuo ? '#0a0c0f' : colBgCanvas;
      ctx.fillRect(0, 0, W, H);

      const x0 = toPixelX(0), y0 = toPixelY(0);
      const x1 = toPixelX(1), y1 = toPixelY(1);

      // Box 0..1
      const isLight = typeof document !== 'undefined' && document.body && (document.body.getAttribute('data-theme') === 'light' || document.body.classList.contains('theme-light'));
      ctx.fillStyle = isLight ? 'rgba(255,255,255,0.7)' : (isSkeuo ? 'rgba(56, 189, 248, 0.03)' : 'rgba(255,255,255,0.02)');
      ctx.fillRect(x0, y1, x1 - x0, y0 - y1);
      ctx.strokeStyle = isSkeuo ? 'rgba(56, 189, 248, 0.25)' : colBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);

      // Grid dividers
      ctx.strokeStyle = isSkeuo ? 'rgba(56, 189, 248, 0.12)' : colBorder;
      [0.25, 0.5, 0.75].forEach(v => {
        const gx = toPixelX(v), gy = toPixelY(v);
        ctx.beginPath(); ctx.moveTo(gx, y1); ctx.lineTo(gx, y0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
      });

      // Linear reference line
      ctx.strokeStyle = isSkeuo ? 'rgba(255, 255, 255, 0.18)' : colBorderBright;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]);

      if (currentMode === 'bezier') {
        const px1 = toPixelX(p1.x), py1 = toPixelY(p1.y);
        const px2 = toPixelX(p2.x), py2 = toPixelY(p2.y);

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = isSkeuo ? '#fabd2f' : colAccent;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(px1, py1); ctx.stroke();

        ctx.strokeStyle = isSkeuo ? '#38bdf8' : colPrimary;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(px2, py2); ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(px1, py1, px2, py2, x1, y1);
        ctx.strokeStyle = isSkeuo ? '#38bdf8' : colSuccess;
        ctx.lineWidth = 2;
        if (isSkeuo) {
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 4;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = colText;
        ctx.beginPath(); ctx.arc(x0, y0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = colAccent;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px1, py1, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        ctx.fillStyle = colPrimary;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px2, py2, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (currentMode === 'bounce' || currentMode === 'spring') {
        ctx.beginPath();
        const steps = 150;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const y = currentCurveFn(t);
          const px = toPixelX(t);
          const py = toPixelY(y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = currentMode === 'bounce' ? colPrimary : colAccent;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = colText;
        ctx.beginPath(); ctx.arc(x0, y0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
      } else if (currentMode === 'spline') {
        ctx.beginPath();
        const steps = 150;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const y = currentCurveFn(t);
          const px = toPixelX(t);
          const py = toPixelY(y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = colSuccess;
        ctx.lineWidth = 2;
        ctx.stroke();

        splineNodes.forEach((node, idx) => {
          const nx = toPixelX(node.x), ny = toPixelY(node.y);
          ctx.fillStyle = (idx === 0 || idx === splineNodes.length - 1) ? colText : colPrimary;
          ctx.strokeStyle = colBgCanvas;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(nx, ny, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    };

    ['bezier', 'bounce', 'spring', 'spline'].forEach(m => {
      const btn = container.querySelector(`#tab-mode-${m}`);
      if (btn) {
        btn.onclick = () => {
          currentMode = m;
          updateControlsUI();
          syncGraph();
        };
      }
    });

    const onPointerDown = (e) => {
      const coords = getCanvasCoords(e);
      const mx = coords.x;
      const my = coords.y;

      if (currentMode === 'bezier') {
        const px1 = toPixelX(p1.x), py1 = toPixelY(p1.y);
        const px2 = toPixelX(p2.x), py2 = toPixelY(p2.y);
        const d1 = Math.hypot(mx - px1, my - py1);
        const d2 = Math.hypot(mx - px2, my - py2);

        if (d1 <= 14) draggingTarget = 'p1';
        else if (d2 <= 14) draggingTarget = 'p2';
        else if (d1 < d2 && d1 < 25) draggingTarget = 'p1';
        else if (d2 <= d1 && d2 < 25) draggingTarget = 'p2';
      } else if (currentMode === 'spline') {
        for (let i = 0; i < splineNodes.length; i++) {
          const nx = toPixelX(splineNodes[i].x);
          const ny = toPixelY(splineNodes[i].y);
          if (Math.hypot(mx - nx, my - ny) <= 12) {
            draggingTarget = i;
            break;
          }
        }
      }

      if (draggingTarget !== null) {
        e.preventDefault();
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      }
    };

    const onPointerMove = (e) => {
      if (draggingTarget === null) return;
      const coords = getCanvasCoords(e);
      const nx = fromPixelX(coords.x);
      const ny = fromPixelY(coords.y);

      if (currentMode === 'bezier') {
        if (draggingTarget === 'p1') { p1.x = nx; p1.y = ny; }
        else if (draggingTarget === 'p2') { p2.x = nx; p2.y = ny; }
        const ix1 = controlsContainer.querySelector('#ds-ce-x1');
        const iy1 = controlsContainer.querySelector('#ds-ce-y1');
        const ix2 = controlsContainer.querySelector('#ds-ce-x2');
        const iy2 = controlsContainer.querySelector('#ds-ce-y2');
        if (ix1) { ix1.value = Math.round(p1.x * 100) / 100; adjustCurveInputWidth(ix1); }
        if (iy1) { iy1.value = Math.round(p1.y * 100) / 100; adjustCurveInputWidth(iy1); }
        if (ix2) { ix2.value = Math.round(p2.x * 100) / 100; adjustCurveInputWidth(ix2); }
        if (iy2) { iy2.value = Math.round(p2.y * 100) / 100; adjustCurveInputWidth(iy2); }
      } else if (currentMode === 'spline') {
        const idx = draggingTarget;
        if (idx === 0) {
          splineNodes[0].y = ny;
        } else if (idx === splineNodes.length - 1) {
          splineNodes[splineNodes.length - 1].y = ny;
        } else {
          splineNodes[idx].x = nx;
          splineNodes[idx].y = ny;
          splineNodes.sort((a, b) => a.x - b.x);
        }
      }
      syncGraph();
    };

    const onPointerUp = () => {
      draggingTarget = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    canvas.addEventListener('pointerdown', onPointerDown);

    canvas.addEventListener('dblclick', (e) => {
      if (currentMode === 'spline') {
        const coords = getCanvasCoords(e);
        const nx = fromPixelX(coords.x);
        const ny = fromPixelY(coords.y);
        splineNodes.push({ x: nx, y: ny, cpIn: { x: -0.06, y: 0 }, cpOut: { x: 0.06, y: 0 } });
        splineNodes.sort((a, b) => a.x - b.x);
        syncGraph();
        updateControlsUI();
      }
    });

    if (this._curveAnimId) cancelAnimationFrame(this._curveAnimId);
    let startTime = performance.now();
    const animLoop = (now) => {
      const elapsed = (now - startTime) % 1500;
      const progress = elapsed / 1500;
      const eased = currentCurveFn(progress);
      if (previewDot) {
        previewDot.style.left = `${Math.max(0, Math.min(240, eased * 240))}px`;
      }
      this._curveAnimId = requestAnimationFrame(animLoop);
    };
    this._curveAnimId = requestAnimationFrame(animLoop);

    const applyBtn = container.querySelector('#ds-ce-apply');
    if (applyBtn) {
      applyBtn.onclick = () => {
        const presetSelect = container.querySelector('#ds-ce-preset-select');
        const savedPresetId = presetSelect?.value;
        const resultCurve = savedPresetId && !curvePresetDirty ? `curve:${savedPresetId}` : getCurrentCurveValue();
        this.applyCurve(resultCurve);
      };
    }

    updateControlsUI();
    syncGraph();
    const presetSelect = container.querySelector('#ds-ce-preset-select');
    const presetName = container.querySelector('#ds-ce-preset-name');
    const deletePresetBtn = container.querySelector('#ds-ce-preset-delete');
    let selectedCurveId = activeCurveRef?.id || '';

    const getCurrentCurveValue = () => {
      if (currentMode === 'bezier') return `cubic-bezier(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y})`;
      if (currentMode === 'bounce') return `bounce(${bounceCount}, ${bounceDecay})`;
      if (currentMode === 'spring') return `spring(${springOsc}, ${springDamp})`;
      return `spline:${JSON.stringify(splineNodes)}`;
    };
    const refreshPresetList = (selectedId = selectedCurveId) => {
      if (!presetSelect) return;
      const curves = curveRegistry?.list?.('curve') || [];
      presetSelect.innerHTML = '<option value="">New curve</option>';
      curves.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
      curves.forEach(curve => {
        const option = document.createElement('option');
        option.value = curve.id;
        option.textContent = `${curve.name || curve.id}${curve.builtin ? ' · built-in' : ''}`;
        presetSelect.appendChild(option);
      });
      presetSelect.value = selectedId || '';
      const selected = curves.find(curve => curve.id === presetSelect.value);
      if (deletePresetBtn) deletePresetBtn.disabled = !selected || selected.builtin;
    };
    const loadPreset = (curve) => {
      if (!curve) return;
      selectedCurveId = curve.id;
      if (presetName) presetName.value = curve.name || '';
      const data = curve.editor || {};
      if (data.mode) {
        currentMode = data.mode;
        p1 = data.p1 || p1;
        p2 = data.p2 || p2;
        bounceCount = data.bounceCount ?? bounceCount;
        bounceDecay = data.bounceDecay ?? bounceDecay;
        springOsc = data.springOsc ?? springOsc;
        springDamp = data.springDamp ?? springDamp;
        splineNodes = data.splineNodes || splineNodes;
      } else if (curve.points?.length >= 4) {
        currentMode = 'bezier';
        p1 = { x: curve.points[1][0], y: curve.points[1][1] };
        p2 = { x: curve.points[2][0], y: curve.points[2][1] };
      } else if (curve.samples?.length > 1) {
        currentMode = 'spline';
        splineNodes = curve.samples.map((y, index, samples) => ({
          x: index / (samples.length - 1), y,
          ...(index > 0 ? { cpIn: { x: -1 / (samples.length - 1) / 3, y: 0 } } : {}),
          ...(index < samples.length - 1 ? { cpOut: { x: 1 / (samples.length - 1) / 3, y: 0 } } : {})
        }));
      }
      updateControlsUI();
      syncGraph();
      curvePresetDirty = false;
      refreshPresetList(curve.id);
    };

    refreshPresetList(selectedCurveId);
    if (selectedCurveId) {
      if (presetName) presetName.value = activeCurveRef?.name || '';
      curvePresetDirty = false;
    }
    presetSelect?.addEventListener('change', () => {
      const curve = curveRegistry?.get?.('curve', presetSelect.value);
      if (curve) loadPreset(curve);
      else {
        selectedCurveId = '';
        if (presetName) presetName.value = '';
        curvePresetDirty = true;
        if (deletePresetBtn) deletePresetBtn.disabled = true;
      }
    });
    container.querySelector('#ds-ce-preset-new')?.addEventListener('click', () => {
      selectedCurveId = '';
      currentMode = 'bezier';
      p1 = { x: 0.42, y: 0 };
      p2 = { x: 0.58, y: 1 };
      if (presetName) presetName.value = '';
      updateControlsUI();
      syncGraph();
      refreshPresetList('');
      if (deletePresetBtn) deletePresetBtn.disabled = true;
    });
    container.querySelector('#ds-ce-preset-save')?.addEventListener('click', () => {
      if (!curveRegistry?.register) return;
      const name = presetName?.value.trim();
      if (!name) { presetName?.focus(); return; }
      const existing = selectedCurveId ? curveRegistry.get('curve', selectedCurveId) : null;
      const id = existing && !existing.builtin
        ? existing.id
        : `local_curve_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const points = currentMode === 'bezier'
        ? [[0, 0], [p1.x, p1.y], [p2.x, p2.y], [1, 1]]
        : undefined;
      const samples = Array.from({ length: 65 }, (_, index) => Math.max(0, Math.min(1, currentCurveFn(index / 64))));
      curveRegistry.register('curve', {
        ...(existing && !existing.builtin ? existing : {}),
        $schema: 'esenho/curve/v1', id, name, builtin: false,
        type: points ? 'cubic_bezier' : 'sampled_curve',
        ...(points ? { points } : {}), samples,
        easing: getCurrentCurveValue(),
        editor: {
          mode: currentMode, p1: { ...p1 }, p2: { ...p2 }, bounceCount, bounceDecay,
          springOsc, springDamp, splineNodes: JSON.parse(JSON.stringify(splineNodes))
        }
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('esenho:registry-updated'));
      selectedCurveId = id;
      curvePresetDirty = false;
      refreshPresetList(id);
    });
    deletePresetBtn?.addEventListener('click', () => {
      const selected = selectedCurveId ? curveRegistry?.get?.('curve', selectedCurveId) : null;
      if (!selected || selected.builtin || !curveRegistry?.unregister?.('curve', selectedCurveId)) return;
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('esenho:registry-updated'));
      selectedCurveId = '';
      if (presetName) presetName.value = '';
      refreshPresetList('');
    });
  }

  openCurveEditorModal() {
    this.closeActiveMenu();
    if (typeof window !== 'undefined' && typeof window.openDockPanel === 'function') {
      window.openDockPanel('curves');
    }
    const curvesEl = typeof document !== 'undefined' ? document.getElementById('dock-panel-curves') : null;
    this.mountCurveEditor(curvesEl);
  }

  syncEasingUI() {
    const easingSelect = this.container.querySelector('#ds-select-easing');
    if (!easingSelect) return;

    const setSelectValue = (val) => {
      this.activeEasing = val;
      if (typeof val === 'string' && (val.startsWith('cubic-bezier') || val.startsWith('custom:'))) {
        easingSelect.value = 'custom';
      } else {
        easingSelect.value = val || 'linear';
      }
    };

    let targetId = this.selectedObjectId;
    if (!targetId && typeof window !== 'undefined' && window.doc) {
      const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects() : [];
      if (sel && sel.length > 0) targetId = sel[0].id;
    }

    if (targetId && this.ds.objects.has(targetId)) {
      const obj = this.ds.objects.get(targetId);
      if (obj.hasAnyKeyframeAt(this.ds.currentFrame)) {
        setSelectValue(obj.getKeyframeTweenAt(this.ds.currentFrame));
        return;
      }
    }

    const selectedKfs = this.ds.getSelectedKeyframes();
    if (selectedKfs.length > 0) {
      setSelectValue(selectedKfs[0].keyframe.tweenType || 'linear');
      return;
    }

    if (this.activeEasing) {
      setSelectValue(this.activeEasing);
    }
  }

  adjustInputWidth(inputEl) {
    if (!inputEl) return;
    const valStr = String(inputEl.value ?? '');
    const charLen = Math.max(valStr.length, 2);
    inputEl.style.width = `${Math.max(48, charLen * 8.5 + 20)}px`;
  }

  updatePlayhead() {
    const frameInput = this.container.querySelector('#ds-input-frame');
    if (frameInput) {
      frameInput.value = this.ds.currentFrame;
      this.adjustInputWidth(frameInput);
    }

    const playheadEl = this.container.querySelector('#ds-playhead');
    if (playheadEl) {
      const pos = (this.ds.currentFrame - 1) * this.frameWidth + this.frameWidth / 2;
      playheadEl.style.left = `${pos}px`;
    }
    this.syncEasingUI();
  }

  closeActiveMenu() {
    if (this._activeMenu) {
      this._activeMenu.remove();
      this._activeMenu = null;
    }
  }

  openAddParameterMenu(dObj, clientX, clientY) {
    this.closeActiveMenu();
    const menu = document.createElement('div');
    menu.className = 'ds-param-popup-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${Math.max(10, Math.min(window.innerWidth - 220, clientX - 20))}px`;
    menu.style.top = `${Math.max(10, Math.min(window.innerHeight - 260, clientY - 140))}px`;
    menu.style.width = '210px';
    menu.style.maxHeight = '280px';
    menu.style.overflowY = 'auto';
    menu.style.background = '#282828';
    menu.style.border = '1px solid #504945';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = '0 6px 20px rgba(0,0,0,0.7)';
    menu.style.zIndex = '99999';
    menu.style.padding = '4px 0';
    menu.style.fontSize = '11px';
    menu.style.color = '#ebdbb2';
    menu.style.userSelect = 'none';

    const groups = getParameterGroups();
    for (const [groupName, params] of Object.entries(groups)) {
      const header = document.createElement('div');
      header.style.padding = '4px 8px';
      header.style.fontWeight = 'bold';
      header.style.color = '#fabd2f';
      header.style.fontSize = '10px';
      header.style.borderBottom = '1px solid #3c3836';
      header.style.marginTop = '2px';
      header.textContent = groupName;
      menu.appendChild(header);

      for (const p of params) {
        const item = document.createElement('div');
        item.style.padding = '4px 10px';
        item.style.cursor = 'pointer';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        const hasTrack = dObj.channels.has(p.key);
        item.innerHTML = `<span>${p.label}</span><span style="font-size: 9px; color: ${hasTrack ? '#b8bb26' : '#7c6f64'}; font-weight: bold;">${hasTrack ? '✓' : '+'}</span>`;

        item.onmouseenter = () => item.style.background = '#3c3836';
        item.onmouseleave = () => item.style.background = 'transparent';

        item.onclick = (e) => {
          e.stopPropagation();
          let liveObj = null;
          if (typeof window !== 'undefined' && window.doc) {
            liveObj = window.doc.findObject ? window.doc.findObject(dObj.id) : null;
          }
          let initialVal = p.default;
          if (liveObj) {
            const props = extractLiveObjectProperties(liveObj);
            if (props[p.key] !== undefined) initialVal = props[p.key];
          }
          const ch = dObj.getOrCreateChannel(p.key, p.label, initialVal, p.type);
          if (ch.keyframes.length === 0) {
            ch.addKeyframe(this.ds.currentFrame, initialVal, this.activeEasing || 'linear');
          }
          dObj.collapsed = false;
          this.closeActiveMenu();
          this.updateGrid();
        };
        menu.appendChild(item);
      }
    }

    document.body.appendChild(menu);
    this._activeMenu = menu;

    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        this.closeActiveMenu();
        document.removeEventListener('pointerdown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', closeHandler), 10);
  }

  updateGrid() {
    const totalInput = this.container.querySelector('#ds-input-total');
    if (totalInput) {
      if (String(totalInput.value) !== String(this.ds.totalFrames)) {
        totalInput.value = this.ds.totalFrames;
      }
      this.adjustInputWidth(totalInput);
    }

    const totalW = Math.max(800, this.ds.totalFrames * this.frameWidth + 40);
    const treeRowsEl = this.container.querySelector('#ds-tree-rows');
    const rulerCanvas = this.container.querySelector('#ds-ruler-canvas');
    const gridCanvas = this.container.querySelector('#ds-grid-canvas');
    if (!treeRowsEl || !rulerCanvas || !gridCanvas) return;

    // Helper for property group icon
    const getParamIcon = (key) => {
      const def = PARAMETER_REGISTRY[key] || {};
      const grp = def.group || '';
      if (grp === 'Transform') {
        if (key === 'rotation') return '↻';
        if (key === 'scaleX' || key === 'scaleY') return '📐';
        if (key === 'opacity') return '👁';
        return '⌖';
      }
      if (grp === 'Fill & Paint' || grp === 'Stroke' || def.type === 'color') return '🎨';
      if (grp === 'Brush Dynamics') return '🖌';
      if (grp === 'Geometry' || grp === 'Vector Path') return '∿';
      if (grp === 'Filters & Lens FX') return '✨';
      if (grp === 'Typography') return 'T';
      return '●';
    };

    // 1. Build List of Display Rows (Filtered to SELECTED objects and all their recursive group members)
    const displayRows = [];
    const processedIds = new Set();

    const addObjectRow = (obj, live = null, depth = 0) => {
      if (!obj || processedIds.has(obj.id)) return;
      processedIds.add(obj.id);

      let label = obj.name;
      let objType = obj.targetType || 'vector';
      if (live) {
        if (live.name) {
          obj.name = live.name;
          label = live.name;
        }
        if (live.type) {
          objType = live.type;
        }
      }

      const activeChannels = Array.from(obj.channels.values()).filter(ch => ch.keyframes.length > 0);
      const isTracksCollapsed = (obj.collapsed === true);

      displayRows.push({
        type: 'object',
        object: obj,
        liveObj: live,
        id: obj.id,
        label,
        objType,
        depth: depth || 0,
        activeChannels,
        tracksCollapsed: isTracksCollapsed,
        height: 26
      });

      // Channel sub-tracks of THIS object (if tracks are expanded)
      if (!isTracksCollapsed && activeChannels.length > 0) {
        for (const ch of activeChannels) {
          displayRows.push({
            type: 'channel',
            object: obj,
            channel: ch,
            paramKey: ch.paramKey,
            id: `${obj.id}:${ch.paramKey}`,
            label: ch.label || ch.paramKey,
            depth: (depth || 0) + 1,
            height: 22
          });
        }
      }
    };

    const processObjectAndChildren = (live, depth = 0) => {
      if (!live) return;
      const dObj = this.ds.getOrCreateObject(live.id, live.name || `${live.type} ${live.id}`, live.type === 'group' ? 'group' : 'vector');
      addObjectRow(dObj, live, depth);
      if (live.type === 'group' && Array.isArray(live.children)) {
        for (const child of live.children) {
          processObjectAndChildren(child, depth + 1);
        }
      }
    };

    let selectedObjs = [];
    if (typeof window !== 'undefined' && window.doc && typeof window.doc.getSelectedObjects === 'function') {
      selectedObjs = window.doc.getSelectedObjects();
    } else if (this.selectedObjectId) {
      let liveObj = null;
      if (typeof window !== 'undefined' && window.doc && typeof window.doc.findObject === 'function') {
        liveObj = window.doc.findObject(this.selectedObjectId);
      }
      const dObj = this.ds.objects.get(this.selectedObjectId);
      if (liveObj) {
        selectedObjs = [liveObj];
      } else if (dObj) {
        selectedObjs = [dObj];
      }
    }

    if (selectedObjs.length > 0) {
      for (const live of selectedObjs) {
        processObjectAndChildren(live, 0);
      }
    }

    // Compute cumulative Y offsets for every row
    let currentY = 0;
    displayRows.forEach(r => {
      r.y = currentY;
      currentY += r.height;
    });
    this._displayRows = displayRows;
    const containerH = this.container ? (this.container.clientHeight || 180) : 180;
    const totalH = Math.max(containerH - 58, currentY);

    // 2. Render Left Sidebar DOM Rows
    treeRowsEl.innerHTML = '';
    if (displayRows.length === 0) {
      treeRowsEl.innerHTML = `
        <div style="padding: 18px 12px; text-align: center; color: var(--text-muted); font-size: 10.5px; line-height: 1.4;">
          No selection<br>
          <span style="font-size: 9.5px; color: var(--text-dim);">Select an object in Scene or Canvas to view its tracks</span>
        </div>
      `;
    } else {
      displayRows.forEach((r, idx) => {
        const rowEl = document.createElement('div');
        rowEl.style.height = `${r.height}px`;
        rowEl.style.display = 'flex';
        rowEl.style.alignItems = 'center';
        rowEl.style.borderBottom = '1px solid var(--border-subtle, rgba(255,255,255,0.05))';
        rowEl.style.boxSizing = 'border-box';
        rowEl.style.cursor = 'pointer';

        if (r.type === 'object') {
          const isSelected = (r.object.id === this.selectedObjectId && !this.selectedParamKey);
          const indent = (r.depth || 0) * 12 + 8;
          rowEl.style.padding = `0 8px 0 ${indent}px`;
          if (isSelected) {
            rowEl.style.background = 'var(--primary-dim, rgba(250, 189, 47, 0.16))';
            rowEl.style.borderLeft = '3px solid var(--primary)';
          } else {
            rowEl.style.background = (idx % 2 === 0 ? 'var(--bg-panel)' : 'var(--bg-panel-sub)');
            rowEl.style.borderLeft = '3px solid transparent';
          }

          const getIcon = (type) => {
            switch (type) {
              case 'rect': return '▭';
              case 'circle': return '○';
              case 'ellipse': return '⬭';
              case 'star': return '★';
              case 'polygon': return '⬡';
              case 'path': return '∿';
              case 'text': return 'T';
              case 'image': return '🖼';
              case 'camera': return '📷';
              case 'brush_preset': return '🖌';
              case 'group': return '⊞';
              default: return '◈';
            }
          };

          const icon = getIcon(r.objType);
          const isGroup = (r.objType === 'group');
          const hasSubtracks = r.activeChannels.length > 0;

          const tracksToggleHtml = hasSubtracks
            ? `<span class="ds-tracks-toggle" title="${r.tracksCollapsed ? 'Expand Parameter Tracks' : 'Collapse Parameter Tracks'}" style="font-size: 9px; width: 12px; text-align: center; color: var(--primary); cursor: pointer; margin-right: 4px;">${r.tracksCollapsed ? '▶' : '▼'}</span>`
            : `<span class="ds-tracks-toggle" style="font-size: 9px; width: 12px; text-align: center; color: transparent; cursor: default; margin-right: 4px;"></span>`;

          rowEl.innerHTML = `
            ${tracksToggleHtml}
            <span style="font-size: 11px; margin-right: 4px; color: ${isGroup ? 'var(--primary)' : 'var(--accent)'}; width: 14px; text-align: center;">${icon}</span>
            <span class="ds-obj-name" style="font-weight: 600; color: ${isSelected ? 'var(--primary)' : 'var(--text)'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-size: 10.5px;" title="${r.label}">${r.label}</span>
            <span class="ds-del-track-btn" title="Clear Keyframes for Object" style="color: var(--text-muted); font-size: 11px; cursor: pointer; padding: 0 4px; margin-left: 4px;">✕</span>
          `;

          const tracksToggleBtn = rowEl.querySelector('.ds-tracks-toggle');
          if (tracksToggleBtn && hasSubtracks) {
            tracksToggleBtn.onclick = (e) => {
              e.stopPropagation();
              r.object.collapsed = !r.tracksCollapsed;
              this.updateGrid();
            };
          }

          rowEl.onclick = () => {
            this.selectedObjectId = r.object.id;
            this.selectedParamKey = null;
            if (typeof window !== 'undefined' && window.doc) {
              if (window.doc.select) window.doc.select(r.object.id);
              if (window.render) window.render();
              if (window.updateInspector) window.updateInspector();
              if (window.drawOverlay) window.drawOverlay();
            }
            this.syncEasingUI();
            this.updateGrid();
          };

          const delBtn = rowEl.querySelector('.ds-del-track-btn');
          if (delBtn) {
            delBtn.onmouseenter = () => delBtn.style.color = 'var(--danger)';
            delBtn.onmouseleave = () => delBtn.style.color = 'var(--text-muted)';
            delBtn.onclick = (e) => {
              e.stopPropagation();
              r.object.channels.clear();
              if (this.selectedObjectId === r.object.id) {
                this.selectedParamKey = null;
              }
              if (typeof window !== 'undefined') {
                if (window.render) window.render();
                if (window.updateInspector) window.updateInspector();
                if (window.drawOverlay) window.drawOverlay();
              }
              this.updateGrid();
            };
          }
        } else {
          // Channel sub-track row
          const isSelected = (r.object.id === this.selectedObjectId && this.selectedParamKey === r.paramKey);
          const indent = (r.depth || 1) * 12 + 12;
          rowEl.style.padding = `0 8px 0 ${indent}px`;
          if (isSelected) {
            rowEl.style.background = 'var(--accent-dim, rgba(131, 165, 152, 0.16))';
            rowEl.style.borderLeft = '3px solid var(--accent)';
          } else {
            rowEl.style.background = 'var(--bg-panel-sub)';
            rowEl.style.borderLeft = '3px solid transparent';
          }

          const pIcon = getParamIcon(r.paramKey);

          rowEl.innerHTML = `
            <span style="font-size: 10px; margin-right: 4px; color: var(--text-muted); width: 12px; text-align: center;">${pIcon}</span>
            <span style="color: ${isSelected ? 'var(--primary)' : 'var(--text-dim)'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-size: 10px;" title="${r.label}">${r.label}</span>
            <span class="ds-del-channel-btn" title="Remove parameter track" style="color: var(--text-muted); font-size: 10px; cursor: pointer; padding: 0 4px; margin-left: 4px;">✕</span>
          `;

          rowEl.onclick = () => {
            this.selectedObjectId = r.object.id;
            this.selectedParamKey = r.paramKey;
            if (typeof window !== 'undefined' && window.doc) {
              if (window.doc.select) window.doc.select(r.object.id);
              if (window.render) window.render();
              if (window.updateInspector) window.updateInspector();
              if (window.drawOverlay) window.drawOverlay();
            }
            this.syncEasingUI();
            this.updateGrid();
          };

          const delChanBtn = rowEl.querySelector('.ds-del-channel-btn');
          if (delChanBtn) {
            delChanBtn.onmouseenter = () => delChanBtn.style.color = 'var(--danger)';
            delChanBtn.onmouseleave = () => delChanBtn.style.color = 'var(--text-muted)';
            delChanBtn.onclick = (e) => {
              e.stopPropagation();
              r.object.removeChannel(r.paramKey);
              if (this.selectedParamKey === r.paramKey) {
                this.selectedParamKey = null;
              }
              this.updateGrid();
            };
          }
        }

        treeRowsEl.appendChild(rowEl);
      });
    }

    // 3. Render Ruler Canvas
    const computedStyles = typeof window !== 'undefined' ? getComputedStyle(document.body) : null;
    const colBgPanel = computedStyles ? (computedStyles.getPropertyValue('--bg-panel').trim() || '#1e2021') : '#1e2021';
    const colBgPanelSub = computedStyles ? (computedStyles.getPropertyValue('--bg-panel-sub').trim() || '#252829') : '#252829';
    const colBgDark = computedStyles ? (computedStyles.getPropertyValue('--bg-dark').trim() || '#141617') : '#141617';
    const colBorder = computedStyles ? (computedStyles.getPropertyValue('--border').trim() || '#2e3234') : '#2e3234';
    const colBorderBright = computedStyles ? (computedStyles.getPropertyValue('--border-bright').trim() || '#484d50') : '#484d50';
    const colTextMuted = computedStyles ? (computedStyles.getPropertyValue('--text-muted').trim() || '#928374') : '#928374';
    const colPrimary = computedStyles ? (computedStyles.getPropertyValue('--primary').trim() || '#fabd2f') : '#fabd2f';
    const colAccent = computedStyles ? (computedStyles.getPropertyValue('--accent').trim() || '#83a598') : '#83a598';
    const colDanger = computedStyles ? (computedStyles.getPropertyValue('--danger').trim() || '#fb4934') : '#fb4934';

    rulerCanvas.width = totalW;
    rulerCanvas.height = 24;
    const rctx = rulerCanvas.getContext('2d');
    rctx.fillStyle = colBgPanelSub;
    rctx.fillRect(0, 0, totalW, 24);
    rctx.strokeStyle = colBorder;
    rctx.fillStyle = colTextMuted;
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
    gctx.fillStyle = colBgDark;
    gctx.fillRect(0, 0, totalW, totalH);

    // Helper for easing curve diamond colors
    const getEasingColor = (tweenType) => {
      if (!tweenType || tweenType === 'linear') return colAccent;
      if (typeof tweenType === 'string' && (tweenType.startsWith('cubic-bezier') || tweenType.startsWith('custom:'))) {
        return colPrimary;
      }
      switch (tweenType) {
        case 'easeIn':
        case 'easeInQuad':
        case 'easeInCubic':
        case 'easeInSine': return colPrimary;
        case 'easeOut':
        case 'easeOutQuad':
        case 'easeOutCubic':
        case 'easeOutSine': return '#b8bb26';
        case 'easeInOut':
        case 'easeInOutQuad':
        case 'easeInOutCubic':
        case 'easeInOutSine': return '#fe8019';
        case 'bounce':
        case 'easeOutBounce':
        case 'easeInOutBounce':
        case 'elastic':
        case 'easeInElastic':
        case 'easeOutElastic': return '#d3869b';
        case 'step':
        case 'none': return '#8ec07c';
        default:
          return colAccent;
      }
    };

    // Grid vertical frame dividers
    gctx.strokeStyle = colBorder;
    gctx.lineWidth = 0.75;
    for (let f = 1; f <= this.ds.totalFrames; f++) {
      const x = (f - 1) * this.frameWidth;
      gctx.beginPath();
      gctx.moveTo(x, 0);
      gctx.lineTo(x, totalH);
      gctx.stroke();
    }

    // Draw row backgrounds, span lines & keyframe diamonds
    displayRows.forEach((r, idx) => {
      const y = r.y;
      const rH = r.height;

      if (r.type === 'object') {
        const isSelectedObj = (r.object.id === this.selectedObjectId && !this.selectedParamKey);
        gctx.fillStyle = isSelectedObj ? 'rgba(250, 189, 47, 0.08)' : (idx % 2 === 0 ? 'rgba(128,128,128,0.03)' : 'rgba(128,128,128,0.07)');
        gctx.fillRect(0, y, totalW, rH);
        gctx.strokeStyle = colBorder;
        gctx.strokeRect(0, y, totalW, rH);

        const kfFrames = r.object.getKeyframeFrames();
        if (kfFrames.length > 0) {
          const firstF = kfFrames[0];
          const lastF = kfFrames[kfFrames.length - 1];
          if (firstF < lastF) {
            // Active animation span bar between first and last keyframe
            const x1 = (firstF - 1) * this.frameWidth + this.frameWidth / 2;
            const x2 = (lastF - 1) * this.frameWidth + this.frameWidth / 2;
            const cy = y + rH / 2;
            gctx.strokeStyle = isSelectedObj ? 'rgba(250, 189, 47, 0.45)' : 'rgba(131, 165, 152, 0.3)';
            gctx.lineWidth = 3;
            gctx.beginPath();
            gctx.moveTo(x1, cy);
            gctx.lineTo(x2, cy);
            gctx.stroke();
          }

          // Draw Summary Keyframe Diamonds
          for (const f of kfFrames) {
            const kx = (f - 1) * this.frameWidth + this.frameWidth / 2;
            const ky = y + rH / 2;
            const size = 5.5;
            const tween = r.object.getKeyframeTweenAt(f);
            const isSelectedKf = r.object.isKeyframeSelectedAt(f);

            gctx.fillStyle = isSelectedKf ? colDanger : getEasingColor(tween);
            gctx.strokeStyle = isSelectedKf ? '#ffffff' : colBgDark;
            gctx.lineWidth = isSelectedKf ? 1.8 : 1.2;

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
      } else {
        // Channel sub-track row
        const isSelectedChan = (r.object.id === this.selectedObjectId && this.selectedParamKey === r.paramKey);
        gctx.fillStyle = isSelectedChan ? 'rgba(250, 189, 47, 0.12)' : (idx % 2 === 0 ? 'rgba(128,128,128,0.02)' : 'rgba(128,128,128,0.05)');
        gctx.fillRect(0, y, totalW, rH);
        gctx.strokeStyle = colBorder;
        gctx.strokeRect(0, y, totalW, rH);

        const chKeyframes = r.channel.keyframes;
        if (chKeyframes.length > 0) {
          const firstF = chKeyframes[0].frame;
          const lastF = chKeyframes[chKeyframes.length - 1].frame;
          if (firstF < lastF) {
            const x1 = (firstF - 1) * this.frameWidth + this.frameWidth / 2;
            const x2 = (lastF - 1) * this.frameWidth + this.frameWidth / 2;
            const cy = y + rH / 2;
            gctx.strokeStyle = isSelectedChan ? 'rgba(250, 189, 47, 0.35)' : 'rgba(100, 120, 115, 0.25)';
            gctx.lineWidth = 2;
            gctx.beginPath();
            gctx.moveTo(x1, cy);
            gctx.lineTo(x2, cy);
            gctx.stroke();
          }

          // Draw Channel-Specific Keyframe Diamonds
          for (const kf of chKeyframes) {
            const f = kf.frame;
            const kx = (f - 1) * this.frameWidth + this.frameWidth / 2;
            const ky = y + rH / 2;
            const size = 4.5;
            const tween = kf.tweenType || 'linear';
            const isSelectedKf = !!kf.selected;

            gctx.fillStyle = isSelectedKf ? colDanger : getEasingColor(tween);
            gctx.strokeStyle = isSelectedKf ? '#ffffff' : colBgDark;
            gctx.lineWidth = isSelectedKf ? 1.6 : 1.0;

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
      }
    });

    this.updatePlayhead();
    this.updateAutoKeyframeUI();
  }
}
