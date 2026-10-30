# Hackalod projection webapp – "Was here" wall

First prototype of the name constellations for the on-site projection: the 516 patients of 's Lands Hospitaal, Paramaribo, 1921, as lettered names on a pure black wall. Clicking a name opens its constellation, fetched live from the archive: everyone its records connect it to, each joined by a line labelled with why they are connected and the record that says so. Every name in the constellation can be clicked in turn to grow it further. Solid lines are certain ties; dashed lines are probable ones or "possibly the same person". See `README_Projection.md` at the repository root for the full brief.

## Run locally

Requires Node.js 20.9 or newer and pnpm 11.25.0.

```sh
cd apps/projection-webapp
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3001/projection (port 3001, so it can run next to map-webapp on 3000).

- **Click** a name to open its constellation. Click any name in it to expand that one too.
- **Click an expanded name again** to add "possibly the same person" candidates (`ui_same_name`): other records with the same name, always dashed. This is the only route to further generations.
- A summary name such as "witness · 214 more" appears when one click would add more than 20 names (`GROUP_THRESHOLD`); family is always shown in full. Click it to show the next 20.
- **Esc** steps back one click; at the first step it returns to the full wall. Clicking the black background, or 60 s without input, also returns to the full wall.
- `?patient=<patient_id>` opens with that constellation, for example `/projection?patient=120` or `?patient=1`.
- **D** toggles a small debug overlay (data source, counts, selected id, names reported to the display registry).
- `?screen=<name>` sets the name this wall reports under in the display registry (default `projection`).

## Display registry

So a phone scan only has to choose among names that are actually readable, the projection reports what it shows to `POST /display` (a route handler in this app, kept in memory, see `app/server/display.ts`). It reports whenever the view settles (debounced 0.5 s, unchanged views skipped) and every 5 min as a heartbeat; screens not heard from for 15 min are dropped.

- On the full wall: all names. With a constellation open: only the lit names (the dimmed wall behind it is too faint to scan).
- Each name carries its shared key (`patient:<id>` / `person:<id>`, see `app/shared/keys.ts`), text, font, ink name, position (0–1 across the wall, y from the top), letter height, state and subtitle. Types in `app/shared/display.ts`.
- `GET /display` lists all screens, `GET /display?screen=projection` one screen, `GET /display?stamps=1` a flat list of every visible name: the candidate list for `/story/scan`.

## Data

- **The wall** comes live from `/api/suriname_person_search/mh1921_patienten.json`. In dev, `next.config.ts` proxies `/api/*` to `https://hackalod.sbco.design`; in production Caddy serves it on the same origin. If the API is down, the app falls back to `public/data/mh1921_patienten.json`.
- **Constellations** are fetched live per click (`app/projection/graph.ts`): a patient via `patient_start`, then `ui_relations`, `ui_person` and `ui_record_persons` for each of their records; any other name via the same three. Responses are cached by URL (the promise is stored), so repeat clicks cost nothing. A patient's own certain records count as the patient's stamp; probable matches appear as dashed "possibly this patient" names. If the archive is unreachable the constellation stays as it is and a small "archive offline" note appears.
- **Patients met inside a constellation** light up their own stamp on the wall instead of appearing twice (`mh1921_vermeldingen` + certain `mh1921_koppelingen`, loaded once at start).
- **Ties between patients** have no canned query yet. `pnpm snapshot` derives them from the API into `public/data/patient_relations.json`; see the header of `scripts/build-snapshot.mjs` for the rules. A tie is recorded only when the archive shows one:
  - `relation`: a `relations` row between attestations of two patients
  - `same-record`: both appear on the same certificate
  - `same-match`: both were linked to the same archive person, shown as "possibly the same person"
- **Embargo.** The snapshot includes datasets flagged `embargo` in `sources` (migration registers, civil records, Madeisu): this is a 24-hour on-site prototype, and almost all ties come from those datasets. `pnpm snapshot:open` leaves them out (only one patient pair keeps a tie).

## Code

```
app/projection/
  ProjectionPage.tsx   canvas, ortho camera fitted to a 1920×1080 wall, selection, keys
  useDisplayReport.ts  posts the visible names to /display
  Wall.tsx             the names; data in via props so other locations can reuse it
  graph.ts             graph model + the live queries behind each click
  useConstellation.ts  growing graph, grouping of busy names, Esc history, loading state
  forceLayout.ts       d3-force: new names start at their parent, placed names stay pinned
  Constellation.tsx    constellation names and lines, with reason + record reference
  Stamp.tsx            one name: drei <Text>, eases opacity/scale per state
  wallLayout.ts        seeded random scatter, no overlaps, thinning towards a ragged edge
                       (FILL sets how airy the wall is, and with it the font size)
  stampStyle.ts        fonts, inks, seeded variation, font+ink candidates per patient
app/display/route.ts   GET/POST /display
app/server/display.ts  in-memory display registry (activeStamps() for the scan)
app/shared/
  api.ts  hooks.ts     API base, fetch helpers, usePatients / usePatientEdges
  keys.ts  display.ts  shared key format, display registry types
  strings.ts           all visible wording (to review with Nisha)
  signals.ts           websocket hook, no-op for now
public/fonts/          OFL/Apache fonts (via Fontsource) + licenses/
```

Neighbouring names never share the same font + ink combination, which prepares for phone recognition later.
