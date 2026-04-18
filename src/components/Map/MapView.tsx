'use client';

/**
 * MapView - Simplified MapLibre GL map component
 *
 * A clean, beautiful map component for traffic visualization
 */

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';

interface MapViewProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  children?: React.ReactNode;
  onMapLoad?: (map: maplibregl.Map) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  initialCenter = [106.6922, 10.7769], // HCMC center
  initialZoom = 12,
  children,
  onMapLoad,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize map
    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-raster',
            type: 'raster',
            source: 'osm-raster',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 8,
      maxZoom: 18,
    });

    // Add navigation controls
    mapInstance.addControl(new maplibregl.NavigationControl({
      showCompass: false,
      showZoom: true,
    }), 'top-right');

    mapInstance.on('load', () => {
      map.current = mapInstance;
      setMapLoaded(true);
      onMapLoad?.(mapInstance);
    });

    return () => {
      mapInstance.remove();
      map.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapContainer}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      {mapLoaded && children}
    </div>
  );
};

export default MapView;
