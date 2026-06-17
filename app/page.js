'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';

const SUGGESTIONS = [
  'Aku merasa cemas hari ini 😔',
  'Lagi overwhelmed dengan banyak hal',
  'Aku butuh seseorang untuk diajak bicara',
  'Aku merasa tidak baik-baik saja',
];

export default function Home() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Sidebar states
  const [sessionsList, setSessionsList] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [rateLimitTimer, setRateLimitTimer] = useState(0);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, rateLimitTimer]);

  // Rate Limit Countdown
  useEffect(() => {
    if (rateLimitTimer > 0) {
      const timer = setTimeout(() => setRateLimitTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [rateLimitTimer]);

  // Load sessions list
  const fetchSessionsList = async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/sessions', { cache: 'no-store' });
      const data = await res.json();
      if (data.sessions) {
        setSessionsList(data.sessions);
      }
    } catch (err) {
      console.error('Gagal memuat daftar sesi:', err);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      let currentSessionId = '';
      
      if (session) {
        await fetchSessionsList();
      }

      // Read from URL if present
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get('chat');
      
      if (urlSessionId) {
        currentSessionId = urlSessionId;
      } else {
        const LOCAL_KEY = 'teman_dengar_session';
        let storedId = localStorage.getItem(LOCAL_KEY);
        if (!storedId) {
          storedId = uuidv4();
          localStorage.setItem(LOCAL_KEY, storedId);
        }
        currentSessionId = storedId;
      }

      setActiveSessionId(currentSessionId);
      await loadChatHistory(currentSessionId);
      setIsInitializing(false);
    };

    init();
  }, [session]);

  const loadChatHistory = async (sessionId) => {
    try {
      const res = await fetch(`/api/chat?sessionId=${sessionId}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.history && data.history.length > 0) {
        const formattedHistory = data.history.map((msg) => ({
          role: msg.role,
          text: msg.parts.map((p) => p.text).join('\n'),
        }));
        setMessages(formattedHistory);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Gagal memuat history:', err);
      setMessages([]);
    }
  };

  const handleNewChat = () => {
    const newId = uuidv4();
    setActiveSessionId(newId);
    setMessages([]);
    if (!session) {
      localStorage.setItem('teman_dengar_session', newId);
    }
    // Update URL without reload
    window.history.pushState({}, '', `/?chat=${newId}`);
    setIsSidebarOpen(false); // Close mobile sidebar
  };

  const handleSelectSession = (sessionId) => {
    setActiveSessionId(sessionId);
    setMessages([]);
    setIsInitializing(true);
    if (!session) {
      localStorage.setItem('teman_dengar_session', sessionId);
    }
    window.history.pushState({}, '', `/?chat=${sessionId}`);
    loadChatHistory(sessionId).finally(() => setIsInitializing(false));
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!confirm('Apakah Anda yakin ingin menghapus obrolan ini?')) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessionsList((prev) => prev.filter((s) => s.sessionId !== sessionId));
        if (activeSessionId === sessionId) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error('Gagal menghapus sesi:', err);
    }
  };

  const handleStartRename = (sessionObj, e) => {
    e.stopPropagation();
    setEditingSessionId(sessionObj.sessionId);
    setEditTitle(sessionObj.title || 'Obrolan Baru');
  };

  const handleSaveRename = async (sessionId) => {
    if (!editTitle.trim()) {
      setEditingSessionId(null);
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() }),
      });

      if (res.ok) {
        setSessionsList((prev) =>
          prev.map((s) => (s.sessionId === sessionId ? { ...s, title: editTitle.trim() } : s))
        );
      }
    } catch (err) {
      console.error('Gagal mengganti nama:', err);
    } finally {
      setEditingSessionId(null);
    }
  };

  async function handleSend(overrideMessage) {
    const userMessage = (overrideMessage ?? input).trim();
    if (!userMessage || isLoading || !activeSessionId || rateLimitTimer > 0) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);
    
    const isFirstMessage = messages.length === 0;
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, sessionId: activeSessionId }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429 || data.code === 'RATE_LIMIT') {
          throw new Error('RATE_LIMIT');
        }
        throw new Error(data.error || 'Gagal mendapat respons');
      }

      setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);

      // Refresh session list if it was the first message
      if (isFirstMessage && session) {
        fetchSessionsList();
      }

    } catch (error) {
      console.error(error);
      if (error.message === 'RATE_LIMIT') {
        setRateLimitTimer(20);
        // Hapus pesan user yang barusan optimis ditambahkan
        setMessages((prev) => prev.slice(0, -1));
        // Kembalikan input user
        if (!overrideMessage) setInput(userMessage);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'error', text: 'Koneksiku terputus sebentar. Boleh dicoba lagi ya? 🥺' },
        ]);
      }
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

  const isEmpty = messages.length === 0 && !isInitializing;

  return (
    <div className="app-layout">
      {/* ── Sidebar Overlay (Mobile) ────────────────────────── */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <span>+</span> Obrolan Baru
          </button>
        </div>

        <div className="session-list">
          {!session && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
              Masuk untuk menyimpan banyak obrolan.
            </div>
          )}
          {session && sessionsList.map((s) => (
            <div
              key={s.sessionId}
              className={`session-item ${activeSessionId === s.sessionId ? 'active' : ''}`}
              onClick={() => handleSelectSession(s.sessionId)}
            >
              {editingSessionId === s.sessionId ? (
                <input
                  type="text"
                  className="rename-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleSaveRename(s.sessionId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename(s.sessionId);
                    if (e.key === 'Escape') setEditingSessionId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="session-title">{s.title || 'Obrolan Baru'}</span>
                  <div className="session-actions">
                    <button className="action-btn" onClick={(e) => handleStartRename(s, e)} title="Ganti Nama">
                      ✏️
                    </button>
                    <button className="action-btn delete" onClick={(e) => handleDeleteSession(s.sessionId, e)} title="Hapus">
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          {session ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-800)', padding: '0 4px' }}>
                👤 {session.user.name}
              </div>
              <button 
                onClick={() => signOut()}
                style={{ width: '100%', fontSize: '13px', padding: '8px', borderRadius: '8px', background: 'var(--gray-200)', color: 'var(--gray-700)', border: 'none', cursor: 'pointer', fontWeight: '500' }}
              >
                Keluar
              </button>
            </div>
          ) : (
            <Link 
              href="/login" 
              style={{ display: 'block', textAlign: 'center', width: '100%', fontSize: '13px', padding: '10px', borderRadius: '8px', background: 'var(--purple)', color: 'white', textDecoration: 'none', fontWeight: '600' }}
            >
              Masuk / Daftar
            </Link>
          )}
        </div>
      </aside>

      {/* ── Main Chat Area ─────────────────────────────────── */}
      <main className="main-chat-area">
        {/* Header */}
        <header className="chat-header" style={{ justifyContent: 'space-between' }}>
          <div className="header-brand">
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
              ☰
            </button>
            <div className="header-avatar" style={{ display: 'none' }}>🌸</div>
            <div className="header-info">
              <h1>Teman Dengar</h1>
            </div>
          </div>
          <div className="header-status" style={{ marginRight: '16px' }}>
            <div className="status-dot"></div>
            <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>Online</span>
          </div>
        </header>

        {/* Chat Body */}
        <div className="chat-body" style={{ margin: '0 auto', width: '100%', maxWidth: '48rem' }}>
          <div className="chat-inner">
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

        {/* Input Area */}
        <div className="input-area" style={{ margin: '0 auto', width: '100%', maxWidth: '48rem', borderTop: 'none', background: 'transparent', paddingBottom: '24px' }}>
          
          {rateLimitTimer > 0 && (
            <div style={{ padding: '10px 16px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error)', borderRadius: '12px', marginBottom: '12px', fontSize: '13px', textAlign: 'center', fontWeight: '500' }}>
              Batas pesan gratis Anda terlalu cepat. Silakan tunggu <b>{rateLimitTimer} detik</b> lagi...
            </div>
          )}

          <div className="input-inner" style={{ background: 'white', borderRadius: '16px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--purple-border)', padding: '4px' }}>
            <div className="input-box" style={{ background: 'transparent' }}>
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                rows={1}
                placeholder={rateLimitTimer > 0 ? 'Menunggu waktu cooldown...' : 'Ceritakan perasaanmu...'}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading || rateLimitTimer > 0}
                style={{ padding: '12px' }}
              />
              <button
                type="button"
                className={`send-btn ${input.trim() && !isLoading && rateLimitTimer === 0 ? 'active' : 'inactive'}`}
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim() || rateLimitTimer > 0}
                style={{ margin: '8px' }}
              >
                ↑
              </button>
            </div>
          </div>
          <p className="input-footer" style={{ textAlign: 'center', marginTop: '12px' }}>
            Teman Dengar bukan pengganti psikolog. Jika darurat, hubungi{' '}
            <span>119 ext 8</span>.
          </p>
        </div>
      </main>
    </div>
  );
}
