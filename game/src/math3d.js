// math3d.js — small vector and matrix helpers for Kestrel Valley.
// Column-major 4x4 matrices in the WebGL convention, plain arrays of 16.

export function perspective(fovDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

export function lookAt(eye, target, up) {
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ];
}

export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function translation(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

export function scaling(x, y, z) {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

export function rotationX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

export function rotationY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

export function rotationZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// Aircraft orientation from heading (compass radians, 0 = north = -Z),
// pitch (nose up positive) and roll (right wing down positive).
export function planeOrientation(heading, pitch, roll) {
  return multiply(rotationY(heading), multiply(rotationX(-pitch), rotationZ(-roll)));
}

// The forward, up and right vectors of an orientation matrix.
export function basis(m) {
  return {
    right: [m[0], m[1], m[2]],
    up: [m[4], m[5], m[6]],
    back: [m[8], m[9], m[10]],
    forward: [-m[8], -m[9], -m[10]],
  };
}

export function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function len(a) { return Math.hypot(a[0], a[1], a[2]); }
export function norm(a) {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
