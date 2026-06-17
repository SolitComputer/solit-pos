// src/components/ui/ChatBubble.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/services/supabaseClient";

const supabase = getSupabaseClient();

interface ChatUser {
  id: string;
  name: string;
  role: string;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface ChatBubbleProps {
  currentUser: ChatUser;
  targetUser: ChatUser;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
  KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing", KEPALA_TEKNISI: "Kepala Teknisi",
  CREW_SALES: "Crew Sales", SOTECH: "Sotech", ACCOUNTING: "Accounting",
  PENGELOLA_BARANG: "Pengelola Barang", TEKNISI: "Teknisi", PENGANTARAN: "Pengantaran",
  MARKETING: "Marketing", KEBERSIHAN: "Kebersihan",
  PENYEDIA_BARANG: "Penyedia Barang", KEPALA_PENYEDIA_BARANG: "Kepala Penyedia Barang",
  KONTEN: "Konten", KEPALA_ONPOINT: "Kepala Onpoint", ONPOINT: "Onpoint",
  KEPALA_SOTECH: "Kepala Sotech", PKL: "PKL", CUSTOMER_SERVICE: "Customer Service",
};

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

export function ChatBubble({ currentUser, targetUser, onClose }: ChatBubbleProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch history
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages?with=${targetUser.id}`);
      const data = await res.json();
      if (data.success) setMessages(data.messages);
    } finally {
      setLoading(false);
    }
  }, [targetUser.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      if (unread > 0) setUnread(0);
    }
  }, [messages, minimized]);

  // Count unread when minimized
  useEffect(() => {
    if (minimized) {
      const newUnread = messages.filter(
        m => m.sender_id === targetUser.id && !m.is_read
      ).length;
      setUnread(newUnread);
    }
  }, [messages, minimized, targetUser.id]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${[currentUser.id, targetUser.id].sort().join(":")}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          // Filter: pesan antara dua user ini saja
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          // Hanya proses jika dari targetUser
          if (msg.sender_id !== targetUser.id) return;
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (minimized) setUnread(u => u + 1);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
    };
  }, [currentUser.id, targetUser.id, minimized]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      sender_id: currentUser.id,
      receiver_id: targetUser.id,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setInput("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiver_id: targetUser.id, content }),
      });
      const data = await res.json();
      if (data.success) {
        // Replace optimistic dengan real message
        setMessages(prev =>
          prev.map(m => m.id === optimistic.id ? data.message : m)
        );
      } else {
        // Rollback
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ── Minimized state (hanya header) ────────────────────────────────────────
  if (minimized) {
    return (
      <div
        className="flex items-center gap-2 bg-[#1a1a2e] text-white rounded-full px-3 py-2 shadow-2xl cursor-pointer hover:bg-[#16213e] transition select-none"
        onClick={() => { setMinimized(false); setUnread(0); }}
        style={{ minWidth: 160, maxWidth: 220 }}
      >
        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {getInitials(targetUser.name)}
        </div>
        <span className="text-xs font-semibold truncate flex-1">{targetUser.name.split(" ")[0]}</span>
        {unread > 0 && (
          <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="w-5 h-5 flex items-center justify-center text-white/60 hover:text-white transition flex-shrink-0"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Expanded state ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-white rounded-t-2xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ width: 300, height: 400 }}>

      {/* Header */}
      <div className="bg-[#1a1a2e] px-3 py-2.5 flex items-center gap-2 flex-shrink-0 cursor-pointer"
        onClick={() => setMinimized(true)}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {getInitials(targetUser.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{targetUser.name}</p>
          <p className="text-[10px] text-white/50 truncate">{ROLE_LABEL[targetUser.role] ?? targetUser.role}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Minimize */}
          <button
            onClick={e => { e.stopPropagation(); setMinimized(true); }}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 rounded transition"
            title="Kecilkan"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
            </svg>
          </button>
          {/* Close */}
          <button
            onClick={e => { e.stopPropagation(); onClose(); }}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 rounded transition"
            title="Tutup"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-[#1a1a2e] rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <span className="text-2xl">💬</span>
            <p className="text-xs text-gray-400">Belum ada pesan.<br />Mulai percakapan!</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMine = msg.sender_id === currentUser.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] ${isMine
                  ? "bg-[#1a1a2e] text-white rounded-t-2xl rounded-bl-2xl rounded-br-sm"
                  : "bg-white text-gray-800 border border-gray-200 rounded-t-2xl rounded-br-2xl rounded-bl-sm shadow-sm"
                } px-3 py-2`}>
                  <p className="text-xs leading-relaxed break-words">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? "text-white/50" : "text-gray-400"} text-right`}>
                    {formatTime(msg.created_at)}
                    {isMine && (
                      <span className="ml-1">{msg.is_read ? "✓✓" : "✓"}</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-3 py-2 bg-white border-t border-gray-100 flex items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tulis pesan..."
          maxLength={1000}
          className="flex-1 text-xs bg-gray-100 rounded-full px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition placeholder:text-gray-400"
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="w-8 h-8 bg-[#1a1a2e] text-white rounded-full flex items-center justify-center disabled:opacity-40 hover:bg-[#16213e] transition flex-shrink-0"
        >
          {sending ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── ChatManager — mengelola multiple chat windows ─────────────────────────────
interface ActiveChat {
  user: ChatUser;
}

interface ChatManagerProps {
  currentUser: ChatUser;
  activeChats: ActiveChat[];
  onClose: (userId: string) => void;
}

export function ChatManager({ currentUser, activeChats, onClose }: ChatManagerProps) {
  if (activeChats.length === 0) return null;

  return (
    // Fixed bottom-right, chats stack dari kanan ke kiri
    <div className="fixed bottom-0 right-4 z-[9999] flex items-end gap-3 pointer-events-none">
      {activeChats.map((chat, idx) => (
        <div
          key={chat.user.id}
          className="pointer-events-auto"
          style={{ marginRight: idx === 0 ? 0 : undefined }}
        >
          <ChatBubble
            currentUser={currentUser}
            targetUser={chat.user}
            onClose={() => onClose(chat.user.id)}
          />
        </div>
      ))}
    </div>
  );
}