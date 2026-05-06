'use client';

import React, { useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { TrafficHotspot } from '@/components/TrafficOverlay';

type HotspotRealtimeInfo = {
  severity?: number;
  speed_ratio: number;
  delay_ratio: number;
  road_closure: boolean;
};

interface HotspotInspectorProps {
  map: maplibregl.Map | null;
  hotspots?: TrafficHotspot[];
  loading?: boolean;
  error?: string | null;
  realtimeEnabled?: boolean | null;
}

export const HotspotInspector: React.FC<HotspotInspectorProps> = ({
  map,
  hotspots: hotspotInput = [],
  loading = false,
  error = null,
  realtimeEnabled = null,
}) => {
  const [open, setOpen] = useState(false);
  const hotspots = hotspotInput.length > 0 ? hotspotInput : getFallbackHotspots();

  return (
    <div style={styles.wrapper}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={styles.toggle}>
        {open ? 'Hotspots' : `Hotspots${hotspots.length ? ` (${hotspots.length})` : ''}`}
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.header}>
            <div>
              <div style={styles.title}>Hotspot Inspector</div>
              <div style={styles.subtitle}>
                {loading ? 'Dang tai...' : error ? 'API loi' : `${hotspots.length} hotspot`}
              </div>
            </div>
            <div
              style={{
                ...styles.statusDot,
                background: loading ? '#f59e0b' : error ? '#ef4444' : '#22c55e',
              }}
            />
          </div>

          {error && (
            <div style={styles.errorBox}>
              /api/hotspots loi: {error}. Dang hien fallback hotspots.
            </div>
          )}

          {!error && realtimeEnabled === false && (
            <div style={styles.warningBox}>
              Realtime dang tat vi backend chua co `TOMTOM_API_KEY`.
            </div>
          )}

          {!error && !loading && hotspots.length === 0 && (
            <div style={styles.emptyBox}>API chay nhung dang khong tra hotspot nao.</div>
          )}

          <div style={styles.list}>
            {hotspots.map((hotspot) => {
              const severity = hotspot.realtime?.severity ?? 0;
              const realtimeLabel = hotspot.realtime_status === 'disabled'
                ? 'RT off'
                : hotspot.realtime_status === 'error'
                  ? 'RT err'
                  : `S${severity}`;

              return (
                <button
                  key={hotspot.id}
                  type="button"
                  onClick={() => {
                    map?.flyTo({
                      center: [hotspot.lng, hotspot.lat],
                      zoom: 15.5,
                      duration: 1000,
                    });
                  }}
                  style={styles.item}
                >
                  <div style={styles.itemTop}>
                    <span style={styles.itemName}>{hotspot.name}</span>
                    <span
                      style={{
                        ...styles.badge,
                        ...(hotspot.realtime_status === 'disabled'
                          ? styles.badgeMuted
                          : hotspot.realtime_status === 'error'
                            ? styles.badgeError
                            : severity >= 2
                              ? styles.badgeActive
                              : styles.badgeIdle),
                      }}
                    >
                      {realtimeLabel}
                    </span>
                  </div>
                  <div style={styles.itemMeta}>
                    {hotspot.lat.toFixed(4)}, {hotspot.lng.toFixed(4)} · R {Math.round(hotspot.radius_meters)}m
                  </div>
                  <div style={styles.itemRealtime}>
                    {hotspot.realtime_message || 'Khong co thong tin realtime'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    zIndex: 2200,
    width: 'min(280px, calc(100vw - 24px))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  toggle: {
    border: 'none',
    borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.92)',
    color: 'white',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.22)',
    backdropFilter: 'blur(10px)',
  },
  panel: {
    width: '100%',
    maxHeight: '42vh',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.98)',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.16)',
    backdropFilter: 'blur(12px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px 8px',
    borderBottom: '1px solid #e2e8f0',
  },
  title: {
    fontSize: 13,
    fontWeight: 800,
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    flexShrink: 0,
  },
  errorBox: {
    margin: 10,
    padding: 8,
    borderRadius: 10,
    background: '#fef2f2',
    color: '#991b1b',
    fontSize: 11,
    lineHeight: 1.5,
  },
  warningBox: {
    margin: 10,
    padding: 8,
    borderRadius: 10,
    background: '#fff7ed',
    color: '#9a3412',
    fontSize: 11,
    lineHeight: 1.5,
    border: '1px solid #fed7aa',
  },
  emptyBox: {
    margin: 10,
    padding: 8,
    borderRadius: 10,
    background: '#f8fafc',
    color: '#475569',
    fontSize: 11,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    maxHeight: 'calc(42vh - 56px)',
    overflowY: 'auto',
  },
  item: {
    textAlign: 'left',
    border: '1px solid #e2e8f0',
    background: '#fff',
    borderRadius: 10,
    padding: 10,
    cursor: 'pointer',
  },
  itemTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemName: {
    fontSize: 12,
    fontWeight: 700,
    color: '#0f172a',
  },
  badge: {
    fontSize: 10,
    fontWeight: 800,
    borderRadius: 999,
    padding: '2px 7px',
  },
  badgeIdle: {
    color: '#92400e',
    background: '#ffedd5',
  },
  badgeActive: {
    color: '#991b1b',
    background: '#fee2e2',
  },
  badgeMuted: {
    color: '#475569',
    background: '#e2e8f0',
  },
  badgeError: {
    color: '#ffffff',
    background: '#ef4444',
  },
  itemMeta: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 6,
  },
  itemRealtime: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 1.45,
  },
};

export default HotspotInspector;

function getFallbackHotspots(): TrafficHotspot[] {
  return [
    {
      id: 'fallback-1',
      name: 'Nga sau Cong Hoa',
      lat: 10.8012,
      lng: 106.6528,
      radius_meters: 260,
      description: 'Fallback hotspot',
      realtime: { severity: 3, speed_ratio: 0.64, delay_ratio: 1.42, road_closure: false },
      realtime_status: 'disabled',
      realtime_message: 'Fallback data khi hotspot API khong kha dung.',
    },
    {
      id: 'fallback-2',
      name: 'Cau Sai Gon',
      lat: 10.7941,
      lng: 106.7219,
      radius_meters: 320,
      description: 'Fallback hotspot',
      realtime: { severity: 2, speed_ratio: 0.72, delay_ratio: 1.28, road_closure: false },
      realtime_status: 'disabled',
      realtime_message: 'Fallback data khi hotspot API khong kha dung.',
    },
    {
      id: 'fallback-3',
      name: 'Vo Van Kiet - Ham Thu Thiem',
      lat: 10.7643,
      lng: 106.7054,
      radius_meters: 280,
      description: 'Fallback hotspot',
      realtime: { severity: 1, speed_ratio: 0.81, delay_ratio: 1.14, road_closure: false },
      realtime_status: 'disabled',
      realtime_message: 'Fallback data khi hotspot API khong kha dung.',
    },
  ];
}
