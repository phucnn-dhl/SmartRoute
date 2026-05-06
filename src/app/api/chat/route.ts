import { NextResponse } from 'next/server';
import type { ChatRequest, ChatResponse } from '@/lib/chat/types';
import { orchestrate } from '@/lib/server/chat/chatOrchestrator';
import { enhanceChatResponse } from '@/lib/server/chat/llm';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ChatRequest>;

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json(
        {
          status: 'error',
          error: { code: 'invalid_input', message: 'Message is required.' },
        },
        { status: 400 },
      );
    }

    const context = body.context ?? { timeSelection: { mode: 'now' as const } };
    const draft: ChatResponse = orchestrate(message, context);
    const result = await enhanceChatResponse(message, context, draft);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Chat orchestrator error:', error);
    return NextResponse.json(
      {
        answer: 'Xin lỗi, đã có lỗi xử lý. Vui lòng thử lại.',
        intent: 'general_help',
      } satisfies ChatResponse,
      { status: 500 },
    );
  }
}
