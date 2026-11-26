// input.js — keyboard and mouse flight controls. The yoke is the arrow
// keys or the mouse (move it like a stick); the throttle latches with W/S
// and is read back from the flight model, so every system agrees.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.edges = new Set();
    this.mouse = { x: 0, y: 0, seen: false };
    this.throttleDelta = 0;

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.mouse.seen = true;
    });
  }

  // True once per physical press.
  pressed(code) {
    if (this.edges.has(code)) { this.edges.delete(code); return true; }
    return false;
  }

  endFrame() { this.edges.clear(); }

  // The control deflections the flight model consumes, each -1..1.
  get pitch() {
    let v = 0;
    if (this.keys.has('ArrowUp')) v += 1;
    if (this.keys.has('ArrowDown')) v -= 1;
    if (v === 0 && this.mouse.seen) v = -this.mouse.y * 0.9;
    return Math.max(-1, Math.min(1, v));
  }

  get roll() {
    let v = 0;
    if (this.keys.has('ArrowRight')) v += 1;
    if (this.keys.has('ArrowLeft')) v -= 1;
    if (v === 0 && this.mouse.seen) v = this.mouse.x * 0.9;
    return Math.max(-1, Math.min(1, v));
  }

  get rudder() {
    let v = 0;
    if (this.keys.has('KeyD')) v += 1;
    if (this.keys.has('KeyA')) v -= 1;
    return v;
  }

  get brake() { return this.keys.has('Space'); }

  update() {
    let d = 0;
    if (this.keys.has('KeyW')) d += 0.55;
    if (this.keys.has('KeyS')) d -= 0.55;
    this.throttleDelta = d;
  }
}
