"use client";

import { useEffect, useState, useCallback } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";

const ADMIN_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];

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

// ─── Avatar color system ──────────────────────────────────────────────────────
const AVATAR_PALETTES = [
    { from: "#7c3aed", to: "#4f46e5" },
    { from: "#db2777", to: "#e11d48" },
    { from: "#059669", to: "#0891b2" },
    { from: "#d97706", to: "#dc2626" },
    { from: "#2563eb", to: "#7c3aed" },
    { from: "#0891b2", to: "#059669" },
    { from: "#9333ea", to: "#db2777" },
    { from: "#ea580c", to: "#d97706" },
];

function getAvatarPalette(name: string) {
    return AVATAR_PALETTES[(name.charCodeAt(0) ?? 0) % AVATAR_PALETTES.length];
}

// ─── Avatar component ─────────────────────────────────────────────────────────
function Avatar({ name, size = "md" }: { name: string; size?: "xs" | "sm" | "md" | "lg" }) {
    const p = getAvatarPalette(name);
    const dims: Record<string, { wh: string; fs: string; radius: string }> = {
        xs:  { wh: "24px",  fs: "7px",  radius: "8px"  },
        sm:  { wh: "32px",  fs: "10px", radius: "10px" },
        md:  { wh: "40px",  fs: "12px", radius: "12px" },
        lg:  { wh: "48px",  fs: "14px", radius: "14px" },
    };
    const d = dims[size];
    return (
        <div style={{
            width: d.wh, height: d.wh, borderRadius: d.radius, flexShrink: 0,
            background: `linear-gradient(135deg,${p.from},${p.to})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontWeight: 900, fontSize: d.fs,
            boxShadow: `0 2px 8px ${p.from}44`,
        }}>
            {getInitials(name)}
        </div>
    );
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
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 99999,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.94)", backdropFilter: "blur(16px)",
            }}
        >
            <button
                onClick={onClose}
                style={{
                    position: "absolute", top: 20, right: 20,
                    width: 40, height: 40, borderRadius: "50%",
                    background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                }}
            >
                <svg style={{ width: 18, height: 18, color: "white" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            <img
                src={url} alt="Foto"
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: "88vw", maxHeight: "88vh", objectFit: "contain",
                    borderRadius: 18, boxShadow: "0 40px 120px rgba(0,0,0,0.7)",
                }}
            />
            <a
                href={url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                    position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                    display: "flex", alignItems: "center", gap: 6,
                    color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "none",
                }}
            >
                <svg style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Buka di tab baru
            </a>
        </div>
    );
}

// ─── UserChip ─────────────────────────────────────────────────────────────────
function UserChip({ user }: { user: { id: string; name: string; role: string } }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={user.name} size="sm" />
            <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#1e1b4b", lineHeight: 1.2, margin: 0 }}>{user.name}</p>
                <p style={{ fontSize: 10, color: "#8b5cf6", lineHeight: 1.2, margin: 0, marginTop: 1 }}>
                    {ROLE_LABEL[user.role] ?? user.role}
                </p>
            </div>
        </div>
    );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
            <div style={{ position: "relative", width: 46, height: 46, flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: 32, height: 32, borderRadius: 10, background: "#ede9fe" }} />
                <div style={{ position: "absolute", bottom: 0, right: 0, width: 32, height: 32, borderRadius: 10, background: "#fce7f3" }} />
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ height: 13, width: 170, borderRadius: 6, background: "#e8e4f8", marginBottom: 8 }} />
                <div style={{ height: 11, width: 230, borderRadius: 6, background: "#f0eeff" }} />
            </div>
            <div style={{ height: 11, width: 36, borderRadius: 6, background: "#f0eeff" }} />
        </div>
    );
}

// ─── AdminChatMonitor ─────────────────────────────────────────────────────────
export function AdminChatMonitor() {
    const [isAdmin, setIsAdmin]             = useState(false);
    const [loading, setLoading]             = useState(true);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConv, setSelectedConv]   = useState<Conversation | null>(null);
    const [messages, setMessages]           = useState<Message[]>([]);
    const [msgLoading, setMsgLoading]       = useState(false);
    const [search, setSearch]               = useState("");

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
            const res  = await fetch("/api/messages/conversations");
            const data = await res.json();
            if (data.success) setConversations(data.conversations);
        } finally { setLoading(false); }
    }, []);

    const fetchMessages = useCallback(async (conv: Conversation) => {
        setSelectedConv(conv);
        setMsgLoading(true);
        setMessages([]);
        try {
            const res  = await fetch(`/api/messages/conversations?between=${conv.userA.id},${conv.userB.id}`);
            const data = await res.json();
            if (data.success) setMessages(data.messages);
        } finally { setMsgLoading(false); }
    }, []);

    if (!isAdmin) return null;

    const filtered = conversations.filter(c =>
        c.userA.name.toLowerCase().includes(search.toLowerCase()) ||
        c.userB.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{
            background: "white", borderRadius: 22, overflow: "hidden",
            border: "1px solid #e0d9ff",
            boxShadow: "0 8px 40px rgba(109,40,217,0.12), 0 2px 8px rgba(0,0,0,0.05)",
            display: "flex", flexDirection: "column",
        }}>
            {/* ── HEADER ── */}
            <div style={{
                padding: "20px 22px 16px",
                background: "linear-gradient(140deg,#1e1b4b 0%,#2e2a7e 35%,#4338ca 70%,#6d28d9 100%)",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                flexShrink: 0,
                position: "relative",
                overflow: "hidden",
            }}>
                {/* decorative blur circles */}
                <div style={{
                    position: "absolute", top: -30, right: -20,
                    width: 120, height: 120, borderRadius: "50%",
                    background: "rgba(167,139,250,0.15)", pointerEvents: "none",
                }} />
                <div style={{
                    position: "absolute", bottom: -40, left: 40,
                    width: 90, height: 90, borderRadius: "50%",
                    background: "rgba(99,102,241,0.12)", pointerEvents: "none",
                }} />

                {/* Title row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 14,
                            background: "rgba(255,255,255,0.13)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                        }}>
                            <svg style={{ width: 20, height: 20, color: "white" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        </div>
                        <div>
                            <p style={{ fontSize: 16, fontWeight: 800, color: "white", margin: 0, lineHeight: 1.2, letterSpacing: "-0.3px" }}>
                                Monitor Chat
                            </p>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                <div style={{
                                    width: 6, height: 6, borderRadius: "50%",
                                    background: "#34d399",
                                    boxShadow: "0 0 6px #34d399",
                                }} />
                                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: 0 }}>
                                    {conversations.length} percakapan aktif
                                </p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={fetchConversations}
                        title="Refresh"
                        style={{
                            width: 36, height: 36, borderRadius: 11,
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(255,255,255,0.18)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                        }}
                    >
                        <svg style={{ width: 16, height: 16, color: "rgba(255,255,255,0.7)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div style={{ position: "relative" }}>
                    <svg
                        style={{
                            position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                            width: 15, height: 15, color: "rgba(255,255,255,0.35)", pointerEvents: "none",
                        }}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Cari nama karyawan..."
                        style={{
                            width: "100%", height: 40, borderRadius: 11,
                            paddingLeft: 38, paddingRight: 14,
                            fontSize: 12, color: "white",
                            background: "rgba(255,255,255,0.09)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            outline: "none", boxSizing: "border-box",
                        }}
                    />
                </div>
            </div>

            {/* ── BODY ── */}
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
            <div style={{ overflowY: "auto", maxHeight: 460 }}>
                <style>{`@keyframes acmPulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
                {Array(5).fill(0).map((_, i) => (
                    <div key={i} style={{
                        borderBottom: "1px solid #f5f3ff",
                        animation: "acmPulse 1.4s ease-in-out infinite",
                        animationDelay: `${i * 0.1}s`,
                    }}>
                        <SkeletonRow />
                    </div>
                ))}
            </div>
        );
    }

    if (conversations.length === 0) {
        return (
            <div style={{ padding: "60px 24px", textAlign: "center" }}>
                <div style={{
                    width: 60, height: 60, borderRadius: 20,
                    background: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 16px",
                }}>
                    <svg style={{ width: 28, height: 28, color: "#a78bfa" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#6d28d9", margin: 0 }}>Belum ada percakapan</p>
                <p style={{ fontSize: 12, color: "#a78bfa", margin: "5px 0 0" }}>Percakapan tim akan muncul di sini</p>
            </div>
        );
    }

    return (
        <div style={{ overflowY: "auto", maxHeight: 460 }}>
            {conversations.map((conv, idx) => {
                const pA = getAvatarPalette(conv.userA.name);
                const pB = getAvatarPalette(conv.userB.name);
                const preview = conv.lastMessage.is_deleted
                    ? "Pesan dihapus"
                    : conv.lastMessage.attachment_type === "image" ? "[Foto]"
                    : conv.lastMessage.attachment_type === "file"  ? `[File] ${conv.lastMessage.attachment_name ?? ""}`
                    : conv.lastMessage.content;

                return (
                    <button
                        key={conv.key}
                        onClick={() => onSelect(conv)}
                        style={{
                            width: "100%", textAlign: "left", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 14,
                            padding: "15px 22px",
                            background: "white", border: "none",
                            borderBottom: idx < conversations.length - 1 ? "1px solid #f5f3ff" : "none",
                            transition: "background 0.12s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#faf8ff")}
                        onMouseLeave={e => (e.currentTarget.style.background = "white")}
                    >
                        {/* Avatar stack */}
                        <div style={{ position: "relative", width: 46, height: 46, flexShrink: 0 }}>
                            <div style={{
                                position: "absolute", top: 0, left: 0,
                                width: 32, height: 32, borderRadius: 10,
                                background: `linear-gradient(135deg,${pA.from},${pA.to})`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "white", fontSize: 9, fontWeight: 900,
                                border: "2.5px solid white", zIndex: 2,
                                boxShadow: `0 3px 8px ${pA.from}55`,
                            }}>
                                {getInitials(conv.userA.name)}
                            </div>
                            <div style={{
                                position: "absolute", bottom: 0, right: 0,
                                width: 32, height: 32, borderRadius: 10,
                                background: `linear-gradient(135deg,${pB.from},${pB.to})`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "white", fontSize: 9, fontWeight: 900,
                                border: "2.5px solid white", zIndex: 1,
                                boxShadow: `0 3px 8px ${pB.from}55`,
                            }}>
                                {getInitials(conv.userB.name)}
                            </div>
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                                fontSize: 13, fontWeight: 700, color: "#1e1b4b",
                                margin: 0, lineHeight: 1.3,
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                                {conv.userA.name}
                                <span style={{ color: "#c4b5fd", margin: "0 6px", fontWeight: 400, fontSize: 11 }}>↔</span>
                                {conv.userB.name}
                            </p>
                            <p style={{
                                fontSize: 11, color: conv.lastMessage.is_deleted ? "#c4b5fd" : "#9ca3af",
                                margin: 0, marginTop: 4, lineHeight: 1.3,
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                fontStyle: conv.lastMessage.is_deleted ? "italic" : "normal",
                            }}>
                                {preview}
                            </p>
                        </div>

                        {/* Meta */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 10, color: "#9ca3af" }}>{formatTime(conv.lastMessage.created_at)}</span>
                            {conv.unreadCount > 0 && (
                                <span style={{
                                    minWidth: 20, height: 20, borderRadius: 10, padding: "0 5px",
                                    background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                                    color: "white", fontSize: 9, fontWeight: 900,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    boxShadow: "0 2px 8px rgba(124,58,237,0.45)",
                                }}>
                                    {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                                </span>
                            )}
                        </div>
                    </button>
                );
            })}
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

    const grouped = messages.reduce<{ date: string; label: string; msgs: Message[] }[]>((acc, msg) => {
        const d       = new Date(msg.created_at);
        const dateKey = d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
        const todayKey     = new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
        const yesterdayKey = new Date(Date.now() - 86_400_000).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
        const label =
            dateKey === todayKey ? "Hari Ini"
            : dateKey === yesterdayKey ? "Kemarin"
            : d.toLocaleDateString("id-ID", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
                timeZone: "Asia/Jakarta",
            });
        const last = acc[acc.length - 1];
        if (last && last.date === dateKey) last.msgs.push(msg);
        else acc.push({ date: dateKey, label, msgs: [msg] });
        return acc;
    }, []);

    return (
        <>
            {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

            <div style={{ display: "flex", flexDirection: "column", maxHeight: 580 }}>
                {/* ── Sub-header ── */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "13px 18px",
                    background: "white",
                    borderBottom: "1px solid #f0eeff",
                    flexShrink: 0,
                }}>
                    <button
                        onClick={onBack}
                        onMouseEnter={e => (e.currentTarget.style.background = "#ede9fe")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#f5f3ff")}
                        style={{
                            width: 36, height: 36, borderRadius: 11,
                            background: "#f5f3ff", border: "1px solid #ede9fe",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", flexShrink: 0, transition: "background 0.12s",
                        }}
                    >
                        <svg style={{ width: 16, height: 16, color: "#7c3aed" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, overflow: "hidden" }}>
                        <UserChip user={conv.userA} />
                        <div style={{
                            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                            background: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
                            border: "1px solid #ddd6fe",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <svg style={{ width: 12, height: 12, color: "#8b5cf6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h8M8 12h8m-8 5h4" />
                            </svg>
                        </div>
                        <UserChip user={conv.userB} />
                    </div>

                    <div style={{
                        padding: "5px 12px", borderRadius: 20,
                        background: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
                        border: "1px solid #ddd6fe", flexShrink: 0,
                    }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed" }}>
                            {messages.length} pesan
                        </span>
                    </div>
                </div>

                {/* ── Messages ── */}
                <div style={{
                    flex: 1, overflowY: "auto",
                    padding: "18px 18px",
                    background: "linear-gradient(180deg,#fafbff 0%,#f2f3fb 100%)",
                }}>
                    {loading ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 0", gap: 16 }}>
                            <style>{`@keyframes acmSpin{to{transform:rotate(360deg)}}`}</style>
                            <div style={{
                                width: 40, height: 40, borderRadius: "50%",
                                border: "3px solid #ede9fe", borderTopColor: "#7c3aed",
                                animation: "acmSpin 0.8s linear infinite",
                            }} />
                            <p style={{ fontSize: 12, color: "#a78bfa", margin: 0 }}>Memuat pesan...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "56px 0" }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 18,
                                background: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                margin: "0 auto 14px",
                            }}>
                                <svg style={{ width: 26, height: 26, color: "#a78bfa" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <p style={{ fontSize: 13, color: "#6d28d9", fontWeight: 700, margin: 0 }}>Tidak ada pesan</p>
                        </div>
                    ) : (
                        grouped.map(group => (
                            <div key={group.date}>
                                {/* Date divider */}
                                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 16px" }}>
                                    <div style={{ flex: 1, height: 1, background: "linear-gradient(to right,transparent,#ddd6fe)" }} />
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: "#7c3aed",
                                        padding: "5px 16px", borderRadius: 20,
                                        background: "white", border: "1px solid #e0d9ff",
                                        boxShadow: "0 1px 6px rgba(124,58,237,0.1)",
                                        whiteSpace: "nowrap",
                                    }}>
                                        {group.label}
                                    </span>
                                    <div style={{ flex: 1, height: 1, background: "linear-gradient(to left,transparent,#ddd6fe)" }} />
                                </div>

                                {/* Messages */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    {group.msgs.map(msg => {
                                        const sender  = msg.sender_id === conv.userA.id ? conv.userA : conv.userB;
                                        const isA     = msg.sender_id === conv.userA.id;
                                        const pSender = getAvatarPalette(sender.name);
                                        const timeStr = new Date(msg.created_at).toLocaleTimeString("id-ID", {
                                            hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
                                        });

                                        return (
                                            <div
                                                key={msg.id}
                                                style={{
                                                    display: "flex", alignItems: "flex-end", gap: 9,
                                                    justifyContent: isA ? "flex-start" : "flex-end",
                                                }}
                                            >
                                                {/* Avatar kiri */}
                                                {isA && (
                                                    <div style={{
                                                        width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                                                        background: `linear-gradient(135deg,${pSender.from},${pSender.to})`,
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        color: "white", fontSize: 9, fontWeight: 900,
                                                        marginBottom: 2,
                                                        boxShadow: `0 3px 8px ${pSender.from}44`,
                                                    }}>
                                                        {getInitials(sender.name)}
                                                    </div>
                                                )}

                                                <div style={{ maxWidth: "72%" }}>
                                                    {/* Nama */}
                                                    <p style={{
                                                        fontSize: 9, fontWeight: 700, color: "#8b5cf6",
                                                        margin: 0, marginBottom: 4,
                                                        textAlign: isA ? "left" : "right",
                                                        paddingLeft: isA ? 2 : 0,
                                                        paddingRight: isA ? 0 : 2,
                                                    }}>
                                                        {sender.name}
                                                    </p>

                                                    {/* Bubble */}
                                                    <div style={{
                                                        padding: "11px 15px",
                                                        borderRadius: isA ? "4px 18px 18px 18px" : "18px 4px 18px 18px",
                                                        background: isA
                                                            ? "white"
                                                            : "linear-gradient(140deg,#3730a3 0%,#4f46e5 55%,#7c3aed 100%)",
                                                        border: isA ? "1px solid #ecedf8" : "none",
                                                        color: isA ? "#1e1b4b" : "white",
                                                        boxShadow: isA
                                                            ? "0 2px 12px rgba(0,0,0,0.06)"
                                                            : "0 6px 20px rgba(79,70,229,0.38)",
                                                    }}>
                                                        {msg.is_deleted ? (
                                                            <p style={{ fontSize: 12, fontStyle: "italic", opacity: 0.45, margin: 0 }}>
                                                                Pesan dihapus
                                                            </p>
                                                        ) : (
                                                            <>
                                                                {/* Foto */}
                                                                {msg.attachment_type === "image" && msg.attachment_url && (
                                                                    <div
                                                                        style={{ cursor: "pointer", marginBottom: 9, borderRadius: 11, overflow: "hidden" }}
                                                                        onClick={() => setLightboxUrl(msg.attachment_url!)}
                                                                        onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.opacity = "0.88")}
                                                                        onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.opacity = "1")}
                                                                    >
                                                                        <img
                                                                            src={msg.attachment_url} alt="foto"
                                                                            style={{ maxWidth: "100%", maxHeight: 170, objectFit: "cover", display: "block", borderRadius: 11 }}
                                                                        />
                                                                        <p style={{ fontSize: 9, textAlign: "center", margin: "5px 0 0", opacity: 0.5 }}>
                                                                            Tap untuk perbesar
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* File */}
                                                                {msg.attachment_type === "file" && msg.attachment_url && (
                                                                    <a
                                                                        href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
                                                                        onClick={e => e.stopPropagation()}
                                                                        style={{
                                                                            display: "flex", alignItems: "center", gap: 9,
                                                                            marginBottom: 7, textDecoration: "none",
                                                                            color: isA ? "#4f46e5" : "rgba(255,255,255,0.85)",
                                                                        }}
                                                                    >
                                                                        <div style={{
                                                                            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                                                                            background: isA ? "rgba(79,70,229,0.1)" : "rgba(255,255,255,0.18)",
                                                                            display: "flex", alignItems: "center", justifyContent: "center",
                                                                        }}>
                                                                            <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                                            </svg>
                                                                        </div>
                                                                        <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                            {msg.attachment_name ?? "File"}
                                                                        </span>
                                                                    </a>
                                                                )}

                                                                {/* Teks */}
                                                                {msg.content && (
                                                                    <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, wordBreak: "break-word" }}>
                                                                        {msg.content}
                                                                    </p>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Footer */}
                                                        <div style={{
                                                            display: "flex", alignItems: "center", gap: 4,
                                                            marginTop: 6,
                                                            justifyContent: isA ? "flex-start" : "flex-end",
                                                        }}>
                                                            {msg.edited_at && (
                                                                <span style={{ fontSize: 9, opacity: 0.4 }}>diedit ·</span>
                                                            )}
                                                            <span style={{ fontSize: 9, opacity: 0.45 }}>{timeStr}</span>
                                                            {!isA && msg.is_read && (
                                                                <svg style={{ width: 12, height: 12, opacity: 0.65, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Avatar kanan */}
                                                {!isA && (
                                                    <div style={{
                                                        width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                                                        background: `linear-gradient(135deg,${pSender.from},${pSender.to})`,
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        color: "white", fontSize: 9, fontWeight: 900,
                                                        marginBottom: 2,
                                                        boxShadow: `0 3px 8px ${pSender.from}44`,
                                                    }}>
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