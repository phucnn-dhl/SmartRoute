import { TrafficSegmentRecord } from './trafficData';

const API_BASE = process.env.TRAFFIC_API_URL || 'http://localhost:8000';

export interface SegmentWithPrediction extends TrafficSegmentRecord {
  los?: string;
  confidence?: number;
}

export interface PredictionResult {
  segment_id: number;
  los: string;
  los_encoded: number;
  confidence: number;
  error?: string;
}

export async function fetchSegmentsFromAPI(params: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  streetLevelMax?: number;
  hour: number;
  minute: number;
  weekday: number;
  includePrediction?: boolean;
}): Promise<{ segments: SegmentWithPrediction[]; total: number }> {
  const url = new URL(`${API_BASE}/segments`);
  url.searchParams.set('minLat', String(params.minLat));
  url.searchParams.set('minLng', String(params.minLng));
  url.searchParams.set('maxLat', String(params.maxLat));
  url.searchParams.set('maxLng', String(params.maxLng));
  url.searchParams.set('hour', String(params.hour));
  url.searchParams.set('minute', String(params.minute));
  url.searchParams.set('weekday', String(params.weekday));

  if (params.streetLevelMax !== undefined) {
    url.searchParams.set('streetLevelMax', String(params.streetLevelMax));
  }
  if (params.includePrediction !== false) {
    url.searchParams.set('includePrediction', 'true');
  }

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    throw new Error(`FastAPI /segments returned ${response.status}`);
  }
  return response.json();
}

export async function fetchPredictions(params: {
  segment_ids: number[];
  hour: number;
  minute: number;
  weekday: number;
  month?: number;
  day_of_month?: number;
}): Promise<PredictionResult[]> {
  const response = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`FastAPI /predict returned ${response.status}`);
  }
  const data = await response.json();
  return data.predictions;
}
