# Project context – Suriname Time Machine (HackaLOD 2026)

Background for any Claude Code session in this repo: what we're building, for whom, with which data, and the decisions already made. The projection-specific brief is in `README.md` (the projection README).

Last updated: Fri 30 Oct 2026, 20:00.

---

## 1. The event

- **HackaLOD 2026**, organised by Netwerk Digitaal Erfgoed (NDE), 30–31 Oct 2026 in Middelburg. About 12 hours to build a **demonstrable prototype**. Previous winners built near-production apps, so the bar is high.
- **Challenge:** an application that makes the value of connected heritage information visible.
- **Requirements and judging:**
  - Use at least **two heritage collections or sources**, all openly accessible.
  - Connect them with **linked data** techniques (NDE Datasetregister preferred).
  - End users get value **without needing to understand linked data**.
  - **Extra points** for the NDE service-platform vision: a separate **data layer** and **presentation layer**, so the same data can feed other presentations and the same presentation can show other data.
  - The jury also weighs **social relevance** and whether the result is attractive, interesting or provocative for heritage audiences.
  - **Code and any new heritage data must be published in an open repository** (GitHub).

## 2. Team

| Who | Role |
|---|---|
| Thunnis van Oort | Team lead, data and archives (HDSC; co-author of the Suriname Slave and Emancipation Registers dataset). Runs the Datasette. |
| Nisha Marapin | Genealogy in Surinamese sources; (Dutch-)Surinamese perspective; checks wording and sensitivities |
| Jona | Creative, frontend |
| Kay | Linked open data, endpoints, interaction layer |
| Arthur | Interactive 3D and experiential visualisation; builds the projection |
| Martijn | Concept and pitch |
| (concept author) | Concept, interaction design, prototyping |

A teammate is building the **3D dashboard** (locations etc.) with **React Three Fiber**. The projection is built in the same React/R3F app.

## 3. Concept

Archive records about **'s Lands Hospitaal** (Paramaribo) and other places in Suriname are made visible as **people who were there**. Visitors explore a person's relations, places and family. Descendants and community members can add what they know: family ties, friendships, stories. This enriches the heritage data and connects the past to living people.

### On-site projection
- A beamer shows the hospital at **one moment: 1921**, with the **516 patients** registered there as **"was here" names**. They are styled as stamped/lettered names, flat on a pure black background.
- **Selecting a name** forms a **constellation**: lines to the records and people that patient links to.
- **Phone interaction (later):** a visitor points their phone at a name; the phone recognises it (font + color, plus OCR of the name) and opens a form to **add knowledge about that person**.

### Web app / 3D dashboard
1. **Overview map** of Suriname/Paramaribo; locations sized by how many people were recorded there.
2. **Select a location** → the names at that location (same view as the projection).
3. **Select a person** → their constellation.
4. From a person: **Family view** (family tree) or **Places view** (their places on the map, in time order, as a trail).

The map is one component with a filter: no filter = everyone; person = that person's trail; family = all places of the family, colored by generation.

### Scope decision (30 Oct, 18:20)
The app and projection give access to the **full dataset**. The 516 patients of 1921 are only the **starting point**; from a patient, visitors follow links to any person, record or place.

### Citizen science / oral history
- Most "friend/relation" lines will come from contributions, since the archives mainly hold formal events and some family ties.
- Contributions are stored **separately** from archive data (`contributions.db`), marked as user-contributed, with provenance. **Archive records are never overwritten.**
- Only about **people who have died** (privacy/GDPR).
- Contributors give **consent** (the data ends up in the open repo).
- Status **"not yet checked"** until reviewed.

### Demo story
Follow one real patient/family through the whole flow, ideally connected to a team or community member. The aim: someone with a Surinamese background literally sees that an ancestor "was here".

## 4. Architecture

```
Browser (web app /)          Phone (camera + form)        Projector (/projection)
        \                           |                            /
         \------ HTTPS + WSS ------ hackalod.sbco.design -------/
                                    |
                          VPS: Caddy (TLS, :443)
                           /                    \
              /api/*  (Tailscale)            everything else
                 |                                |
   Thunnis' laptop: Datasette  ◄──writes──  Node app server (:3000, pm2)
   db: suriname_person_search (read-only)   pages, POST /contribute,
   db: contributions (writable, planned)    websocket signals
```

- **Data layer:** Datasette 0.65.1 on Thunnis' laptop (~7M rows), reached via Tailscale. Caddy on the VPS proxies `https://hackalod.sbco.design/api/*` to it.
- **Presentation layer:** web app (`/`) and projection (`/projection`) both read from the **same API**. This is the data/presentation split the jury rewards.
- **Custom SQL is disabled** (public endpoint). Use **canned queries** and **table views with column filters**: `/api/<db>/<query|table>.json?_shape=array&param=...`.
- **Websocket = signals only, never data.** The app server broadcasts `{"type":"select","personId":…}` and `{"type":"contributions-changed","personId":…}`; clients then fetch fresh data from the API. Clients also poll `contributions_since` every 30 s as a fallback.
- **Writes** go only through the app server: phone → `POST /contribute` → validation (consent, deceased) → Datasette `add_contribution` → websocket broadcast. The phone never writes to Datasette directly.
- **Resilience:** the laptop can go offline. Keep static snapshots (e.g. `mh1921_patienten`, overview map data) as JSON in the app and fall back to them.
- **Hosting:** VPS (2 vCPU, 4 GB RAM), domain `hackalod.sbco.design`, Caddy with Let's Encrypt, Node 22, pm2 process `hackalod` in `~/hackalod`. Deploy: `pm2 restart hackalod`.

### Frontend stack
| Part | Choice |
|---|---|
| App | React, package manager **pnpm** (never npm or yarn in the repo). Build tool and router: whatever the repo already uses, so check `package.json` before adding anything. |
| 3D dashboard and projection | three, @react-three/fiber, @react-three/drei |
| Text in 3D | drei `<Text>` (troika SDF) |
| Layout | d3-force (positions only), d3-hierarchy for family trees |
| Maps | MapLibre GL JS (no token); historical overlays possibly via Allmaps |

## 5. Data

### Sources (at least two collections, as required)
- **'s Lands Hospitaal patient data** (via Thunnis / HDSC); 1921 subset in `mh1921_*` tables.
- **Suriname slave registers (1830–1863)** and **emancipation registers (1863)**: HDSC / Nationaal Archief; IISH research dataset (Van Oort, Kok, Van Galen, 2023).
- **Civil records (burgerlijke stand)** of Suriname (HDSC, from 2023).
- **Paramaribo ward register (wijkregister)**, available as linked open data (RDF).
- **1921 census**, **contract (indentured labour) registers**, and more in the combined database.
- **STM gazetteer** (`places-gazetteer.jsonld`, 9,138 places, 8,765 with coordinates) and **1885 Paramaribo address points** (Muntjewerff concordance, attribution required).

### API
Base: `https://hackalod.sbco.design/api/suriname_person_search/` (append `.json?_shape=array`).

**Hospital subset (starting point):**
| Table | Rows | Key columns |
|---|---|---|
| `mh1921_patienten` | 516 | patient_id, achternaam, initialen_of_contractnr, geboortejaar, groep, aantal_vermeldingen, beste_resultaat, gevonden_in |
| `mh1921_vermeldingen` | 799 | patient_id, person_id, certificate_id, census_uuid, census_rij_id |
| `mh1921_koppelingen` | 351 | patient_id, doel_dataset, doel_person_id, doel_certificate_id, resultaat, rol_in_doelrecord, toelichting, methode |

**Main tables:** `persons` (1.9M attestations), `certificates` (731k records), `relations` (1.3M; relation_type, from_person, to_person, confidence), `locations` (1.66M place mentions; raw_text, location_norm, field_origin, place_id), `places` (107k distinct normalised places), `person_names`, `annotations`, `contract_numbers`, `cross_dataset_names`, `sources` (license + embargo per dataset).

**Existing canned queries:**
| Use | Query | Params |
|---|---|---|
| Person detail | `ui_person` | key (obs_key) or id |
| Archive relations | `ui_relations` | id |
| Everyone on a record | `ui_record_persons` | cert |
| Places on a record | `ui_record_places` | cert |
| Same name elsewhere (candidates) | `ui_same_name` | id |
| Other names | `ui_names` | id |
| Names at a place (paged, LIMIT 51) | `ui_place_search` | place_norm, dataset, role, year_from, year_to, loc, offset |
| Facets at a place | `ui_place_facets` | same + loc_limit |
| Search | `ui_search`, `ui_facets`, `person_search` | match, mode, filters |
| Place search | `ui_places` | w1..w6 |
| Contract numbers | `contract_search` | |
| Datasets and licenses | `ui_datasets`, `dataset_licensing` | |

Pass empty optional params as `''`.

**Requested, not live yet:** `gazetteer` and `place_geo` tables (coordinates for every place), and canned queries `person_places` (person trail), `record_places_geo`, `map_places` (overview map), `place_wall` (names at any place), `patient_start` (one call per patient). Also `contributions.db` with `add_contribution`, `contributions_since` and `contributions_for_person`. Write code so these can be swapped in.

### Data model facts that affect the UI
- **`persons` = attestations, not people.** The same real person in two records is two rows; records are **never merged**. Cross-record matches are **candidates** → show them as "possibly the same person". Confirming or rejecting a candidate is a natural visitor contribution.
- Prefer **`obs_key`** (stable) over `person_id` (row id) for persistent links.
- Use **IDs internally**, names only for display; duplicate names are common.
- Patients have **surname + initials or a contract number**, no full first names. Contract numbers point to indentured migrants.
- Only ~351 links for 516 patients: many patients are "just a name".
- Values of `groep`, `resultaat` and `beste_resultaat` are **not documented yet**; keep their mapping in one config.
- `field_origin` says which field a place came from (death place, declarant, witness address, …). For "X was here" prefer fields about the person themself.
- Place strings are messy (full 1885 addresses, streets only, vague, abroad, non-places). Coordinates come from the planned `place_geo` linking.
- Respect **embargo flags** from `sources`.
- Hospital location on the map is probably 1885 point **B2 Gravenstraat "Hospitaal"** (lat 5.830053, lng −55.156859). This is an **assumption, still to verify** with Thunnis.

## 6. Rules and sensitivities

- **Never invent data.** Show only what the records say: no invented movements inside the building, no invented relations, no invented first names.
- Show **deceased people only**; keep that guard on contributed data too.
- **Archive data is read-only.** Contributions are separate, with provenance and a "not yet checked" status.
- Wording matters: enslaved ancestors (*slaafgemaakten*), indentured migrants and contract numbers. Language (NL/EN) is still open. Keep all UI strings in one place so Nisha can review them.
- Attribution: datasets carry licenses in `sources`; the 1885 concordance data requires Muntjewerff attribution.
- Everything ends up in a **public GitHub repo**: no secrets, tokens or private hostnames in code.
- Optional light Middelburg/Zeeland link (e.g. Zeeland shipping) in the story, not in the core build.

## 7. Open questions

- How the projection is controlled beyond the phone.
- Legibility of ~500 names; whether the moment in time can change.
- Whether names also show what happened ("born here, 1871").
- Exact constellation edge types and how archive vs contributed ties look.
- Language and terminology; community sensitivities (check with Nisha).

## 8. Build priorities

1. Location view (hospital wall) with names + constellation
2. Projection of the location view
3. Phone recognition + contribution form
4. Overview map with person filter (places trail)
5. Family tree and family filter on the map
