// src/components/ui/ChatBubble.tsx
"use client";

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from "react";
import { getSupabaseClient } from "@/services/supabaseClient";

const supabase = getSupabaseClient();

// ─── Types ────────────────────────────────────────────────────────────────────
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
  is_deleted: boolean;
  edited_at: string | null;
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
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });
}

// ─── MessageItem ──────────────────────────────────────────────────────────────
interface MessageItemProps {
  msg: Message;
  isMine: boolean;
  onEdit: (id: string, newContent: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}

function MessageItem({ msg, isMine, onEdit, onDelete }: MessageItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  // Sync content saat berubah dari realtime
  useEffect(() => {
    if (!isEditing) setEditContent(msg.content);
  }, [msg.content, isEditing]);

  // Focus saat masuk mode edit
  useEffect(() => {
    if (isEditing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [isEditing]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleSaveEdit = async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === msg.content) {
      setIsEditing(false);
      setEditContent(msg.content);
      return;
    }
    setSaving(true);
    const ok = await onEdit(msg.id, trimmed);
    setSaving(false);
    if (ok) setIsEditing(false);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(); }
    if (e.key === "Escape") { setIsEditing(false); setEditContent(msg.content); }
  };

  // ── Deleted ──
  if (msg.is_deleted) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <div className="px-3 py-1.5 rounded-2xl bg-gray-100 border border-gray-200 text-gray-400 text-[10px] italic">
          🚫 Pesan dihapus
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-end gap-1 group ${isMine ? "justify-end" : "justify-start"}`}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
    >
      {/* Edit mode */}
      {isEditing ? (
        <div className={`flex-1 max-w-[85%] rounded-2xl px-3 py-2 ${isMine ? "bg-[#1a1a2e]" : "bg-white border border-gray-200"
          }`}>
          <input
            ref={editRef}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            onKeyDown={handleEditKeyDown}
            maxLength={1000}
            className={`w-full bg-transparent text-xs outline-none ${isMine ? "text-white placeholder:text-white/40" : "text-gray-800"
              }`}
          />
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span className={`text-[9px] ${isMine ? "text-white/40" : "text-gray-400"}`}>
              Enter simpan · Esc batal
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => { setIsEditing(false); setEditContent(msg.content); }}
                className={`text-[9px] px-1.5 py-0.5 rounded transition ${isMine ? "text-white/60 hover:bg-white/10" : "text-gray-500 hover:bg-gray-100"
                  }`}
              >
                Batal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editContent.trim()}
                className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition disabled:opacity-40 ${isMine ? "bg-white/20 text-white" : "bg-[#1a1a2e] text-white"
                  }`}
              >
                {saving ? "..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Normal bubble */
        <div className="relative">
          <div className={`max-w-[220px] px-3 py-2 ${isMine
              ? "bg-[#1a1a2e] text-white rounded-t-2xl rounded-bl-2xl rounded-br-sm"
              : "bg-white text-gray-800 border border-gray-200 rounded-t-2xl rounded-br-2xl rounded-bl-sm shadow-sm"
            }`}>
            <p className="text-xs leading-relaxed break-words">{msg.content}</p>
            <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? "text-white/50" : "text-gray-400"}`}>
              {msg.edited_at && <span className="text-[9px] italic">diedit</span>}
              <span className="text-[10px]">{formatTime(msg.created_at)}</span>
              {isMine && <span className="text-[10px]">{msg.is_read ? "✓✓" : "✓"}</span>}
            </div>
          </div>

          {/* Context menu */}
          {showMenu && (
            <div
              ref={menuRef}
              className={`absolute bottom-full mb-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden py-1 min-w-[120px] ${isMine ? "right-0" : "left-0"
                }`}
            >
              {/* Edit — hanya sender */}
              {isMine && (
                <button
                  onClick={() => { setIsEditing(true); setShowMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
              {/* Delete — sender atau receiver */}
              <button
                onClick={() => { onDelete(msg.id); setShowMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Hapus
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ChatBubble ───────────────────────────────────────────────────────────────
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

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      if (unread > 0) setUnread(0);
    }
  }, [messages, minimized]);

  useEffect(() => {
    if (minimized) {
      const newUnread = messages.filter(m => m.sender_id === targetUser.id && !m.is_read).length;
      setUnread(newUnread);
    }
  }, [messages, minimized, targetUser.id]);

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${[currentUser.id, targetUser.id].sort().join(":")}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${currentUser.id}` },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.sender_id !== targetUser.id) return;
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (minimized) setUnread(u => u + 1);
        }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const updated = payload.new as Message;
          // Hanya update jika pesan ini ada di percakapan ini
          setMessages(prev =>
            prev.map(m => m.id === updated.id
              ? { ...m, content: updated.content, is_deleted: updated.is_deleted, edited_at: updated.edited_at }
              : m
            )
          );
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [currentUser.id, targetUser.id, minimized]);

  // ── Send ──────────────────────────────────────────────────────────────────
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
      is_deleted: false,
      edited_at: null,
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
        setMessages(prev => prev.map(m => m.id === optimistic.id ? data.message : m));
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMessage = async (messageId: string) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true } : m));
    try {
      await fetch(`/api/messages?id=${messageId}`, { method: "DELETE" });
    } catch {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: false } : m));
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const editMessage = async (messageId: string, newContent: string): Promise<boolean> => {
    setMessages(prev =>
      prev.map(m => m.id === messageId
        ? { ...m, content: newContent, edited_at: new Date().toISOString() }
        : m
      )
    );
    try {
      const res = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: messageId, content: newContent }),
      });
      const data = await res.json();
      if (!data.success) {
        // Rollback
        await fetchMessages();
        return false;
      }
      return true;
    } catch {
      await fetchMessages();
      return false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ── Minimized ─────────────────────────────────────────────────────────────
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

  // ── Expanded ──────────────────────────────────────────────────────────────
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
          <button
            onClick={e => { e.stopPropagation(); setMinimized(true); }}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 rounded transition"
            title="Kecilkan"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
            </svg>
          </button>
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

      {/* Messages */}
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
          messages.map(msg => (
            <MessageItem
              key={msg.id}
              msg={msg}
              isMine={msg.sender_id === currentUser.id}
              onEdit={editMessage}
              onDelete={deleteMessage}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
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

// ─── ChatManager ──────────────────────────────────────────────────────────────
interface ActiveChat { user: ChatUser; }
interface ChatManagerProps {
  currentUser: ChatUser;
  activeChats: ActiveChat[];
  onClose: (userId: string) => void;
}

export function ChatManager({ currentUser, activeChats, onClose }: ChatManagerProps) {
  if (activeChats.length === 0) return null;
  return (
    <div className="fixed bottom-0 right-4 z-[9999] flex items-end gap-3 pointer-events-none">
      {activeChats.map((chat, idx) => (
        <div key={chat.user.id} className="pointer-events-auto"
          style={{ marginRight: idx === 0 ? 0 : undefined }}>
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