import * as THREE from 'three';

// Shared pieces for combat scenarios: pooled effects, patrol routes and simple
// path planning around rectangular buildings.

// Deterministic random so scenes and waves look the same on every load.
export function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Short-lived effects: muzzle flashes, tracers and dust puffs, all pooled.
export function createEffects(group) {
  const glow = document.createElement('canvas'); glow.width = glow.height = 64;
  const g = glow.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(.3, 'rgba(255,255,255,.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(glow);
  const pool = (count, color, blending) => Array.from({ length: count }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, blending, depthWrite: false }));
    sprite.visible = false; group.add(sprite); return { sprite, life: 0, max: 1 };
  });
  const flashes = pool(16, '#ffc46b', THREE.AdditiveBlending), puffs = pool(28, '#b9b3a4', THREE.NormalBlending);
  const TRACERS = 48, tracerData = Array.from({ length: TRACERS }, () => ({ from: new THREE.Vector3(), dir: new THREE.Vector3(), travelled: 0, length: 0, live: false, onHit: null }));
  const tracerGeometry = new THREE.BufferGeometry();
  tracerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACERS * 6), 3));
  const tracers = new THREE.LineSegments(tracerGeometry, new THREE.LineBasicMaterial({ color: '#ffd27a', transparent: true, opacity: .9, blending: THREE.AdditiveBlending }));
  tracers.frustumCulled = false; group.add(tracers);
  // Reuse an idle slot, or the one closest to expiring.
  const take = list => list.find(x => x.life <= 0) || list.reduce((a, b) => (b.life < a.life ? b : a));
  let nextTracer = 0;
  return {
    flash(p, size = .7) { const f = take(flashes); f.sprite.position.copy(p); f.sprite.scale.setScalar(size * (.7 + Math.random() * .6)); f.sprite.visible = true; f.life = f.max = .06; },
    puff(p, color = '#b9b3a4') { const d = take(puffs); d.sprite.material.color.set(color); d.sprite.position.copy(p); d.sprite.scale.setScalar(.3); d.sprite.visible = true; d.life = d.max = .7; },
    tracer(from, to, onHit) {
      const t = tracerData[nextTracer = (nextTracer + 1) % TRACERS];
      t.from.copy(from); t.dir.subVectors(to, from); t.length = t.dir.length(); t.dir.normalize(); t.travelled = 0; t.live = true; t.onHit = onHit;
    },
    update(dt) {
      for (const f of flashes) if (f.life > 0) { f.life -= dt; f.sprite.visible = f.life > 0; }
      for (const d of puffs) if (d.life > 0) {
        d.life -= dt; const k = 1 - d.life / d.max;
        d.sprite.scale.setScalar(.3 + k * 1.4); d.sprite.material.opacity = .7 * (1 - k); d.sprite.position.y += dt * .4; d.sprite.visible = d.life > 0;
      }
      const pos = tracerGeometry.attributes.position;
      tracerData.forEach((t, i) => {
        if (t.live) { t.travelled += dt * 170; if (t.travelled >= t.length) { t.live = false; t.onHit?.(); } }
        const head = Math.min(t.travelled, t.length), tail = Math.max(0, head - 3);
        const a = t.live ? tail : 0, b = t.live ? head : 0;
        pos.setXYZ(i * 2, t.from.x + t.dir.x * a, t.from.y + t.dir.y * a, t.from.z + t.dir.z * a);
        pos.setXYZ(i * 2 + 1, t.from.x + t.dir.x * b, t.from.y + t.dir.y * b, t.from.z + t.dir.z * b);
      });
      pos.needsUpdate = true;
    },
  };
}

// Closed polyline: position/tangent at a distance, and which segment it is on.
// Two points make a back-and-forth pacing route.
export function route(points) {
  const segments = points.map((a, i) => { const b = points[(i + 1) % points.length]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
  const total = segments.reduce((sum, seg) => sum + seg.len, 0);
  return {
    total,
    segment(s) { s = ((s % total) + total) % total; let i = 0; while (i < segments.length - 1 && s > segments[i].len) { s -= segments[i].len; i++; } return i; },
    at(s) {
      s = ((s % total) + total) % total;
      for (const seg of segments) {
        if (s <= seg.len) { const t = s / seg.len; return { x: seg.a[0] + (seg.b[0] - seg.a[0]) * t, z: seg.a[1] + (seg.b[1] - seg.a[1]) * t, dx: (seg.b[0] - seg.a[0]) / seg.len, dz: (seg.b[1] - seg.a[1]) / seg.len }; }
        s -= seg.len;
      }
      return { x: points[0][0], z: points[0][1], dx: 1, dz: 0 };
    },
  };
}

// Rectangles are [minX, minZ, maxX, maxZ]. A point counts as inside when strictly within.
const inside = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
function blockedBy(rects, a, b) {
  for (const r of rects) for (let i = 1; i < 24; i++) {
    const t = i / 24;
    if (inside(r, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return r;
  }
  return null;
}
// Straight line if clear, otherwise detour via one or two corners of the blocking building.
export function plan(from, to, rects, margin = .5) {
  const block = blockedBy(rects, from, to);
  if (!block) return [to];
  const c = [[block[0] - margin, block[1] - margin], [block[2] + margin, block[1] - margin], [block[2] + margin, block[3] + margin], [block[0] - margin, block[3] + margin]];
  const length = path => path.reduce((sum, p, i) => { const q = i ? path[i - 1] : from; return sum + Math.hypot(p[0] - q[0], p[1] - q[1]); }, 0);
  let best = null;
  const consider = path => { if (!best || length(path) < length(best)) best = path; };
  for (const p of c) if (!blockedBy(rects, from, p) && !blockedBy(rects, p, to)) consider([p, to]);
  if (!best) for (let i = 0; i < 4; i++) for (const j of [(i + 1) % 4, (i + 3) % 4]) {
    if (!blockedBy(rects, from, c[i]) && !blockedBy(rects, c[i], c[j]) && !blockedBy(rects, c[j], to)) consider([c[i], c[j], to]);
  }
  return best || [to];
}
