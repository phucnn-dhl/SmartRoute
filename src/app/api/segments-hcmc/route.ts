import { NextResponse } from 'next/server';
import { fetchSegmentsFromAPI } from '@/lib/server/apiClient';

export interface TrafficSegmentHCMC {
  segment_id: number;
  s_lat: number;
  s_lng: number;
  e_lat: number;
  e_lng: number;
  street_name: string;
  street_level: number;
  max_velocity: number;
  length: number;
  los?: string;
  confidence?: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const boundsParam = searchParams.get('bounds');
  const streetLevelMax = searchParams.get('streetLevelMax');
  const zoom = searchParams.get('zoom');
  const hourParam = searchParams.get('hour');
  const minuteParam = searchParams.get('minute');
  const weekdayParam = searchParams.get('weekday');

  try {
    if (!boundsParam) {
      return NextResponse.json({ segments: [], total: 0, zoom });
    }

    const [minLat, minLng, maxLat, maxLng] = boundsParam.split(',').map(parseFloat);

    const now = new Date();
    const hour = hourParam ? parseInt(hourParam) : now.getHours();
    const minute = minuteParam ? parseInt(minuteParam) : now.getMinutes();
    const weekday = weekdayParam ? parseInt(weekdayParam) : now.getDay();

    try {
      const data = await fetchSegmentsFromAPI({
        minLat, minLng, maxLat, maxLng,
        streetLevelMax: streetLevelMax ? parseInt(streetLevelMax) : undefined,
        hour, minute, weekday,
        includePrediction: true,
      });

      return NextResponse.json({
        segments: data.segments,
        total: data.total,
        zoom,
      });
    } catch (apiError) {
      console.error('FastAPI unavailable, using CSV fallback:', apiError);
      return NextResponse.json(
        { error: 'Traffic API unavailable', message: String(apiError) },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('Error in segments API:', error);
    return NextResponse.json(
      { error: 'Failed to load segments', message: String(error) },
      { status: 500 }
    );
  }
}
