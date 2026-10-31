# Stories in the constellation: what the projection needs to do

Goal: when a visitor saves a story on the phone (`/scan`), the wall shows **right away** what they added: new lines draw in, told relatives appear as names, and the storyteller becomes part of the constellation. Example: Johanna's grandchild tells that Ramlal Doerga was their grandfather, and that Ramlal's father came from Calcutta. The wall then shows Johanna, a new name for the grandchild (the storyteller) two generations below her, Ramlal two generations above the grandchild, and "zijn vader" one above Ramlal. A story can also tell a whole branch ("G.W. had twee kinderen, Anna en Kees; Anna kreeg een dochter, Maria"): every person in a story has one key, and the relations can be between any two of them.

The server and phone side is done (see "What already exists"). This file describes the changes in the projection code (`app/projection/*`, `app/shared/signals.ts`, `app/shared/keys.ts`, `app/shared/strings.ts`), which another session is working on.

## What already exists (server + phone)

- **`GET /signals`**: server-sent events, one JSON `Signal` per event (type in `app/shared/story.ts`). Use `listenSignals(onSignal)` from `app/shared/signalClient.ts`; it reconnects by itself.
  - `{ type: 'select', key, name }`: a phone confirmed a person and starts telling. Sent when "Start met vertellen" is tapped, and again if a follow-up question moves the story to another record.
  - `{ type: 'story-saved', key, name, story_id, narrator, added }`: a story was saved. `added` is a `ToldGraph` with **exactly** what this story added.
- **`GET /story/graph?key=<key>`**: a `ToldGraph` with everything all saved stories added around a person (stories about them, naming them, told by them, or with a relation pointing at them). Use this when a constellation is opened, so earlier stories show up too.
- Keys are the shared format (`app/shared/keys.ts`): `patient:<id>`, `person:<id>`, plus two new ones:
  - `name:<uuid>`: the storyteller, or a person the visitor named who is not linked to the archive (a provisional subject)
  - `told:<story id>/<entity id>`: a person from a story who is not linked to the archive ("mijn grootvader Ramlal Doerga", "zijn vader", "Anna"). The same person keeps the same key throughout that story.

`ToldGraph` (see `app/shared/story.ts`):

```ts
nodes: { key, name, kind: 'archive' | 'told' | 'narrator', story_id }[]
edges: { id, from, to, relation_type, up?, generations?: 1 | 2, level?, story_id, narrator, quote }[]
notes: { key, text, story_id }[]   // e.g. "verpleegster · 's Lands Hospitaal · overleden 1967"
```

An edge reads as **"`to` is `relation_type` of `from`"**. The server already worked out the tree shape: `up` is the key of the elder end, `generations` is how far up (1 for a parent/child, 2 for a grandparent/grandchild, 3 for a great-grandchild), and `level` means side by side (spouse, sibling). Friends and `other` have no shape.

Example `added` for the Johanna story:

```
nodes  archive   person:631026   Mathilda Augusta Johanna Wijngaarden
       narrator  name:1557…      Test Kleinkind
       told      told:b9e0…      Ramlal Doerga
edges  person:631026 → name:1557…  grandchild   up=person:631026  generations=2
       name:1557…    → told:b9e0…  grandparent  up=told:b9e0…     generations=2
notes  person:631026: "verpleegster · 's Lands Hospitaal · overleden 1967"
```

## Changes in the projection

### 1. Listen to signals (`app/shared/signals.ts`, `ProjectionPage.tsx`)
Replace the no-op `useSignals` with a hook around `listenSignals`, taking two callbacks:
- `select`: open the constellation for that key. `patient:<id>` → `openNow(id)` (as today). `person:<id>` → open it via its patient if `patientIndex` maps it to one, otherwise open a constellation rooted at that person (if `useConstellation` can't open by person yet, add that). `name:` → skip for now (see 6).
- `story-saved`: see 3.

Every signal counts as input for the idle reset (`touch()`). After a `story-saved`, keep the constellation up longer than the normal 60 s (e.g. 2 minutes), so the visitor can walk back to the wall and see it.

### 2. Node keys (`graph.ts`, `app/shared/keys.ts`)
- Map shared keys to `NodeKey`s: `patient:N` → `p:N`; `person:N` → the node already showing that attestation (`graph.alias.get(N)`, otherwise `x:N`); `told:…` / `name:…` → a new prefix `t:<shared key>` (e.g. `t:told:b9e0…`, `t:name:1557…`).
- Add `GNode.kind` values `'told'` and `'narrator'`.
- Extend `fromNodeKey` in `app/shared/keys.ts` to return the shared key for `t:` nodes (strip the `t:`), so the display registry reports told names and the storyteller too. A phone can then scan them on the wall later.

### 3. Merge a ToldGraph (`useConstellation.ts`)
Add an action, e.g. `addTold(added: ToldGraph, { fresh: boolean })`, that clones the graph and:
- adds every node that isn't there yet: `kind: 'told' | 'narrator'`, `name`, caption: for the narrator `told this story · <time>`, for told people `told by <narrator>`. Archive nodes (`patient:` / `person:`) already in the graph are reused, not duplicated.
- adds every edge as a `GEdge`: `key: 'told:' + edge.id`, `from`/`to` mapped as in 2, `certain: false` (a visitor's story is not checked yet), `parent`: the mapped `up` key, `level` as given, and `reason` / `reference` from `strings.ts` (see 5).
- puts `notes` on that person's caption (under the existing subtitle).
- `fresh: true` (from `story-saved`): remember the new keys in a `Set` for ~10 s, so they can pulse or glow (see 4). Use `origin` (the anchor's position) so new names glide out of the person they hang from, the way expanded names already do.

**More than one generation:** `TreeLayout` (`forceLayout.ts`) knows `parent` (one generation, `GENERATION`) and `level`. Grandparent and grandchild edges have `generations: 2`, a great-grandchild (the storyteller chose "Achterkleinkind") has `generations: 3`. Add an optional `generations` to `GEdge` and multiply the vertical distance by it in `TreeLayout`, so the storyteller ends up two rows below Johanna and Ramlal two rows above the storyteller.

When `story-saved` arrives:
1. If the current graph doesn't contain the subject (`signal.key`), open it first (as for `select`) and wait until its expansion has loaded.
2. Then call `addTold(signal.added, { fresh: true })`.
3. Set the focus to the subject, so the camera and captions are about them.

### 4. How it looks (`Constellation.tsx`, `Stamp.tsx`, `stampStyle.ts`)
- Told names and the storyteller should read as *told*, not *archived*: use the handwriting font (`caveat` is already in `FONTS`), one fixed ink for all told names, and a dashed line, like other uncertain ties.
- Fresh additions: the line draws out from the anchor (the `Thread` animation already does this), the name glides in from `origin` and pulses for ~10 s, then stays like any other name.
- Optionally: a small caption above the subject for a few seconds: `New story by <narrator>`.

### 5. Wording (`app/shared/strings.ts`)
- `toldReason(fromName, toName, relationType)`, e.g. "Test Kleinkind is the grandchild of Johanna Wijngaarde" (`to` is `relation_type` of `from`).
- `toldReference(narrator)`, e.g. "told by Test Kleinkind · not yet checked".
- The narrator caption and the "new story" line. (The phone's Dutch wording is in `app/scan/strings.ts`; the projection's language is up to you.)

### 6. Also when opening a constellation
Whenever a constellation opens (and when a name is expanded), fetch `GET /story/graph?key=<shared key>` for that node, and merge it with `addTold(…, { fresh: false })`. Stories saved earlier then always show. The fetch is cheap (a few Datasette queries); cache it per key, like `cachedGet`, but drop that cache entry on every `story-saved` signal.

A story about a **provisional person** (`name:<uuid>`: someone not on the wall and not linked to the archive) has no stamp to open. Skip it in a first version. Later, show it as a small free-floating constellation, rooted at a `t:name:…` node.

## Testing without a phone

```bash
# watch the signals
curl -N http://localhost:3001/signals
```
```bash
# a phone selecting a wall name
curl -X POST localhost:3001/select -H 'content-type: application/json' -d '{"key":"patient:111","name":"Leeuwaarden, van G.W."}'
```
For `story-saved`, save a story through `/scan` (typing is enough), or POST a `ContributeRequest` to `/contribute` (see `app/shared/story.ts`). The response also contains `added`. `GET /story/graph?key=patient:111` shows what is stored. Stories end up in the Datasette `contributions` database, which is shared and has no delete, so mark test stories as such (e.g. a narrator called "Test").
