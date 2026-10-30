# Hackalod projection webapp – "Was here" wall

First prototype of the name constellations for the on-site projection: the 516 patients of 's Lands Hospitaal, Paramaribo, 1921, as lettered names on a pure black wall. Clicking a name lights up the other names on the wall that the archive ties to it, and draws a line to each of them, labelled with why they are connected and the record that says so. Solid lines are certain ties; dashed lines are probable ones or "possibly the same person". See `README_Projection.md` at the repository root for the full brief.

## Run locally

Requires Node.js 20.9 or newer and pnpm 11.25.0.

```sh
cd apps/projection-webapp
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3001/projection (port 3001, so it can run next to map-webapp on 3000).

- Click a name to select it. Click the black background or press **Esc** to go back to the full wall. The selection also clears after 60 s without input.
- `?patient=<patient_id>` opens the wall with that name selected, for example `/projection?patient=120`.
- **D** toggles a small debug overlay (data source, counts, selected id).

## Data

- **The wall** comes live from `/api/suriname_person_search/mh1921_patienten.json`. In dev, `next.config.ts` proxies `/api/*` to `https://hackalod.sbco.design`; in production Caddy serves it on the same origin. If the API is down, the app falls back to `public/data/mh1921_patienten.json`.
- **Ties between patients** have no canned query yet. `pnpm snapshot` derives them from the API into `public/data/patient_relations.json`; see the header of `scripts/build-snapshot.mjs` for the rules. A tie is recorded only when the archive shows one:
  - `relation`: a `relations` row between attestations of two patients
  - `same-record`: both appear on the same certificate
  - `same-match`: both were linked to the same archive person, shown as "possibly the same person"
- **Embargo.** The snapshot includes datasets flagged `embargo` in `sources` (migration registers, civil records, Madeisu): this is a 24-hour on-site prototype, and almost all ties come from those datasets. `pnpm snapshot:open` leaves them out (only one patient pair keeps a tie).

## Code

```
app/projection/
  ProjectionPage.tsx   canvas, ortho camera fitted to a 1920×1080 wall, selection, keys
  Wall.tsx             the names; data in via props so other locations can reuse it
  Constellation.tsx    lines between lit names, with reason + record reference
  Stamp.tsx            one name: drei <Text>, eases opacity/scale per state
  wallLayout.ts        seeded random scatter, no overlaps, thinning towards a ragged edge
                       (FILL sets how airy the wall is, and with it the font size)
  stampStyle.ts        fonts, inks, seeded variation, font+ink candidates per patient
app/shared/
  api.ts  hooks.ts     API base, fetch helpers, usePatients / usePatientEdges
  strings.ts           all visible wording (to review with Nisha)
  signals.ts           websocket hook, no-op for now
public/fonts/          OFL/Apache fonts (via Fontsource) + licenses/
```

Neighbouring names never share the same font + ink combination, which prepares for phone recognition later.
