/**
 * =========================================================================
 * Wesenho DopeSheet UI Widget (src/anim/dopesheet_ui.js)
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
      <div class="dopesheet-panel" style="display: flex; flex-direction: column; height: 100%; width: 100%; background: #1d2021; color: #ebdbb2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; font-size: 11px; border-top: 2px solid #3c3836; user-select: none; box-sizing: border-box; position: relative;">
        
        <!-- Top Invisible Resize Hit-area -->
        <div id="ds-resize-handle" title="Drag vertically to resize Timeline height" style="position: absolute; top: -6px; left: 0; right: 0; height: 10px; cursor: ns-resize; z-index: 100; background: transparent;"></div>

        <!-- Header Toolbar -->
        <div class="ds-toolbar" style="display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: #282828; border-bottom: 1px solid #3c3836; flex-wrap: wrap; z-index: 30;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <button id="ds-btn-prev" class="ds-btn" title="Previous Keyframe (Shift+Click for 1 frame)" style="background: #3c3836; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; cursor: pointer;">⏮</button>
            <button id="ds-btn-play" class="ds-btn" title="Play / Pause (Space)" style="background: #d79921; color: #282828; font-weight: bold; border: 1px solid #fabd2f; border-radius: 4px; padding: 3px 12px; cursor: pointer;">▶</button>
            <button id="ds-btn-next" class="ds-btn" title="Next Keyframe (Shift+Click for 1 frame)" style="background: #3c3836; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; cursor: pointer;">⏭</button>
            <button id="ds-btn-loop" class="ds-btn" title="Toggle Loop" style="background: ${this.ds.loop ? '#458588' : '#3c3836'}; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 8px; font-weight: 600; font-size: 10px; cursor: pointer;">Loop</button>
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
            <input id="ds-input-fps" type="number" min="1" max="240" step="1" value="${this.ds.fps}" style="width: 44px; background: #1d2021; color: #ebdbb2; border: 1px solid #504945; border-radius: 3px; padding: 2px 4px; text-align: center;">
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <span>Curve:</span>
            <select id="ds-select-easing" title="Easing Curve for Keyframe(s)" style="background: #1d2021; color: #ebdbb2; border: 1px solid #504945; border-radius: 3px; padding: 2px 4px; font-size: 11px;">
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
            </select>
            <button id="ds-btn-custom-curve" class="ds-btn" title="Open Bézier Curve Visual Graph Editor" style="background: #3c3836; color: #fabd2f; border: 1px solid #504945; border-radius: 3px; padding: 2px 6px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 3px;">
              <span>Edit</span>
            </button>
          </div>

          <div style="height: 16px; width: 1px; background: #504945; margin: 0 4px;"></div>

          <button id="ds-btn-add-kf" class="ds-btn" title="Add Keyframe at Current Frame" style="background: #b8bb26; color: #282828; font-weight: bold; border: 1px solid #b8bb26; border-radius: 4px; padding: 3px 8px; cursor: pointer;">◆ Add Keyframe</button>
          <button id="ds-btn-del-kf" class="ds-btn" title="Remove Keyframe" style="background: #ea6962; color: #282828; font-weight: bold; border: 1px solid #ea6962; border-radius: 4px; padding: 3px 8px; cursor: pointer;">◇ Remove</button>
          
          <button id="ds-btn-autokf" class="ds-btn" title="Toggle Auto-Keyframe Recording" style="background: ${this.ds.autoKeyframe ? '#cc241d' : '#3c3836'}; color: ${this.ds.autoKeyframe ? '#ffffff' : '#ebdbb2'}; border: 1px solid ${this.ds.autoKeyframe ? '#fb4934' : '#504945'}; border-radius: 4px; padding: 3px 10px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: bold; margin-left: auto;">
            <span id="ds-autokf-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${this.ds.autoKeyframe ? '#fb4934' : '#7c6f64'}; box-shadow: ${this.ds.autoKeyframe ? '0 0 6px #fb4934' : 'none'};"></span>
            Auto-Keyframe
          </button>
          <button id="ds-btn-collapse-timeline" class="ds-btn" title="Collapse Timeline (Shift+T)" style="background: #3c3836; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 3px 7px; font-size: 10px; cursor: pointer; margin-left: 6px;">▼</button>
        </div>

        <!-- Main Body: Split View (Object Tracks List on Left, Timeline Grid on Right) -->
        <div id="ds-body" style="display: flex; flex: 1; min-height: 0; position: relative; overflow: hidden;">
          
          <!-- Left: Objects / Layers Sidebar -->
          <div id="ds-tree-sidebar" style="width: 290px; min-width: 230px; max-width: 420px; background: #282828; border-right: 1px solid #3c3836; display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden;">
            <!-- Tree Header (Matches 24px ruler height exactly) -->
            <div style="height: 24px; min-height: 24px; padding: 0 6px; background: #32302f; border-bottom: 1px solid #3c3836; font-weight: bold; color: #a89984; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
              <span style="font-size: 10px; font-weight: bold; color: #ebdbb2;">OBJECTS &amp; LAYERS</span>
              <div style="display: flex; align-items: center; gap: 3px;">
                <button id="ds-btn-hdr-group" title="Group Selected (Ctrl+G)" style="background: #282828; color: #ebdbb2; border: 1px solid #504945; border-radius: 2px; font-size: 9px; padding: 1px 4px; cursor: pointer;">Group</button>
                <button id="ds-btn-hdr-ungroup" title="Ungroup Selected (Ctrl+Shift+G)" style="background: #282828; color: #ebdbb2; border: 1px solid #504945; border-radius: 2px; font-size: 9px; padding: 1px 4px; cursor: pointer;">Ungroup</button>
                <button id="ds-btn-hdr-top" title="Bring to Front" style="background: #282828; color: #ebdbb2; border: 1px solid #504945; border-radius: 2px; font-size: 9px; padding: 1px 3px; cursor: pointer;">⬆</button>
                <button id="ds-btn-hdr-bot" title="Send to Bottom" style="background: #282828; color: #ebdbb2; border: 1px solid #504945; border-radius: 2px; font-size: 9px; padding: 1px 3px; cursor: pointer;">⬇</button>
              </div>
            </div>
            <!-- Scrollable Track Labels Container -->
            <div id="ds-tree-scroll" style="flex: 1; overflow-y: hidden; overflow-x: hidden; position: relative;">
              <div id="ds-tree-rows"></div>
            </div>
          </div>

          <!-- Right: Timeline Grid & Ruler Scrollable View -->
          <div id="ds-timeline-scroll" style="flex: 1; overflow: auto; position: relative; background: #1d2021;">
            
            <!-- Timeline Ruler (Top Sticky) -->
            <div id="ds-ruler-container" style="position: sticky; top: 0; left: 0; height: 24px; background: #32302f; border-bottom: 1px solid #3c3836; z-index: 10; cursor: pointer; width: max-content;">
              <canvas id="ds-ruler-canvas" style="display: block; height: 24px;"></canvas>
            </div>

            <!-- Grid Keyframe Rows -->
            <div id="ds-grid-rows" style="position: relative; width: max-content; cursor: crosshair;">
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
    // ── Isolate Timeline completely from Canvas Underlying Events ──
    const stopEvt = (e) => e.stopPropagation();
    const eventsToStop = [
      'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
      'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'contextmenu',
      'wheel', 'touchstart', 'touchmove', 'touchend'
    ];
    eventsToStop.forEach(evtName => {
      this.container.addEventListener(evtName, stopEvt);
    });

    // ── Resizable Dock Height ──
    try {
      const savedH = localStorage.getItem('wesenho_timeline_height');
      if (savedH && Number(savedH) >= 100) {
        this.container.style.height = `${Number(savedH)}px`;
      }
    } catch (_) {}

    const resizeHandle = this.container.querySelector('#ds-resize-handle');
    if (resizeHandle) {
      let isResizing = false;
      let startY = 0;
      let startH = 0;

      const onResizeMove = (e) => {
        if (!isResizing) return;
        e.stopPropagation();
        e.preventDefault();
        const dy = startY - e.clientY;
        const maxH = Math.max(200, window.innerHeight - 80);
        const newH = Math.max(100, Math.min(maxH, startH + dy));
        this.container.style.height = `${newH}px`;
        try {
          localStorage.setItem('wesenho_timeline_height', String(newH));
        } catch (_) {}
      };

      const onResizeUp = (e) => {
        if (isResizing) {
          e.stopPropagation();
          e.preventDefault();
          isResizing = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('pointermove', onResizeMove, { capture: true });
          window.removeEventListener('pointerup', onResizeUp, { capture: true });
          this.updateGrid();
        }
      };

      resizeHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isResizing = true;
        startY = e.clientY;
        startH = this.container.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onResizeMove, { capture: true });
        window.addEventListener('pointerup', onResizeUp, { capture: true });
      });
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
    const prevBtn = this.container.querySelector('#ds-btn-prev');
    const nextBtn = this.container.querySelector('#ds-btn-next');
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
    prevBtn.onclick = (e) => {
      if (e && e.shiftKey) {
        this.ds.prevFrame();
      } else {
        this.ds.prevKeyframe(this.selectedObjectId);
      }
    };
    nextBtn.onclick = (e) => {
      if (e && e.shiftKey) {
        this.ds.nextFrame();
      } else {
        this.ds.nextKeyframe(this.selectedObjectId);
      }
    };
    loopBtn.onclick = () => {
      this.ds.loop = !this.ds.loop;
      loopBtn.style.background = this.ds.loop ? '#458588' : '#3c3836';
    };
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
    frameInput.onchange = (e) => this.ds.setFrame(Number(e.target.value));
    totalInput.onchange = (e) => {
      this.ds.totalFrames = Math.max(1, Number(e.target.value));
      this.updateGrid();
    };
    if (fpsInput) {
      fpsInput.oninput = (e) => {
        const val = Math.max(1, Math.min(240, Number(e.target.value) || 24));
        this.ds.fps = val;
      };
      fpsInput.onchange = (e) => {
        const val = Math.max(1, Math.min(240, Number(e.target.value) || 24));
        this.ds.fps = val;
        fpsInput.value = val;
      };
    }
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

    const btnHdrGroup = this.container.querySelector('#ds-btn-hdr-group');
    if (btnHdrGroup) {
      btnHdrGroup.onclick = (e) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && window.doc && window.doc.groupSelected) {
          window.doc.groupSelected();
          if (window.render) window.render();
          if (window.updateInspector) window.updateInspector();
          this.updateGrid();
        }
      };
    }

    const btnHdrUngroup = this.container.querySelector('#ds-btn-hdr-ungroup');
    if (btnHdrUngroup) {
      btnHdrUngroup.onclick = (e) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && window.doc && window.doc.ungroupSelected) {
          window.doc.ungroupSelected();
          if (window.render) window.render();
          if (window.updateInspector) window.updateInspector();
          this.updateGrid();
        }
      };
    }

    const btnHdrTop = this.container.querySelector('#ds-btn-hdr-top');
    if (btnHdrTop) {
      btnHdrTop.onclick = (e) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && window.doc) {
          const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects()[0] : null;
          if (sel && window.doc.bringToFront) {
            window.doc.bringToFront(sel.id);
            if (window.render) window.render();
            if (window.updateInspector) window.updateInspector();
            this.updateGrid();
          }
        }
      };
    }

    const btnHdrBot = this.container.querySelector('#ds-btn-hdr-bot');
    if (btnHdrBot) {
      btnHdrBot.onclick = (e) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && window.doc) {
          const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects()[0] : null;
          if (sel && window.doc.sendToBack) {
            window.doc.sendToBack(sel.id);
            if (window.render) window.render();
            if (window.updateInspector) window.updateInspector();
            this.updateGrid();
          }
        }
      };
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

    // Dismiss active popup menus on outside click
    window.addEventListener('pointerdown', () => {
      this.closeActiveMenu();
    });
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

  openCurveEditorModal() {
    this.closeActiveMenu();

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

    const overlay = document.createElement('div');
    overlay.className = 'ds-curve-editor-backdrop';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.65)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.backdropFilter = 'blur(4px)';

    const modal = document.createElement('div');
    modal.className = 'ds-curve-editor-modal';
    modal.style.background = '#282828';
    modal.style.border = '1px solid #504945';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 16px 40px rgba(0,0,0,0.85)';
    modal.style.padding = '14px';
    modal.style.width = '370px';
    modal.style.color = '#ebdbb2';
    modal.style.fontFamily = 'monospace, sans-serif';
    modal.style.userSelect = 'none';

    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #3c3836; padding-bottom: 6px;">
        <div style="font-weight: bold; color: #fabd2f; font-size: 13px; display: flex; align-items: center; gap: 6px;">
          Visual Curve & Physics Graph Editor
        </div>
        <button id="ds-ce-close" style="background: none; border: none; color: #a89984; font-size: 16px; cursor: pointer; padding: 0 4px;">✕</button>
      </div>

      <!-- Mode Switcher Tabs -->
      <div style="display: flex; gap: 4px; margin-bottom: 8px; background: #1d2021; padding: 3px; border-radius: 5px; border: 1px solid #3c3836;">
        <button id="tab-mode-bezier" class="ds-ce-tab" style="flex: 1; background: #3c3836; color: #fabd2f; font-weight: bold; border: none; border-radius: 3px; font-size: 10px; padding: 4px; cursor: pointer;">Bézier</button>
        <button id="tab-mode-bounce" class="ds-ce-tab" style="flex: 1; background: transparent; color: #a89984; border: none; border-radius: 3px; font-size: 10px; padding: 4px; cursor: pointer;">Bounce</button>
        <button id="tab-mode-spring" class="ds-ce-tab" style="flex: 1; background: transparent; color: #a89984; border: none; border-radius: 3px; font-size: 10px; padding: 4px; cursor: pointer;">Spring</button>
        <button id="tab-mode-spline" class="ds-ce-tab" style="flex: 1; background: transparent; color: #a89984; border: none; border-radius: 3px; font-size: 10px; padding: 4px; cursor: pointer;">Spline</button>
      </div>

      <!-- Sub-controls container -->
      <div id="ds-ce-controls-container" style="margin-bottom: 8px;"></div>

      <!-- Canvas Graph Area -->
      <div style="background: #1d2021; border: 1px solid #3c3836; border-radius: 6px; padding: 4px; display: flex; justify-content: center; position: relative;">
        <canvas id="ds-ce-canvas" width="340" height="230" style="cursor: crosshair; touch-action: none; border-radius: 4px;"></canvas>
      </div>

      <!-- Motion Preview Indicator -->
      <div style="margin-top: 8px; padding: 5px 8px; background: #1d2021; border-radius: 4px; border: 1px solid #3c3836;">
        <div style="font-size: 10px; color: #a89984; display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Motion Preview:</span>
          <span id="ds-ce-curve-str" style="color: #fabd2f; font-family: monospace; font-size: 10px; overflow: hidden; text-overflow: ellipsis; max-width: 220px; white-space: nowrap;">...</span>
        </div>
        <div style="height: 12px; background: #282828; border-radius: 6px; position: relative; overflow: hidden; border: 1px solid #504945;">
          <div id="ds-ce-preview-dot" style="position: absolute; top: 1px; left: 0; width: 8px; height: 8px; border-radius: 50%; background: #b8bb26; box-shadow: 0 0 6px #b8bb26;"></div>
        </div>
      </div>

      <!-- Actions -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
        <div id="ds-ce-sub-actions"></div>
        <div style="display: flex; gap: 6px;">
          <button id="ds-ce-cancel" style="background: #3c3836; color: #ebdbb2; border: 1px solid #504945; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 11px;">Cancel</button>
          <button id="ds-ce-apply" style="background: #fabd2f; color: #282828; font-weight: bold; border: 1px solid #fabd2f; border-radius: 4px; padding: 4px 14px; cursor: pointer; font-size: 11px;">Apply Curve</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const canvas = modal.querySelector('#ds-ce-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const padX = 35, padY = 35;
    let yMin = -0.3, yMax = 1.3;

    const toPixelX = (x) => padX + x * (W - 2 * padX);
    const toPixelY = (y) => H - padY - ((y - yMin) / (yMax - yMin)) * (H - 2 * padY);
    const fromPixelX = (px) => Math.max(0, Math.min(1, (px - padX) / (W - 2 * padX)));
    const fromPixelY = (py) => Math.max(yMin, Math.min(yMax, yMin + (H - padY - py) / (H - 2 * padY) * (yMax - yMin)));

    const controlsContainer = modal.querySelector('#ds-ce-controls-container');
    const subActionsContainer = modal.querySelector('#ds-ce-sub-actions');
    const strLabel = modal.querySelector('#ds-ce-curve-str');
    const previewDot = modal.querySelector('#ds-ce-preview-dot');

    let draggingTarget = null; // 'p1', 'p2', node index, etc.
    let currentCurveFn = solveCubicBezier(p1.x, p1.y, p2.x, p2.y);

    const updateControlsUI = () => {
      // Tab highlights
      ['bezier', 'bounce', 'spring', 'spline'].forEach(m => {
        const tab = modal.querySelector(`#tab-mode-${m}`);
        if (tab) {
          const active = currentMode === m;
          tab.style.background = active ? '#3c3836' : 'transparent';
          tab.style.color = active ? '#fabd2f' : '#a89984';
          tab.style.fontWeight = active ? 'bold' : 'normal';
        }
      });

      subActionsContainer.innerHTML = '';

      if (currentMode === 'bezier') {
        yMin = -0.3; yMax = 1.3;
        controlsContainer.innerHTML = `
          <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
            <button class="ds-ce-preset" data-vals="0,0,1,1" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;">Linear</button>
            <button class="ds-ce-preset" data-vals="0.42,0,1,1" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;">Ease In</button>
            <button class="ds-ce-preset" data-vals="0,0,0.58,1" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;">Ease Out</button>
            <button class="ds-ce-preset" data-vals="0.42,0,0.58,1" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;">Ease In-Out</button>
            <button class="ds-ce-preset" data-vals="0.1,0.9,0.2,1" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;">Fast-Slow</button>
            <button class="ds-ce-preset" data-vals="0.34,1.56,0.64,1" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;">Spring Overshoot</button>
            <button class="ds-ce-preset" data-vals="0.36,0,0.66,-0.56" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;">Anticipate</button>
          </div>
          <div style="display: flex; gap: 8px; justify-content: space-between; font-size: 11px;">
            <div style="display: flex; align-items: center; gap: 3px;">
              <span style="color: #83a598; font-weight: bold;">P1:</span>
              <input id="ds-ce-x1" type="number" step="0.01" value="${Math.round(p1.x * 100) / 100}" style="width: 48px; background: #1d2021; color: #83a598; border: 1px solid #504945; border-radius: 3px; padding: 1px; text-align: center;">
              <input id="ds-ce-y1" type="number" step="0.01" value="${Math.round(p1.y * 100) / 100}" style="width: 48px; background: #1d2021; color: #83a598; border: 1px solid #504945; border-radius: 3px; padding: 1px; text-align: center;">
            </div>
            <div style="display: flex; align-items: center; gap: 3px;">
              <span style="color: #fe8019; font-weight: bold;">P2:</span>
              <input id="ds-ce-x2" type="number" step="0.01" value="${Math.round(p2.x * 100) / 100}" style="width: 48px; background: #1d2021; color: #fe8019; border: 1px solid #504945; border-radius: 3px; padding: 1px; text-align: center;">
              <input id="ds-ce-y2" type="number" step="0.01" value="${Math.round(p2.y * 100) / 100}" style="width: 48px; background: #1d2021; color: #fe8019; border: 1px solid #504945; border-radius: 3px; padding: 1px; text-align: center;">
            </div>
          </div>
        `;
        controlsContainer.querySelectorAll('.ds-ce-preset').forEach(btn => {
          btn.onclick = () => {
            const [x1, y1, x2, y2] = btn.getAttribute('data-vals').split(',').map(Number);
            p1 = { x: x1, y: y1 }; p2 = { x: x2, y: y2 };
            syncGraph();
          };
        });
        const ix1 = controlsContainer.querySelector('#ds-ce-x1');
        const iy1 = controlsContainer.querySelector('#ds-ce-y1');
        const ix2 = controlsContainer.querySelector('#ds-ce-x2');
        const iy2 = controlsContainer.querySelector('#ds-ce-y2');
        if (ix1) ix1.oninput = () => { p1.x = Math.max(0, Math.min(1, parseFloat(ix1.value) || 0)); syncGraph(); };
        if (iy1) iy1.oninput = () => { p1.y = parseFloat(iy1.value) || 0; syncGraph(); };
        if (ix2) ix2.oninput = () => { p2.x = Math.max(0, Math.min(1, parseFloat(ix2.value) || 0)); syncGraph(); };
        if (iy2) iy2.oninput = () => { p2.y = parseFloat(iy2.value) || 0; syncGraph(); };
      } else if (currentMode === 'bounce') {
        yMin = -0.1; yMax = 1.1;
        controlsContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Bounces: <b id="lbl-bounce-cnt" style="color: #fabd2f;">${bounceCount}</b></span>
              <input id="slider-bounce-cnt" type="range" min="1" max="6" step="1" value="${bounceCount}" style="width: 170px;">
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Decay / Restitution: <b id="lbl-bounce-dec" style="color: #fabd2f;">${Math.round(bounceDecay * 100)}%</b></span>
              <input id="slider-bounce-dec" type="range" min="0.15" max="0.80" step="0.05" value="${bounceDecay}" style="width: 170px;">
            </div>
            <div style="display: flex; gap: 4px; margin-top: 2px;">
              <button class="ds-ce-b-preset" data-b="2" data-d="0.4" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 5px; cursor: pointer;">2 Soft</button>
              <button class="ds-ce-b-preset" data-b="3" data-d="0.45" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 5px; cursor: pointer;">3 Standard</button>
              <button class="ds-ce-b-preset" data-b="4" data-d="0.55" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 5px; cursor: pointer;">4 Active</button>
              <button class="ds-ce-b-preset" data-b="5" data-d="0.65" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 5px; cursor: pointer;">5 Rubbery</button>
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
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Oscillations: <b id="lbl-spring-osc" style="color: #fabd2f;">${springOsc}</b></span>
              <input id="slider-spring-osc" type="range" min="1" max="8" step="1" value="${springOsc}" style="width: 170px;">
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Damping: <b id="lbl-spring-damp" style="color: #fabd2f;">${Math.round(springDamp * 100)}%</b></span>
              <input id="slider-spring-damp" type="range" min="0.10" max="0.90" step="0.05" value="${springDamp}" style="width: 170px;">
            </div>
            <div style="display: flex; gap: 4px; margin-top: 2px;">
              <button class="ds-ce-s-preset" data-o="2" data-d="0.7" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 5px; cursor: pointer;">Subtle</button>
              <button class="ds-ce-s-preset" data-o="3" data-d="0.5" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 5px; cursor: pointer;">Standard</button>
              <button class="ds-ce-s-preset" data-o="5" data-d="0.3" style="background: #1d2021; color: #a89984; border: 1px solid #3c3836; border-radius: 3px; font-size: 9px; padding: 2px 5px; cursor: pointer;">Wild Jiggle</button>
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
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
            <span>Freeform Nodes: <b>${splineNodes.length} points</b></span>
            <button id="btn-add-spline-node" style="background: #b8bb26; color: #282828; font-weight: bold; border: none; border-radius: 3px; font-size: 10px; padding: 2px 6px; cursor: pointer;">+ Add Node</button>
          </div>
          <div style="font-size: 9px; color: #7c6f64; margin-top: 2px;">Click & drag nodes on graph. Double-click on canvas to insert point.</div>
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
      if (currentMode === 'bezier') {
        currentCurveFn = solveCubicBezier(p1.x, p1.y, p2.x, p2.y);
        strLabel.textContent = `cubic-bezier(${Math.round(p1.x * 100) / 100}, ${Math.round(p1.y * 100) / 100}, ${Math.round(p2.x * 100) / 100}, ${Math.round(p2.y * 100) / 100})`;
      } else if (currentMode === 'bounce') {
        currentCurveFn = createBounceEasing(bounceCount, bounceDecay);
        strLabel.textContent = `bounce(${bounceCount}, ${bounceDecay})`;
      } else if (currentMode === 'spring') {
        currentCurveFn = createSpringEasing(springOsc, springDamp);
        strLabel.textContent = `spring(${springOsc}, ${springDamp})`;
      } else if (currentMode === 'spline') {
        currentCurveFn = createSplineEasing(splineNodes);
        strLabel.textContent = `spline (${splineNodes.length} nodes)`;
      }
      drawCanvas();
    };

    const drawCanvas = () => {
      ctx.fillStyle = '#1d2021';
      ctx.fillRect(0, 0, W, H);

      const x0 = toPixelX(0), y0 = toPixelY(0);
      const x1 = toPixelX(1), y1 = toPixelY(1);

      // Box 0..1
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(x0, y1, x1 - x0, y0 - y1);
      ctx.strokeStyle = '#3c3836';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);

      // Grid dividers
      ctx.strokeStyle = '#282828';
      [0.25, 0.5, 0.75].forEach(v => {
        const gx = toPixelX(v), gy = toPixelY(v);
        ctx.beginPath(); ctx.moveTo(gx, y1); ctx.lineTo(gx, y0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
      });

      // Linear reference line
      ctx.strokeStyle = '#504945';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]);

      if (currentMode === 'bezier') {
        const px1 = toPixelX(p1.x), py1 = toPixelY(p1.y);
        const px2 = toPixelX(p2.x), py2 = toPixelY(p2.y);

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#83a598';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(px1, py1); ctx.stroke();

        ctx.strokeStyle = '#fe8019';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(px2, py2); ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(px1, py1, px2, py2, x1, y1);
        ctx.strokeStyle = '#b8bb26';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#ebdbb2';
        ctx.beginPath(); ctx.arc(x0, y0, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#83a598';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px1, py1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#fe8019';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px2, py2, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (currentMode === 'bounce' || currentMode === 'spring') {
        // High-res sampled curve
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
        ctx.strokeStyle = currentMode === 'bounce' ? '#fabd2f' : '#d3869b';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Start / end dots
        ctx.fillStyle = '#ebdbb2';
        ctx.beginPath(); ctx.arc(x0, y0, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, Math.PI * 2); ctx.fill();
      } else if (currentMode === 'spline') {
        // Render piecewise spline
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
        ctx.strokeStyle = '#8ec07c';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Render spline nodes
        splineNodes.forEach((node, idx) => {
          const nx = toPixelX(node.x), ny = toPixelY(node.y);
          ctx.fillStyle = (idx === 0 || idx === splineNodes.length - 1) ? '#ebdbb2' : '#fabd2f';
          ctx.strokeStyle = '#1d2021';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(nx, ny, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    };

    // Mode Tab Buttons Click
    ['bezier', 'bounce', 'spring', 'spline'].forEach(m => {
      modal.querySelector(`#tab-mode-${m}`).onclick = () => {
        currentMode = m;
        updateControlsUI();
        syncGraph();
      };
    });

    // Pointer Dragging on Graph Canvas
    const onPointerDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (currentMode === 'bezier') {
        const px1 = toPixelX(p1.x), py1 = toPixelY(p1.y);
        const px2 = toPixelX(p2.x), py2 = toPixelY(p2.y);
        const d1 = Math.hypot(mx - px1, my - py1);
        const d2 = Math.hypot(mx - px2, my - py2);

        if (d1 <= 14) draggingTarget = 'p1';
        else if (d2 <= 14) draggingTarget = 'p2';
        else if (d1 < d2 && d1 < 30) draggingTarget = 'p1';
        else if (d2 <= d1 && d2 < 30) draggingTarget = 'p2';
      } else if (currentMode === 'spline') {
        // Find nearest spline node
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
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const nx = fromPixelX(mx);
      const ny = fromPixelY(my);

      if (currentMode === 'bezier') {
        if (draggingTarget === 'p1') { p1.x = nx; p1.y = ny; }
        else if (draggingTarget === 'p2') { p2.x = nx; p2.y = ny; }
        const ix1 = controlsContainer.querySelector('#ds-ce-x1');
        const iy1 = controlsContainer.querySelector('#ds-ce-y1');
        const ix2 = controlsContainer.querySelector('#ds-ce-x2');
        const iy2 = controlsContainer.querySelector('#ds-ce-y2');
        if (ix1) ix1.value = Math.round(p1.x * 100) / 100;
        if (iy1) iy1.value = Math.round(p1.y * 100) / 100;
        if (ix2) ix2.value = Math.round(p2.x * 100) / 100;
        if (iy2) iy2.value = Math.round(p2.y * 100) / 100;
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
        const rect = canvas.getBoundingClientRect();
        const nx = fromPixelX(e.clientX - rect.left);
        const ny = fromPixelY(e.clientY - rect.top);
        splineNodes.push({ x: nx, y: ny, cpIn: { x: -0.06, y: 0 }, cpOut: { x: 0.06, y: 0 } });
        splineNodes.sort((a, b) => a.x - b.x);
        syncGraph();
        updateControlsUI();
      }
    });

    // Animation preview simulation loop
    let animRunning = true;
    let startTime = performance.now();
    const animLoop = (now) => {
      if (!animRunning) return;
      const elapsed = (now - startTime) % 1500;
      const progress = elapsed / 1500;
      const eased = currentCurveFn(progress);
      if (previewDot) {
        previewDot.style.left = `${Math.max(0, Math.min(300, eased * 300))}px`;
      }
      requestAnimationFrame(animLoop);
    };
    requestAnimationFrame(animLoop);

    const closeModal = () => {
      animRunning = false;
      overlay.remove();
    };

    modal.querySelector('#ds-ce-close').onclick = closeModal;
    modal.querySelector('#ds-ce-cancel').onclick = closeModal;
    overlay.onpointerdown = (e) => {
      if (e.target === overlay) closeModal();
    };

    modal.querySelector('#ds-ce-apply').onclick = () => {
      let resultCurve = 'linear';
      if (currentMode === 'bezier') {
        resultCurve = `cubic-bezier(${Math.round(p1.x * 100) / 100}, ${Math.round(p1.y * 100) / 100}, ${Math.round(p2.x * 100) / 100}, ${Math.round(p2.y * 100) / 100})`;
      } else if (currentMode === 'bounce') {
        resultCurve = `bounce(${bounceCount}, ${bounceDecay})`;
      } else if (currentMode === 'spring') {
        resultCurve = `spring(${springOsc}, ${springDamp})`;
      } else if (currentMode === 'spline') {
        resultCurve = `spline:${JSON.stringify(splineNodes)}`;
      }
      closeModal();
      this.applyCurve(resultCurve);
    };

    updateControlsUI();
    syncGraph();
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

  updatePlayhead() {
    const frameInput = this.container.querySelector('#ds-input-frame');
    if (frameInput) frameInput.value = this.ds.currentFrame;

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

    // 1. Build List of Display Rows (Objects and their active/modified Channel sub-tracks in Hierarchy order)
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
      const isGroupCollapsed = live ? (live.collapsed === true) : (obj.groupCollapsed === true);

      displayRows.push({
        type: 'object',
        object: obj,
        liveObj: live,
        id: obj.id,
        label,
        objType,
        depth,
        activeChannels,
        tracksCollapsed: isTracksCollapsed,
        groupCollapsed: isGroupCollapsed,
        height: 26
      });

      // 1. Channel sub-tracks of THIS object (if tracks are expanded)
      if (!isTracksCollapsed && activeChannels.length > 0) {
        for (const ch of activeChannels) {
          displayRows.push({
            type: 'channel',
            object: obj,
            channel: ch,
            paramKey: ch.paramKey,
            id: `${obj.id}:${ch.paramKey}`,
            label: ch.label || ch.paramKey,
            depth: depth + 1,
            height: 22
          });
        }
      }

      // 2. Child objects if this is a group (if group hierarchy is expanded)
      if (live && live.type === 'group' && Array.isArray(live.children)) {
        if (!isGroupCollapsed) {
          for (const child of live.children) {
            const childDObj = this.ds.getOrCreateObject(child.id, child.name || `${child.type} ${child.id}`, child.type === 'group' ? 'group' : 'vector');
            addObjectRow(childDObj, child, depth + 1);
          }
        }
      }
    };

    if (typeof window !== 'undefined' && window.doc && Array.isArray(window.doc.objects)) {
      for (const live of window.doc.objects) {
        const dObj = this.ds.getOrCreateObject(live.id, live.name || `${live.type} ${live.id}`, live.type === 'group' ? 'group' : 'vector');
        addObjectRow(dObj, live, 0);
      }
    }

    // Add any remaining objects in this.ds.objects (e.g. camera, audio, or external tracks)
    for (const obj of this.ds.objects.values()) {
      if (!processedIds.has(obj.id)) {
        let live = null;
        if (typeof window !== 'undefined' && window.doc) {
          live = window.doc.findObject ? window.doc.findObject(obj.id) : null;
        }
        addObjectRow(obj, live, 0);
      }
    }

    // Compute cumulative Y offsets for every row
    let currentY = 0;
    displayRows.forEach(r => {
      r.y = currentY;
      currentY += r.height;
    });
    this._displayRows = displayRows;
    const totalH = Math.max(120, currentY);

    // 2. Render Left Sidebar DOM Rows
    treeRowsEl.innerHTML = '';
    displayRows.forEach((r, idx) => {
      const rowEl = document.createElement('div');
      rowEl.style.height = `${r.height}px`;
      rowEl.style.display = 'flex';
      rowEl.style.alignItems = 'center';
      rowEl.style.borderBottom = '1px solid #32302f';
      rowEl.style.boxSizing = 'border-box';
      rowEl.style.cursor = 'pointer';

      if (r.type === 'object') {
        let liveObj = r.liveObj || null;
        if (!liveObj && typeof window !== 'undefined' && window.doc) {
          liveObj = window.doc.findObject ? window.doc.findObject(r.object.id) : null;
        }
        const isVisible = liveObj ? (liveObj.visible !== false) : true;
        const isLocked = liveObj ? (liveObj.locked === true) : false;

        const isSelected = (r.object.id === this.selectedObjectId && !this.selectedParamKey);
        const depthPad = r.depth ? (r.depth * 14) : 0;
        rowEl.style.padding = `0 6px 0 ${6 + depthPad}px`;
        if (isSelected) {
          rowEl.style.background = '#3c3836';
          rowEl.style.borderLeft = '3px solid #fabd2f';
        } else {
          rowEl.style.background = (idx % 2 === 0 ? '#282828' : '#242424');
          rowEl.style.borderLeft = '3px solid transparent';
        }

        const kfFrames = r.object.getKeyframeFrames();
        const kfCount = kfFrames.length;

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

        const groupToggleHtml = isGroup
          ? `<span class="ds-group-toggle" title="${r.groupCollapsed ? 'Expand Group (Show child objects)' : 'Collapse Group (Hide child objects)'}" style="font-size: 9px; width: 12px; text-align: center; color: #a89984; cursor: pointer; margin-right: 2px;">${r.groupCollapsed ? '▶' : '▼'}</span>`
          : `<span class="ds-group-toggle" style="font-size: 9px; width: 12px; text-align: center; color: transparent; cursor: default; margin-right: 2px;"></span>`;

        const tracksToggleHtml = hasSubtracks
          ? `<span class="ds-tracks-toggle" title="${r.tracksCollapsed ? 'Expand Parameter Tracks' : 'Collapse Parameter Tracks'}" style="font-size: 9px; width: 12px; text-align: center; color: #fabd2f; cursor: pointer; margin-left: 2px; margin-right: 4px;">${r.tracksCollapsed ? '▶' : '▼'}</span>`
          : `<span class="ds-tracks-toggle" style="font-size: 9px; width: 12px; text-align: center; color: transparent; cursor: default; margin-left: 2px; margin-right: 4px;"></span>`;

        rowEl.innerHTML = `
          ${groupToggleHtml}
          <span style="font-size: 11px; margin-right: 4px; color: ${isGroup ? '#fabd2f' : '#83a598'}; width: 14px; text-align: center;">${icon}</span>
          <span class="ds-obj-name" style="font-weight: bold; color: ${isSelected ? '#fabd2f' : (isGroup ? '#ebdbb2' : '#d5c4a1')}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-size: 11px;" title="${r.label} (Double-click to rename)">${r.label}</span>
          ${tracksToggleHtml}
          <span class="ds-vis-btn" title="Toggle Visibility" style="font-size: 10px; margin-right: 3px; opacity: ${isVisible ? '0.9' : '0.3'}; cursor: pointer; padding: 0 2px;">${isVisible ? '👁' : '👁‍🗨'}</span>
          <span class="ds-lock-btn" title="Toggle Lock" style="font-size: 10px; margin-right: 3px; opacity: ${isLocked ? '1.0' : '0.3'}; color: ${isLocked ? '#ea6962' : 'inherit'}; cursor: pointer; padding: 0 2px;">${isLocked ? '🔒' : '🔓'}</span>
          <span class="ds-add-param-btn" title="Add Parameter Track (+)" style="font-size: 11px; margin-right: 3px; color: #fabd2f; font-weight: bold; cursor: pointer; padding: 0 2px;">＋</span>
          <span style="font-size: 8px; color: ${kfCount > 0 ? '#b8bb26' : '#7c6f64'}; margin-right: 4px; font-weight: ${kfCount > 0 ? 'bold' : 'normal'};" title="${kfCount} keyframes across ${r.activeChannels.length} track(s)">${hasSubtracks ? `${r.activeChannels.length} trk` : (kfCount > 0 ? `${kfCount} kf` : '')}</span>
          <span class="ds-del-track-btn" title="Delete Object" style="color: #7c6f64; font-size: 11px; cursor: pointer; padding: 0 2px;">✕</span>
        `;

        const groupToggleBtn = rowEl.querySelector('.ds-group-toggle');
        if (groupToggleBtn && isGroup) {
          groupToggleBtn.onclick = (e) => {
            e.stopPropagation();
            const newCollapsed = !r.groupCollapsed;
            r.object.groupCollapsed = newCollapsed;
            if (liveObj) liveObj.collapsed = newCollapsed;
            this.updateGrid();
          };
        }

        const tracksToggleBtn = rowEl.querySelector('.ds-tracks-toggle');
        if (tracksToggleBtn && hasSubtracks) {
          tracksToggleBtn.onclick = (e) => {
            e.stopPropagation();
            r.object.collapsed = !r.tracksCollapsed;
            this.updateGrid();
          };
        }

        const visBtn = rowEl.querySelector('.ds-vis-btn');
        if (visBtn) {
          visBtn.onclick = (e) => {
            e.stopPropagation();
            if (liveObj) {
              liveObj.visible = !liveObj.visible;
              if (window.render) window.render();
              if (window.updateInspector) window.updateInspector();
              this.updateGrid();
            }
          };
        }

        const lockBtn = rowEl.querySelector('.ds-lock-btn');
        if (lockBtn) {
          lockBtn.onclick = (e) => {
            e.stopPropagation();
            if (liveObj) {
              liveObj.locked = !liveObj.locked;
              if (window.render) window.render();
              if (window.updateInspector) window.updateInspector();
              this.updateGrid();
            }
          };
        }

        const addParamBtn = rowEl.querySelector('.ds-add-param-btn');
        if (addParamBtn) {
          addParamBtn.onclick = (e) => {
            e.stopPropagation();
            this.openAddParameterMenu(r.object, e.clientX, e.clientY);
          };
        }

        // Inline double-click to rename
        const nameSpan = rowEl.querySelector('.ds-obj-name');
        if (nameSpan) {
          nameSpan.ondblclick = (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = r.label;
            input.style.fontSize = '10px';
            input.style.width = '80px';
            input.style.background = '#1d2021';
            input.style.color = '#fabd2f';
            input.style.border = '1px solid #fabd2f';
            input.style.borderRadius = '2px';
            input.style.padding = '0 2px';

            const saveName = () => {
              const val = input.value.trim();
              if (val && val !== r.label) {
                r.object.name = val;
                if (liveObj) {
                  liveObj.name = val;
                  if (typeof window !== 'undefined' && window.doc && window.doc.pushHistory) {
                    window.doc.pushHistory(`Rename to ${val}`);
                  }
                }
                this.ds.renameObject(r.object.id, val);
                if (window.updateInspector) window.updateInspector();
              }
              this.updateGrid();
            };

            input.onblur = saveName;
            input.onkeydown = (ev) => {
              if (ev.key === 'Enter') saveName();
              if (ev.key === 'Escape') this.updateGrid();
            };

            nameSpan.replaceWith(input);
            input.focus();
            input.select();
          };
        }

        // Drag & Drop reordering
        rowEl.draggable = true;
        rowEl.ondragstart = (e) => {
          this._dragSourceId = r.object.id;
          rowEl.style.opacity = '0.5';
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', r.object.id);
        };
        rowEl.ondragend = () => {
          this._dragSourceId = null;
          rowEl.style.opacity = '1.0';
          this.container.querySelectorAll('.ds-drop-top, .ds-drop-bottom, .ds-drop-inside').forEach(el => {
            el.classList.remove('ds-drop-top', 'ds-drop-bottom', 'ds-drop-inside');
          });
        };
        rowEl.ondragover = (e) => {
          e.preventDefault();
          if (!this._dragSourceId || this._dragSourceId === r.object.id) return;
          const rect = rowEl.getBoundingClientRect();
          const relY = (e.clientY - rect.top) / rect.height;
          rowEl.classList.remove('ds-drop-top', 'ds-drop-bottom', 'ds-drop-inside');
          if (r.objType === 'group') {
            if (relY < 0.25) rowEl.classList.add('ds-drop-top');
            else if (relY > 0.75) rowEl.classList.add('ds-drop-bottom');
            else rowEl.classList.add('ds-drop-inside');
          } else {
            if (relY < 0.5) rowEl.classList.add('ds-drop-top');
            else rowEl.classList.add('ds-drop-bottom');
          }
        };
        rowEl.ondragleave = () => {
          rowEl.classList.remove('ds-drop-top', 'ds-drop-bottom', 'ds-drop-inside');
        };
        rowEl.ondrop = (e) => {
          e.preventDefault();
          if (!this._dragSourceId || this._dragSourceId === r.object.id) return;
          const rect = rowEl.getBoundingClientRect();
          const relY = (e.clientY - rect.top) / rect.height;
          let dropPos = 'above';
          if (r.objType === 'group') {
            if (relY < 0.25) dropPos = 'above';
            else if (relY > 0.75) dropPos = 'below';
            else dropPos = 'inside';
          } else {
            dropPos = relY < 0.5 ? 'above' : 'below';
          }
          if (typeof window !== 'undefined' && window.doc && window.doc.reorderTreeItem) {
            window.doc.reorderTreeItem(this._dragSourceId, r.object.id, dropPos);
            if (window.render) window.render();
            if (window.updateInspector) window.updateInspector();
          }
          this._dragSourceId = null;
          this.updateGrid();
        };

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
          delBtn.onmouseenter = () => delBtn.style.color = '#ea6962';
          delBtn.onmouseleave = () => delBtn.style.color = '#7c6f64';
          delBtn.onclick = (e) => {
            e.stopPropagation();
            if (liveObj && typeof window !== 'undefined' && window.doc && window.doc.removeObject) {
              window.doc.removeObject(liveObj.id);
            }
            this.ds.removeObject(r.object.id);
            if (this.selectedObjectId === r.object.id) {
              this.selectedObjectId = null;
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
        const depthPad = r.depth ? ((r.depth - 1) * 14) : 0;
        rowEl.style.padding = `0 6px 0 ${24 + depthPad}px`;
        if (isSelected) {
          rowEl.style.background = '#32302f';
          rowEl.style.borderLeft = '3px solid #83a598';
        } else {
          rowEl.style.background = '#1d2021';
          rowEl.style.borderLeft = '3px solid transparent';
        }

        const kfCount = r.channel.keyframes.length;
        const pIcon = getParamIcon(r.paramKey);

        rowEl.innerHTML = `
          <span style="font-size: 10px; margin-right: 4px; color: #a89984; width: 12px; text-align: center;">${pIcon}</span>
          <span style="color: ${isSelected ? '#fabd2f' : '#d5c4a1'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-size: 10px;" title="${r.label}">${r.label}</span>
          <span style="font-size: 8px; color: ${kfCount > 0 ? '#b8bb26' : '#7c6f64'}; margin-right: 6px;" title="${kfCount} keyframes">${kfCount} kf</span>
          <span class="ds-del-channel-btn" title="Remove parameter track" style="color: #665c54; font-size: 10px; cursor: pointer; padding: 0 2px;">✕</span>
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
          delChanBtn.onmouseenter = () => delChanBtn.style.color = '#ea6962';
          delChanBtn.onmouseleave = () => delChanBtn.style.color = '#665c54';
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

    // Helper for easing curve diamond colors
    const getEasingColor = (tweenType) => {
      if (!tweenType || tweenType === 'linear') return '#83a598'; // teal
      if (typeof tweenType === 'string' && (tweenType.startsWith('cubic-bezier') || tweenType.startsWith('custom:'))) {
        return '#fabd2f'; // custom curve gold
      }
      switch (tweenType) {
        case 'easeIn':
        case 'easeInQuad':
        case 'easeInCubic':
        case 'easeInSine': return '#fabd2f'; // yellow
        case 'easeOut':
        case 'easeOutQuad':
        case 'easeOutCubic':
        case 'easeOutSine': return '#b8bb26'; // bright green
        case 'easeInOut':
        case 'easeInOutQuad':
        case 'easeInOutCubic':
        case 'easeInOutSine': return '#fe8019'; // vivid orange
        case 'bounce':
        case 'easeOutBounce':
        case 'easeInOutBounce':
        case 'elastic':
        case 'easeInElastic':
        case 'easeOutElastic': return '#d3869b'; // magenta
        case 'step':
        case 'none': return '#8ec07c'; // aqua
        default:
          return '#83a598'; // teal
      }
    };

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

    // Draw row backgrounds, span lines & keyframe diamonds
    displayRows.forEach((r, idx) => {
      const y = r.y;
      const rH = r.height;

      if (r.type === 'object') {
        const isSelectedObj = (r.object.id === this.selectedObjectId && !this.selectedParamKey);
        gctx.fillStyle = isSelectedObj ? 'rgba(250, 189, 47, 0.08)' : (idx % 2 === 0 ? 'rgba(40,40,40,0.3)' : 'rgba(29,32,33,0.3)');
        gctx.fillRect(0, y, totalW, rH);
        gctx.strokeStyle = '#32302f';
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

            gctx.fillStyle = isSelectedKf ? '#fb4934' : getEasingColor(tween);
            gctx.strokeStyle = isSelectedKf ? '#ffffff' : '#1d2021';
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
        gctx.fillStyle = isSelectedChan ? 'rgba(250, 189, 47, 0.12)' : 'rgba(20, 22, 23, 0.6)';
        gctx.fillRect(0, y, totalW, rH);
        gctx.strokeStyle = '#282828';
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

            gctx.fillStyle = isSelectedKf ? '#fb4934' : getEasingColor(tween);
            gctx.strokeStyle = isSelectedKf ? '#ffffff' : '#1d2021';
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
