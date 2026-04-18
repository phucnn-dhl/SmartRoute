'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LonLat, SearchOption } from './types';
import { fetchPhotonResults, parseCoords } from './photon';

/** Hook to manage search input and results */
export function useSearch(mapCenter: LonLat) {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(input);

  useEffect(() => { inputRef.current = input; }, [input]);

  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) { setOptions([]); setLoading(false); return; }

    // Instant: coordinate parse
    const coord = parseCoords(trimmed);
    if (coord) { setOptions([coord]); setLoading(false); return; }

    // Show loader immediately
    setLoading(true);
    setOptions([{ type: 'loader', label: '', sublabel: '' }]);

    let cancelled = false;
    fetchPhotonResults(trimmed, mapCenter)
      .then((results) => {
        if (cancelled || inputRef.current !== trimmed) return;
        setOptions(results);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setOptions([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [input, mapCenter]);

  const getCoords = useCallback((opt: SearchOption): LonLat | null => {
    if (opt.type === 'geocoder' && opt.feature) return opt.feature.geometry.coordinates;
    if (opt.type === 'coords' && opt.coords) return opt.coords.center;
    return null;
  }, []);

  return { input, setInput, options, loading, getCoords };
}
