'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { TimeSelection } from '../TimePicker';
import { useTrafficPredictionCache } from '@/lib/useTrafficPredictionCache';
import { useIsMobile } from '@/hooks/useIsMobile';

const SOURCE_ID = 'traffic-segments-source';
const LAYER_ID = 'traffic-segments-layer';
const REALTIME_GLOW_LAYER_ID = 'traffic-segments-realtime-glow-layer';
const REALTIME_IMPACT_LAYER_ID = 'traffic-segments-realtime-impact-layer';
const HOTSPOT_SOURCE_ID = 'traffic-hotspots-source';
const HOTSPOT_LAYER_ID = 'traffic-hotspots-layer';
const HOTSPOT_PULSE_LAYER_ID = 'traffic-hotspots-pulse-layer';
const HOTSPOT_LABEL_LAYER_ID = 'traffic-hotspots-label-layer';
const HOTSPOT_RADIUS_SOURCE_ID = 'traffic-hotspots-radius-source';
const HOTSPOT_RADIUS_FILL_LAYER_ID = 'traffic-hotspots-radius-fill-layer';
const HOTSPOT_RADIUS_LINE_LAYER_ID = 'traffic-hotspots-radius-line-layer';

const LOS_COLORS = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#eab308',
  D: '#f97316',
  E: '#ef4444',
  F: '#7c2d12',
};

const LOS_LABELS = {
  A: 'Thông thoáng',
  B: 'Khá tốt',
  C: 'Ổn định',
  D: 'Bắt đầu kẹt',
  E: 'Kẹt xe',
  F: 'Kẹt cứng',
};

export interface TrafficSegment {
  segment_id: number;
  s_lat: number;
  s_lng: number;
  e_lat: number;
  e_lng: number;
  street_name: string;
  los?: string;
  confidence?: number;
  street_level?: number;
  max_velocity?: number;
  length?: number;
  prediction_source?: string;
  realtime_info?: {
    hotspot_id: string;
    hotspot_name: string;
    severity: number;
    speed_ratio: number;
    delay_ratio: number;
    influence: number;
    distance_meters: number;
  };
}

export type TrafficHotspot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_meters: number;
  description?: string;
  realtime_status?: 'ok' | 'disabled' | 'error';
  realtime_message?: string;
  realtime?: {
    current_speed?: number;
    free_flow_speed?: number;
    speed_ratio?: number;
    current_travel_time?: number;
    free_flow_travel_time?: number;
    delay_ratio?: number;
    confidence?: number;
    road_closure?: boolean;
    severity?: number;
  } | null;
};

interface TrafficOverlayProps {
  map: maplibregl.Map | null;
  segments: TrafficSegment[];
  timeSelection: TimeSelection;
  hotspots?: TrafficHotspot[];
}

type SegmentFeatureProperties = {
  segment_id: number;
  street_name: string;
  los: string;
  label: string;
  confidence: number;
  street_level: number;
  max_velocity: number;
  length: number;
  prediction_source: string;
  realtime_hotspot: string;
  realtime_speed_ratio: number;
  realtime_influence: number;
  realtime_severity: number;
};

type HotspotFeatureProperties = {
  id: string;
  name: string;
  description: string;
  radius_meters: number;
  severity: number;
  speed_ratio: number;
  delay_ratio: number;
  road_closure: boolean;
};

export const TrafficOverlay: React.FC<TrafficOverlayProps> = ({
  map,
  segments,
  timeSelection,
  hotspots: hotspotInput = [],
}) => {
  const segmentPopupRef = useRef<maplibregl.Popup | null>(null);
  const hotspotPopupRef = useRef<maplibregl.Popup | null>(null);
  const hoveredSegmentIdRef = useRef<number | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hotspotHoverFrameRef = useRef<number | null>(null);
  const { getCachedPrediction } = useTrafficPredictionCache();
  const hotspots = hotspotInput.length > 0 ? hotspotInput : getFallbackHotspots();

  const segmentsWithLOS = useMemo(() => {
    const hasAPILos = segments.length > 0 && segments.some((segment) => segment.los !== undefined);
    if (hasAPILos) {
      return segments.map((segment) => ({
        ...segment,
        los: segment.los || 'C',
        confidence: segment.confidence || 0.5,
      }));
    }

    return getCachedPrediction(segments, timeSelection, simulateLOSBatch);
  }, [segments, timeSelection, getCachedPrediction]);

  const geoJsonData = useMemo(
    () => segmentsToGeoJSON(segmentsWithLOS),
    [segmentsWithLOS],
  );
  const stats = useMemo(
    () => calculateStats(segmentsWithLOS),
    [segmentsWithLOS],
  );
  const isPrediction = timeSelection.type !== 'preset' || timeSelection.horizon !== 'now';

  const visibleHotspots = useMemo(() => {
    if (!map) return hotspots;

    const bounds = map.getBounds();
    return hotspots.filter((hotspot) => (
      hotspot.lat >= bounds.getSouth() - 0.02
      && hotspot.lat <= bounds.getNorth() + 0.02
      && hotspot.lng >= bounds.getWest() - 0.02
      && hotspot.lng <= bounds.getEast() + 0.02
    ));
  }, [hotspots, map]);

  const hotspotGeoJsonData = useMemo(
    () => hotspotsToGeoJSON(visibleHotspots),
    [visibleHotspots],
  );
  const hotspotRadiusGeoJsonData = useMemo(
    () => hotspotRadiusToGeoJSON(visibleHotspots),
    [visibleHotspots],
  );

  useEffect(() => {
    if (!map) return;

    if (!segmentPopupRef.current) {
      segmentPopupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '320px',
        offset: 12,
      });
    }

    if (!hotspotPopupRef.current) {
      hotspotPopupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: true,
        maxWidth: '320px',
        offset: 16,
      });
    }

    const runSegmentHover = (event: maplibregl.MapMouseEvent) => {
      if (!map.getLayer(LAYER_ID) || map.getZoom() < 15) {
        hoveredSegmentIdRef.current = null;
        segmentPopupRef.current?.remove();
        map.getCanvas().style.cursor = '';
        return;
      }

      const features = map.queryRenderedFeatures(event.point, {
        layers: [LAYER_ID],
      }) as MapGeoJSONFeature[];

      if (features.length === 0) {
        hoveredSegmentIdRef.current = null;
        segmentPopupRef.current?.remove();
        map.getCanvas().style.cursor = '';
        return;
      }

      const feature = features[0];
      const props = feature.properties as unknown as SegmentFeatureProperties;
      if (!props) return;

      const coordinates = (feature.geometry as GeoJSON.LineString).coordinates;
      const anchor = coordinates[Math.floor(coordinates.length / 2)] as [number, number];

      map.getCanvas().style.cursor = 'pointer';

      if (hoveredSegmentIdRef.current !== props.segment_id) {
        hoveredSegmentIdRef.current = props.segment_id;
        segmentPopupRef.current
          ?.setLngLat(anchor)
          .setHTML(buildSegmentPopupHtml(props))
          .addTo(map);
      } else {
        segmentPopupRef.current?.setLngLat(anchor);
      }
    };

    const onMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (hoverFrameRef.current != null) {
        cancelAnimationFrame(hoverFrameRef.current);
      }
      hoverFrameRef.current = requestAnimationFrame(() => {
        hoverFrameRef.current = null;
        runSegmentHover(event);
      });
    };

    const onMouseLeave = () => {
      hoveredSegmentIdRef.current = null;
      segmentPopupRef.current?.remove();
      map.getCanvas().style.cursor = '';
    };

    map.on('mousemove', onMouseMove);
    map.on('mouseout', onMouseLeave);

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('mouseout', onMouseLeave);
      if (hoverFrameRef.current != null) {
        cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = null;
      }
      segmentPopupRef.current?.remove();
      hotspotPopupRef.current?.remove();
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;

    const applySegments = () => {
      const existingSource = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;

      if (!existingSource) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: geoJsonData,
        });

        map.addLayer({
          id: LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': [
              'match',
              ['get', 'los'],
              'A', LOS_COLORS.A,
              'B', LOS_COLORS.B,
              'C', LOS_COLORS.C,
              'D', LOS_COLORS.D,
              'E', LOS_COLORS.E,
              'F', LOS_COLORS.F,
              LOS_COLORS.C,
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 2,
              13, 3,
              15, 5,
              17, 7,
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 0.65,
              13, 0.75,
              15, 0.9,
            ],
          },
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
        });

        map.addLayer({
          id: REALTIME_GLOW_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['>', ['get', 'realtime_influence'], 0],
          paint: {
            'line-color': '#a855f7',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 5,
              13, 8,
              15, 12,
              17, 16,
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['get', 'realtime_influence'],
              0, 0,
              0.2, 0.2,
              0.5, 0.35,
              1, 0.55,
            ],
            'line-blur': 1.2,
          },
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
        });

        map.addLayer({
          id: REALTIME_IMPACT_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['>', ['get', 'realtime_influence'], 0],
          paint: {
            'line-color': [
              'interpolate',
              ['linear'],
              ['get', 'realtime_influence'],
              0, '#c084fc',
              0.35, '#a855f7',
              0.7, '#7c3aed',
              1, '#6d28d9',
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 2.5,
              13, 3.5,
              15, 5.5,
              17, 7.5,
            ],
            'line-opacity': 0.95,
            'line-dasharray': [1.4, 1.2],
          },
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
        });
      } else {
        existingSource.setData(geoJsonData);
      }
    };

    if (map.isStyleLoaded()) {
      applySegments();
      return;
    }

    map.once('load', applySegments);
    return () => {
      map.off('load', applySegments);
    };
  }, [geoJsonData, map]);

  useEffect(() => {
    if (!map) return;

    const applyHotspots = () => {
      const existingHotspotSource = map.getSource(HOTSPOT_SOURCE_ID) as GeoJSONSource | undefined;
      const existingRadiusSource = map.getSource(HOTSPOT_RADIUS_SOURCE_ID) as GeoJSONSource | undefined;

      if (!existingRadiusSource) {
        map.addSource(HOTSPOT_RADIUS_SOURCE_ID, {
          type: 'geojson',
          data: hotspotRadiusGeoJsonData,
        });

        map.addLayer({
          id: HOTSPOT_RADIUS_FILL_LAYER_ID,
          type: 'fill',
          source: HOTSPOT_RADIUS_SOURCE_ID,
          paint: {
            'fill-color': [
              'step',
              ['get', 'severity'],
              '#cbd5e1',
              2, '#fde68a',
              4, '#fb923c',
              6, '#ef4444',
            ],
            'fill-opacity': [
              'case',
              ['>=', ['get', 'severity'], 2],
              0.12,
              0.04,
            ],
          },
        });

        map.addLayer({
          id: HOTSPOT_RADIUS_LINE_LAYER_ID,
          type: 'line',
          source: HOTSPOT_RADIUS_SOURCE_ID,
          paint: {
            'line-color': [
              'step',
              ['get', 'severity'],
              '#94a3b8',
              2, '#f59e0b',
              4, '#ea580c',
              6, '#dc2626',
            ],
            'line-width': 1.5,
            'line-opacity': [
              'case',
              ['>=', ['get', 'severity'], 2],
              0.55,
              0.25,
            ],
          },
        });
      } else {
        existingRadiusSource.setData(hotspotRadiusGeoJsonData);
      }

      if (!existingHotspotSource) {
        map.addSource(HOTSPOT_SOURCE_ID, {
          type: 'geojson',
          data: hotspotGeoJsonData,
        });

        map.addLayer({
          id: HOTSPOT_PULSE_LAYER_ID,
          type: 'circle',
          source: HOTSPOT_SOURCE_ID,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 10,
              13, 14,
              15, 18,
            ],
            'circle-color': [
              'step',
              ['get', 'severity'],
              '#94a3b8',
              2, '#fbbf24',
              4, '#fb923c',
              6, '#ef4444',
            ],
            'circle-opacity': [
              'case',
              ['>=', ['get', 'severity'], 2],
              0.18,
              0.08,
            ],
            'circle-blur': 0.9,
          },
        });

        map.addLayer({
          id: HOTSPOT_LAYER_ID,
          type: 'circle',
          source: HOTSPOT_SOURCE_ID,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 6,
              13, 9,
              15, 12,
            ],
            'circle-color': [
              'step',
              ['get', 'severity'],
              '#64748b',
              2, '#f59e0b',
              4, '#f97316',
              6, '#dc2626',
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': [
              'case',
              ['>=', ['get', 'severity'], 2],
              0.95,
              0.55,
            ],
          },
        });

        map.addLayer({
          id: HOTSPOT_LABEL_LAYER_ID,
          type: 'symbol',
          source: HOTSPOT_SOURCE_ID,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              11, 10,
              14, 11,
              16, 12,
            ],
            'text-font': ['Open Sans Semibold'],
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
          },
          paint: {
            'text-color': '#7c2d12',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-opacity': [
              'step',
              ['zoom'],
              0,
              12, [
                'case',
                ['>=', ['get', 'severity'], 2],
                0.95,
                0.55,
              ],
            ],
          },
        });
      } else {
        existingHotspotSource.setData(hotspotGeoJsonData);
      }
    };

    const showHotspotPopup = (feature: MapGeoJSONFeature) => {
      const props = feature.properties as unknown as HotspotFeatureProperties;
      if (!props) return;

      let anchor: [number, number] | null = null;

      if (feature.geometry.type === 'Point') {
        anchor = feature.geometry.coordinates as [number, number];
      } else if (feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0];
        if (ring && ring.length > 0) {
          anchor = ring[0] as [number, number];
        }
      }

      if (!anchor) return;

      hotspotPopupRef.current
        ?.setLngLat(anchor)
        .setHTML(buildHotspotPopupHtml(props))
        .addTo(map);
    };

    const getInteractiveHotspotLayerIds = () => {
      const layerIds = [HOTSPOT_LAYER_ID, HOTSPOT_RADIUS_FILL_LAYER_ID];
      return layerIds.filter((layerId) => Boolean(map.getLayer(layerId)));
    };

    const onHotspotClick = (event: maplibregl.MapMouseEvent) => {
      const interactiveLayerIds = getInteractiveHotspotLayerIds();
      if (interactiveLayerIds.length === 0) {
        return;
      }

      const feature = map.queryRenderedFeatures(event.point, {
        layers: interactiveLayerIds,
      })[0] as MapGeoJSONFeature | undefined;
      if (!feature) return;
      showHotspotPopup(feature);
    };

    const runHotspotMove = (event: maplibregl.MapMouseEvent) => {
      const interactiveLayerIds = getInteractiveHotspotLayerIds();
      if (interactiveLayerIds.length === 0) {
        map.getCanvas().style.cursor = '';
        return;
      }

      const hasHotspot = map.queryRenderedFeatures(event.point, {
        layers: interactiveLayerIds,
      }).length > 0;

      map.getCanvas().style.cursor = hasHotspot ? 'pointer' : '';
    };

    const onHotspotMove = (event: maplibregl.MapMouseEvent) => {
      if (hotspotHoverFrameRef.current != null) {
        cancelAnimationFrame(hotspotHoverFrameRef.current);
      }
      hotspotHoverFrameRef.current = requestAnimationFrame(() => {
        hotspotHoverFrameRef.current = null;
        runHotspotMove(event);
      });
    };

    const onHotspotMouseOut = () => {
      map.getCanvas().style.cursor = '';
    };

    if (map.isStyleLoaded()) {
      applyHotspots();
    } else {
      map.once('load', applyHotspots);
    }

    map.on('click', onHotspotClick);
    map.on('mousemove', onHotspotMove);
    map.on('mouseout', onHotspotMouseOut);

    return () => {
      map.off('click', onHotspotClick);
      map.off('mousemove', onHotspotMove);
      map.off('mouseout', onHotspotMouseOut);
      map.off('load', applyHotspots);
      if (hotspotHoverFrameRef.current != null) {
        cancelAnimationFrame(hotspotHoverFrameRef.current);
        hotspotHoverFrameRef.current = null;
      }
    };
  }, [hotspotGeoJsonData, hotspotRadiusGeoJsonData, map]);

  useEffect(() => {
    if (!map) return;

    return () => {
      segmentPopupRef.current?.remove();
      hotspotPopupRef.current?.remove();

      if (map.getLayer(HOTSPOT_LAYER_ID)) {
        map.removeLayer(HOTSPOT_LAYER_ID);
      }

      if (map.getLayer(HOTSPOT_PULSE_LAYER_ID)) {
        map.removeLayer(HOTSPOT_PULSE_LAYER_ID);
      }

      if (map.getLayer(HOTSPOT_LABEL_LAYER_ID)) {
        map.removeLayer(HOTSPOT_LABEL_LAYER_ID);
      }

      if (map.getLayer(HOTSPOT_RADIUS_LINE_LAYER_ID)) {
        map.removeLayer(HOTSPOT_RADIUS_LINE_LAYER_ID);
      }

      if (map.getLayer(HOTSPOT_RADIUS_FILL_LAYER_ID)) {
        map.removeLayer(HOTSPOT_RADIUS_FILL_LAYER_ID);
      }

      if (map.getLayer(LAYER_ID)) {
        map.removeLayer(LAYER_ID);
      }

      if (map.getLayer(REALTIME_IMPACT_LAYER_ID)) {
        map.removeLayer(REALTIME_IMPACT_LAYER_ID);
      }

      if (map.getLayer(REALTIME_GLOW_LAYER_ID)) {
        map.removeLayer(REALTIME_GLOW_LAYER_ID);
      }

      if (map.getSource(HOTSPOT_SOURCE_ID)) {
        map.removeSource(HOTSPOT_SOURCE_ID);
      }

      if (map.getSource(HOTSPOT_RADIUS_SOURCE_ID)) {
        map.removeSource(HOTSPOT_RADIUS_SOURCE_ID);
      }

      if (map.getSource(SOURCE_ID)) {
        map.removeSource(SOURCE_ID);
      }
    };
  }, [map]);

  const isMobile = useIsMobile();

  return (
    <>
      {isMobile ? (
        <MobileTrafficOverlay
          isPrediction={isPrediction}
          stats={stats}
          timeSelection={timeSelection}
          hotspots={visibleHotspots}
        />
      ) : (
        <>
          <LOSLegend isPrediction={isPrediction} />
          <StatsPanel stats={stats} timeSelection={timeSelection} />
        </>
      )}
    </>
  );
};

function segmentsToGeoJSON(
  segments: TrafficSegment[],
): GeoJSON.FeatureCollection<GeoJSON.LineString, SegmentFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: segments.map((segment) => {
      const los = segment.los || 'C';
      return {
        type: 'Feature',
        properties: {
          segment_id: segment.segment_id,
          street_name: segment.street_name,
          los,
          label: LOS_LABELS[los as keyof typeof LOS_LABELS],
          confidence: segment.confidence || 0.75,
          street_level: segment.street_level || 0,
          max_velocity: segment.max_velocity || 0,
          length: segment.length || 0,
          prediction_source: segment.prediction_source || 'heuristic',
          realtime_hotspot: segment.realtime_info?.hotspot_name || '',
          realtime_speed_ratio: segment.realtime_info?.speed_ratio || 0,
          realtime_influence: segment.realtime_info?.influence || 0,
          realtime_severity: segment.realtime_info?.severity || 0,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [segment.s_lng, segment.s_lat],
            [segment.e_lng, segment.e_lat],
          ],
        },
      };
    }),
  };
}

function hotspotsToGeoJSON(
  hotspots: TrafficHotspot[],
): GeoJSON.FeatureCollection<GeoJSON.Point, HotspotFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: hotspots.map((hotspot) => ({
      type: 'Feature',
      properties: {
        id: hotspot.id,
        name: hotspot.name,
        description: hotspot.description || '',
        radius_meters: hotspot.radius_meters,
        severity: hotspot.realtime?.severity || 0,
        speed_ratio: hotspot.realtime?.speed_ratio || 1,
        delay_ratio: hotspot.realtime?.delay_ratio || 1,
        road_closure: hotspot.realtime?.road_closure || false,
      },
      geometry: {
        type: 'Point',
        coordinates: [hotspot.lng, hotspot.lat],
      },
    })),
  };
}

function hotspotRadiusToGeoJSON(
  hotspots: TrafficHotspot[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon, HotspotFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: hotspots.map((hotspot) => ({
      type: 'Feature',
      properties: {
        id: hotspot.id,
        name: hotspot.name,
        description: hotspot.description || '',
        radius_meters: hotspot.radius_meters,
        severity: hotspot.realtime?.severity || 0,
        speed_ratio: hotspot.realtime?.speed_ratio || 1,
        delay_ratio: hotspot.realtime?.delay_ratio || 1,
        road_closure: hotspot.realtime?.road_closure || false,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [buildCircleRing(hotspot.lat, hotspot.lng, hotspot.radius_meters)],
      },
    })),
  };
}

function buildSegmentPopupHtml(props: SegmentFeatureProperties) {
  const sourceLabel = props.prediction_source === 'xgboost_realtime'
    ? 'XGBoost + Realtime'
    : props.prediction_source === 'xgboost'
      ? 'XGBoost'
      : 'Heuristic';

  const realtimeSection = props.realtime_hotspot
    ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb;">
        <div style="font-size: 11px; font-weight: 600; color: #7c3aed; margin-bottom: 3px;">Realtime Data</div>
        <div style="font-size: 11px; color: #6b7280;">Hotspot: ${props.realtime_hotspot}</div>
        <div style="font-size: 11px; color: #6b7280;">Speed / free flow: ${(props.realtime_speed_ratio * 100).toFixed(0)}%</div>
        <div style="font-size: 11px; color: #6b7280;">Influence: ${(props.realtime_influence * 100).toFixed(0)}%</div>
      </div>`
    : '';

  return `
    <div style="font-family: system-ui, sans-serif; padding: 4px 2px; min-width: 220px;">
      <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 4px;">${props.street_name}</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <div style="background: ${LOS_COLORS[props.los as keyof typeof LOS_COLORS]}; color: white; font-weight: 700; border-radius: 8px; padding: 4px 8px;">${props.los}</div>
        <div style="font-size: 14px; font-weight: 600;">${props.label}</div>
      </div>
      <div style="font-size: 12px; color: #4b5563; line-height: 1.6;">
        <div>Độ tin cậy: ${(props.confidence * 100).toFixed(0)}%</div>
        <div>Nguồn: ${sourceLabel}</div>
        <div>Cấp đường: ${props.street_level}</div>
        <div>Giới hạn tốc độ: ${props.max_velocity} km/h</div>
        <div>Chiều dài: ${Math.round(props.length)} m</div>
      </div>
      ${realtimeSection}
    </div>
  `;
}

function buildHotspotPopupHtml(props: HotspotFeatureProperties) {
  return `
    <div style="font-family: system-ui, sans-serif; padding: 4px 2px; min-width: 240px;">
      <div style="font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 4px;">${props.name}</div>
      <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">${props.description}</div>
      <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 4px 8px; border-radius: 999px; background: #fff7ed; color: #c2410c; font-size: 11px; font-weight: 700;">
        ${getHotspotSeverityLabel(props.severity)}
      </div>
      <div style="font-size: 12px; color: #4b5563; line-height: 1.7;">
        <div>Bán kính: ${Math.round(props.radius_meters)} m</div>
        <div>Tốc độ / lưu thông tự do: ${(props.speed_ratio * 100).toFixed(0)}%</div>
        <div>Tỷ lệ chậm trễ: ${props.delay_ratio.toFixed(2)}x</div>
        <div>Đóng đường: ${props.road_closure ? 'Có' : 'Không'}</div>
      </div>
    </div>
  `;
}

function simulateLOSBatch(
  segments: TrafficSegment[],
  timeSelection: TimeSelection,
): TrafficSegment[] {
  let targetTime: Date;
  let targetWeekday: number;

  if (timeSelection.type === 'preset') {
    const now = new Date();
    const horizon = timeSelection.horizon || 'now';
    const offsetMinutes = horizon === 'now' ? 0 : parseInt(horizon.slice(1), 10);
    targetTime = new Date(now.getTime() + offsetMinutes * 60 * 1000);
    targetWeekday = timeSelection.weekday !== undefined
      ? timeSelection.weekday
      : targetTime.getDay();
  } else {
    targetTime = timeSelection.customTime || new Date();
    targetWeekday = timeSelection.weekday !== undefined
      ? timeSelection.weekday
      : targetTime.getDay();
  }

  const hour = targetTime.getHours();
  const weekday = targetWeekday;
  const isWeekend = weekday === 0 || weekday === 6;
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const isNight = hour >= 22 || hour <= 6;

  return segments.map((segment) => {
    let los: string;
    let confidence: number;
    const isMajorRoad = segment.street_level === 1;

    if (isNight) {
      los = 'A';
      confidence = 0.9;
    } else if (isWeekend) {
      if (hour >= 8 && hour <= 20) {
        los = Math.random() > 0.4 ? 'B' : 'C';
        confidence = 0.75;
      } else {
        los = 'A';
        confidence = 0.85;
      }
    } else if (isRushHour) {
      if (isMajorRoad) {
        const rand = Math.random();
        if (rand < 0.4) {
          los = 'E';
          confidence = 0.75;
        } else if (rand < 0.7) {
          los = 'D';
          confidence = 0.7;
        } else {
          los = 'C';
          confidence = 0.65;
        }
      } else {
        los = Math.random() > 0.5 ? 'C' : 'D';
        confidence = 0.7;
      }
    } else {
      los = Math.random() > 0.5 ? 'B' : 'C';
      confidence = 0.75;
    }

    return { ...segment, los, confidence };
  });
}

function calculateStats(segments: TrafficSegment[]) {
  const losCounts: Record<string, number> = {};
  segments.forEach((segment) => {
    const los = segment.los || 'C';
    losCounts[los] = (losCounts[los] || 0) + 1;
  });

  const total = segments.length;
  const congested = (losCounts.E || 0) + (losCounts.F || 0);
  const congestedPercent = total > 0 ? ((congested / total) * 100).toFixed(1) : '0';
  const realtimeAdjusted = segments.filter((segment) => (
    segment.prediction_source === 'xgboost_realtime'
    || (segment.realtime_info?.influence || 0) > 0
  )).length;
  const realtimeSources = new Set(
    segments
      .filter((segment) => segment.realtime_info)
      .map((segment) => segment.realtime_info!.hotspot_name),
  );

  return {
    total,
    losCounts,
    congested,
    congestedPercent,
    realtimeAdjusted,
    realtimeHotspotCount: realtimeSources.size,
    realtimeHotspots: Array.from(realtimeSources),
  };
}

function buildCircleRing(lat: number, lng: number, radiusMeters: number): [number, number][] {
  const points = 48;
  const ring: [number, number][] = [];
  const latRadians = lat * Math.PI / 180;
  const latMeters = 111320;
  const lngMeters = Math.max(111320 * Math.cos(latRadians), 1);

  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const dx = Math.cos(angle) * radiusMeters;
    const dy = Math.sin(angle) * radiusMeters;
    ring.push([
      lng + dx / lngMeters,
      lat + dy / latMeters,
    ]);
  }

  return ring;
}

function getHotspotSeverityLabel(severity: number) {
  if (severity >= 6) return 'Điểm nóng nghiêm trọng';
  if (severity >= 4) return 'Ùn tắc realtime cao';
  if (severity >= 2) return 'Điểm nóng mức vừa';
  return 'Điểm nóng đang theo dõi';
}

function getFallbackHotspots(): TrafficHotspot[] {
  return [
    {
      id: 'fallback-1',
      name: 'Nga sau Cong Hoa',
      lat: 10.8012,
      lng: 106.6528,
      radius_meters: 260,
      description: 'Điểm nóng dự phòng',
      realtime: {
        current_speed: 18,
        free_flow_speed: 32,
        speed_ratio: 0.56,
        current_travel_time: 154,
        free_flow_travel_time: 92,
        delay_ratio: 1.67,
        confidence: 0.72,
        road_closure: false,
        severity: 3,
      },
    },
    {
      id: 'fallback-2',
      name: 'Cau Sai Gon',
      lat: 10.7941,
      lng: 106.7219,
      radius_meters: 320,
      description: 'Điểm nóng dự phòng',
      realtime: {
        current_speed: 24,
        free_flow_speed: 38,
        speed_ratio: 0.63,
        current_travel_time: 168,
        free_flow_travel_time: 113,
        delay_ratio: 1.49,
        confidence: 0.76,
        road_closure: false,
        severity: 2,
      },
    },
    {
      id: 'fallback-3',
      name: 'Vo Van Kiet - Ham Thu Thiem',
      lat: 10.7643,
      lng: 106.7054,
      radius_meters: 280,
      description: 'Điểm nóng dự phòng',
      realtime: {
        current_speed: 31,
        free_flow_speed: 42,
        speed_ratio: 0.74,
        current_travel_time: 140,
        free_flow_travel_time: 108,
        delay_ratio: 1.3,
        confidence: 0.7,
        road_closure: false,
        severity: 1,
      },
    },
  ];
}

const LOSLegend: React.FC<{ isPrediction?: boolean }> = ({ isPrediction = false }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 10,
        background: 'white',
        padding: '16px',
        borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        zIndex: 1000,
        fontSize: 13,
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
        {isPrediction ? 'LOS dự báo' : 'LOS hiện tại'}
      </div>

      {Object.entries(LOS_COLORS).map(([los, color]) => (
        <div
          key={los}
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 10,
            gap: 10,
          }}
        >
          <div
            style={{
              width: 24,
              height: 8,
              background: color,
              borderRadius: 999,
              boxShadow: `0 0 8px ${color}55`,
            }}
          />
          <span>
            <strong style={{ color }}>{los}</strong> - {LOS_LABELS[los as keyof typeof LOS_LABELS]}
          </span>
        </div>
      ))}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 24, height: 8, borderRadius: 999, background: '#7c3aed', boxShadow: '0 0 12px rgba(124,58,237,0.55)' }} />
          <span>
            <strong style={{ color: '#7c3aed' }}>Realtime</strong> - đoạn đường bị API realtime điều chỉnh
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f97316', boxShadow: '0 0 0 6px rgba(249,115,22,0.18)' }} />
          <span>Hotspot đậm màu hơn khi mức độ nghiêm trọng cao</span>
        </div>
      </div>
    </div>
  );
};

const StatsPanel: React.FC<{
  stats: ReturnType<typeof calculateStats>;
  timeSelection: TimeSelection;
}> = ({ stats, timeSelection }) => {
  const getTimeLabel = () => {
    if (timeSelection.type === 'preset') {
      const horizon = timeSelection.horizon || 'now';
      if (horizon === 'now') return 'Hiện tại';
      return `+${horizon.slice(1)} phút`;
    }

    return timeSelection.customTime?.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) || 'Custom';
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        left: 10,
        background: 'white',
        padding: '18px',
        borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        zIndex: 1000,
        minWidth: 240,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Thống kê giao thông</div>

      <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 500 }}>Thời gian</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>{getTimeLabel()}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Đoạn đường hiển thị</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1976d2' }}>
            {stats.total.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Đang kẹt</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
            {stats.congested.toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
        Tỷ lệ kẹt xe: <strong>{stats.congestedPercent}%</strong>
      </div>

      {stats.realtimeAdjusted > 0 && (
        <div style={{ padding: '8px 12px', background: '#f0e6ff', borderRadius: 8, marginBottom: 14, borderLeft: '3px solid #7c3aed' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>Điều chỉnh realtime</div>
          <div style={{ fontSize: 12, color: '#4b5563' }}>
            Đoạn đường được điều chỉnh: <strong>{stats.realtimeAdjusted}</strong>
          </div>
          <div style={{ fontSize: 12, color: '#4b5563' }}>
            Hotspot đang hoạt động: <strong>{stats.realtimeHotspotCount}</strong>
            {stats.realtimeHotspots.length > 0 && (
              <span style={{ fontSize: 11, color: '#9ca3af' }}> ({stats.realtimeHotspots.join(', ')})</span>
            )}
          </div>
        </div>
      )}

      {['A', 'B', 'C', 'D', 'E', 'F'].map((los) => {
        const count = stats.losCounts[los] || 0;
        const percent = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0';

        return (
          <div key={los} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ width: 24, fontWeight: 700, color: LOS_COLORS[los as keyof typeof LOS_COLORS] }}>
              {los}
            </span>
            <div style={{ flex: 1, margin: '0 10px', height: 8, background: '#f3f4f6', borderRadius: 4 }}>
              <div
                style={{
                  width: `${percent}%`,
                  height: '100%',
                  background: LOS_COLORS[los as keyof typeof LOS_COLORS],
                  borderRadius: 4,
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: '#6b7280', width: 50, textAlign: 'right' }}>
              {percent}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

const MobileTrafficOverlay: React.FC<{
  isPrediction: boolean;
  stats: ReturnType<typeof calculateStats>;
  timeSelection: TimeSelection;
  hotspots: TrafficHotspot[];
}> = ({ isPrediction, stats, timeSelection, hotspots }) => {
  const [open, setOpen] = useState(false);
  const activeHotspots = hotspots.filter((hotspot) => (hotspot.realtime?.severity || 0) >= 2);

  const getTimeLabel = () => {
    if (timeSelection.type === 'preset') {
      const horizon = timeSelection.horizon || 'now';
      if (horizon === 'now') return 'Hiện tại';
      return `+${horizon.slice(1)} phút`;
    }
    return timeSelection.customTime?.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) || '';
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          position: 'absolute',
          top: 70,
          left: 10,
          zIndex: 1100,
          width: 40,
          height: 40,
          borderRadius: 12,
          border: 'none',
          background: open ? '#1976d2' : 'white',
          color: open ? 'white' : '#1976d2',
          fontSize: 18,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        &#9776;
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 118,
            left: 10,
            right: 10,
            zIndex: 1100,
            background: 'white',
            padding: 14,
            borderRadius: 14,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
            {isPrediction ? 'LOS dự báo' : 'LOS hiện tại'}
          </div>

          {Object.entries(LOS_COLORS).map(([los, color]) => (
            <div key={los} style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8 }}>
              <div style={{ width: 20, height: 6, background: color, borderRadius: 999 }} />
              <span style={{ fontSize: 12 }}>
                <strong style={{ color }}>{los}</strong> - {LOS_LABELS[los as keyof typeof LOS_LABELS]}
              </span>
            </div>
          ))}

          <div style={{ borderTop: '1px solid #e5e7eb', margin: '10px 0' }} />

          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Thống kê giao thông</div>
          <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>Thời gian</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{getTimeLabel()}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Đoạn đường hiển thị</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1976d2' }}>{stats.total.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Đang kẹt</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{stats.congested.toLocaleString()}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            Tỷ lệ kẹt xe: <strong>{stats.congestedPercent}%</strong>
          </div>

          {stats.realtimeAdjusted > 0 && (
            <div style={{ padding: '10px 12px', background: '#f0e6ff', borderRadius: 10, marginBottom: 10, borderLeft: '3px solid #7c3aed' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>Điều chỉnh realtime</div>
              <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 2 }}>
                Đoạn đường được điều chỉnh: <strong>{stats.realtimeAdjusted}</strong>
              </div>
              <div style={{ fontSize: 12, color: '#4b5563' }}>
                Hotspot đang hoạt động: <strong>{activeHotspots.length}</strong>
              </div>
            </div>
          )}

          {['A', 'B', 'C', 'D', 'E', 'F'].map((los) => {
            const count = stats.losCounts[los] || 0;
            const percent = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0';
            return (
              <div key={los} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ width: 20, fontWeight: 700, color: LOS_COLORS[los as keyof typeof LOS_COLORS], fontSize: 12 }}>{los}</span>
                <div style={{ flex: 1, margin: '0 8px', height: 6, background: '#f3f4f6', borderRadius: 4 }}>
                  <div style={{ width: `${percent}%`, height: '100%', background: LOS_COLORS[los as keyof typeof LOS_COLORS], borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 11, color: '#6b7280', width: 40, textAlign: 'right' }}>{percent}%</span>
              </div>
            );
          })}

          {activeHotspots.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid #e5e7eb', margin: '10px 0' }} />
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Hotspot trong tầm nhìn</div>
              {activeHotspots.slice(0, 4).map((hotspot) => (
                <div
                  key={hotspot.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#9a3412', marginBottom: 2 }}>
                    {hotspot.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#7c2d12' }}>
                    Mức độ {hotspot.realtime?.severity || 0} · Tốc độ {(100 * (hotspot.realtime?.speed_ratio || 1)).toFixed(0)}%
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
};

export default TrafficOverlay;
