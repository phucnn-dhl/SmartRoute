import type { ChatClientContext } from '@/lib/chat/types';
import type { RankedRoute, DepartureRecommendation, PredictionAnalysis } from '@/lib/routing';

export function getRouteContext(context: ChatClientContext) {
  const routes = context.alternativeRoutes ?? [];
  const selected = routes.find((r) => r.id === context.selectedRouteId) ?? routes[0];
  return { routes, selected, hasRoute: routes.length > 0 };
}

export function compareRoutes(context: ChatClientContext) {
  const { routes } = getRouteContext(context);
  if (routes.length === 0) return null;
  if (routes.length === 1) return { summary: 'Chỉ có 1 tuyến đường.', best: routes[0] };

  const leastCongested = [...routes].sort(
    (a, b) => a.score.congestionScore - b.score.congestionScore,
  )[0];
  const fastest = [...routes].sort(
    (a, b) => a.score.predictedDurationSeconds - b.score.predictedDurationSeconds,
  )[0];
  const leastRisk = [...routes].sort(
    (a, b) => {
      const riskOrder = { low: 0, medium: 1, high: 2 };
      return (riskOrder[a.analysis.riskLevel ?? 'low'] ?? 0) - (riskOrder[b.analysis.riskLevel ?? 'low'] ?? 0);
    },
  )[0];

  return { leastCongested, fastest, leastRisk, routes };
}

export function getDepartureAdvice(context: ChatClientContext) {
  const rec = context.departureRecommendation;
  if (!rec) return null;

  const best = rec.options.find((o) => o.recommended);
  return { recommendation: rec, best };
}

export function getTrafficSummary(context: ChatClientContext) {
  const stats = context.visibleStats;
  if (!stats) return null;

  const total = stats.visibleSegments;
  const congestedRatio = stats.congestedRatio;
  const dist = stats.losDistribution;

  return { total, congestedRatio, losDistribution: dist };
}

export function getHotspotSummary(context: ChatClientContext) {
  const hs = context.hotspotSummary;
  if (!hs) return null;
  return hs;
}
