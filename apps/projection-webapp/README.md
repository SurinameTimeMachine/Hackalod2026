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

## Phone app: "I was here" (`/scan`)

A visitor photographs a name on the wall, confirms the person, and tells what they know. Look and wording follow the team's "I was here" prototype (light paper, IBM Plex, Permanent Marker, Dutch). See `README_MobileApp.md` for the full brief.

1. **Home**: the background names are the ones the projection shows right now.
2. **Scan**: the native camera (`<input capture>`), downscaled to 1280 px, goes to `POST /story/scan`. One vision call picks the name from the display registry's candidates (font, ink and position break ties between identical names). A name on no screen falls back to `person_search`. Or type a name.
3. **Found**: the name in its own stamp lettering, with facts from the archive (`GET /story/context?key=`). Other candidates are one tap away.
4. **Tell**: tap to record (max 3 min, or type instead). `POST /story/transcribe` takes the audio, with the person's related names and places as a spelling hint. `POST /story/extract` maps the story onto the columns of the `contributions` dataset, and the code resolves places (`ui_places`) and people (`person_search`). The top half shows the transcript with recognised words underlined in their colour (dotted means it still needs a choice). The bottom half lists what was found and the dataset rows it would become. Tap a word or row to pick the archive match, keep it as told, confirm or remove it.

5. **Follow-up questions**: names with several archive candidates get a **?**. Questions are built in code from what separates the candidates (era, place, then a pick); "Help zoeken" walks through them. Archive search results are never picked for the visitor, and a pick that does not fit the story is checked again afterwards.
6. **Save**: "Vertel over jezelf" (name, relation to the person, a short text, typed or spoken) plus consent, then `POST /contribute`. The narrator becomes a person of their own (`name:<uuid>`), related to the subject.

**Saved stories** are stored as JSON lines in `data/contributions.jsonl` (gitignored, on the machine that runs the app) until the Datasette write is live. Per story: one `story` row with the full transcript and its `entities` (character offsets `start`/`end`, type, archive `link`, `row_id` of the dataset row it produced), one row per entity placed in the dataset, a `narrator` row and the narrator's `relation` row. Read them with:

- `GET /story/all`: every story, newest first
- `GET /story/for?key=patient:111`: stories about a person, or naming them as a linked entity
- `GET /story/get?id=<uuid>`: one story plus the rows it produced

A dashboard can render a story clickable by cutting `transcript` at the entity offsets and linking each piece to `link` (archive) or `row_id` (addition). Types in `app/shared/story.ts` (`SavedStory`, `StoryEntity`).

**Live signals to the wall:** `GET /signals` (server-sent events) carries `select` (a phone starts telling about a person) and `story-saved` (with exactly what the story added: told relatives, the storyteller, the new relations). `GET /story/graph?key=` gives everything stories added around a person. How the projection should show it: `STORIES_IN_CONSTELLATION.md`.

Not yet: the projection side of those signals (see that file), showing saved stories on the phone, and a replay of the jsonl into Datasette.

**Setup.** Put `OPENAI_API_KEY` in `.env` at the repo root (see `.env.example`); `next.config.ts` loads it. The key is only used server-side (`app/server/openai.ts`). Models are set in `app/server/config.ts`: `gpt-5.4-mini` for scan and extraction, `gpt-4o-transcribe` for speech. In dev, append `?model=` to a `/story/*` request to try another model.

**On a real phone** you need HTTPS for the camera and microphone: `brew install cloudflared`, run `pnpm dev`, then `pnpm dev:phone` and open the printed `https://….trycloudflare.com/scan` URL.

## Searchlight mode (`/projection?mode=searchlight`, `/tracker`)

A phone taped to the beamer turns the projection into a flashlight: the names stay fixed on the real wall and turning the beamer reveals another part of a virtual wall 3×2 beams large (names about 2.5× larger). Holding the beam on a name for 1.5 s selects it; holding it on empty wall for 3 s with a tree open steps back. The brief is `README_Searchlight.md` at the repository root.

1. Run `pnpm dev` and `pnpm dev:phone`. On the phone (rotation lock on, auto-lock off), open `https://….trycloudflare.com/tracker` and tap **Start** (iOS asks for motion access; it needs HTTPS).
2. Open `/projection?mode=searchlight` on the beamer's laptop, or press **S** on `/projection` to switch between static and searchlight.
3. Point the beamer straight at the wall and tap **Calibrate** on the phone (or press **C**). The first pose also calibrates.

Keys (searchlight only): **C** calibrate, **T** test grid (crosses every half beam), **V** soft beam edge, **[ ]** hFov ±0.5°, **; '** lens shift ±0.02, **- =** filter min cutoff, **9 0** filter beta, **P** save to localStorage and print the config JSON to the console (copy it into `searchlight/config.ts`), **D** debug overlay. Without a phone: drag with the mouse or use the arrow keys; `?sim=1` sweeps the beam slowly.

Calibrating on site: tape a mark on one cross of the test grid and turn the beamer. The cross runs ahead of the turn → hFov too large (`[`); it lags → too small (`]`). Vertical mismatch while horizontal is right → lens shift (`;` `'`).

Poses go from the phone over `POST /pose` and reach projections through `GET /pose` (server-sent events), like `/signals`: this Next.js app has no websocket server. Poses are relayed only to `/pose` listeners and never logged or stored. The projection acks twice a second, so the phone shows the latency to the wall. With several phones, the projection follows the one that started last.

Code: `app/projection/searchlight/` (loaded only in searchlight mode), `app/tracker/` (no three.js), `app/pose/route.ts` + `app/server/pose.ts`. The shared wall code only gained optional inputs: `layoutWall(…, bounds)`, a frame for where a tree opens (`frame.ts`), and an emphasis ref that brightens the name being pointed at.

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
app/scan/              phone app: ScanApp (home/scan/found), Dictate, useRecorder,
                       downscale, strings (all Dutch wording), scan.css
app/story/*/route.ts   /story/scan, /story/context, /story/transcribe, /story/extract
app/server/            story.ts (prompts, schemas, resolving), archive.ts (Datasette
                       reads, buildContext), openai.ts, config.ts, guard.ts (rate limit)
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
