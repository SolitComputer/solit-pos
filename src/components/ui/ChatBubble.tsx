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
  attachment_url: string | null;
  attachment_type: "image" | "file" | null;
  attachment_name: string | null;
  attachment_size: number | null;
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
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Logo Solit ────────────────────────────────────────────────────────────────
function SolitLogo({ size = 38, radius = 12 }: { size?: number; radius?: number }) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div
        className="flex items-center justify-center font-black text-white"
        style={{
          width: size, height: size, borderRadius: radius,
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          fontSize: size * 0.24,
          letterSpacing: "0.5px",
        }}
      >
        S03
      </div>
    );
  }
  return (
    <img
      src="/assets/solit03.jpeg"
      alt="Solit 03"
      onError={() => setImgError(true)}
      style={{
        width: size, height: size, borderRadius: radius,
        objectFit: "cover", display: "block",
      }}
    />
  );
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────
function ImageLightbox({ url, name, onClose }: { url: string; name: string | null; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.95)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <button
        className="absolute top-5 right-5 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
        onClick={onClose}
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {name && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-xs font-medium px-4 py-2"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 100 }}>
          {name}
        </div>
      )}
      <img
        src={url}
        alt={name ?? "Foto"}
        className="max-w-[88vw] max-h-[88vh] object-contain shadow-2xl"
        style={{ borderRadius: 20 }}
        onClick={e => e.stopPropagation()}
      />
      <a
        href={url}
        download={name ?? "foto"}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-2.5 text-white text-xs font-semibold transition-all hover:scale-105"
        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 100 }}
        onClick={e => e.stopPropagation()}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download
      </a>
    </div>
  );
}

// ─── AttachmentDisplay ────────────────────────────────────────────────────────
function AttachmentDisplay({
  url, type, name, size, isMine,
}: {
  url: string;
  type: "image" | "file";
  name: string | null;
  size: number | null;
  isMine: boolean;
}) {
  const [lightbox, setLightbox] = useState(false);

  if (type === "image") {
    return (
      <>
        <div
          className="cursor-pointer overflow-hidden transition-all hover:opacity-95 hover:scale-[1.01]"
          style={{ maxWidth: 180, borderRadius: 12 }}
          onClick={() => setLightbox(true)}
        >
          <img
            src={url}
            alt={name ?? "Foto"}
            className="w-full object-cover"
            style={{ maxHeight: 180, borderRadius: 12 }}
            loading="lazy"
          />
        </div>
        {lightbox && <ImageLightbox url={url} name={name} onClose={() => setLightbox(false)} />}
      </>
    );
  }

  const ext = name?.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={name ?? ""}
      className={`flex items-center gap-2.5 px-2.5 py-2 no-underline transition-all hover:scale-[1.01] ${isMine
          ? "bg-white/10 hover:bg-white/15 rounded-xl border border-white/10"
          : "bg-white rounded-xl border border-slate-100 hover:bg-slate-50"
        }`}
      style={{ maxWidth: 200 }}
      onClick={e => e.stopPropagation()}
    >
      <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-[8px] font-black gap-0.5 ${isMine ? "bg-white/20 text-white" : "text-white"
        }`}
        style={!isMine ? { background: "linear-gradient(135deg, #4f46e5, #7c3aed)" } : undefined}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>{ext.slice(0, 4)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-semibold truncate ${isMine ? "text-white" : "text-slate-800"}`}>
          {name ?? "File"}
        </p>
        {size != null && (
          <p className={`text-[9px] mt-0.5 ${isMine ? "text-white/50" : "text-slate-400"}`}>
            {formatFileSize(size)}
          </p>
        )}
      </div>
      <svg className={`w-3.5 h-3.5 flex-shrink-0 ${isMine ? "text-white/50" : "text-slate-400"}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  );
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

  useEffect(() => {
    if (!isEditing) setEditContent(msg.content);
  }, [msg.content, isEditing]);

  useEffect(() => {
    if (isEditing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [isEditing]);

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
        <div className="px-3 py-1.5 text-slate-400 text-[10px] italic flex items-center gap-1.5"
          style={{ background: "#f1f5f9", border: "1px solid #e8ecf0", borderRadius: 10 }}>
          <span style={{ opacity: 0.6 }}>🚫</span>
          <span>Pesan dihapus</span>
        </div>
      </div>
    );
  }

  const hasAttachment = !!msg.attachment_url && !!msg.attachment_type;
  const hasContent = !!msg.content;

  return (
    <div
      className={`flex items-end gap-1.5 group ${isMine ? "justify-end" : "justify-start"}`}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
    >
      {/* Avatar for received messages */}
      {!isMine && (
        <div
          className="flex items-center justify-center text-[7.5px] font-black text-white flex-shrink-0"
          style={{
            width: 22, height: 22,
            borderRadius: 8,
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            marginBottom: 2,
            boxShadow: "0 2px 8px rgba(79,70,229,0.3)",
          }}
        >
          {getInitials(msg.sender_id)}
        </div>
      )}

      {/* Edit mode */}
      {isEditing ? (
        <div
          className={`flex-1 max-w-[85%] px-3.5 py-2.5`}
          style={{
            borderRadius: 14,
            background: isMine
              ? "linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)"
              : "#fff",
            border: isMine ? "none" : "1px solid #e2e8f0",
            boxShadow: isMine ? "0 4px 16px rgba(30,27,75,0.3)" : "0 2px 10px rgba(0,0,0,0.05)",
          }}
        >
          <input
            ref={editRef}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            onKeyDown={handleEditKeyDown}
            maxLength={1000}
            className={`w-full bg-transparent text-xs outline-none font-medium ${isMine ? "text-white placeholder:text-white/40" : "text-slate-800"
              }`}
          />
          <div className="flex items-center justify-between mt-2.5 gap-2">
            <span className={`text-[9px] ${isMine ? "text-white/35" : "text-slate-400"}`}>
              Enter simpan · Esc batal
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setIsEditing(false); setEditContent(msg.content); }}
                className={`text-[9px] px-2.5 py-1 transition font-medium rounded-lg ${isMine ? "text-white/60 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"
                  }`}
              >
                Batal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editContent.trim()}
                className={`text-[9px] px-3 py-1 rounded-lg font-bold transition disabled:opacity-40 ${isMine ? "bg-white/20 text-white" : "bg-indigo-600 text-white"
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
          <div
            className="max-w-[220px] px-3 py-2 transition-all"
            style={{
              borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background: isMine
                ? "linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)"
                : "#fff",
              border: isMine ? "none" : "1px solid #e8ecf0",
              boxShadow: isMine
                ? "0 4px 16px rgba(30,27,75,0.35)"
                : "0 2px 10px rgba(0,0,0,0.05)",
              color: isMine ? "#fff" : "#1e293b",
            }}
          >
            {/* Attachment */}
            {hasAttachment && (
              <div className={hasContent ? "mb-1.5" : ""}>
                <AttachmentDisplay
                  url={msg.attachment_url!}
                  type={msg.attachment_type!}
                  name={msg.attachment_name}
                  size={msg.attachment_size}
                  isMine={isMine}
                />
              </div>
            )}

            {/* Text */}
            {hasContent && (
              <p className="text-xs leading-relaxed break-words font-medium">{msg.content}</p>
            )}

            {/* Timestamp + status */}
            <div className="flex items-center justify-end gap-1 mt-1.5"
              style={{ color: isMine ? "rgba(255,255,255,0.35)" : "#94a3b8" }}>
              {msg.edited_at && <span className="text-[8.5px] italic">diedit ·</span>}
              <span className="text-[9px]">{formatTime(msg.created_at)}</span>
              {isMine && (
                <span className="text-[10px]"
                  style={{ color: msg.is_read ? "#93c5fd" : "rgba(255,255,255,0.35)" }}>
                  {msg.is_read ? "✓✓" : "✓"}
                </span>
              )}
            </div>
          </div>

          {/* Context menu */}
          {showMenu && (
            <div
              ref={menuRef}
              className={`absolute bottom-full mb-2 z-50 bg-white overflow-hidden py-1.5 min-w-[145px] ${isMine ? "right-0" : "left-0"
                }`}
              style={{
                borderRadius: 18,
                border: "1px solid #f0f0f5",
                boxShadow: "0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              {isMine && hasContent && (
                <button
                  onClick={() => { setIsEditing(true); setShowMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-[11px] text-indigo-600 hover:bg-indigo-50 flex items-center gap-2.5 transition font-semibold"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit pesan
                </button>
              )}
              {isMine && hasContent && (
                <div style={{ height: 1, background: "#f1f5f9", margin: "2px 12px" }} />
              )}
              <button
                onClick={() => { onDelete(msg.id); setShowMenu(false); }}
                className="w-full text-left px-4 py-2.5 text-[11px] text-red-500 hover:bg-red-50 flex items-center gap-2.5 transition font-semibold"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Hapus pesan
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
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    url: string; name: string; type: "image" | "file"; size: number;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran file maksimal 5MB");
      e.target.value = "";
      return;
    }
    if (file.size === 0) {
      alert("File tidak boleh kosong");
      e.target.value = "";
      return;
    }
    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : "";
    setPreview({ url: previewUrl, name: file.name, type: isImage ? "image" : "file", size: file.size });
    setSelectedFile(file);
    e.target.value = "";
  };

  const cancelPreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setSelectedFile(null);
  };

  // ── Send text ─────────────────────────────────────────────────────────────
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
      attachment_url: null,
      attachment_type: null,
      attachment_name: null,
      attachment_size: null,
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

  // ── Send attachment ───────────────────────────────────────────────────────
  const sendAttachment = async () => {
    if (!selectedFile || uploading) return;
    const tempId = `temp-${Date.now()}`;
    const isImage = selectedFile.type.startsWith("image/");
    const previewUrl = preview?.url ?? null;
    const caption = input.trim();
    const optimistic: Message = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: targetUser.id,
      content: caption,
      is_read: false,
      is_deleted: false,
      edited_at: null,
      created_at: new Date().toISOString(),
      attachment_url: previewUrl,
      attachment_type: isImage ? "image" : "file",
      attachment_name: selectedFile.name,
      attachment_size: selectedFile.size,
    };
    setMessages(prev => [...prev, optimistic]);
    setInput("");
    cancelPreview();
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const uploadRes = await fetch("/api/messages/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        alert(uploadData.message ?? "Upload gagal");
        return;
      }
      const msgRes = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiver_id: targetUser.id,
          content: caption,
          attachment_url: uploadData.url,
          attachment_type: uploadData.type,
          attachment_name: uploadData.name,
          attachment_size: uploadData.size,
        }),
      });
      const msgData = await msgRes.json();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (msgData.success) {
        setMessages(prev => prev.map(m => m.id === tempId ? msgData.message : m));
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setUploading(false);
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (preview) sendAttachment();
      else send();
    }
  };

  const isLoading = sending || uploading;
  const canSend = preview ? !uploading : (!!input.trim() && !sending);

  // ── Minimized pill ────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div
        className="flex items-center gap-2 text-white rounded-full px-2.5 py-1.5 cursor-pointer select-none transition-all hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)",
          minWidth: 160, maxWidth: 230,
          boxShadow: "0 8px 28px rgba(13,13,26,0.5), 0 2px 8px rgba(0,0,0,0.2)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
        onClick={() => { setMinimized(false); setUnread(0); }}
      >
        {/* Logo */}
        <div className="relative flex-shrink-0">
          <div style={{ borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            <SolitLogo size={30} radius={10} />
          </div>
          <div
            className="absolute rounded-full bg-emerald-400"
            style={{ bottom: -1, right: -1, width: 9, height: 9, border: "1.5px solid #0f0c29" }}
          />
        </div>
        <span className="text-[11px] font-bold truncate flex-1">{targetUser.name.split(" ")[0]}</span>
        {unread > 0 && (
          <span
            className="text-white text-[8px] font-black flex items-center justify-center flex-shrink-0"
            style={{
              minWidth: 18, height: 18, borderRadius: 9,
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              padding: "0 4px",
              boxShadow: "0 2px 8px rgba(239,68,68,0.4)",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="w-5 h-5 flex items-center justify-center transition-all hover:scale-110"
          style={{ color: "rgba(255,255,255,0.4)" }}
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
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: 310,
        height: preview ? 475 : 415,
        borderRadius: "22px 22px 0 0",
        boxShadow: "0 24px 72px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
        background: "#f7f8fc",
        border: "1px solid rgba(255,255,255,0.9)",
        borderBottom: "none",
        transition: "height 0.2s ease",
      }}
    >
      {/* ── Header ── */}
      <div
        className="px-3.5 py-3 flex items-center gap-2.5 flex-shrink-0 cursor-pointer relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }}
        onClick={() => setMinimized(true)}
      >
        {/* Background decorations */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(ellipse at 80% 50%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at 15% 80%, rgba(139,92,246,0.08) 0%, transparent 50%)",
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }} />

        {/* Logo */}
        <div className="relative flex-shrink-0 z-10">
          <div style={{ borderRadius: 13, border: "2px solid rgba(255,255,255,0.12)", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
            <SolitLogo size={38} radius={11} />
          </div>
          <div
            className="absolute rounded-full bg-emerald-400"
            style={{ bottom: -1, right: -1, width: 11, height: 11, border: "2px solid #0f0c29" }}
          />
        </div>

        <div className="flex-1 min-w-0 z-10">
          <p className="text-[12.5px] font-bold text-white truncate tracking-tight">{targetUser.name}</p>
          <p className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-[9.5px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
              {ROLE_LABEL[targetUser.role] ?? targetUser.role}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 z-10">
          <button
            onClick={e => { e.stopPropagation(); setMinimized(true); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:scale-110"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }}
            title="Kecilkan"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onClose(); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:scale-110"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }}
            title="Tutup"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Accent line */}
      <div style={{ height: 2, background: "linear-gradient(90deg, #6366f1 0%, #8b5cf6 40%, #ec4899 80%, transparent 100%)", opacity: 0.7, flexShrink: 0 }} />

      {/* ── Messages ── */}
      <div
        className="flex-1 overflow-y-auto px-3.5 py-3 space-y-1.5"
        style={{ background: "#f7f8fc" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div
              className="rounded-full animate-spin"
              style={{
                width: 22, height: 22,
                border: "2.5px solid #e8ecf5",
                borderTopColor: "#6366f1",
              }}
            />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div
              className="flex items-center justify-center"
              style={{
                width: 56, height: 56, borderRadius: 18,
                background: "#fff",
                border: "1px solid #ebebf5",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                fontSize: 26,
              }}
            >
              💬
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Belum ada pesan.<br />Mulai percakapan!
            </p>
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

      {/* ── File preview ── */}
      {preview && (
        <div className="flex-shrink-0 px-3 py-2.5 bg-white" style={{ borderTop: "1px solid #f0f0f8" }}>
          <div className="flex items-center gap-2.5 p-2 rounded-2xl"
            style={{ background: "#f5f7ff", border: "1px solid #e8ecff" }}>
            {preview.type === "image" ? (
              <img
                src={preview.url}
                alt="preview"
                className="object-cover flex-shrink-0"
                style={{ width: 44, height: 44, borderRadius: 10, border: "1px solid #e0e0f5" }}
              />
            ) : (
              <div
                className="flex flex-col items-center justify-center flex-shrink-0 gap-0.5"
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                }}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-white text-[7px] font-bold">
                  {preview.name.split(".").pop()?.toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-800 truncate">{preview.name}</p>
              <p className="text-[9px] text-slate-400 mt-0.5">{formatFileSize(preview.size)}</p>
            </div>
            <button
              onClick={cancelPreview}
              className="flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
              style={{ width: 22, height: 22, borderRadius: "50%", background: "#e2e8f0" }}
            >
              <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Input area ── */}
      <div
        className="flex-shrink-0 flex items-center gap-2"
        style={{
          padding: "10px 12px",
          background: "#fff",
          borderTop: "1px solid #f0f0f8",
        }}
      >
        {/* Attach */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isLoading}
          className="flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-40 hover:scale-110"
          style={{
            width: 32, height: 32, borderRadius: 10,
            background: "#f0f2ff",
            border: "1px solid #e0e4ff",
            color: "#818cf8",
          }}
          title="Lampirkan file / foto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        {/* Input */}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={preview ? "Caption (opsional)..." : "Tulis pesan..."}
          maxLength={1000}
          disabled={isLoading}
          className="flex-1 outline-none font-medium disabled:opacity-50"
          style={{
            height: 34,
            borderRadius: 20,
            border: "1.5px solid #e8ecff",
            background: "#f5f7ff",
            padding: "0 13px",
            fontSize: 11.5,
            color: "#334155",
          }}
        />

        {/* Send */}
        <button
          onClick={preview ? sendAttachment : send}
          disabled={!canSend}
          className="flex items-center justify-center text-white disabled:opacity-40 transition-all hover:scale-110 active:scale-95 flex-shrink-0"
          style={{
            width: 34, height: 34, borderRadius: "50%",
            background: canSend
              ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
              : "#e2e8f0",
            boxShadow: canSend ? "0 3px 12px rgba(79,70,229,0.4)" : "none",
          }}
        >
          {isLoading ? (
            <div
              className="animate-spin"
              style={{
                width: 14, height: 14,
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "white",
                borderRadius: "50%",
              }}
            />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>

        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} accept="*/*" />
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