import { MercatorCoordinate, type CustomLayerInterface, type Map as MapLibreMap, type PointLike } from 'maplibre-gl';
import { Box3, BufferGeometry, Camera, DirectionalLight, AmbientLight, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Object3D, Mesh, MeshPhongMaterial, Points, PointsMaterial, Ray, Scene, Sphere, SphereGeometry, Texture, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { isPopularPlace, type PeopleCluster } from './people-data';
import { connectionPairs } from './people-connections';

export const PEOPLE_LAYER_ID = 'people-spheres';
const HOSPITAL_COORDINATES: [number, number] = [-55.15685854195079, 5.830053055211843];
const FLOOR_MAX_Y = 0.5;
const WALKER_RADIUS = 2.8;
// Model-space (x, z) of the main doors and the points where walkers appear.
const DOORS: [number, number][] = [[45, -62], [90, -62], [135, -62], [70, -30], [110, -30]];
const SPAWNS: [number, number][] = [[10, -105], [60, -110], [115, -105], [165, -100], [30, -20], [85, 10], [140, 5]];
const WALKERS = Array.from({ length: 48 }, (_, i) => {
  const rand = (n: number) => { const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
  const door = DOORS[i % DOORS.length];
  // Street-side doors are reached from the south, courtyard doors from the north.
  const pool = SPAWNS.filter(spawn => door[1] < -45 ? spawn[1] < -60 : spawn[1] > -40);
  const spawn = pool[Math.floor(rand(1) * pool.length)];
  return { from: spawn, to: [door[0] + (rand(2) - 0.5) * 8, door[1]] as [number, number], period: 12 + rand(3) * 14, phase: rand(4), entering: i % 2 === 0 };
});
type DisplayGroup = { members: PeopleCluster[]; center: [number, number]; radiusMeters: number };

// One sphere per place. The apparent size is bounded in screen space for
// readability, while plantation geometry keeps its geographic size limit.
function displayPlaces(map: MapLibreMap, places: PeopleCluster[]): DisplayGroup[] {
  const zoom = map.getZoom();
  return places.map(place => {
    const metersPerPixel = 40075017 * Math.cos(place.center[1] * Math.PI / 180) / (512 * 2 ** zoom);
    const visualMinimum = 2 + 4 * Math.min(1, Math.log1p(place.person_count) / Math.log1p(1_000_000));
    const minRadius = place.placement === 'plantation-interior' ? 0 : visualMinimum * metersPerPixel;
    const radiusMeters = Math.max(minRadius, Math.min(place.radiusMeters, 14 * metersPerPixel));
    return { members: [place], center: place.center, radiusMeters };
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
  let hospitalVisible = false;
  let hospitalFocus = false;
  let hospitalOnly = false;
  let walkers: InstancedMesh | null = null;
  let walkerMarker: Mesh | null = null;
  let selectedWalker = -1;
  let frozenSeconds = 0;
  const walkerRadii: number[] = [];
  const walkerPositions = WALKERS.map(() => new Vector3());
  let hospitalLoading = false;
  let hospitalRemoved = false;
  let hospital: Group | null = null;
  let hospitalWidth = 1;
  const scene = new Scene();
  const camera = new Camera();
  const geometry = new SphereGeometry(1, 16, 12);
  const material = new MeshPhongMaterial({ color: '#dfaf49', specular: '#fff0bf', shininess: 45 });
  const fadedMaterial = new MeshPhongMaterial({ color: '#bda779', transparent: true, opacity: 0.18, depthWrite: false });
  const selectedMaterial = new MeshPhongMaterial({ color: '#ffdc72', emissive: '#b26a10', emissiveIntensity: 0.65, specular: '#ffffff', shininess: 70 });
  const connectionGeometry = new LineSegmentsGeometry();
  const connectionMaterial = new LineMaterial({ color: '#ffcf50', linewidth: 3, transparent: true, opacity: 0.95, depthWrite: false });
  const lines = new LineSegments2(connectionGeometry, connectionMaterial);
  lines.frustumCulled = false;
  const lightGeometry = new BufferGeometry();
  const lightMaterial = new PointsMaterial({ color: '#ffffff', size: 6, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false });
  const lights = new Points(lightGeometry, lightMaterial);
  lights.frustumCulled = false;
  let connectionCenters: [Vector3, Vector3][] = [];
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
  function disposeHospital(model: Group) {
    const textures = new Set<Texture>();
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
        material.dispose();
      }
    });
    textures.forEach(texture => texture.dispose());
  }
  function loadHospital() {
    if (hospital || hospitalLoading || hospitalRemoved) return;
    hospitalLoading = true;
    new GLTFLoader().load('/models/lands-hospitaal.glb', gltf => {
      hospitalLoading = false;
      if (hospitalRemoved) { disposeHospital(gltf.scene); return; }
      const box = new Box3().setFromObject(gltf.scene);
      const size = box.getSize(new Vector3());
      if (box.isEmpty() || !Number.isFinite(size.x + size.y + size.z) || Math.max(size.x, size.z) <= 0) {
        disposeHospital(gltf.scene);
        console.error('Hospital model has invalid dimensions');
        return;
      }
      hospitalWidth = Math.max(size.x, size.z);
      // Ground-level layers z-fight with the 3D terrain, so only the buildings and vegetation are kept.
      const flat: Mesh[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(object => {
        if (object instanceof Mesh && new Box3().setFromObject(object).max.y <= FLOOR_MAX_Y) flat.push(object);
      });
      for (const object of flat) object.visible = false;
      gltf.scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      hospital = new Group();
      hospital.rotation.x = Math.PI / 2;
      hospital.add(gltf.scene);
      walkers = new InstancedMesh(new SphereGeometry(1, 10, 8), new MeshPhongMaterial({ color: '#ffdc72', emissive: '#b26a10', emissiveIntensity: 0.5, specular: '#ffffff', shininess: 60 }), WALKERS.length);
      walkers.frustumCulled = false;
      gltf.scene.add(walkers);
      walkerMarker = new Mesh(new SphereGeometry(1, 14, 10), selectedMaterial);
      walkerMarker.visible = false;
      walkerMarker.frustumCulled = false;
      gltf.scene.add(walkerMarker);
      hospital.visible = hospitalVisible;
      scene.add(hospital);
      dirty = true;
      map.triggerRepaint();
    }, undefined, error => { hospitalLoading = false; console.error('Hospital model:', error); });
  }
  const dummy = new Object3D();
  function updateWalkers(instances: InstancedMesh, now: number) {
    instances.visible = true;
    if (walkerMarker) walkerMarker.visible = selectedWalker >= 0;
    WALKERS.forEach((walker, index) => {
      const seconds = index === selectedWalker ? frozenSeconds : now;
      const t = ((seconds / walker.period + walker.phase) % 1 + 1) % 1;
      // Entering walks outside -> door and shrinks away; leaving is the reverse.
      const progress = walker.entering ? t : 1 - t;
      const x = walker.from[0] + (walker.to[0] - walker.from[0]) * progress;
      const z = walker.from[1] + (walker.to[1] - walker.from[1]) * progress;
      const bob = Math.abs(Math.sin(seconds * 6 + walker.phase * 20)) * 0.5;
      const fade = Math.min(1, (walker.entering ? 1 - t : t) * 12);
      const r = WALKER_RADIUS * (0.4 + 0.6 * Math.min(1, fade));
      walkerPositions[index].set(x, WALKER_RADIUS + bob, z);
      walkerRadii[index] = r;
      if (index === selectedWalker && walkerMarker) {
        walkerMarker.position.copy(walkerPositions[index]);
        walkerMarker.scale.setScalar(r * 1.5);
      }
      dummy.position.copy(walkerPositions[index]);
      dummy.scale.setScalar(index === selectedWalker ? 0 : r);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
  }
  function stopPulse() { if (pulseTimer !== undefined) clearTimeout(pulseTimer); pulseTimer = undefined; }
  function schedulePulse() {
    stopPulse();
    if (connectedIds.length < 2 || motion?.matches || document.hidden) return;
    pulseTimer = setTimeout(() => { pulseTimer = undefined; map?.triggerRepaint(); }, 40);
  }
  const updateMotion = () => { schedulePulse(); map?.triggerRepaint(); };

  const layer: CustomLayerInterface = {
    id: PEOPLE_LAYER_ID, type: 'custom', renderingMode: '3d',
    onAdd(currentMap, gl) {
      map = currentMap;
      scene.add(mesh, faded, highlighted, lines, lights, new AmbientLight('#fff0cc', 1.3));
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
        let hospitalFootprint = 0;
        if (hospital && hospitalVisible) {
          const point = MercatorCoordinate.fromLngLat(HOSPITAL_COORDINATES);
          const metersPerPixel = 40075017 * Math.cos(HOSPITAL_COORDINATES[1] * Math.PI / 180) / (512 * 2 ** map.getZoom());
          // Keep the landmark legible without allowing its size to grow without bound.
          const widthMeters = Math.min(1200, Math.max(180, 75 * metersPerPixel));
          hospitalFootprint = widthMeters * 0.75;
          const scale = point.meterInMercatorCoordinateUnits();
          hospital.position.set(point.x - origin.x, point.y - origin.y, (map.queryTerrainElevation(HOSPITAL_COORDINATES) ?? 0) * scale);
          hospital.scale.setScalar(widthMeters * scale / hospitalWidth);
        }
        let normalCount = 0, fadedCount = 0, selectedCount = 0;
        hitSpheres = [];
        const filtered = hospitalOnly ? [] : popularOnly ? clusters.filter(isPopularPlace) : clusters;
        for (const group of displayPlaces(map, filtered)) {
          if (hospitalFocus && hospitalFootprint > 0) {
            const dx = (group.center[0] - HOSPITAL_COORDINATES[0]) * 111320 * Math.cos(HOSPITAL_COORDINATES[1] * Math.PI / 180);
            const dy = (group.center[1] - HOSPITAL_COORDINATES[1]) * 111320;
            if (Math.hypot(dx, dy) < hospitalFootprint) continue;
          }
          const point = MercatorCoordinate.fromLngLat(group.center);
          const scale = point.meterInMercatorCoordinateUnits();
          const elevation = map.queryTerrainElevation(group.center) ?? 0;
          const isHighlighted = group.members.some(place => selected.has(place.id));
          const radius = group.radiusMeters * (selected.size > 0 && !isHighlighted ? 0.55 : 1);
          const r = radius * scale;
          const center = new Vector3(point.x - origin.x, point.y - origin.y, (elevation + radius + 8) * scale);
          matrix.makeScale(r, r, r); matrix.setPosition(center);
          hitSpheres.push({ group, sphere: new Sphere(center, r) });
          if (selected.size === 0) mesh.setMatrixAt(normalCount++, matrix);
          else if (isHighlighted) highlighted.setMatrixAt(selectedCount++, matrix);
          else faded.setMatrixAt(fadedCount++, matrix);
        }
        const centers = new Map<string, Vector3>();
        for (const hit of hitSpheres) {
          if (hit.group.members.length === 1) centers.set(hit.group.members[0].id, hit.sphere.center);
        }
        const vertices: number[] = [];
        connectionCenters = [];
        for (const [a, b] of connectionPairs(connectedIds, new Set(centers.keys()))) {
          const first = centers.get(a)!, second = centers.get(b)!;
          connectionCenters.push([first, second]);
          vertices.push(first.x, first.y, first.z, second.x, second.y, second.z);
        }
        connectionGeometry.setPositions(vertices);
        lines.visible = connectionCenters.length > 0;
        lightGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(connectionCenters.length * 6), 3));
        mesh.count = normalCount; faded.count = fadedCount; highlighted.count = selectedCount;
        for (const item of [mesh, faded, highlighted]) item.instanceMatrix.needsUpdate = true;
        dirty = false;
      }
      camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(translation);
      inverseProjection = camera.projectionMatrix.clone().invert();
      connectionMaterial.opacity = motion?.matches ? 0.9 : 0.8 + 0.1 * Math.sin(performance.now() / 900);
      lights.visible = !motion?.matches && connectionCenters.length > 0;
      if (lights.visible) {
        // Two lights move symmetrically back and forth, with no implied direction.
        const phase = 0.5 - 0.42 * Math.cos(performance.now() / 1800);
        const positions = lightGeometry.getAttribute('position');
        connectionCenters.forEach(([first, second], index) => {
          for (const [offset, t] of [phase, 1 - phase].entries()) {
            positions.setXYZ(index * 2 + offset, first.x + (second.x - first.x) * t, first.y + (second.y - first.y) * t, first.z + (second.z - first.z) * t);
          }
        });
        positions.needsUpdate = true;
      }
      const animateWalkers = !!hospital && hospitalVisible && !!walkers && !motion?.matches;
      if (animateWalkers) updateWalkers(walkers!, performance.now() / 1000);
      else if (walkers) walkers.visible = false;
      const canvas = map.getCanvas();
      connectionMaterial.linewidth = 3 * (canvas.width / canvas.clientWidth);
      renderer.resetState();
      renderer.setViewport(0, 0, canvas.width, canvas.height);
      renderer.render(scene, camera);
      if (connectionCenters.length > 0) schedulePulse();
      if (animateWalkers && !document.hidden) map.triggerRepaint();
    },
    onRemove() {
      hospitalRemoved = true;
      if (hospital) { scene.remove(hospital); disposeHospital(hospital); }
      if (walkerMarker) walkerMarker.geometry.dispose();
      if (walkers) { walkers.geometry.dispose(); (walkers.material as MeshPhongMaterial).dispose(); walkers.dispose(); }
      stopPulse();
      motion?.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateMotion);
      map.off('sourcedata', invalidate); map.off('moveend', invalidate);
      connectionGeometry.dispose(); connectionMaterial.dispose();
      lightGeometry.dispose(); lightMaterial.dispose();
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
    setHospitalVisible(value: boolean) {
      hospitalVisible = value;
      if (value) loadHospital();
      if (hospital) hospital.visible = value;
      dirty = true; map?.triggerRepaint();
    },
    clearWalker() { if (selectedWalker >= 0) { selectedWalker = -1; map?.triggerRepaint(); } },
    setHospitalOnly(value: boolean) { hospitalOnly = value; dirty = true; map?.triggerRepaint(); },
    setHospitalFocus(value: boolean) { hospitalFocus = value; dirty = true; map?.triggerRepaint(); },
    // Returns the walker index when selected, -2 when the selected one was deselected, -1 on a miss.
    pickWalker(point: PointLike): number {
      if (!inverseProjection || !hospital || !walkers?.visible) return -1;
      const [x, y] = Array.isArray(point) ? point : [point.x, point.y];
      const canvas = map.getCanvas();
      const nx = 2 * x / canvas.clientWidth - 1, ny = 1 - 2 * y / canvas.clientHeight;
      const near = new Vector3(nx, ny, -1).applyMatrix4(inverseProjection);
      const far = new Vector3(nx, ny, 1).applyMatrix4(inverseProjection);
      const ray = new Ray(near, far.sub(near).normalize());
      hospital.updateMatrixWorld(true);
      let best = -1, bestDistance = Infinity;
      walkerPositions.forEach((position, index) => {
        const center = position.clone().applyMatrix4(walkers!.matrixWorld);
        const hit = ray.intersectSphere(new Sphere(center, walkerRadii[index] * hospital!.scale.x * 1.6), new Vector3());
        const distance = hit ? near.distanceToSquared(hit) : Infinity;
        if (distance < bestDistance) { best = index; bestDistance = distance; }
      });
      const previous = selectedWalker;
      selectedWalker = best >= 0 && best !== previous ? best : -1;
      if (selectedWalker >= 0) frozenSeconds = performance.now() / 1000;
      if (best < 0 && previous < 0) return -1;
      map.triggerRepaint();
      return best >= 0 ? selectedWalker : -2;
    },
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
