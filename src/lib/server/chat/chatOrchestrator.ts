import type { ChatAction, ChatClientContext, ChatIntent, ChatResponse } from '@/lib/chat/types';
import {
  compareRoutes,
  getDepartureAdvice,
  getHotspotSummary,
  getRouteContext,
  getTrafficSummary,
} from './tools';

export function orchestrate(message: string, context: ChatClientContext): ChatResponse {
  const normalized = normalizeText(message);
  const intent = detectIntent(normalized);

  switch (intent) {
    case 'departure_recommendation':
      return handleDepartureRecommendation(context);
    case 'route_recommendation':
    case 'route_comparison':
      return handleRouteRecommendation(context, intent);
    case 'explain_prediction':
      return handleExplainPrediction(context);
    case 'hotspot_question':
      return handleHotspotQuestion(context);
    case 'traffic_summary':
      return handleTrafficSummary(context);
    case 'route_creation':
      return handleRouteCreation(message, normalized);
    default:
      return handleGeneralHelp(context);
  }
}

function detectIntent(message: string): ChatIntent {
  if (
    includesAny(message, [
      'di bay gio',
      'di ngay',
      'nen di',
      'di khi nao',
      'di luc nao',
      'gio di',
      'nen xuat phat',
      '+15',
      '+30',
      '+60',
      'tre khong',
      'do ket',
      'co nen doi',
    ])
  ) {
    return 'departure_recommendation';
  }

  if (
    includesAny(message, [
      'tuyen nao',
      'route nao',
      'duong nao',
      'it ket',
      'nhanh nhat',
      'tot nhat',
      'so sanh',
      'phuong an',
      'tuyen khac',
      'chon tuyen',
    ])
  ) {
    return 'route_recommendation';
  }

  if (
    includesAny(message, [
      'vi sao',
      'tai sao',
      'giai thich',
      'chon tuyen',
      'ket vi',
      'tai sao lai',
    ])
  ) {
    return 'explain_prediction';
  }

  if (
    includesAny(message, [
      'hotspot',
      'ket cho',
      'doan nang',
      'ket nang',
      'gan truong',
      'diem nong',
      'doan nao dang ket',
    ])
  ) {
    return 'hotspot_question';
  }

  if (
    includesAny(message, [
      'tom tat',
      'tinh hinh',
      'xung quanh',
      'quanh day',
      'giao thong hien tai',
      'overview',
    ])
  ) {
    return 'traffic_summary';
  }

  if (parseRouteRequest(message, message) || parseRouteRequest(message, normalizeText(message))) {
    return 'route_creation';
  }

  return 'general_help';
}

function handleDepartureRecommendation(context: ChatClientContext): ChatResponse {
  const advice = getDepartureAdvice(context);

  if (!context.origin || !context.destination) {
    return {
      answer:
        'Bạn chưa chọn điểm đi và điểm đến. Hãy nhập hai điểm trước, tôi sẽ tư vấn nên đi ngay hay dời sang khung giờ khác.',
      intent: 'departure_recommendation',
      actions: [{ type: 'open_route_panel' }],
    };
  }

  if (!advice || !advice.best) {
    const routeCtx = getRouteContext(context);
    if (!routeCtx.hasRoute) {
      return {
        answer:
          'Hiện chưa có tuyến nào được tính. Hãy tìm đường trước, sau đó tôi sẽ so sánh các mốc giờ xuất phát.',
        intent: 'departure_recommendation',
        actions: [{ type: 'open_route_panel' }],
      };
    }

    return {
      answer: 'Tuyến đã có nhưng khuyến nghị giờ đi vẫn chưa tính xong. Bạn thử lại sau vài giây.',
      intent: 'departure_recommendation',
    };
  }

  const best = advice.best;
  const rec = advice.recommendation;
  const delayMin = Math.max(0, Math.round((best.delaySeconds ?? 0) / 60));
  const riskLabel = riskToVietnamese(best.riskLevel);
  const actions: ChatAction[] = [];

  let answer: string;
  if (best.departureOffsetMinutes === 0 && best.recommended) {
    answer = `Nên đi ngay bây giờ. Đây là mốc tốt nhất hiện tại, dự kiến trễ khoảng ${delayMin} phút và mức rủi ro ${riskLabel}.`;
  } else if (best.departureOffsetMinutes > 0) {
    answer = `Khuyến nghị dời giờ xuất phát sang +${best.departureOffsetMinutes} phút. Khi đó thời gian trễ dự kiến khoảng ${delayMin} phút và mức rủi ro ${riskLabel}.`;
    actions.push({ type: 'set_departure_offset', offsetMinutes: best.departureOffsetMinutes });
  } else {
    const better = rec.options.find((option) => option.recommended && option.departureOffsetMinutes > 0);
    const betterOffset = better?.departureOffsetMinutes ?? 30;
    answer = `Chưa nên đi ngay. Nếu dời sang +${betterOffset} phút thì tuyến sẽ đỡ kẹt hơn và ổn định hơn.`;
    actions.push({ type: 'set_departure_offset', offsetMinutes: betterOffset });
  }

  return { answer, intent: 'departure_recommendation', actions };
}

function handleRouteRecommendation(context: ChatClientContext, intent: ChatIntent): ChatResponse {
  if (!context.origin || !context.destination) {
    return {
      answer: 'Bạn chưa có cặp điểm đi và đến. Hãy nhập route trước để tôi so sánh các phương án.',
      intent,
      actions: [{ type: 'open_route_panel' }],
    };
  }

  const comparison = compareRoutes(context);
  if (!comparison) {
    return {
      answer: 'Chưa có tuyến nào để so sánh. Bạn hãy chạy tìm đường trước.',
      intent,
      actions: [{ type: 'open_route_panel' }],
    };
  }

  const { routes } = getRouteContext(context);
  if (routes.length === 1) {
    const route = routes[0];
    return {
      answer: `Hiện chỉ có 1 tuyến: ${formatDuration(route.route.durationSeconds)}, ${formatDistance(route.route.distanceMeters)}, rủi ro ${riskToVietnamese(route.analysis.riskLevel)}, trễ dự kiến ${formatDelay(route.score.predictedDelaySeconds)}.`,
      intent,
      referencedRouteId: route.id,
    };
  }

  const leastCongested = comparison.leastCongested!;
  const fastest = comparison.fastest!;
  const lines = routes.map((route) => {
    const prefix = route.id === context.selectedRouteId ? 'Đang chọn' : getLabelName(route.label);
    return `- ${prefix}: ${formatDuration(route.route.durationSeconds)}, ${formatDistance(route.route.distanceMeters)}, rủi ro ${riskToVietnamese(route.analysis.riskLevel)}, trễ ${formatDelay(route.score.predictedDelaySeconds)}`;
  });

  const actions: ChatAction[] = [];
  if (leastCongested.id !== context.selectedRouteId) {
    actions.push({ type: 'select_route', routeId: leastCongested.id });
  }

  return {
    answer: [
      `Có ${routes.length} tuyến để so sánh:`,
      ...lines,
      '',
      `Tuyến ít kẹt nhất là ${getLabelName(leastCongested.label)} với congestion score ${leastCongested.score.congestionScore.toFixed(2)}.`,
      `Tuyến nhanh nhất là ${getLabelName(fastest.label)} với thời gian khoảng ${formatDuration(fastest.route.durationSeconds)}.`,
    ].join('\n'),
    intent: 'route_comparison',
    actions,
    referencedRouteId: leastCongested.id,
  };
}

function handleExplainPrediction(context: ChatClientContext): ChatResponse {
  const { selected, hasRoute } = getRouteContext(context);

  if (!hasRoute || !selected) {
    return {
      answer: 'Chưa có tuyến nào được chọn để giải thích. Hãy tìm đường trước.',
      intent: 'explain_prediction',
      actions: [{ type: 'open_route_panel' }],
    };
  }

  const analysis = selected.analysis;
  const score = selected.score;
  const delayMin = Math.max(0, Math.round((analysis.delaySeconds ?? 0) / 60));
  const congestedCount = analysis.congestedSegments?.length ?? 0;

  const answerParts = [
    `Tuyến ${getLabelName(selected.label)} đang được ưu tiên vì final cost của nó là ${formatDuration(score.finalCostSeconds)}.`,
    `Trong đó đã cộng cả thời gian cơ bản, trễ dự báo, mức rủi ro và penalty khi độ phủ dữ liệu chưa tốt.`,
    `Rủi ro hiện tại: ${riskToVietnamese(analysis.riskLevel)}.`,
    `Trễ dự kiến: khoảng ${delayMin} phút.`,
    `Congestion score: ${score.congestionScore.toFixed(2)}.`,
  ];

  const actions: ChatAction[] = [];
  if (congestedCount > 0) {
    answerParts.push(`Trên tuyến có ${congestedCount} đoạn được dự báo kẹt rõ rệt.`);
    if (analysis.summary) {
      answerParts.push(analysis.summary);
    }
    actions.push({ type: 'show_congested_segments' });
  } else {
    answerParts.push('Hiện chưa thấy đoạn kẹt nặng nào nổi bật trên tuyến.');
  }

  if (analysis.coverage && analysis.coverage.level !== 'good') {
    answerParts.push(
      `Lưu ý: độ phủ dữ liệu chỉ khoảng ${Math.round(
        (analysis.coverage.coverageRatio ?? 0) * 100,
      )}%, nên phần dự báo này có độ chắc chắn thấp hơn bình thường.`,
    );
  }

  return {
    answer: answerParts.join('\n'),
    intent: 'explain_prediction',
    actions,
    referencedRouteId: selected.id,
  };
}

function handleHotspotQuestion(context: ChatClientContext): ChatResponse {
  const hs = getHotspotSummary(context);

  if (!hs || hs.statuses.length === 0) {
    const { selected } = getRouteContext(context);
    const congestedCount = selected?.analysis?.congestedSegments?.length ?? 0;
    if (congestedCount > 0) {
      return {
        answer: `Hiện chưa có feed hotspot realtime đủ tốt, nhưng tuyến đang chọn có ${congestedCount} đoạn được dự báo kẹt (LOS E/F). Tôi có thể đưa bạn tới các đoạn này trên bản đồ.`,
        intent: 'hotspot_question',
        actions: [{ type: 'show_congested_segments' }],
      };
    }

    return {
      answer: 'Hiện chưa có dữ liệu hotspot realtime khả dụng. Bạn có thể hỏi về tuyến đang đi hoặc tình hình giao thông trong khung nhìn hiện tại.',
      intent: 'hotspot_question',
    };
  }

  const severe = hs.statuses
    .filter((status) => status.status === 'live' || status.status === 'cached')
    .filter((status) => status.severity >= 0.7)
    .slice(0, 5);

  if (severe.length === 0) {
    return {
      answer: `Có ${hs.activeHotspots} hotspot đang hoạt động, nhưng hiện chưa có điểm nào ở mức nghiêm trọng cao.`,
      intent: 'hotspot_question',
    };
  }

  return {
    answer: [
      `Hiện có ${hs.activeHotspots} hotspot hoạt động. Các điểm đáng chú ý nhất là:`,
      ...severe.map(
        (spot) => `- ${spot.name}: severity ${spot.severity.toFixed(2)} (${statusLabel(spot.status)})`,
      ),
    ].join('\n'),
    intent: 'hotspot_question',
  };
}

function handleTrafficSummary(context: ChatClientContext): ChatResponse {
  const summary = getTrafficSummary(context);

  if (!summary || summary.total === 0) {
    return {
      answer: 'Khung nhìn hiện tại chưa có dữ liệu giao thông. Bạn thử zoom gần hơn hoặc di chuyển sang khu vực khác.',
      intent: 'traffic_summary',
    };
  }

  const distribution = ['A', 'B', 'C', 'D', 'E', 'F']
    .filter((los) => summary.losDistribution[los])
    .map((los) => `${los}: ${summary.losDistribution[los]}`)
    .join(', ');

  const congestedPct = Math.round(summary.congestedRatio * 100);
  let closing = 'Giao thông đang khá thông thoáng.';
  if (congestedPct > 30) {
    closing = 'Mức ùn tắc đang khá cao. Nếu được, nên cân nhắc dời giờ đi.';
  } else if (congestedPct > 15) {
    closing = 'Mức giao thông trung bình, có một số điểm nghẽn cục bộ.';
  }

  return {
    answer: [
      'Tóm tắt giao thông trong khung nhìn hiện tại:',
      `- ${summary.total.toLocaleString()} đoạn đường đang hiển thị`,
      `- ${congestedPct}% ở mức kẹt (LOS E/F)`,
      distribution ? `- Phân bố LOS: ${distribution}` : '',
      '',
      closing,
    ]
      .filter(Boolean)
      .join('\n'),
    intent: 'traffic_summary',
  };
}

function handleRouteCreation(originalMessage: string, normalizedMessage: string): ChatResponse {
  const parsed = parseRouteRequest(originalMessage, normalizedMessage);
  if (!parsed) {
    return {
      answer:
        'Tôi hiểu bạn đang muốn tạo route. Hãy nói theo mẫu như: "đi từ chợ Bến Thành đến sân bay Tân Sơn Nhất".',
      intent: 'route_creation',
      actions: [{ type: 'open_route_panel' }],
    };
  }

  return {
    answer: `Tôi sẽ chuẩn bị tuyến từ "${parsed.origin}" đến "${parsed.destination}". Nếu hệ thống không định vị chính xác, bạn chỉ cần chọn lại từ danh sách gợi ý.`,
    intent: 'route_creation',
    actions: [
      {
        type: 'fill_route',
        originQuery: parsed.origin,
        destinationQuery: parsed.destination,
      },
    ],
  };
}

function handleGeneralHelp(context: ChatClientContext): ChatResponse {
  const hasRoute = (context.alternativeRoutes?.length ?? 0) > 0;

  return {
    answer: [
      'Tôi có thể giúp bạn:',
      '- Tư vấn nên đi ngay hay dời sang +15, +30, +60 phút',
      '- So sánh các tuyến và chọn tuyến ít kẹt hơn',
      '- Giải thích vì sao SmartRoute chọn tuyến hiện tại',
      '- Tóm tắt giao thông trong khung nhìn',
      '- Liệt kê các hotspot đang đáng chú ý',
      hasRoute
        ? '- Bạn cũng có thể hỏi: "vì sao chọn tuyến này?" hoặc "nên đi bây giờ không?"'
        : '- Bạn có thể bắt đầu bằng câu: "đi từ chợ Bến Thành đến sân bay Tân Sơn Nhất"',
    ].join('\n'),
    intent: 'general_help',
    actions: hasRoute ? undefined : [{ type: 'open_route_panel' }],
  };
}

function parseRouteRequest(originalMessage: string, normalizedMessage: string) {
  const source = /(?:di|toi|tim duong|route)?\s*tu\s+(.+?)\s+(?:den|toi|sang)\s+(.+)/i.exec(
    normalizedMessage,
  );

  if (!source) {
    return null;
  }

  const originalLower = originalMessage.toLowerCase();
  const startIndex = originalLower.indexOf('từ');
  if (startIndex >= 0) {
    const originalMatch = /từ\s+(.+?)\s+(?:đến|tới|sang)\s+(.+)/i.exec(originalMessage);
    if (originalMatch) {
      return {
        origin: cleanRouteQuery(originalMatch[1]),
        destination: cleanRouteQuery(originalMatch[2]),
      };
    }
  }

  return {
    origin: cleanRouteQuery(source[1]),
    destination: cleanRouteQuery(source[2]),
  };
}

function cleanRouteQuery(value: string) {
  return value.replace(/[?.!,]+$/g, '').trim();
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(message: string, patterns: string[]) {
  return patterns.some((pattern) => message.includes(pattern));
}

function riskToVietnamese(risk: string | undefined): string {
  switch (risk) {
    case 'low':
      return 'thấp';
    case 'medium':
      return 'trung bình';
    case 'high':
      return 'cao';
    default:
      return 'không xác định';
  }
}

function getLabelName(label: string): string {
  switch (label) {
    case 'recommended':
      return 'tuyến khuyến nghị';
    case 'fastest':
      return 'tuyến nhanh nhất';
    case 'least_congested':
      return 'tuyến ít kẹt';
    default:
      return 'phương án thay thế';
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDelay(seconds: number): string {
  if (!seconds || seconds <= 0) return '+0 phút';
  return `+${Math.max(1, Math.round(seconds / 60))} phút`;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'live':
      return 'live';
    case 'cached':
      return 'cached';
    case 'stale':
      return 'stale';
    case 'error':
      return 'error';
    case 'mock':
      return 'mock';
    default:
      return status;
  }
}
