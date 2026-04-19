'use client';

import React from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Coordinate, PickingMode } from '@/lib/routing';

interface RouteControlsProps {
  origin: Coordinate | null;
  destination: Coordinate | null;
  hasRoute: boolean;
  pickingMode: PickingMode;
  routeLoading: boolean;
  canRequestRoute: boolean;
  onBeginPicking: (mode: 'origin' | 'destination') => void;
  onCancelPicking: () => void;
  onRequestRoute: () => void;
  onClearRoute: () => void;
}

function formatCoordinate(label: string, coordinate: Coordinate | null) {
  if (!coordinate) {
    return `${label}: chưa chọn`;
  }

  return `${label}: ${coordinate[1].toFixed(5)}, ${coordinate[0].toFixed(5)}`;
}

export const RouteControls: React.FC<RouteControlsProps> = ({
  origin,
  destination,
  hasRoute,
  pickingMode,
  routeLoading,
  canRequestRoute,
  onBeginPicking,
  onCancelPicking,
  onRequestRoute,
  onClearRoute,
}) => {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        left: hasRoute ? 10 : '50%',
        transform: hasRoute ? 'none' : 'translateX(-50%)',
        zIndex: 1600,
        width: isMobile ? 'calc(100vw - 16px)' : 'min(560px, calc(100vw - 24px))',
        background: 'rgba(255, 255, 255, 0.96)',
        borderRadius: 16,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Tạo tuyến đường</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Sử dụng chế độ chọn, sau đó nhấp vào bản đồ để đặt điểm xuất phát và điểm đến.
          </div>
        </div>
        {pickingMode && (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: '#dbeafe',
              color: '#1d4ed8',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Đang chọn điểm {pickingMode === 'origin' ? 'xuất phát' : 'đích đến'}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <div style={pointCardStyle}>
          <div style={pointLabelStyle}>Xuất phát</div>
          <div style={pointValueStyle}>{formatCoordinate('Điểm', origin)}</div>
        </div>
        <div style={pointCardStyle}>
          <div style={pointLabelStyle}>Đích đến</div>
          <div style={pointValueStyle}>{formatCoordinate('Điểm', destination)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button type="button" style={getButtonStyle(pickingMode === 'origin')} onClick={() => onBeginPicking('origin')}>
          Chọn điểm xuất phát
        </button>
        <button type="button" style={getButtonStyle(pickingMode === 'destination')} onClick={() => onBeginPicking('destination')}>
          Chọn điểm đến
        </button>
        {pickingMode && (
          <button type="button" style={secondaryButtonStyle} onClick={onCancelPicking}>
            Hủy chọn
          </button>
        )}
        <button type="button" style={primaryButtonStyle(canRequestRoute)} onClick={onRequestRoute} disabled={!canRequestRoute}>
          {routeLoading ? 'Đang tạo tuyến đường...' : 'Tìm đường'}
        </button>
        <button type="button" style={secondaryButtonStyle} onClick={onClearRoute}>
          Xóa tuyến đường
        </button>
      </div>
    </div>
  );
};

const pointCardStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '12px 14px',
};

const pointLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#334155',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const pointValueStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#0f172a',
  marginTop: 6,
  lineHeight: 1.5,
};

const getButtonStyle = (active: boolean): React.CSSProperties => ({
  border: 'none',
  borderRadius: 10,
  padding: '10px 14px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
  background: active ? '#dbeafe' : '#e2e8f0',
  color: active ? '#1d4ed8' : '#0f172a',
});

const primaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
  border: 'none',
  borderRadius: 10,
  padding: '10px 14px',
  cursor: enabled ? 'pointer' : 'not-allowed',
  fontSize: 13,
  fontWeight: 700,
  background: enabled ? '#2563eb' : '#93c5fd',
  color: 'white',
});

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '10px 14px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
  background: 'white',
  color: '#0f172a',
};

export default RouteControls;
