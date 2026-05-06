import {
  AlternativeRouteOptions,
  DepartureOffsetMinutes,
  PredictionAnalysis,
  RankedRoute,
  RouteData,
  RouteProfile,
  RouteScore,
} from '@/lib/routing';
import { getGraphHopperAlternativeRoutes } from './graphhopper';
import { analyzeRoutePrediction } from './routePredictionAnalysis';

const DEFAULT_ALTERNATIVE_ROUTE: Required<AlternativeRouteOptions> = {
  enabled: true,
  maxPaths: 3,
  maxWeightFactor: 1.4,
  maxShareFactor: 0.6,
};

const RISK_PENALTY_SECONDS: Record<'low' | 'medium' | 'high', number> = {
  low: 0,
  medium: 180,
  high: 420,
};

const COVERAGE_PENALTY_SECONDS: Record<'good' | 'partial' | 'low', number> = {
  good: 0,
  partial: 120,
  low: 300,
};

type RouteCandidate = {
  route: RouteData;
  analysis: PredictionAnalysis;
  score: RouteScore;
  originalIndex: number;
};

export async function buildRankedAlternativeRoutes(params: {
  origin: [number, number];
  destination: [number, number];
  profile: RouteProfile;
  includeSteps: boolean;
  departureOffsetMinutes: DepartureOffsetMinutes;
  targetHour?: number;
  targetWeekday?: number;
  alternativeRoute?: AlternativeRouteOptions;
}) {
  const alternativeRoute = normalizeAlternativeOptions(params.alternativeRoute);
  const routes = await getGraphHopperAlternativeRoutes({
    origin: params.origin,
    destination: params.destination,
    profile: params.profile,
    includeSteps: params.includeSteps,
    alternativeRoute,
  });

  const candidates = await Promise.all(
    dedupeRoutes(routes).map(async (route, index) => {
      const analysis = await analyzeRoutePrediction(
        route,
        params.departureOffsetMinutes,
        params.targetHour,
        params.targetWeekday,
      );
      const score = computeRouteScore(route, analysis);
      return {
        route,
        analysis,
        score,
        originalIndex: index,
      } satisfies RouteCandidate;
    }),
  );

  const fastestRouteId = pickRouteIdBy(candidates, (candidate) => candidate.route.durationSeconds);
  const leastCongestedRouteId = pickRouteIdBy(candidates, (candidate) => candidate.score.congestionScore);

  const ranked = [...candidates]
    .sort((a, b) => (
      a.score.finalCostSeconds - b.score.finalCostSeconds
      || a.score.predictedDurationSeconds - b.score.predictedDurationSeconds
      || a.originalIndex - b.originalIndex
    ))
    .map((candidate, index) => {
      const routeId = buildRouteId(candidate.route, candidate.originalIndex);
      return {
        id: routeId,
        rank: index + 1,
        label: getRouteLabel(routeId, index, fastestRouteId, leastCongestedRouteId),
        route: candidate.route,
        analysis: candidate.analysis,
        score: candidate.score,
        reason: buildReason(candidate.analysis, candidate.score, routeId, fastestRouteId),
      } satisfies RankedRoute;
    });

  return {
    recommendedRouteId: ranked[0]?.id || '',
    routes: ranked,
  };
}

export function computeRouteScore(route: RouteData, analysis: PredictionAnalysis): RouteScore {
  const predictedDelaySeconds = analysis.delaySeconds ?? 0;
  const congestionScore = analysis.congestionScore ?? 0;
  const riskPenaltySeconds = RISK_PENALTY_SECONDS[analysis.riskLevel || 'low'];
  const coveragePenaltySeconds = COVERAGE_PENALTY_SECONDS[analysis.coverage?.level || 'good'];
  const predictedDurationSeconds = route.durationSeconds + predictedDelaySeconds;
  const finalCostSeconds = Math.round(
    route.durationSeconds
    + predictedDelaySeconds
    + congestionScore * 60
    + riskPenaltySeconds
    + coveragePenaltySeconds,
  );

  return {
    baseDurationSeconds: route.durationSeconds,
    predictedDelaySeconds,
    predictedDurationSeconds,
    congestionScore: Number(congestionScore.toFixed(2)),
    riskPenaltySeconds,
    coveragePenaltySeconds,
    finalCostSeconds,
  };
}

function normalizeAlternativeOptions(options?: AlternativeRouteOptions): Required<AlternativeRouteOptions> {
  return {
    enabled: options?.enabled ?? DEFAULT_ALTERNATIVE_ROUTE.enabled,
    maxPaths: options?.maxPaths ?? DEFAULT_ALTERNATIVE_ROUTE.maxPaths,
    maxWeightFactor: options?.maxWeightFactor ?? DEFAULT_ALTERNATIVE_ROUTE.maxWeightFactor,
    maxShareFactor: options?.maxShareFactor ?? DEFAULT_ALTERNATIVE_ROUTE.maxShareFactor,
  };
}

function dedupeRoutes(routes: RouteData[]) {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = `${route.distanceMeters}:${route.durationSeconds}:${route.geometry.coordinates.length}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildRouteId(route: RouteData, index: number) {
  return `route_${index + 1}_${route.distanceMeters}_${route.durationSeconds}`;
}

function pickRouteIdBy(items: RouteCandidate[], metric: (item: RouteCandidate) => number) {
  if (items.length === 0) return '';

  let best = items[0];
  let bestValue = metric(best);

  for (const item of items.slice(1)) {
    const value = metric(item);
    if (value < bestValue) {
      best = item;
      bestValue = value;
    }
  }

  return buildRouteId(best.route, best.originalIndex);
}

function getRouteLabel(
  routeId: string,
  rank: number,
  fastestRouteId: string,
  leastCongestedRouteId: string,
): RankedRoute['label'] {
  if (rank === 0) return 'recommended';
  if (routeId === fastestRouteId) return 'fastest';
  if (routeId === leastCongestedRouteId) return 'least_congested';
  return 'alternative';
}

function buildReason(
  analysis: PredictionAnalysis,
  score: RouteScore,
  routeId: string,
  fastestRouteId: string,
) {
  const delayMinutes = Math.max(0, Math.round(score.predictedDelaySeconds / 60));
  const risk = analysis.riskLevel || 'low';
  const coverage = analysis.coverage?.level || 'good';

  if (routeId === fastestRouteId) {
    return `Fastest base ETA, but risk is ${risk} with about ${delayMinutes} extra minutes predicted.`;
  }

  if (risk === 'low' && score.predictedDelaySeconds <= 180) {
    return `Lower congestion, predicted ETA ${Math.round(score.predictedDurationSeconds / 60)} minutes, coverage ${coverage}.`;
  }

  if (risk === 'high') {
    return `Higher-risk route, final cost rises to about ${Math.round(score.finalCostSeconds / 60)} minutes.`;
  }

  return `Alternative route with congestion score ${score.congestionScore.toFixed(2)} and coverage ${coverage}.`;
}
