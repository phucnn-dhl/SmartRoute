'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import MapView from '@/components/Map';
import { useIsMobile } from '@/hooks/useIsMobile';
import RouteLayer from '@/components/RouteLayer';
import RouteSummaryPanel from '@/components/RouteSummaryPanel';
import { SearchBox, SearchLocationMarker } from '@/components/SearchBox';
import type { LonLat, RoutePoint } from '@/components/SearchBox';
import TrafficOverlay from '@/components/TrafficOverlay';
import TimePicker, { TimeSelection } from '@/components/TimePicker';
import { useMapPicking, useRouteState, useTrafficSegments } from '@/lib';

export default function Home() {
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [error] = useState<string | null>(null);
  const [timeSelection, setTimeSelection] = useState<TimeSelection>({ type: 'preset', horizon: 'now' });
  const [mapCenter, setMapCenter] = useState<[number, number]>([106.6922, 10.7769]);
  const isMobile = useIsMobile();
  const [searchLocation, setSearchLocation] = useState<{ coords: LonLat; label: string } | null>(null);
  const [routeDestination, setRouteDestination] = useState<RoutePoint | null>(null);
  const [pendingRouteRequest, setPendingRouteRequest] = useState(false);
  const mapInitialized = useRef(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const viewportSetupRef = useRef(false);

  const {
    segments,
    loading,
    loadByBounds,
    loadedCount,
    updateZoom,
  } = useTrafficSegments(map, timeSelection, { minZoomForDetails: 14 });
  const {
    origin,
    destination,
    route,
    predictionAnalysis,
    departureRecommendation,
    routeLoading,
    recommendationLoading,
    routeError,
    setPoint,
    requestRoute,
    clearRoute,
  } = useRouteState();

  useMapPicking({
    map,
    pickingMode: null,
    onPick: setPoint,
  });

  const handleMapLoad = (mapInstance: maplibregl.Map) => {
    setMap(mapInstance);
    mapRef.current = mapInstance;
    mapInitialized.current = true;

    mapInstance.fitBounds(
      [
        [106.6, 10.7],
        [106.8, 10.9],
      ],
      { padding: 50, duration: 1000 }
    );

    updateZoom(mapInstance.getZoom());

    mapInstance.on('moveend', () => {
      const c = mapInstance.getCenter();
      setMapCenter([c.lng, c.lat]);
    });
  };

  useEffect(() => {
    if (!map || !mapInitialized.current || viewportSetupRef.current) return;

    const mapInstance = map;
    viewportSetupRef.current = true;
    let debounceTimer: NodeJS.Timeout | null = null;

    const requestViewportSegments = (force = false) => {
      const zoom = mapInstance.getZoom();
      updateZoom(zoom);

      const bounds = mapInstance.getBounds();
      const boundsArray: maplibregl.LngLatBoundsLike = [
        [bounds.getSouthWest().lng, bounds.getSouthWest().lat],
        [bounds.getNorthEast().lng, bounds.getNorthEast().lat],
      ];

      loadByBounds(boundsArray, zoom, force);
    };

    const onMoveEnd = () => {
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        requestViewportSegments();
      }, 250);
    };

    mapInstance.on('moveend', onMoveEnd);
    mapInstance.on('zoomend', onMoveEnd);

    const initialLoadTimer = setTimeout(() => {
      requestViewportSegments(true);
    }, 1000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(initialLoadTimer);
      mapInstance.off('moveend', onMoveEnd);
      mapInstance.off('zoomend', onMoveEnd);
    };
  }, [map, loadByBounds, updateZoom]);

  const isPrediction = timeSelection.type !== 'preset' || timeSelection.horizon !== 'now';
  const departureOffsetMinutes =
    timeSelection.type === 'preset'
      ? timeSelection.horizon === '+15'
        ? 15
        : timeSelection.horizon === '+30'
          ? 30
          : timeSelection.horizon === '+60'
            ? 60
            : 0
      : getNearestDepartureOffsetMinutes(timeSelection.customTime);

  const targetHour = useMemo(() => {
    if (timeSelection.type === 'preset') {
      const now = new Date();
      const horizon = timeSelection.horizon || 'now';
      const offset = horizon === 'now' ? 0 : parseInt(horizon.slice(1), 10);
      return new Date(now.getTime() + offset * 60 * 1000).getHours();
    }
    return timeSelection.customTime?.getHours();
  }, [timeSelection]);

  const targetWeekday = useMemo(() => {
    // If weekday is explicitly selected in TimePicker, use that
    if (timeSelection.weekday !== undefined) {
      return timeSelection.weekday;
    }

    // Otherwise, calculate from timeSelection
    if (timeSelection.type === 'preset') {
      const now = new Date();
      const horizon = timeSelection.horizon || 'now';
      const offset = horizon === 'now' ? 0 : parseInt(horizon.slice(1), 10);
      return new Date(now.getTime() + offset * 60 * 1000).getDay();
    }
    return timeSelection.customTime?.getDay();
  }, [timeSelection]);

  useEffect(() => {
    if (!pendingRouteRequest || !origin || !destination) {
      return;
    }

    setPendingRouteRequest(false);
    void requestRoute({ departureOffsetMinutes, targetHour, targetWeekday });
  }, [
    pendingRouteRequest,
    origin,
    destination,
    requestRoute,
    departureOffsetMinutes,
    targetHour,
    targetWeekday,
  ]);

  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 60,
          background: isPrediction
            ? 'linear-gradient(135deg, #7c4dff 0%, #651fff 100%)'
            : 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 2000,
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          transition: 'background 0.3s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>SmartRoute</h1>
            {!isMobile && (
              <p style={{ fontSize: 13, opacity: 0.9, margin: '2px 0 0 0' }}>
                Dự báo giao thông theo khung nhìn cho TP.HCM
              </p>
            )}
          </div>
          {isPrediction && (
            <div
              style={{
                padding: '6px 12px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                backdropFilter: 'blur(10px)',
              }}
            >
              Chế độ dự báo
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 20,
              fontSize: isMobile ? 11 : 13,
              fontWeight: 600,
              backdropFilter: 'blur(10px)',
            }}
          >
            {loadedCount.toLocaleString()} đoạn đường
          </div>
        </div>
      </div>

      {!error && (
        <div style={{
          position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 2100,
          width: 'min(560px, calc(100vw - 32px))',
        }}>
          <SearchBox
            mapCenter={mapCenter}
            onSelect={(coords, label) => {
              setSearchLocation({ coords, label });
              mapRef.current?.flyTo({ center: coords, zoom: 15, duration: 1000 });
            }}
            onRoute={(origin, dest) => {
              setPoint('origin', origin.coords);
              setPoint('destination', dest.coords);
              setRouteDestination(null);
              setPendingRouteRequest(true);
              mapRef.current?.fitBounds(
                [
                  [Math.min(origin.coords[0], dest.coords[0]) - 0.005, Math.min(origin.coords[1], dest.coords[1]) - 0.005],
                  [Math.max(origin.coords[0], dest.coords[0]) + 0.005, Math.max(origin.coords[1], dest.coords[1]) + 0.005],
                ],
                { padding: 80, duration: 800 }
              );
            }}
            routeDestination={routeDestination}
            onCancelRoute={() => {
              setPendingRouteRequest(false);
              setRouteDestination(null);
              clearRoute();
            }}
            onClearRoute={() => {
              setPendingRouteRequest(false);
              setRouteDestination(null);
              clearRoute();
            }}
            routeLoading={routeLoading}
          />
        </div>
      )}

      {loading && segments.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: '4px solid #e0e0e0',
              borderTop: '4px solid #1976d2',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: 16,
            }}
          />
          <div style={{ fontSize: 16, fontWeight: 600 }}>Đang tải dữ liệu bản đồ...</div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {loading && segments.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            right: 10,
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '10px 16px',
            borderRadius: 10,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              border: '2px solid #e0e0e0',
              borderTop: '2px solid #1976d2',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          Đang làm mới dữ liệu...
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ef4444',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 8,
            zIndex: 2000,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      <MapView onMapLoad={handleMapLoad} />

      {map && segments.length > 0 && (
        <TrafficOverlay map={map} segments={segments} timeSelection={timeSelection} />
      )}

      {map && searchLocation && (
        <SearchLocationMarker
          map={map}
          coords={searchLocation.coords}
          label={searchLocation.label}
          segments={segments}
          onRouteHere={() => {
            setRouteDestination({ coords: searchLocation.coords, label: searchLocation.label });
            setSearchLocation(null);
          }}
          onClose={() => setSearchLocation(null)}
        />
      )}

      {map && (
        <RouteLayer
          map={map}
          origin={origin}
          destination={destination}
          route={route}
          predictionAnalysis={predictionAnalysis}
        />
      )}

      {!error && <TimePicker value={timeSelection} onChange={setTimeSelection} collapsed={!!route && isMobile} />}

      {!error && (
        <RouteSummaryPanel
          route={route}
          predictionAnalysis={predictionAnalysis}
          departureRecommendation={departureRecommendation}
          recommendationLoading={recommendationLoading}
          routeError={routeError}
          pickingMode={null}
        />
      )}
    </main>
  );
}

function getNearestDepartureOffsetMinutes(customTime?: Date) {
  if (!customTime) {
    return 0;
  }

  const diffMinutes = Math.max(0, Math.round((customTime.getTime() - Date.now()) / 60000));
  const supportedOffsets = [0, 15, 30, 60] as const;

  return supportedOffsets.reduce((closest, candidate) => {
    return Math.abs(candidate - diffMinutes) < Math.abs(closest - diffMinutes)
      ? candidate
      : closest;
  }, 0 as (typeof supportedOffsets)[number]);
}
