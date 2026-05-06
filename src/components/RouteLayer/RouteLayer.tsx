'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource } from 'maplibre-gl';
import { CongestedSegment, Coordinate, PredictionAnalysis, RankedRoute, RouteData } from '@/lib/routing';

const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_CASING_LAYER_ID = 'route-line-casing';
const ROUTE_LAYER_ID = 'route-line';
const CONGESTION_SOURCE_ID = 'route-congestion-source';
const CONGESTION_LAYER_ID = 'route-congestion-layer';
const TRAFFIC_LAYER_ID = 'traffic-segments-layer';

interface RouteLayerProps {
  map: maplibregl.Map | null;
  origin: Coordinate | null;
  destination: Coordinate | null;
  route: RouteData | null;
  predictionAnalysis: PredictionAnalysis | null;
  alternativeRoutes?: RankedRoute[];
  selectedRouteId?: string | null;
  onSelectRoute?: (id: string) => void;
}

export const RouteLayer: React.FC<RouteLayerProps> = ({
  map,
  origin,
  destination,
  route,
  predictionAnalysis,
  alternativeRoutes = [],
  selectedRouteId = null,
  onSelectRoute,
}) => {
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destinationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const debugMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fittedRouteRef = useRef<string | null>(null);
  const [routeScreenPath, setRouteScreenPath] = useState('');
  const [altScreenPaths, setAltScreenPaths] = useState<{ id: string; path: string }[]>([]);
  const [congestionScreenPaths, setCongestionScreenPaths] = useState<string[]>([]);

  const unselectedRoutes = alternativeRoutes.filter(
    (r) => r.id !== selectedRouteId && r.route.geometry,
  );

  // Origin/destination markers
  useEffect(() => {
    if (!map) return;

    if (!originMarkerRef.current) {
      originMarkerRef.current = new maplibregl.Marker({ color: '#16a34a' });
    }

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new maplibregl.Marker({ color: '#dc2626' });
    }

    if (origin) {
      originMarkerRef.current.setLngLat(origin).addTo(map);
    } else {
      originMarkerRef.current.remove();
    }

    if (destination) {
      destinationMarkerRef.current.setLngLat(destination).addTo(map);
    } else {
      destinationMarkerRef.current.remove();
    }
  }, [destination, map, origin]);

  // Route layers (mapbox layers + click handler)
  useEffect(() => {
    if (!map) return;

    const applyRoute = () => {
      debugMarkersRef.current.forEach((marker) => marker.remove());
      debugMarkersRef.current = [];

      destroyRouteLayers(map);

      if (!route && unselectedRoutes.length === 0) {
        fittedRouteRef.current = null;
        return;
      }

      // Draw unselected alternative routes as faint lines
      unselectedRoutes.forEach((alt, index) => {
        const sourceId = `alt-route-source-${index}`;
        const layerId = `alt-route-line-${index}`;

        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { routeId: alt.id },
                geometry: alt.route.geometry,
              },
            ],
          },
        });

        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#94a3b8',
            'line-width': 5,
            'line-opacity': 0.45,
          },
        });

        // Click handler for alternative route selection
        if (onSelectRoute) {
          map.on('click', layerId, () => {
            onSelectRoute(alt.id);
          });
          map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
          });
        }
      });

      // Draw selected route
      if (route) {
        const featureCollection: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: route.geometry,
            },
          ],
        };

        map.addSource(ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: featureCollection,
          lineMetrics: true,
        });

        map.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 12,
            'line-opacity': 1,
          },
        });

        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#0047ff',
            'line-width': 8,
            'line-opacity': 1,
          },
        });

        route.geometry.coordinates.slice(0, 2).forEach((coordinate, index) => {
          const el = document.createElement('div');
          el.style.width = '12px';
          el.style.height = '12px';
          el.style.borderRadius = '999px';
          el.style.background = index === 0 ? '#0047ff' : '#7c3aed';
          el.style.border = '2px solid white';
          el.style.boxShadow = '0 0 0 2px rgba(15, 23, 42, 0.15)';
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat(coordinate as [number, number])
            .addTo(map);
          debugMarkersRef.current.push(marker);
        });

        // Congestion overlay (selected route only)
        const congestionFeatures: GeoJSON.Feature<GeoJSON.LineString, { los: string; delaySeconds: number }>[] =
          (predictionAnalysis?.congestedSegments || [])
            .filter(hasGeometry)
            .map((segment) => ({
              type: 'Feature',
              properties: {
                los: segment.los || 'D',
                delaySeconds: segment.delaySeconds || 0,
              },
              geometry: segment.geometry,
            }));

        if (congestionFeatures.length > 0) {
          map.addSource(CONGESTION_SOURCE_ID, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: congestionFeatures,
            },
          });

          map.addLayer({
            id: CONGESTION_LAYER_ID,
            type: 'line',
            source: CONGESTION_SOURCE_ID,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': [
                'match',
                ['get', 'los'],
                'F', '#7f1d1d',
                'E', '#dc2626',
                'D', '#f97316',
                '#f97316',
              ],
              'line-width': 7,
              'line-opacity': 0.92,
              'line-dasharray': [1, 1.5],
            },
          });
        }
      }

      liftRouteLayers(map);

      // Fit bounds to encompass all routes
      const routesToFit = [
        ...(route ? [route] : []),
        ...unselectedRoutes.map((r) => r.route),
      ];

      if (routesToFit.length > 0) {
        const allCoords = routesToFit.flatMap((r) => r.geometry.coordinates);
        if (allCoords.length > 0) {
          const [first, ...rest] = allCoords;
          const bounds = new maplibregl.LngLatBounds(
            first as [number, number],
            first as [number, number],
          );
          rest.forEach((c) => bounds.extend(c as [number, number]));

          const boundsKey = bounds.toString();
          if (fittedRouteRef.current !== boundsKey) {
            map.fitBounds(bounds, {
              padding: { top: 170, right: 60, bottom: 140, left: 60 },
              duration: 800,
            });
            fittedRouteRef.current = boundsKey;
          }
        }
      }
    };

    if (map.isStyleLoaded()) {
      applyRoute();
      return;
    }

    map.once('load', applyRoute);
    return () => {
      map.off('load', applyRoute);
    };
  }, [map, predictionAnalysis, route, unselectedRoutes, onSelectRoute]);

  // SVG path projection for selected route
  useEffect(() => {
    if (!map) return;

    const updateProjectedPaths = () => {
      if (!route) {
        setRouteScreenPath('');
        setCongestionScreenPaths([]);
      } else {
        setRouteScreenPath(projectPath(map, route.geometry.coordinates));
        setCongestionScreenPaths(
          (predictionAnalysis?.congestedSegments || [])
            .filter(hasGeometry)
            .map((segment) => projectPath(map, segment.geometry.coordinates))
            .filter(Boolean),
        );
      }

      setAltScreenPaths(
        unselectedRoutes.map((alt) => ({
          id: alt.id,
          path: projectPath(map, alt.route.geometry.coordinates),
        })).filter((p) => p.path),
      );
    };

    updateProjectedPaths();
    map.on('move', updateProjectedPaths);
    map.on('zoom', updateProjectedPaths);
    map.on('resize', updateProjectedPaths);

    return () => {
      map.off('move', updateProjectedPaths);
      map.off('zoom', updateProjectedPaths);
      map.off('resize', updateProjectedPaths);
    };
  }, [map, predictionAnalysis, route, unselectedRoutes]);

  useEffect(() => {
    return () => {
      originMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      debugMarkersRef.current.forEach((marker) => marker.remove());
    };
  }, []);

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 950,
        overflow: 'visible',
      }}
    >
      {/* Unselected alternative routes */}
      {altScreenPaths.map((alt) => (
        <path
          key={alt.id}
          d={alt.path}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.4}
        />
      ))}

      {/* Selected route */}
      {routeScreenPath && (
        <>
          <path
            d={routeScreenPath}
            fill="none"
            stroke="#ffffff"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={routeScreenPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {congestionScreenPaths.map((path, index) => (
        <g key={`${path}-${index}`}>
          <path
            d={path}
            fill="none"
            stroke="rgba(15, 23, 42, 0.28)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={path}
            fill="none"
            stroke="#d946ef"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="10 7"
          />
        </g>
      ))}
    </svg>
  );
};

function hasGeometry(segment: CongestedSegment): segment is CongestedSegment & { geometry: GeoJSON.LineString } {
  return Boolean(segment.geometry);
}

function projectPath(map: maplibregl.Map, coordinates: GeoJSON.Position[]) {
  if (!coordinates.length) {
    return '';
  }

  return coordinates
    .map((coordinate, index) => {
      const projected = map.project(coordinate as [number, number]);
      return `${index === 0 ? 'M' : 'L'} ${projected.x} ${projected.y}`;
    })
    .join(' ');
}

export default RouteLayer;

function destroyRouteLayers(map: maplibregl.Map) {
  // Remove dynamic alternative route layers (up to 5 to be safe)
  for (let i = 0; i < 5; i++) {
    const layerId = `alt-route-line-${i}`;
    const sourceId = `alt-route-source-${i}`;
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }

  if (map.getLayer(CONGESTION_LAYER_ID)) map.removeLayer(CONGESTION_LAYER_ID);
  if (map.getSource(CONGESTION_SOURCE_ID)) map.removeSource(CONGESTION_SOURCE_ID);
  if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
  if (map.getLayer(ROUTE_CASING_LAYER_ID)) map.removeLayer(ROUTE_CASING_LAYER_ID);
  if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
}

function liftRouteLayers(map: maplibregl.Map) {
  // Lift alternative route layers first (they go under the selected route)
  for (let i = 0; i < 5; i++) {
    const layerId = `alt-route-line-${i}`;
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  }

  if (map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.moveLayer(ROUTE_CASING_LAYER_ID);
  }

  if (map.getLayer(ROUTE_LAYER_ID)) {
    map.moveLayer(ROUTE_LAYER_ID);
  }

  if (map.getLayer(CONGESTION_LAYER_ID)) {
    map.moveLayer(CONGESTION_LAYER_ID);
  }

  if (map.getLayer(TRAFFIC_LAYER_ID) && map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.moveLayer(TRAFFIC_LAYER_ID, ROUTE_CASING_LAYER_ID);
  }
}
