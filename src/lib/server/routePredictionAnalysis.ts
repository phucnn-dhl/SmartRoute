import {
  CongestedSegment,
  DepartureOffsetMinutes,
  PredictionAnalysis,
  PredictionCoverage,
  RouteData,
} from '@/lib/routing';
import { getTrafficSegmentsWithinBounds, TrafficSegmentRecord } from './trafficData';

const BBOX_PADDING_DEGREES = 0.0035; // ~350m base padding
const BBOX_PADDING_LONG_ROUTE_DEGREES = 0.012; // ~1.3km padding for long routes
const LONG_ROUTE_BBOX_THRESHOLD_METERS = 10000;
const SEGMENT_MATCH_THRESHOLD_METERS = 300;
const SAMPLE_INTERVAL_METERS = 125; // Sample every 125m along route

// Segment cap thresholds based on route distance
const MAX_SEGMENTS_SHORT_ROUTE = 48;   // < 3km
const MAX_SEGMENTS_MEDIUM_ROUTE = 120;  // 3-10km
const MAX_SEGMENTS_LONG_ROUTE = 240;    // > 10km
const SHORT_ROUTE_THRESHOLD_METERS = 3000;
const LONG_ROUTE_THRESHOLD_METERS = 10000;

interface PredictedSegmentScore extends TrafficSegmentRecord {
  los: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  confidence: number;
  travelTimeFactor: number;
  predictedDelaySeconds: number;
  distanceToRouteMeters: number;
}

export async function analyzeRoutePrediction(
  route: RouteData,
  departureOffsetMinutes: DepartureOffsetMinutes,
  targetHour?: number,
  targetWeekday?: number
): Promise<PredictionAnalysis> {
  // Use wider padding for long routes to capture more traffic segments
  const routeLengthMeters = calculateRouteLength(route.geometry.coordinates);
  const padding = routeLengthMeters > LONG_ROUTE_BBOX_THRESHOLD_METERS
    ? BBOX_PADDING_LONG_ROUTE_DEGREES
    : BBOX_PADDING_DEGREES;
  const routeBounds = getExpandedBounds(route.bbox, padding);
  const nearbySegments = await getTrafficSegmentsWithinBounds(routeBounds);
  const maxSegments = getMaxSegmentsForRouteLength(routeLengthMeters);

  // SAMPLE-BASED MATCHING: Sample points along route and find nearest segments
  const samplePoints = sampleRoutePoints(route.geometry.coordinates, SAMPLE_INTERVAL_METERS);
  const matchedSegments = findNearestSegmentsForSamples(
    samplePoints,
    nearbySegments,
    route,
    departureOffsetMinutes,
    maxSegments,
    targetHour,
    targetWeekday
  );

  // Calculate coverage metrics
  const sampledPointCount = samplePoints.length;
  const matchedSegmentCount = matchedSegments.length;
  const coverageRatio = Math.min(matchedSegmentCount / sampledPointCount, 1);

  const coverageLevel: PredictionCoverage['level'] =
    coverageRatio >= 0.6 ? 'good' :
    coverageRatio >= 0.3 ? 'partial' :
    'low';

  const coverage: PredictionCoverage = {
    matchedSegmentCount,
    sampledPointCount,
    coverageRatio: Number(coverageRatio.toFixed(2)),
    level: coverageLevel,
  };

  if (matchedSegments.length === 0) {
    return {
      departureOffsetMinutes,
      delaySeconds: 0,
      congestionScore: 0,
      riskLevel: 'low',
      coverage,
      summary: buildSummary({
        departureOffsetMinutes,
        delaySeconds: 0,
        riskLevel: 'low',
        highRiskCount: 0,
        mediumRiskCount: 0,
        coverageLevel,
      }),
    };
  }

  const weightedLength = matchedSegments.reduce((sum, segment) => sum + Math.max(segment.length, 30), 0);
  const weightedPenalty = matchedSegments.reduce(
    (sum, segment) => sum + getSeverityWeight(segment.los) * Math.max(segment.length, 30),
    0
  );

  const weightedTravelFactor = matchedSegments.reduce(
    (sum, segment) => sum + segment.travelTimeFactor * Math.max(segment.length, 30),
    0
  );

  const delaySeconds = Math.round(
    matchedSegments.reduce((sum, segment) => sum + segment.predictedDelaySeconds, 0)
  );

  const congestionScore = Number(Math.min(weightedPenalty / (weightedLength * 5), 1).toFixed(2));
  const avgTravelFactor = weightedTravelFactor / weightedLength;
  const highRiskCount = matchedSegments.filter((segment) => segment.los === 'E' || segment.los === 'F').length;
  const mediumRiskCount = matchedSegments.filter((segment) => segment.los === 'D').length;
  const riskLevel =
    highRiskCount >= 4 || avgTravelFactor >= 1.75 ? 'high' :
    highRiskCount >= 1 || mediumRiskCount >= 4 || avgTravelFactor >= 1.35 ? 'medium' :
    'low';

  return {
    departureOffsetMinutes,
    delaySeconds,
    congestionScore,
    riskLevel,
    congestedSegments: buildCongestedSegments(matchedSegments),
    coverage,
    summary: buildSummary({
      departureOffsetMinutes,
      delaySeconds,
      riskLevel,
      highRiskCount,
      mediumRiskCount,
      coverageLevel,
    }),
  };
}

function scoreSegmentAgainstRoute(
  segment: TrafficSegmentRecord,
  route: RouteData,
  departureOffsetMinutes: DepartureOffsetMinutes,
  precomputedDistance?: number,
  targetHour?: number,
  targetWeekday?: number
): PredictedSegmentScore | null {
  const distanceToRouteMeters = precomputedDistance ?? getDistanceToRoute(
    [(segment.s_lng + segment.e_lng) / 2, (segment.s_lat + segment.e_lat) / 2],
    route.geometry.coordinates
  );

  if (distanceToRouteMeters > SEGMENT_MATCH_THRESHOLD_METERS) {
    return null;
  }

  const predicted = predictSegmentTraffic(segment, departureOffsetMinutes, targetHour, targetWeekday);
  const baseSpeedMetersPerSecond = Math.max((segment.max_velocity || 20) / 3.6, 1.8);
  const baseDurationSeconds = Math.max((segment.length || 30) / baseSpeedMetersPerSecond, 4);
  const predictedDelaySeconds = Math.round(baseDurationSeconds * (predicted.travelTimeFactor - 1));

  return {
    ...segment,
    los: predicted.los,
    confidence: predicted.confidence,
    travelTimeFactor: predicted.travelTimeFactor,
    predictedDelaySeconds,
    distanceToRouteMeters,
  };
}

function predictSegmentTraffic(segment: TrafficSegmentRecord, departureOffsetMinutes: DepartureOffsetMinutes, targetHour?: number, targetWeekday?: number) {
  const hour = targetHour ?? (() => {
    const t = new Date(Date.now() + departureOffsetMinutes * 60 * 1000);
    return t.getHours();
  })();
  const weekday = targetWeekday ?? (() => {
    const t = new Date(Date.now() + departureOffsetMinutes * 60 * 1000);
    return t.getDay();
  })();
  const isWeekend = weekday === 0 || weekday === 6;
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const isNight = hour >= 22 || hour <= 6;
  const isMajorRoad = segment.street_level === 1;
  const noise = deterministicNoise(segment.segment_id, hour, weekday);

  if (isNight) {
    return { los: 'A' as const, confidence: 0.88, travelTimeFactor: 1.02 + noise * 0.08 };
  }

  if (isWeekend) {
    if (hour >= 8 && hour <= 20) {
      return noise > 0.65
        ? { los: 'C' as const, confidence: 0.72, travelTimeFactor: 1.18 + noise * 0.18 }
        : { los: 'B' as const, confidence: 0.76, travelTimeFactor: 1.05 + noise * 0.14 };
    }

    return { los: 'A' as const, confidence: 0.84, travelTimeFactor: 1.01 + noise * 0.08 };
  }

  if (isRushHour) {
    if (isMajorRoad) {
      if (noise > 0.78) {
        return { los: 'E' as const, confidence: 0.74, travelTimeFactor: 2.15 + noise * 0.45 };
      }
      if (noise > 0.46) {
        return { los: 'D' as const, confidence: 0.71, travelTimeFactor: 1.55 + noise * 0.35 };
      }
      return { los: 'C' as const, confidence: 0.66, travelTimeFactor: 1.22 + noise * 0.2 };
    }

    return noise > 0.58
      ? { los: 'D' as const, confidence: 0.69, travelTimeFactor: 1.48 + noise * 0.3 }
      : { los: 'C' as const, confidence: 0.7, travelTimeFactor: 1.18 + noise * 0.18 };
  }

  return noise > 0.5
    ? { los: 'C' as const, confidence: 0.74, travelTimeFactor: 1.16 + noise * 0.16 }
    : { los: 'B' as const, confidence: 0.77, travelTimeFactor: 1.04 + noise * 0.12 };
}

function deterministicNoise(segmentId: number, hour: number, weekday: number) {
  const seed = (segmentId * 9301 + hour * 49297 + weekday * 233280) % 233280;
  return seed / 233280;
}

function getExpandedBounds(
  bbox: [number, number, number, number],
  padding: number
): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  const [minLng, minLat, maxLng, maxLat] = bbox;

  return {
    minLng: minLng - padding,
    minLat: minLat - padding,
    maxLng: maxLng + padding,
    maxLat: maxLat + padding,
  };
}

function getMaxSegmentsForRouteLength(routeLengthMeters: number): number {
  if (routeLengthMeters < SHORT_ROUTE_THRESHOLD_METERS) {
    return MAX_SEGMENTS_SHORT_ROUTE;
  } else if (routeLengthMeters < LONG_ROUTE_THRESHOLD_METERS) {
    return MAX_SEGMENTS_MEDIUM_ROUTE;
  } else {
    return MAX_SEGMENTS_LONG_ROUTE;
  }
}

/**
 * Sample points along the route at regular intervals.
 * Tracks cumulative distance across all segments to ensure even spacing.
 */
function sampleRoutePoints(coordinates: GeoJSON.Position[], intervalMeters: number): [number, number][] {
  if (coordinates.length < 2) {
    return [coordinates[0] as [number, number]];
  }

  const samples: [number, number][] = [coordinates[0] as [number, number]];
  let cumDistance = 0; // cumulative distance from route start
  let nextSampleAt = intervalMeters; // distance of the next sample point

  for (let i = 0; i < coordinates.length - 1; i++) {
    const segStart = coordinates[i] as [number, number];
    const segEnd = coordinates[i + 1] as [number, number];
    const segLength = haversineDistance(segStart, segEnd);

    // Place samples within this segment as long as nextSampleAt falls inside it
    while (nextSampleAt <= cumDistance + segLength && segLength > 0) {
      const offsetIntoSegment = nextSampleAt - cumDistance;
      const t = offsetIntoSegment / segLength;
      samples.push([
        segStart[0] + t * (segEnd[0] - segStart[0]),
        segStart[1] + t * (segEnd[1] - segStart[1]),
      ]);
      nextSampleAt += intervalMeters;
    }

    cumDistance += segLength;
  }

  // Add end point if not already close to last sample
  const endPoint = coordinates[coordinates.length - 1] as [number, number];
  const lastSample = samples[samples.length - 1];
  if (haversineDistance(lastSample, endPoint) > intervalMeters * 0.4) {
    samples.push(endPoint);
  }

  return samples;
}

/**
 * For each sample point along the route, find the nearest traffic segment.
 * Uses a grid-based spatial index for O(n) performance on long routes.
 * Registers segments at start, end, AND midpoint grid cells so that segments
 * whose midpoint is far from the route but whose body crosses it are still found.
 * Measures distance to the actual segment line, not just the midpoint.
 * Returns deduplicated, scored, and capped segment list.
 */
function findNearestSegmentsForSamples(
  samplePoints: [number, number][],
  nearbySegments: TrafficSegmentRecord[],
  route: RouteData,
  departureOffsetMinutes: DepartureOffsetMinutes,
  maxSegments: number,
  targetHour?: number,
  targetWeekday?: number
): PredictedSegmentScore[] {
  if (nearbySegments.length === 0 || samplePoints.length === 0) {
    return [];
  }

  const cellSize = SEGMENT_MATCH_THRESHOLD_METERS;
  const latPerMeter = 1 / 110540;
  const avgLat = samplePoints.reduce((sum, p) => sum + p[1], 0) / samplePoints.length;
  const lngPerMeter = 1 / (111320 * Math.cos((avgLat * Math.PI) / 180));

  // Pre-compute segment reference points (start, end, midpoint)
  const segmentRefs = nearbySegments.map((seg) => ({
    start: [seg.s_lng, seg.s_lat] as [number, number],
    end: [seg.e_lng, seg.e_lat] as [number, number],
    mid: [(seg.s_lng + seg.e_lng) / 2, (seg.s_lat + seg.e_lat) / 2] as [number, number],
  }));

  // Build grid index — register each segment at start, end, and midpoint cells
  const grid = new Map<string, number[]>();
  for (let i = 0; i < nearbySegments.length; i++) {
    const refs = segmentRefs[i];
    const cells = new Set<string>();
    for (const point of [refs.start, refs.end, refs.mid]) {
      const latCell = Math.floor(point[1] / (cellSize * latPerMeter));
      const lngCell = Math.floor(point[0] / (cellSize * lngPerMeter));
      cells.add(`${latCell},${lngCell}`);
    }
    for (const key of cells) {
      let cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(i);
    }
  }

  // For each sample point, find nearest segment using grid lookup + distance-to-segment-line
  const segmentMatches = new Map<number, { segment: TrafficSegmentRecord; distance: number }>();

  for (const samplePoint of samplePoints) {
    const latCell = Math.floor(samplePoint[1] / (cellSize * latPerMeter));
    const lngCell = Math.floor(samplePoint[0] / (cellSize * lngPerMeter));

    let bestDist = SEGMENT_MATCH_THRESHOLD_METERS;
    let bestIndex = -1;

    // Check 3x3 neighborhood
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const cell = grid.get(`${latCell + di},${lngCell + dj}`);
        if (!cell) continue;

        for (const segIdx of cell) {
          // Measure distance to the actual segment line, not just midpoint
          const refs = segmentRefs[segIdx];
          const dist = getDistanceToSegment(samplePoint, refs.start, refs.end);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = segIdx;
          }
        }
      }
    }

    if (bestIndex >= 0) {
      const seg = nearbySegments[bestIndex];
      const existing = segmentMatches.get(seg.segment_id);
      if (!existing || bestDist < existing.distance) {
        segmentMatches.set(seg.segment_id, { segment: seg, distance: bestDist });
      }
    }
  }

  // Score and sort
  return Array.from(segmentMatches.values())
    .map(({ segment, distance }) =>
      scoreSegmentAgainstRoute(segment, route, departureOffsetMinutes, distance, targetHour, targetWeekday)
    )
    .filter((seg): seg is PredictedSegmentScore => seg !== null)
    .sort((a, b) => a.distanceToRouteMeters - b.distanceToRouteMeters)
    .slice(0, maxSegments);
}

function calculateRouteLength(coordinates: GeoJSON.Position[]): number {
  let totalLength = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const start = coordinates[i] as [number, number];
    const end = coordinates[i + 1] as [number, number];
    totalLength += haversineDistance(start, end);
  }

  return totalLength;
}

function haversineDistance(from: [number, number], to: [number, number]): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (from[1] * Math.PI) / 180;
  const φ2 = (to[1] * Math.PI) / 180;
  const Δφ = ((to[1] - from[1]) * Math.PI) / 180;
  const Δλ = ((to[0] - from[0]) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function getDistanceToRoute(point: [number, number], coordinates: GeoJSON.Position[]) {
  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const start = coordinates[i] as [number, number];
    const end = coordinates[i + 1] as [number, number];
    const candidate = getDistanceToSegment(point, start, end);

    if (candidate < minDistance) {
      minDistance = candidate;
    }
  }

  return minDistance;
}

function getDistanceToSegment(point: [number, number], start: [number, number], end: [number, number]) {
  const avgLat = ((point[1] + start[1] + end[1]) / 3) * (Math.PI / 180);
  const metersPerLng = 111320 * Math.cos(avgLat);
  const metersPerLat = 110540;

  const px = point[0] * metersPerLng;
  const py = point[1] * metersPerLat;
  const sx = start[0] * metersPerLng;
  const sy = start[1] * metersPerLat;
  const ex = end[0] * metersPerLng;
  const ey = end[1] * metersPerLat;

  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(px - sx, py - sy);
  }

  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  const projectionX = sx + t * dx;
  const projectionY = sy + t * dy;

  return Math.hypot(px - projectionX, py - projectionY);
}

function getSeverityWeight(los: PredictedSegmentScore['los']) {
  switch (los) {
    case 'A':
      return 0;
    case 'B':
      return 1;
    case 'C':
      return 2;
    case 'D':
      return 3;
    case 'E':
      return 4;
    case 'F':
      return 5;
  }
}

function buildCongestedSegments(matchedSegments: PredictedSegmentScore[]): CongestedSegment[] {
  return matchedSegments
    .filter((segment) => segment.los === 'D' || segment.los === 'E' || segment.los === 'F')
    .sort((a, b) => {
      const severityDiff = getSeverityWeight(b.los) - getSeverityWeight(a.los);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      return b.predictedDelaySeconds - a.predictedDelaySeconds;
    })
    .slice(0, 12)
    .map((segment) => ({
      segmentId: segment.segment_id,
      los: segment.los,
      confidence: Number(segment.confidence.toFixed(2)),
      delaySeconds: segment.predictedDelaySeconds,
      geometry: {
        type: 'LineString',
        coordinates: [
          [segment.s_lng, segment.s_lat],
          [segment.e_lng, segment.e_lat],
        ],
      },
    }));
}

function buildSummary(params: {
  departureOffsetMinutes: DepartureOffsetMinutes;
  delaySeconds: number;
  riskLevel: 'low' | 'medium' | 'high';
  highRiskCount: number;
  mediumRiskCount: number;
  coverageLevel: 'low' | 'partial' | 'good';
}) {
  const whenLabel =
    params.departureOffsetMinutes === 0
      ? 'nếu bạn xuất phát ngay bây giờ'
      : `cho xuất phát sau +${params.departureOffsetMinutes} phút`;

  const delayMinutes = params.delaySeconds > 0 ? Math.max(1, Math.round(params.delaySeconds / 60)) : 0;

  // Handle low coverage case
  if (params.coverageLevel === 'low') {
    return `Độ phủ dữ liệu dự báo giao thông cho tuyến đường này còn hạn chế. Độ tin cậy dự báo thấp cho phân tích đường dài. ${params.delaySeconds > 0 ? `Có thể gặp độ trễ (+${delayMinutes} phút).` : 'Dữ liệu hiện tại cho thấy ít độ trễ.'}`;
  }

  if (params.coverageLevel === 'partial' && params.riskLevel === 'low') {
    return `Độ phủ dữ liệu giao thông một phần. Dựa trên các đoạn đường có sẵn, tắc nghẽn có vẻ thấp ${whenLabel}, nhưng dự báo có thể không phản ánh đúng điều kiện trên toàn bộ tuyến đường.`;
  }

  if (params.riskLevel === 'high') {
    return `Tắc nghẽn dự báo cao ${whenLabel}. Dự kiến độ trễ khoảng +${delayMinutes} phút với ${params.highRiskCount} điểm nghẽn nghiêm trọng trên tuyến đường.`;
  }

  if (params.riskLevel === 'medium') {
    return `Tắc nghẽn trung bình ${whenLabel}. Tuyến đường có thể chậm thêm khoảng +${delayMinutes} phút với ${params.mediumRiskCount + params.highRiskCount} điểm áp lực gần đó.`;
  }

  return `Tắc nghẽn thấp ${whenLabel}. Chỉ có một số điểm chậm nhỏ được dự báo trên tuyến đường này.`;
}
