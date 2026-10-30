import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { parsePeoplePage, parsePeoplePayload, peopleQuery, peoplePayloadQuery } from '../app/lib/people-data.ts';
import { interiorFootprint, placeCluster } from '../app/lib/people-placement.ts';
const place = { id:'a', uri:'https://example.org/a', label:'A', type:'plantation', lat:5, lng:-55, person_count:8 };
const square = {type:'Polygon', coordinates:[[[-55.01,4.99],[-54.99,4.99],[-54.99,5.01],[-55.01,5.01],[-55.01,4.99]]]};
test('deduplicates aliases and duplicate locations while allowing one person at two places', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE place_geo (gazetteer_id TEXT, location_norm TEXT, lat REAL, lng REAL);
    CREATE TABLE places (place_norm TEXT);
    CREATE TABLE locations (location_norm TEXT, certificate_id INTEGER);
    CREATE TABLE persons (person_id INTEGER, certificate_id INTEGER);
    CREATE TABLE gazetteer (id TEXT, uri TEXT, prefLabel TEXT, type TEXT, lat REAL, lng REAL);
    INSERT INTO gazetteer VALUES ('a','a','A','plantation',5,-55), ('b','b','B','plantation',5,-55);
    INSERT INTO place_geo VALUES ('a','alias1',5,-55), ('a','alias2',5,-55), ('b','b',5,-55);
    INSERT INTO places VALUES ('alias1'),('alias2'),('b');
    INSERT INTO locations VALUES ('alias1',1),('alias2',1),('alias1',1),('b',1),('alias1',2);
    INSERT INTO persons VALUES (10,1),(11,1),(12,2);`);
  assert.deepEqual(db.prepare(peopleQuery()).all().map(r => [r.id,r.person_count]), [['a',3],['b',2]]);
  const payload = db.prepare(peoplePayloadQuery()).all();
  assert.equal(parsePeoplePayload({ok:true,truncated:false,rows:payload}).length, 2);
  assert.throws(() => parsePeoplePayload({ok:true,truncated:false,rows:[{...payload[0],place_count:99}]}));
  db.close();
});
test('rejects truncated data and invalid coordinates or counts', () => {
  assert.throws(() => parsePeoplePage({ok:true,rows:[place],truncated:true}));
  assert.throws(() => parsePeoplePage({ok:true,rows:[{...place,lat:null}],truncated:false}));
  assert.throws(() => parsePeoplePage({ok:true,rows:[{...place,person_count:0}],truncated:false}));
  assert.deepEqual(parsePeoplePage({ok:true,rows:[place],truncated:false}),[place]);
});
test('point stays exact and sphere size increases across counts', () => {
  assert.deepEqual(placeCluster(place).center,[-55,5]);
  const radii = [1, 10, 100, 1000, 1000000].map(person_count => placeCluster({...place,type:'historical-address',person_count}).radiusMeters);
  assert.ok(radii.every((r,i) => r >= 2 && r <= 8 && (i === 0 || r > radii[i-1])));
});
test('very large counts cannot overflow a known polygon', () => {
  const c = placeCluster({...place,person_count:1e9},square);
  assert.ok(Math.abs(c.center[0]+55)<1e-8);
  assert.ok(c.radiusMeters<=interiorFootprint(square).radiusMeters);
  assert.ok(c.radiusMeters<1100);
  assert.equal(c.sizeCapped,true);
});
test('centroid inside a hole is moved into the polygon with clearance', () => {
  const g = {type:'Polygon',coordinates:[square.coordinates[0],[[-55.005,4.995],[-55.005,5.005],[-54.995,5.005],[-54.995,4.995],[-55.005,4.995]]]};
  const p=interiorFootprint(g);
  assert.ok(Math.abs(p.center[0]+55)>.005 || Math.abs(p.center[1]-5)>.005);
  assert.ok(p.radiusMeters>0 && p.radiusMeters<560);
});
test('concave and disjoint polygons use interior points', () => {
  const g={type:'Polygon',coordinates:[[[-55,5],[-54.98,5],[-54.98,5.005],[-54.995,5.005],[-54.995,5.02],[-55,5.02],[-55,5]]]};
  const p=interiorFootprint(g);
  assert.ok(p.center[0]<-54.995 || p.center[1]<5.005);
  const m=interiorFootprint({type:'MultiPolygon',coordinates:[square.coordinates,square.coordinates.map(r=>r.map(([x,y])=>[x+1,y]))]});
  assert.ok(Math.abs(m.center[0]+55)<.01 || Math.abs(m.center[0]+54)<.01);
});

test('street records may have coordinates and a stable ID without a URI', () => {
  const street={...place,type:'street',uri:null};
  assert.deepEqual(parsePeoplePage({ok:true,truncated:false,rows:[street]}),[street]);
});
