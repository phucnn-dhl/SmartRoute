import type {
  Coordinate,
  DepartureRecommendation,
  PredictionAnalysis,
  RankedRoute,
  RouteData,
} from '../routing';

export type ChatIntent =
  | 'traffic_summary'
  | 'route_recommendation'
  | 'departure_recommendation'
  | 'route_comparison'
  | 'hotspot_question'
  | 'route_creation'
  | 'explain_prediction'
  | 'general_help';

export type ChatAction =
  | { type: 'select_route'; routeId: string }
  | { type: 'set_departure_offset'; offsetMinutes: number }
  | { type: 'open_route_panel' }
  | { type: 'show_congested_segments' }
  | { type: 'fill_route'; originQuery: string; destinationQuery: string };

export interface ChatClientContext {
  selectedRouteId?: string;
  origin?: { lat: number; lng: number; label?: string };
  destination?: { lat: number; lng: number; label?: string };
  timeSelection: {
    mode: 'now' | 'offset' | 'custom';
    offsetMinutes?: number;
    targetHour?: number;
    targetWeekday?: number;
  };
  selectedRoute?: RouteData;
  alternativeRoutes?: RankedRoute[];
  predictionAnalysis?: PredictionAnalysis;
  departureRecommendation?: DepartureRecommendation;
  visibleStats?: {
    visibleSegments: number;
    congestedRatio: number;
    losDistribution: Record<string, number>;
  };
  hotspotSummary?: {
    activeHotspots: number;
    highSeverityHotspots: number;
    statuses: Array<{
      id: string;
      name: string;
      severity: number;
      status: 'live' | 'cached' | 'stale' | 'error' | 'mock';
    }>;
  };
}

export interface ChatRequest {
  message: string;
  context: ChatClientContext;
  history?: ChatMessageData[];
}

export interface ChatResponse {
  answer: string;
  intent: ChatIntent;
  actions?: ChatAction[];
  referencedRouteId?: string;
}

export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  actions?: ChatAction[];
}
