'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { TimeSelection } from '../TimePicker';
import { useTrafficPredictionCache } from '@/lib/useTrafficPredictionCache';
import { useIsMobile } from '@/hooks/useIsMobile';

const SOURCE_ID = 'traffic-segments-source';
const LAYER_ID = 'traffic-segments-layer';

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
}

interface TrafficOverlayProps {
  map: maplibregl.Map | null;
  segments: TrafficSegment[];
  timeSelection: TimeSelection;
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
};

export const TrafficOverlay: React.FC<TrafficOverlayProps> = ({
  map,
  segments,
  timeSelection,
}) => {
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hoveredSegmentIdRef = useRef<number | null>(null);
  const { getCachedPrediction } = useTrafficPredictionCache();

  const segmentsWithLOS = useMemo(() => {
    return getCachedPrediction(segments, timeSelection, simulateLOSBatch);
  }, [segments, timeSelection, getCachedPrediction]);

  const geoJsonData = useMemo(() => segmentsToGeoJSON(segmentsWithLOS), [segmentsWithLOS]);
  const stats = useMemo(() => calculateStats(segmentsWithLOS), [segmentsWithLOS]);
  const isPrediction = timeSelection.type !== 'preset' || timeSelection.horizon !== 'now';

  useEffect(() => {
    if (!map) return;

    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '320px',
        offset: 12,
      });
    }

    const onMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (map.getZoom() < 15) {
        hoveredSegmentIdRef.current = null;
        popupRef.current?.remove();
        map.getCanvas().style.cursor = '';
        return;
      }

      const features = map.queryRenderedFeatures(event.point, {
        layers: [LAYER_ID],
      }) as MapGeoJSONFeature[];

      if (features.length === 0) {
        hoveredSegmentIdRef.current = null;
        popupRef.current?.remove();
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
        popupRef.current
          ?.setLngLat(anchor)
          .setHTML(buildPopupHtml(props))
          .addTo(map);
      } else {
        popupRef.current?.setLngLat(anchor);
      }
    };

    const onMouseLeave = () => {
      hoveredSegmentIdRef.current = null;
      popupRef.current?.remove();
      map.getCanvas().style.cursor = '';
    };

    map.on('mousemove', onMouseMove);
    map.on('mouseleave', LAYER_ID, onMouseLeave);

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('mouseleave', LAYER_ID, onMouseLeave);
      popupRef.current?.remove();
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;

    const applyData = () => {
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
      } else {
        existingSource.setData(geoJsonData);
      }
    };

    if (map.isStyleLoaded()) {
      applyData();
      return;
    }

    map.once('load', applyData);
    return () => {
      map.off('load', applyData);
    };
  }, [geoJsonData, map]);

  useEffect(() => {
    if (!map) return;

    return () => {
      popupRef.current?.remove();

      if (map.getLayer(LAYER_ID)) {
        map.removeLayer(LAYER_ID);
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

function segmentsToGeoJSON(segments: TrafficSegment[]): GeoJSON.FeatureCollection<GeoJSON.LineString, SegmentFeatureProperties> {
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

function buildPopupHtml(props: SegmentFeatureProperties) {
  return `
    <div style="font-family: system-ui, sans-serif; padding: 4px 2px; min-width: 220px;">
      <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 4px;">${props.street_name}</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <div style="background: ${LOS_COLORS[props.los as keyof typeof LOS_COLORS]}; color: white; font-weight: 700; border-radius: 8px; padding: 4px 8px;">${props.los}</div>
        <div style="font-size: 14px; font-weight: 600;">${props.label}</div>
      </div>
      <div style="font-size: 12px; color: #4b5563; line-height: 1.6;">
        <div>Độ tin cậy: ${(props.confidence * 100).toFixed(0)}%</div>
        <div>Cấp đường: ${props.street_level}</div>
        <div>Vận tốc tối đa: ${props.max_velocity} km/h</div>
        <div>Chiều dài: ${Math.round(props.length)} m</div>
      </div>
    </div>
  `;
}

function simulateLOSBatch(
  segments: TrafficSegment[],
  timeSelection: TimeSelection
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

  return segments.map((seg) => {
    let los: string;
    let confidence: number;
    const isMajorRoad = seg.street_level === 1;

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

    return { ...seg, los, confidence };
  });
}

function calculateStats(segments: TrafficSegment[]) {
  const losCounts: Record<string, number> = {};
  segments.forEach((seg) => {
    const los = seg.los || 'C';
    losCounts[los] = (losCounts[los] || 0) + 1;
  });

  const total = segments.length;
  const congested = (losCounts.E || 0) + (losCounts.F || 0);
  const congestedPercent = total > 0 ? ((congested / total) * 100).toFixed(1) : '0';

  return {
    total,
    losCounts,
    congested,
    congestedPercent,
  };
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
        {isPrediction ? 'LOS Dự báo' : 'LOS Hiện tại'}
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

export default TrafficOverlay;

const MobileTrafficOverlay: React.FC<{
  isPrediction: boolean;
  stats: ReturnType<typeof calculateStats>;
  timeSelection: TimeSelection;
}> = ({ isPrediction, stats, timeSelection }) => {
  const [open, setOpen] = useState(false);

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
      {/* Toggle button */}
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

      {/* Expanded panel */}
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
            {isPrediction ? 'LOS Dự báo' : 'LOS Hiện tại'}
          </div>

          {/* Legend inline */}
          {Object.entries(LOS_COLORS).map(([los, color]) => (
            <div key={los} style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8 }}>
              <div style={{ width: 20, height: 6, background: color, borderRadius: 999 }} />
              <span style={{ fontSize: 12 }}>
                <strong style={{ color }}>{los}</strong> - {LOS_LABELS[los as keyof typeof LOS_LABELS]}
              </span>
            </div>
          ))}

          <div style={{ borderTop: '1px solid #e5e7eb', margin: '10px 0' }} />

          {/* Stats */}
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
        </div>
      )}
    </>
  );
};
