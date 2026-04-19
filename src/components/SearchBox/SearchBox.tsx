'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LonLat, SearchOption } from './types';
import { useSearch } from './useSearch';
import { humanDist, getDistrict } from './photon';

type Mode = 'search' | 'route';

interface RoutePoint {
  coords: LonLat;
  label: string;
}

interface SearchBoxProps {
  mapCenter: LonLat;
  onSelect: (coords: LonLat, label: string) => void;
  onRoute: (origin: RoutePoint, destination: RoutePoint) => void;
  routeDestination?: RoutePoint | null;
  onCancelRoute?: () => void;
  onClearRoute?: () => void;
  routeLoading?: boolean;
}

export const SearchBox: React.FC<SearchBoxProps> = ({
  mapCenter,
  onSelect,
  onRoute,
  routeDestination,
  onCancelRoute,
  onClearRoute,
  routeLoading = false,
}) => {
  const [mode, setMode] = useState<Mode>('search');
  const [origin, setOrigin] = useState<RoutePoint | null>(null);
  const [destination, setDestination] = useState<RoutePoint | null>(null);
  const [activeField, setActiveField] = useState<'origin' | 'destination'>('origin');

  const originSearch = useSearch(mapCenter);
  const destSearch = useSearch(mapCenter);
  const containerRef = useRef<HTMLDivElement>(null);

  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (routeDestination) {
      setDestination(routeDestination);
      setMode('route');
      setActiveField('origin');
    }
  }, [routeDestination]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExploreSelect = useCallback((opt: SearchOption) => {
    let coords: LonLat | null = null;
    if (opt.type === 'geocoder' && opt.feature) coords = opt.feature.geometry.coordinates;
    if (opt.type === 'coords' && opt.coords) coords = opt.coords.center;
    if (!coords) return;
    onSelect(coords, opt.label);
    originSearch.setInput('');
    setFocused(false);
  }, [onSelect, originSearch]);

  const handleOriginSelect = useCallback((opt: SearchOption) => {
    let coords: LonLat | null = null;
    if (opt.type === 'geocoder' && opt.feature) coords = opt.feature.geometry.coordinates;
    if (opt.type === 'coords' && opt.coords) coords = opt.coords.center;
    if (!coords) return;

    setOrigin({ coords, label: opt.label });
    originSearch.setInput('');
    setFocused(false);
    if (!destination) {
      setActiveField('destination');
    }
  }, [destination, originSearch]);

  const handleDestSelect = useCallback((opt: SearchOption) => {
    let coords: LonLat | null = null;
    if (opt.type === 'geocoder' && opt.feature) coords = opt.feature.geometry.coordinates;
    if (opt.type === 'coords' && opt.coords) coords = opt.coords.center;
    if (!coords) return;

    setDestination({ coords, label: opt.label });
    destSearch.setInput('');
    setFocused(false);
  }, [destSearch]);

  const resetRouteState = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setActiveField('origin');
    originSearch.setInput('');
    destSearch.setInput('');
    setFocused(false);
  }, [destSearch, originSearch]);

  const exitRouteMode = useCallback(() => {
    setMode('search');
    resetRouteState();
    onCancelRoute?.();
  }, [onCancelRoute, resetRouteState]);

  const handleClearRoute = useCallback(() => {
    resetRouteState();
    onClearRoute?.();
  }, [onClearRoute, resetRouteState]);

  const handleSubmitRoute = useCallback(() => {
    if (origin && destination) {
      onRoute(origin, destination);
    }
  }, [destination, onRoute, origin]);

  const activeSearch = mode === 'route'
    ? (activeField === 'origin' ? originSearch : destSearch)
    : originSearch;
  const activeOptions = activeSearch.options;
  const activeLoading = activeSearch.loading;
  const showDropdown = focused && activeSearch.input.trim().length > 0;

  const handleSelect = mode === 'route'
    ? (activeField === 'origin' ? handleOriginSelect : handleDestSelect)
    : handleExploreSelect;

  return (
    <div ref={containerRef} style={styles.wrapper}>
      {mode === 'search' ? (
        <ExploreBar
          input={originSearch.input}
          onInput={originSearch.setInput}
          onFocus={() => setFocused(true)}
          onRouteClick={() => {
            setMode('route');
            setActiveField('origin');
            resetRouteState();
            setFocused(true);
          }}
        />
      ) : (
        <RouteBar
          origin={origin}
          destination={destination}
          originInput={originSearch.input}
          destInput={destSearch.input}
          onOriginInput={originSearch.setInput}
          onDestInput={destSearch.setInput}
          onOriginFocus={() => {
            setFocused(true);
            setActiveField('origin');
          }}
          onDestFocus={() => {
            setFocused(true);
            setActiveField('destination');
          }}
          onOriginClear={() => {
            setOrigin(null);
            setActiveField('origin');
            setFocused(true);
          }}
          onDestClear={() => {
            setDestination(null);
            setActiveField('destination');
            setFocused(true);
          }}
          onExit={exitRouteMode}
          onSubmitRoute={handleSubmitRoute}
          onClearRoute={handleClearRoute}
          activeField={activeField}
          routeLoading={routeLoading}
          canSubmit={Boolean(origin && destination)}
        />
      )}
      {showDropdown && (
        <div style={styles.dropdown}>
          <ResultsList
            options={activeOptions}
            input={activeSearch.input}
            mapCenter={mapCenter}
            loading={activeLoading}
            onSelect={handleSelect}
          />
        </div>
      )}
    </div>
  );
};

const ExploreBar = ({
  input,
  onInput,
  onFocus,
  onRouteClick,
}: {
  input: string;
  onInput: (v: string) => void;
  onFocus: () => void;
  onRouteClick: () => void;
}) => (
  <div style={styles.bar}>
    <span style={styles.icon}>{'\uD83D\uDD0D'}</span>
    <input
      type="text"
      value={input}
      onChange={(e) => onInput(e.target.value)}
      onFocus={onFocus}
      placeholder="Tìm kiếm địa điểm, đường phố, hoặc khu vực..."
      style={styles.input}
    />
    {input && <button type="button" onClick={() => onInput('')} style={styles.clearBtn}>{'\u00D7'}</button>}
    <button type="button" onClick={onRouteClick} style={styles.routeBtn} title="Chỉ đường">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
    </button>
  </div>
);

const RouteBar = ({
  origin,
  destination,
  originInput,
  destInput,
  onOriginInput,
  onDestInput,
  onOriginFocus,
  onDestFocus,
  onOriginClear,
  onDestClear,
  onExit,
  onSubmitRoute,
  onClearRoute,
  activeField,
  routeLoading,
  canSubmit,
}: {
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  originInput: string;
  destInput: string;
  onOriginInput: (v: string) => void;
  onDestInput: (v: string) => void;
  onOriginFocus: () => void;
  onDestFocus: () => void;
  onOriginClear: () => void;
  onDestClear: () => void;
  onExit: () => void;
  onSubmitRoute: () => void;
  onClearRoute: () => void;
  activeField: string;
  routeLoading: boolean;
  canSubmit: boolean;
}) => (
  <div style={styles.routeBar}>
    <div style={styles.routeHeader}>
      <button type="button" onClick={onExit} style={styles.backBtn}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <span style={styles.routeTitle}>Tìm đường</span>
    </div>
    <div style={styles.routeFields}>
      <RouteField
        color="#16a34a"
        value={origin}
        input={activeField === 'origin' ? originInput : ''}
        onInput={onOriginInput}
        onFocus={onOriginFocus}
        onClear={onOriginClear}
        isActive={activeField === 'origin'}
        placeholder="Nhập điểm xuất phát..."
      />
      <RouteField
        color="#dc2626"
        value={destination}
        input={activeField === 'destination' ? destInput : ''}
        onInput={onDestInput}
        onFocus={onDestFocus}
        onClear={onDestClear}
        isActive={activeField === 'destination'}
        placeholder="Nhập điểm đến..."
      />
    </div>
    <div style={styles.routeActions}>
      <button
        type="button"
        onClick={onSubmitRoute}
        disabled={!canSubmit || routeLoading}
        style={{
          ...styles.primaryActionBtn,
          opacity: !canSubmit || routeLoading ? 0.65 : 1,
          cursor: !canSubmit || routeLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {routeLoading ? 'Đang tìm đường...' : 'Tìm đường'}
      </button>
      <button type="button" onClick={onClearRoute} style={styles.secondaryActionBtn}>
        Xóa
      </button>
    </div>
  </div>
);

const RouteField = ({
  color,
  value,
  input,
  onInput,
  onFocus,
  onClear,
  isActive,
  placeholder,
}: {
  color: string;
  value: RoutePoint | null;
  input: string;
  onInput: (v: string) => void;
  onFocus: () => void;
  onClear: () => void;
  isActive: boolean;
  placeholder: string;
}) => (
  <div style={styles.routeField} onClick={onFocus}>
    <div style={{ ...styles.dot, background: color }} />
    {value ? (
      <div style={styles.fieldValue}>
        <span style={styles.fieldLabel}>{value.label}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }} style={styles.fieldClearBtn}>&times;</button>
      </div>
    ) : isActive ? (
      <input
        type="text"
        value={input}
        onChange={(e) => onInput(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        style={styles.fieldInput}
        autoFocus
      />
    ) : (
      <span style={styles.fieldPlaceholder}>{placeholder}</span>
    )}
  </div>
);

const ResultsList = ({
  options,
  input,
  mapCenter,
  loading,
  onSelect,
}: {
  options: SearchOption[];
  input: string;
  mapCenter: LonLat;
  loading: boolean;
  onSelect: (opt: SearchOption) => void;
}) => {
  const geocoders = options.filter((o) => o.type === 'geocoder');
  const grouped = new Map<string, SearchOption[]>();
  for (const opt of geocoders) {
    const d = opt.feature ? getDistrict(opt.feature.properties) : 'Other';
    if (!grouped.has(d)) grouped.set(d, []);
    grouped.get(d)!.push(opt);
  }

  return (
    <>
      {options.filter((o) => o.type === 'coords').map((opt, i) => (
        <div key={`c${i}`} style={styles.row} onClick={() => onSelect(opt)}>
          <span style={styles.rowIcon}>{'\uD83C\uDF0D'}</span>
          <div><div style={styles.rowLabel}>{opt.label}</div><div style={styles.rowSub}>{opt.sublabel}</div></div>
        </div>
      ))}
      {Array.from(grouped.entries()).map(([district, items]) => (
        <div key={district}>
          <div style={styles.groupHeader}>{district}</div>
          {items.map((opt, i) => (
            <ResultRow key={`g${i}`} option={opt} input={input} mapCenter={mapCenter} onSelect={onSelect} />
          ))}
        </div>
      ))}
      {options.some((o) => o.type === 'loader') && (
        <div style={styles.loadingRow}><Spinner /> Đang tìm kiếm...</div>
      )}
      {!loading && options.length === 0 && input.trim() && (
        <div style={styles.noResults}>Không có kết quả cho &quot;{input}&quot;</div>
      )}
    </>
  );
};

const ResultRow = ({
  option,
  input,
  mapCenter,
  onSelect,
}: {
  option: SearchOption;
  input: string;
  mapCenter: LonLat;
  onSelect: (o: SearchOption) => void;
}) => {
  const coords = option.feature?.geometry.coordinates;
  const dist = coords ? humanDist(mapCenter, coords) : '';
  return (
    <div style={styles.row} onClick={() => onSelect(option)}>
      <span style={styles.rowIcon}>{'\uD83D\uDCCD'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.rowLabel}>{highlight(option.label, input)}</div>
        <div style={styles.rowSub}>{option.sublabel} <span style={{ color: '#1976d2' }}>{dist}</span></div>
      </div>
    </div>
  );
};

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <strong style={{ color: '#1976d2' }}>{text.slice(i, i + query.length)}</strong>
      {text.slice(i + query.length)}
    </>
  );
}

const Spinner = () => (
  <div style={{ width: 16, height: 16, border: '2px solid #e0e0e0', borderTop: '2px solid #1976d2', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
);

const styles: Record<string, React.CSSProperties> = {
  wrapper: { position: 'relative', zIndex: 2100, width: '100%' },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    padding: '0 8px 0 14px',
    height: 48,
  },
  icon: { fontSize: 18, flexShrink: 0 },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 14,
    fontFamily: 'Inter, sans-serif',
    background: 'transparent',
    color: '#333',
  },
  clearBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' },
  routeBtn: {
    background: '#1976d2',
    border: 'none',
    borderRadius: 10,
    padding: '8px 10px',
    cursor: 'pointer',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBar: {
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    padding: '10px 14px 12px',
  },
  routeHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#666',
    padding: '4px 6px',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
  },
  routeTitle: { fontSize: 15, fontWeight: 700, color: '#0f172a' },
  routeFields: { display: 'flex', flexDirection: 'column', gap: 6 },
  routeField: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#f8fafc',
    borderRadius: 10,
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    cursor: 'pointer',
  },
  dot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0 },
  fieldValue: { flex: 1, display: 'flex', alignItems: 'center', gap: 6 },
  fieldClearBtn: {
    background: 'none',
    border: 'none',
    fontSize: 16,
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: '#0f172a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fieldInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    background: 'transparent',
    color: '#333',
  },
  fieldPlaceholder: { fontSize: 13, color: '#94a3b8' },
  routeActions: { display: 'flex', gap: 8, marginTop: 10 },
  primaryActionBtn: {
    flex: 1,
    border: 'none',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 700,
    background: '#1976d2',
    color: 'white',
  },
  secondaryActionBtn: {
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 700,
    background: 'white',
    color: '#0f172a',
    cursor: 'pointer',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
    padding: '4px 0',
  },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer' },
  rowIcon: { fontSize: 16, flexShrink: 0 },
  rowLabel: { fontSize: 14, fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowSub: { fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  groupHeader: { padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: '#1976d2', textTransform: 'uppercase', borderBottom: '1px solid #f0f0f0' },
  loadingRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', color: '#666', fontSize: 13 },
  noResults: { padding: '20px 16px', textAlign: 'center', color: '#999', fontSize: 13 },
};

export default SearchBox;
