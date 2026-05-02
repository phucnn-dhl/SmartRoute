'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { TrafficSegment } from '@/components/TrafficOverlay';
import { TimeSelection } from '@/components/TimePicker';

interface UseTrafficSegmentsOptions {
  minZoomForDetails?: number;
}

interface TrafficSegmentsState {
  segments: TrafficSegment[];
  loading: boolean;
  currentZoom: number;
}

const LOW_ZOOM_THRESHOLD = 12;

function getTimeKey(timeSelection: TimeSelection): string {
  if (timeSelection.type === 'preset') {
    return timeSelection.horizon || 'now';
  }
  const t = timeSelection.customTime;
  if (!t) return 'custom';
  const wd = timeSelection.weekday !== undefined ? timeSelection.weekday : t.getDay();
  return `custom-${t.getHours()}-${t.getMinutes()}-${wd}`;
}

export function useTrafficSegments(
  map: maplibregl.Map | null,
  timeSelection: TimeSelection,
  options: UseTrafficSegmentsOptions = {}
) {
  const { minZoomForDetails = 14 } = options;

  const [state, setState] = useState<TrafficSegmentsState>({
    segments: [],
    loading: false,
    currentZoom: 12,
  });

  const loadingRef = useRef(false);
  const lastRequestKeyRef = useRef('');
  const timeSelectionRef = useRef(timeSelection);

  // Keep ref in sync
  useEffect(() => {
    timeSelectionRef.current = timeSelection;
  }, [timeSelection]);

  const boundsToKey = useCallback((bounds: maplibregl.LngLatBoundsLike, zoom: number, timeSel: TimeSelection) => {
    const [[minLng, minLat], [maxLng, maxLat]] = bounds as [[number, number], [number, number]];
    return [
      minLng.toFixed(4),
      minLat.toFixed(4),
      maxLng.toFixed(4),
      maxLat.toFixed(4),
      zoom.toFixed(1),
      getTimeKey(timeSel),
    ].join(',');
  }, []);

  const getStreetLevelParam = useCallback((zoom: number) => {
    if (zoom < LOW_ZOOM_THRESHOLD) return '1';
    if (zoom < minZoomForDetails) return '2';
    return null;
  }, [minZoomForDetails]);

  const loadByBounds = useCallback(async (
    bounds: maplibregl.LngLatBoundsLike,
    zoom: number,
    force = false
  ) => {
    if (!map || loadingRef.current) return;

    const ts = timeSelectionRef.current;
    const requestKey = boundsToKey(bounds, zoom, ts);
    if (!force && requestKey === lastRequestKeyRef.current) return;

    const [[minLng, minLat], [maxLng, maxLat]] = bounds as [[number, number], [number, number]];

    loadingRef.current = true;
    setState(prev => ({ ...prev, loading: true, currentZoom: zoom }));

    try {
      const params = new URLSearchParams({
        bounds: `${minLat},${minLng},${maxLat},${maxLng}`,
        zoom: zoom.toFixed(1),
      });

      const streetLevel = getStreetLevelParam(zoom);
      if (streetLevel) {
        params.set('streetLevelMax', streetLevel);
      }

      // Add time parameters for XGBoost predictions
      let targetTime: Date;
      if (ts.type === 'preset') {
        const now = new Date();
        const horizon = ts.horizon || 'now';
        const offsetMinutes = horizon === 'now' ? 0 : parseInt(horizon.slice(1), 10);
        targetTime = new Date(now.getTime() + offsetMinutes * 60 * 1000);
      } else {
        targetTime = ts.customTime || new Date();
      }
      params.set('hour', String(targetTime.getHours()));
      params.set('minute', String(targetTime.getMinutes()));
      const weekday = ts.weekday !== undefined
        ? ts.weekday
        : targetTime.getDay();
      params.set('weekday', String(weekday));

      const response = await fetch(`/api/segments-hcmc?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch segments');
      }

      const data = await response.json();
      lastRequestKeyRef.current = requestKey;

      setState({
        segments: data.segments || [],
        loading: false,
        currentZoom: zoom,
      });
    } catch (error) {
      console.error('Error loading segments by bounds:', error);
      setState(prev => ({ ...prev, loading: false, currentZoom: zoom }));
    } finally {
      loadingRef.current = false;
    }
  }, [boundsToKey, getStreetLevelParam, map]);

  // Re-fetch when timeSelection changes
  useEffect(() => {
    if (!map || !state.segments.length) return;

    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const boundsArray: maplibregl.LngLatBoundsLike = [
      [bounds.getSouthWest().lng, bounds.getSouthWest().lat],
      [bounds.getNorthEast().lng, bounds.getNorthEast().lat],
    ];

    loadByBounds(boundsArray, zoom, false);
  }, [timeSelection, map, loadByBounds]);

  const updateZoom = useCallback((zoom: number) => {
    setState(prev => ({ ...prev, currentZoom: zoom }));
  }, []);

  return {
    segments: state.segments,
    loading: state.loading,
    hasMore: false,
    loadByBounds,
    loadMore: async () => undefined,
    loadedCount: state.segments.length,
    currentZoom: state.currentZoom,
    updateZoom,
    canHoverDetails: state.currentZoom >= minZoomForDetails,
  };
}
