"""Build stable-ID links from a downloaded places-gazetteer.jsonld (no name matching).
Usage: python3 scripts/link-plantation-gazetteer.py /path/to/places-gazetteer.jsonld
"""
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[1]
records = json.loads(pathlib.Path(sys.argv[1]).read_text())['@graph']
features = json.loads((root / 'public/data/plantations-1930.geojson').read_text())['features']
place_ids = {f['properties']['placeId'] for f in features}
links = {}
for record in records:
    if record.get('type') != 'plantation' or record.get('fid') is None:
        continue
    place_id = f"https://data.surinametijdmachine.org/place/1930/fid-{record['fid']}"
    location = record.get('location', {})
    if place_id in place_ids and location.get('lng') is not None and location.get('lat') is not None:
        links[record['id']] = {'placeId': place_id, 'lng': location['lng'], 'lat': location['lat']}
(root / 'app/lib/data/plantation-gazetteer.json').write_text(json.dumps(links, separators=(',', ':')) + '\n')
print(f'{len(links)} stable-ID links written')
