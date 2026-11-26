// main.js — Kestrel Valley's conductor: boots the renderer, owns the game
// state (menu, flying, debrief), runs the missions, works the chase camera
// and draws the world, the rings and the Kestrel K-1 every frame.
//
// Screenshot scenes: opening the game with ?shot=cover|rings|approach|valley
// poses a real moment of the game (the maker's own way of taking the
// screenshots in /screenshots), rendered by this same code.

import { createProgram, createMesh, drawMesh, Builder } from './glkit.js';
import {
  perspective, lookAt, multiply, translation, rotationX, rotationY, rotationZ,
  planeOrientation, basis, add, scale, norm, lerp,
} from './math3d.js';
import { buildWorld, groundHeight, onRunway, onDirtStrip, cloudDrift, RUNWAY } from './world.js';
import { buildPlane, FlightModel, GEAR_HEIGHT } from './plane.js';
import { RING_COURSE, RingTracker, buildRingMesh } from './course.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';

const MISSIONS = [
  {
    id: 'free', title: 'Free Flight',
    blurb: 'The whole valley, no clock. Land gently anywhere.',
    objective: 'Land gently anywhere in the valley',
  },
  {
    id: 'rings', title: 'Ring Run',
    blurb: 'Eight gates down the valley, then home to land.',
    objective: 'Fly the 8 orange gates, then land at home',
  },
  {
    id: 'post', title: 'Plateau Post',
    blurb: 'Deliver the mail to the dirt strip on the north-west plateau.',
    objective: 'Land on the plateau dirt strip, north-west',
  },
];

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias: true });
if (!gl) throw new Error('WebGL is not available in this browser');
const prog = createProgram(gl);
gl.useProgram(prog.program);
gl.enable(gl.DEPTH_TEST);
gl.uniform3fv(prog.uniform.sunDir, norm([1500, 900, 1900]));
gl.uniform3fv(prog.uniform.fogColor, [0.74, 0.84, 0.94]);
gl.uniform1f(prog.uniform.fogNear, 500);
gl.uniform1f(prog.uniform.fogFar, 4200);

const world = buildWorld(gl);
const planeParts = buildPlane(gl);
const ringMeshes = {
  next: buildRingMesh(gl, 'next'),
  waiting: buildRingMesh(gl, 'waiting'),
  done: buildRingMesh(gl, 'done'),
};
// Crash dressing: the fireball, sparks, debris and smoke are all these
// few meshes, recoloured per job and moved/scaled per particle per frame.
function boomMesh(build) { const b = new Builder(); build(b); return createMesh(gl, b); }
const boomArt = {
  core: boomMesh(b => b.blob(0, 0, 0, 1, [1.0, 0.92, 0.55], 1, 10)),
  fire: boomMesh(b => b.blob(0, 0, 0, 1, [1.0, 0.48, 0.10], 1, 10)),
  spark: boomMesh(b => b.box(0, 0, 0, 0.34, 0.34, 0.34, [1.0, 0.80, 0.30])),
  debris: boomMesh(b => b.box(0, 0, 0, 0.55, 0.35, 0.75, [0.23, 0.20, 0.18])),
  smoke: boomMesh(b => b.blob(0, 0, 0, 1, [0.62, 0.62, 0.65], 0.8, 9)),
};
const input = new Input(canvas);
const hud = new Hud(document.getElementById('hud'));
const sound = new SoundEngine();
const flight = new FlightModel();
const tracker = new RingTracker();

const params = new URLSearchParams(location.search);
const shot = params.get('shot');

let mode = 'menu';
let missionIndex = 1; // Ring Run highlighted first: it is the signature flight
let mission = MISSIONS[missionIndex];
let message = null;
let missionTime = 0;
let timerRunning = false;
let tookOff = false;
let paused = false;
let camPos = null;
let endLines = [];
let endLinesAt = 0;   // when the debrief may appear (after a crash: once the explosion has played)
let explosion = null; // { at, t0 } while the crash fireball plays
let boomParts = [];
let finalTime = null;

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function showMessage(text, sub, tone, seconds = 2.6) {
  message = { text, sub, tone, until: performance.now() + seconds * 1000 };
}

// Light the wreck: a fireball at the crash point, sparks and debris
// thrown ballistically, and a slow smoke column. Pure theatre — the
// flight model has already decided everything by the time this runs.
function startExplosion(at) {
  explosion = { at: [at[0], at[1], at[2]], t0: perfSeconds };
  boomParts = [];
  const puff = (kind, n, speed, up, life) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      boomParts.push({
        kind,
        vx: Math.cos(a) * r * speed, vz: Math.sin(a) * r * speed,
        vy: up * (0.4 + Math.random() * 0.9),
        life: life * (0.7 + Math.random() * 0.6),
        size: 0.7 + Math.random() * 0.7,
        spin: (Math.random() - 0.5) * 9,
        seed: Math.random() * Math.PI * 2,
      });
    }
  };
  puff('spark', 46, 17, 13, 1.1);
  puff('debris', 18, 10, 11, 1.7);
  puff('smoke', 9, 3.5, 3.2, 2.3);
  // Smoke starts spread around the wreck, not from one point.
  for (const p of boomParts) {
    if (p.kind !== 'smoke') continue;
    p.ox = (Math.random() - 0.5) * 4;
    p.oy = (Math.random() - 0.5) * 1.5;
    p.oz = (Math.random() - 0.5) * 4;
  }
}

function startMission(index) {
  missionIndex = index;
  mission = MISSIONS[index];
  flight.reset([0, 0, 500]);
  tracker.reset();
  missionTime = 0;
  timerRunning = false;
  tookOff = false;
  finalTime = null;
  endLines = [];
  endLinesAt = 0;
  explosion = null;
  boomParts = [];
  message = null;
  camPos = null;
  mode = 'fly';
  showMessage(mission.title.toUpperCase(), 'WASD to fly · SHIFT throttle up · CTRL throttle down · F flaps', 'info', 3.4);
}

function endFlight(lines) {
  endLines = lines;
  if (flight.crashed) {
    // The bang first; the paperwork (and the way out) waits for it.
    startExplosion(flight.pos);
    sound.boom();
    endLinesAt = perfSeconds + 1.9;
  } else {
    endLinesAt = 0;
  }
  mode = flight.crashed ? 'crashed' : 'complete';
}

function landingWord(sink) {
  if (sink < 1.2) return 'a greaser';
  if (sink < 2.2) return 'a firm arrival';
  if (sink < 3.2) return 'a thumper — the gear felt that';
  return 'a heavy arrival — check the gear';
}

function checkMissionEnd(events) {
  if (events.touchdown) {
    sound.thud(events.touchdown.sink);
    if (!flight.crashed && events.touchdown.sink > 0.6) {
      showMessage('TOUCHDOWN', landingWord(events.touchdown.sink), events.hardLanding ? 'warn' : 'good', 2.2);
    }
  }
  if (flight.crashed) {
    endFlight([
      'The Kestrel is bent, but the pilot walks away.',
      `Damage 100% · fuel remaining ${Math.round(flight.fuel)}%`,
      mission.id === 'rings' ? `Rings flown: ${tracker.index} of ${RING_COURSE.length}` : 'The valley keeps the wreckage.',
    ]);
    return;
  }
  if (!flight.onGround) { tookOff = true; return; }
  if (!tookOff || flight.speed >= 0.6) return;

  // Stopped on the ground after a real flight: debrief.
  if (mission.id === 'rings') {
    if (tracker.done && onRunway(flight.pos[0], flight.pos[2], 4)) {
      finalTime = missionTime;
      endFlight([
        `All ${RING_COURSE.length} rings and home again in ${fmtTime(finalTime)}.`,
        `Damage ${Math.round(flight.damage)}% · fuel remaining ${Math.round(flight.fuel)}%`,
        'The valley record board by the fuel hut has a new line on it.',
      ]);
    } else {
      endFlight([
        tracker.done ? 'Down safely, but the Ring Run ends at Kestrel Field.' : `Down with ${tracker.index} of ${RING_COURSE.length} rings flown.`,
        `Damage ${Math.round(flight.damage)}% · fuel remaining ${Math.round(flight.fuel)}%`,
      ]);
    }
  } else if (mission.id === 'post') {
    if (onDirtStrip(flight.pos[0], flight.pos[2], 4)) {
      endFlight([
        'Mail delivered. The plateau keeper waves from the strip.',
        `Flight time ${fmtTime(missionTime)} · damage ${Math.round(flight.damage)}%`,
        `Fuel remaining ${Math.round(flight.fuel)}% — enough to get home, if you fancy it.`,
      ]);
    } else {
      endFlight([
        'Down safely — but the mail goes to the plateau strip, north-west.',
        `Damage ${Math.round(flight.damage)}% · fuel remaining ${Math.round(flight.fuel)}%`,
      ]);
    }
  } else {
    endFlight([
      onRunway(flight.pos[0], flight.pos[2], 4) ? 'Back at Kestrel Field.' : 'Down in the valley, engine off, quiet everywhere.',
      `Flight time ${fmtTime(missionTime)} · damage ${Math.round(flight.damage)}%`,
      `Fuel remaining ${Math.round(flight.fuel)}%`,
    ]);
  }
}

function stepFlight(dt) {
  input.update();
  if (input.pressed('KeyF')) flight.flaps = flight.flaps ? 0 : 1;
  const events = flight.step(dt, {
    pitch: input.pitch,
    roll: input.roll,
    rudder: input.rudder,
    throttleDelta: input.throttleDelta,
    brake: input.brake,
  });
  if (!flight.onGround && !timerRunning && tookOff === false) { /* timer arms below */ }
  if (!flight.onGround) {
    tookOff = true;
    timerRunning = true;
  }
  if (timerRunning && mode === 'fly') missionTime += dt;
  if (mission.id === 'rings' && !tracker.done && !flight.onGround) {
    if (tracker.update(flight.pos)) {
      sound.chime();
      if (tracker.done) showMessage('ALL RINGS FLOWN', 'Now land back at Kestrel Field', 'good', 3.2);
      else showMessage(`RING ${tracker.index} OF ${RING_COURSE.length}`, 'Next gate lit orange', 'good', 2.0);
    }
  }
  if (flight.damage >= 100 && !flight.crashed) {
    flight.crashed = true;
    events.crashed = true;
  }
  checkMissionEnd(events);
  sound.update(dt, flight);
}

// --- screenshot scenes -------------------------------------------------
function poseShot(name) {
  mode = 'fly';
  mission = MISSIONS[1];
  if (name === 'cover') {
    flight.reset([0, 0, 470]);
    flight.speed = 23; flight.throttle = 1; flight.pitch = 0.02;
    flight.climbRate = 0;
    showMessage('', '', 'info', 0);
    message = null;
  } else if (name === 'rings') {
    flight.reset([30, 0, -240]);
    flight.pos[1] = 64; flight.heading = 0.12; flight.pitch = 0.03; flight.roll = -0.38;
    flight.speed = 47; flight.throttle = 0.8; flight.onGround = false; flight.climbRate = 1.2;
    tracker.index = 1;
    tookOff = true; timerRunning = true; missionTime = 74.3;
  } else if (name === 'approach') {
    mission = { id: 'free', title: 'Final Approach', objective: 'Runway in sight — gear down, flaps out', blurb: '' };
    flight.reset([4, 0, 800]);
    flight.pos[1] = 34; flight.heading = 0; flight.pitch = -0.05; flight.roll = 0;
    flight.speed = 29; flight.throttle = 0.35; flight.flaps = 1; flight.onGround = false; flight.climbRate = -2.1;
    tookOff = true;
  } else if (name === 'valley') {
    mission = { id: 'free', title: 'Valley Tour', objective: 'Over the hills — the lake beyond', blurb: '' };
    flight.reset([-520, 0, -760]);
    flight.pos[1] = 178; flight.heading = 3.64; flight.pitch = -0.02; flight.roll = 0.24;
    flight.speed = 52; flight.throttle = 0.65; flight.onGround = false; flight.climbRate = 0.4;
    tookOff = true;
  }
}
if (shot) poseShot(shot);

// The camera must never sink into a hillside: when the Kestrel skims a
// slope or crests a rise, the ground at the camera's own position can be
// higher than the camera, and an unchecked camera ends up inside the
// terrain — the view fills with the inside of the hill and the aeroplane
// vanishes behind the slope. Keep every camera at least this far above
// the ground directly beneath it.
const CAM_GROUND_CLEARANCE = 2.2;
function keepCameraAboveGround(pos) {
  const floor = groundHeight(pos[0], pos[2]) + CAM_GROUND_CLEARANCE;
  if (pos[1] < floor) pos[1] = floor;
  return pos;
}

// --- rendering ----------------------------------------------------------
function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  hud.resize();
}
addEventListener('resize', resize);
resize();

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// A model matrix for one particle: uniform scale, optional spin, place.
function place(x, y, z, s, rx = 0, rz = 0) {
  let m = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1];
  if (rx) m = multiply(m, rotationX(rx));
  if (rz) m = multiply(m, rotationZ(rz));
  return m;
}

function drawBoom(draw) {
  if (!explosion) return;
  const e = perfSeconds - explosion.t0;
  if (e > 2.6) { explosion = null; boomParts = []; return; }
  const [ax, ay, az] = explosion.at;
  // The fireball: a white-hot flash for a blink, then an orange ball
  // that shrinks away inside a second.
  if (e < 0.8) {
    const grow = Math.min(1, e / 0.18);
    if (e < 0.16) {
      draw(boomArt.core, place(ax, ay + 0.7, az, 3.4 * grow), 0.95);
    } else {
      const shrink = 1 - 0.75 * ((e - 0.16) / 0.64);
      draw(boomArt.fire, place(ax, ay + 0.7, az, 3.1 * shrink), 0.8);
    }
  }
  for (const p of boomParts) {
    if (e > p.life) continue;
    const k = e / p.life;
    if (p.kind === 'smoke') {
      // Smoke: slow, rising, swelling — and in no hurry to leave.
      const x = ax + (p.ox || 0) + p.vx * e * 0.5, z = az + (p.oz || 0) + p.vz * e * 0.5;
      draw(boomArt.smoke, place(x, ay + (p.oy || 0) + p.vy * e * 0.5 + 2.6 * e, z, p.size * (1.1 + 1.7 * k)), 0);
    } else if (p.kind === 'debris') {
      const x = ax + p.vx * e, z = az + p.vz * e;
      const y = Math.max(ay + p.vy * e - 4.9 * e * e, groundHeight(x, z) + 0.25);
      draw(boomArt.debris, place(x, y, z, p.size, p.seed + e * p.spin, p.seed * 2 + e * p.spin * 0.7), 0);
    } else { // spark
      const x = ax + p.vx * e, z = az + p.vz * e;
      const y = ay + p.vy * e - 4.9 * e * e;
      if (y < groundHeight(x, z)) continue;
      draw(boomArt.spark, place(x, y, z, p.size * 0.3 * (1 - k) + 0.05, p.seed + e * p.spin, 0), 0.85);
    }
  }
}

function drawScene(view, camUp) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.62, 0.76, 0.90, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const proj = perspective(62, canvas.width / canvas.height, 0.3, 6000);
  const viewMat = lookAt(camPos, view.target, camUp);
  const vp = multiply(proj, viewMat);
  gl.uniform3fv(prog.uniform.camPos, camPos);

  const draw = (mesh, model, emissive = 0) => drawMesh(gl, prog, mesh, multiply(vp, model), model, emissive);
  draw(world.terrain, IDENTITY);
  draw(world.water, IDENTITY, 0.05);
  draw(world.runway, IDENTITY);
  draw(world.dirt, IDENTITY);
  draw(world.sun, IDENTITY, 0.85);
  const drift = cloudDrift(perfSeconds);
  draw(world.clouds, translation(drift[0], 0, drift[2]), 0.38);

  // Rings, coloured by where the pilot stands with them.
  RING_COURSE.forEach((ring, i) => {
    const model = multiply(translation(ring.center[0], ring.center[1], ring.center[2]), rotationY(ring.heading + Math.PI));
    if (mission.id !== 'rings' && !shot) { draw(ringMeshes.waiting, model, 0.05); return; }
    if (i < tracker.index) draw(ringMeshes.done, model, 0.02);
    else if (i === tracker.index) draw(ringMeshes.next, model, 0.55);
    else draw(ringMeshes.waiting, model, 0.06);
  });

  // The aeroplane and her moving parts.
  const orient = planeOrientation(flight.heading, flight.pitch, flight.roll);
  const planeModel = multiply(translation(flight.pos[0], flight.pos[1], flight.pos[2]), orient);
  draw(planeParts.body, planeModel);
  const propModel = multiply(planeModel, multiply(
    translation(planeParts.propOffset[0], planeParts.propOffset[1], planeParts.propOffset[2]),
    rotationZ(flight.propAngle),
  ));
  draw(planeParts.prop, propModel);
  const ailDef = shot ? flight.roll * 0.4 : input.roll * 0.5;
  draw(planeParts.aileronL, multiply(planeModel, multiply(
    translation(...planeParts.aileronLPos), rotationX(ailDef))));
  draw(planeParts.aileronR, multiply(planeModel, multiply(
    translation(...planeParts.aileronRPos), rotationX(-ailDef))));
  draw(planeParts.elevator, multiply(planeModel, multiply(
    translation(...planeParts.elevatorPos), rotationX((shot ? -flight.pitch : -input.pitch) * 0.4))));
  draw(planeParts.rudder, multiply(planeModel, multiply(
    translation(...planeParts.rudderPos), rotationY((shot ? 0 : input.rudder) * 0.4))));

  drawBoom(draw);
}

let perfSeconds = 0;
let lastStamp = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastStamp) / 1000);
  lastStamp = now;
  perfSeconds = now / 1000;

  if (shot) {
    // Posed scene: spin the prop, drift the clouds, hold the moment.
    flight.propAngle += dt * 42;
    const orient = planeOrientation(flight.heading, flight.pitch, flight.roll);
    const b = basis(orient);
    const backDist = shot === 'cover' ? 10.5 : 12;
    camPos = add(add(flight.pos, scale(b.forward, -backDist)), add([0, 3.1, 0], scale(b.right, shot === 'cover' ? 2.2 : 0)));
    keepCameraAboveGround(camPos);
    const target = add(flight.pos, scale(b.forward, 30));
    drawScene({ target }, norm(add([0, 1, 0], scale(b.up, 0.4))));
    hud.draw({
      mode: 'fly', flight, muted: false,
      mission: {
        title: mission.title,
        objective: mission.objective,
        progress: mission.id === 'rings' ? `RINGS ${tracker.index} / ${RING_COURSE.length}` : `FUEL ${Math.round(flight.fuel)}%`,
        time: mission.id === 'rings' ? fmtTime(missionTime) : '',
      },
      message: shot === 'rings' ? { text: 'RING 2 OF 8', sub: 'Thread the orange gate', tone: 'good' } : null,
    });
    return;
  }

  // Live game.
  if (input.pressed('KeyM')) sound.toggleMute();
  if (mode === 'menu') {
    if (input.pressed('Digit1')) missionIndex = 0;
    if (input.pressed('Digit2')) missionIndex = 1;
    if (input.pressed('Digit3')) missionIndex = 2;
    if (input.pressed('ArrowUp')) missionIndex = (missionIndex + MISSIONS.length - 1) % MISSIONS.length;
    if (input.pressed('ArrowDown')) missionIndex = (missionIndex + 1) % MISSIONS.length;
    mission = MISSIONS[missionIndex];
    if (input.pressed('Enter')) { sound.ensure(); startMission(missionIndex); }
    // Orbit the parked Kestrel on her home strip.
    flight.reset([0, 0, 500]);
    const t = perfSeconds * 0.07;
    camPos = [Math.sin(t) * 24, groundHeight(0, 500) + 6.5, 500 + Math.cos(t) * 24];
    drawScene({ target: [0, flight.pos[1] + 0.6, 500] }, [0, 1, 0]);
    hud.draw({ mode: 'menu', flight, missions: MISSIONS, menuIndex: missionIndex, muted: sound.muted });
    input.endFrame();
    return;
  }

  if (input.pressed('KeyP')) paused = !paused;
  if (mode === 'fly' && !paused) {
    const sub = dt > 1 / 50 ? 2 : 1;
    for (let i = 0; i < sub; i++) stepFlight(dt / sub);
  } else if ((mode === 'complete' || mode === 'crashed')) {
    // After a crash the restart keys stay dead until the debrief is up.
    if (perfSeconds >= endLinesAt) {
      if (input.pressed('KeyR')) startMission(missionIndex);
      if (input.pressed('Enter')) { mode = 'menu'; explosion = null; boomParts = []; }
    }
    sound.update(0, { rpm: 0, speed: 0, stalled: false });
  }
  if (mode === 'fly' && input.pressed('KeyR')) startMission(missionIndex);

  // Chase camera with a little of the aeroplane's own bank in it.
  const orient = planeOrientation(flight.heading, flight.pitch, flight.roll);
  const b = basis(orient);
  const desired = add(add(flight.pos, scale(b.forward, -11.5)), [0, 3.8, 0]);
  // Aim the smoothed camera at a target that is already above the ground,
  // so it rises into the lift instead of snapping up at the hard floor.
  keepCameraAboveGround(desired);
  const blend = camPos ? 1 - Math.pow(0.002, dt) : 1;
  camPos = camPos
    ? [lerp(camPos[0], desired[0], blend), lerp(camPos[1], desired[1], blend), lerp(camPos[2], desired[2], blend)]
    : desired;
  keepCameraAboveGround(camPos);
  const camUp = norm(add([0, 1, 0], scale(b.up, 0.45)));
  let target = add(flight.pos, scale(b.forward, 26));
  // The explosion kicks the camera for a moment. The shake is applied to
  // a throwaway copy so it never leaks into the smoothed chase position.
  const settledCam = camPos;
  if (explosion) {
    const e = perfSeconds - explosion.t0;
    if (e < 0.9) {
      const amp = 0.55 * (1 - e / 0.9) * (1 - e / 0.9);
      camPos = [
        camPos[0] + Math.sin(perfSeconds * 91) * amp,
        camPos[1] + Math.sin(perfSeconds * 113 + 2) * amp * 0.7,
        camPos[2] + Math.sin(perfSeconds * 79 + 4) * amp,
      ];
      keepCameraAboveGround(camPos);
      target = [
        target[0] + Math.sin(perfSeconds * 97 + 1) * amp * 0.6,
        target[1] + Math.sin(perfSeconds * 89 + 3) * amp * 0.6,
        target[2],
      ];
    }
  }
  drawScene({ target }, camUp);
  camPos = settledCam;

  hud.draw({
    mode, flight, muted: sound.muted,
    mission: {
      title: mission.title,
      objective: mission.objective,
      progress: mission.id === 'rings'
        ? (tracker.done ? 'ALL RINGS FLOWN — LAND AT KESTREL FIELD' : `RINGS ${tracker.index} / ${RING_COURSE.length}`)
        : mission.id === 'post'
          ? (onDirtStrip(flight.pos[0], flight.pos[2], 60) ? 'THE STRIP IS BELOW YOU' : 'STRIP: NORTH-WEST PLATEAU')
          : `DAMAGE ${Math.round(flight.damage)}%`,
      time: timerRunning || finalTime ? fmtTime(finalTime ?? missionTime) : '',
    },
    message: message && performance.now() < message.until ? message : null,
    debriefReady: perfSeconds >= endLinesAt,
    endLines,
  });
  input.endFrame();
}
requestAnimationFrame(frame);
