'use client';

/**
 * useTrafficPredictionCache - Cache prediction results
 *
 * Caches LOS predictions by time selection to avoid recalculating
 */

import { useRef } from 'react';
import { TrafficSegment } from '@/components/TrafficOverlay';
import { TimeSelection } from '@/components/TimePicker';

interface CachedPrediction {
  segments: TrafficSegment[];
  timestamp: number;
}

interface CacheEntry {
  data: CachedPrediction;
  expiry: number;
}

export function useTrafficPredictionCache() {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Generate cache key from time selection
  const getCacheKey = (timeSelection: TimeSelection): string => {
    const weekdayPart = timeSelection.weekday !== undefined
      ? `-wd${timeSelection.weekday}`
      : '';

    if (timeSelection.type === 'preset') {
      return `preset-${timeSelection.horizon}${weekdayPart}`;
    } else {
      return `custom-${timeSelection.customTime?.getTime()}-${timeSelection.customTime?.getHours()}-${timeSelection.customTime?.getMinutes()}${weekdayPart}`;
    }
  };

  // Get cached prediction or compute new one
  const getCachedPrediction = (
    segments: TrafficSegment[],
    timeSelection: TimeSelection,
    predictFn: (segs: TrafficSegment[], selection: TimeSelection) => TrafficSegment[]
  ): TrafficSegment[] => {
    const key = getCacheKey(timeSelection);
    const now = Date.now();

    // Check cache
    const cached = cacheRef.current.get(key);
    if (cached && cached.expiry > now) {
      console.log(`Cache hit for ${key}`);

      // Return cached segments (merge with current segments by ID)
      const cachedMap = new Map(cached.data.segments.map(s => [s.segment_id, s] as [number, TrafficSegment]));
      return segments.map(seg => cachedMap.get(seg.segment_id) || seg);
    }

    console.log(`Cache miss for ${key}, computing...`);

    // Compute prediction
    const predictedSegments = predictFn(segments, timeSelection);

    // Store in cache
    cacheRef.current.set(key, {
      data: { segments: predictedSegments, timestamp: now },
      expiry: now + CACHE_DURATION,
    });

    return predictedSegments;
  };

  // Clear cache
  const clearCache = () => {
    cacheRef.current.clear();
    console.log('Cache cleared');
  };

  // Get cache stats
  const getCacheStats = () => {
    return {
      size: cacheRef.current.size,
      keys: Array.from(cacheRef.current.keys()),
    };
  };

  return {
    getCachedPrediction,
    clearCache,
    getCacheStats,
  };
}
