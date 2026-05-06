export type Coordinate = [number, number];

export type RouteProfile = 'car' | 'bike' | 'walk';

export type RouteProvider = 'graphhopper' | 'mock' | 'valhalla';

export type DepartureOffsetMinutes = 0 | 15 | 30 | 60;

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds?: number;
  streetName?: string;
}

export interface CongestedSegment {
  segmentId: number;
  los?: string;
  confidence?: number;
  delaySeconds?: number;
  geometry?: GeoJSON.LineString;
}

export interface PredictionCoverage {
  matchedSegmentCount: number;
  sampledPointCount: number;
  coverageRatio: number;
  level: 'low' | 'partial' | 'good';
}

export interface PredictionAnalysis {
  departureOffsetMinutes: DepartureOffsetMinutes;
  delaySeconds?: number;
  congestionScore?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  congestedSegments?: CongestedSegment[];
  summary?: string;
  coverage?: PredictionCoverage;
}

export interface DepartureRecommendationOption {
  departureOffsetMinutes: DepartureOffsetMinutes;
  predictedDurationSeconds: number;
  delaySeconds: number;
  congestionScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommended: boolean;
  tradeOff: string;
  coverageLevel?: 'low' | 'partial' | 'good';
}

export interface DepartureRecommendation {
  route: RouteData;
  options: DepartureRecommendationOption[];
  recommendedDepartureOffsetMinutes: DepartureOffsetMinutes;
  summary: string;
}

export interface RouteData {
  provider: RouteProvider;
  profile: RouteProfile;
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoJSON.LineString;
  bbox: [number, number, number, number];
  steps?: RouteStep[];
}

export interface RouteRequest {
  origin: Coordinate;
  destination: Coordinate;
  profile?: RouteProfile;
  departureOffsetMinutes?: DepartureOffsetMinutes;
  targetHour?: number;
  targetWeekday?: number;
  includeSteps?: boolean;
  includePredictionAnalysis?: boolean;
}

export interface AlternativeRouteOptions {
  enabled?: boolean;
  maxPaths?: number;
  maxWeightFactor?: number;
  maxShareFactor?: number;
}

export interface RouteScore {
  baseDurationSeconds: number;
  predictedDelaySeconds: number;
  predictedDurationSeconds: number;
  congestionScore: number;
  riskPenaltySeconds: number;
  coveragePenaltySeconds: number;
  finalCostSeconds: number;
}

export interface RankedRoute {
  id: string;
  rank: number;
  label: 'recommended' | 'fastest' | 'least_congested' | 'alternative';
  route: RouteData;
  analysis: PredictionAnalysis;
  score: RouteScore;
  reason: string;
}

export interface AlternativeRouteRequest extends RouteRequest {
  alternativeRoute?: AlternativeRouteOptions;
}

export interface ApiError {
  code: 'invalid_input' | 'provider_error' | 'no_route' | 'timeout' | 'unknown';
  message: string;
}

export interface RouteResponseSuccess {
  status: 'success';
  data: {
    route: RouteData;
    predictionAnalysis?: PredictionAnalysis;
  };
}

export interface AlternativeRouteResponseSuccess {
  status: 'success';
  data: {
    recommendedRouteId: string;
    routes: RankedRoute[];
  };
}

export interface RouteResponseError {
  status: 'error';
  error: ApiError;
}

export type RouteResponse = RouteResponseSuccess | RouteResponseError;

export type AlternativeRouteResponse =
  | AlternativeRouteResponseSuccess
  | RouteResponseError;

export interface DepartureRecommendationRequest {
  route: RouteData;
  candidateOffsets?: DepartureOffsetMinutes[];
}

export interface DepartureRecommendationResponseSuccess {
  status: 'success';
  data: DepartureRecommendation;
}

export interface DepartureRecommendationResponseError {
  status: 'error';
  error: ApiError;
}

export type DepartureRecommendationResponse =
  | DepartureRecommendationResponseSuccess
  | DepartureRecommendationResponseError;

export type PickingMode = 'origin' | 'destination' | null;
