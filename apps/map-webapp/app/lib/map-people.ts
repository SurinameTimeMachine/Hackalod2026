import { MercatorCoordinate, type CustomLayerInterface, type Map as MapLibreMap, type PointLike } from 'maplibre-gl';
import { Box3, BufferGeometry, Camera, DirectionalLight, AmbientLight, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshPhongMaterial, Points, PointsMaterial, Ray, Scene, Sphere, SphereGeometry, Texture, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { isPopularPlace, type PeopleCluster } from './people-data';
import { connectionPairs } from './people-connections';

export const PEOPLE_LAYER_ID = 'people-spheres';
const HOSPITAL_COORDINATES: [number, number] = [-55.15685854195079, 5.830053055211843];
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
  let hospitalLoading = false;
  let hospitalRemoved = false;
  let hospital: Group | null = null;
  let hospitalWidth = 1;
  const scene = new Scene();
  const camera = new Camera();
  const geometry = new SphereGeometry(1, 16, 12);
  const material = new MeshPhongMaterial({ color: '#dfaf49', specular: '#fff0bf', shininess: 45 });
  const fadedMaterial = new MeshPhongMaterial({ color: '#dfaf49', transparent: true, opacity: 0.48, depthWrite: false });
  const selectedMaterial = new MeshPhongMaterial({ color: '#ffdc72', emissive: '#b26a10', emissiveIntensity: 0.65, specular: '#ffffff', shininess: 70 });
  const connectionGeometry = new LineSegmentsGeometry();
  const connectionMaterial = new LineMaterial({ color: '#9b6800', linewidth: 3, transparent: true, opacity: 0.8, depthWrite: false });
  const lines = new LineSegments2(connectionGeometry, connectionMaterial);
  lines.frustumCulled = false;
  const lightGeometry = new BufferGeometry();
  const lightMaterial = new PointsMaterial({ color: '#fff2bc', size: 5, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false });
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
      gltf.scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      hospital = new Group();
      hospital.rotation.x = Math.PI / 2;
      hospital.add(gltf.scene);
      hospital.visible = hospitalVisible;
      scene.add(hospital);
      dirty = true;
      map.triggerRepaint();
    }, undefined, error => { hospitalLoading = false; console.error('Hospital model:', error); });
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
        const filtered = popularOnly ? clusters.filter(isPopularPlace) : clusters;
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
      connectionMaterial.opacity = motion?.matches ? 0.8 : 0.7 + 0.15 * Math.sin(performance.now() / 900);
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
      const canvas = map.getCanvas();
      connectionMaterial.linewidth = 3 * (canvas.width / canvas.clientWidth);
      renderer.resetState();
      renderer.setViewport(0, 0, canvas.width, canvas.height);
      renderer.render(scene, camera);
      if (connectionCenters.length > 0) schedulePulse();
    },
    onRemove() {
      hospitalRemoved = true;
      if (hospital) { scene.remove(hospital); disposeHospital(hospital); }
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
    setHospitalFocus(value: boolean) { hospitalFocus = value; dirty = true; map?.triggerRepaint(); },
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
