// plane.js — the Kestrel K-1 bush plane: its low-poly geometry, built as
// separate parts so the control surfaces and propeller can move, and the
// flight model that flies it (throttle, lift, stall, ground roll, damage).

import { Builder, createMesh } from './glkit.js';
import { clamp, lerp } from './math3d.js';
import { groundHeight, onDirtStrip, onRunway } from './world.js';

export const GEAR_HEIGHT = 1.05;      // metres from origin to wheel bottoms
// One flying-speed threshold for everything (the player asked for
// takeoff speed = landing speed): below FLY_SPEED she cannot leave
// the ground and cannot stay airborne, flaps or no flaps. The flaps
// keep their drag and approach-settling job; they no longer buy a
// slower touchdown.
export const FLY_SPEED = 20;          // m/s, about 39 KT
export const STALL_SPEED = FLY_SPEED; // same threshold, legacy name

const CREAM = [0.92, 0.88, 0.78];
const RED = [0.72, 0.16, 0.12];
const DARK = [0.16, 0.17, 0.19];
const GLASS = [0.10, 0.16, 0.22];
const METAL = [0.55, 0.56, 0.58];

// Local space: nose toward -Z, up +Y, right wing +X, origin at the CG.
export function buildPlane(gl) {
  const body = new Builder();
  // Fuselage, nose to tail.
  body.frustum(0, 0, -2.7, -1.3, 0.92, 0.92, 1.06, 1.02, RED);          // cowling
  body.frustum(0, 0.05, -1.3, 0.7, 1.06, 1.02, 1.12, 1.16, CREAM);       // cabin
  body.frustum(0, 0.22, 0.7, 2.9, 1.12, 1.16, 0.30, 0.38, CREAM);        // tail cone
  body.frustum(0, 0.52, -1.15, 0.35, 0.86, 0.42, 0.92, 0.46, GLASS);     // canopy
  body.box(0, -0.42, -1.9, 0.7, 0.25, 1.1, DARK);                       // belly pan
  // Wing and fixed tail feathers.
  body.box(0, 0.48, -0.55, 7.8, 0.13, 1.3, CREAM);
  body.box(-3.75, 0.48, -0.55, 0.55, 0.14, 1.3, RED);
  body.box(3.75, 0.48, -0.55, 0.55, 0.14, 1.3, RED);
  body.box(0, 0.48, 2.62, 2.7, 0.10, 0.62, CREAM);                       // tailplane
  body.frustum(0, 0.75, 2.35, 2.95, 0.10, 1.05, 0.10, 0.55, RED, 0, -0.2); // fin
  // Fixed gear: struts and wheels.
  for (const sx of [-1, 1]) {
    body.box(sx * 0.72, -0.62, -0.85, 0.12, 0.75, 0.12, METAL);
    body.box(sx * 0.88, -0.88, -0.85, 0.30, 0.52, 0.52, DARK);
    body.box(sx * 0.88, -0.88, -0.85, 0.32, 0.20, 0.20, METAL);
  }
  body.box(0, -0.42, 2.55, 0.10, 0.42, 0.10, METAL);
  body.box(0, -0.68, 2.55, 0.20, 0.30, 0.30, DARK);
  // Exhaust stub and pitot, the little details.
  body.box(0.4, -0.5, -2.2, 0.12, 0.12, 0.7, DARK);
  body.box(-2.2, 0.38, -0.9, 0.05, 0.05, 0.5, METAL);

  // Moving parts, each built around its own hinge at the local origin.
  const prop = new Builder();
  prop.box(0, 0, 0, 0.20, 2.35, 0.07, DARK);
  prop.box(0, 0, 0, 0.5, 0.5, 0.3, RED);
  prop.frustum(0, 0, -0.32, -0.02, 0.46, 0.46, 0.20, 0.20, METAL);

  const aileronGeo = (side) => {
    const b = new Builder();
    b.box(side * 0.0, 0, 0.28, 2.3, 0.09, 0.55, CREAM);
    b.box(side * 0.95, 0, 0.28, 0.4, 0.10, 0.55, RED);
    return createMesh(gl, b);
  };
  const elevator = new Builder();
  elevator.box(0, 0, 0.3, 2.55, 0.09, 0.58, CREAM);
  const rudder = new Builder();
  rudder.box(0, -0.1, 0.3, 0.09, 1.0, 0.58, RED);

  return {
    body: createMesh(gl, body),
    prop: createMesh(gl, prop),
    propOffset: [0, 0, -2.78],
    aileronL: aileronGeo(-1), aileronLPos: [-2.62, 0.48, 0.12],
    aileronR: aileronGeo(1), aileronRPos: [2.62, 0.48, 0.12],
    elevator: createMesh(gl, elevator), elevatorPos: [0, 0.48, 2.55],
    rudder: createMesh(gl, rudder), rudderPos: [0, 0.85, 2.62],
  };
}

export class FlightModel {
  constructor() { this.reset([0, 0, 500]); }

  reset(spawn) {
    this.pos = [spawn[0], 0, spawn[2]];
    this.pos[1] = groundHeight(spawn[0], spawn[2]) + GEAR_HEIGHT;
    this.heading = 0;         // north
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;           // m/s along the nose
    this.throttle = 0;
    this.flaps = 0;           // 0 or 1
    this.brake = false;
    this.fuel = 100;
    this.damage = 0;
    this.onGround = true;
    this.climbRate = 0;
    this.stalled = false;
    this.crashed = false;
    this.propAngle = 0;
  }

  get rpm() {
    if (this.fuel <= 0 || this.crashed) return 0;
    return 0.22 + this.throttle * 0.78;
  }

  get stallSpeed() { return FLY_SPEED; }

  // input: { pitch: -1..1 (positive climbs), roll: -1..1 (positive banks
  // right), rudder: -1..1, throttleDelta, brake } — throttle itself is
  // latched on the model so the HUD and audio read one source of truth.
  step(dt, input) {
    const events = {};
    if (this.crashed) return events;
    this.throttle = clamp(this.throttle + (input.throttleDelta || 0) * dt, 0, 1);
    this.brake = !!input.brake;

    const airborne = !this.onGround;
    // --- attitude ---
    const rollTarget = (input.roll || 0) * 1.02;
    this.roll += clamp(rollTarget - this.roll, -2.4 * dt, 2.4 * dt);
    if (!airborne) this.roll *= Math.max(0, 1 - 6 * dt);
    // Rotation on the roll is brisk so she lifts off right at
    // FLY_SPEED instead of barging well past it while the nose comes
    // up. Near flying speed it snaps at 1.5 rad/s: the throttle is a
    // latching key (0.55/s) and real key timing is sloppy, so a lazy
    // rotation misses the moment and she runs out of strip still
    // nose-down. Well below FLY_SPEED the gentler 0.9 keeps taxying
    // manners; airborne pitch response stays at 0.70.
    const groundRate = this.speed >= this.stallSpeed * 0.8 ? 1.5 : 0.9;
    const pitchRate = (input.pitch || 0) * (airborne ? 0.70 : groundRate);
    // Nose-down authority goes to -0.65 rad so a dive actually steepens
    // enough for gravity to pile the speed on (see the forces below);
    // nose-up goes to 0.50 so a full pull climbs like it means it.
    this.pitch = clamp(this.pitch + pitchRate * dt, -0.65, 0.50);
    if (!airborne && this.speed < this.stallSpeed) {
      // On the roll the nose stays down until she can fly.
      this.pitch = Math.min(this.pitch, 0.02);
    }
    // Coordinated turn from bank, plus rudder.
    const turnRate = this.speed > 3
      ? (9.81 * Math.tan(this.roll)) / Math.max(this.speed, 14) + (input.rudder || 0) * (airborne ? 0.12 : 0.5)
      : (input.rudder || 0) * 0.5;
    this.heading += turnRate * dt * (airborne ? 1 : clamp(this.speed / 10, 0, 1));

    // --- forces along the flight path ---
    // Tuned for pace (player feedback: level flight and dives felt slow):
    // thrust 14.5 with drag 0.0021·v² gives a level top speed of ~83 m/s
    // (~162 KT), and in a full-throttle dive at the -0.65 rad pitch limit
    // gravity adds ~5.9 m/s² along the path, for a dive terminal of
    // ~99 m/s (~192 KT) instead of the old ~89 m/s (~174 KT).
    const engineAccel = this.fuel > 0 ? this.throttle * 14.5 : 0;
    const drag = 0.0021 * this.speed * this.speed + (this.flaps ? 1.6 : 0) + (this.brake && !airborne ? 6.5 : 0);
    // Arcade climb: gravity along the path is halved while the nose is
    // up, so full throttle plus a hard pull just keeps climbing (the GTA
    // feel the player asked for) instead of bleeding speed until the wing
    // gives up. Dives keep full gravity, so the terminal speed is unchanged.
    const gravityAlong = 9.81 * Math.sin(this.pitch) * (this.pitch > 0 ? 0.5 : 1);
    this.speed += (engineAccel - drag * Math.sign(this.speed) - gravityAlong) * dt;
    if (!airborne) this.speed = Math.max(0, this.speed);
    this.speed = Math.max(0, this.speed);

    // --- lift and vertical motion ---
    const liftFactor = clamp(this.speed / this.stallSpeed, 0, 1.12);
    this.stalled = airborne && this.speed < this.stallSpeed;
    let climb = Math.sin(this.pitch) * this.speed * (0.30 + 0.70 * Math.min(liftFactor, 1));
    // A stall is a gentle mush, never a plunge: the sink is capped at
    // 3.5 m/s and the nose only eases back to level, never below it, so
    // she floats down a little instead of dropping out of the sky.
    if (this.stalled) climb -= Math.min((this.stallSpeed - this.speed) * 0.85, 3.5);
    if (this.stalled && this.pitch > 0) this.pitch = Math.max(0, this.pitch - 0.12 * dt);
    // Flap float is a bonus for spare speed only (never a penalty), and
    // only while the nose is up, so level flight holds altitude exactly.
    if (this.pitch > 0.02) climb += Math.max(0, liftFactor - 1) * 2.2 * (this.flaps ? 1 : 0.4);
    this.climbRate = climb;

    // --- integrate position ---
    const fwdX = -Math.sin(this.heading) * Math.cos(this.pitch);
    const fwdZ = -Math.cos(this.heading) * Math.cos(this.pitch);
    this.pos[0] += fwdX * this.speed * dt;
    this.pos[2] += fwdZ * this.speed * dt;
    if (airborne || this.speed > this.stallSpeed) this.pos[1] += climb * dt;
    this.pos[0] = clamp(this.pos[0], -2380, 2380);
    this.pos[2] = clamp(this.pos[2], -2380, 2380);

    // --- fuel ---
    if (this.fuel > 0) this.fuel = Math.max(0, this.fuel - dt * (0.055 + 0.30 * this.throttle));

    // --- ground contact ---
    const groundY = groundHeight(this.pos[0], this.pos[2]) + GEAR_HEIGHT;
    if (this.pos[1] <= groundY) {
      const sink = -this.climbRate;
      if (!this.onGround) {
        events.touchdown = {
          sink,
          onRunway: onRunway(this.pos[0], this.pos[2], 2),
          onDirt: onDirtStrip(this.pos[0], this.pos[2], 2),
          speed: this.speed,
        };
        if (sink > 4.4 || this.speed > 46 || Math.abs(this.roll) > 0.5) {
          this.crashed = true;
          this.damage = 100;
          events.crashed = true;
        } else if (sink > 3.0) {
          this.damage = Math.min(100, this.damage + (sink - 3.0) * 22);
          events.hardLanding = true;
        }
      }
      this.pos[1] = groundY;
      this.onGround = true;
      if (!this.crashed && this.speed > this.stallSpeed && this.pitch > 0.04) {
        this.onGround = false; // rotated: she lifts off again
        this.pos[1] = groundY + 0.1;
      }
    } else if (this.pos[1] > groundY + 0.35) {
      this.onGround = false;
    } else if (this.onGround && !this.crashed && this.speed > this.stallSpeed && this.pitch > 0.04) {
      // Rotated while the wing was already floating her a hair above
      // the surface: call it airborne now, at FLY_SPEED, instead of
      // waiting for the 0.35 m separation above.
      this.onGround = false;
    }

    this.propAngle += this.rpm * 55 * dt;
    return events;
  }

  // A gentle summary for the HUD.
  get altitudeFeet() { return this.pos[1] * 3.28084; }
  get speedKnots() { return this.speed * 1.94384; }
  get headingDeg() {
    const d = (this.heading * 180) / Math.PI;
    return ((d % 360) + 360) % 360;
  }
}

export { lerp };
