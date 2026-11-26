// course.js — the Ring Run course: eight gates threaded down the valley,
// over the shoulder of the hills and back to the field. A ring is a torus
// you fly through along its axis; crossing its plane inside the rim counts.

import { Builder, createMesh } from './glkit.js';
import { dot, sub } from './math3d.js';

// center, heading the pilot should fly through it (radians, 0 = north).
export const RING_COURSE = [
  { center: [0, 42, 90], heading: 0 },
  { center: [70, 58, -360], heading: 0.15 },
  { center: [-130, 74, -820], heading: -0.2 },
  { center: [150, 96, -1260], heading: 0.35 },
  { center: [440, 118, -1520], heading: 0.85 },
  { center: [720, 100, -1080], heading: 2.45 },
  { center: [520, 72, -470], heading: 2.9 },
  { center: [170, 48, -70], heading: 3.05 },
];

export const RING_RADIUS = 24;

const RING_COLORS = {
  next: [1.0, 0.52, 0.10],     // the gate to fly, hot orange
  waiting: [0.15, 0.75, 0.80], // still to come, teal
  done: [0.35, 0.85, 0.40],    // flown, green
};

export function ringAxis(heading) {
  // The direction of travel through the ring for a given heading.
  return [-Math.sin(heading), 0, -Math.cos(heading)];
}

export function buildRingMesh(gl, state) {
  const b = new Builder();
  b.torus(0, 0, 0, RING_RADIUS, 1.7, RING_COLORS[state]);
  return createMesh(gl, b);
}

// Watches the aircraft against the one active ring. Feed it the plane's
// position every step; it answers true on the step the plane crosses the
// ring's plane within the rim.
export class RingTracker {
  constructor(course = RING_COURSE) {
    this.course = course;
    this.index = 0;
    this.prevSide = null;
  }

  get done() { return this.index >= this.course.length; }
  get current() { return this.course[this.index]; }

  reset() {
    this.index = 0;
    this.prevSide = null;
  }

  update(pos) {
    if (this.done) return false;
    const ring = this.current;
    const axis = ringAxis(ring.heading);
    const rel = sub(pos, ring.center);
    const side = dot(rel, axis);
    const radial = Math.hypot(rel[0] - axis[0] * side, rel[1] - axis[1] * side, rel[2] - axis[2] * side);
    let passed = false;
    if (this.prevSide !== null && Math.sign(side) !== Math.sign(this.prevSide) && Math.abs(side) < 40 && radial < RING_RADIUS) {
      passed = true;
    }
    if (passed) {
      this.index++;
      this.prevSide = null;
    } else {
      this.prevSide = side;
    }
    return passed;
  }
}
