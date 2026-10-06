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
      this.physics = {
        enabled: options.physics?.enabled ?? false,
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
      // Cutout bindings: { type: 'cutout', targetId, boneId, offsetAngle, offsetX, offsetY }
      // Path bindings: { type: 'path', targetId, weights: [{ nodeIndex, boneId, dist, angle, weight, cpInDist, cpInAngle, cpOutDist, cpOutAngle }] }
      this.bindings = [];
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
      // Clean bindings
      this.bindings = this.bindings.filter(bind => bind.boneId !== boneId);
      this.updateWorldTransforms();
      return true;
    }

    /**
     * Compute World Transforms (Forward Kinematics) for all bones.
     */
    updateWorldTransforms() {
      // Process root bones first, then children
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
            baseX = parent.worldX1;
            baseY = parent.worldY1;
          }
        }

        // Apply local offset if any, rotated by parent angle
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
     * Cyclic Coordinate Descent (CCD-IK) Solver.
     * Rotates bones in the chain from effector up to reach (targetX, targetY).
     */
    solveIK(effectorBoneId, targetX, targetY, options = {}) {
      const maxIterations = options.maxIterations || 15;
      const tolerance = options.tolerance || 0.5;
      const chainLength = options.chainLength || 0; // 0 = all the way to root

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

      for (let iter = 0; iter < maxIterations; iter++) {
        this.updateWorldTransforms();
        const curDist = Math.hypot(effector.worldX1 - targetX, effector.worldY1 - targetY);
        if (curDist <= tolerance) break;

        for (let i = 0; i < chain.length; i++) {
          const bone = chain[i];
          this.updateWorldTransforms();

          // Vector from bone joint to effector tip
          const effX = effector.worldX1 - bone.worldX0;
          const effY = effector.worldY1 - bone.worldY0;
          const effLen = Math.hypot(effX, effY);
          if (effLen < 1e-4) continue;

          // Vector from bone joint to target
          const tgtX = targetX - bone.worldX0;
          const tgtY = targetY - bone.worldY0;
          const tgtLen = Math.hypot(tgtX, tgtY);
          if (tgtLen < 1e-4) continue;

          // Calculate angle delta
          const effAngle = Math.atan2(effY, effX);
          const tgtAngle = Math.atan2(tgtY, tgtX);
          let deltaDeg = (tgtAngle - effAngle) * RAD2DEG;
          deltaDeg = normalizeAngleDeg(deltaDeg);

          // Apply rotation
          let newAngle = bone.localAngle + deltaDeg;
          if (bone.physics.minAngle !== undefined && bone.physics.maxAngle !== undefined) {
            newAngle = clamp(newAngle, bone.physics.minAngle, bone.physics.maxAngle);
          }
          bone.localAngle = normalizeAngleDeg(newAngle);
        }
      }

      this.updateWorldTransforms();
      const finalDist = Math.hypot(effector.worldX1 - targetX, effector.worldY1 - targetY);
      return finalDist <= tolerance;
    }

    /* ── Cutout Binding ── */
    bindCutout(targetNode, boneId) {
      const bone = this.getBone(boneId);
      if (!bone || !targetNode) return null;
      
      this.updateWorldTransforms();
      const targetId = targetNode.id;

      // Calculate relative offset between target node and bone joint
      const dx = targetNode.x - bone.worldX0;
      const dy = targetNode.y - bone.worldY0;
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
        offsetAngle
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
        // Find best bone or compute inverse-distance weights
        let bestBone = candidateBones[0];
        let bestDist = Infinity;

        for (const b of candidateBones) {
          // Distance to bone segment
          const segDist = distancePointToSegment(node.x, node.y, b.worldX0, b.worldY0, b.worldX1, b.worldY1);
          if (segDist < bestDist) {
            bestDist = segDist;
            bestBone = b;
          }
        }

        // Relative transform to the best bone
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

          node.x = bone.worldX0 + (b.offsetX * cosR - b.offsetY * sinR);
          node.y = bone.worldY0 + (b.offsetX * sinR + b.offsetY * cosR);
          node.rotation = normalizeAngleDeg(bone.worldAngle + b.offsetAngle);
          node.originX = bone.worldX0;
          node.originY = bone.worldY0;
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
        bindings: this.bindings
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
      // Share particles where child.worldX0 == parent.worldX1 to enforce continuous articulation
      for (const bone of skeleton.bones) {
        let pJoint = null;
        if (bone.parentId) {
          pJoint = this.particleMap.get(`tip_${bone.parentId}`);
        }

        if (!pJoint) {
          pJoint = {
            id: `joint_${bone.id}`,
            boneId: bone.id,
            x: bone.worldX0,
            y: bone.worldY0,
            prevX: bone.worldX0,
            prevY: bone.worldY0,
            isPinned: bone.parentId === null && bone.physics.mode !== 'ragdoll',
            mass: bone.physics.mass || 1.0,
            invMass: (bone.parentId === null && bone.physics.mode !== 'ragdoll') ? 0 : 1.0 / (bone.physics.mass || 1.0)
          };
          this.particles.push(pJoint);
          this.particleMap.set(pJoint.id, pJoint);
        }

        const pTip = {
          id: `tip_${bone.id}`,
          boneId: bone.id,
          x: bone.worldX1,
          y: bone.worldY1,
          prevX: bone.worldX1,
          prevY: bone.worldY1,
          isPinned: false,
          mass: bone.physics.mass || 1.0,
          invMass: 1.0 / (bone.physics.mass || 1.0)
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

        // 3. Angular Joint Limit Constraint
        if (bone.parentId) {
          const parent = skeleton.getBone(bone.parentId);
          if (parent) {
            const pParentJoint = this.particleMap.get(`joint_${parent.id}`) ||
              (parent.parentId ? this.particleMap.get(`tip_${parent.parentId}`) : null);

            if (pParentJoint) {
              this.angleConstraints.push({
                p0: pParentJoint,
                p1: pJoint,
                p2: pTip,
                minAngle: (bone.physics.minAngle !== undefined ? bone.physics.minAngle : -135) * DEG2RAD,
                maxAngle: (bone.physics.maxAngle !== undefined ? bone.physics.maxAngle : 135) * DEG2RAD,
                stiffness: 0.8
              });
            }
          }
        }

        // 4. Secondary Physics Spring Setup
        if (bone.physics.mode === 'secondary') {
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

    /**
     * Advance simulation by dt seconds using Verlet Integration + Relaxations.
     */
    step(dt = 1 / 60) {
      if (dt <= 0) return;
      const dtSq = dt * dt;

      // 1. Verlet Integration: update positions based on velocity and gravity
      for (const p of this.particles) {
        if (p.isPinned) continue;

        const bone = this.skeleton?.getBone(p.boneId);
        const gravScale = bone?.physics.gravityScale !== undefined ? bone.physics.gravityScale : 1.0;
        const damp = bone?.physics.damping !== undefined ? bone.physics.damping : this.damping;

        const vx = (p.x - p.prevX) * damp;
        const vy = (p.y - p.prevY) * damp;

        p.prevX = p.x;
        p.prevY = p.y;

        p.x += vx + (this.gravity.x * gravScale) * dtSq;
        p.y += vy + (this.gravity.y * gravScale) * dtSq;
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
          // Angle of child bone: p1 -> p2
          const aChild = Math.atan2(ac.p2.y - ac.p1.y, ac.p2.x - ac.p1.x);

          let rel = aChild - aParent;
          while (rel > Math.PI) rel -= 2 * Math.PI;
          while (rel < -Math.PI) rel += 2 * Math.PI;

          let clamped = rel;
          if (rel < ac.minAngle) clamped = ac.minAngle;
          else if (rel > ac.maxAngle) clamped = ac.maxAngle;

          if (clamped !== rel && !ac.p2.isPinned) {
            const desiredChildAngle = aParent + clamped;
            const len = Math.hypot(ac.p2.x - ac.p1.x, ac.p2.y - ac.p1.y);
            const targetX = ac.p1.x + len * Math.cos(desiredChildAngle);
            const targetY = ac.p1.y + len * Math.sin(desiredChildAngle);

            ac.p2.x += (targetX - ac.p2.x) * ac.stiffness;
            ac.p2.y += (targetY - ac.p2.y) * ac.stiffness;
          }
        }

        // C. Floor Collision with friction
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

      // 4. Propagate physical positions back to SvgSkeleton bones
      this.syncToSkeleton();
    }

    syncToSkeleton() {
      if (!this.skeleton) return;

      for (const bone of this.skeleton.bones) {
        let pJoint = null;
        if (bone.parentId) {
          pJoint = this.particleMap.get(`tip_${bone.parentId}`);
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
