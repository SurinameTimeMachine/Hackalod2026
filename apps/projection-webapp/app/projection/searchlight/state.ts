// The searchlight's own state, created by ProjectionPage only in searchlight
// mode: config, the tracker's poses, manual input, and the filtered aim of
// the beamer relative to its calibrated "straight at the wall" pose.
// Written at sensor rate and read every frame, so it lives outside React;
// `subscribe` is only for the few things that change what is rendered.
import { Euler, Quaternion, Vector3 } from 'three';
import { BEAM, loadConfig, saveConfig, TARGET, wallBounds, type SearchlightConfig } from './config';
import { deviceQuat } from './deviceQuat';
import { OneEuro } from './oneEuro';
import type { PoseMessage } from '../../shared/pose';
import type { Point } from '../forceLayout';

const DEG = Math.PI / 180;
const ACK_EVERY = 500; // ms

// Camera distance to the wall plane for this field of view: one beam is
// BEAM.width world units wide.
export const distance = (c: SearchlightConfig) => BEAM.width / 2 / Math.tan((c.hFov * DEG) / 2);

const wrap = (deg: number, near: number) => deg + 360 * Math.round((near - deg) / 360);
const round = (v: number, step: number) => Math.round(v / step) * step;

export class Searchlight {
  config: SearchlightConfig = loadConfig();
  bounds = wallBounds(this.config); // replaced (not changed) when the wall size changes
  show = { pattern: false, edge: this.config.beamEdge };
  sim = false;

  // Tracker
  private raw = new Quaternion();
  private zero: Quaternion | null = null;
  private zeroInv = new Quaternion();
  private hasRaw = false;
  // Which way the beamer faced at calibration (around the vertical), so a
  // tilt reads as pitch whatever its heading. Without it the camera assumes
  // a fixed compass direction and a tilt turns into roll.
  private heading = new Quaternion();
  private headingInv = new Quaternion();
  lastPoseAt = 0; // performance.now()
  poseRate = 0; // Hz
  poseDelay: number | null = null; // ms from the phone's clock to here (clocks are synced only roughly)
  private poseCount = 0;
  private rateAt = 0;
  private lastSeq = 0;
  private ackedSeq = 0;
  private trackerAim = { yaw: 0, pitch: 0, roll: 0 }; // frozen when the tracker drops

  // Arrow keys, added on top of the tracker.
  manual = { yaw: 0, pitch: 0 };

  // Filtered aim, degrees; `speed` in deg/s.
  aim = { yaw: 0, pitch: 0, roll: 0, speed: 0 };
  private filters = {
    yaw: new OneEuro(() => this.config),
    pitch: new OneEuro(() => this.config),
    roll: new OneEuro(() => this.config),
  };

  // Where the centre of the beam lands on the wall: a new tree opens there.
  beam: Point = { x: 0, y: 0 };
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

  // Roll as the phone sees it, before ignoreRoll: should stay near 0 while
  // tilting the beamer. If tilting rolls it, the mount direction is off (O).
  get trackerRoll() {
    return this.trackerAim.roll;
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
    if (m.t > 0) {
      const delay = Date.now() - m.t;
      this.poseDelay = this.poseDelay === null ? delay : this.poseDelay * 0.9 + delay * 0.1;
    }
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
      this.findHeading();
    }
    this.manual = { yaw: 0, pitch: 0 };
    this.trackerAim = { yaw: 0, pitch: 0, roll: 0 };
    for (const f of Object.values(this.filters)) f.reset();
    this.changed();
  }

  // The beamer faces where the phone's top edge points (phone flat on top,
  // top towards the wall), or where its back points if it stands upright;
  // `mountYaw` turns that by 90° steps for other mounts (O).
  private findHeading() {
    if (!this.zero) return;
    let f = new Vector3(0, 1, 0).applyQuaternion(this.zero);
    if (Math.abs(f.y) > 0.7) f = new Vector3(0, 0, -1).applyQuaternion(this.zero);
    const h = Math.atan2(-f.x, -f.z) + this.config.mountYaw * DEG;
    this.heading.setFromAxisAngle(new Vector3(0, 1, 0), h);
    this.headingInv.copy(this.heading).invert();
  }

  turnMount() {
    this.adjust({ mountYaw: (this.config.mountYaw + 90) % 360 });
    this.findHeading();
  }

  // The beamer's rotation since calibration, in the world frame: q · qZero⁻¹,
  // so the phone's tilt on the beamer does not matter; then turned into the
  // beamer's own heading so a tilt is pitch.
  private readTracker() {
    if (!this.zero || !this.trackerLive) return this.trackerAim;
    const delta = new Quaternion().copy(this.headingInv).multiply(this.raw).multiply(this.zeroInv).multiply(this.heading);
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

  setBeam(x: number, y: number) {
    this.beam = { x, y };
  }

  setSim(on: boolean) {
    this.sim = on;
  }

  // Measure instead of guess: calibrated straight at the wall, tape on the
  // target cross a quarter beam beside (or above/below) the centre, turned
  // until the centre of the image is on the tape. The angle turned and the
  // tape's place on the wall give the field of view (a sideways turn) or
  // the lens shift (a tilt). `aspect`: width / height of the image.
  fit(aspect: number): string {
    const c = this.config;
    const yaw = Math.abs(this.aim.yaw) * DEG;
    const pitch = this.aim.pitch * DEG;
    if (Math.max(yaw, Math.abs(pitch)) < 3 * DEG) return 'turn to the tape first (at least 3°)';
    if (yaw >= Math.abs(pitch)) {
      // The centre ray hits D·tan(yaw), with D = (beam width / 2) / tan(hFov / 2).
      const hFov = round(2 * Math.atan(((BEAM.width / 2) * Math.tan(yaw)) / TARGET.x) / DEG, 0.1);
      this.adjust({ hFov });
      return `hFov ${hFov}° (turned ${(yaw / DEG).toFixed(1)}°)`;
    }
    // The centre ray leaves the lens at α0 above its axis (tan α0 = 2·shift·tanV)
    // and, tilted by the pitch, hits D·(tan(pitch + α0) − tan α0) above the centre.
    const tanH = Math.tan((c.hFov * DEG) / 2);
    const tanV = tanH / aspect;
    const d = BEAM.width / 2 / tanH;
    const want = Math.sign(pitch) * TARGET.y;
    let best = { shift: c.lensShiftY, err: Infinity };
    for (let shift = -1; shift <= 2; shift += 0.001) {
      const a0 = Math.atan(2 * shift * tanV);
      if (Math.abs(pitch + a0) >= Math.PI / 2 - 0.01) continue;
      const err = Math.abs(d * (Math.tan(pitch + a0) - Math.tan(a0)) - want);
      if (err < best.err) best = { shift, err };
    }
    // No lens shift explains this tilt: the crosshair is not on the tape, or
    // the field of view is not fitted yet (fit it first, with a sideways turn).
    if (best.err > TARGET.y * 0.05) return 'no lens shift fits this tilt: fit hFov first, then tilt onto the tape';
    const lensShiftY = round(best.shift, 0.01);
    this.adjust({ lensShiftY });
    return `lensShiftY ${lensShiftY} (tilted ${(pitch / DEG).toFixed(1)}°)`;
  }

  // Live calibration (§7 of the brief) and display toggles.
  adjust(change: Partial<SearchlightConfig>) {
    Object.assign(this.config, change);
    if ('wallScale' in change) this.bounds = wallBounds(this.config);
    this.changed();
  }

  persist() {
    this.config.beamEdge = this.show.edge;
    saveConfig(this.config);
  }
}
