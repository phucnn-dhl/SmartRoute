'use client';

import React from 'react';

const SUGGESTED_PROMPTS = [
  'Nên đi bây giờ không?',
  'Tuyến nào ít kẹt nhất?',
  'Vì sao chọn tuyến này?',
  'Có đoạn nào đang kẹt nặng?',
  'Đi từ chợ Bến Thành đến sân bay Tân Sơn Nhất',
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export const SuggestedPrompts: React.FC<SuggestedPromptsProps> = ({ onSelect }) => {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0' }}>
      {SUGGESTED_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          style={{
            padding: '5px 10px',
            borderRadius: 999,
            border: '1px solid #e2e8f0',
            background: '#fff',
            color: '#334155',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            const el = e.target as HTMLElement;
            el.style.background = '#f8fafc';
            el.style.borderColor = '#94a3b8';
          }}
          onMouseLeave={(e) => {
            const el = e.target as HTMLElement;
            el.style.background = '#fff';
            el.style.borderColor = '#e2e8f0';
          }}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
};

export default SuggestedPrompts;
