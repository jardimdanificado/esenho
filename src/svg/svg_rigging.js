/**
 * =========================================================================
 * SVG Rigging, 2D Skeletal Animation & Ragdoll Physics Engine
 * (src/svg/svg_rigging.js)
 *
 * Professional 2D rigging system for Esenho Vector Studio:
 * - Hierarchical Bone & Skeleton Data Model with Forward Kinematics (FK)
 * - Cyclic Coordinate Descent Inverse Kinematics (CCD-IK) Solver
 * - Cutout Rigging (Parenting of SvgNodes / SvgGroups to Bones)
 * - Smooth Curve / Path Skinning (Bone-driven Bézier PathNode deformation)
 * - Verlet Integration Ragdoll Physics Simulator with Joint Angle Limits
 * - Secondary Physics & Dynamic Springs (Tail, Hair, Cloth Jiggle)
 * - Full DopeSheet Integration: "Bake Physics to Keyframes"
 * =========================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SvgRigging = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  function normalizeAngleDeg(deg) {
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    return deg;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /* =========================================================================
   * 1. SvgBone: Individual Bone Representation
   * ========================================================================= */
  class SvgBone {
    constructor(id, name, length = 60, localAngle = 0, options = {}) {
      this.id = id || `bone_${Math.random().toString(36).substr(2, 6)}`;
      this.name = name || this.id;
      this.parentId = options.parentId || null;
      this.attachTo = options.attachTo || 'tip'; // 'tip' (parent worldX1/Y1) | 'base' (parent worldX0/Y0)
      this.length = Math.max(1, Number(length));
      this.localAngle = Number(localAngle) || 0; // Relative to parent (degrees)
      
      // Optional local translation offset relative to parent connection
      this.localX = options.localX !== undefined ? Number(options.localX) : 0;
      this.localY = options.localY !== undefined ? Number(options.localY) : 0;
      
      // Rest / Bind Pose reference
      this.restLength = this.length;
      this.restAngle = this.localAngle;

      // Computed World Coordinates (Forward Kinematics)
      this.worldX0 = 0; // Base / Joint position
      this.worldY0 = 0;
      this.worldX1 = 0; // Tip position
      this.worldY1 = 0;
      this.worldAngle = 0; // Global angle (degrees)

      // Physical & Ragdoll Properties
      const hasPhysMode = options.physics && (options.physics.mode === 'ragdoll' || options.physics.mode === 'secondary');
      this.physics = {
        enabled: options.physics?.enabled ?? !!hasPhysMode,
        mode: options.physics?.mode || 'kinematic', // 'kinematic' | 'ragdoll' | 'secondary'
        mass: options.physics?.mass !== undefined ? Number(options.physics.mass) : 1.0,
        minAngle: options.physics?.minAngle !== undefined ? Number(options.physics.minAngle) : -135,
        maxAngle: options.physics?.maxAngle !== undefined ? Number(options.physics.maxAngle) : 135,
        damping: options.physics?.damping !== undefined ? Number(options.physics.damping) : 0.96,
        stiffness: options.physics?.stiffness !== undefined ? Number(options.physics.stiffness) : 0.2,
        gravityScale: options.physics?.gravityScale !== undefined ? Number(options.physics.gravityScale) : 1.0
      };
    }

    clone() {
      const copy = new SvgBone(this.id + '_copy', this.name, this.length, this.localAngle, {
        parentId: this.parentId,
        attachTo: this.attachTo,
        localX: this.localX,
        localY: this.localY,
        physics: { ...this.physics }
      });
      copy.restLength = this.restLength;
      copy.restAngle = this.restAngle;
      return copy;
    }

    toJSON() {
      return {
        id: this.id,
        name: this.name,
        parentId: this.parentId,
        attachTo: this.attachTo,
        length: this.length,
        localAngle: this.localAngle,
        localX: this.localX,
        localY: this.localY,
        restLength: this.restLength,
        restAngle: this.restAngle,
        physics: { ...this.physics }
      };
    }

    static fromJSON(data) {
      const b = new SvgBone(data.id, data.name, data.length, data.localAngle, {
        parentId: data.parentId,
        attachTo: data.attachTo,
        localX: data.localX,
        localY: data.localY,
        physics: data.physics
      });
      if (data.restLength !== undefined) b.restLength = data.restLength;
      if (data.restAngle !== undefined) b.restAngle = data.restAngle;
      return b;
    }
  }

  /* =========================================================================
   * 2. SvgSkeleton: Skeletal Hierarchy, Forward Kinematics & CCD-IK
   * ========================================================================= */
  class SvgSkeleton {
    constructor(id = 'skeleton_root', name = 'Character Skeleton', options = {}) {
      this.id = id;
      this.name = name;
      this.x = options.x !== undefined ? Number(options.x) : 0;
      this.y = options.y !== undefined ? Number(options.y) : 0;
      this.rotation = options.rotation !== undefined ? Number(options.rotation) : 0;
      this.scaleX = options.scaleX !== undefined ? Number(options.scaleX) : 1;
      this.scaleY = options.scaleY !== undefined ? Number(options.scaleY) : 1;
      
      this.bones = []; // Ordered bone list
      this.boneMap = new Map();
      
      // Bindings to scene nodes:
      // Cutout bindings: { type: 'cutout', targetId, boneId, offsetAngle, offsetX, offsetY, halfW, halfH }
      // Path bindings: { type: 'path', targetId, weights: [...] }
      // Smooth LBS bindings: { type: 'smooth_path', targetId, nodeWeights: [...] }
      this.bindings = [];

      // Bone Constraints (IK, Aim / Look-At, Copy Rotation)
      this.constraints = [];
    }

    addBone(boneConfig) {
      let bone;
      if (boneConfig instanceof SvgBone) {
        bone = boneConfig;
      } else {
        bone = new SvgBone(boneConfig.id, boneConfig.name, boneConfig.length, boneConfig.localAngle, boneConfig);
      }
      this.bones.push(bone);
      this.boneMap.set(bone.id, bone);
      this.updateWorldTransforms();
      return bone;
    }

    getBone(boneId) {
      return this.boneMap.get(boneId) || null;
    }

    removeBone(boneId) {
      const idx = this.bones.findIndex(b => b.id === boneId);
      if (idx === -1) return false;
      this.bones.splice(idx, 1);
      this.boneMap.delete(boneId);
      // Remove or reparent orphaned children
      for (const b of this.bones) {
        if (b.parentId === boneId) b.parentId = null;
      }
      // Clean bindings & constraints
      this.bindings = this.bindings.filter(bind => bind.boneId !== boneId);
      this.constraints = this.constraints.filter(c => c.boneId !== boneId && c.sourceBoneId !== boneId);
      this.updateWorldTransforms();
      return true;
    }

    addConstraint(config) {
      const c = {
        id: config.id || `const_${Math.random().toString(36).substr(2, 6)}`,
        name: config.name || config.id || 'Constraint',
        type: config.type || 'aim', // 'ik' | 'aim' | 'copy_rotation'
        enabled: config.enabled !== false,
        boneId: config.boneId || config.effectorBoneId,
        sourceBoneId: config.sourceBoneId || config.targetBoneId || null,
        targetBoneId: config.targetBoneId || config.sourceBoneId || null,
        targetX: config.targetX !== undefined ? Number(config.targetX) : 0,
        targetY: config.targetY !== undefined ? Number(config.targetY) : 0,
        poleTargetBoneId: config.poleTargetBoneId || null,
        poleTarget: config.poleTarget || null, // { x, y }
        chainLength: Number(config.chainLength || 0),
        weight: config.weight !== undefined ? clamp(Number(config.weight), 0, 1) : 1.0,
        ratio: config.ratio !== undefined ? Number(config.ratio) : 1.0,
        offsetAngle: Number(config.offsetAngle || 0)
      };
      this.constraints.push(c);
      this.updateWorldTransforms();
      return c;
    }

    removeConstraint(constraintId) {
      const idx = this.constraints.findIndex(c => c.id === constraintId);
      if (idx === -1) return false;
      this.constraints.splice(idx, 1);
      this.updateWorldTransforms();
      return true;
    }

    _computeFK() {
      const processed = new Set();
      
      const processBone = (bone) => {
        if (processed.has(bone.id)) return;

        let parentAngle = this.rotation;
        let baseX = this.x;
        let baseY = this.y;

        if (bone.parentId) {
          const parent = this.boneMap.get(bone.parentId);
          if (parent) {
            if (!processed.has(parent.id)) {
              processBone(parent);
            }
            parentAngle = parent.worldAngle;
            baseX = (bone.attachTo === 'base') ? parent.worldX0 : parent.worldX1;
            baseY = (bone.attachTo === 'base') ? parent.worldY0 : parent.worldY1;
          }
        }

        const pRad = parentAngle * DEG2RAD;
        const cosP = Math.cos(pRad);
        const sinP = Math.sin(pRad);
        const offX = bone.localX * cosP - bone.localY * sinP;
        const offY = bone.localX * sinP + bone.localY * cosP;

        bone.worldX0 = baseX + offX;
        bone.worldY0 = baseY + offY;
        bone.worldAngle = normalizeAngleDeg(parentAngle + bone.localAngle);

        const rad = bone.worldAngle * DEG2RAD;
        bone.worldX1 = bone.worldX0 + bone.length * Math.cos(rad);
        bone.worldY1 = bone.worldY0 + bone.length * Math.sin(rad);

        processed.add(bone.id);
      };

      for (const bone of this.bones) {
        processBone(bone);
      }
    }

    /**
     * Compute World Transforms (FK + Bone Constraints evaluation).
     */
    updateWorldTransforms() {
      this._computeFK();

      // Evaluate active bone constraints
      if (this.constraints && this.constraints.length > 0) {
        let changed = false;
        for (const c of this.constraints) {
          if (!c.enabled || c.weight <= 0) continue;

          if (c.type === 'copy_rotation') {
            const bone = this.getBone(c.boneId);
            const src = this.getBone(c.targetBoneId || c.sourceBoneId);
            if (bone && src) {
              const targetAngle = normalizeAngleDeg(src.localAngle * c.ratio + c.offsetAngle);
              bone.localAngle = normalizeAngleDeg(bone.localAngle * (1 - c.weight) + targetAngle * c.weight);
              changed = true;
            }
          } else if (c.type === 'aim') {
            const bone = this.getBone(c.boneId);
            if (bone) {
              let tgtX = c.targetX;
              let tgtY = c.targetY;
              if (c.targetBoneId) {
                const tgtBone = this.getBone(c.targetBoneId);
                if (tgtBone) {
                  tgtX = tgtBone.worldX0;
                  tgtY = tgtBone.worldY0;
                }
              }
              const dx = tgtX - bone.worldX0;
              const dy = tgtY - bone.worldY0;
              if (Math.hypot(dx, dy) > 1e-3) {
                const aimWorld = Math.atan2(dy, dx) * RAD2DEG + c.offsetAngle;
                let parentAngle = this.rotation;
                if (bone.parentId) {
                  const p = this.getBone(bone.parentId);
                  if (p) parentAngle = p.worldAngle;
                }
                const targetLocal = normalizeAngleDeg(aimWorld - parentAngle);
                bone.localAngle = normalizeAngleDeg(bone.localAngle * (1 - c.weight) + targetLocal * c.weight);
                changed = true;
              }
            }
          } else if (c.type === 'ik') {
            let tgtX = c.targetX;
            let tgtY = c.targetY;
            if (c.targetBoneId) {
              const tgtBone = this.getBone(c.targetBoneId);
              if (tgtBone) {
                tgtX = tgtBone.worldX0;
                tgtY = tgtBone.worldY0;
              }
            }
            let pole = c.poleTarget;
            if (c.poleTargetBoneId) {
              const poleBone = this.getBone(c.poleTargetBoneId);
              if (poleBone) {
                pole = { x: poleBone.worldX0, y: poleBone.worldY0 };
              }
            }
            this.solveIK(c.boneId, tgtX, tgtY, {
              chainLength: c.chainLength,
              poleTarget: pole,
              weight: c.weight
            });
            changed = true;
          }
        }
        if (changed) {
          this._computeFK();
        }
      }
    }

    /**
     * Cyclic Coordinate Descent (CCD-IK) Solver with Pole Target and Weight Blending.
     */
    solveIK(effectorBoneId, targetX, targetY, options = {}) {
      const maxIterations = options.maxIterations || 15;
      const tolerance = options.tolerance || 0.5;
      const chainLength = options.chainLength || 0; // 0 = all the way to root
      const weight = options.weight !== undefined ? clamp(Number(options.weight), 0, 1) : 1.0;
      const poleTarget = options.poleTarget || null;

      const effector = this.getBone(effectorBoneId);
      if (!effector) return false;

      // Build chain from effector upwards
      const chain = [];
      let curr = effector;
      while (curr) {
        chain.push(curr);
        if (chainLength > 0 && chain.length >= chainLength) break;
        curr = curr.parentId ? this.getBone(curr.parentId) : null;
      }

      const initAngles = chain.map(b => b.localAngle);

      for (let iter = 0; iter < maxIterations; iter++) {
        this._computeFK();
        const curDist = Math.hypot(effector.worldX1 - targetX, effector.worldY1 - targetY);
        if (curDist <= tolerance) break;

        for (let i = 0; i < chain.length; i++) {
          const bone = chain[i];
          this._computeFK();

          const effX = effector.worldX1 - bone.worldX0;
          const effY = effector.worldY1 - bone.worldY0;
          const effLen = Math.hypot(effX, effY);
          if (effLen < 1e-4) continue;

          const tgtX = targetX - bone.worldX0;
          const tgtY = targetY - bone.worldY0;
          const tgtLen = Math.hypot(tgtX, tgtY);
          if (tgtLen < 1e-4) continue;

          const effAngle = Math.atan2(effY, effX);
          const tgtAngle = Math.atan2(tgtY, tgtX);
          let deltaDeg = (tgtAngle - effAngle) * RAD2DEG;
          deltaDeg = normalizeAngleDeg(deltaDeg);

          let newAngle = bone.localAngle + deltaDeg;
          if (bone.physics.minAngle !== undefined && bone.physics.maxAngle !== undefined) {
            newAngle = clamp(newAngle, bone.physics.minAngle, bone.physics.maxAngle);
          }
          bone.localAngle = normalizeAngleDeg(newAngle);
        }
      }

      // Apply pole target bend hint if present
      if (poleTarget && chain.length >= 2) {
        const rootBone = chain[chain.length - 1];
        const midBone = chain[chain.length - 2];
        this._computeFK();
        const armVecX = effector.worldX1 - rootBone.worldX0;
        const armVecY = effector.worldY1 - rootBone.worldY0;
        const poleVecX = poleTarget.x - rootBone.worldX0;
        const poleVecY = poleTarget.y - rootBone.worldY0;
        const cross = armVecX * poleVecY - armVecY * poleVecX;
        const midCross = armVecX * (midBone.worldY1 - rootBone.worldY0) - armVecY * (midBone.worldX1 - rootBone.worldX0);
        if ((cross > 0 && midCross < 0) || (cross < 0 && midCross > 0)) {
          midBone.localAngle = normalizeAngleDeg(-midBone.localAngle);
        }
      }

      // Blend between initial FK angles and IK solved angles
      if (weight < 1.0) {
        for (let i = 0; i < chain.length; i++) {
          chain[i].localAngle = normalizeAngleDeg(initAngles[i] * (1 - weight) + chain[i].localAngle * weight);
        }
      }

      this._computeFK();
      const finalDist = Math.hypot(effector.worldX1 - targetX, effector.worldY1 - targetY);
      return finalDist <= tolerance;
    }

    bindCutout(targetNode, boneId) {
      const bone = this.getBone(boneId);
      if (!bone || !targetNode) return null;
      
      this.updateWorldTransforms();
      const targetId = targetNode.id;

      // Determine center / anchor of the node
      let posX = 0;
      let posY = 0;
      let halfW = 0;
      let halfH = 0;

      if (targetNode.cx !== undefined && targetNode.cy !== undefined) {
        posX = targetNode.cx;
        posY = targetNode.cy;
      } else if (typeof targetNode.getBounds === 'function') {
        const b = targetNode.getBounds();
        posX = b.minX + b.width / 2;
        posY = b.minY + b.height / 2;
        halfW = b.width / 2;
        halfH = b.height / 2;
      } else {
        posX = targetNode.x || 0;
        posY = targetNode.y || 0;
      }

      // Relative offset between target node anchor and bone joint in bone local space
      const dx = posX - bone.worldX0;
      const dy = posY - bone.worldY0;
      const bRad = -bone.worldAngle * DEG2RAD;
      const offsetX = dx * Math.cos(bRad) - dy * Math.sin(bRad);
      const offsetY = dx * Math.sin(bRad) + dy * Math.cos(bRad);
      const offsetAngle = normalizeAngleDeg((targetNode.rotation || 0) - bone.worldAngle);

      // Remove previous binding for this target if present
      this.bindings = this.bindings.filter(b => b.targetId !== targetId);

      const binding = {
        type: 'cutout',
        targetId,
        boneId,
        offsetX,
        offsetY,
        offsetAngle,
        halfW,
        halfH
      };
      this.bindings.push(binding);
      return binding;
    }

    /* ── Path / Bézier Curve Binding (Deformation) ── */
    bindPath(pathNode, boneIds = [], options = {}) {
      if (!pathNode || !Array.isArray(pathNode.nodes) || pathNode.nodes.length === 0) return null;
      this.updateWorldTransforms();

      const candidateBones = (boneIds.length > 0 ? boneIds : this.bones.map(b => b.id))
        .map(id => this.getBone(id))
        .filter(Boolean);

      if (candidateBones.length === 0) return null;

      const weights = [];
      const pNodes = pathNode.nodes;

      for (let i = 0; i < pNodes.length; i++) {
        const node = pNodes[i];
        let bestBone = candidateBones[0];
        let bestDist = Infinity;

        for (const b of candidateBones) {
          const segDist = distancePointToSegment(node.x, node.y, b.worldX0, b.worldY0, b.worldX1, b.worldY1);
          if (segDist < bestDist) {
            bestDist = segDist;
            bestBone = b;
          }
        }

        const bRad = -bestBone.worldAngle * DEG2RAD;
        const cosB = Math.cos(bRad);
        const sinB = Math.sin(bRad);

        const dx = node.x - bestBone.worldX0;
        const dy = node.y - bestBone.worldY0;
        const localX = dx * cosB - dy * sinB;
        const localY = dx * sinB + dy * cosB;

        let cpInLocal = null;
        if (node.cpIn) {
          const cidx = node.cpIn.x - bestBone.worldX0;
          const cidy = node.cpIn.y - bestBone.worldY0;
          cpInLocal = {
            x: cidx * cosB - cidy * sinB,
            y: cidx * sinB + cidy * cosB
          };
        }

        let cpOutLocal = null;
        if (node.cpOut) {
          const codx = node.cpOut.x - bestBone.worldX0;
          const cody = node.cpOut.y - bestBone.worldY0;
          cpOutLocal = {
            x: codx * cosB - cody * sinB,
            y: codx * sinB + cody * cosB
          };
        }

        weights.push({
          nodeIndex: i,
          boneId: bestBone.id,
          localX,
          localY,
          cpInLocal,
          cpOutLocal
        });
      }

      this.bindings = this.bindings.filter(b => b.targetId !== pathNode.id);
      const binding = {
        type: 'path',
        targetId: pathNode.id,
        weights
      };
      this.bindings.push(binding);
      return binding;
    }

    /* ── Smooth Multi-Bone Linear Blend Skinning (LBS) ── */
    bindPathSmooth(pathNode, boneIds = [], options = {}) {
      if (!pathNode || !Array.isArray(pathNode.nodes) || pathNode.nodes.length === 0) return null;
      this.updateWorldTransforms();

      const candidateBones = (boneIds.length > 0 ? boneIds : this.bones.map(b => b.id))
        .map(id => this.getBone(id))
        .filter(Boolean);

      if (candidateBones.length === 0) return null;

      const radius = options.radius || 150;
      const maxInfluences = options.maxInfluences || 3;
      const nodeWeights = [];

      for (let i = 0; i < pathNode.nodes.length; i++) {
        const pNode = pathNode.nodes[i];
        const rawInfluences = [];

        for (const b of candidateBones) {
          const dist = distancePointToSegment(pNode.x, pNode.y, b.worldX0, b.worldY0, b.worldX1, b.worldY1);
          if (dist <= radius) {
            const w = Math.exp(-Math.pow(dist / (radius * 0.5), 2));
            rawInfluences.push({ bone: b, dist, weight: w });
          }
        }

        rawInfluences.sort((a, b) => b.weight - a.weight);
        const topInfluences = rawInfluences.slice(0, maxInfluences);

        if (topInfluences.length === 0) {
          let closest = candidateBones[0];
          let minDist = Infinity;
          for (const b of candidateBones) {
            const d = distancePointToSegment(pNode.x, pNode.y, b.worldX0, b.worldY0, b.worldX1, b.worldY1);
            if (d < minDist) { minDist = d; closest = b; }
          }
          topInfluences.push({ bone: closest, dist: minDist, weight: 1.0 });
        }

        const totalW = topInfluences.reduce((sum, inf) => sum + inf.weight, 0);
        const vertexBones = topInfluences.map(inf => {
          const b = inf.bone;
          const normW = inf.weight / (totalW || 1);
          const bRad = -b.worldAngle * DEG2RAD;
          const cosB = Math.cos(bRad);
          const sinB = Math.sin(bRad);

          const dx = pNode.x - b.worldX0;
          const dy = pNode.y - b.worldY0;
          const localX = dx * cosB - dy * sinB;
          const localY = dx * sinB + dy * cosB;

          let cpInLocal = null;
          if (pNode.cpIn) {
            const cidx = pNode.cpIn.x - b.worldX0;
            const cidy = pNode.cpIn.y - b.worldY0;
            cpInLocal = { x: cidx * cosB - cidy * sinB, y: cidx * sinB + cidy * cosB };
          }

          let cpOutLocal = null;
          if (pNode.cpOut) {
            const codx = pNode.cpOut.x - b.worldX0;
            const cody = pNode.cpOut.y - b.worldY0;
            cpOutLocal = { x: codx * cosB - cody * sinB, y: codx * sinB + cody * cosB };
          }

          return {
            boneId: b.id,
            weight: normW,
            localX,
            localY,
            cpInLocal,
            cpOutLocal
          };
        });

        nodeWeights.push({
          nodeIndex: i,
          influences: vertexBones
        });
      }

      this.bindings = this.bindings.filter(b => b.targetId !== pathNode.id);
      const binding = {
        type: 'smooth_path',
        targetId: pathNode.id,
        nodeWeights
      };
      this.bindings.push(binding);
      return binding;
    }

    /**
     * Apply all bindings to scene nodes (Cutout transform or Path deformation).
     * @param {Map<string, SvgNode> | Object | Function} nodeResolver
     */
    applyBindings(nodeResolver) {
      this.updateWorldTransforms();

      const getNode = (id) => {
        if (typeof nodeResolver === 'function') return nodeResolver(id);
        if (nodeResolver && typeof nodeResolver.get === 'function') return nodeResolver.get(id);
        if (nodeResolver && typeof nodeResolver.findNodeById === 'function') return nodeResolver.findNodeById(id);
        if (nodeResolver && nodeResolver[id]) return nodeResolver[id];
        return null;
      };

      for (const b of this.bindings) {
        const node = getNode(b.targetId);
        if (!node) continue;

        if (b.type === 'cutout') {
          const bone = this.getBone(b.boneId);
          if (!bone) continue;

          const rad = bone.worldAngle * DEG2RAD;
          const cosR = Math.cos(rad);
          const sinR = Math.sin(rad);

          const newCenterX = bone.worldX0 + (b.offsetX * cosR - b.offsetY * sinR);
          const newCenterY = bone.worldY0 + (b.offsetX * sinR + b.offsetY * cosR);
          const newRot = normalizeAngleDeg(bone.worldAngle + b.offsetAngle);

          if (node.cx !== undefined && node.cy !== undefined) {
            node.cx = newCenterX;
            node.cy = newCenterY;
            node.x = newCenterX;
            node.y = newCenterY;
          } else {
            node.x = newCenterX - (b.halfW || 0);
            node.y = newCenterY - (b.halfH || 0);
          }

          node.rotation = newRot;
          node.originX = newCenterX;
          node.originY = newCenterY;
        } else if (b.type === 'path') {
          if (!Array.isArray(node.nodes)) continue;

          for (const w of b.weights) {
            const pNode = node.nodes[w.nodeIndex];
            if (!pNode) continue;

            const bone = this.getBone(w.boneId);
            if (!bone) continue;

            const rad = bone.worldAngle * DEG2RAD;
            const cosR = Math.cos(rad);
            const sinR = Math.sin(rad);

            pNode.x = bone.worldX0 + (w.localX * cosR - w.localY * sinR);
            pNode.y = bone.worldY0 + (w.localX * sinR + w.localY * cosR);

            if (w.cpInLocal && pNode.cpIn) {
              pNode.cpIn.x = bone.worldX0 + (w.cpInLocal.x * cosR - w.cpInLocal.y * sinR);
              pNode.cpIn.y = bone.worldY0 + (w.cpInLocal.x * sinR + w.cpInLocal.y * cosR);
            }
            if (w.cpOutLocal && pNode.cpOut) {
              pNode.cpOut.x = bone.worldX0 + (w.cpOutLocal.x * cosR - w.cpOutLocal.y * sinR);
              pNode.cpOut.y = bone.worldY0 + (w.cpOutLocal.x * sinR + w.cpOutLocal.y * cosR);
            }
          }
        } else if (b.type === 'smooth_path') {
          if (!Array.isArray(node.nodes)) continue;

          for (const nw of b.nodeWeights) {
            const pNode = node.nodes[nw.nodeIndex];
            if (!pNode) continue;

            let blendX = 0;
            let blendY = 0;
            let blendCpInX = 0;
            let blendCpInY = 0;
            let blendCpOutX = 0;
            let blendCpOutY = 0;
            let hasCpIn = false;
            let hasCpOut = false;

            for (const inf of nw.influences) {
              const bone = this.getBone(inf.boneId);
              if (!bone) continue;

              const rad = bone.worldAngle * DEG2RAD;
              const cosR = Math.cos(rad);
              const sinR = Math.sin(rad);

              const wx = bone.worldX0 + (inf.localX * cosR - inf.localY * sinR);
              const wy = bone.worldY0 + (inf.localX * sinR + inf.localY * cosR);

              blendX += wx * inf.weight;
              blendY += wy * inf.weight;

              if (inf.cpInLocal && pNode.cpIn) {
                hasCpIn = true;
                blendCpInX += (bone.worldX0 + (inf.cpInLocal.x * cosR - inf.cpInLocal.y * sinR)) * inf.weight;
                blendCpInY += (bone.worldY0 + (inf.cpInLocal.x * sinR + inf.cpInLocal.y * cosR)) * inf.weight;
              }

              if (inf.cpOutLocal && pNode.cpOut) {
                hasCpOut = true;
                blendCpOutX += (bone.worldX0 + (inf.cpOutLocal.x * cosR - inf.cpOutLocal.y * sinR)) * inf.weight;
                blendCpOutY += (bone.worldY0 + (inf.cpOutLocal.x * sinR + inf.cpOutLocal.y * cosR)) * inf.weight;
              }
            }

            pNode.x = blendX;
            pNode.y = blendY;
            if (hasCpIn && pNode.cpIn) { pNode.cpIn.x = blendCpInX; pNode.cpIn.y = blendCpInY; }
            if (hasCpOut && pNode.cpOut) { pNode.cpOut.x = blendCpOutX; pNode.cpOut.y = blendCpOutY; }
          }
        }
      }
    }

    toJSON() {
      return {
        id: this.id,
        name: this.name,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        scaleX: this.scaleX,
        scaleY: this.scaleY,
        bones: this.bones.map(b => b.toJSON()),
        bindings: this.bindings,
        constraints: this.constraints
      };
    }

    static fromJSON(data) {
      const skel = new SvgSkeleton(data.id, data.name, {
        x: data.x,
        y: data.y,
        rotation: data.rotation,
        scaleX: data.scaleX,
        scaleY: data.scaleY
      });
      if (Array.isArray(data.bones)) {
        for (const bData of data.bones) {
          skel.addBone(SvgBone.fromJSON(bData));
        }
      }
      if (Array.isArray(data.bindings)) {
        skel.bindings = data.bindings;
      }
      if (Array.isArray(data.constraints)) {
        skel.constraints = data.constraints;
      }
      skel.updateWorldTransforms();
      return skel;
    }
  }

  function distancePointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /* =========================================================================
   * 3. RagdollSimulation: Verlet Integration Physics with Constraints
   * ========================================================================= */
  class RagdollSimulation {
    constructor(skeleton, options = {}) {
      this.skeleton = skeleton;
      this.gravity = options.gravity || { x: 0, y: 980 }; // px/s²
      this.floorY = options.floorY !== undefined ? Number(options.floorY) : 800;
      this.floorFriction = options.floorFriction !== undefined ? Number(options.floorFriction) : 0.85;
      this.damping = options.damping !== undefined ? Number(options.damping) : 0.96;
      this.iterations = options.iterations || 8; // Constraint relaxation solver iterations
      this.wind = options.wind || { x: 0, y: 0, turbulence: 0 };
      this.time = 0;

      this.draggedParticle = null;
      this.wasPinnedBeforeDrag = false;

      this.particles = [];
      this.particleMap = new Map();
      this.distanceConstraints = [];
      this.angleConstraints = [];
      this.secondarySprings = [];

      if (skeleton) {
        this.initFromSkeleton(skeleton);
      }
    }

    initFromSkeleton(skeleton) {
      this.skeleton = skeleton;
      this.particles = [];
      this.particleMap = new Map();
      this.distanceConstraints = [];
      this.angleConstraints = [];
      this.secondarySprings = [];

      skeleton.updateWorldTransforms();

      // 1. Create particles for joint positions (worldX0, worldY0) and tips (worldX1, worldY1)
      for (const bone of skeleton.bones) {
        const isPhys = !!(bone.physics && bone.physics.enabled && bone.physics.mode !== 'kinematic');
        const isRagdoll = isPhys && bone.physics.mode === 'ragdoll';
        const isSecondary = isPhys && bone.physics.mode === 'secondary';

        let pJoint = null;
        if (bone.parentId) {
          pJoint = (bone.attachTo === 'base')
            ? this.particleMap.get(`joint_${bone.parentId}`)
            : this.particleMap.get(`tip_${bone.parentId}`);
        }

        if (!pJoint) {
          const isJointPinned = !isRagdoll || bone.parentId !== null;
          pJoint = {
            id: `joint_${bone.id}`,
            boneId: bone.id,
            x: bone.worldX0,
            y: bone.worldY0,
            prevX: bone.worldX0,
            prevY: bone.worldY0,
            isPinned: isJointPinned,
            mass: bone.physics.mass || 1.0,
            invMass: isJointPinned ? 0 : 1.0 / (bone.physics.mass || 1.0)
          };
          this.particles.push(pJoint);
          this.particleMap.set(pJoint.id, pJoint);
        }

        const isTipPinned = !isPhys;
        const pTip = {
          id: `tip_${bone.id}`,
          boneId: bone.id,
          x: bone.worldX1,
          y: bone.worldY1,
          prevX: bone.worldX1,
          prevY: bone.worldY1,
          isPinned: isTipPinned,
          mass: bone.physics.mass || 1.0,
          invMass: isTipPinned ? 0 : 1.0 / (bone.physics.mass || 1.0)
        };
        this.particles.push(pTip);
        this.particleMap.set(pTip.id, pTip);

        // 2. Rigid Distance Constraint representing bone length
        this.distanceConstraints.push({
          p1: pJoint,
          p2: pTip,
          targetDist: bone.length,
          stiffness: 1.0,
          boneId: bone.id
        });

        // 3. Angular Joint Limit Constraint (dynamic bones only)
        if (bone.parentId && isPhys) {
          const parent = skeleton.getBone(bone.parentId);
          if (parent) {
            const pParentJoint = this.particleMap.get(`joint_${parent.id}`);
            const pParentTip = this.particleMap.get(`tip_${parent.id}`);

            if (pParentJoint && pParentTip && pJoint) {
              this.angleConstraints.push({
                p0: pParentJoint,
                p1: pParentTip,
                pChildJoint: pJoint,
                p2: pTip,
                minAngle: (bone.physics.minAngle !== undefined ? bone.physics.minAngle : -135) * DEG2RAD,
                maxAngle: (bone.physics.maxAngle !== undefined ? bone.physics.maxAngle : 135) * DEG2RAD,
                stiffness: 0.8
              });
            }
          }
        }

        // 4. Secondary Physics Spring Setup
        if (isSecondary) {
          this.secondarySprings.push({
            boneId: bone.id,
            pJoint,
            pTip,
            restLength: bone.length,
            restAngle: bone.localAngle,
            stiffness: bone.physics.stiffness || 0.2
          });
        }
      }
    }

    pinJoint(particleId, pinned = true) {
      const p = this.particleMap.get(particleId);
      if (p) {
        p.isPinned = !!pinned;
        p.invMass = p.isPinned ? 0 : 1.0 / p.mass;
      }
    }

    applyImpulse(particleId, vx, vy) {
      const p = this.particleMap.get(particleId);
      if (p && !p.isPinned) {
        p.prevX = p.x - vx;
        p.prevY = p.y - vy;
      }
    }

    findNearestParticle(x, y, maxDistance = 40) {
      let closest = null;
      let minD = maxDistance;
      for (const p of this.particles) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < minD) {
          minD = d;
          closest = p;
        }
      }
      return closest;
    }

    startDrag(x, y, maxDistance = 40) {
      const p = this.findNearestParticle(x, y, maxDistance);
      if (p) {
        this.draggedParticle = p;
        this.wasPinnedBeforeDrag = p.isPinned;
        p.isPinned = true;
        p.invMass = 0;
        p.x = x;
        p.y = y;
        p.prevX = x;
        p.prevY = y;
        return p;
      }
      return null;
    }

    updateDrag(x, y) {
      if (this.draggedParticle) {
        this.draggedParticle.x = x;
        this.draggedParticle.y = y;
      }
    }

    endDrag(vx = 0, vy = 0) {
      if (this.draggedParticle) {
        const p = this.draggedParticle;
        if (!this.wasPinnedBeforeDrag) {
          p.isPinned = false;
          p.invMass = 1.0 / (p.mass || 1.0);
        }
        // Impart release velocity into Verlet integration
        const dt = 1 / 60;
        p.prevX = p.x - (vx || 0) * dt;
        p.prevY = p.y - (vy || 0) * dt;
        this.draggedParticle = null;
      }
    }

    /**
     * Advance simulation by dt seconds using Verlet Integration + Relaxations.
     */
    step(dt = 1 / 60) {
      if (dt <= 0) return;
      const dtSq = dt * dt;
      this.time += dt;

      // Keep kinematic bones anchored to their FK world transforms
      if (this.skeleton) {
        for (const bone of this.skeleton.bones) {
          const isPhys = !!(bone.physics && bone.physics.enabled && bone.physics.mode !== 'kinematic');
          if (!isPhys) {
            const pJ = this.particleMap.get(`joint_${bone.id}`);
            if (pJ && pJ.isPinned) {
              pJ.x = bone.worldX0;
              pJ.y = bone.worldY0;
              pJ.prevX = bone.worldX0;
              pJ.prevY = bone.worldY0;
            }
            const pT = this.particleMap.get(`tip_${bone.id}`);
            if (pT && pT.isPinned) {
              pT.x = bone.worldX1;
              pT.y = bone.worldY1;
              pT.prevX = bone.worldX1;
              pT.prevY = bone.worldY1;
            }
          }
        }
      }

      // 1. Verlet Integration: update positions based on velocity, gravity and wind forces
      for (const p of this.particles) {
        if (p.isPinned) continue;

        const bone = this.skeleton?.getBone(p.boneId);
        const gravScale = bone?.physics.gravityScale !== undefined ? bone.physics.gravityScale : 1.0;
        const damp = bone?.physics.damping !== undefined ? bone.physics.damping : this.damping;

        const vx = (p.x - p.prevX) * damp;
        const vy = (p.y - p.prevY) * damp;

        p.prevX = p.x;
        p.prevY = p.y;

        // Environmental Wind & Turbulence Force
        const windBaseX = this.wind?.x || 0;
        const windBaseY = this.wind?.y || 0;
        const turb = this.wind?.turbulence || 0;
        const turbX = turb ? Math.sin(this.time * 3.8 + p.y * 0.02) * turb * 180 : 0;
        const turbY = turb ? Math.cos(this.time * 2.9 + p.x * 0.02) * turb * 90 : 0;

        p.x += vx + (this.gravity.x * gravScale + windBaseX + turbX) * dtSq;
        p.y += vy + (this.gravity.y * gravScale + windBaseY + turbY) * dtSq;
      }

      // 2. Secondary Springs: add elastic forces pulling secondary bones towards their local target angle
      for (const s of this.secondarySprings) {
        const bone = this.skeleton.getBone(s.boneId);
        if (!bone) continue;

        let baseAngle = this.skeleton.rotation;
        if (bone.parentId) {
          const p = this.skeleton.getBone(bone.parentId);
          if (p) baseAngle = p.worldAngle;
        }

        const targetRad = (baseAngle + s.restAngle) * DEG2RAD;
        const targetTipX = s.pJoint.x + s.restLength * Math.cos(targetRad);
        const targetTipY = s.pJoint.y + s.restLength * Math.sin(targetRad);

        s.pTip.x += (targetTipX - s.pTip.x) * s.stiffness;
        s.pTip.y += (targetTipY - s.pTip.y) * s.stiffness;
      }

      // 3. Relax Constraints iteratively (Gauss-Seidel)
      for (let iter = 0; iter < this.iterations; iter++) {
        // A. Bone Distance Constraints (Rigid sticks)
        for (const c of this.distanceConstraints) {
          const dx = c.p2.x - c.p1.x;
          const dy = c.p2.y - c.p1.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 1e-5) continue;

          const diff = (dist - c.targetDist) / dist * c.stiffness;
          const wTotal = c.p1.invMass + c.p2.invMass;
          if (wTotal <= 0) continue;

          const w1 = c.p1.invMass / wTotal;
          const w2 = c.p2.invMass / wTotal;

          if (!c.p1.isPinned) {
            c.p1.x += dx * diff * w1;
            c.p1.y += dy * diff * w1;
          }
          if (!c.p2.isPinned) {
            c.p2.x -= dx * diff * w2;
            c.p2.y -= dy * diff * w2;
          }
        }

        // B. Angular Joint Limits
        for (const ac of this.angleConstraints) {
          // Angle of parent bone: p0 -> p1
          const aParent = Math.atan2(ac.p1.y - ac.p0.y, ac.p1.x - ac.p0.x);
          // Angle of child bone: pChildJoint -> p2
          const pJ = ac.pChildJoint || ac.p1;
          const aChild = Math.atan2(ac.p2.y - pJ.y, ac.p2.x - pJ.x);

          let rel = aChild - aParent;
          while (rel > Math.PI) rel -= 2 * Math.PI;
          while (rel < -Math.PI) rel += 2 * Math.PI;

          let clamped = rel;
          if (rel < ac.minAngle) clamped = ac.minAngle;
          else if (rel > ac.maxAngle) clamped = ac.maxAngle;

          if (clamped !== rel && !ac.p2.isPinned) {
            const desiredChildAngle = aParent + clamped;
            const len = Math.hypot(ac.p2.x - pJ.x, ac.p2.y - pJ.y);
            const targetX = pJ.x + len * Math.cos(desiredChildAngle);
            const targetY = pJ.y + len * Math.sin(desiredChildAngle);

            ac.p2.x += (targetX - ac.p2.x) * ac.stiffness;
            ac.p2.y += (targetY - ac.p2.y) * ac.stiffness;
          }
        }

        // C. Particle-to-Particle Self-Collision Repulsion
        const minParticleDist = 14;
        const minParticleDistSq = minParticleDist * minParticleDist;
        for (let i = 0; i < this.particles.length; i++) {
          const p1 = this.particles[i];
          for (let j = i + 1; j < this.particles.length; j++) {
            const p2 = this.particles[j];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minParticleDistSq && distSq > 1e-6) {
              const dist = Math.sqrt(distSq);
              const overlap = (minParticleDist - dist) / dist * 0.5;
              const wTotal = p1.invMass + p2.invMass;
              if (wTotal > 0) {
                if (!p1.isPinned) {
                  p1.x -= dx * overlap * (p1.invMass / wTotal);
                  p1.y -= dy * overlap * (p1.invMass / wTotal);
                }
                if (!p2.isPinned) {
                  p2.x += dx * overlap * (p2.invMass / wTotal);
                  p2.y += dy * overlap * (p2.invMass / wTotal);
                }
              }
            }
          }
        }

        // D. Floor Collision with friction
        if (this.floorY !== null) {
          for (const p of this.particles) {
            if (p.y > this.floorY) {
              p.y = this.floorY;
              // Friction on X axis
              p.prevX = p.x - (p.x - p.prevX) * this.floorFriction;
            }
          }
        }
      }

      // 4. Propagate physical positions back to SvgSkeleton dynamic bones
      this.syncToSkeleton();
    }

    syncToSkeleton() {
      if (!this.skeleton) return;

      for (const bone of this.skeleton.bones) {
        const isPhys = !!(bone.physics && bone.physics.enabled && bone.physics.mode !== 'kinematic');
        if (!isPhys) continue;

        let pJoint = null;
        if (bone.parentId) {
          pJoint = (bone.attachTo === 'base')
            ? this.particleMap.get(`joint_${bone.parentId}`)
            : this.particleMap.get(`tip_${bone.parentId}`);
        } else {
          pJoint = this.particleMap.get(`joint_${bone.id}`);
        }
        const pTip = this.particleMap.get(`tip_${bone.id}`);

        if (pJoint && pTip) {
          bone.worldX0 = pJoint.x;
          bone.worldY0 = pJoint.y;
          bone.worldX1 = pTip.x;
          bone.worldY1 = pTip.y;

          const dx = pTip.x - pJoint.x;
          const dy = pTip.y - pJoint.y;
          bone.worldAngle = normalizeAngleDeg(Math.atan2(dy, dx) * RAD2DEG);

          // Calculate local angle relative to parent
          if (bone.parentId) {
            const parent = this.skeleton.getBone(bone.parentId);
            if (parent) {
              bone.localAngle = normalizeAngleDeg(bone.worldAngle - parent.worldAngle);
            }
          } else {
            bone.localAngle = normalizeAngleDeg(bone.worldAngle - this.skeleton.rotation);
            this.skeleton.x = pJoint.x;
            this.skeleton.y = pJoint.y;
          }
        }
      }
    }
  }

  /* =========================================================================
   * 4. DopeSheet Integration: "Bake Physics to Keyframes"
   * ========================================================================= */
  /**
   * Bakes a ragdoll/physics simulation directly into a DopeSheet animation clip.
   * Creates channels for bone rotation and root translation.
   */
  function bakeRagdollToDopeSheet(skeleton, sim, dopeSheet, options = {}) {
    if (!skeleton || !sim || !dopeSheet) return null;

    const totalFrames = options.totalFrames || dopeSheet.totalFrames || 60;
    const fps = options.fps || dopeSheet.fps || 24;
    const dt = 1.0 / fps;

    // Optional impulse or forces to trigger the drop
    if (options.initialImpulses) {
      for (const imp of options.initialImpulses) {
        sim.applyImpulse(imp.particleId, imp.vx, imp.vy);
      }
    }

    // Ensure DopeSheetObjects exist
    const rootDObj = dopeSheet.getOrCreateObject(skeleton.id, skeleton.name, 'vector');
    const boneDObjs = new Map();
    for (const bone of skeleton.bones) {
      boneDObjs.set(bone.id, dopeSheet.getOrCreateObject(bone.id, bone.name, 'vector'));
    }

    for (let frame = 0; frame <= totalFrames; frame++) {
      if (frame > 0) {
        sim.step(dt);
      }

      // Record Root Position
      rootDObj.setKeyframe('x', frame, skeleton.x, 'linear');
      rootDObj.setKeyframe('y', frame, skeleton.y, 'linear');

      // Record Bone Rotations
      for (const bone of skeleton.bones) {
        const bObj = boneDObjs.get(bone.id);
        if (bObj) {
          bObj.setKeyframe('rotation', frame, bone.localAngle, 'linear');
        }
      }
    }

    return dopeSheet;
  }

  return {
    SvgBone,
    SvgSkeleton,
    RagdollSimulation,
    bakeRagdollToDopeSheet,
    normalizeAngleDeg,
    distancePointToSegment
  };
}));
