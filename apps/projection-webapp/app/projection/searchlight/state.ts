// The searchlight's own state, created by ProjectionPage only in searchlight
// mode: config, the tracker's poses, manual input, and the filtered aim of
// the beamer relative to its calibrated "straight at the wall" pose.
// Written at sensor rate and read every frame, so it lives outside React;
// `subscribe` is only for the few things that change what is rendered.
import { Euler, Quaternion } from 'three';
import type { Emphasis } from '../frame';
import { BEAM, loadConfig, saveConfig, wallBounds, type SearchlightConfig } from './config';
import { deviceQuat } from './deviceQuat';
import { OneEuro } from './oneEuro';
import type { PoseMessage } from '../../shared/pose';
import type { Point } from '../forceLayout';

const DEG = Math.PI / 180;
const ACK_EVERY = 500; // ms

// Camera distance to the wall plane for this field of view: one beam is
// BEAM.width world units wide.
export const distance = (c: SearchlightConfig) => BEAM.width / 2 / Math.tan((c.hFov * DEG) / 2);

// Something the beam can select: a name's centre and half extent, world
// units. `key` is who it is (a patient on the wall and in a tree is the same
// key), `em` the stamp to brighten.
export type Target = { key: string; em: string; x: number; y: number; hw: number; hh: number; select: () => void };

// Box distance from a point to a name: 0 inside its text box.
const reach = (t: Target, x: number, y: number) => Math.hypot(Math.max(Math.abs(x - t.x) - t.hw, 0), Math.max(Math.abs(y - t.y) - t.hh, 0));

const wrap = (deg: number, near: number) => deg + 360 * Math.round((near - deg) / 360);

export class Searchlight {
  config: SearchlightConfig = loadConfig();
  readonly bounds = wallBounds(this.config);
  show = { pattern: false, edge: this.config.beamEdge };
  sim = false;

  // Tracker
  private raw = new Quaternion();
  private zero: Quaternion | null = null;
  private zeroInv = new Quaternion();
  private hasRaw = false;
  lastPoseAt = 0; // performance.now()
  poseRate = 0; // Hz
  private poseCount = 0;
  private rateAt = 0;
  private lastSeq = 0;
  private ackedSeq = 0;
  private trackerAim = { yaw: 0, pitch: 0, roll: 0 }; // frozen when the tracker drops

  // Mouse drag / arrow keys, added on top of the tracker.
  manual = { yaw: 0, pitch: 0 };

  // Filtered aim, degrees. `speed` in deg/s, for the dwell's stillness check.
  aim = { yaw: 0, pitch: 0, roll: 0, speed: 0 };
  private filters = {
    yaw: new OneEuro(() => this.config),
    pitch: new OneEuro(() => this.config),
    roll: new OneEuro(() => this.config),
  };

  // Where the centre of the beam lands on the wall, and what it rests on.
  beam = { x: 0, y: 0 };
  dwell = { key: null as string | null, progress: 0, empty: 0 };
  private cooldown = 0;
  // A beam at rest acts once: after a selection or a step back (and at start)
  // nothing happens until the beam has moved. Otherwise a still beamer loops:
  // a tree opens, its name settles off the beam centre, the empty wall steps
  // back, the name on the wall is selected again.
  private armed = false;
  fps = 0;

  private version = 0;
  private listeners = new Set<() => void>();
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  changed() {
    this.version++;
    for (const l of this.listeners) l();
  }

  get trackerLive() {
    return this.hasRaw && performance.now() - this.lastPoseAt < this.config.trackerLost;
  }

  // Poses from GET /pose. Returns a function that stops listening.
  connect() {
    const source = new EventSource('/pose');
    source.onmessage = (e) => {
      try {
        this.onPose(JSON.parse(e.data) as PoseMessage);
      } catch {}
    };
    const ack = setInterval(() => {
      if (this.lastSeq === this.ackedSeq) return;
      this.ackedSeq = this.lastSeq;
      fetch('/pose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'pose-ack', seq: this.lastSeq }) }).catch(() => {});
    }, ACK_EVERY);
    return () => {
      source.close();
      clearInterval(ack);
    };
  }

  onPose(m: PoseMessage) {
    if (m.type === 'pose-zero') return this.calibrate();
    deviceQuat(this.raw, m.alpha, m.beta, m.gamma);
    const now = performance.now();
    this.hasRaw = true;
    this.lastPoseAt = now;
    this.lastSeq = m.seq;
    this.poseCount++;
    if (now - this.rateAt > 1000) {
      this.poseRate = (this.poseCount * 1000) / (now - this.rateAt);
      [this.poseCount, this.rateAt] = [0, now];
    }
    // Without a calibration yet, wherever the beamer points now is straight.
    if (!this.zero) this.calibrate();
  }

  // "The beamer now points straight at the wall."
  calibrate() {
    if (this.hasRaw) {
      this.zero = this.raw.clone();
      this.zeroInv.copy(this.zero).invert();
    }
    this.manual = { yaw: 0, pitch: 0 };
    this.trackerAim = { yaw: 0, pitch: 0, roll: 0 };
    for (const f of Object.values(this.filters)) f.reset();
    this.changed();
  }

  // The beamer's rotation since calibration, in the world frame: q · qZero⁻¹,
  // so it does not matter how the phone is taped on.
  private readTracker() {
    if (!this.zero || !this.trackerLive) return this.trackerAim;
    const delta = new Quaternion().copy(this.raw).multiply(this.zeroInv);
    const e = new Euler().setFromQuaternion(delta, 'YXZ');
    const prev = this.trackerAim.yaw;
    this.trackerAim = { yaw: wrap(e.y / DEG, prev), pitch: e.x / DEG, roll: e.z / DEG };
    return this.trackerAim;
  }

  // A slow Lissajous sweep over the virtual wall (?sim=1).
  private simAim(t: number) {
    const d = distance(this.config);
    const yaw = Math.atan((this.bounds.width - BEAM.width) / 2 / d) / DEG;
    const pitch = Math.atan((this.bounds.height - BEAM.height) / 2 / d) / DEG;
    return { yaw: yaw * Math.sin(t * 0.09), pitch: pitch * Math.sin(t * 0.13 + 1) };
  }

  // Once per frame, before the camera reads `aim`.
  update(now: number, dt: number) {
    const c = this.config;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    const tr = this.readTracker();
    const sim = this.sim ? this.simAim(now / 1000) : { yaw: 0, pitch: 0 };
    const yaw = (c.invertYaw ? -tr.yaw : tr.yaw) + this.manual.yaw + sim.yaw;
    const pitch = (c.invertPitch ? -tr.pitch : tr.pitch) + this.manual.pitch + sim.pitch;
    const roll = c.ignoreRoll ? 0 : tr.roll;
    const f = this.filters;
    const lead = c.predictMs / 1000;
    const fy = f.yaw.filter(wrap(yaw, f.yaw.value ?? yaw), dt);
    const fp = f.pitch.filter(pitch, dt);
    const fr = f.roll.filter(roll, dt);
    this.aim = {
      yaw: fy + f.yaw.speed * lead,
      pitch: fp + f.pitch.speed * lead,
      roll: fr,
      speed: Math.hypot(f.yaw.speed, f.pitch.speed),
    };
  }

  // Dwell selection, once per frame: the beam resting on a name for
  // `dwellTime` selects it, brightening it meanwhile (`em`); resting on empty
  // wall with a tree open steps back. `point`: null when the beam misses the wall.
  point(point: Point | null, dt: number, targets: Target[], open: boolean, onBack: () => void, em: Emphasis) {
    const c = this.config;
    const dw = this.dwell;
    if (point) this.beam = point;
    const still = this.aim.speed < c.stillSpeed;
    if (!still) this.armed = true;
    if (!point || this.cooldown > 0 || !this.armed) {
      this.cooldown -= dt;
      em.amount = Math.max(em.amount - dt * 2, 0);
      dw.key = null;
      dw.progress = dw.empty = 0;
      return;
    }
    let best: Target | null = null;
    let bestD = c.dwellRadius * BEAM.width;
    for (const t of targets) {
      const d = reach(t, point.x, point.y);
      if (d < bestD) [best, bestD] = [t, d];
    }
    if (best) {
      dw.empty = 0;
      if (best.key !== dw.key) [dw.key, dw.progress] = [best.key, 0];
      dw.progress = still ? dw.progress + dt / c.dwellTime : Math.max(dw.progress - dt * 2, 0);
      em.key = best.em;
      em.amount = dw.progress * dw.progress * (3 - 2 * dw.progress);
      if (dw.progress >= 1) {
        best.select();
        this.armed = false;
        this.cooldown = c.cooldown;
        dw.progress = 0;
      }
      return;
    }
    em.key = dw.key = null;
    em.amount = dw.progress = 0;
    dw.empty = open && still ? dw.empty + dt : 0;
    if (dw.empty >= c.backTime) {
      onBack();
      this.armed = false;
      this.cooldown = c.cooldown;
      dw.empty = 0;
    }
  }

  setSim(on: boolean) {
    this.sim = on;
  }

  // Live calibration (§7 of the brief) and display toggles.
  adjust(change: Partial<SearchlightConfig>) {
    Object.assign(this.config, change);
    this.changed();
  }

  persist() {
    this.config.beamEdge = this.show.edge;
    saveConfig(this.config);
  }
}
