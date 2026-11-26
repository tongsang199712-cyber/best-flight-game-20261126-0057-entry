// world.js — Kestrel Valley itself: the heightfield every other system
// samples, its terrain mesh, the paved home runway, the plateau dirt strip,
// the lake, trees, rocks and drifting clouds.
//
// Coordinates: metres, X east, Z south, Y up. Heading 0 flies north (-Z).

import { Builder, createMesh } from './glkit.js';
import { clamp, lerp, smoothstep } from './math3d.js';

// The home runway: 600 m of asphalt on the valley floor, thresholds at
// z = 560 (south) and z = -40 (north), flat at 6 m.
export const RUNWAY = { cx: 0, halfWidth: 15, zSouth: 560, zNorth: -40, y: 6 };
// The plateau dirt strip: 240 m east-west at 64 m, the "Plateau Post" goal.
export const DIRT_STRIP = { xWest: -820, xEast: -580, cz: -500, halfWidth: 9, y: 64 };
export const WORLD_EDGE = 2350;

// Deterministic little RNG so the valley is the same on every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Exactly 1 inside the rectangle, easing to 0 across `margin` metres
// outside it — distance-based, so a wide margin can never dilute the core.
function rectBlend(x, z, x0, x1, z0, z1, margin) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  return 1 - smoothstep(0, margin, Math.max(dx, dz));
}

export function groundHeight(x, z) {
  // Rolling hill country.
  let h = 44
    + 30 * Math.sin(x * 0.0038 + 0.9) * Math.cos(z * 0.0031 - 0.4)
    + 16 * Math.sin(x * 0.0105 + 1.7) * Math.sin(z * 0.0087 + 0.6)
    + 7 * Math.sin(x * 0.027 + 4.0) * Math.sin(z * 0.023 + 2.0);
  // Carve the north-south valley the field sits in.
  const valley = smoothstep(150, 780, Math.abs(x));
  h = lerp(6, h, 0.15 + 0.85 * valley);
  // A mountain rim closes the world in.
  const rim = smoothstep(1500, 2350, Math.max(Math.abs(x), Math.abs(z)));
  h += rim * 200 * (0.7 + 0.3 * Math.sin(x * 0.002 + z * 0.0016));
  // The lake basin, south-east.
  const lakeDist = Math.hypot(x - 620, z - 1350);
  h = lerp(1.5, h, smoothstep(120, 430, lakeDist));
  // The north-west plateau, levelled for the dirt strip.
  const plateau = rectBlend(x, z, -900, -500, -640, -360, 130);
  h = lerp(h, DIRT_STRIP.y, plateau);
  // The home field, dead flat.
  const field = rectBlend(x, z, -48, 48, -120, 640, 130);
  h = lerp(h, RUNWAY.y, field);
  return h;
}

export function onRunway(x, z, margin = 0) {
  return Math.abs(x - RUNWAY.cx) <= RUNWAY.halfWidth + margin && z >= RUNWAY.zNorth - margin && z <= RUNWAY.zSouth + margin;
}

export function onDirtStrip(x, z, margin = 0) {
  return x >= DIRT_STRIP.xWest - margin && x <= DIRT_STRIP.xEast + margin
    && Math.abs(z - DIRT_STRIP.cz) <= DIRT_STRIP.halfWidth + margin;
}

function terrainColor(x, z, h, slope) {
  if (h < 3.4) return [0.76, 0.70, 0.52];                       // lakeshore sand
  if (slope > 0.62) return [0.42, 0.38, 0.35];                  // steep rock
  if (h > 185) return [0.88, 0.89, 0.92];                       // snowy rim
  if (h > 120) return [0.52, 0.50, 0.44];                       // high stone
  const n = 0.5 + 0.5 * Math.sin(x * 0.021 + z * 0.017 + Math.sin(x * 0.005) * 3);
  const g = lerp(0.30, 0.42, n);
  return [g * 0.72, g, g * 0.52];                               // meadow greens
}

function cone(b, cx, cy, cz, r, h, color, segments = 7) {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    b.tri(
      [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r],
      [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r],
      [cx, cy + h, cz],
      color,
    );
  }
}

export function buildWorld(gl) {
  const b = new Builder();
  const SIZE = 4800, STEP = 60;
  const n = SIZE / STEP;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -SIZE / 2 + i * STEP, x1 = x0 + STEP;
      const z0 = -SIZE / 2 + j * STEP, z1 = z0 + STEP;
      const A = [x0, groundHeight(x0, z0), z0], B = [x1, groundHeight(x1, z0), z0];
      const C = [x1, groundHeight(x1, z1), z1], D = [x0, groundHeight(x0, z1), z1];
      const midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2;
      const h = groundHeight(midX, midZ);
      const slope = Math.min(1, Math.abs(groundHeight(midX + 18, midZ) - groundHeight(midX - 18, midZ)) / 36
        + Math.abs(groundHeight(midX, midZ + 18) - groundHeight(midX, midZ - 18)) / 36);
      const color = terrainColor(midX, midZ, h, slope);
      b.quad(A, D, C, B, color);
    }
  }

  // Trees and rocks, scattered by the seeded RNG where the land suits them.
  const rand = mulberry32(20261126);
  for (let i = 0; i < 1500; i++) {
    const x = (rand() * 2 - 1) * 2250;
    const z = (rand() * 2 - 1) * 2250;
    const h = groundHeight(x, z);
    if (h < 8 || h > 105) continue;
    if (onRunway(x, z, 55) || onDirtStrip(x, z, 40)) continue;
    if (Math.hypot(x - 620, z - 1350) < 430) continue;
    const slope = Math.abs(groundHeight(x + 9, z) - groundHeight(x - 9, z))
      + Math.abs(groundHeight(x, z + 9) - groundHeight(x, z - 9));
    if (slope > 7) { // bare rock outcrop instead of a tree
      if (rand() < 0.4) b.blob(x, h + 0.5, z, 2 + rand() * 3.5, [0.45, 0.42, 0.39], 0.7);
      continue;
    }
    if (rand() < 0.22) continue;
    const s = 0.8 + rand() * 0.7;
    b.box(x, h + 1.1 * s, z, 0.5 * s, 2.2 * s, 0.5 * s, [0.36, 0.25, 0.16]);
    cone(b, x, h + 1.6 * s, z, 2.6 * s, 4.6 * s, [0.16, 0.34, 0.18]);
    cone(b, x, h + 3.6 * s, z, 1.8 * s, 3.4 * s, [0.19, 0.39, 0.21]);
  }
  const terrain = createMesh(gl, b);

  // Paved runway with threshold bars and a dashed centreline.
  const rb = new Builder();
  const ry = RUNWAY.y + 0.14;
  rb.quad([-15, ry, -40], [-15, ry, 560], [15, ry, 560], [15, ry, -40], [0.15, 0.15, 0.16]);
  for (let i = 0; i < 16; i++) { // centreline dashes
    const z = -20 + i * 36;
    rb.quad([-0.5, ry + 0.03, z], [-0.5, ry + 0.03, z + 16], [0.5, ry + 0.03, z + 16], [0.5, ry + 0.03, z], [0.85, 0.86, 0.84]);
  }
  for (const endZ of [-40, 560]) { // threshold piano keys
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const x = k * 3.6;
      const zIn = endZ === -40 ? endZ + 14 : endZ - 14;
      rb.quad([x - 1, ry + 0.03, endZ], [x - 1, ry + 0.03, zIn], [x + 1, ry + 0.03, zIn], [x + 1, ry + 0.03, endZ], [0.88, 0.88, 0.86]);
    }
  }
  // The field buildings: two hangars, a fuel hut and a windsock.
  rb.box(46, RUNWAY.y + 4, 330, 26, 8, 18, [0.55, 0.30, 0.22]);
  rb.box(46, RUNWAY.y + 8.6, 330, 27, 1.2, 19, [0.30, 0.28, 0.30]);
  rb.box(46, RUNWAY.y + 4, 372, 20, 8, 15, [0.42, 0.44, 0.46]);
  rb.box(46, RUNWAY.y + 8.6, 372, 21, 1.2, 16, [0.30, 0.28, 0.30]);
  rb.box(-38, RUNWAY.y + 1.6, 250, 6, 3.2, 5, [0.65, 0.55, 0.30]);
  rb.box(24, RUNWAY.y + 3.4, 120, 0.35, 6.8, 0.35, [0.80, 0.80, 0.80]);
  cone(rb, 24, RUNWAY.y + 6.2, 120, 0.55, 2.6, [0.95, 0.45, 0.10]);
  const runway = createMesh(gl, rb);

  // Dirt strip on the plateau.
  const db = new Builder();
  const dy = DIRT_STRIP.y + 0.14;
  db.quad([DIRT_STRIP.xWest, dy, DIRT_STRIP.cz - 9], [DIRT_STRIP.xWest, dy, DIRT_STRIP.cz + 9],
    [DIRT_STRIP.xEast, dy, DIRT_STRIP.cz + 9], [DIRT_STRIP.xEast, dy, DIRT_STRIP.cz - 9], [0.52, 0.42, 0.30]);
  for (const mx of [DIRT_STRIP.xWest + 4, DIRT_STRIP.xEast - 4]) {
    db.box(mx, dy + 0.25, DIRT_STRIP.cz - 10.5, 1.2, 0.5, 1.2, [0.9, 0.9, 0.88]);
    db.box(mx, dy + 0.25, DIRT_STRIP.cz + 10.5, 1.2, 0.5, 1.2, [0.9, 0.9, 0.88]);
  }
  const dirt = createMesh(gl, db);

  // The lake surface.
  const wb = new Builder();
  wb.quad([270, 3.1, 1010], [270, 3.1, 1690], [970, 3.1, 1690], [970, 3.1, 1010], [0.25, 0.48, 0.66]);
  const water = createMesh(gl, wb);

  // Clouds: clusters of flattened blobs, one mesh, drifted by the renderer.
  const cb = new Builder();
  const crand = mulberry32(777);
  for (let i = 0; i < 16; i++) {
    const cx = (crand() * 2 - 1) * 2100;
    const cz = (crand() * 2 - 1) * 2100;
    const cy = 300 + crand() * 130;
    const puffs = 3 + Math.floor(crand() * 3);
    for (let p = 0; p < puffs; p++) {
      cb.blob(cx + (crand() * 2 - 1) * 42, cy + (crand() * 2 - 1) * 7, cz + (crand() * 2 - 1) * 26,
        22 + crand() * 26, [0.96, 0.97, 0.99], 0.42);
    }
  }
  const clouds = createMesh(gl, cb);

  // The sun: one bright ball hung in the south-east sky.
  const sb = new Builder();
  sb.blob(1500, 900, 1900, 95, [1.0, 0.93, 0.72], 1, 12);
  const sun = createMesh(gl, sb);

  return { terrain, runway, dirt, water, clouds, sun };
}

export function cloudDrift(t) {
  return [(t * 2.2) % 4400 - 2200, 0, 0];
}

export { clamp };
