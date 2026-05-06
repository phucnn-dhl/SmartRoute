import { NextResponse } from 'next/server';
import { fetchHotspotsFromAPI } from '@/lib/server/apiClient';

export async function GET() {
  try {
    const data = await fetchHotspotsFromAPI();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in hotspots API:', error);
    return NextResponse.json(
      { hotspots: [], total: 0, error: 'Failed to load hotspots', message: String(error) },
      { status: 503 }
    );
  }
}
