/* Native Android API v1. This file has no dependency on browser scripting. */
(() => {
  "use strict";
  const host = globalThis.__esenhoHost;
  delete globalThis.__esenhoHost;
  function call(operation, args = {}) {
    const response = JSON.parse(host(operation, JSON.stringify(args)));
    if (response.error) throw new Error(response.error);
    return response.value;
  }
  function finite(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${name} precisa ser um número finito`);
    }
    return value;
  }
  const identity = [1, 0, 0, 1, 0, 0];
  class Space {
    constructor(kind = "document", matrix = identity, name) {
      this.kind = kind;
      this.matrix = [...matrix];
      if (name) this.name = name;
    }
    rotate(degrees) {
      const angle = finite(degrees, "angle") * Math.PI / 180;
      const c = Math.cos(angle), s = Math.sin(angle);
      const [a, b, d, e, x, y] = this.matrix;
      return new Space(this.kind, [a*c+d*s, b*c+e*s, d*c-a*s, e*c-b*s, x, y], this.name);
    }
    translate(x, y) {
      finite(x, "x"); finite(y, "y");
      const [a,b,c,d,e,f] = this.matrix;
      return new Space(this.kind, [a,b,c,d,e+a*x+c*y,f+b*x+d*y], this.name);
    }
    scale(factor) {
      finite(factor, "scale");
      if (factor <= 0) throw new RangeError("Escala deve ser positiva");
      return new Space(this.kind, this.matrix.map((v,i) => i < 4 ? v*factor : v), this.name);
    }
    snapshot() { return space(call("spaces.resolve", { space: this })); }
    orientTowards(point) {
      const resolved = this.snapshot();
      const [a,b,,,x,y] = resolved.matrix;
      const target = point instanceof Space ? point.snapshot().origin : point;
      const angle = Math.atan2(finite(target.y, "y")-y, finite(target.x, "x")-x);
      return resolved.rotate(angle*180/Math.PI - Math.atan2(b,a)*180/Math.PI);
    }
    get origin() {
      const { matrix } = call("spaces.resolve", { space: this });
      return { x: matrix[4], y: matrix[5] };
    }
  }
  function space(value) { return new Space(value.kind, value.matrix, value.name); }
  function pickPivot(options = {}) {
    if (typeof options === "string") options = { message: options };
    return space(call("pivots.pick", options));
  }
  function stroke(options, tool) {
    if (!options || !Array.isArray(options.points) || !options.points.length) {
      throw new TypeError("Informe uma lista de pontos");
    }
    if (options.points.length > 50000) throw new RangeError("Máximo de 50000 pontos por traço");
    const points = options.points.map(p => ({
      x: finite(p.x, "x"), y: finite(p.y, "y"),
      pressure: finite(p.pressure ?? 0.85, "pressure"),
      tiltX: finite(p.tiltX ?? 0, "tiltX"), tiltY: finite(p.tiltY ?? 0, "tiltY")
    }));
    const selectedTool = tool ?? esenho.tools.current;
    if (["rectangle", "ellipse", "erase_rectangle", "erase_ellipse", "select_rect", "select_ellipse"].includes(selectedTool)) {
      call("shape", { tool: selectedTool, space: options.space ?? esenho.spaces.document,
        start: points[0], end: points[points.length - 1] });
      return;
    }
    call("stroke.begin", { space: options.space ?? esenho.spaces.document, tool, point: points[0] });
    for (let i = 1; i < points.length; i += 64) {
      call("stroke.move", { points: points.slice(i, i + 64) });
    }
    call("stroke.end", { point: points[points.length - 1] });
  }
  const layerId = layer => typeof layer === "object" ? layer.id : layer;
  const esenho = {
    apiVersion: 1,
    spaces: {
      document: new Space(),
      view: { snapshot: (options = {}) => space(call("spaces.view", options)) },
      screen: new Space("screen")
    },
    pickPivot,
    pickPoint(message = "Toque para marcar um ponto") {
      return call("pivots.pick", { message, pointOnly: true });
    },
    pivots: {
      pick: pickPivot,
      get: name => space(call("pivots.get", { name })),
      list: () => call("pivots.list").map(space),
      remove: name => call("pivots.remove", { name }),
      clear: () => call("pivots.clear")
    },
    tools: {
      list: () => call("tools.list"),
      select: name => call("tools.select", { name }),
      stroke: options => stroke(options),
      get current() { return call("state").tool; }
    },
    brush: {
      set: options => call("brush.set", options),
      presets: () => call("brush.presets"),
      select: id => call("brush.select", { id }),
      setParam: (id, value) => call("brush.param", { id, value }),
      stroke: options => stroke(options, "brush")
    },
    layers: {
      list: () => call("layers.list"),
      create: name => call("layers.create", { name }),
      select: layer => call("layers.select", { id: layerId(layer) }),
      duplicate: layer => call("layers.duplicate", { id: layerId(layer) }),
      remove: layer => call("layers.remove", { id: layerId(layer) }),
      set: (layer, options) => call("layers.set", { ...options, id: layerId(layer) }),
      clear: () => call("layers.clear"),
      get active() { return call("state").layer; }
    },
    selection: {
      all: () => call("selection.all"),
      clear: () => call("selection.clear"),
      invert: () => call("selection.invert"),
      feather: radius => call("selection.feather", { radius }),
      fill: color => call("selection.fill", { color }),
      erase: () => call("selection.erase"),
      copy: () => call("selection.copy"),
      cut: () => call("selection.cut"),
      paste: () => call("selection.paste"),
      setOperation: name => call("selection.operation", { name })
    },
    filters: {
      list: () => call("filters.list"),
      apply: (id, p1 = 0, p2 = 0) => call("filters.apply", { id, p1, p2 })
    },
    animation: {
      state: () => call("animation.state"),
      addFrame: () => call("animation.add"),
      duplicateFrame: () => call("animation.duplicate"),
      removeFrame: () => call("animation.remove"),
      selectFrame: index => call("animation.select", { index }),
      setDuration: duration => call("animation.duration", { duration })
    },
    transform: {
      begin: (selectionOnly = false) => call("transform.begin", { selectionOnly }),
      rotate: (degrees, pivot) => call("transform.rotate", { degrees, pivot }),
      translate: (x, y, space = esenho.spaces.document) => call("transform.translate", { x, y, space }),
      scale: (x, y = x, pivot) => call("transform.scale", { x, y, pivot }),
      flipH: () => call("transform.flipH"),
      flipV: () => call("transform.flipV"),
      center: () => call("transform.center"),
      fit: () => call("transform.fit"),
      reset: () => call("transform.reset"),
      commit: () => call("transform.commit"),
      cancel: () => call("transform.cancel")
    },
    view: {
      reset: () => call("view.reset"),
      set: options => call("view.set", options),
      state: () => call("view.state")
    },
    ui: {
      openPanel: name => call("ui.panel", { name }),
      closePanel: () => call("ui.panel", { name: null }),
      showExportDialog: () => call("ui.export")
    },
    document: { state: () => call("state") },
    undo: () => call("undo"),
    redo: () => call("redo")
  };
  for (const tool of ["eraser", "smudge", "blend", "line", "rectangle", "ellipse",
    "fill", "lasso_fill", "select_rect", "select_lasso", "select_ellipse",
    "select_brush_mask", "select_wand", "eyedropper", "erase_rectangle", "erase_ellipse"]) {
    esenho.tools[tool] = { stroke: options => stroke(options, tool) };
  }
  const print = (...args) => call("log", { message: args.map(value =>
    typeof value === "string" ? value : JSON.stringify(value) ?? String(value)).join(" ") });
  globalThis.console = { log: print, info: print, warn: print, error: print };
  globalThis.print = print;
  globalThis.esenho = esenho;
})();
