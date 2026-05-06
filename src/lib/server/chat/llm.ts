import type { ChatClientContext, ChatResponse } from '@/lib/chat/types';

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.6-flash';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function enhanceChatResponse(
  message: string,
  context: ChatClientContext,
  result: ChatResponse,
): Promise<ChatResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return result;
  }

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'SmartRoute Assistant',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              'Bạn là SmartRoute Assistant.',
              'Viết câu trả lời tiếng Việt tự nhiên, ngắn gọn, rõ ràng.',
              'Không bịa dữ liệu mới.',
              'Giữ nguyên ý nghĩa của câu trả lời nháp và bám sát context hiện tại của bản đồ.',
              'Nếu có route/action sẵn, chỉ diễn giải; không nói về JSON hay action nội bộ.',
            ].join(' '),
          },
          {
            role: 'user',
            content: buildEnhancementPrompt(message, context, result),
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return result;
    }

    const data = await response.json();
    const content = extractMessageContent(data);
    if (!content) {
      return result;
    }

    return {
      ...result,
      answer: content.trim(),
    };
  } catch {
    return result;
  }
}

function buildEnhancementPrompt(
  message: string,
  context: ChatClientContext,
  result: ChatResponse,
) {
  const selectedRoute = (context.alternativeRoutes ?? []).find(
    (route) => route.id === context.selectedRouteId,
  );

  return [
    `Tin nhắn người dùng: ${message}`,
    `Intent: ${result.intent}`,
    `Câu trả lời nháp: ${result.answer}`,
    `Điểm đi: ${context.origin?.label || formatCoord(context.origin) || 'chưa có'}`,
    `Điểm đến: ${context.destination?.label || formatCoord(context.destination) || 'chưa có'}`,
    `Số tuyến hiện có: ${(context.alternativeRoutes ?? []).length}`,
    selectedRoute
      ? `Tuyến đang chọn: ${selectedRoute.label}, ${Math.round(selectedRoute.route.durationSeconds / 60)} phút, rủi ro ${selectedRoute.analysis.riskLevel || 'unknown'}`
      : 'Tuyến đang chọn: chưa có',
    context.visibleStats
      ? `Giao thông khung nhìn: ${context.visibleStats.visibleSegments} đoạn, ${Math.round(
          context.visibleStats.congestedRatio * 100,
        )}% kẹt`
      : 'Giao thông khung nhìn: chưa có',
    context.hotspotSummary
      ? `Hotspots hoạt động: ${context.hotspotSummary.activeHotspots}, mức nặng: ${context.hotspotSummary.highSeverityHotspots}`
      : 'Hotspots: chưa có',
    'Hãy viết lại câu trả lời cuối cùng cho người dùng.',
  ].join('\n');
}

function formatCoord(point?: { lat: number; lng: number }) {
  if (!point) return null;
  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

function extractMessageContent(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  return null;
}
