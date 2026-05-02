import { fetchSegmentsFromAPI, SegmentWithPrediction } from './apiClient';

export interface TrafficSegmentRecord {
  segment_id: number;
  s_lat: number;
  s_lng: number;
  e_lat: number;
  e_lng: number;
  street_name: string;
  street_level: number;
  max_velocity: number;
  length: number;
}

interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export async function getTrafficSegmentsWithinBounds(bounds: Bounds): Promise<SegmentWithPrediction[]> {
  try {
    const now = new Date();
    const result = await fetchSegmentsFromAPI({
      ...bounds,
      hour: now.getHours(),
      minute: now.getMinutes(),
      weekday: now.getDay(),
      includePrediction: false,
    });
    return result.segments;
  } catch (error) {
    console.error('FastAPI unavailable, returning empty segments:', error);
    return [];
  }
}
