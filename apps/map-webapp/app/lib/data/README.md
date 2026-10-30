# Plantation gazetteer links

`plantation-gazetteer.json` is a compact ID crosswalk derived on 2026-10-30 from:
https://raw.githubusercontent.com/SurinameTimeMachine/suriname-database-model/main/data/places-gazetteer.jsonld

Gazetteer `id` maps through its original `fid` to the existing plantation feature's `placeId`. No name or nearest-neighbour matching. Source coordinates are retained to detect drift between this snapshot and the live API. A changed or unknown ID falls back to its gazetteer point; no boundary is invented.

Regenerate from the app directory:

```sh
python3 scripts/link-plantation-gazetteer.py /path/to/places-gazetteer.jsonld
```

The polygon geometry remains in `public/data/plantations-1930.geojson`, with its existing provenance. Historical polygon depictions do not establish boundaries for every date represented in the people API.
