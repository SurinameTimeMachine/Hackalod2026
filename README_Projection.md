# Projection: "Was here" wall – 's Lands Hospitaal 1921

Part of **Suriname Time Machine** at **HackaLOD 2026** (Middelburg, 30–31 Oct 2026).
This is the on-site projection: a beamer shows the names of the **516 patients of 's Lands Hospitaal, Paramaribo, in 1921** as stamps on a dark wall. When you select a name, a constellation forms showing the records and people that name links to in the full archive.

This README is the brief for a Claude Code session. Read it fully before writing code.

---

## 1. What we are building (prototype scope)

- A fullscreen route, **`/projection`**, in the same React app (pnpm) as the 3D dashboard that a teammate is building with React Three Fiber.
- **Pure black background.** Nothing else is drawn on the wall.
- **516 names**, each looking **stamped or lettered**: flat solid text on black, a mix of typefaces, slightly uneven.
- **Select a name** (mouse/keyboard for now, phone via websocket later). The other names dim, the selected one lights up, and linked records and people appear around it, joined by lines.
- Later on this route: websocket messages `select` and `contributions-changed` from the app server (see §7).

Out of scope for the first prototype: phone recognition, contribution form, map, family tree.

---

## 2. Visual direction

**Is:** names that look stamped, stencilled, typed or hand-lettered, the way names are marked on a wooden wall or crate. "Wooden wall" is only a reference for the style; nothing wood-like is drawn. Flat solid letters, a little imperfect through slight rotation and varied opacity. Calm, respectful, dense.

**Is not:** literal rubber stamps. **No borders, frames, boxes, badges or rectangles around names.** No drop shadows, bevels, 3D extruded text, textures, grain or background images. Just flat text on black.

### How to get the look

1. **Fonts.** Use 6–8 open-licensed (OFL/Apache) typefaces with different "making" methods. Self-host them in `public/fonts/` as `.woff` or `.ttf` for troika. Suggested mix (check each license):
   | Method | Candidates |
   |---|---|
   | Stencil (crates, cargo) | Stardos Stencil, Saira Stencil One, Allerta Stencil |
   | Typewriter / ledger | Special Elite, Cutive Mono, Courier Prime |
   | Wood type / slab | Alfa Slab One, Rye |
   | Old print | IM Fell English, Old Standard TT |
   | Hand-lettered | Homemade Apple, Rock Salt, Caveat |

   Keep hand-lettered fonts rare (≤15 %) and drop any that are illegible at small sizes on the beamer.
2. **Ink colors on black.** Use a small, faded palette that is clearly distinguishable: bone/off-white, faded red ink, rust, ochre, slate blue, dull green. Six colors at most.
3. **Per-stamp variation** (deterministic, seeded by `patient_id`): rotation ±3°, opacity 0.7–1.0, scale ±8 %.
4. **Background:** `#000` exactly (`<color attach="background" args={['#000']} />`), with no tone mapping that lifts the blacks. On a beamer anything that isn't black becomes a visible grey rectangle.

---

## 3. Stack

| Part | Choice |
|---|---|
| App | React + React Three Fiber, the **same repo** as the dashboard, package manager **pnpm** (`pnpm add …`, never npm or yarn). Use the build tool, router and TypeScript/JS setup already in the repo; check `package.json` first and don't introduce new ones. Match the teammate's versions: R3F v9 requires React 19, R3F v8 requires React 18. |
| Rendering | `three`, `@react-three/fiber`, `@react-three/drei` |
| Text | drei `<Text>` (troika-three-text, SDF): crisp at projector resolution, any `.woff`/`.ttf`, per-instance font and color |
| Layout | `d3-force` (positions only; R3F only draws) |
| Lines | drei `<Line>` (solid = certain link, dashed = uncertain) |
| State | one small store (zustand or React context): `{ selectedPatientId, hoveredId, mode }` |
| Camera | `OrthographicCamera`, or perspective with a very shallow z-spread. Names must stay readable from 3–5 m. |

Shared with the dashboard: the API client and hooks, the websocket hook and the selection store. The wall/constellation component should accept data as props so the dashboard can reuse it for other locations ("same presentation, other data").

---

## 4. Data

### API
Public base: `https://hackalod.sbco.design/api/suriname_person_search/`
Datasette 0.65.1, read-only. **Custom SQL is disabled**: use table views with column filters and canned queries. Add `.json?_shape=array` to get plain JSON arrays.

Keep the API base URL in one constant (e.g. `API_BASE`). In production `/projection` is served from the same origin, so `/api/...` works as a relative URL. In local dev, either proxy `/api` to `https://hackalod.sbco.design` using the dev server the repo already has, or set `API_BASE` to the full URL. Check that the browser doesn't block it with CORS.

The data lives on a team member's laptop (reached via Tailscale), so it can go offline. **Snapshot `mh1921_patienten` to `public/data/mh1921_patienten.json`** and fall back to it when the API fails. The wall must always render.

### Tables used

| Table | Rows | Columns | Use |
|---|---|---|---|
| `mh1921_patienten` | 516 | patient_id, achternaam, initialen_of_contractnr, geboortejaar, groep, aantal_vermeldingen, beste_resultaat, gevonden_in | **The wall**, one stamp per row |
| `mh1921_vermeldingen` | 799 | vermelding_id, patient_id, person_id, certificate_id, census_uuid, census_rij_id, achternaam, initialen_of_contractnr, geboortejaar | Where the patient appears in the main data and the 1921 census |
| `mh1921_koppelingen` | 351 | koppeling_id, patient_id, doel_dataset, doel_person_id, doel_certificate_id, doel_item_id, resultaat, rol_in_doelrecord, toelichting, methode | Links into other datasets, with quality (`resultaat`), role and method |

```
Wall:           /api/suriname_person_search/mh1921_patienten.json?_size=max&_shape=array
Select patient: /api/suriname_person_search/mh1921_koppelingen.json?patient_id=<id>&_shape=array
                /api/suriname_person_search/mh1921_vermeldingen.json?patient_id=<id>&_shape=array
Step out:       /api/suriname_person_search/ui_record_persons.json?cert=<doel_certificate_id>&_shape=array
                /api/suriname_person_search/ui_relations.json?id=<doel_person_id>&_shape=array
                /api/suriname_person_search/ui_person.json?id=<person_id>&_shape=array
```
Empty optional params of canned queries are passed as `''`.

**Coming soon** (requested from the data owner, not live yet): `patient_start?patient_id=` (one call that resolves a patient's mentions and links), `person_places`, `map_places`, `place_wall`, and a `contributions` database. Write the code so `patient_start` can replace the three calls above.

### Things to know about the data
- Patients have a **surname plus initials *or* a contract number**, with no full first names. Contract numbers point to indentured migrants. Display: `achternaam` + `initialen_of_contractnr`. Wording around contract numbers is sensitive and still to be checked with Nisha. Keep the format in one function so it can change.
- Only ~351 links for 516 patients: **many patients have no links.** Selecting one should still feel meaningful, for example showing just the name with "was here · 1921" and birth year.
- The values of `groep`, `resultaat` and `beste_resultaat` are **not documented yet**. Log the distinct values on load and map them to line style (solid/dashed) in one config object.
- `persons` rows are **attestations, not people**: the same person in two records is two rows, and records are never merged. Present cross-record matches as "possibly the same person".
- **Use IDs internally** (`patient_id`, `person_id`, `obs_key`) and names only for display. Duplicate names exist.

---

## 5. Layout

Beamer: assume **1920×1080**. 516 names leaves roughly 100×40 px per name, which is dense but readable at ~18–24 px text from a few metres away. Test on the real beamer early.

1. **v1, jittered grid:** a seeded shuffle of the 516 into ~24 columns × 22 rows, each cell jittered and rotated slightly. Fast and guaranteed not to overlap.
2. **v2, organic packing:** `d3-force` with `forceCollide` (radius ≈ half the measured text width, with y compressed so ellipses approximate the text boxes) plus a weak `forceX/forceY` to the centre and the wall bounds. Run the simulation to completion before the first render, not live. Measure text width with troika's `sync()` callback or an approximate per-font character width.
3. Optional grouping: cluster by `groep` once its meaning is known.

---

## 6. Interaction

- **Idle:** the full wall. Very subtle life is allowed, such as an occasional stamp that brightens slowly, but no constant motion.
- **Select** (click, arrow keys plus Enter, or later a websocket `select`):
  1. The other stamps fade to ~15 % opacity over ~600 ms.
  2. The selected stamp goes to full brightness and shows its subtitle: `was here · 1921 · b. <geboortejaar>`.
  3. Linked records and people appear as new stamps in a ring around it, in the same stamp style but smaller, labelled with the role (`rol_in_doelrecord`) and dataset.
  4. Lines draw outwards, thin and chalk- or thread-like, solid for certain and dashed for uncertain.
  5. The camera eases slightly toward the constellation. Keep zoom ≤1.5× so the text stays crisp.
- **Esc** or a timeout (~60 s without input) returns to the full wall.
- **Debug overlay** (toggle `D`): FPS, selected id, API status. Hidden by default because it's projected.

---

## 7. Later: websocket signals

The app server (Node, `/` on the VPS) broadcasts **signals only, never data**:
```json
{ "type": "select", "personId": 123 }
{ "type": "contributions-changed", "personId": 123 }
```
`/projection` listens on `wss://hackalod.sbco.design/ws` (path to be confirmed), selects or refetches, and reconnects with backoff. Prepare a `useSignals()` hook with a no-op implementation now.

Phone recognition will identify a stamp by **font + color**. 6 colors × 8 fonts is only 48 combinations for 516 names, so the plan is OCR of the name plus font/color to disambiguate. Make the font/color assignment deterministic per `patient_id` and **make sure neighbouring stamps never share the same combination**.

---

## 8. Plan of attack

| # | Step | Done when |
|---|---|---|
| 1 | Add the `/projection` route to the dashboard repo; R3F canvas fullscreen, pure black, ortho camera | Black screen fullscreen on the beamer, no grey edges |
| 2 | API client + `usePatients()` with snapshot fallback; dev proxy or full `API_BASE` | 516 rows in the console, also with the network off |
| 3 | Fonts in `public/fonts/`, palette + deterministic style assignment per `patient_id` | Each patient has a stable font/color/rotation |
| 4 | v1 jittered grid of 516 `<Text>` stamps | All names on screen, readable from 3 m on the real beamer, ≥50 fps |
| 5 | Tune the stamp look: font mix, palette, rotation, opacity | Reads as stamped/lettered names, flat, no borders, black stays black |
| 6 | Selection: click/keyboard, dim others, highlight + subtitle | Smooth focus on one name, Esc returns |
| 7 | Constellation: fetch koppelingen + vermeldingen, ring of linked stamps, lines by certainty | A patient with links shows a readable constellation |
| 8 | Step out: click a linked person → `ui_record_persons` / `ui_relations` | You can walk from a patient into the wider archive |
| 9 | v2 organic layout with d3-force | No overlaps, feels like a wall of stamps |
| 10 | `useSignals()` websocket hook (`select`, `contributions-changed`) | A `select` from the server highlights the name |

Demo priority: steps 1–7 are the must-have. Pick one real patient with rich links for the demo story; the data owner is sending 3 candidate `patient_id`s.

---

## 9. Suggested structure

Adapt the paths and file extensions (`.tsx`/`.jsx`) to the existing repo layout.

```
src/
  projection/
    ProjectionPage.tsx      # route, canvas, camera, background
    Wall.tsx                # stamps layout + rendering (data via props)
    Stamp.tsx               # one name: <Text>, style, fade states
    Constellation.tsx       # linked stamps + lines
    layout.ts               # grid + d3-force layouts (pure functions)
    stampStyle.ts           # fonts, palette, seeded variation, neighbour rule
  shared/
    api.ts                  # fetch helpers, base URL, _shape=array
    hooks.ts                # usePatients, usePatientLinks, ...
    signals.ts              # websocket hook
    store.ts                # selection state
public/
  fonts/                    # self-hosted OFL fonts + LICENSE files
  data/mh1921_patienten.json
```

---

## 10. Rules for the code

- Black is black: no post-processing or tone mapping that lifts the background.
- No textures, grain or wood effects. Flat text only.
- No borders or frames around names, ever.
- Never invent data: show only what the records say. No invented movements, relations or first names.
- Only deceased people. The 1921 patients qualify, but keep the guard for contributed data later.
- Keep text and terminology in one place (`strings.ts`): the language (NL/EN) and terms such as *slaafgemaakten* are still being decided.
- Code and any new data go to a public GitHub repo at the end (HackaLOD requirement), so keep secrets out of the repo.

## Team context
Team lead and data: Thunnis van Oort (HDSC). Genealogy and community perspective: Nisha Marapin. Frontend: Jona. Linked data and endpoints: Kay. 3D and projection: Arthur. Concept and pitch: Martijn.
