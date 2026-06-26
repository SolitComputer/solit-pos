// src/components/ui/AdminChatMonitor.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";

const ADMIN_ROLES = ["ADMIN", "PROGRAMMER"];

const ROLE_LABEL: Record<string, string> = {
    ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
    KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing",
    KEPALA_TEKNISI: "Kepala Teknisi", CREW_SALES: "Crew Sales",
    SOTECH: "Sotech", ACCOUNTING: "Accounting", PENGELOLA_BARANG: "Pengelola Barang",
    TEKNISI: "Teknisi", PENGANTARAN: "Pengantaran", MARKETING: "Marketing",
    KEBERSIHAN: "Kebersihan", PENYEDIA_BARANG: "Penyedia Barang",
    KEPALA_PENYEDIA_BARANG: "Kepala Penyedia", KONTEN: "Konten",
    KEPALA_ONPOINT: "Kepala Onpoint", ONPOINT: "Onpoint",
    KEPALA_SOTECH: "Kepala Sotech", PKL: "PKL", CUSTOMER_SERVICE: "Customer Service",
};

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

interface Conversation {
    key: string;
    userA: { id: string; name: string; role: string };
    userB: { id: string; name: string; role: string };
    lastMessage: Message;
    unreadCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string) {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
        return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
    }
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

// ─── Photo Lightbox ───────────────────────────────────────────────────────────
function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(10px)" }}
            onClick={onClose}
        >
            {/* Tombol tutup */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/20"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {/* Foto */}
            <img
                src={url}
                alt="Foto"
                className="max-w-[88vw] max-h-[88vh] object-contain"
                style={{ borderRadius: 12, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}
                onClick={e => e.stopPropagation()}
            />

            {/* Buka tab baru */}
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-white/50 hover:text-white text-xs transition-all"
                onClick={e => e.stopPropagation()}
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Buka di tab baru
            </a>
        </div>
    );
}

// ─── UserChip ─────────────────────────────────────────────────────────────────
function UserChip({ user }: { user: { id: string; name: string; role: string } }) {
    return (
        <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#4f46e5] flex items-center justify-center text-white text-[8px] font-black flex-shrink-0">
                {getInitials(user.name)}
            </div>
            <div>
                <p className="text-[11px] font-bold text-gray-800 leading-tight">{user.name}</p>
                <p className="text-[9px] text-gray-400">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
        </div>
    );
}

// ─── AdminChatMonitor (main export) ──────────────────────────────────────────
export function AdminChatMonitor() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [msgLoading, setMsgLoading] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
        getCurrentUserClient().then(u => {
            if (u && ADMIN_ROLES.includes(u.role)) {
                setIsAdmin(true);
                fetchConversations();
            } else {
                setLoading(false);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchConversations = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/messages/conversations");
            const data = await res.json();
            if (data.success) setConversations(data.conversations);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchMessages = useCallback(async (conv: Conversation) => {
        setSelectedConv(conv);
        setMsgLoading(true);
        setMessages([]);
        try {
            const res = await fetch(`/api/messages/conversations?between=${conv.userA.id},${conv.userB.id}`);
            const data = await res.json();
            if (data.success) setMessages(data.messages);
        } finally {
            setMsgLoading(false);
        }
    }, []);

    if (!isAdmin) return null;

    const filtered = conversations.filter(c =>
        c.userA.name.toLowerCase().includes(search.toLowerCase()) ||
        c.userB.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-indigo-50">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-800">Monitor Chat</p>
                            <p className="text-[9px] text-gray-400">{conversations.length} percakapan</p>
                        </div>
                    </div>
                    <button
                        onClick={fetchConversations}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white transition-all"
                        title="Refresh"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari nama..."
                    className="mt-2 w-full h-7 rounded-lg px-2.5 text-[11px] outline-none border border-gray-200 focus:border-violet-300"
                    style={{ background: "white" }}
                />
            </div>

            {/* Content */}
            {selectedConv ? (
                <MessageView
                    conv={selectedConv}
                    messages={messages}
                    loading={msgLoading}
                    onBack={() => { setSelectedConv(null); setMessages([]); }}
                />
            ) : (
                <ConversationList
                    conversations={filtered}
                    loading={loading}
                    onSelect={fetchMessages}
                />
            )}
        </div>
    );
}

// ─── ConversationList ─────────────────────────────────────────────────────────
function ConversationList({
    conversations, loading, onSelect,
}: {
    conversations: Conversation[];
    loading: boolean;
    onSelect: (c: Conversation) => void;
}) {
    if (loading) {
        return (
            <div className="divide-y divide-gray-50">
                {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-2 animate-pulse">
                        <div className="w-8 h-8 rounded-xl bg-gray-200" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-2.5 bg-gray-200 rounded w-32" />
                            <div className="h-2 bg-gray-100 rounded w-48" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    if (conversations.length === 0) {
        return (
            <div className="py-8 text-center">
                <div className="text-2xl mb-1.5">💬</div>
                <p className="text-xs text-gray-400">Belum ada percakapan</p>
            </div>
        );
    }
    return (
        <div className="divide-y divide-gray-50 overflow-y-auto max-h-72">
            {conversations.map(conv => (
                <button
                    key={conv.key}
                    onClick={() => onSelect(conv)}
                    className="w-full text-left px-4 py-2.5 flex items-start gap-2.5 hover:bg-violet-50/60 transition-colors"
                >
                    {/* Avatar stack */}
                    <div className="relative flex-shrink-0 w-8 h-8 mt-0.5">
                        <div className="absolute top-0 left-0 w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[7px] font-black border border-white">
                            {getInitials(conv.userA.name)}
                        </div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white text-[7px] font-black border border-white">
                            {getInitials(conv.userB.name)}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-gray-800 truncate">
                            {conv.userA.name} ↔ {conv.userB.name}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                            {conv.lastMessage.is_deleted
                                ? "Pesan dihapus"
                                : conv.lastMessage.attachment_type === "image"
                                    ? "📷 Foto"
                                    : conv.lastMessage.attachment_type === "file"
                                        ? `📎 ${conv.lastMessage.attachment_name ?? "File"}`
                                        : conv.lastMessage.content}
                        </p>
                    </div>

                    {/* Time + unread */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[9px] text-gray-400">{formatTime(conv.lastMessage.created_at)}</span>
                        {conv.unreadCount > 0 && (
                            <span className="w-4 h-4 rounded-full bg-violet-500 text-white text-[8px] font-black flex items-center justify-center">
                                {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                            </span>
                        )}
                    </div>
                </button>
            ))}
        </div>
    );
}

// ─── MessageView ──────────────────────────────────────────────────────────────
function MessageView({
    conv, messages, loading, onBack,
}: {
    conv: Conversation;
    messages: Message[];
    loading: boolean;
    onBack: () => void;
}) {
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // ── Group pesan by tanggal ────────────────────────────────────────────────
    const grouped = messages.reduce<{ date: string; label: string; msgs: Message[] }[]>((acc, msg) => {
        const d = new Date(msg.created_at);

        // Gunakan locale date string sebagai key (timezone WIB)
        const dateKey = d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });

        const todayKey = new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
        const yesterdayKey = new Date(Date.now() - 86_400_000).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });

        const label =
            dateKey === todayKey
                ? "Hari Ini"
                : dateKey === yesterdayKey
                    ? "Kemarin"
                    : d.toLocaleDateString("id-ID", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "Asia/Jakarta",
                    });

        const last = acc[acc.length - 1];
        if (last && last.date === dateKey) {
            last.msgs.push(msg);
        } else {
            acc.push({ date: dateKey, label, msgs: [msg] });
        }
        return acc;
    }, []);

    return (
        <>
            {/* Lightbox foto */}
            {lightboxUrl && (
                <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
            )}

            <div className="flex flex-col" style={{ maxHeight: 480 }}>
                {/* Back header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                    <button
                        onClick={onBack}
                        className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors text-gray-500"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <UserChip user={conv.userA} />
                        <span className="text-gray-300 text-xs">↔</span>
                        <UserChip user={conv.userB} />
                    </div>
                    <span className="text-[9px] text-gray-400 flex-shrink-0">{messages.length} pesan</span>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ background: "#f8f9fc" }}>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-5 h-5 rounded-full animate-spin"
                                style={{ border: "2px solid #e2e8f0", borderTopColor: "#7c3aed" }} />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-xs text-gray-400">Tidak ada pesan</p>
                        </div>
                    ) : (
                        grouped.map(group => (
                            <div key={group.date}>
                                {/* ── Date divider ─────────────────────────────── */}
                                <div className="flex items-center gap-2 my-3">
                                    <div className="flex-1 h-px bg-gray-200" />
                                    <span className="text-[9px] font-semibold text-gray-400 px-2.5 py-0.5 bg-white rounded-full border border-gray-200 flex-shrink-0 shadow-sm">
                                        📅 {group.label}
                                    </span>
                                    <div className="flex-1 h-px bg-gray-200" />
                                </div>

                                {/* ── Pesan dalam grup ─────────────────────────── */}
                                <div className="space-y-2">
                                    {group.msgs.map(msg => {
                                        const sender = msg.sender_id === conv.userA.id ? conv.userA : conv.userB;
                                        const isA = msg.sender_id === conv.userA.id;
                                        const timeStr = new Date(msg.created_at).toLocaleTimeString("id-ID", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            timeZone: "Asia/Jakarta",
                                        });

                                        return (
                                            <div
                                                key={msg.id}
                                                className={`flex items-end gap-1.5 ${isA ? "justify-start" : "justify-end"}`}
                                            >
                                                {/* Avatar kiri (userA) */}
                                                {isA && (
                                                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[6px] font-black flex-shrink-0 mb-0.5">
                                                        {getInitials(sender.name)}
                                                    </div>
                                                )}

                                                <div className="max-w-[72%]">
                                                    {/* Nama sender */}
                                                    <p className={`text-[8px] text-gray-400 mb-0.5 ${isA ? "pl-1" : "text-right pr-1"}`}>
                                                        {sender.name}
                                                    </p>

                                                    {/* Bubble */}
                                                    <div
                                                        className="px-2.5 py-1.5"
                                                        style={{
                                                            borderRadius: isA ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                                                            background: isA
                                                                ? "white"
                                                                : "linear-gradient(135deg,#1e40af,#4f46e5)",
                                                            border: isA ? "1px solid #e8ecf0" : "none",
                                                            color: isA ? "#1e293b" : "#fff",
                                                            boxShadow: isA
                                                                ? "0 1px 4px rgba(0,0,0,0.06)"
                                                                : "0 2px 8px rgba(79,70,229,0.3)",
                                                        }}
                                                    >
                                                        {msg.is_deleted ? (
                                                            <p className="text-[10px] italic opacity-50">Pesan dihapus</p>
                                                        ) : (
                                                            <>
                                                                {/* ── Foto — klik untuk lightbox ── */}
                                                                {msg.attachment_type === "image" && msg.attachment_url && (
                                                                    <div
                                                                        className="cursor-pointer mb-1 overflow-hidden rounded-lg hover:opacity-90 transition-opacity"
                                                                        onClick={() => setLightboxUrl(msg.attachment_url!)}
                                                                    >
                                                                        <img
                                                                            src={msg.attachment_url}
                                                                            alt="foto"
                                                                            className="max-w-full object-cover"
                                                                            style={{ maxHeight: 140, borderRadius: 8, display: "block" }}
                                                                        />
                                                                        <p className={`text-[8px] mt-0.5 ${isA ? "text-gray-400" : "text-white/50"}`}>
                                                                            🔍 Klik untuk perbesar
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* ── File attachment ── */}
                                                                {msg.attachment_type === "file" && msg.attachment_url && (
                                                                    <a
                                                                        href={msg.attachment_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className={`flex items-center gap-1.5 mb-1 text-[10px] font-semibold underline-offset-2 hover:underline ${isA ? "text-indigo-600" : "text-white"}`}
                                                                        onClick={e => e.stopPropagation()}
                                                                    >
                                                                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                                        </svg>
                                                                        {msg.attachment_name ?? "File"}
                                                                    </a>
                                                                )}

                                                                {/* ── Teks pesan ── */}
                                                                {msg.content && (
                                                                    <p className="text-[11px] leading-relaxed break-words">{msg.content}</p>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Waktu */}
                                                        <p className="text-[8px] mt-0.5 opacity-50 text-right">{timeStr}</p>
                                                    </div>
                                                </div>

                                                {/* Avatar kanan (userB) */}
                                                {!isA && (
                                                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white text-[6px] font-black flex-shrink-0 mb-0.5">
                                                        {getInitials(sender.name)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}