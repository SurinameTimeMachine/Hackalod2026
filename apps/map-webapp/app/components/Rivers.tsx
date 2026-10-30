'use client';

import { Line } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import { FileLoader } from 'three';
import { type Coordinate, LAND_HEIGHT, toWorld } from '../lib/geo';

type RiverData = {
  features: {
    geometry: {
      type: 'LineString';
      coordinates: Coordinate[];
    };
  }[];
};

export default function Rivers() {
  const file = useLoader(FileLoader, '/data/rivers-1930.geojson');

  const points = useMemo(() => {
    const data = JSON.parse(String(file)) as RiverData;
    const result: [number, number, number][] = [];

    for (const feature of data.features) {
      const coordinates = feature.geometry.coordinates;

      for (let i = 1; i < coordinates.length; i++) {
        result.push(
          toWorld(coordinates[i - 1], LAND_HEIGHT + 0.01),
          toWorld(coordinates[i], LAND_HEIGHT + 0.01),
        );
      }
    }

    return result;
  }, [file]);

  return <Line points={points} segments color="#91bdb5" lineWidth={1.25} />;
}
