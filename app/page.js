'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const SUGGESTIONS = [
  'Aku merasa cemas hari ini 😔',
  'Lagi overwhelmed dengan banyak hal',
  'Aku butuh seseorang untuk diajak bicara',
  'Aku merasa tidak baik-baik saja',
];

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const sessionIdRef = useRef(uuidv4());
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function handleSend(overrideMessage) {
    const userMessage = (overrideMessage ?? input).trim();
    const sessionId = sessionIdRef.current;

    if (!userMessage || isLoading || !sessionId) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, sessionId }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Gagal mendapat respons');

      setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: 'Koneksiku terputus sebentar. Boleh dicoba lagi ya? 🥺' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTextareaChange(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  }

  const isEmpty = messages.length === 0;

  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FAFAF9' }}>

      {/* ── Header ──────────────────────────────────────── */}
      <header className="chat-header">
        <div className="header-brand">
          <div className="header-avatar">🌸</div>
          <div className="header-info">
            <h1>Teman Dengar</h1>
            <p>Siap mendengarkanmu dengan hangat</p>
          </div>
        </div>
        <div className="header-status">
          <div className="status-dot"></div>
          <span>Online</span>
        </div>
      </header>

      {/* ── Chat Body ────────────────────────────────────── */}
      <div className="chat-body">
        <div className="chat-inner">

          {/* Empty State */}
          {isEmpty && (
            <div className="empty-state">
              <div className="empty-icon">✨</div>
              <h2>Hei, apa yang kamu rasakan?</h2>
              <p>Aku di sini untuk mendengarkan tanpa menghakimi. Ceritakan apapun yang ada di pikiranmu.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="suggestion-btn"
                    onClick={() => handleSend(s)}
                    disabled={isLoading}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`message-row ${msg.role === 'user' ? 'user-row' : ''}`}
            >
              {msg.role !== 'user' && (
                <div className="msg-avatar">🌸</div>
              )}
              <div
                className={`msg-bubble ${
                  msg.role === 'user'
                    ? 'bubble-user'
                    : msg.role === 'error'
                      ? 'bubble-error'
                      : 'bubble-model'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="message-row">
              <div className="msg-avatar">🌸</div>
              <div className="typing-bubble">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          )}

          <div ref={bottomRef} style={{ height: '8px' }} />
        </div>
      </div>

      {/* ── Input Area ───────────────────────────────────── */}
      <div className="input-area">
        <div className="input-inner">
          <div className="input-box">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              rows={1}
              placeholder="Ceritakan perasaanmu..."
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              type="button"
              className={`send-btn ${input.trim() && !isLoading ? 'active' : 'inactive'}`}
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
            >
              ↑
            </button>
          </div>
          <p className="input-footer">
            Teman Dengar bukan pengganti psikolog profesional. Jika darurat, hubungi{' '}
            <span>119 ext 8</span>.
          </p>
        </div>
      </div>
    </main>
  );
}
