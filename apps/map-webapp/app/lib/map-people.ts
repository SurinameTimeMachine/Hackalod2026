import { MercatorCoordinate, type CustomLayerInterface, type Map as MapLibreMap } from 'maplibre-gl';
import { Camera, DirectionalLight, AmbientLight, InstancedMesh, Matrix4, MeshPhongMaterial, Scene, SphereGeometry, WebGLRenderer } from 'three';
import type { PeopleCluster } from './people-data';

export const PEOPLE_LAYER_ID = 'people-spheres';

// One instanced draw rather than one React component/DOM node per place.
// Mercator projection matches this app's map. No Fiber camera is involved.
export function createPeopleLayer(clusters: PeopleCluster[]) {
  let selected = new Set<string>();
  let map: MapLibreMap;
  let renderer: WebGLRenderer;
  const scene = new Scene();
  const camera = new Camera();
  const geometry = new SphereGeometry(1, 16, 12);
  const material = new MeshPhongMaterial({ color: '#dfaf49', specular: '#fff0bf', shininess: 45 });
  const fadedMaterial = new MeshPhongMaterial({ color: '#dfaf49', transparent: true, opacity: 0.18, depthWrite: false });
  const selectedMaterial = new MeshPhongMaterial({ color: '#ffdc72', emissive: '#b26a10', emissiveIntensity: 0.65, specular: '#ffffff', shininess: 70 });
  const mesh = new InstancedMesh(geometry, material, clusters.length);
  const faded = new InstancedMesh(geometry, fadedMaterial, clusters.length);
  const highlighted = new InstancedMesh(geometry, selectedMaterial, clusters.length);
  for (const item of [mesh, faded, highlighted]) item.frustumCulled = false;
  faded.count = 0;
  highlighted.count = 0;
  // Local origin avoids precision loss when metre-sized spheres use float32 matrices.
  const origin = MercatorCoordinate.fromLngLat([-55.9, 4.4]);
  const translation = new Matrix4().makeTranslation(origin.x, origin.y, 0);
  const matrix = new Matrix4();
  const positions = clusters.map(c => ({
    cluster: c,
    point: MercatorCoordinate.fromLngLat(c.center),
    scale: MercatorCoordinate.fromLngLat(c.center).meterInMercatorCoordinateUnits(),
  }));
  let dirty = true;
  const invalidate = () => { dirty = true; };

  const layer: CustomLayerInterface = {
    id: PEOPLE_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',
    onAdd(currentMap, gl) {
      map = currentMap;
      scene.add(mesh);
      scene.add(faded, highlighted);
      scene.add(new AmbientLight('#fff0cc', 1.3));
      const sun = new DirectionalLight('#fff8e4', 2.5);
      sun.position.set(-1, -1, 2);
      scene.add(sun);
      renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl });
      renderer.autoClear = false;
      map.on('sourcedata', invalidate);
      map.on('moveend', invalidate);
    },
    render(_gl, options) {
      if (dirty) {
        let normalCount = 0, fadedCount = 0, selectedCount = 0;
        positions.forEach(({ cluster, point, scale }) => {
          const elevation = map.queryTerrainElevation(cluster.center) ?? 0;
          const r = cluster.radiusMeters * scale;
          matrix.makeScale(r, r, r);
          matrix.setPosition(point.x - origin.x, point.y - origin.y,
            (elevation + cluster.radiusMeters + 8) * scale);
          if (selected.size === 0) mesh.setMatrixAt(normalCount++, matrix);
          else if (selected.has(cluster.id)) highlighted.setMatrixAt(selectedCount++, matrix);
          else faded.setMatrixAt(fadedCount++, matrix);
        });
        mesh.count = normalCount;
        faded.count = fadedCount;
        highlighted.count = selectedCount;
        for (const item of [mesh, faded, highlighted]) item.instanceMatrix.needsUpdate = true;
        dirty = false;
      }
      // MapLibre 6 supplies render options, not the v4 matrix argument.
      camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(translation);
      renderer.resetState();
      renderer.render(scene, camera);
      // Render only on map updates; no perpetual animation/repaint loop on phones.
    },
    onRemove() {
      map.off('sourcedata', invalidate);
      map.off('moveend', invalidate);
      geometry.dispose();
      material.dispose();
      fadedMaterial.dispose();
      selectedMaterial.dispose();
      mesh.dispose();
      faded.dispose();
      highlighted.dispose();
      renderer?.dispose();
    },
  };
  return {
    layer,
    select(ids: string[]) {
      selected = new Set(ids);
      dirty = true;
      map?.triggerRepaint();
    },
  };
}
