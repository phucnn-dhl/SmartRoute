'use client';

import React from 'react';
import type { ChatAction, ChatMessageData } from '@/lib/chat/types';

interface ChatMessageProps {
  message: ChatMessageData;
  onAction?: (action: ChatAction) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onAction }) => {
  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div
          style={{
            maxWidth: '85%',
            padding: '8px 12px',
            borderRadius: '12px 12px 2px 12px',
            background: '#2563eb',
            color: 'white',
            fontSize: 13,
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
      <div style={{ maxWidth: '90%' }}>
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '12px 12px 12px 2px',
            background: '#f1f5f9',
            color: '#0f172a',
            fontSize: 13,
            lineHeight: 1.5,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content}
        </div>
        {message.actions && message.actions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {message.actions.map((action, i) => (
              <button
                key={`${action.type}-${i}`}
                type="button"
                onClick={() => onAction?.(action)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid #c4b5fd',
                  background: '#faf5ff',
                  color: '#7c3aed',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = '#ede9fe';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = '#faf5ff';
                }}
              >
                {getActionLabel(action)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function getActionLabel(action: ChatAction): string {
  switch (action.type) {
    case 'select_route':
      return 'Chọn tuyến này';
    case 'set_departure_offset':
      return action.offsetMinutes === 0 ? 'Đi ngay bây giờ' : `Đổi sang +${action.offsetMinutes} phút`;
    case 'open_route_panel':
      return 'Mở bảng route';
    case 'show_congested_segments':
      return 'Xem đoạn kẹt';
    case 'fill_route':
      return 'Tạo route này';
  }
}

export default ChatMessage;
