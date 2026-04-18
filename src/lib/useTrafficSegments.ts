'use client';

import { useCallback, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { TrafficSegment } from '@/components/TrafficOverlay';

interface UseTrafficSegmentsOptions {
  minZoomForDetails?: number;
}

interface TrafficSegmentsState {
  segments: TrafficSegment[];
  loading: boolean;
  currentZoom: number;
}

const LOW_ZOOM_THRESHOLD = 12;

export function useTrafficSegments(
  map: maplibregl.Map | null,
  _timeSelection: unknown,
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

  const boundsToKey = useCallback((bounds: maplibregl.LngLatBoundsLike, zoom: number) => {
    const [[minLng, minLat], [maxLng, maxLat]] = bounds as [[number, number], [number, number]];
    return [
      minLng.toFixed(4),
      minLat.toFixed(4),
      maxLng.toFixed(4),
      maxLat.toFixed(4),
      zoom.toFixed(1),
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

    const requestKey = boundsToKey(bounds, zoom);
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
