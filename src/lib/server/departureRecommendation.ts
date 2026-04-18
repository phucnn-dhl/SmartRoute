import {
  DepartureOffsetMinutes,
  DepartureRecommendation,
  DepartureRecommendationOption,
  PredictionAnalysis,
  RouteData,
} from '@/lib/routing';
import { analyzeRoutePrediction } from './routePredictionAnalysis';

const DEFAULT_CANDIDATE_OFFSETS: DepartureOffsetMinutes[] = [0, 15, 30, 60];

interface BuildDepartureRecommendationParams {
  route: RouteData;
  candidateOffsets?: DepartureOffsetMinutes[];
}

export async function buildDepartureRecommendation(
  params: BuildDepartureRecommendationParams
): Promise<DepartureRecommendation> {
  const candidateOffsets = dedupeOffsets(params.candidateOffsets);
  const analyses = await Promise.all(
    candidateOffsets.map((offset) => analyzeRoutePrediction(params.route, offset))
  );

  const optionBase = analyses.map((analysis) =>
    toDepartureOption({
      route: params.route,
      analysis,
    })
  );

  const recommendedOffset = pickRecommendedOffset(optionBase);
  const options = optionBase.map((option) => ({
    ...option,
    recommended: option.departureOffsetMinutes === recommendedOffset,
    tradeOff: buildTradeOff(option, recommendedOffset),
  }));

  return {
    route: params.route,
    options,
    recommendedDepartureOffsetMinutes: recommendedOffset,
    summary: buildRecommendationSummary(options),
  };
}

function dedupeOffsets(offsets?: DepartureOffsetMinutes[]) {
  const input = offsets?.length ? offsets : DEFAULT_CANDIDATE_OFFSETS;
  return Array.from(new Set(input)) as DepartureOffsetMinutes[];
}

function toDepartureOption(params: {
  route: RouteData;
  analysis: PredictionAnalysis;
}): DepartureRecommendationOption {
  const delaySeconds = params.analysis.delaySeconds ?? 0;
  return {
    departureOffsetMinutes: params.analysis.departureOffsetMinutes,
    predictedDurationSeconds: params.route.durationSeconds + delaySeconds,
    delaySeconds,
    congestionScore: params.analysis.congestionScore ?? 0,
    riskLevel: params.analysis.riskLevel ?? 'low',
    recommended: false,
    tradeOff: '',
    coverageLevel: params.analysis.coverage?.level,
  };
}

function pickRecommendedOffset(options: DepartureRecommendationOption[]) {
  const ranked = [...options].sort((a, b) => getOptionScore(a) - getOptionScore(b));
  return ranked[0]?.departureOffsetMinutes ?? 0;
}

function getOptionScore(option: DepartureRecommendationOption) {
  return (
    option.predictedDurationSeconds * 0.6 +
    option.congestionScore * 100 * 0.25 +
    getRiskPenalty(option.riskLevel) * 0.15 +
    getCoveragePenalty(option.coverageLevel)
  );
}

function getRiskPenalty(riskLevel: DepartureRecommendationOption['riskLevel']) {
  switch (riskLevel) {
    case 'high':
      return 40;
    case 'medium':
      return 20;
    case 'low':
    default:
      return 0;
  }
}

function getCoveragePenalty(coverageLevel: DepartureRecommendationOption['coverageLevel']) {
  switch (coverageLevel) {
    case 'low':
      return 30;
    case 'partial':
      return 12;
    case 'good':
    default:
      return 0;
  }
}

function buildTradeOff(
  option: DepartureRecommendationOption,
  recommendedOffset: DepartureOffsetMinutes
) {
  if (option.departureOffsetMinutes === recommendedOffset) {
    return option.departureOffsetMinutes === 0
      ? 'Best overall balance if you leave now.'
      : `Best overall balance if you leave in +${option.departureOffsetMinutes} min.`;
  }

  const routeDelayMinutes = Math.max(0, Math.round(option.delaySeconds / 60));

  if (option.riskLevel === 'high') {
    return routeDelayMinutes > 0
      ? `Fast to depart, but expect roughly +${routeDelayMinutes} min extra delay and higher volatility.`
      : 'Leaves sooner, but carries higher congestion risk than the recommended option.';
  }

  if (option.riskLevel === 'low') {
    return option.departureOffsetMinutes > recommendedOffset
      ? 'More stable traffic outlook, but slower overall than the recommended departure.'
      : 'Low risk, but not the best ETA among the available departure times.';
  }

  return 'Balanced option, but not as strong overall as the recommended departure time.';
}

function buildRecommendationSummary(options: DepartureRecommendationOption[]) {
  const recommended = options.find((option) => option.recommended) || options[0];
  if (!recommended) {
    return 'No departure recommendation is available.';
  }

  const bestEtaMinutes = Math.max(1, Math.round(recommended.predictedDurationSeconds / 60));
  const offsetLabel =
    recommended.departureOffsetMinutes === 0
      ? 'now'
      : `in +${recommended.departureOffsetMinutes} min`;

  const riskLabel = recommended.riskLevel;
  return `Best time to leave is ${offsetLabel}. Predicted ETA is about ${bestEtaMinutes} min with ${riskLabel} congestion risk.`;
}
