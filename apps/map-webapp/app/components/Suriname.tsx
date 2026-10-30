'use client';

import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import { FileLoader, Path, Shape } from 'three';
import { type Coordinate, LAND_HEIGHT, project } from '../lib/geo';

type Polygon = Coordinate[][];

type BoundaryData = {
  features: {
    geometry: {
      type: 'MultiPolygon';
      coordinates: Polygon[];
    };
  }[];
};

export default function Suriname() {
  const file = useLoader(FileLoader, '/data/suriname.geojson');

  const shapes = useMemo(() => {
    const data = JSON.parse(String(file)) as BoundaryData;

    return data.features.flatMap((feature) => {
      if (feature.geometry.type !== 'MultiPolygon') {
        throw new Error('Expected the GONINI MultiPolygon boundary.');
      }

      return feature.geometry.coordinates.map((polygon) => {
        const [outerRing, ...holes] = polygon;

        const shape = new Shape(outerRing.map(project));

        shape.holes = holes.map((ring) => new Path(ring.map(project)));

        return shape;
      });
    });
  }, [file]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <extrudeGeometry
        args={[
          shapes,
          {
            depth: LAND_HEIGHT,
            steps: 1,
            bevelEnabled: false,
          },
        ]}
      />{' '}
      <meshStandardMaterial color="#365340" roughness={1} />
    </mesh>
  );
}
