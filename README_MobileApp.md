# Phone app: "Scan a name, tell a story" – Suriname Time Machine

Part of **Suriname Time Machine** at **HackaLOD 2026** (Middelburg, 30–31 Oct 2026).
A visitor points their phone at a name on the projection (or on the web dashboard), confirms the person, and **tells what they know out loud**. The story is transcribed, people, places and dates are extracted as suggestions, the visitor confirms them, and everything is saved as a contribution: the full story is readable by others, and the confirmed facts go into the additions dataset (`contributions`). Archive data is never changed.

This README is the brief for a Claude Code session. Read it fully before writing code. Related briefs: "Projection README" (the wall) and the project docs "Stack and infrastructure" and "Datasette API reference".

---

## 1. Scope

**Build:**
- A phone web page at **`/scan`** (mobile-first, works in iOS Safari and Android Chrome).
- Server routes in the **Node app server** on the VPS: `/display`, `/story/*`, `/select`, `/contribute`, and the websocket broadcast.
- The display registry: screens report which names they show, so a scan can match any name on any screen, not just the 516 patients.

**Not in scope:** native apps, accounts/login, moderation UI (contributions simply stay `reviewed = 0`), storing audio.

---

## 2. Where the code lives

**Same repo as the dashboard and projection, separate lightweight entry.** Do not load React Three Fiber or three.js on the phone.

- Check `package.json` and the build setup first; use what's there (pnpm, never npm or yarn).
- If the repo uses **Vite**: add a second HTML entry (`scan.html` → `src/scan/main.tsx`) via `build.rollupOptions.input`, so the phone bundle never imports three. Otherwise use a lazy-loaded route that imports nothing from `projection/`.
- **Shared with the projection** (import from `src/shared/`, don't duplicate):
  - `api.ts` (API base, `_shape=array`)
  - `keys.ts` (key format, see §4)
  - `stampStyle.ts` (fonts and colors, so the phone can show the name in its own stamp style)
  - `strings.ts` (all UI text and terminology, NL/EN)
- Same origin as everything else (`https://hackalod.sbco.design/scan`), so no CORS, and HTTPS is already there (needed for camera and microphone).

Server code goes in the Node app server (`~/hackalod` on the VPS, pm2 process `hackalod`). Check whether it already exists in the repo (e.g. `server/`); if not, create `server/` with Express + `ws`.

---

## 3. Flow (phone)

| # | Screen | What happens |
|---|---|---|
| 1 | **Scan** | Big button "Scan a name". Opens the camera via `<input type="file" accept="image/*" capture="environment">` (most robust; the native camera handles the dark room better than a `getUserMedia` viewfinder). Secondary: "Type a name". |
| 2 | **Is this the person?** | Shows the matched name **in its own stamp font and color**, plus "was here · 1921 · b. 1884" or record info. Buttons: "Yes" / "Not this one" (→ list of other candidates). On "Yes": `POST /select` so the projection lights up this name. |
| 3 | **Stories** | Existing stories about this person (`GET /story/for?key=`), each marked "not yet checked". Button "Tell what you know". |
| 4 | **Record** | Tap to start, tap to stop (max 3 min, visible timer). `MediaRecorder`; iOS gives `audio/mp4`, Android `audio/webm`, both are accepted by the transcription API. Fallback: "Type instead" (textarea). |
| 5 | **Review** | The transcript appears first (editable). Then the suggestions arrive: each with a checkbox, the extracted value, the **quote** it came from, and for places/people a small picker with the archive match (or "keep as written"). Nothing is pre-saved. |
| 6 | **Consent** | Optional name or nickname. Required checkboxes: "The person I am talking about has died", "My story will be published openly, also in the open dataset", "My recording is processed by an external AI service (OpenAI) to turn it into text". |
| 7 | **Thanks** | "Your story is now linked to <name>". The projection receives `contributions-changed` and shows it. Button "Scan another name". |

Show progress states clearly (uploading, transcribing, extracting). Transcription plus extraction takes roughly 5–15 s.

---

## 4. Keys (shared with the projection)

One key format everywhere, in `src/shared/keys.ts`:

```
patient:<patient_id>      a row in mh1921_patienten
person:<person_id>        a row in persons (an attestation, not a merged person)
name:<uuid>               a name told by a visitor that isn't in the archive (yet)
```

Use keys internally, names only for display. Duplicate names exist.

---

## 5. Server routes (Node app server)

All OpenAI calls happen **only on the server**. The key is never sent to the browser.

### `POST /display` – display registry
Every screen that renders names (projection, dashboard walls) reports what it shows whenever its view changes (not per frame):
```json
{ "screen": "projection",
  "stamps": [
    { "key": "patient:412", "text": "Lie A Foe J.", "font": "special-elite", "color": "rust", "x": 0.42, "y": 0.31 },
    { "key": "person:1837265", "text": "Johanna Lie A Foe", "font": "stardos", "color": "bone", "x": 0.47, "y": 0.36 }
  ] }
```
`x`, `y` are normalised screen positions (0–1). Keep in memory, keyed by `screen`, with `updatedAt`; drop screens not updated for 15 min. `GET /display` returns the registry (debug). This is display state, not archive data, so it goes over HTTP, not the websocket.

### `POST /story/scan` – which name is this?
Input: multipart `image` (the phone downscales to max 1280 px JPEG before upload).
1. Collect candidates: all stamps from all active screens.
2. One vision call to the OpenAI text model (`MODELS.text`, structured output) with the photo and the candidate list (key, text, font, color, x, y). Ask it to return `{ "read_text": "...", "key": "<one of the candidate keys or null>", "alternatives": ["<key>", ...] }`. It must pick from the list, never invent a key. Font, color and position near the centre of the photo break ties between identical names.
3. If `key` is null (name not on any screen, e.g. a printed register): `person_search?q=<read_text>` and return the top 10 as candidates with year, role and place.

Response: `{ "source": "display" | "search", "read_text": "...", "candidates": [{ "key", "text", "font", "color", "subtitle" }] }`, the best one first.

### `POST /select`
`{ "key": "patient:412" }` → websocket broadcast `{ "type": "select", "key": "patient:412" }`. (The projection README still says `personId`; use `key` in both.)

### `POST /story/transcribe`
Input: multipart `audio` + `key`.
- Build context for the key (`buildContext(key)`, cached): the person's name, the names in their constellation, and the places on their records.
- Call the transcription endpoint with `model: MODELS.transcribe` (default `gpt-4o-transcribe`), `language: "nl"`, and a `prompt` listing those names and places, so Surinamese names and street names are spelled correctly.
- Return `{ "transcript": "..." }`.

### `POST /story/extract`
Input: `{ key, transcript }`. One call to `MODELS.text` with **strict JSON-schema structured output**. Give it:
- the transcript
- the person (name, birth year, records)
- **candidate people** with keys (constellation and same-record people)
- the allowed values for `kind`, `field` and `relation_type`

Rules in the prompt: pick `related_key` only from the candidate list, otherwise `null` plus `name_raw`; every suggestion needs a short `quote` copied from the transcript; don't infer anything not said; flag people who may still be alive (`possibly_living: true`).

Schema:
```json
{
  "summary": "one sentence",
  "suggestions": [
    { "kind": "relation | fact | place | date",
      "relation_type": "parent | child | sibling | spouse | grandparent | grandchild | friend | colleague | other | null",
      "related_key": "person:123 | patient:45 | null",
      "name_raw": "string | null",
      "field": "occupation | birth_year | death_year | religion | address_text | null",
      "value": "string | null",
      "place_raw": "string | null",
      "year": "integer | null",
      "quote": "string",
      "possibly_living": "boolean" }
  ]
}
```
(In strict mode every property is required and nullable values use `["string","null"]`; check the current OpenAI structured outputs docs.)

Then **resolve in code**, not in the model:
- `place_raw` → `ui_places` (split into words `w1..w6`) → top `place_norm` matches as options. Later `place_geo` adds coordinates.
- `name_raw` without a key → `person_search?q=` limited to plausible years → options, or "keep as written" (`name:<uuid>`).

Return the suggestions with their options. Wrap the model call in one function `extract(transcript, context)` so the provider can be swapped (Claude) without touching the rest.

### `POST /contribute` – the only writer
Input: `{ key, transcript, summary, accepted: [suggestions with chosen options], contributor, consent: true, deceased_confirmed: true }`.
Validate: consent and deceased_confirmed are true, transcript not empty, at most 5,000 characters, and no suggestion with `possibly_living: true` unless the visitor removed or confirmed it.
1. Write the story row (`kind = "story"`, `value = transcript`).
2. Write one row per accepted suggestion with `story_id` = the story row id.
3. Broadcast `{ "type": "contributions-changed", "key": "<key>" }`.

**Storage:** Datasette `contributions` database on Thunnis' laptop via the `add_contribution` write query (requested, not live yet). **Until it's live, and whenever the write fails:** append to `server/data/contributions.jsonl` on the VPS and return ok. Write a small script that later replays the jsonl into Datasette. The demo must never lose a story.

### `GET /story/for?key=`
Stories plus accepted facts for a key, from Datasette (`contributions_for_person`) or the jsonl fallback.

### Requested `contributions` schema (ask Thunnis to add before creating the table)
```
contributions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER,            -- NULL for the story row itself
  person_key TEXT,             -- patient:/person:/name: key
  person_id INTEGER NULL, patient_id INTEGER NULL, obs_key TEXT NULL,
  kind TEXT,                   -- story | relation | fact | place | date | same_person
  relation_type TEXT, related_key TEXT, name_raw TEXT,
  field TEXT, value TEXT, place_raw TEXT, place_norm TEXT, year INTEGER,
  quote TEXT, contributor TEXT, consent INTEGER, reviewed INTEGER DEFAULT 0,
  created_at TEXT )
```

---

## 6. Environment and secrets

**Secrets** only, on the VPS in `~/hackalod/.env` (chmod 600, listed in `.gitignore`, loaded with `dotenv`). Set once, rarely touched:
```
OPENAI_API_KEY=sk-...
DEBUG_TOKEN=<random string>
```
Never commit `.env`, and never put the key in frontend or server code (the repo is public at the end, and the URL is public). Add `.env.example` with empty values.

**Everything else** is committed config in `server/config.js`, changed like normal code (edit → commit → deploy):
```js
export const MODELS = {
  transcribe: 'gpt-4o-transcribe',
  text: '<a current model with vision + structured outputs>',
};
export const DATASETTE = 'https://thunnis-laptop.tailb2fb37.ts.net';
```
For quick testing, `/story/*` routes accept `?model=<name>` **only** when the request carries header `x-debug-token` equal to `DEBUG_TOKEN`.

Deploy from the laptop with a one-liner `deploy.sh`: `ssh arthurvs@37.97.226.23 'cd ~/hackalod && git pull && pnpm install && pnpm build && pm2 restart hackalod --update-env'`.

### Local development (test everything from the laptop, no deploy)

Set this up first. The full flow (scan, transcribe, extract, contribute, websocket) must run on the laptop:

- **Laptop `.env`** in the repo root (gitignored, same as the VPS): `OPENAI_API_KEY=sk-...`. The key stays out of the code; it only lives in `.env` on the laptop and on the VPS.
- **`pnpm dev`** starts both, e.g. with `concurrently`:
  - the Node server on `localhost:3000` (with `node --watch` so it restarts on save)
  - the Vite dev server, which proxies to it:
    ```js
    // vite.config: server.proxy
    '/api':        { target: 'https://hackalod.sbco.design', changeOrigin: true },  // archive via the VPS, no Tailscale needed
    '/story':      'http://localhost:3000',
    '/display':    'http://localhost:3000',
    '/select':     'http://localhost:3000',
    '/contribute': 'http://localhost:3000',
    '/ws':         { target: 'ws://localhost:3000', ws: true },
    ```
- **Config overridable by env:** `MODELS` and `DATASETTE` in `server/config.js` read `process.env.OPENAI_TEXT_MODEL` etc. first, falling back to the committed defaults. When `NODE_ENV !== 'production'`, `?model=` works without the debug token.
- Reads go through `https://hackalod.sbco.design/api`. Writes to Datasette need the laptop in the tailnet; otherwise they land in the local `server/data/contributions.jsonl` (gitignored locally), which is fine for testing.
- Open `localhost:5173/projection` and `localhost:5173/scan` side by side: selecting and contributing on one updates the other via the local websocket.

**Testing on a real phone:** camera and microphone need HTTPS, and `localhost` only counts on the laptop itself. Add a script `pnpm dev:phone` that runs a quick tunnel: `cloudflared tunnel --url http://localhost:5173`. It prints a temporary `https://….trycloudflare.com` URL with a valid certificate; open that on the phone. Add `.trycloudflare.com` to Vite's `server.allowedHosts`. (Alternatives: `tailscale serve 5173` with the phone in the tailnet, or `@vitejs/plugin-basic-ssl` and accept the warning on the phone.)

Limits: max upload 10 MB (audio and image), max audio 3 min, simple rate limit per IP (e.g. 20 requests per minute) so a public URL can't burn the budget.

---

## 7. Look and feel

- Dark background, same mood as the wall. The selected name is shown in **its stamp font and color** (from `stampStyle.ts`), so the phone visibly "holds" the stamp from the wall.
- Large touch targets, one main action per screen, works one-handed.
- Recording state must be unmistakable (pulsing dot plus timer).
- All text in `strings.ts`. Terminology (e.g. *slaafgemaakten*, contract numbers) is still being checked with Nisha.

---

## 8. Rules

- Never invent data: suggestions are only what the visitor said, each with its quote, and only saved after the visitor ticks it.
- Archive data is never modified; everything goes to `contributions` with `reviewed = 0`, shown as "not yet checked".
- Only about people who have died. Don't store relation rows for people flagged as possibly living.
- Don't store audio; transcripts only.
- The OpenAI key lives only in `.env` (laptop and VPS), never in code and never in the browser.

---

## 9. Plan of attack

| # | Step | Done when |
|---|---|---|
| 0 | Local dev: `pnpm dev` (Vite + Node server + proxy), laptop `.env`, `pnpm dev:phone` tunnel | `/scan` opens on the phone via the tunnel URL, served from the laptop |
| 1 | Server: `.env` loading, `/display` registry, `/select` broadcast | The projection posts its stamps; `GET /display` shows them |
| 2 | `/scan` entry without three.js; camera input, downscale, upload | Photo arrives on the server from an iPhone |
| 3 | `/story/scan` with vision + candidate list, `person_search` fallback | Scanning a name on the wall returns the right key, also for duplicate names |
| 4 | "Is this the person?" screen in stamp style + `/select` | Confirming on the phone lights the name on the projection |
| 5 | Recording + `/story/transcribe` with name hints | A Dutch story with Surinamese names comes back correctly spelled |
| 6 | `/story/extract` + resolving places and people | Suggestions with quotes and archive options appear |
| 7 | Review + consent + `/contribute` with jsonl fallback + broadcast | A story is saved and the projection shows the update |
| 8 | `/story/for` and the stories list | A second visitor can read the first visitor's story |
| 9 | Switch storage to Datasette `add_contribution` when live; replay script | jsonl entries appear in `contributions.db` |

Test early with 3–4 real spoken stories, including Surinamese names and a little Sranan. Must-have for the demo: steps 0–7. Steps 0–8 can all be built and tested on the laptop; deploy to the VPS only when the flow works.

---

## 10. Suggested structure

```
src/
  scan/
    main.tsx              # entry (no three.js)
    ScanPage.tsx          # screen state machine
    screens/              # Scan, Confirm, Stories, Record, Review, Consent, Thanks
    useRecorder.ts        # MediaRecorder wrapper, timer, mime type
    downscale.ts          # image → 1280px JPEG
  shared/
    api.ts  keys.ts  stampStyle.ts  strings.ts
server/
  index.js                # express, ws, routes
  display.js              # in-memory registry
  openai.js               # transcribe(), scanImage(), extract()
  context.js              # buildContext(key) via Datasette
  resolve.js              # places via ui_places, people via person_search
  contributions.js        # Datasette write + jsonl fallback
  config.js               # models, Datasette URL (committed, no secrets)
  data/contributions.jsonl
.env.example
deploy.sh
```

## Team context
Team lead and data: Thunnis van Oort (HDSC). Genealogy and community perspective: Nisha Marapin. Frontend: Jona. Linked data and endpoints: Kay. 3D, projection and phone app: Arthur. Concept and pitch: Martijn.