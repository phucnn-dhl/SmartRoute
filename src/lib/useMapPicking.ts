'use client';

import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { Coordinate, PickingMode } from './routing';

interface UseMapPickingParams {
  map: maplibregl.Map | null;
  pickingMode: PickingMode;
  onPick: (mode: Exclude<PickingMode, null>, coordinate: Coordinate) => void;
}

export function useMapPicking({ map, pickingMode, onPick }: UseMapPickingParams) {
  useEffect(() => {
    if (!map) return;

    const canvas = map.getCanvas();
    canvas.style.cursor = pickingMode ? 'crosshair' : '';

    if (!pickingMode) {
      return () => {
        canvas.style.cursor = '';
      };
    }

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      onPick(pickingMode, [event.lngLat.lng, event.lngLat.lat]);
    };

    map.on('click', handleClick);

    return () => {
      canvas.style.cursor = '';
      map.off('click', handleClick);
    };
  }, [map, onPick, pickingMode]);
}
