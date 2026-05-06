'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChatAction, ChatClientContext, ChatMessageData, ChatResponse } from '@/lib/chat/types';
import ChatMessage from './ChatMessage';
import SuggestedPrompts from './SuggestedPrompts';

interface SmartRouteChatProps {
  context: ChatClientContext;
  onAction?: (action: ChatAction) => void;
  inline?: boolean;
}

export const SmartRouteChat: React.FC<SmartRouteChatProps> = ({ context, onAction, inline = false }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: ChatMessageData = { role: 'user', content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text.trim(), context }),
        });

        const data = (await res.json()) as ChatResponse;
        const botMsg: ChatMessageData = {
          role: 'assistant',
          content: data.answer,
          actions: data.actions,
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Xin loi, da co loi xay ra. Vui long thu lai.' },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [context, loading],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const triggerStyle: React.CSSProperties = inline
    ? {
        position: 'relative',
        zIndex: 1300,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
        color: 'white',
        border: 'none',
        boxShadow: '0 4px 16px rgba(109, 40, 217, 0.4)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        transition: 'transform 0.15s',
      }
    : {
        position: 'absolute',
        bottom: 20,
        left: 16,
        zIndex: 1300,
        width: 52,
        height: 52,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
        color: 'white',
        border: 'none',
        boxShadow: '0 4px 16px rgba(109, 40, 217, 0.4)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        transition: 'transform 0.15s',
      };

  const panelStyle: React.CSSProperties = inline
      ? {
        position: 'fixed',
        top: 80,
        left: 10,
        zIndex: 1300,
        width: 'min(380px, calc(100vw - 32px))',
        height: 'min(420px, calc(100vh - 96px))',
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 10px 40px rgba(15, 23, 42, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }
    : {
        position: 'absolute',
        bottom: 20,
        left: 16,
        zIndex: 1300,
        width: 'min(380px, calc(100vw - 32px))',
        height: 'min(520px, calc(100vh - 120px))',
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 10px 40px rgba(15, 23, 42, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      };

  const panel = open ? (
    <div style={panelStyle}>
      <div
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>SmartRoute Assistant</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Hoi ve tuyen duong, giao thong, gio di</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: 'white',
            width: 28,
            height: 28,
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &times;
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          background: '#fafafa',
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 8px 8px' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              Hay hoi ve tinh hinh giao thong hoac tuyen duong cua ban.
            </div>
            <SuggestedPrompts onSelect={(prompt) => void sendMessage(prompt)} />
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} onAction={onAction} />
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
            <div
              style={{
                padding: '8px 14px',
                borderRadius: '12px 12px 12px 2px',
                background: '#f1f5f9',
                color: '#64748b',
                fontSize: 13,
              }}
            >
              <span style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>Dang suy nghi...</span>
            </div>
          </div>
        )}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
          borderTop: '1px solid #e2e8f0',
          background: 'white',
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hoi ve giao thong..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 999,
            border: '1px solid #e2e8f0',
            fontSize: 13,
            outline: 'none',
            background: '#f8fafc',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: loading || !input.trim() ? '#cbd5e1' : '#7c3aed',
            color: 'white',
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  ) : null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={triggerStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
          }}
          aria-label="Open SmartRoute Chat"
          title="SmartRoute Assistant"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {inline ? (mounted && panel ? createPortal(panel, document.body) : null) : panel}
    </>
  );
};

export default SmartRouteChat;
