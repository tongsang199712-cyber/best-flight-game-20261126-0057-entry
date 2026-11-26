// input.js — keyboard-only flight controls. WASD flies the plane:
// W/S pitch the nose up/down, A/D bank left/right (the arrow keys mirror
// them as a backup). The throttle latches with Shift (up) and Ctrl
// (down) and is read back from the flight model, so every system agrees.
// The mouse never steers; it only clicks menu buttons.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.edges = new Set();
    this.throttleDelta = 0;

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  // True once per physical press.
  pressed(code) {
    if (this.edges.has(code)) { this.edges.delete(code); return true; }
    return false;
  }

  endFrame() { this.edges.clear(); }

  // The control deflections the flight model consumes, each -1..1.
  // W climbs, S descends; A banks left, D banks right.
  get pitch() {
    let v = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) v += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) v -= 1;
    return Math.max(-1, Math.min(1, v));
  }

  get roll() {
    let v = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) v -= 1;
    return Math.max(-1, Math.min(1, v));
  }

  get rudder() {
    // A/D double as rudder so she still steers while taxiing on the ground.
    let v = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) v -= 1;
    return v;
  }

  get brake() { return this.keys.has('Space'); }

  update() {
    // Latched throttle: hold Shift to spool up, Ctrl to spool down.
    let d = 0;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) d += 0.55;
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) d -= 0.55;
    this.throttleDelta = d;
  }
}
