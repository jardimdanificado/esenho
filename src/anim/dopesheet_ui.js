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
        
        <!-- Top Resize Handle / Ear -->
        <div id="ds-resize-handle" title="Drag vertically to resize Timeline height" style="position: absolute; top: -6px; left: 0; right: 0; height: 12px; cursor: ns-resize; z-index: 100; display: flex; align-items: center; justify-content: center;">
          <div class="ds-resize-ear" style="width: 56px; height: 4px; background: #665c54; border-radius: 2px; transition: background 0.15s, transform 0.15s; pointer-events: none;"></div>
        </div>

        <!-- Header Toolbar -->
        <div class="ds-toolbar" style="display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: #282828; border-bottom: 1px solid #3c3836; flex-wrap: wrap; z-index: 30;">
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
              <option value="custom">✎ Custom Bézier...</option>
            </select>
            <button id="ds-btn-custom-curve" class="ds-btn" title="Open Bézier Curve Visual Graph Editor" style="background: #3c3836; color: #fabd2f; border: 1px solid #504945; border-radius: 3px; padding: 2px 6px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 3px;">
              <span>📈</span>
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
        </div>

        <!-- Main Body: Split View (Channel Tree on Left, Timeline Grid on Right) -->
        <div id="ds-body" style="display: flex; flex: 1; min-height: 0; position: relative; overflow: hidden;">
          
          <!-- Left: Channels Tree Sidebar -->
          <div id="ds-tree-sidebar" style="width: 250px; min-width: 200px; max-width: 340px; background: #282828; border-right: 1px solid #3c3836; display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden;">
            <!-- Tree Header (Matches 24px ruler height exactly) -->
            <div style="height: 24px; min-height: 24px; padding: 0 8px; background: #32302f; border-bottom: 1px solid #3c3836; font-weight: bold; color: #a89984; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
              <span>Layers & Property Tracks</span>
              <span style="font-size: 9px; color: #7c6f64;">Quadro ABI</span>
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

    // ── Resizable Dock Height ("Orelha" / Top Grip Handle) ──
    try {
      const savedH = localStorage.getItem('wesenho_timeline_height');
      if (savedH && Number(savedH) >= 100) {
        this.container.style.height = `${Number(savedH)}px`;
      }
    } catch (_) {}

    const resizeHandle = this.container.querySelector('#ds-resize-handle');
    const resizeEar = this.container.querySelector('.ds-resize-ear');
    if (resizeHandle) {
      let isResizing = false;
      let startY = 0;
      let startH = 0;

      resizeHandle.onmouseenter = () => {
        if (resizeEar) {
          resizeEar.style.background = '#fabd2f';
          resizeEar.style.transform = 'scaleY(1.6)';
        }
      };
      resizeHandle.onmouseleave = () => {
        if (!isResizing && resizeEar) {
          resizeEar.style.background = '#665c54';
          resizeEar.style.transform = 'scaleY(1)';
        }
      };

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
          if (resizeEar) {
            resizeEar.style.background = '#665c54';
            resizeEar.style.transform = 'scaleY(1)';
          }
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
        if (resizeEar) {
          resizeEar.style.background = '#fabd2f';
          resizeEar.style.transform = 'scaleY(1.6)';
        }
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
    const frameInput = this.container.querySelector('#ds-input-frame');
    const totalInput = this.container.querySelector('#ds-input-total');
    const fpsInput = this.container.querySelector('#ds-input-fps');
    const easingSelect = this.container.querySelector('#ds-select-easing');
    const autoKfBtn = this.container.querySelector('#ds-btn-autokf');
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
      if (targetId) {
        const obj = this.ds.getOrCreateObject(targetId);
        let liveObj = null;
        if (typeof window !== 'undefined' && window.doc) {
          liveObj = window.doc.findObject ? window.doc.findObject(targetId) : window.doc.objects.find(o => o.id === targetId);
        }

        const curve = this.activeEasing || 'linear';
        if (this.selectedParamKey) {
          // Add keyframe ONLY to the actively selected track
          let val = undefined;
          if (liveObj) {
            const props = extractLiveObjectProperties(liveObj);
            val = props[this.selectedParamKey];
          }
          if (val === undefined) {
            const ch = obj.getOrCreateChannel(this.selectedParamKey);
            val = ch.sample(this.ds.currentFrame);
          }
          const kf = obj.setKeyframe(this.selectedParamKey, this.ds.currentFrame, val, curve);
          this.ds.deselectAllKeyframes();
          kf.selected = true;
        } else {
          // Object root selected: set keyframes on all object properties
          if (liveObj) {
            const props = extractLiveObjectProperties(liveObj);
            for (const [key, val] of Object.entries(props)) {
              if (val !== undefined && val !== null) {
                obj.setKeyframe(key, this.ds.currentFrame, val, curve);
              }
            }
          } else {
            for (const [key, ch] of obj.channels.entries()) {
              const val = ch.sample(this.ds.currentFrame);
              ch.addKeyframe(this.ds.currentFrame, val, curve);
            }
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
          if (this.selectedParamKey && obj.channels.has(this.selectedParamKey)) {
            obj.channels.get(this.selectedParamKey).removeKeyframe(this.ds.currentFrame);
          } else {
            for (const ch of obj.channels.values()) {
              ch.removeKeyframe(this.ds.currentFrame);
            }
          }
          this.updateGrid();
        }
      }
    };

    // ── Scrubbing and Keyframe Selection on Timeline Grid & Ruler ──
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

    if (gridEl) {
      gridEl.onpointerdown = (e) => {
        const gridRect = gridEl.getBoundingClientRect();
        const clickX = e.clientX - gridRect.left;
        const clickY = e.clientY - gridRect.top;
        const rowIdx = Math.floor(clickY / 22);

        if (this._flatRows && this._flatRows[rowIdx]) {
          const row = this._flatRows[rowIdx];
          if (row.type === 'channel') {
            const hitKf = row.channel.keyframes.find(k => {
              const kx = (k.frame - 1) * this.frameWidth + this.frameWidth / 2;
              return Math.abs(kx - clickX) <= 8;
            });
            if (hitKf) {
              e.stopPropagation();
              e.preventDefault();
              if (!e.shiftKey) {
                this.ds.deselectAllKeyframes();
              }
              hitKf.selected = true;
              this.selectedObjectId = row.object.id;
              this.selectedParamKey = row.paramKey;
              this.activeEasing = hitKf.tweenType || 'linear';
              const easingSelect = this.container.querySelector('#ds-select-easing');
              if (easingSelect) easingSelect.value = this.activeEasing;
              this.ds.setFrame(hitKf.frame);
              this.updateGrid();
              return;
            }
          }
        }
        this.ds.deselectAllKeyframes();
        this.updateGrid();
        startScrub(e);
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
        if (this.selectedParamKey) {
          const ch = obj.channels.get(this.selectedParamKey);
          if (ch) {
            let kf = ch.getKeyframeAt(this.ds.currentFrame);
            if (!kf) {
              const span = ch.getSpan(this.ds.currentFrame);
              if (span && span.prev) {
                span.prev.tweenType = curve;
              } else if (ch.keyframes.length > 0) {
                ch.keyframes[0].tweenType = curve;
              }
            } else {
              kf.tweenType = curve;
            }
          }
        } else {
          for (const ch of obj.channels.values()) {
            let kf = ch.getKeyframeAt(this.ds.currentFrame);
            if (!kf) {
              const span = ch.getSpan(this.ds.currentFrame);
              if (span && span.prev) {
                span.prev.tweenType = curve;
              } else if (ch.keyframes.length > 0) {
                ch.keyframes[0].tweenType = curve;
              }
            } else {
              kf.tweenType = curve;
            }
          }
        }
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
          <span>📈</span> Visual Curve & Physics Graph Editor
        </div>
        <button id="ds-ce-close" style="background: none; border: none; color: #a89984; font-size: 16px; cursor: pointer; padding: 0 4px;">✕</button>
      </div>

      <!-- Mode Switcher Tabs -->
      <div style="display: flex; gap: 4px; margin-bottom: 8px; background: #1d2021; padding: 3px; border-radius: 5px; border: 1px solid #3c3836;">
        <button id="tab-mode-bezier" class="ds-ce-tab" style="flex: 1; background: #3c3836; color: #fabd2f; font-weight: bold; border: none; border-radius: 3px; font-size: 10px; padding: 4px; cursor: pointer;">Bézier</button>
        <button id="tab-mode-bounce" class="ds-ce-tab" style="flex: 1; background: transparent; color: #a89984; border: none; border-radius: 3px; font-size: 10px; padding: 4px; cursor: pointer;">🏀 Bounce</button>
        <button id="tab-mode-spring" class="ds-ce-tab" style="flex: 1; background: transparent; color: #a89984; border: none; border-radius: 3px; font-size: 10px; padding: 4px; cursor: pointer;">🌀 Spring</button>
        <button id="tab-mode-spline" class="ds-ce-tab" style="flex: 1; background: transparent; color: #a89984; border: none; border-radius: 3px; font-size: 10px; padding: 4px; cursor: pointer;">〰 Spline</button>
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

    // 1. If keyframe(s) are selected in timeline, reflect first selected keyframe's tweenType
    const selectedKfs = this.ds.getSelectedKeyframes();
    if (selectedKfs.length > 0) {
      setSelectValue(selectedKfs[0].keyframe.tweenType || 'linear');
      return;
    }

    // 2. Target object & track
    let targetId = this.selectedObjectId;
    if (!targetId && typeof window !== 'undefined' && window.doc) {
      const sel = window.doc.getSelectedObjects ? window.doc.getSelectedObjects() : [];
      if (sel && sel.length > 0) targetId = sel[0].id;
    }

    if (targetId && this.ds.objects.has(targetId)) {
      const obj = this.ds.objects.get(targetId);
      if (this.selectedParamKey && obj.channels.has(this.selectedParamKey)) {
        const ch = obj.channels.get(this.selectedParamKey);
        const kf = ch.getKeyframeAt(this.ds.currentFrame);
        if (kf) {
          setSelectValue(kf.tweenType || 'linear');
          return;
        }
        const span = ch.getSpan(this.ds.currentFrame);
        if (span && span.prev) {
          setSelectValue(span.prev.tweenType || 'linear');
          return;
        }
      } else {
        for (const ch of obj.channels.values()) {
          const kf = ch.getKeyframeAt(this.ds.currentFrame);
          if (kf) {
            setSelectValue(kf.tweenType || 'linear');
            return;
          }
        }
        for (const ch of obj.channels.values()) {
          const span = ch.getSpan(this.ds.currentFrame);
          if (span && span.prev) {
            setSelectValue(span.prev.tweenType || 'linear');
            return;
          }
        }
      }
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

  showAddPropertyMenu(obj, targetBtn) {
    this.closeActiveMenu();

    const menu = document.createElement('div');
    menu.className = 'ds-prop-menu';
    menu.style.position = 'absolute';
    menu.style.background = '#282828';
    menu.style.border = '1px solid #504945';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
    menu.style.zIndex = '1000';
    menu.style.padding = '6px';
    menu.style.width = '240px';
    menu.style.maxHeight = '280px';
    menu.style.overflowY = 'auto';
    menu.style.fontSize = '11px';
    menu.style.color = '#ebdbb2';

    const rect = targetBtn.getBoundingClientRect();
    const panelRect = this.container.getBoundingClientRect();
    menu.style.left = `${Math.min(panelRect.width - 250, Math.max(10, rect.left - panelRect.left))}px`;
    menu.style.top = `${Math.max(10, rect.bottom - panelRect.top + 4)}px`;

    menu.onpointerdown = (e) => e.stopPropagation();

    const groups = getParameterGroups();
    let html = `<div style="font-weight: bold; color: #fabd2f; padding: 2px 6px; margin-bottom: 4px; border-bottom: 1px solid #3c3836;">+ Add Quadro Property Track</div>`;

    for (const [groupName, params] of Object.entries(groups)) {
      html += `<div style="font-size: 10px; font-weight: bold; color: #a89984; padding: 4px 6px 2px 6px; text-transform: uppercase;">${groupName}</div>`;
      for (const p of params) {
        const alreadyHas = obj.channels.has(p.key);
        html += `
          <div class="ds-prop-item" data-key="${p.key}" style="padding: 3px 8px; margin: 1px 0; border-radius: 3px; cursor: ${alreadyHas ? 'default' : 'pointer'}; opacity: ${alreadyHas ? 0.4 : 1.0}; display: flex; justify-content: space-between; align-items: center; background: ${alreadyHas ? 'transparent' : '#1d2021'};">
            <span>${p.label}</span>
            <span style="font-size: 9px; color: #7c6f64;">${p.unit || p.type}</span>
          </div>
        `;
      }
    }

    menu.innerHTML = html;

    menu.querySelectorAll('.ds-prop-item').forEach(item => {
      const key = item.getAttribute('data-key');
      if (!obj.channels.has(key)) {
        item.onmouseenter = () => item.style.background = '#3c3836';
        item.onmouseleave = () => item.style.background = '#1d2021';
        item.onclick = (e) => {
          e.stopPropagation();
          obj.getOrCreateChannel(key);
          // Sample current frame value or initial
          const ch = obj.channels.get(key);
          if (ch.keyframes.length === 0) {
            ch.addKeyframe(this.ds.currentFrame, ch.defaultValue);
          }
          this.closeActiveMenu();
          this.updateGrid();
        };
      }
    });

    this.container.querySelector('.dopesheet-panel').appendChild(menu);
    this._activeMenu = menu;
  }

  updateGrid() {
    const totalW = Math.max(800, this.ds.totalFrames * this.frameWidth + 40);
    const treeRowsEl = this.container.querySelector('#ds-tree-rows');
    const rulerCanvas = this.container.querySelector('#ds-ruler-canvas');
    const gridCanvas = this.container.querySelector('#ds-grid-canvas');
    if (!treeRowsEl || !rulerCanvas || !gridCanvas) return;

    // 1. Build Flat List of Visible Channel Rows
    const flatRows = [];
    for (const obj of this.ds.objects.values()) {
      let label = obj.name;
      if (typeof window !== 'undefined' && window.doc) {
        const live = window.doc.findObject ? window.doc.findObject(obj.id) : (window.doc.objects ? window.doc.objects.find(o => o.id === obj.id) : null);
        if (live && live.name) {
          obj.name = live.name;
          label = live.name;
        }
      }
      flatRows.push({ type: 'object', object: obj, id: obj.id, label });
      if (!obj.collapsed) {
        for (const [paramKey, ch] of obj.channels.entries()) {
          flatRows.push({ type: 'channel', object: obj, channel: ch, paramKey, label: ch.label });
        }
      }
    }
    this._flatRows = flatRows;

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
      rowEl.style.boxSizing = 'border-box';
      rowEl.style.cursor = 'pointer';

      const isObjSelected = (r.type === 'object' && r.object.id === this.selectedObjectId && !this.selectedParamKey);
      const isChSelected = (r.type === 'channel' && r.object.id === this.selectedObjectId && r.paramKey === this.selectedParamKey);

      if (isObjSelected) {
        rowEl.style.background = '#3c3836';
        rowEl.style.borderLeft = '3px solid #fabd2f';
      } else if (isChSelected) {
        rowEl.style.background = '#3c3836';
        rowEl.style.borderLeft = '3px solid #83a598';
      } else {
        rowEl.style.background = (r.object.id === this.selectedObjectId) ? '#32302f' : (idx % 2 === 0 ? '#282828' : '#242424');
        rowEl.style.borderLeft = '3px solid transparent';
      }

      rowEl.onclick = () => {
        this.selectedObjectId = r.object.id;
        if (r.type === 'channel') {
          this.selectedParamKey = r.paramKey;
          const kf = r.channel.getKeyframeAt(this.ds.currentFrame);
          if (kf) {
            this.activeEasing = kf.tweenType || 'linear';
            const easingSelect = this.container.querySelector('#ds-select-easing');
            if (easingSelect) easingSelect.value = this.activeEasing;
          }
        } else {
          this.selectedParamKey = null;
        }
        this.updateGrid();
      };

      if (r.type === 'object') {
        const trackCount = r.object.channels.size;
        rowEl.innerHTML = `
          <span class="ds-toggle-collapse" style="margin-right: 4px; color: #d79921; cursor: pointer; font-size: 9px; width: 12px;">${r.object.collapsed ? '▶' : '▼'}</span>
          <span style="font-weight: bold; color: #fabd2f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${r.label}">${r.label}</span>
          <span style="font-size: 9px; color: #7c6f64; margin-left: 4px;" title="${trackCount} animated tracks">${trackCount > 0 ? `${trackCount} tr` : ''}</span>
        `;
        rowEl.querySelector('.ds-toggle-collapse').onclick = (e) => {
          e.stopPropagation();
          r.object.collapsed = !r.object.collapsed;
          this.updateGrid();
        };
      } else {
        const val = r.channel.sample(this.ds.currentFrame);
        let valDisplay = typeof val === 'number' ? Math.round(val * 100) / 100 : String(val);
        const def = PARAMETER_REGISTRY[r.paramKey];
        if (def && def.unit) valDisplay += def.unit;

        rowEl.innerHTML = `
          <span style="margin-left: 14px; color: #ebdbb2; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${r.label}">${r.label}</span>
          <span style="font-size: 9px; color: #83a598; margin-right: 4px; background: #1d2021; padding: 1px 4px; border-radius: 2px;">${valDisplay}</span>
          <span class="ds-del-ch-btn" title="Remove track" style="color: #7c6f64; font-size: 10px; cursor: pointer; padding: 0 3px;">✕</span>
        `;
        const delBtn = rowEl.querySelector('.ds-del-ch-btn');
        delBtn.onmouseenter = () => delBtn.style.color = '#ea6962';
        delBtn.onmouseleave = () => delBtn.style.color = '#7c6f64';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          r.object.removeChannel(r.paramKey);
          if (this.selectedParamKey === r.paramKey) this.selectedParamKey = null;
          this.updateGrid();
        };
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

    // Draw row backgrounds & keyframes
    flatRows.forEach((r, idx) => {
      const y = idx * rowHeight;
      const isSelectedTrack = (r.type === 'channel' && r.object.id === this.selectedObjectId && r.paramKey === this.selectedParamKey);
      gctx.fillStyle = isSelectedTrack ? 'rgba(131,165,152,0.12)' : (idx % 2 === 0 ? 'rgba(40,40,40,0.3)' : 'rgba(29,32,33,0.3)');
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

          gctx.fillStyle = kf.selected ? '#fb4934' : getEasingColor(kf.tweenType);
          gctx.strokeStyle = kf.selected ? '#ffffff' : '#1d2021';
          gctx.lineWidth = kf.selected ? 1.5 : 1.2;

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
    this.updateAutoKeyframeUI();
  }
}
