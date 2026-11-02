# Searchlight: the beamer as a flashlight – Suriname Time Machine

Part of **Suriname Time Machine** at **HackaLOD 2026** (Middelburg, 30–31 Oct 2026).
The projection shows the names of the **516 patients of 's Lands Hospitaal (1921)** as flat, stamped names on black. They don't all fit legibly in one beam. **Searchlight mode** fixes that: an iPhone is taped to the beamer and the beamer stands on a pan/tilt head. When someone turns the beamer, the names stay **fixed on the real wall** and the beam reveals a part of a much larger virtual wall, like a flashlight in a dark archive. Holding the beam on a name selects it.

This README is the brief for a Claude Code session. Read it fully before writing code. It **replaces §8 of the Projection README**. Related briefs: "Projection README" (the wall, stamps, constellation) and "Phone app README" (scan and stories; it defines the local dev setup, the websocket server and the key format).

---

## 1. Scope

**Build:**
- **`/tracker`**: a tiny phone page that streams the phone's orientation over the websocket.
- **Server:** websocket roles plus a `pose` relay from tracker to projection.
- **`/projection` searchlight mode:** a larger virtual wall, a camera that rotates like the beamer, calibration, a soft round beam edge, and dwell selection in the centre of the beam.
- **Fallback input:** mouse drag and arrow keys drive the same camera, so everything works without the phone.

**Not in scope:** camera-based tracking (see §2), changes to the stamp look, data or constellation logic.

**Searchlight is `/projection`-only.** The web dashboard reuses the same wall, stamp and constellation code and **must keep working exactly as it does now**. See §1a.

---

## 1a. Keep the dashboard untouched

The shared projection module (wall, stamps, constellation, layout) is used by both `/projection` and the web dashboard. Searchlight mode is an **opt-in layer that only the `/projection` route adds**. It is not a change to the shared components.

- **Shared components stay mode-agnostic.** `Wall`, `Stamp`, `Constellation` and the layout functions know nothing about searchlight. They take what they need as props: layout bounds (`{ width, height }`), and selection callbacks (`onSelect(key)`). They must not import from `projection/searchlight/`. Default behaviour, with no new props passed, equals today's behaviour.
- **The route composes it.** `ProjectionPage` decides the camera and inputs:
  - default/dashboard: the current camera and click selection, unchanged;
  - searchlight: wraps the same `Wall` with `SearchlightCamera`, `usePose`, `useDwellSelect`, `BeamEdge`, `TestPattern` and `DebugOverlay`, and passes larger layout bounds.
- **No global state leaks.** `mode`, `searchlightConfig`, poses and calibration live in a searchlight-only store/context that is created inside `ProjectionPage`, **not** in the shared selection store. The dashboard never creates it, so nothing there can switch it on.
- **Scoped inputs.** The `S`, `C`, `T`, `V`, `D`, `P`, calibration keys and mouse-drag rotation are registered only by the searchlight components while they're mounted. Remove the listeners on unmount. The dashboard keeps its own controls (orbit, click, scroll) untouched.
- **Websocket.** Only `/projection` sends `hello` with role `projection`, so only it receives `pose` messages. The dashboard ignores message types it doesn't know.
- **Bundle.** Load `projection/searchlight/` lazily (`React.lazy`/dynamic import) from `ProjectionPage`, so the dashboard bundle doesn't include it.
- **Mode default.** `/projection` starts in `static` mode (today's view) unless `?mode=searchlight` is set or `S` is pressed, so the existing projection still works if the tracker isn't set up.
- **Regression check (after every step):** open the dashboard and verify the wall, click selection, constellation expansion and the camera controls behave exactly as before, with no new console warnings.

---

## 2. Key decisions

- **Gyroscope, not camera.** Use the `deviceorientation` API, not the phone camera. In a dark room the camera sees almost nothing except the projection itself, which moves along with the beamer, so optical tracking would feed back into itself. The gyroscope measures rotation directly.
- **World-locked content by rotating the camera.** The virtual wall stays put. The R3F camera gets exactly the beamer's rotation relative to a calibrated "straight ahead" pose. The virtual camera has the same field of view as the beamer, so content lands in the same place on the real wall. Keystone distortion matches automatically.
- **Mount-independent maths.** Use the world-frame delta `q · qZero⁻¹` (§5). Then it doesn't matter how the phone is taped on, as long as it doesn't move relative to the beamer.
- **No clamping.** Beyond the edge of the virtual wall is simply black. Clamping the camera would make content slide along with the beam and break the illusion.
- **Signals, not data.** Poses go over the existing websocket, relayed only to projection clients. No archive data travels this way.

---

## 3. Where the code lives

Same repo as the dashboard, projection and phone app. Check `package.json` and the build setup first, and use what's there (**pnpm**, never npm or yarn).

- **`/tracker` is a lightweight entry, like `/scan`.** It must not import three.js or anything from `projection/`. If the repo uses Vite, add `tracker.html` → `src/tracker/main.tsx` to `build.rollupOptions.input`. Otherwise use a lazy route.
- The tracker sends raw `alpha/beta/gamma`; **all quaternion maths lives in `src/projection/searchlight/`**.
- Server changes go in the existing Node app server (`server/index.js`, Express + `ws`).
- Local dev as in the Phone app README: `pnpm dev` (front-end dev server + Node server on `:3000`, `/ws` proxied), `pnpm dev:phone` (cloudflared tunnel, HTTPS for the phone). iOS motion sensors need HTTPS, so test the tracker through the tunnel URL or the VPS.

---

## 4. Websocket protocol

Every client says who it is right after connecting:
```json
{ "type": "hello", "role": "projection" }      // or "tracker", "dashboard", "scan"
```

Tracker → server → **projection clients only** (never broadcast to everyone, never logged):
```json
{ "type": "pose", "alpha": 12.3, "beta": 85.1, "gamma": -2.4, "t": 1761900000000, "seq": 1234 }
{ "type": "pose-zero" }                          // calibrate: "beamer now points straight at the wall"
```

Projection → server → tracker (optional, for the status display on the phone):
```json
{ "type": "pose-ack", "seq": 1234 }              // ~2× per second, to measure round-trip latency
```

The existing messages stay as they are: `select` and `contributions-changed`, using `key` as in the Phone app README.

Server: keep a `role` on each socket. Relay `pose` and `pose-zero` to sockets with role `projection`, and `pose-ack` to sockets with role `tracker`. If several trackers connect, the projection follows the most recent one.

---

## 5. Orientation maths

### Device orientation → quaternion (three.js world: y up)
Same convention as three.js' former `DeviceOrientationControls`. Lock the phone's screen rotation (Control Centre), so screen orientation = 0.
```ts
const DEG = Math.PI / 180;
const euler = new THREE.Euler();
const qX = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // −90° around X

function deviceQuat(out: THREE.Quaternion, alpha: number, beta: number, gamma: number) {
  euler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ');
  return out.setFromEuler(euler).multiply(qX);
}
```

### Relative to the calibrated pose (mount-independent)
The phone is rigidly attached to the beamer, so the beamer's rotation since calibration equals the phone's **world-frame** rotation since calibration:
```ts
// on calibrate:  qZero.copy(qNow)
qDelta.copy(qNow).multiply(qZeroInv);              // qZeroInv = qZero.clone().invert()
camera.quaternion.copy(qDelta);                    // camera at zero looks straight at the wall (−z)
```
Do **not** use `qZero⁻¹ · q`. That is the delta in the phone's local frame and depends on how the phone is mounted.

Options in config:
- `ignoreRoll: true`: remove twist around the viewing axis. A beamer on a pan/tilt head barely rolls, and this reduces jitter. Decompose `qDelta` into yaw and pitch (Euler `'YXZ'`) and rebuild without z.
- `invertYaw` / `invertPitch`: escape hatches only, in case the sign convention of a device is off.

### Smoothing and latency
- Use a **One Euro filter** on yaw and pitch (or on the quaternion via slerp with an adaptive factor). It gives low jitter when the beamer is still and little lag when it's moving. Start with `minCutoff ≈ 1.0 Hz`, `beta ≈ 0.02`, and tune on site.
- Optional **prediction:** extrapolate with the angular velocity from the last samples by the measured latency (~30–60 ms). Only add this if the names visibly "swim" when the beamer turns.
- Render at display rate. Always use the latest pose; don't queue poses.

---

## 6. Virtual wall and camera

### Geometry
- Camera at the origin, wall plane at `z = −D`. `D` only sets the scale; pick `D = 10`.
- **Field of view.** Measure it on site rather than taking it from the spec sheet, because a zoom lens changes the throw ratio:
  ```
  distance beamer → wall = d,  projected image width = W
  hFov = 2 * atan(W / (2 * d))
  vFov = 2 * atan(tan(hFov / 2) / aspect)       // three.js PerspectiveCamera uses vertical fov
  e.g. W = 2.0 m at d = 3.0 m → hFov ≈ 36.9°, vFov ≈ 21.2° (16:9)
  ```
- **Beam size on the virtual wall:** `beamW = 2 · D · tan(hFov/2)`, `beamH = beamW / aspect`.
- **Virtual wall size** in beams (config): start with `wallBeams = { x: 3, y: 2 }`. The stamp layout from the Projection README gets `wallW = 3 · beamW`, `wallH = 2 · beamH` as its bounds. Its font size is set in world units, so a name is about 8–12 % of the beam width. That's the point: names become much larger than in the single-beam version.
- **Lens offset.** Most beamers project upward from the lens axis (e.g. the bottom of the image is level with the lens). Model this with an asymmetric frustum: config `lensShiftY` as a fraction of the image height (0 = centred, 0.5 = bottom edge on the axis). Build the projection matrix with `camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far)` and shift top and bottom by `lensShiftY · (top − bottom)`. Set `camera.matrixAutoUpdate` accordingly, or use a small custom camera component.

### Switching modes (on `/projection` only)
- `mode: 'static' | 'searchlight'` in the **searchlight-only store** (§1a), toggle with `S` or `?mode=searchlight`. **Static** is the existing single-beam view. **Searchlight** uses the perspective camera above.
- The wall, stamps and constellation components stay the same; only the camera, inputs and layout bounds passed in by `ProjectionPage` change.

---

## 7. Calibration (on site, ~5 minutes)

All values live in one `searchlightConfig` object. Adjust them live with keys, store them in `localStorage` (wrap in try/catch), and show them in the debug overlay so they can be copied into the committed config.

| Step | Action | Keys |
|---|---|---|
| 1 | Measure `d` and `W`, enter them (or adjust hFov live) | `[` / `]` hFov ±0.5° |
| 2 | Point the beamer straight at the wall (perpendicular) and zero | `C` (or "Calibrate" on the phone) |
| 3 | Show the **test pattern**: a world-fixed grid with crosses every 0.5 beam, plus a centre cross | `T` |
| 4 | Stick a piece of tape on the real wall at one cross. Turn the beamer left and right | – |
| 5 | Cross runs **ahead of** the turn (moves in the beam's direction) → hFov too large; **lags behind** → too small | `[` / `]` |
| 6 | Tilt up and down. Vertical mismatch while horizontal is fine → lens offset | `;` / `'` lensShiftY ±0.02 |
| 7 | Check jitter at rest and lag in motion, tune the filter | `-` / `=` minCutoff, `9` / `0` beta |
| 8 | Save | `P` (persist + print JSON to console) |

Re-zero with `C` any time the image drifts (gyro drift is small but non-zero over tens of minutes).

---

## 8. The searchlight look

- **Soft round beam edge.** A DOM overlay over the canvas with `background: radial-gradient(ellipse at center, transparent 55%, #000 80%)`, `pointer-events: none`. It's cheap and always aligned with the beam. Toggle `V`, radius in config. This only darkens, so black stays black.
- Everything else follows the Projection README: flat stamped text on pure black, no textures, no frames.

---

## 9. Dwell selection (the beam is the pointer)

- Each frame, intersect the camera's forward ray (the centre of the beam, corrected for `lensShiftY`) with the wall plane. This is analytic, so no raycasting is needed.
- Find the **nearest stamp** within radius `dwellRadius` (≈ 0.06 · beamW) of that point.
- Only count while the beam is **nearly still**: angular speed < ~8°/s (from the filtered yaw/pitch).
- Same stamp for **1.5 s** → select it through the existing selection store, exactly like a click: the constellation opens. Progress feedback is the stamp **slowly brightening**; there is no ring, frame or cursor.
- After a selection, wait a 2 s cooldown before the next dwell.
- **Back:** hold the beam on empty wall for 3 s → one step back (same as Esc). Or use the keyboard.
- In constellation mode the beam can follow the lines to linked names and select them in turn.
- When selection comes from the beam, also `POST /select` with the key, so the other screens and phones stay in sync.

---

## 10. Tracker page (`/tracker`)

Plain, dark, large buttons, readable at arm's length:
- **Start**: in the tap handler, call `DeviceOrientationEvent.requestPermission()` if it exists (iOS), open the websocket, send `hello` with role `tracker`, start streaming, request a wake lock.
- **Calibrate**: sends `pose-zero`.
- Status: connected yes/no, send rate (Hz), round-trip latency from `pose-ack`, live alpha/beta/gamma.
- Reconnect with backoff. On `visibilitychange` back to visible, re-acquire the wake lock (iOS Safari 16.4+ supports `navigator.wakeLock`).
- Throttle to ~60 messages/s. Drop a message if `ws.bufferedAmount` is high.

```js
startBtn.onclick = async () => {
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    if (await DeviceOrientationEvent.requestPermission() !== 'granted') return showError('motion denied');
  }
  connect(); // ws + hello {role:'tracker'}
  let seq = 0, last = 0;
  addEventListener('deviceorientation', (e) => {
    const now = performance.now();
    if (now - last < 15 || !ws || ws.readyState !== 1 || ws.bufferedAmount > 4096) return;
    last = now;
    ws.send(JSON.stringify({ type: 'pose', alpha: e.alpha, beta: e.beta, gamma: e.gamma, t: Date.now(), seq: ++seq }));
  });
  navigator.wakeLock?.request('screen').catch(() => {});
};
```

---

## 11. Fallback and simulation

- **Mouse drag** on the projection = yaw/pitch (in searchlight mode). **Arrow keys** = step 1°. Both produce the same `qDelta` the tracker would, so dwell selection, the beam edge and the layout can be developed without a phone.
- `?sim=1`: slowly sweeps the beam in a Lissajous pattern, to test dwell selection and the idle look.
- If the tracker hasn't sent a pose for 2 s, freeze the last pose and show a small "tracker lost" in the debug overlay only, never on the wall.

---

## 12. Debug overlay (`D`)

Hidden by default, because it's projected. It shows FPS, mode, pose rate (Hz), pose age (ms), round-trip latency, hFov, lensShiftY, filter settings, yaw/pitch, the dwell target and progress, and the config as JSON.

---

## 13. Hardware setup

- Beamer on a **tripod with a pan/tilt or ball head**, so it rotates around one point and doesn't slide. The small parallax because the pivot isn't at the lens is negligible.
- Phone **taped firmly**, so it can't shift relative to the beamer. Keep it **away from the exhaust vents** (heat). Any orientation is fine thanks to the mount-independent maths.
- Phone: rotation lock on, auto-lock off, charger connected, brightness low, Safari with `/tracker` in the foreground.
- Check the beamer may be tilted and keep its vents free. Focus is set for one distance: a flat wall and moderate sideways movement.
- Room as dark as possible: the illusion depends on the black outside the beam.

---

## 14. Plan of attack

| # | Step | Done when |
|---|---|---|
| 0 | Make the shared wall/stamp/constellation components take layout bounds and `onSelect` as props (defaults = today's behaviour); lazy-load `projection/searchlight/` from `ProjectionPage` only | Dashboard and `/projection` look and behave exactly as before |
| 1 | `mode` toggle (`S`), perspective camera with configurable hFov and `D`, layout bounds = `wallBeams × beam` | In searchlight mode the wall is 3×2 beams with larger names; the dashboard is unchanged |
| 2 | Mouse/arrow-key rotation → `qDelta` → camera; test pattern (`T`) | Dragging pans across the virtual wall; the grid looks right |
| 3 | Server: websocket `hello` roles, `pose`/`pose-zero` relay to projection only, `pose-ack` back | A test client's poses arrive only at the projection |
| 4 | `/tracker` entry without three.js: permission, streaming, calibrate, status, wake lock | iPhone via the tunnel shows ~60 Hz and connected |
| 5 | Projection: `deviceQuat`, `q · qZero⁻¹`, `C` calibrate, One Euro filter, `ignoreRoll` | Turning the phone turns the view the right way, smoothly |
| 6 | Lens offset frustum + calibration keys + persist (`P`) + debug overlay | All values adjustable live and saved |
| 7 | Beam edge overlay (`V`) | Reads as a round beam, not a rectangle |
| 8 | Dwell selection: centre point, stillness check, 1.5 s brighten, cooldown, back gesture, `POST /select` | Holding the beam on a name opens its constellation |
| 9 | On-site calibration with the real beamer (§7); tune filter and latency; prediction only if needed | Tape mark stays on its cross while turning; no visible swimming |
| 10 | `?sim=1` sweep + tracker-lost freeze | The projection keeps working when the phone drops |

Run the dashboard regression check from §1a after every step. Must-have for the demo: steps 0–5, 7 and 9. Steps 1–2 can be built today without a phone or beamer.

---

## 15. Suggested structure

Adapt paths and extensions to the repo.
```
src/
  tracker/
    main.tsx               # entry, no three.js
    TrackerPage.tsx        # start, calibrate, status
  projection/
    searchlight/
      config.ts            # searchlightConfig defaults (committed) + localStorage overrides
      deviceQuat.ts        # alpha/beta/gamma → quaternion
      usePose.ts           # websocket poses, qZero, qDelta, filter, prediction
      oneEuro.ts           # One Euro filter
      SearchlightCamera.tsx# perspective camera with lens-shift frustum
      useManualPose.ts     # mouse/keys/sim → same qDelta
      useDwellSelect.ts    # beam centre, stillness, dwell, back gesture
      TestPattern.tsx      # world-fixed calibration grid
      BeamEdge.tsx         # radial-gradient DOM overlay
      DebugOverlay.tsx
  shared/
    signals.ts             # websocket hook: hello role, message routing
server/
  index.js                 # + roles and pose relay
```

---

## 16. Rules

- Black is black. The beam edge only darkens; no post-processing that lifts the background.
- No visible cursor, ring or frame for the dwell target. Brightening is the only feedback.
- Poses are relayed to projections only and never logged or stored.
- The tracker page loads no three.js and no archive data.
- Keep all tunables in `searchlightConfig`, never as magic numbers in components.
- Searchlight never changes the dashboard: shared components stay mode-agnostic and never import from `projection/searchlight/`.

## Team context
Team lead and data: Thunnis van Oort (HDSC). Genealogy and community perspective: Nisha Marapin. Frontend: Jona. Linked data and endpoints: Kay. 3D, projection, phone app and searchlight: Arthur. Concept and pitch: Martijn.