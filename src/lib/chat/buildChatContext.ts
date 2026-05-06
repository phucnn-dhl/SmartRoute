import type {
  Coordinate,
  DepartureRecommendation,
  PredictionAnalysis,
  RankedRoute,
  RouteData,
} from '../routing';
import type { TimeSelection } from '@/components/TimePicker';
import type { ChatClientContext } from './types';

interface HotspotSummarySource {
  activeHotspots: number;
  highSeverityHotspots: number;
  statuses: Array<{
    id: string;
    name: string;
    severity: number;
    status: 'live' | 'cached' | 'stale' | 'error' | 'mock';
  }>;
}

interface BuildContextParams {
  origin: Coordinate | null;
  destination: Coordinate | null;
  selectedRouteId: string | null;
  selectedRoute: RouteData | null;
  predictionAnalysis: PredictionAnalysis | null;
  alternativeRoutes: RankedRoute[];
  departureRecommendation: DepartureRecommendation | null;
  timeSelection: TimeSelection;
  segments: Array<{ los?: string }>;
  hotspotSummary?: HotspotSummarySource;
}

export function buildChatContext(params: BuildContextParams): ChatClientContext {
  const losDistribution: Record<string, number> = {};
  let congested = 0;
  for (const seg of params.segments) {
    const los = seg.los ?? 'unknown';
    losDistribution[los] = (losDistribution[los] || 0) + 1;
    if (los === 'E' || los === 'F') congested++;
  }

  return {
    selectedRouteId: params.selectedRouteId ?? undefined,
    origin: params.origin
      ? { lat: params.origin[1], lng: params.origin[0] }
      : undefined,
    destination: params.destination
      ? { lat: params.destination[1], lng: params.destination[0] }
      : undefined,
    timeSelection: toTimeSelection(params.timeSelection),
    selectedRoute: params.selectedRoute ?? undefined,
    alternativeRoutes:
      params.alternativeRoutes.length > 0 ? params.alternativeRoutes : undefined,
    predictionAnalysis: params.predictionAnalysis ?? undefined,
    departureRecommendation:
      params.departureRecommendation ?? undefined,
    hotspotSummary: params.hotspotSummary,
    visibleStats: {
      visibleSegments: params.segments.length,
      congestedRatio:
        params.segments.length > 0 ? congested / params.segments.length : 0,
      losDistribution,
    },
  };
}

function toTimeSelection(ts: TimeSelection): ChatClientContext['timeSelection'] {
  if (ts.type === 'preset') {
    const offset =
      ts.horizon === 'now'
        ? 0
        : ts.horizon === '+15'
          ? 15
          : ts.horizon === '+30'
            ? 30
            : ts.horizon === '+60'
              ? 60
              : 0;
    return {
      mode: offset === 0 ? 'now' : 'offset',
      offsetMinutes: offset,
    };
  }
  return {
    mode: 'custom',
    targetHour: ts.customTime?.getHours(),
    targetWeekday: ts.weekday ?? ts.customTime?.getDay(),
  };
}
