'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { LonLat } from './types';
import { TrafficSegment } from '@/components/TrafficOverlay';

const LOS_COLORS: Record<string, string> = {
  A: '#22c55e', B: '#84cc16', C: '#eab308',
  D: '#f97316', E: '#ef4444', F: '#7c2d12',
};
const LOS_LABELS: Record<string, string> = {
  A: 'Thông thoáng', B: 'Khá tốt', C: 'Ổn định',
  D: 'Bắt đầu kẹt', E: 'Kẹt xe', F: 'Kẹt cứng',
};

interface Props {
  map: maplibregl.Map | null;
  coords: LonLat | null;
  label: string;
  segments: TrafficSegment[];
  onRouteHere: () => void;
  onClose: () => void;
}

export const SearchLocationMarker: React.FC<Props> = ({
  map, coords, label, segments, onRouteHere, onClose,
}) => {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);

  // ── Create marker (only when coords change) ──
  useEffect(() => {
    if (!map || !coords) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    markerRef.current?.remove();
    const el = document.createElement('div');
    el.innerHTML = `<svg width="32" height="44" viewBox="0 0 32 44" fill="none">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 28 16 28s16-16 16-28C32 7.16 24.84 0 16 0z" fill="#7c3aed"/>
      <circle cx="16" cy="16" r="7" fill="white"/>
      <circle cx="16" cy="16" r="3.5" fill="#7c3aed"/>
    </svg>`;
    el.style.cssText = 'cursor:pointer;animation:markerBounce 0.5s cubic-bezier(0.34,1.56,0.64,1);';
    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(coords)
      .addTo(map);

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map, coords]);

  // ── Track screen position for the info panel ──
  useEffect(() => {
    if (!map || !coords) { setScreenPos(null); return; }

    const update = () => {
      const point = map.project(coords);
      setScreenPos({ x: point.x, y: point.y });
    };

    update();
    map.on('move', update);
    map.on('zoom', update);
    map.on('resize', update);
    return () => {
      map.off('move', update);
      map.off('zoom', update);
      map.off('resize', update);
    };
  }, [map, coords]);

  // ── Inject animation CSS ──
  useEffect(() => {
    if (document.getElementById('slm-styles')) return;
    const s = document.createElement('style');
    s.id = 'slm-styles';
    s.textContent = `@keyframes markerBounce { 0%{transform:translateY(-30px) scale(.6);opacity:0} 60%{transform:translateY(4px) scale(1.05);opacity:1} 100%{transform:translateY(0) scale(1)} }`;
    document.head.appendChild(s);
  }, []);

  if (!screenPos || !coords) return null;

  // Panel positioned above the marker
  const panelX = screenPos.x;
  const panelY = screenPos.y - 50; // above the marker tip

  return (
    <div style={{
      position: 'absolute',
      left: panelX,
      top: panelY,
      transform: 'translate(-50%, -100%)',
      zIndex: 2200,
      width: 320,
      pointerEvents: 'auto',
    }}>
      <LocationPanel
        label={label}
        coords={coords}
        segments={segments}
        onRouteHere={onRouteHere}
        onClose={onClose}
      />
      {/* Arrow pointing down */}
      <div style={{
        width: 0, height: 0,
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderTop: '10px solid #6d28d9',
        margin: '0 auto',
      }} />
    </div>
  );
};

/* ── Info panel (pure React, no MapLibre popup) ── */

const LocationPanel: React.FC<{
  label: string;
  coords: LonLat;
  segments: TrafficSegment[];
  onRouteHere: () => void;
  onClose: () => void;
}> = ({ label, coords, segments, onRouteHere, onClose }) => {
  const traffic = React.useMemo(() => analyzeTraffic(coords, segments), [coords, segments]);

  const c = traffic ? LOS_COLORS[traffic.avgLos] : '#94a3b8';
  const l = traffic ? LOS_LABELS[traffic.avgLos] : 'Đang tải dữ liệu...';

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
        padding: '14px 16px 12px',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 10, opacity: 0.7 }}>{coords[1].toFixed(5)}, {coords[0].toFixed(5)}</div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8,
          color: 'white', fontSize: 16, cursor: 'pointer', width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>×</button>
      </div>

      {/* Traffic overview */}
      <div style={{ padding: '14px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            background: c, color: 'white', fontWeight: 800, fontSize: 20,
            width: 46, height: 46, borderRadius: 14, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 14px ${c}55`,
          }}>
            {traffic?.avgLos || '...'}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{l}</div>
            {traffic ? (
              <>
                <div style={{ fontSize: 11, color: '#64748b' }}>{traffic.count} đoạn đường trong 500m</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Xấu nhất: <span style={{ color: LOS_COLORS[traffic.worstLos], fontWeight: 700 }}>
                    {traffic.worstLos} - {LOS_LABELS[traffic.worstLos]}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: '#64748b' }}>Chờ tải dữ liệu traffic...</div>
            )}
          </div>
        </div>

        {/* LOS distribution bars */}
        {traffic && (
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>PHÂN BỐ GIAO THÔNG</div>
            {['A','B','C','D','E','F'].map(los => {
              const cnt = traffic.losCounts[los] || 0;
              if (!cnt) return null;
              const pct = Math.round((cnt / traffic.count) * 100);
              return (
                <div key={los} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ width: 18, fontWeight: 700, fontSize: 11, color: LOS_COLORS[los] }}>{los}</span>
                  <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: LOS_COLORS[los], borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8', width: 30, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Congested streets */}
      {traffic && traffic.congested.length > 0 && (
        <div style={{ padding: '8px 16px 2px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>ĐƯỜNG KẸT GẦN ĐÂY</div>
          {traffic.congested.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 0', borderBottom: '1px solid #f8fafc',
            }}>
              <div style={{
                background: LOS_COLORS[s.los], color: 'white',
                fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
              }}>{s.los}</div>
              <span style={{
                fontSize: 11, color: '#334155', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{s.name}</span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{s.dist}m</span>
            </div>
          ))}
        </div>
      )}

      {/* Route button */}
      <div style={{ padding: '10px 16px 14px' }}>
        <button onClick={onRouteHere} style={{
          width: '100%', border: 'none', borderRadius: 10, padding: 11,
          background: '#7c3aed', color: 'white', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M3 12h4l3-9 4 18 3-9h4"/>
          </svg>
          Chỉ đường đến đây
        </button>
      </div>
    </div>
  );
};

export default SearchLocationMarker;

/* ── Traffic analysis ── */

interface TrafficInfo {
  avgLos: string;
  worstLos: string;
  count: number;
  losCounts: Record<string, number>;
  congested: Array<{ name: string; los: string; dist: number }>;
}

function analyzeTraffic(center: LonLat, segments: TrafficSegment[]): TrafficInfo | null {
  if (!segments.length) return null;
  const R = 6371;
  let total = 0, worst = 'A', n = 0;
  const counts: Record<string, number> = {};
  const cong: TrafficInfo['congested'] = [];

  for (const seg of segments) {
    const mLat = (seg.s_lat + seg.e_lat) / 2;
    const mLng = (seg.s_lng + seg.e_lng) / 2;
    const dLat = ((mLat - center[1]) * Math.PI) / 180;
    const dLon = ((mLng - center[0]) * Math.PI) / 180;
    const d = R * 2 * Math.asin(Math.sqrt(
      Math.sin(dLat / 2) ** 2 + Math.cos((center[1] * Math.PI) / 180) * Math.cos((mLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2,
    ));
    if (d > 0.5) continue;
    const los = seg.los || 'C';
    total += ({ A:5,B:4,C:3,D:2,E:1,F:0 })[los]??3;
    n++;
    const rank = ({ A:0,B:1,C:2,D:3,E:4,F:5 })[los]??2;
    if (rank > (({ A:0,B:1,C:2,D:3,E:4,F:5 })[worst]??2)) worst = los;
    counts[los] = (counts[los] || 0) + 1;
    if (rank >= 3) cong.push({ name: seg.street_name, los, dist: Math.round(d * 1000) });
  }

  if (n === 0) return null;
  const avg = total / n;
  cong.sort((a, b) => (({ A:0,B:1,C:2,D:3,E:4,F:5 })[b.los]??2) - (({ A:0,B:1,C:2,D:3,E:4,F:5 })[a.los]??2));
  const avgLos = avg>=4.5?'A':avg>=3.5?'B':avg>=2.5?'C':avg>=1.5?'D':avg>=.5?'E':'F';
  return { avgLos, worstLos: worst, count: n, losCounts: counts, congested: cong.slice(0, 4) };
}
