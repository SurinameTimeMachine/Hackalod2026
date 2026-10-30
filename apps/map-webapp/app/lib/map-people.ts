import { MercatorCoordinate, type CustomLayerInterface, type Map as MapLibreMap, type PointLike } from 'maplibre-gl';
import { BufferGeometry, Camera, DirectionalLight, AmbientLight, Float32BufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshPhongMaterial, Ray, Scene, Sphere, SphereGeometry, Vector3, WebGLRenderer } from 'three';
import { isPopularPlace, type PeopleCluster } from './people-data';
import { connectionPairs } from './people-connections';

export const PEOPLE_LAYER_ID = 'people-spheres';
type DisplayGroup = { members: PeopleCluster[]; center: [number, number]; radiusMeters: number };

// Groups are temporary screen-space summaries, not a new geographic place.
function groupPlaces(map: MapLibreMap, places: PeopleCluster[], selected: Set<string>): DisplayGroup[] {
  const groups = new Map<string, { members: PeopleCluster[]; x: number; y: number }>();
  const size = 52;
  const zoom = map.getZoom();
  for (const place of places) {
    const p = map.project(place.center);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const key = zoom >= 14 || selected.has(place.id) ? `place:${place.id}` : `${Math.floor(p.x / size)}:${Math.floor(p.y / size)}`;
    const group = groups.get(key);
    if (group) { group.members.push(place); group.x += p.x; group.y += p.y; }
    else groups.set(key, { members: [place], x: p.x, y: p.y });
  }
  return [...groups.values()].map(group => {
    if (group.members.length === 1) {
      const place = group.members[0];
      return { members: group.members, center: place.center, radiusMeters: place.radiusMeters };
    }
    const point = map.unproject([group.x / group.members.length, group.y / group.members.length]);
    // Keep group markers visible on overview; individual spheres retain true footprints.
    const metersPerPixel = 40075017 * Math.cos(point.lat * Math.PI / 180) / (512 * 2 ** zoom);
    return { members: group.members, center: [point.lng, point.lat], radiusMeters: 9 * metersPerPixel };
  });
}

export function createPeopleLayer(initialClusters: PeopleCluster[]) {
  let selected = new Set<string>();
  let popularOnly = false;
  let connectedIds: string[] = [];
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  let motion: MediaQueryList;
  let clusters = initialClusters;
  let map: MapLibreMap;
  let renderer: WebGLRenderer;
  const scene = new Scene();
  const camera = new Camera();
  const geometry = new SphereGeometry(1, 16, 12);
  const material = new MeshPhongMaterial({ color: '#dfaf49', specular: '#fff0bf', shininess: 45 });
  const fadedMaterial = new MeshPhongMaterial({ color: '#dfaf49', transparent: true, opacity: 0.18, depthWrite: false });
  const selectedMaterial = new MeshPhongMaterial({ color: '#ffdc72', emissive: '#b26a10', emissiveIntensity: 0.65, specular: '#ffffff', shininess: 70 });
  const connectionGeometry = new BufferGeometry();
  const connectionMaterial = new LineBasicMaterial({ color: '#ffe497', transparent: true, opacity: 0.8, depthWrite: false });
  const lines = new LineSegments(connectionGeometry, connectionMaterial);
  lines.frustumCulled = false;
  const mesh = new InstancedMesh(geometry, material, initialClusters.length);
  const faded = new InstancedMesh(geometry, fadedMaterial, initialClusters.length);
  const highlighted = new InstancedMesh(geometry, selectedMaterial, initialClusters.length);
  for (const item of [mesh, faded, highlighted]) item.frustumCulled = false;
  faded.count = highlighted.count = 0;
  const origin = MercatorCoordinate.fromLngLat([-55.9, 4.4]);
  const translation = new Matrix4().makeTranslation(origin.x, origin.y, 0);
  const matrix = new Matrix4();
  let dirty = true;
  let hitSpheres: { group: DisplayGroup; sphere: Sphere }[] = [];
  let inverseProjection: Matrix4 | null = null;
  const invalidate = () => { dirty = true; };
  function stopPulse() { if (pulseTimer !== undefined) clearTimeout(pulseTimer); pulseTimer = undefined; }
  function schedulePulse() {
    stopPulse();
    if (connectedIds.length < 2 || motion?.matches || document.hidden) return;
    pulseTimer = setTimeout(() => { pulseTimer = undefined; map?.triggerRepaint(); }, 80);
  }
  const updateMotion = () => { schedulePulse(); map?.triggerRepaint(); };

  const layer: CustomLayerInterface = {
    id: PEOPLE_LAYER_ID, type: 'custom', renderingMode: '3d',
    onAdd(currentMap, gl) {
      map = currentMap;
      scene.add(mesh, faded, highlighted, lines, new AmbientLight('#fff0cc', 1.3));
      motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      motion.addEventListener('change', updateMotion);
      document.addEventListener('visibilitychange', updateMotion);
      const sun = new DirectionalLight('#fff8e4', 2.5);
      sun.position.set(-1, -1, 2); scene.add(sun);
      renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl });
      renderer.autoClear = false;
      map.on('sourcedata', invalidate); map.on('moveend', invalidate);
    },
    render(_gl, options) {
      if (dirty) {
        let normalCount = 0, fadedCount = 0, selectedCount = 0;
        hitSpheres = [];
        const filtered = popularOnly ? clusters.filter(isPopularPlace) : clusters;
        for (const group of groupPlaces(map, filtered, selected)) {
          const point = MercatorCoordinate.fromLngLat(group.center);
          const scale = point.meterInMercatorCoordinateUnits();
          const elevation = map.queryTerrainElevation(group.center) ?? 0;
          const r = group.radiusMeters * scale;
          const center = new Vector3(point.x - origin.x, point.y - origin.y, (elevation + group.radiusMeters + 8) * scale);
          matrix.makeScale(r, r, r); matrix.setPosition(center);
          hitSpheres.push({ group, sphere: new Sphere(center, r) });
          if (selected.size === 0) mesh.setMatrixAt(normalCount++, matrix);
          else if (group.members.some(place => selected.has(place.id))) highlighted.setMatrixAt(selectedCount++, matrix);
          else faded.setMatrixAt(fadedCount++, matrix);
        }
        const centers = new Map<string, Vector3>();
        for (const hit of hitSpheres) {
          if (hit.group.members.length === 1) centers.set(hit.group.members[0].id, hit.sphere.center);
        }
        const vertices: number[] = [];
        for (const [a, b] of connectionPairs(connectedIds, new Set(centers.keys()))) {
          const first = centers.get(a)!, second = centers.get(b)!;
          vertices.push(first.x, first.y, first.z, second.x, second.y, second.z);
        }
        connectionGeometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        connectionGeometry.setDrawRange(0, vertices.length / 3);
        mesh.count = normalCount; faded.count = fadedCount; highlighted.count = selectedCount;
        for (const item of [mesh, faded, highlighted]) item.instanceMatrix.needsUpdate = true;
        dirty = false;
      }
      camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(translation);
      inverseProjection = camera.projectionMatrix.clone().invert();
      connectionMaterial.opacity = motion?.matches ? 0.8 : 0.7 + 0.15 * Math.sin(performance.now() / 900);
      renderer.resetState(); renderer.render(scene, camera);
      if (connectionGeometry.drawRange.count > 0) schedulePulse();
    },
    onRemove() {
      stopPulse();
      motion?.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateMotion);
      map.off('sourcedata', invalidate); map.off('moveend', invalidate);
      connectionGeometry.dispose(); connectionMaterial.dispose();
      geometry.dispose(); material.dispose(); fadedMaterial.dispose(); selectedMaterial.dispose();
      mesh.dispose(); faded.dispose(); highlighted.dispose(); renderer?.dispose();
    },
  };
  return {
    layer,
    setData(data: PeopleCluster[]) { connectedIds = []; stopPulse(); clusters = data; dirty = true; map?.triggerRepaint(); },
    setPopularOnly(value: boolean) { popularOnly = value; dirty = true; map?.triggerRepaint(); },
    select(ids: string[]) { selected = new Set(ids); dirty = true; map?.triggerRepaint(); },
    setConnections(ids: string[]) { connectedIds = [...new Set(ids)]; dirty = true; schedulePulse(); map?.triggerRepaint(); },
    hitTest(point: PointLike): PeopleCluster[] {
      if (!inverseProjection) return [];
      const [x, y] = Array.isArray(point) ? point : [point.x, point.y];
      const canvas = map.getCanvas();
      const nx = 2 * x / canvas.clientWidth - 1, ny = 1 - 2 * y / canvas.clientHeight;
      const near = new Vector3(nx, ny, -1).applyMatrix4(inverseProjection);
      const far = new Vector3(nx, ny, 1).applyMatrix4(inverseProjection);
      const ray = new Ray(near, far.sub(near).normalize());
      const hits = hitSpheres.map(({ group, sphere }) => ({ group, point: ray.intersectSphere(sphere, new Vector3()) }))
        .filter((hit): hit is { group: DisplayGroup; point: Vector3 } => hit.point !== null)
        .sort((a, b) => near.distanceToSquared(a.point) - near.distanceToSquared(b.point));
      if (hits.length) return [...new Map(hits.flatMap(h => h.group.members).map(p => [p.id, p])).values()];
      // Small spheres still get a reasonable touch target, only if no sphere was hit.
      const nearby = hitSpheres.map(({ group }) => ({ group, p: map.project(group.center) }))
        .map(({ group, p }) => ({ group, d: Math.hypot(p.x - x, p.y - y) }))
        .filter(hit => hit.d <= 18).sort((a, b) => a.d - b.d);
      return nearby.length ? nearby[0].group.members : [];
    },
  };
}
