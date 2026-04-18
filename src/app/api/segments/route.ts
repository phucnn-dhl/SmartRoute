import { NextResponse } from 'next/server';

export interface TrafficSegment {
  segment_id: number;
  s_lat: number;
  s_lng: number;
  e_lat: number;
  e_lng: number;
  street_name: string;
}

/**
 * GET /api/segments
 *
 * Returns traffic segments for HCMC
 * In production, this would fetch from database or external API
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const count = parseInt(searchParams.get('count') || '500');
  const area = searchParams.get('area') || 'hcmc';

  try {
    const segments = generateSampleSegments(count, area);
    return NextResponse.json({ segments, total: segments.length });
  } catch (error) {
    console.error('Error generating segments:', error);
    return NextResponse.json(
      { error: 'Failed to generate segments' },
      { status: 500 }
    );
  }
}

/**
 * Generate sample traffic segments
 */
function generateSampleSegments(count: number, area: string): TrafficSegment[] {
  // Define areas with their bounding boxes
  const areas: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
    hcmc: { minLat: 10.7, maxLat: 10.9, minLng: 106.6, maxLng: 106.8 },
    district1: { minLat: 10.77, maxLat: 10.81, minLng: 106.68, maxLng: 106.71 },
    thuduc: { minLat: 10.82, maxLat: 10.88, minLng: 106.72, maxLng: 106.82 },
    binhthanh: { minLat: 10.78, maxLat: 10.82, minLng: 106.70, maxLng: 106.75 },
  };

  const bounds = areas[area] || areas.hcmc;
  const { minLat, maxLat, minLng, maxLng } = bounds;

  const segments: TrafficSegment[] = [];
  const gridSize = Math.ceil(Math.sqrt(count));
  const latStep = (maxLat - minLat) / gridSize;
  const lngStep = (maxLng - minLng) / gridSize;

  let id = 1;
  const streetNames = [
    'Đường Nguyễn Huệ',
    'Đường Lê Lợi',
    'Đường Hai Bà Trưng',
    'Đường Trần Hưng Đạo',
    'Đường Điện Biên Phủ',
    'Đường Cách Mạng Tháng Tám',
    'Đường Võ Văn Tần',
    'Đường Nguyễn Trãi',
    'Đường Hàm Nghi',
    'Đường Nam Kỳ Khởi Nghĩa',
    'Đường Phạm Văn Đồng',
    'Đường Lê Đức Thọ',
    'Đường Nguyễn Văn Linh',
    'Đường Hoàng Sa',
    'Đường Trường Sa',
  ];

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (segments.length >= count) break;

      const lat1 = minLat + i * latStep + Math.random() * latStep * 0.5;
      const lng1 = minLng + j * lngStep + Math.random() * lngStep * 0.5;
      const lat2 = lat1 + (Math.random() - 0.5) * latStep * 0.3;
      const lng2 = lng1 + (Math.random() - 0.5) * lngStep * 0.3;

      segments.push({
        segment_id: id++,
        s_lat: lat1,
        s_lng: lng1,
        e_lat: lat2,
        e_lng: lng2,
        street_name: streetNames[Math.floor(Math.random() * streetNames.length)],
      });
    }
  }

  return segments;
}
