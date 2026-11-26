// hud.js — the instrument panel and every screen the pilot reads: airspeed
// and altitude tapes, a heading ribbon, an artificial horizon, throttle and
// fuel gauges, the mission panel, the title menu and the end-of-flight
// debrief. Drawn on a 2D canvas laid over the 3D view.

const INK = '#0b1520';
const GLASS = 'rgba(8, 18, 28, 0.72)';
const LINE = 'rgba(150, 220, 255, 0.55)';
const TEXT = '#d9f2ff';
const ACCENT = '#7dffce';
const AMBER = '#ffc357';
const RED = '#ff6b5e';

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize() {
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
    this.s = Math.min(innerWidth / 1280, innerHeight / 800);
  }

  panel(x, y, w, h, fill = GLASS) {
    const c = this.ctx;
    c.fillStyle = fill;
    c.strokeStyle = LINE;
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(x, y, w, h, 8);
    c.fill();
    c.stroke();
  }

  text(str, x, y, size, color = TEXT, align = 'left', weight = 600) {
    const c = this.ctx;
    c.fillStyle = color;
    c.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillText(str, x, y);
  }

  tape(x, cy, value, step, unit, label, fmt) {
    const c = this.ctx, s = this.s;
    const h = 300 * s;
    this.panel(x, cy - h / 2, 86 * s, h);
    c.save();
    c.beginPath();
    c.rect(x, cy - h / 2, 86 * s, h);
    c.clip();
    const pxPer = (h / 2) / (step * 3.2);
    const first = Math.floor(value / step) - 4;
    for (let i = first; i < first + 9; i++) {
      if (i < 0) continue;
      const v = i * step;
      const y = cy + (value - v) * pxPer;
      if (y < cy - h / 2 - 12 || y > cy + h / 2 + 12) continue;
      c.fillStyle = TEXT;
      c.font = `${600} ${13 * s}px system-ui, sans-serif`;
      c.textAlign = 'right';
      c.fillText(fmt(v), x + 58 * s, y);
      c.fillRect(x + 64 * s, y - 1, 12 * s, 2);
    }
    c.restore();
    // Current-value readout in the middle.
    c.fillStyle = INK;
    c.fillRect(x + 4 * s, cy - 15 * s, 62 * s, 30 * s);
    c.strokeStyle = ACCENT;
    c.strokeRect(x + 4 * s, cy - 15 * s, 62 * s, 30 * s);
    this.text(fmt(Math.round(value)), x + 35 * s, cy, 17 * s, ACCENT, 'center', 700);
    this.text(label, x + 43 * s, cy - h / 2 - 16 * s, 12 * s, LINE, 'center');
    this.text(unit, x + 43 * s, cy + h / 2 + 16 * s, 11 * s, LINE, 'center');
  }

  headingRibbon(cx, y, headingDeg) {
    const c = this.ctx, s = this.s;
    const w = 430 * s;
    this.panel(cx - w / 2, y, w, 40 * s);
    c.save();
    c.beginPath();
    c.rect(cx - w / 2, y, w, 40 * s);
    c.clip();
    const pxPerDeg = (w / 2) / 42;
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -60; d <= 60; d += 5) {
      const deg = ((Math.round((headingDeg + d) / 5) * 5) % 360 + 360) % 360;
      const x = cx + (deg - headingDeg + (Math.abs(deg - headingDeg) > 180 ? (deg > headingDeg ? -360 : 360) : 0)) * pxPerDeg;
      if (x < cx - w / 2 || x > cx + w / 2) continue;
      if (deg % 45 === 0) this.text(names[deg], x, y + 14 * s, 14 * s, ACCENT, 'center', 700);
      else if (deg % 15 === 0) this.text(String(deg / 10).padStart(2, '0'), x, y + 14 * s, 11 * s, TEXT, 'center');
      c.fillStyle = LINE;
      c.fillRect(x, y + 30 * s, 1.5, 7 * s);
    }
    c.restore();
    c.fillStyle = AMBER;
    c.beginPath();
    c.moveTo(cx - 7 * s, y - 4 * s);
    c.lineTo(cx + 7 * s, y - 4 * s);
    c.lineTo(cx, y + 5 * s);
    c.fill();
    this.text(String(Math.round(headingDeg)).padStart(3, '0') + '°', cx, y + 58 * s, 15 * s, AMBER, 'center', 700);
  }

  horizon(cx, cy, flight) {
    const c = this.ctx, s = this.s;
    const r = 92 * s;
    c.save();
    this.panel(cx - r - 8 * s, cy - r - 8 * s, (r + 8 * s) * 2, (r + 8 * s) * 2);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.clip();
    c.translate(cx, cy);
    c.rotate(-flight.roll);
    const pitchPx = (flight.pitch * 180 / Math.PI) * 2.1 * s;
    c.translate(0, pitchPx);
    c.fillStyle = '#3f7fbf';
    c.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6);
    c.fillStyle = '#8a6b46';
    c.fillRect(-r * 1.6, 0, r * 3.2, r * 1.6);
    c.fillStyle = '#ffffff';
    c.fillRect(-r * 1.6, -1.2, r * 3.2, 2.4);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 1.6;
    for (const deg of [-20, -10, 10, 20]) {
      const y = -deg * 2.1 * s;
      const w = (deg % 20 === 0 ? 34 : 22) * s;
      c.beginPath();
      c.moveTo(-w, y);
      c.lineTo(w, y);
      c.stroke();
      c.fillStyle = '#ffffff';
      c.font = `${600} ${10 * s}px system-ui, sans-serif`;
      c.textAlign = 'left';
      c.fillText(String(Math.abs(deg)), w + 4 * s, y);
      c.textAlign = 'right';
      c.fillText(String(Math.abs(deg)), -w - 4 * s, y);
    }
    c.restore();
    // Fixed aircraft symbol and roll pointer.
    c.strokeStyle = AMBER;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx - 42 * s, cy);
    c.lineTo(cx - 12 * s, cy);
    c.lineTo(cx - 12 * s, cy + 8 * s);
    c.moveTo(cx + 42 * s, cy);
    c.lineTo(cx + 12 * s, cy);
    c.lineTo(cx + 12 * s, cy + 8 * s);
    c.stroke();
    c.fillStyle = AMBER;
    c.beginPath();
    c.arc(cx, cy, 3.4 * s, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.translate(cx, cy);
    c.rotate(-flight.roll);
    c.fillStyle = ACCENT;
    c.beginPath();
    c.moveTo(0, -r + 4 * s);
    c.lineTo(-6 * s, -r + 15 * s);
    c.lineTo(6 * s, -r + 15 * s);
    c.fill();
    c.restore();
  }

  bar(x, y, w, label, frac, color, readout) {
    const c = this.ctx, s = this.s;
    this.text(label, x, y, 11 * s, LINE, 'left', 700);
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fillRect(x + 44 * s, y - 6 * s, w, 12 * s);
    c.fillStyle = color;
    c.fillRect(x + 44 * s, y - 6 * s, w * Math.max(0, Math.min(1, frac)), 12 * s);
    this.text(readout, x + 52 * s + w, y, 12 * s, TEXT, 'left', 700);
  }

  // Persistent key reminder, top-left corner, visible for the whole
  // flight so a new pilot never has to memorise the controls first.
  drawControls() {
    const s = this.s;
    const x = 14 * s, y = 14 * s;
    this.panel(x, y, 288 * s, 170 * s);
    this.text('CONTROLS', x + 12 * s, y + 19 * s, 11 * s, LINE, 'left', 700);
    const rows = [
      ['S', 'pull back · climb'],
      ['W', 'push forward · descend'],
      ['A / D', 'bank left · right'],
      ['E / SHIFT', 'throttle up'],
      ['Q', 'throttle down'],
      ['SPACE', 'brake'],
      ['F', 'flaps (takeoff / landing)'],
    ];
    rows.forEach((row, i) => {
      const ry = y + 42 * s + i * 18 * s;
      this.text(row[0], x + 12 * s, ry, 12 * s, AMBER, 'left', 700);
      this.text(row[1], x + 92 * s, ry, 12 * s, TEXT, 'left', 500);
    });
  }

  draw(view) {
    const c = this.ctx, s = this.s;
    const W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    const f = view.flight;

    if (view.mode === 'menu') { this.drawMenu(view); return; }

    // Flight instruments.
    this.tape(26 * s, H / 2, f.speedKnots, 10, 'KT', 'AIRSPEED', (v) => String(v));
    this.tape(W - 112 * s, H / 2, f.altitudeFeet, 100, 'FT', 'ALTITUDE', (v) => String(v));
    this.headingRibbon(W / 2, 18 * s, f.headingDeg);
    this.horizon(W / 2, H - 128 * s, f);

    // Vertical speed under the altitude tape.
    const vs = Math.round(f.climbRate * 196.85);
    this.text(`VSI ${vs >= 0 ? '+' : ''}${vs}`, W - 69 * s, H / 2 + 178 * s, 13 * s, vs < -600 ? AMBER : TEXT, 'center', 700);

    // Engine and fuel cluster, bottom left.
    const bx = 26 * s, by = H - 118 * s;
    this.panel(bx, by, 252 * s, 96 * s);
    this.bar(bx + 14 * s, by + 24 * s, 110 * s, 'THR', f.throttle, ACCENT, `${Math.round(f.throttle * 100)}%`);
    const fuelColor = f.fuel < 20 ? RED : f.fuel < 40 ? AMBER : ACCENT;
    this.bar(bx + 14 * s, by + 52 * s, 110 * s, 'FUEL', f.fuel / 100, fuelColor, `${Math.round(f.fuel)}%`);
    const lamp = (label, on, x) => {
      c.fillStyle = on ? AMBER : 'rgba(255,255,255,0.15)';
      c.beginPath();
      c.arc(x, by + 78 * s, 5 * s, 0, Math.PI * 2);
      c.fill();
      this.text(label, x + 10 * s, by + 78 * s, 11 * s, on ? AMBER : LINE, 'left', 700);
    };
    lamp('FLAPS', !!f.flaps, bx + 20 * s);
    lamp('BRAKE', !!f.brake, bx + 96 * s);
    lamp('STALL', !!f.stalled, bx + 172 * s);

    // Mission panel, bottom right.
    const mx = W - 348 * s, my = H - 118 * s;
    this.panel(mx, my, 322 * s, 96 * s);
    this.text(view.mission.title.toUpperCase(), mx + 14 * s, my + 20 * s, 13 * s, ACCENT, 'left', 700);
    this.text(view.mission.objective, mx + 14 * s, my + 44 * s, 12 * s, TEXT, 'left', 500);
    this.text(view.mission.progress, mx + 14 * s, my + 68 * s, 13 * s, AMBER, 'left', 700);
    if (view.mission.time) this.text(view.mission.time, mx + 308 * s, my + 20 * s, 13 * s, TEXT, 'right', 700);

    // Transient centre message (ring calls, warnings).
    if (view.message) {
      const { text, sub, tone } = view.message;
      this.text(text, W / 2, H * 0.30, 34 * s, tone === 'warn' ? RED : tone === 'good' ? ACCENT : TEXT, 'center', 800);
      if (sub) this.text(sub, W / 2, H * 0.30 + 40 * s, 16 * s, TEXT, 'center', 600);
    }
    if (f.stalled && view.mode === 'fly') {
      if (Math.floor(performance.now() / 400) % 2 === 0) {
        this.text('STALL', W / 2, H * 0.42, 30 * s, RED, 'center', 800);
      }
    }
    if (f.fuel <= 0 && view.mode === 'fly') {
      this.text('FUEL EMPTY — GLIDE', W / 2, H * 0.20, 17 * s, RED, 'center', 800);
    }

    this.text(view.muted ? 'SOUND OFF (M)' : 'M — SOUND', W - 16 * s, 22 * s, 11 * s, LINE, 'right', 600);

    this.drawControls();

    if (view.mode === 'complete') this.drawEnd(view, true);
    if (view.mode === 'crashed' && view.debriefReady) this.drawEnd(view, false);
  }

  drawMenu(view) {
    const c = this.ctx, s = this.s;
    const W = this.canvas.width, H = this.canvas.height;
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(5, 12, 22, 0.55)');
    grad.addColorStop(1, 'rgba(5, 12, 22, 0.82)');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    this.text('KESTREL VALLEY', W / 2, H * 0.20, 64 * s, '#ffffff', 'center', 800);
    this.text('Bush flying in the Kestrel K-1 — rings, ridges and one very short dirt strip', W / 2, H * 0.20 + 52 * s, 17 * s, ACCENT, 'center', 600);

    const items = view.missions;
    items.forEach((m, i) => {
      const y = H * 0.36 + i * 64 * s;
      const selected = i === view.menuIndex;
      this.panel(W / 2 - 330 * s, y - 26 * s, 660 * s, 52 * s, selected ? 'rgba(20, 48, 66, 0.88)' : 'rgba(8, 18, 28, 0.6)');
      this.text(`${i + 1}  ${m.title}`, W / 2 - 306 * s, y, 18 * s, selected ? '#ffffff' : TEXT, 'left', 700);
      this.text(m.blurb, W / 2 + 306 * s, y, 13.5 * s, LINE, 'right', 500);
    });

    const controls = [
      ['S / W · ↓ / ↑', 'pull back climb · push descend'], ['A / D · ← / →', 'bank and turn'],
      ['E / SHIFT', 'throttle up'], ['Q', 'throttle down'],
      ['F', 'flaps (takeoff / landing)'], ['SPACE', 'wheel brake'],
      ['R', 'restart flight'], ['M', 'sound on/off'],
    ];
    const cx = W / 2 - 330 * s, cy = H * 0.36 + items.length * 64 * s + 26 * s;
    controls.forEach((row, i) => {
      const col = i % 2, r = Math.floor(i / 2);
      const x = cx + col * 340 * s, y = cy + r * 26 * s;
      this.text(row[0], x, y, 13 * s, AMBER, 'left', 700);
      this.text(row[1], x + 128 * s, y, 13 * s, TEXT, 'left', 500);
    });
    this.text('Press ENTER to fly', W / 2, H - 54 * s, 16 * s, '#ffffff', 'center', 700);
  }

  drawEnd(view, success) {
    const c = this.ctx, s = this.s;
    const W = this.canvas.width, H = this.canvas.height;
    c.fillStyle = 'rgba(5, 12, 22, 0.55)';
    c.fillRect(0, 0, W, H);
    this.panel(W / 2 - 300 * s, H * 0.30, 600 * s, 240 * s, 'rgba(8, 20, 32, 0.92)');
    this.text(success ? 'FLIGHT COMPLETE' : 'AIRCRAFT DOWN', W / 2, H * 0.30 + 44 * s, 30 * s, success ? ACCENT : RED, 'center', 800);
    view.endLines.forEach((line, i) => {
      this.text(line, W / 2, H * 0.30 + 92 * s + i * 28 * s, 15.5 * s, TEXT, 'center', 500);
    });
    this.text('Press R to fly again · ENTER for the menu', W / 2, H * 0.30 + 214 * s, 14 * s, AMBER, 'center', 700);
  }
}
