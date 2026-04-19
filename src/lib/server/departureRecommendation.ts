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
      ? 'Cân bằng tốt nhất nếu bạn xuất phát ngay bây giờ.'
      : `Cân bằng tốt nhất nếu bạn xuất phát sau +${option.departureOffsetMinutes} phút.`;
  }

  const routeDelayMinutes = Math.max(0, Math.round(option.delaySeconds / 60));

  if (option.riskLevel === 'high') {
    return routeDelayMinutes > 0
      ? `Xuất phát nhanh, nhưng dự kiến thêm khoảng +${routeDelayMinutes} phút độ trễ và rủi ro cao hơn.`
      : 'Xuất phát sớm hơn, nhưng mang rủi ro tắc nghẽn cao hơn lựa chọn được khuyến nghị.';
  }

  if (option.riskLevel === 'low') {
    return option.departureOffsetMinutes > recommendedOffset
      ? 'Tình trạng giao thông ổn định hơn, nhưng chậm hơn so với thời gian xuất phát được khuyến nghị.'
      : 'Rủi ro thấp, nhưng không phải thời gian đến dự kiến tốt nhất trong các lựa chọn.';
  }

  return 'Lựa chọn cân bằng, nhưng không tối ưu bằng thời gian xuất phát được khuyến nghị.';
}

function buildRecommendationSummary(options: DepartureRecommendationOption[]) {
  const recommended = options.find((option) => option.recommended) || options[0];
  if (!recommended) {
    return 'Không có khuyến nghị thời gian xuất phát.';
  }

  const bestEtaMinutes = Math.max(1, Math.round(recommended.predictedDurationSeconds / 60));
  const offsetLabel =
    recommended.departureOffsetMinutes === 0
      ? 'bây giờ'
      : `sau +${recommended.departureOffsetMinutes} phút`;

  const riskLabel = recommended.riskLevel === 'low' ? 'thấp' : recommended.riskLevel === 'medium' ? 'trung bình' : 'cao';
  return `Thời gian xuất phát tốt nhất là ${offsetLabel}. Thời gian đến dự kiến khoảng ${bestEtaMinutes} phút với rủi ro tắc nghẽn ${riskLabel}.`;
}
