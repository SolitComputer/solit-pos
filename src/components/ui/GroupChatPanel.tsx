"use client";

import {
    useEffect, useRef, useState, useCallback, memo, useMemo,
    KeyboardEvent, Fragment,
} from "react";
import { getSupabaseClient } from "@/services/supabaseClient";
import { useChatContext } from "@/contexts/ChatContext";
import { VoicePlayer, VoiceRecorder } from "@/components/ui/VoiceNote";
import { Inbox, Clock, FileText } from "lucide-react";

const supabase = getSupabaseClient();

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReplyPreview {
    id: string;
    sender_name: string;
    content: string;
    is_deleted: boolean;
    attachment_type: "image" | "file" | "voice" | null;
}

interface GroupMessage {
    id: string;
    sender_id: string;
    sender_name: string;
    sender_role: string;
    content: string;
    reply_to_id: string | null;
    is_deleted: boolean;
    edited_at: string | null;
    created_at: string;
    attachment_url: string | null;
    attachment_type: "image" | "file" | "voice" | null;
    attachment_name: string | null;
    attachment_size: number | null;
    reply_to?: ReplyPreview | null;
}

interface UserOption {
    id: string;
    name: string;
    role: string;
}

interface CurrentUser {
    id: string;
    name: string;
    role: string;
}

interface GroupChatPanelProps {
    currentUser: CurrentUser;
    onClose: () => void;
}

// Info presence per user (dihitung dari /api/presence, sama dgn OnlineUsersPanel)
interface PresenceInfo {
    is_online: boolean;
    last_seen: string | null;
    seconds_ago: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
    ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
    KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing",
    KEPALA_TEKNISI: "Kepala Teknisi", CREW_SALES: "Crew Sales",
    SOTECH: "Sotech", ACCOUNTING: "Accounting",
    PENGELOLA_BARANG: "Pengelola Barang", TEKNISI: "Teknisi",
    PENGANTARAN: "Pengantaran", MARKETING: "Marketing", KEBERSIHAN: "Kebersihan",
    PENYEDIA_BARANG: "Penyedia Barang", KEPALA_PENYEDIA_BARANG: "Kepala Penyedia Barang",
    KONTEN: "Konten", KEPALA_ONPOINT: "Kepala Onpoint", ONPOINT: "Onpoint",
    KEPALA_SOTECH: "Kepala Sotech", PKL: "PKL", CUSTOMER_SERVICE: "Customer Service",
};

const ROLE_AVATAR_COLOR: Record<string, string> = {
    ADMIN: "#7c3aed", PROGRAMMER: "#4f46e5", ASISTEN_CEO: "#9333ea",
    KEPALA_SALES: "#059669", KEPALA_MARKETING: "#e11d48", KEPALA_TEKNISI: "#dc2626",
    CREW_SALES: "#0284c7", SOTECH: "#65a30d", ACCOUNTING: "#d97706",
    PENGELOLA_BARANG: "#2563eb", TEKNISI: "#ea580c", PENGANTARAN: "#0d9488",
    MARKETING: "#db2777", KEBERSIHAN: "#0891b2",
    PENYEDIA_BARANG: "#ca8a04", KEPALA_PENYEDIA_BARANG: "#c2410c",
    KONTEN: "#a21caf", KEPALA_ONPOINT: "#16a34a", ONPOINT: "#15803d",
    KEPALA_SOTECH: "#4d7c0f", PKL: "#475569", CUSTOMER_SERVICE: "#0369a1",
};

const FULL_ACCESS = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);

// Online = aktif dalam 2 menit terakhir (sama dgn OnlineUsersPanel)
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function getAvatarColor(role: string): string {
    return ROLE_AVATAR_COLOR[role] ?? "#6b7280";
}
function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("id-ID", {
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    });
}
function formatDateDivider(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    if (sameDay(d, today)) return "Hari ini";
    if (sameDay(d, yesterday)) return "Kemarin";
    return d.toLocaleDateString("id-ID", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
        timeZone: "Asia/Jakarta",
    });
}
function getDateKey(iso: string): string {
    return new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
}
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format "terakhir online" gaya WA (sama dgn OnlineUsersPanel)
function formatLastSeen(secondsAgo: number | null): string {
    if (secondsAgo === null) return "Belum pernah";
    if (secondsAgo < 60) return "baru saja";
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)} mnt lalu`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)} jam lalu`;
    return `${Math.floor(secondsAgo / 86400)} hari lalu`;
}

// ─── Mention highlight ────────────────────────────────────────────────────────
function renderTextWithMentions(text: string, currentUserId?: string, currentUserName?: string) {
    const parts = text.split(/(@semua|@[A-Za-z][A-Za-z\s.]*)/g);
    return parts.map((part, i) => {
        if (part === "@semua") {
            return (
                <span key={i}
                    className="inline-flex items-center px-1.5 py-0.5 font-semibold text-xs"
                    style={{ background: "#fef3c7", color: "#b45309", borderRadius: 5 }}>
                    @semua
                </span>
            );
        }
        if (part.startsWith("@") && part.length > 1) {
            const mentionName = part.slice(1).trim();
            const isMe = currentUserName && mentionName.toLowerCase() === currentUserName.toLowerCase();
            return (
                <span key={i}
                    className="inline-flex items-center px-1.5 py-0.5 font-semibold text-xs"
                    style={{
                        background: isMe ? "#eef2ff" : "#f1f5f9",
                        color: isMe ? "#4338ca" : "#475569",
                        borderRadius: 5,
                    }}>
                    {part}
                </span>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

// ─── Logo Solit ───────────────────────────────────────────────────────────────
function SolitLogo({ size = 44, radius = 12 }: { size?: number; radius?: number }) {
    const [imgError, setImgError] = useState(false);
    if (imgError) {
        return (
            <div className="flex items-center justify-center font-black text-white"
                style={{
                    width: size, height: size, borderRadius: radius,
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    fontSize: size * 0.22, letterSpacing: "0.5px",
                }}>
                S03
            </div>
        );
    }
    return (
        <img src="/assets/solit03.jpeg" alt="Solit 03"
            onError={() => setImgError(true)}
            style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", display: "block" }} />
    );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, role, size = 32 }: { name: string; role: string; size?: number }) {
    return (
        <div style={{
            width: size, height: size,
            backgroundColor: getAvatarColor(role),
            borderRadius: Math.round(size * 0.35),
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: size * 0.33, fontWeight: 800, flexShrink: 0,
            boxShadow: `0 2px 8px ${getAvatarColor(role)}55`,
        }}>
            {getInitials(name)}
        </div>
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
        <div className="fixed inset-0 z-[99999] flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.95)", backdropFilter: "blur(12px)" }}
            onClick={onClose}>
            <button
                className="absolute top-5 right-5 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                onClick={onClose}>
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
            <img src={url} alt={name ?? "Foto"}
                className="max-w-[88vw] max-h-[88vh] object-contain shadow-2xl"
                style={{ borderRadius: 20 }}
                onClick={e => e.stopPropagation()} />
            <a href={url} download={name ?? "foto"} target="_blank" rel="noopener noreferrer"
                className="absolute bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-2.5 text-white text-xs font-semibold transition-all hover:scale-105"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 100 }}
                onClick={e => e.stopPropagation()}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
            </a>
        </div>
    );
}

function AttachmentDisplay({ url, type, name, size, isMine }: {
    url: string; type: "image" | "file" | "voice"; name: string | null; size: number | null; isMine: boolean;
}) {
    const [lightbox, setLightbox] = useState(false);

    if (type === "voice") {
        return <VoicePlayer url={url} isMine={isMine} />;
    }

    if (type === "image") {
        return (
            <>
                <div className="cursor-pointer overflow-hidden transition-all hover:opacity-95 hover:scale-[1.01]"
                    style={{ maxWidth: 240, borderRadius: 14 }}
                    onClick={() => setLightbox(true)}>
                    <img src={url} alt={name ?? "Foto"}
                        className="w-full object-cover"
                        style={{ maxHeight: 220, borderRadius: 14 }}
                        loading="lazy" />
                </div>
                {lightbox && <ImageLightbox url={url} name={name} onClose={() => setLightbox(false)} />}
            </>
        );
    }

    const ext = name?.split(".").pop()?.toUpperCase() ?? "FILE";
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" download={name ?? ""}
            className={`flex items-center gap-3 px-3 py-2.5 no-underline transition-all hover:scale-[1.01] ${isMine
                ? "bg-white/10 hover:bg-white/15 rounded-2xl border border-white/10"
                : "bg-white rounded-2xl border border-slate-100 hover:bg-slate-50"
                }`}
            style={{ maxWidth: 240 }}
            onClick={e => e.stopPropagation()}>
            <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-[8.5px] font-black gap-0.5 ${isMine ? "bg-white/20 text-white" : "text-white"
                }`}
                style={!isMine ? { background: "linear-gradient(135deg, #4f46e5, #7c3aed)" } : undefined}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>{ext.slice(0, 4)}</span>
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${isMine ? "text-white" : "text-slate-800"}`}>
                    {name ?? "File"}
                </p>
                {size != null && (
                    <p className={`text-[10px] mt-0.5 ${isMine ? "text-white/50" : "text-slate-400"}`}>
                        {formatFileSize(size)}
                    </p>
                )}
            </div>
            <svg className={`w-4 h-4 flex-shrink-0 ${isMine ? "text-white/50" : "text-slate-400"}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
        </a>
    );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
interface BubbleProps {
    msg: GroupMessage;
    isMine: boolean;
    isAdmin: boolean;
    currentUserName: string;
    onReply: (msg: GroupMessage) => void;
    onDelete: (id: string) => void;
    onEdit: (id: string, newContent: string) => Promise<boolean>;
    onScrollToReply: (id: string) => void;
}

const MessageBubble = memo(function MessageBubble({ msg, isMine, isAdmin, currentUserName, onReply, onDelete, onEdit, onScrollToReply }: BubbleProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(msg.content);
    const [saving, setSaving] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const editRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!isEditing) setEditContent(msg.content);
    }, [msg.content, isEditing]);

    useEffect(() => {
        if (isEditing) {
            const ta = editRef.current;
            if (ta) {
                ta.focus();
                ta.setSelectionRange(ta.value.length, ta.value.length);
                ta.style.height = "auto";
                ta.style.height = ta.scrollHeight + "px";
            }
        }
    }, [isEditing]);

    useEffect(() => {
        if (!showMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showMenu]);

    const handleSaveEdit = async () => {
        const trimmed = editContent.trim();
        if (!trimmed || trimmed === msg.content) { setIsEditing(false); setEditContent(msg.content); return; }
        setSaving(true);
        const ok = await onEdit(msg.id, trimmed);
        setSaving(false);
        if (ok) setIsEditing(false);
    };

    const handleEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
        if (e.key === "Escape") { setIsEditing(false); setEditContent(msg.content); }
    };

    // ── Deleted ──
    if (msg.is_deleted) {
        return (
            <div className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                {!isMine && (
                    <div className="flex-shrink-0 self-end mb-1">
                        <Avatar name={msg.sender_name} role={msg.sender_role} size={30} />
                    </div>
                )}
                <div className={`flex flex-col max-w-[72%] ${isMine ? "items-end" : "items-start"}`}>
                    {!isMine && (
                        <span className="text-[9.5px] font-bold mb-1 px-1"
                            style={{ color: getAvatarColor(msg.sender_role) }}>
                            {msg.sender_name} · {ROLE_LABEL[msg.sender_role] ?? msg.sender_role}
                        </span>
                    )}
                    <div className="px-3 py-2 text-slate-400 text-xs italic flex items-center gap-1.5"
                        style={{ background: "#f1f5f9", border: "1px solid #e8ecf0", borderRadius: 12 }}>
                        <FileText className="w-4 h-4 inline opacity-60" />
                        <span>Pesan dihapus</span>
                    </div>
                </div>
            </div>
        );
    }

    const hasAttachment = !!msg.attachment_url && !!msg.attachment_type;
    const hasContent = !!msg.content;

    return (
        <div id={`msg-${msg.id}`} className={`flex gap-2.5 group ${isMine ? "justify-end" : "justify-start"}`}>
            {!isMine && (
                <div className="flex-shrink-0 self-end mb-1">
                    <Avatar name={msg.sender_name} role={msg.sender_role} size={30} />
                </div>
            )}

            <div className={`flex flex-col max-w-[70%] ${isMine ? "items-end" : "items-start"}`}>
                {/* Sender label */}
                {!isMine && (
                    <span className="text-[9.5px] font-bold mb-1.5 px-1 tracking-wide"
                        style={{ color: getAvatarColor(msg.sender_role) }}>
                        {msg.sender_name}
                        <span className="font-normal text-slate-400 ml-1">· {ROLE_LABEL[msg.sender_role] ?? msg.sender_role}</span>
                    </span>
                )}

                <div className="relative">
                    {isEditing ? (
                        <div className={`px-3.5 pt-3 pb-2.5 min-w-[220px]`}
                            style={{
                                borderRadius: isMine ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                                background: isMine ? "linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)" : "#fff",
                                border: isMine ? "none" : "1px solid #e2e8f0",
                                boxShadow: isMine ? "0 4px 20px rgba(30,27,75,0.35)" : "0 2px 12px rgba(0,0,0,0.06)",
                            }}>
                            <textarea
                                ref={editRef}
                                value={editContent}
                                onChange={e => {
                                    setEditContent(e.target.value);
                                    e.target.style.height = "auto";
                                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                                }}
                                onKeyDown={handleEditKeyDown}
                                maxLength={2000}
                                rows={1}
                                className={`w-full bg-transparent text-sm resize-none outline-none leading-relaxed ${isMine ? "text-white placeholder:text-white/40" : "text-slate-800"
                                    }`}
                                style={{ minHeight: 22 }}
                            />
                            <div className="flex items-center justify-between mt-2.5 gap-2">
                                <span className={`text-[9px] ${isMine ? "text-white/35" : "text-slate-400"}`}>
                                    Enter simpan · Esc batal
                                </span>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => { setIsEditing(false); setEditContent(msg.content); }}
                                        className={`text-[10px] px-2.5 py-1 rounded-lg transition font-medium ${isMine ? "text-white/60 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"
                                            }`}>
                                        Batal
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={saving || !editContent.trim()}
                                        className={`text-[10px] px-3 py-1 rounded-lg font-bold transition disabled:opacity-40 ${isMine ? "bg-white/20 text-white" : "bg-indigo-600 text-white"
                                            }`}>
                                        {saving ? "..." : "Simpan"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            className={`relative px-3.5 py-2.5 cursor-pointer select-text transition-all`}
                            style={{
                                borderRadius: isMine ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                                background: isMine ? "linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)" : "#fff",
                                border: isMine ? "none" : "1px solid #e8ecf0",
                                boxShadow: isMine ? "0 4px 20px rgba(30,27,75,0.3)" : "0 2px 10px rgba(0,0,0,0.05)",
                                color: isMine ? "#fff" : "#1e293b",
                            }}
                            onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}>

                            {/* Reply preview */}
                            {msg.reply_to && (
                                <div
                                    className="mb-2.5 px-2.5 py-1.5 cursor-pointer text-[10px]"
                                    style={{
                                        borderRadius: 10,
                                        borderLeft: `2.5px solid ${isMine ? "rgba(255,255,255,0.4)" : "#6366f1"}`,
                                        background: isMine ? "rgba(255,255,255,0.08)" : "#f5f7ff",
                                    }}
                                    onClick={() => onScrollToReply(msg.reply_to_id!)}>
                                    <p className="font-bold truncate text-[9.5px]"
                                        style={{ color: isMine ? "rgba(255,255,255,0.8)" : "#6366f1" }}>
                                        {msg.reply_to.sender_name}
                                    </p>
                                    <p className="truncate mt-0.5 text-[9px]"
                                        style={{ color: isMine ? "rgba(255,255,255,0.5)" : "#94a3b8" }}>
                                        {msg.reply_to.is_deleted ? " Pesan dihapus"
                                            : msg.reply_to.attachment_type === "image" ? " Foto"
                                                : msg.reply_to.attachment_type === "voice" ? " Pesan suara"
                                                    : msg.reply_to.attachment_type === "file" ? " File"
                                                        : msg.reply_to.content}
                                    </p>
                                </div>
                            )}

                            {/* Attachment */}
                            {hasAttachment && (
                                <div className={hasContent ? "mb-2" : ""}>
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
                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                    {renderTextWithMentions(msg.content, undefined, currentUserName)}
                                </p>
                            )}

                            {/* Timestamp */}
                            <div className="flex items-center justify-end gap-1 mt-1.5"
                                style={{ color: isMine ? "rgba(255,255,255,0.35)" : "#94a3b8" }}>
                                {msg.edited_at && <span className="text-[9px] italic">diedit ·</span>}
                                <span className="text-[9.5px]">{formatTime(msg.created_at)}</span>
                            </div>
                        </div>
                    )}

                    {/* Context menu */}
                    {showMenu && !isEditing && (
                        <div
                            ref={menuRef}
                            className={`absolute bottom-full mb-2 z-50 bg-white overflow-hidden py-1.5 min-w-[155px] ${isMine ? "right-0" : "left-0"
                                }`}
                            style={{
                                borderRadius: 18,
                                border: "1px solid #f0f0f5",
                                boxShadow: "0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
                            }}>
                            <button
                                onClick={() => { onReply(msg); setShowMenu(false); }}
                                className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition font-medium">
                                <svg className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                                Balas
                            </button>
                            {isMine && hasContent && (
                                <>
                                    <div style={{ height: 1, background: "#f1f5f9", margin: "2px 12px" }} />
                                    <button
                                        onClick={() => { setIsEditing(true); setShowMenu(false); }}
                                        className="w-full text-left px-4 py-2.5 text-xs text-indigo-600 hover:bg-indigo-50 flex items-center gap-3 transition font-medium">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Edit pesan
                                    </button>
                                </>
                            )}
                            {(isMine || isAdmin) && (
                                <>
                                    <div style={{ height: 1, background: "#f1f5f9", margin: "2px 12px" }} />
                                    <button
                                        onClick={() => { onDelete(msg.id); setShowMenu(false); }}
                                        className="w-full text-left px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 flex items-center gap-3 transition font-medium">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Hapus pesan
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick reply button on hover */}
            {!isEditing && (
                <div className={`opacity-0 group-hover:opacity-100 flex items-center self-end mb-1 transition-all duration-150 ${isMine ? "order-first" : ""}`}>
                    <button
                        onClick={() => onReply(msg)}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:bg-indigo-50"
                        style={{ background: "#fff", border: "1px solid #e8ecf0", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                        title="Balas">
                        <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
});

// ─── MentionDropdown ──────────────────────────────────────────────────────────
interface MentionDropdownProps {
    query: string;
    users: UserOption[];
    selectedIndex: number;
    onSelect: (user: UserOption | null) => void;
}

function MentionDropdown({ query, users, selectedIndex, onSelect }: MentionDropdownProps) {
    const filtered = query === ""
        ? users
        : users.filter(u =>
            u.name.toLowerCase().includes(query.toLowerCase()) ||
            (ROLE_LABEL[u.role] ?? u.role).toLowerCase().includes(query.toLowerCase())
        );

    const showSemua = "semua".includes(query.toLowerCase()) || query === "";
    const totalItems = (showSemua ? 1 : 0) + filtered.length;
    if (totalItems === 0) return null;

    return (
        <div className="absolute bottom-full left-0 mb-3 w-64 bg-white overflow-hidden z-50"
            style={{
                borderRadius: 18,
                border: "1px solid #ebebf5",
                boxShadow: "0 16px 48px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.05)",
            }}>
            {/* Header */}
            <div className="px-4 py-2.5 flex items-center gap-2"
                style={{ borderBottom: "1px solid #f0f0f8", background: "#fafbff" }}>
                <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">Mention Anggota</span>
            </div>
            <div className="max-h-52 overflow-y-auto">
                {showSemua && (
                    <button
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${selectedIndex === 0 ? "bg-amber-50" : "hover:bg-slate-50"
                            }`}
                        onMouseDown={(e) => { e.preventDefault(); onSelect(null); }}>
                        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                            style={{ borderRadius: 10, background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
                            <span className="text-amber-600 font-black text-sm">@</span>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800">semua</p>
                            <p className="text-[9.5px] text-slate-400 mt-0.5">Mention seluruh anggota</p>
                        </div>
                    </button>
                )}
                {filtered.map((user, i) => {
                    const idx = (showSemua ? 1 : 0) + i;
                    return (
                        <button
                            key={user.id}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${selectedIndex === idx ? "bg-indigo-50" : "hover:bg-slate-50"
                                }`}
                            onMouseDown={(e) => { e.preventDefault(); onSelect(user); }}>
                            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold"
                                style={{ backgroundColor: getAvatarColor(user.role), borderRadius: 10 }}>
                                {getInitials(user.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-800 truncate">{user.name}</p>
                                <p className="text-[9.5px] text-slate-400 truncate mt-0.5">{ROLE_LABEL[user.role] ?? user.role}</p>
                            </div>
                            {selectedIndex === idx && (
                                <svg className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── InputArea ────────────────────────────────────────────────────────────────
interface InputAreaProps {
    currentUser: CurrentUser;
    replyTo: GroupMessage | null;
    users: UserOption[];
    onCancelReply: () => void;
    onSend: (content: string) => Promise<void>;
    onSendAttachment: (file: File, caption: string) => Promise<void>;
    onSendVoice: (blob: Blob) => Promise<void>;   // ← BARU
}

function InputArea({ currentUser, replyTo, users, onCancelReply, onSend, onSendAttachment, onSendVoice }: InputAreaProps) {
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<{
        url: string; name: string; type: "image" | "file"; size: number;
    } | null>(null);
    const [mentionActive, setMentionActive] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionStart, setMentionStart] = useState(0);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const getMentionFilteredList = () => {
        const showSemua = "semua".includes(mentionQuery.toLowerCase()) || mentionQuery === "";
        const filtered = mentionQuery === ""
            ? users
            : users.filter(u =>
                u.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                (ROLE_LABEL[u.role] ?? u.role).toLowerCase().includes(mentionQuery.toLowerCase())
            );
        return { showSemua, filtered, total: (showSemua ? 1 : 0) + filtered.length };
    };

    const insertMention = (user: UserOption | null) => {
        const ta = inputRef.current;
        if (!ta) return;
        const before = input.slice(0, mentionStart);
        const after = input.slice(ta.selectionStart);
        const mentionText = user ? `@${user.name} ` : `@semua `;
        const newValue = before + mentionText + after;
        setInput(newValue);
        setMentionActive(false);
        setMentionQuery("");
        setMentionIndex(0);
        requestAnimationFrame(() => {
            const pos = before.length + mentionText.length;
            ta.focus();
            ta.setSelectionRange(pos, pos);
            ta.style.height = "auto";
            ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
        });
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? 0;
        setInput(val);
        const ta = e.target;
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
        const textBeforeCursor = val.slice(0, cursor);
        const lastAt = textBeforeCursor.lastIndexOf("@");
        if (lastAt !== -1) {
            const textAfterAt = textBeforeCursor.slice(lastAt + 1);
            const validQuery = !textAfterAt.includes("\n") && textAfterAt.length <= 30;
            const charBefore = lastAt > 0 ? val[lastAt - 1] : " ";
            const isAtStart = charBefore === " " || charBefore === "\n" || lastAt === 0;
            if (validQuery && isAtStart) {
                setMentionActive(true);
                setMentionQuery(textAfterAt);
                setMentionStart(lastAt);
                setMentionIndex(0);
                return;
            }
        }
        setMentionActive(false);
        setMentionQuery("");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionActive) {
            const { total } = getMentionFilteredList();
            if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => (i + 1) % total); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => (i - 1 + total) % total); return; }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const { showSemua, filtered } = getMentionFilteredList();
                if (mentionIndex === 0 && showSemua) { insertMention(null); }
                else {
                    const userIdx = showSemua ? mentionIndex - 1 : mentionIndex;
                    if (filtered[userIdx]) insertMention(filtered[userIdx]);
                }
                return;
            }
            if (e.key === "Escape") { setMentionActive(false); return; }
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (preview) handleSendFile();
            else handleSendText();
        }
        if (e.key === "Escape" && replyTo) onCancelReply();
    };

    const resetInput = () => {
        setInput("");
        const ta = inputRef.current;
        if (ta) ta.style.height = "22px";
    };

    const handleSendText = async () => {
        if (!input.trim() || sending) return;
        setSending(true);
        await onSend(input.trim());
        resetInput();
        setSending(false);
        setMentionActive(false);
        inputRef.current?.focus();
    };

    const handleSendFile = async () => {
        if (!selectedFile || uploading) return;
        setUploading(true);
        await onSendAttachment(selectedFile, input.trim());
        resetInput();
        cancelPreview();
        setUploading(false);
        setMentionActive(false);
        inputRef.current?.focus();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert("Ukuran file maksimal 5MB"); e.target.value = ""; return; }
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

    const canSend = preview ? !uploading : (!!input.trim() && !sending);
    const isLoading = uploading || sending;

    return (
        <div className="flex-shrink-0 bg-white" style={{ borderTop: "1px solid #f0f0f8" }}>

            {/* Reply preview */}
            {replyTo && (
                <div className="flex items-center gap-3 px-5 py-3"
                    style={{ borderBottom: "1px solid #f0f0f8", background: "#fafbff" }}>
                    <div className="flex-1 min-w-0 pl-3" style={{ borderLeft: "3px solid #6366f1" }}>
                        <p className="text-[10px] font-black text-indigo-500 mb-0.5">{replyTo.sender_name}</p>
                        <p className="text-xs text-slate-500 truncate">
                            {replyTo.attachment_type === "image" ? " Foto"
                                : replyTo.attachment_type === "voice" ? " Pesan suara"
                                    : replyTo.attachment_type === "file" ? " File"
                                        : replyTo.content}
                        </p>
                    </div>
                    <button onClick={onCancelReply}
                        className="flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 hover:bg-slate-200"
                        style={{ width: 26, height: 26, borderRadius: "50%", background: "#f1f5f9" }}>
                        <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* File preview */}
            {preview && (
                <div className="px-4 py-3" style={{ borderBottom: "1px solid #f0f0f8" }}>
                    <div className="flex items-center gap-3 p-2.5 rounded-2xl"
                        style={{ background: "#f5f7ff", border: "1px solid #e8ecff" }}>
                        {preview.type === "image" ? (
                            <img src={preview.url} alt="preview" className="object-cover flex-shrink-0"
                                style={{ width: 52, height: 52, borderRadius: 12, border: "1px solid #e0e0f0" }} />
                        ) : (
                            <div className="flex flex-col items-center justify-center flex-shrink-0 gap-1"
                                style={{ width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-white text-[7px] font-bold">
                                    {preview.name.split(".").pop()?.toUpperCase()}
                                </span>
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{preview.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{formatFileSize(preview.size)}</p>
                        </div>
                        <button onClick={cancelPreview}
                            className="flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 hover:bg-slate-200"
                            style={{ width: 24, height: 24, borderRadius: "50%", background: "#e2e8f0" }}>
                            <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-3 px-4 py-3.5 relative">
                <div className="flex-shrink-0 self-end mb-1">
                    <Avatar name={currentUser.name} role={currentUser.role} size={32} />
                </div>

                <div className="flex-1 flex items-end gap-2 relative"
                    style={{
                        background: "#f5f7ff",
                        border: "1.5px solid #e8ecff",
                        borderRadius: 22,
                        padding: "9px 14px",
                        minHeight: 44,
                        transition: "border-color 0.15s",
                    }}>
                    {mentionActive && (
                        <MentionDropdown
                            query={mentionQuery}
                            users={users}
                            selectedIndex={mentionIndex}
                            onSelect={insertMention}
                        />
                    )}

                    {/* Attach */}
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={isLoading}
                        className="self-end mb-0.5 w-6 h-6 flex items-center justify-center transition-all hover:scale-110 flex-shrink-0 disabled:opacity-40"
                        style={{ color: "#818cf8" }}
                        title="Lampirkan file / foto">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                    </button>

                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onBlur={() => { setTimeout(() => setMentionActive(false), 150); }}
                        placeholder={preview ? "Tambah caption..." : "Tulis pesan... ketik @ untuk mention"}
                        maxLength={2000}
                        rows={1}
                        disabled={isLoading}
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 resize-none outline-none leading-relaxed max-h-[120px] min-h-[22px] disabled:opacity-50"
                        style={{ height: "22px" }}
                    />
                    {input.length > 1800 && (
                        <span className="text-[9.5px] text-slate-400 self-end flex-shrink-0">{input.length}/2000</span>
                    )}
                </div>

                {/* Ada teks/file → Send; kosong → mic VN */}
                {input.trim() || preview ? (
                    <button
                        onClick={preview ? handleSendFile : handleSendText}
                        disabled={!canSend}
                        className="flex items-center justify-center flex-shrink-0 text-white transition-all self-end disabled:opacity-40 hover:scale-105 active:scale-95"
                        style={{ width: 44, height: 44, borderRadius: 14, background: canSend ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)" : "#e2e8f0", boxShadow: canSend ? "0 4px 16px rgba(79,70,229,0.4)" : "none" }}>
                        {isLoading ? (
                            <div className="animate-spin" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke={canSend ? "white" : "#94a3b8"} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        )}
                    </button>
                ) : (
                    <div className="self-end mb-1.5 flex-shrink-0">
                        <VoiceRecorder onSend={onSendVoice} disabled={isLoading} />
                    </div>
                )}

                <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} accept="*/*" />
            </div>
        </div>
    );
}

// ─── EmbeddedDMMessages (DM panel di dalam GroupChatPanel) ───────────────────
interface EmbeddedDMMessagesProps {
    currentUser: CurrentUser;
    targetUser: UserOption;
}

function EmbeddedDMMessages({ currentUser, targetUser }: EmbeddedDMMessagesProps) {
    interface DMMessage {
        id: string;
        sender_id: string;
        receiver_id: string;
        content: string;
        is_read: boolean;
        is_deleted: boolean;
        edited_at: string | null;
        created_at: string;
        attachment_url: string | null;
        attachment_type: "image" | "file" | "voice" | null; // +voice
        attachment_name: string | null;
        attachment_size: number | null;
    }

    const [messages, setMessages] = useState<DMMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/messages?with=${targetUser.id}`);
            const data = await res.json();
            if (data.success) setMessages(data.messages);
        } finally { setLoading(false); }
    }, [targetUser.id]);

    useEffect(() => { fetchMessages(); }, [fetchMessages]);

    useEffect(() => {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }, [messages]);

    useEffect(() => {
        const channel = supabase
            .channel(`embedded-dm:${[currentUser.id, targetUser.id].sort().join(":")}`)
            .on("postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${currentUser.id}` },
                (payload) => {
                    const msg = payload.new as DMMessage;
                    if (msg.sender_id !== targetUser.id) return;
                    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
                }
            )
            .on("postgres_changes",
                { event: "UPDATE", schema: "public", table: "messages" },
                (payload) => {
                    const u = payload.new as DMMessage;
                    setMessages(prev => prev.map(m => m.id === u.id
                        ? { ...m, content: u.content, is_deleted: u.is_deleted, edited_at: u.edited_at } : m));
                }
            )
            .subscribe();
        return () => { channel.unsubscribe(); };
    }, [currentUser.id, targetUser.id]);

    const send = async () => {
        const content = input.trim();
        if (!content || sending) return;
        setSending(true);
        const tempId = `temp-${Date.now()}`;
        const opt: DMMessage = {
            id: tempId, sender_id: currentUser.id, receiver_id: targetUser.id,
            content, is_read: false, is_deleted: false, edited_at: null,
            created_at: new Date().toISOString(),
            attachment_url: null, attachment_type: null, attachment_name: null, attachment_size: null,
        };
        setMessages(prev => [...prev, opt]);
        setInput("");
        try {
            const res = await fetch("/api/messages", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ receiver_id: targetUser.id, content }),
            });
            const data = await res.json();
            if (data.success) setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
            else setMessages(prev => prev.filter(m => m.id !== tempId));
        } catch { setMessages(prev => prev.filter(m => m.id !== tempId)); }
        finally { setSending(false); setTimeout(() => inputRef.current?.focus(), 0); }
    };

    // ── Voice Note ── (pola sama dgn ChatPanel: File eksplisit + MIME agar upload benar)
    const sendVoiceNote = async (blob: Blob) => {
        const tempId = `temp-${Date.now()}`;
        const mimeType = blob.type && blob.type.startsWith("audio/") ? blob.type : "audio/webm";
        const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
        const fileName = `voice_${Date.now()}.${ext}`;
        const previewUrl = URL.createObjectURL(blob);

        const opt: DMMessage = {
            id: tempId, sender_id: currentUser.id, receiver_id: targetUser.id,
            content: "", is_read: false, is_deleted: false, edited_at: null,
            created_at: new Date().toISOString(),
            attachment_url: previewUrl, attachment_type: "voice",
            attachment_name: fileName, attachment_size: blob.size,
        };
        setMessages(prev => [...prev, opt]);
        setUploading(true);
        try {
            const audioFile = new File([blob], fileName, { type: mimeType }); // MIME eksplisit = kunci VN
            const fd = new FormData();
            fd.append("file", audioFile);
            const up = await fetch("/api/messages/upload", { method: "POST", body: fd });
            const upData = await up.json();
            if (!upData.success) { URL.revokeObjectURL(previewUrl); setMessages(prev => prev.filter(m => m.id !== tempId)); return; }

            const res = await fetch("/api/messages", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    receiver_id: targetUser.id, content: "",
                    attachment_url: upData.url, attachment_type: "voice",
                    attachment_name: fileName, attachment_size: blob.size,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                setTimeout(() => URL.revokeObjectURL(previewUrl), 500);
            } else {
                URL.revokeObjectURL(previewUrl);
                setMessages(prev => prev.filter(m => m.id !== tempId));
            }
        } catch (err) {
            console.error("[embedded DM VN]", err);
            URL.revokeObjectURL(previewUrl);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally { setUploading(false); }
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    };

    const isBusy = sending || uploading;

    return (
        <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: "#f7f8fc" }}>
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-5 h-5 rounded-full animate-spin" style={{ border: "2px solid #e2e8f0", borderTopColor: "#6366f1" }} />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                        <div className="flex justify-center opacity-20"><Inbox className="w-8 h-8" /></div>
                        <p className="text-[11px] text-slate-400 font-medium">Mulai percakapan dengan</p>
                        <p className="text-[11px] font-bold text-slate-600">{targetUser.name}</p>
                    </div>
                ) : messages.map(msg => {
                    const isMine = msg.sender_id === currentUser.id;
                    if (msg.is_deleted) {
                        return (
                            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                                <span className="text-[10px] text-slate-400 italic px-2.5 py-1 bg-slate-100 rounded-lg">Pesan dihapus</span>
                            </div>
                        );
                    }
                    const hasAttachment = !!msg.attachment_url && !!msg.attachment_type;
                    const hasContent = !!msg.content;
                    return (
                        <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                            <div className="max-w-[82%] px-3 py-2"
                                style={{
                                    borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                                    background: isMine ? "linear-gradient(135deg,#1e1b4b,#3730a3)" : "#fff",
                                    border: isMine ? "none" : "1px solid #e8ecf0",
                                    boxShadow: isMine ? "0 2px 8px rgba(79,70,229,0.25)" : "0 1px 4px rgba(0,0,0,0.06)",
                                    color: isMine ? "#fff" : "#1e293b",
                                }}>
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
                                {hasContent && <p className="text-xs leading-relaxed break-words font-medium">{msg.content}</p>}
                                <div className="flex items-center justify-end gap-1 mt-1"
                                    style={{ color: isMine ? "rgba(255,255,255,0.4)" : "#94a3b8" }}>
                                    {msg.edited_at && <span className="text-[8px] italic">diedit ·</span>}
                                    <span className="text-[9px]">{formatTime(msg.created_at)}</span>
                                    {isMine && (
                                        <span className="text-[9px]" style={{ color: msg.is_read ? "#93c5fd" : "rgba(255,255,255,0.35)" }}>
                                            {msg.is_read ? "" : ""}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input — teks → tombol kirim, kosong → mic VN */}
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-3 bg-white" style={{ borderTop: "1px solid #f0f0f8" }}>
                <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Tulis pesan pribadi..."
                    maxLength={1000}
                    disabled={isBusy}
                    className="flex-1 h-9 rounded-xl px-3.5 text-xs font-medium outline-none disabled:opacity-50 transition focus:ring-2 focus:ring-indigo-200"
                    style={{ background: "#f5f7ff", border: "1.5px solid #e8ecff", color: "#334155" }}
                />
                {input.trim() ? (
                    <button
                        onClick={send}
                        disabled={!input.trim() || sending}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition hover:scale-105 active:scale-95 disabled:opacity-40 flex-shrink-0"
                        style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 2px 8px rgba(79,70,229,0.35)" }}>
                        {sending
                            ? <div className="w-3 h-3 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                    </button>
                ) : (
                    <VoiceRecorder onSend={sendVoiceNote} disabled={isBusy} />
                )}
            </div>
        </>
    );
}

// ─── Main GroupChatPanel ──────────────────────────────────────────────────────
export function GroupChatPanel({ currentUser, onClose }: GroupChatPanelProps) {
    const [messages, setMessages] = useState<GroupMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
    const [unread, setUnread] = useState(0);
    const [isScrolledUp, setIsScrolledUp] = useState(false);
    const [users, setUsers] = useState<UserOption[]>([]);

    const usersRef = useRef<UserOption[]>([]);
    const messagesDataRef = useRef<GroupMessage[]>([]);
    useEffect(() => { usersRef.current = users; }, [users]);
    useEffect(() => { messagesDataRef.current = messages; }, [messages]);

    // ── Presence: status online + terakhir online per user ──
    const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
    const [memberFilter, setMemberFilter] = useState<"all" | "online">("all");

    // ── Mobile: pane mana yang lagi tampil (chat / members). DM pakai embeddedDMUser ──
    const [mobileView, setMobileView] = useState<"chat" | "members">("chat");

    const bottomRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const isAdmin = FULL_ACCESS.has(currentUser.role);
    const [memberSearch, setMemberSearch] = useState("");
    const [embeddedDMUser, setEmbeddedDMUser] = useState<UserOption | null>(null);

    // Hitung jumlah online + urutkan (online dulu, lalu yang paling baru terakhir online)
    const onlineCount = users.filter(u => presenceMap[u.id]?.is_online).length;

    const filteredMembers = users
        .filter(u =>
            u.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
            (ROLE_LABEL[u.role] ?? u.role).toLowerCase().includes(memberSearch.toLowerCase())
        )
        .filter(u => memberFilter === "online" ? presenceMap[u.id]?.is_online : true)
        .sort((a, b) => {
            const ao = presenceMap[a.id]?.is_online ? 1 : 0;
            const bo = presenceMap[b.id]?.is_online ? 1 : 0;
            if (ao !== bo) return bo - ao; // online di atas
            const al = presenceMap[a.id]?.last_seen ?? null;
            const bl = presenceMap[b.id]?.last_seen ?? null;
            if (!al && !bl) return a.name.localeCompare(b.name);
            if (!al) return 1;
            if (!bl) return -1;
            return new Date(bl).getTime() - new Date(al).getTime(); // terakhir online di atas
        });

    useEffect(() => {
        fetch("/api/users")
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    const others = (data.users as UserOption[]).filter(u => u.id !== currentUser.id);
                    setUsers(others);
                }
            })
            .catch(() => { });
    }, [currentUser.id]);

    // ── Ambil presence dari /api/presence (sumber sama dgn OnlineUsersPanel) + refresh tiap 30 dtk ──
    const fetchPresence = useCallback(async () => {
        try {
            const res = await fetch("/api/presence");
            const data = await res.json();
            if (data.success) {
                const now = Date.now();
                const map: Record<string, PresenceInfo> = {};
                for (const p of (data.data ?? [])) {
                    const lastSeen: string | null = p.last_seen ?? null;
                    map[p.user_id] = {
                        last_seen: lastSeen,
                        is_online: lastSeen ? now - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS : false,
                        seconds_ago: lastSeen ? Math.floor((now - new Date(lastSeen).getTime()) / 1000) : null,
                    };
                }
                setPresenceMap(map);
            }
        } catch (err) {
            console.error("[GroupChatPanel] presence error:", err);
        }
    }, []);

    useEffect(() => {
        fetchPresence();
        const ticker = setInterval(fetchPresence, 30_000); // refresh status online tiap 30 detik
        return () => clearInterval(ticker);
    }, [fetchPresence]);

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/group-chat?limit=30");
            const data = await res.json();
            if (data.success) {
                setMessages(data.messages);
                setHasMore(data.has_more);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMessages(); }, [fetchMessages]);

    const fetchSingleMessage = useCallback(async (id: string): Promise<GroupMessage | null> => {
        try {
            const res = await fetch(`/api/group-chat?id=${encodeURIComponent(id)}`);
            const data = await res.json();
            if (data.success && data.message) return data.message as GroupMessage;
        } catch { }
        return null;
    }, []);

    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore || messages.length === 0) return;
        setLoadingMore(true);
        const oldest = messages[0].created_at;
        const scrollEl = messagesRef.current;
        const prevScrollHeight = scrollEl?.scrollHeight ?? 0;
        try {
            const res = await fetch(`/api/group-chat?limit=40&before=${encodeURIComponent(oldest)}`);
            const data = await res.json();
            if (data.success && data.messages.length > 0) {
                setMessages(prev => [...data.messages, ...prev]);
                setHasMore(data.has_more);
                requestAnimationFrame(() => {
                    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
                });
            } else {
                setHasMore(false);
            }
        } finally {
            setLoadingMore(false);
        }
    }, [hasMore, loadingMore, messages]);

    useEffect(() => {
        if (!loading && messages.length > 0) {
            bottomRef.current?.scrollIntoView({ behavior: "auto" });
        }
    }, [loading]);

    const prevMsgCount = useRef(0);
    useEffect(() => {
        if (messages.length > prevMsgCount.current) {
            const lastMsg = messages[messages.length - 1];
            const isMyMsg = lastMsg?.sender_id === currentUser.id;
            if (isMyMsg || !isScrolledUp) {
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                setUnread(0);
            } else {
                const newUnread = messages.slice(prevMsgCount.current).filter(m => m.sender_id !== currentUser.id).length;
                if (newUnread > 0) setUnread(u => u + newUnread);
            }
        }
        prevMsgCount.current = messages.length;
    }, [messages, currentUser.id, isScrolledUp]);

    const handleScroll = useCallback(() => {
        const el = messagesRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setIsScrolledUp(distFromBottom > 200);
        if (el.scrollTop < 80 && hasMore && !loadingMore) loadMore();
    }, [hasMore, loadingMore, loadMore]);

    useEffect(() => {
        const channel = supabase
            .channel(`group-chat-${Math.random().toString(36).slice(2, 7)}`, {
                config: { broadcast: { self: false } },
            })
            .on("postgres_changes",
                { event: "INSERT", schema: "public", table: "group_messages" },
                async (payload) => {
                    const incoming = payload.new as GroupMessage;
                    let enriched: GroupMessage = incoming;

                    if (!incoming.sender_name || !incoming.sender_role) {
                        const u = usersRef.current.find(x => x.id === incoming.sender_id);
                        if (u) enriched = { ...enriched, sender_name: u.name, sender_role: u.role };
                    }

                    if (incoming.reply_to_id && !incoming.reply_to) {
                        const orig = messagesDataRef.current.find(m => m.id === incoming.reply_to_id);
                        if (orig) {
                            enriched = {
                                ...enriched,
                                reply_to: {
                                    id: orig.id, sender_name: orig.sender_name,
                                    content: orig.content, is_deleted: orig.is_deleted,
                                    attachment_type: orig.attachment_type,
                                },
                            };
                        } else {
                            const full = await fetchSingleMessage(incoming.id);
                            if (full) enriched = full;
                        }
                    }

                    setMessages(prev => {
                        if (prev.some(m => m.id === enriched.id)) return prev;
                        const cleaned = prev.filter(m => {
                            if (!m.id.startsWith("temp-")) return true;
                            if (m.sender_id !== enriched.sender_id) return true;
                            const sameText = m.content === enriched.content;
                            const sameAtt = (m.attachment_name ?? null) === (enriched.attachment_name ?? null);
                            return !(sameText && sameAtt);
                        });
                        return [...cleaned, enriched];
                    });
                }
            )
            .on("postgres_changes",
                { event: "UPDATE", schema: "public", table: "group_messages" },
                (payload) => {
                    const updated = payload.new as GroupMessage;
                    setMessages(prev =>
                        prev.map(m => m.id === updated.id
                            ? { ...m, content: updated.content, is_deleted: updated.is_deleted, edited_at: updated.edited_at }
                            : m
                        )
                    );
                }
            )
            .subscribe((status, err) => {
                if (process.env.NODE_ENV === "development") {
                    console.log("[group-chat realtime]", status, err ?? "");
                }
            });

        channelRef.current = channel;
        return () => { channel.unsubscribe(); };
    }, [fetchSingleMessage]);

    const send = useCallback(async (content: string) => {
        if (!content.trim()) return;
        const tempId = `temp-${Date.now()}`;
        const optimistic: GroupMessage = {
            id: tempId,
            sender_id: currentUser.id,
            sender_name: currentUser.name,
            sender_role: currentUser.role,
            content,
            reply_to_id: replyTo?.id ?? null,
            is_deleted: false,
            edited_at: null,
            created_at: new Date().toISOString(),
            attachment_url: null,
            attachment_type: null,
            attachment_name: null,
            attachment_size: null,
            reply_to: replyTo
                ? { id: replyTo.id, sender_name: replyTo.sender_name, content: replyTo.content, is_deleted: replyTo.is_deleted, attachment_type: replyTo.attachment_type }
                : null,
        };
        setMessages(prev => [...prev, optimistic]);
        setReplyTo(null);
        try {
            const res = await fetch("/api/group-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, reply_to_id: replyTo?.id ?? null }),
            });
            const data = await res.json();
            if (data.success) {
                setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
            } else {
                setMessages(prev => prev.filter(m => m.id !== tempId));
            }
        } catch {
            setMessages(prev => prev.filter(m => m.id !== tempId));
        }
    }, [currentUser, replyTo]);

    const sendAttachment = useCallback(async (file: File, caption: string) => {
        const tempId = `temp-${Date.now()}`;
        const isImage = file.type.startsWith("image/");
        const previewUrl = isImage ? URL.createObjectURL(file) : null;
        const optimistic: GroupMessage = {
            id: tempId,
            sender_id: currentUser.id,
            sender_name: currentUser.name,
            sender_role: currentUser.role,
            content: caption,
            reply_to_id: replyTo?.id ?? null,
            is_deleted: false,
            edited_at: null,
            created_at: new Date().toISOString(),
            attachment_url: previewUrl,
            attachment_type: isImage ? "image" : "file",
            attachment_name: file.name,
            attachment_size: file.size,
            reply_to: replyTo
                ? { id: replyTo.id, sender_name: replyTo.sender_name, content: replyTo.content, is_deleted: replyTo.is_deleted, attachment_type: replyTo.attachment_type }
                : null,
        };
        setMessages(prev => [...prev, optimistic]);
        setReplyTo(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const uploadRes = await fetch("/api/group-chat/upload", { method: "POST", body: formData });
            const uploadData = await uploadRes.json();
            if (!uploadData.success) {
                setMessages(prev => prev.filter(m => m.id !== tempId));
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                alert(uploadData.message ?? "Upload gagal");
                return;
            }
            const msgRes = await fetch("/api/group-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content: caption,
                    reply_to_id: replyTo?.id ?? null,
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
        }
    }, [currentUser, replyTo]);

    const sendVoiceNote = useCallback(async (blob: Blob) => {
        const tempId = `temp-${Date.now()}`;
        const mimeType = blob.type && blob.type.startsWith("audio/") ? blob.type : "audio/webm";
        const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
        const fileName = `voice_${Date.now()}.${ext}`;
        const previewUrl = URL.createObjectURL(blob);

        const optimistic: GroupMessage = {
            id: tempId,
            sender_id: currentUser.id,
            sender_name: currentUser.name,
            sender_role: currentUser.role,
            content: "",
            reply_to_id: replyTo?.id ?? null,
            is_deleted: false,
            edited_at: null,
            created_at: new Date().toISOString(),
            attachment_url: previewUrl,
            attachment_type: "voice",
            attachment_name: fileName,
            attachment_size: blob.size,
            reply_to: replyTo
                ? { id: replyTo.id, sender_name: replyTo.sender_name, content: replyTo.content, is_deleted: replyTo.is_deleted, attachment_type: replyTo.attachment_type }
                : null,
        };
        setMessages(prev => [...prev, optimistic]);
        setReplyTo(null);

        try {
            const audioFile = new File([blob], fileName, { type: mimeType }); // MIME eksplisit — kunci
            const fd = new FormData();
            fd.append("file", audioFile);
            const up = await fetch("/api/group-chat/upload", { method: "POST", body: fd });
            const upData = await up.json();
            if (!upData.success) { URL.revokeObjectURL(previewUrl); setMessages(prev => prev.filter(m => m.id !== tempId)); return; }

            const res = await fetch("/api/group-chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content: "",
                    reply_to_id: optimistic.reply_to_id,
                    attachment_url: upData.url,
                    attachment_type: "voice",
                    attachment_name: fileName,
                    attachment_size: blob.size,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                setTimeout(() => URL.revokeObjectURL(previewUrl), 500);
            } else {
                URL.revokeObjectURL(previewUrl);
                setMessages(prev => prev.filter(m => m.id !== tempId));
            }
        } catch (err) {
            console.error("[group sendVoiceNote]", err);
            URL.revokeObjectURL(previewUrl);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        }
    }, [currentUser, replyTo]);

    const deleteMessage = useCallback(async (messageId: string) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true } : m));
        try {
            await fetch(`/api/group-chat?id=${messageId}`, { method: "DELETE" });
        } catch {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: false } : m));
        }
    }, []);

    const editMessage = useCallback(async (messageId: string, newContent: string): Promise<boolean> => {
        setMessages(prev =>
            prev.map(m => m.id === messageId
                ? { ...m, content: newContent, edited_at: new Date().toISOString() }
                : m
            )
        );
        try {
            const res = await fetch("/api/group-chat", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: messageId, content: newContent }),
            });
            const data = await res.json();
            if (!data.success) {
                const original = await fetchSingleMessage(messageId);
                if (original) setMessages(prev => prev.map(m => m.id === messageId ? original : m));
                return false;
            }
            return true;
        } catch {
            const original = await fetchSingleMessage(messageId);
            if (original) setMessages(prev => prev.map(m => m.id === messageId ? original : m));
            return false;
        }
    }, [fetchSingleMessage]);

    const scrollToReply = useCallback((id: string) => {
        const el = document.getElementById(`msg-${id}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("highlight-msg");
            setTimeout(() => el.classList.remove("highlight-msg"), 1500);
        }
    }, []);

    type DateGroup = { dateKey: string; dateLabel: string; msgs: GroupMessage[] };
    const groupedMessages = useMemo<DateGroup[]>(() => messages.reduce<DateGroup[]>((acc, msg) => {
        const key = getDateKey(msg.created_at);
        const last = acc[acc.length - 1];
        if (!last || last.dateKey !== key) {
            acc.push({ dateKey: key, dateLabel: formatDateDivider(msg.created_at), msgs: [msg] });
        } else {
            last.msgs.push(msg);
        }
        return acc;
    }, []), [messages]);

    return (
        <div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-0 md:p-4"
            style={{ backdropFilter: "blur(16px)", backgroundColor: "rgba(10,8,30,0.75)" }}>
            <div
                className="relative flex overflow-hidden w-full h-full rounded-none md:w-[min(1160px,100%)] md:h-[min(800px,95vh)] md:rounded-[26px]"
                style={{
                    background: "#fff",
                    boxShadow: "0 40px 120px rgba(10,8,30,0.3), 0 4px 20px rgba(0,0,0,0.08)",
                    border: "1px solid rgba(255,255,255,0.8)",
                }}>

                {/* ── Sidebar kiri: Member List ── */}
                <div className={`flex-col flex-shrink-0 w-full md:w-60 md:border-r md:border-[#f0f0f8] ${embeddedDMUser ? "hidden md:flex" : `${mobileView === "members" ? "flex" : "hidden"} md:flex`}`}
                    style={{ background: "#fafbff" }}>

                    {/* Sidebar header */}
                    <div className="px-4 pt-4 pb-3 flex-shrink-0"
                        style={{ borderBottom: "1px solid #f0f0f8" }}>
                        {/* Tombol kembali — mobile only */}
                        <button
                            onClick={() => setMobileView("chat")}
                            className="md:hidden flex items-center gap-1.5 mb-3 text-[11px] font-bold text-indigo-600 active:scale-95 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                            Kembali ke Grup Chat
                        </button>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black uppercase tracking-widest"
                                style={{ color: "#94a3b8" }}>
                                Anggota Tim ({users.length})
                            </p>
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex-shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {onlineCount} online
                            </span>
                        </div>
                        {/* Search */}
                        <div className="relative">
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
                                style={{ color: "#94a3b8" }}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Cari anggota..."
                                value={memberSearch}
                                onChange={e => setMemberSearch(e.target.value)}
                                className="w-full h-8 rounded-xl pl-8 pr-3 text-[11px] font-medium outline-none focus:ring-2 focus:ring-indigo-200 transition"
                                style={{
                                    background: "#f1f5f9",
                                    border: "1px solid #e2e8f0",
                                    color: "#334155",
                                }}
                            />
                        </div>
                        {/* Filter Semua / Online */}
                        <div className="flex gap-0.5 mt-2.5 bg-gray-100 rounded-lg p-0.5">
                            {(["all", "online"] as const).map(f => (
                                <button key={f} onClick={() => setMemberFilter(f)}
                                    className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${memberFilter === f ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                                        }`}>
                                    {f === "all" ? `Semua (${users.length})` : `Online (${onlineCount})`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* BARU: entri grup — klik untuk balik ke All Team Solit dari sidebar */}
                    <button
                        onClick={() => { setEmbeddedDMUser(null); setMobileView("chat"); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all flex-shrink-0 ${!embeddedDMUser ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                        style={{ borderBottom: "1px solid #f0f0f8" }}>
                        <div className="relative flex-shrink-0"
                            style={{ width: 34, height: 34, borderRadius: 11, overflow: "hidden", boxShadow: "0 2px 6px rgba(99,102,241,0.35)" }}>
                            <SolitLogo size={34} radius={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-slate-800 truncate">All Team Solit</p>
                            <p className="text-[9.5px] text-slate-400 truncate">
                                Grup chat seluruh tim{onlineCount > 0 ? ` · ${onlineCount} online` : ""}
                            </p>
                        </div>
                        {!embeddedDMUser && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
                    </button>

                    {/* Member list */}
                    <div className="flex-1 overflow-y-auto py-2">
                        {filteredMembers.length === 0 ? (
                            <p className="text-[11px] text-slate-400 text-center mt-8 px-4">
                                {memberFilter === "online" ? "Tidak ada yang online" : "Tidak ditemukan"}
                            </p>
                        ) : filteredMembers.map(user => {
                            const pres = presenceMap[user.id];
                            const isOnline = !!pres?.is_online;
                            return (
                                <button
                                    key={user.id}
                                    onClick={() => {
                                        setEmbeddedDMUser(
                                            embeddedDMUser?.id === user.id ? null : user
                                        );
                                    }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all group ${embeddedDMUser?.id === user.id
                                        ? "bg-indigo-50"
                                        : "hover:bg-indigo-50"
                                        }`}                            >
                                    {/* Avatar + status dot */}
                                    <div className="relative flex-shrink-0">
                                        <div
                                            className="flex items-center justify-center text-white font-bold text-[10px]"
                                            style={{
                                                width: 32, height: 32,
                                                borderRadius: 10,
                                                background: `linear-gradient(135deg, ${getAvatarColor(user.role)}cc, ${getAvatarColor(user.role)})`,
                                                boxShadow: `0 2px 6px ${getAvatarColor(user.role)}44`,
                                                opacity: isOnline ? 1 : 0.5,
                                            }}>
                                            {getInitials(user.name)}
                                        </div>
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#fafbff] ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
                                            }`} />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11.5px] font-semibold truncate text-slate-800 group-hover:text-indigo-700 transition-colors">
                                            {user.name}
                                        </p>
                                        <p className="text-[9.5px] truncate" style={{ color: getAvatarColor(user.role) }}>
                                            {ROLE_LABEL[user.role] ?? user.role}
                                        </p>
                                    </div>

                                    {/* Status (default) ↔ ikon chat (saat hover) */}
                                    <div className="flex-shrink-0 flex items-center justify-end min-w-[54px]">
                                        <div className="group-hover:hidden">
                                            {isOnline ? (
                                                <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                    online
                                                </span>
                                            ) : (
                                                <span className="text-[9px] text-slate-400 whitespace-nowrap">
                                                    {formatLastSeen(pres?.seconds_ago ?? null)}
                                                </span>
                                            )}
                                        </div>
                                        <svg className="w-3.5 h-3.5 text-indigo-400 hidden group-hover:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer sidebar — current user info */}
                    <div className="flex-shrink-0 px-3 py-3 flex items-center gap-2.5"
                        style={{ borderTop: "1px solid #f0f0f8", background: "#f5f7ff" }}>
                        <div
                            className="flex-shrink-0 flex items-center justify-center text-white font-bold text-[10px]"
                            style={{
                                width: 30, height: 30,
                                borderRadius: 9,
                                background: `linear-gradient(135deg, ${getAvatarColor(currentUser.role)}cc, ${getAvatarColor(currentUser.role)})`,
                            }}>
                            {getInitials(currentUser.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-slate-700 truncate">{currentUser.name}</p>
                            <p className="text-[9px]" style={{ color: getAvatarColor(currentUser.role) }}>
                                {ROLE_LABEL[currentUser.role] ?? currentUser.role}
                            </p>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    </div>
                </div>

                {/* ── Kolom kanan: Header + Chat ── */}
                <div className={`flex-1 flex-col overflow-hidden ${embeddedDMUser ? "hidden" : `${mobileView === "chat" ? "flex" : "hidden"} md:flex`}`} style={{ minWidth: 0 }}>



                    {/* ── Header ── */}
                    <div
                        className="flex-shrink-0 flex items-center gap-3.5 px-4 md:px-6 py-4 relative overflow-hidden"
                        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 50%, #0f0c29 100%)" }}>

                        {/* Background mesh pattern */}
                        <div className="absolute inset-0 pointer-events-none" style={{
                            backgroundImage: "radial-gradient(ellipse at 80% 50%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(139,92,246,0.1) 0%, transparent 50%)",
                        }} />
                        {/* Subtle grid */}
                        <div className="absolute inset-0 pointer-events-none" style={{
                            backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
                            backgroundSize: "32px 32px",
                        }} />

                        {/* Logo */}
                        <div className="relative flex-shrink-0 z-10">
                            <div style={{ border: "2px solid rgba(255,255,255,0.15)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                                <SolitLogo size={48} radius={14} />
                            </div>
                            {/* Online indicator */}
                            <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center"
                                style={{ width: 14, height: 14, borderRadius: "50%", border: "2.5px solid #0f0c29", background: "#10b981" }}>
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 z-10">
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-black text-white tracking-tight">All Team Solit</h2>
                                <Clock className="w-4 h-4 inline" />
                            </div>
                            <div className="flex items-center gap-2 mt-1 min-w-0">
                                <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                                </span>
                                <span className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>Grup chat seluruh tim Solit 03</span>
                                {onlineCount > 0 && (
                                    <span className="text-[9px] font-bold text-emerald-400 px-2 py-0.5"
                                        style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 100 }}>
                                        {onlineCount} online
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Tombol anggota tim — mobile only */}
                        <button
                            onClick={() => setMobileView("members")}
                            className="md:hidden w-9 h-9 flex items-center justify-center transition-all active:scale-95 flex-shrink-0 z-10 mr-1 relative"
                            style={{
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.07)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                color: "rgba(255,255,255,0.7)",
                            }}
                            title="Anggota tim">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2.5-4.66" />
                            </svg>
                            {onlineCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-emerald-500 text-white text-[8px] font-black flex items-center justify-center border border-[#0f0c29]">
                                    {onlineCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center transition-all hover:scale-105 flex-shrink-0 z-10"
                            style={{
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.07)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                color: "rgba(255,255,255,0.5)",
                            }}>
                            <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Accent line */}
                    <div style={{ height: 2, background: "linear-gradient(90deg, #6366f1 0%, #8b5cf6 40%, #ec4899 80%, transparent 100%)", opacity: 0.7, flexShrink: 0 }} />

                    {/* ── Messages ── */}
                    <div
                        ref={messagesRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-1"
                        style={{ background: "#f7f8fc" }}>

                        {loadingMore && (
                            <div className="flex justify-center py-3">
                                <div className="animate-spin rounded-full"
                                    style={{ width: 20, height: 20, border: "2.5px solid #e8ecf5", borderTopColor: "#6366f1" }} />
                            </div>
                        )}

                        {hasMore && !loadingMore && (
                            <div className="flex justify-center py-2">
                                <button onClick={loadMore}
                                    className="text-[11px] text-indigo-600 hover:text-indigo-700 transition-all px-5 py-2 font-semibold hover:scale-105"
                                    style={{ background: "#fff", border: "1px solid #e0e4f5", borderRadius: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                                    ↑ Muat pesan lebih lama
                                </button>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3">
                                <div className="animate-spin rounded-full"
                                    style={{ width: 30, height: 30, border: "3px solid #e8ecf5", borderTopColor: "#6366f1" }} />
                                <p className="text-xs text-slate-400 font-medium">Memuat pesan...</p>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                                <div className="flex items-center justify-center text-4xl"
                                    style={{ width: 80, height: 80, borderRadius: 26, background: "#fff", border: "1px solid #ebebf5", boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
                                    
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-700">Belum ada pesan</p>
                                    <p className="text-xs text-slate-400 mt-1.5">Mulai percakapan untuk seluruh tim!</p>
                                </div>
                            </div>
                        ) : (
                            groupedMessages.map((group: DateGroup) => (
                                <Fragment key={group.dateKey}>
                                    {/* Date pill */}
                                    <div className="flex items-center justify-center py-4">
                                        <div className="flex items-center gap-3">
                                            <div style={{ height: 1, width: 40, background: "linear-gradient(90deg, transparent, #d1d5f5)" }} />
                                            <div className="text-slate-400 text-[9.5px] font-semibold px-3.5 py-1.5 bg-white"
                                                style={{ borderRadius: 100, border: "1px solid #ebebf5", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", letterSpacing: "0.03em" }}>
                                                {group.dateLabel}
                                            </div>
                                            <div style={{ height: 1, width: 40, background: "linear-gradient(90deg, #d1d5f5, transparent)" }} />
                                        </div>
                                    </div>
                                    {group.msgs.map((msg: GroupMessage, idx: number) => {
                                        const isMine = msg.sender_id === currentUser.id;
                                        const prevMsg = group.msgs[idx - 1];
                                        const isNewSender = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                                        return (
                                            <div key={msg.id} className={isNewSender ? "mt-4" : "mt-0.5"}>
                                                <MessageBubble
                                                    msg={msg}
                                                    isMine={isMine}
                                                    isAdmin={isAdmin}
                                                    currentUserName={currentUser.name}
                                                    onReply={setReplyTo}
                                                    onDelete={deleteMessage}
                                                    onEdit={editMessage}
                                                    onScrollToReply={scrollToReply}
                                                />
                                            </div>
                                        );
                                    })}
                                </Fragment>
                            ))
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Scroll to bottom */}
                    {isScrolledUp && (
                        <div className="absolute bottom-24 right-6 z-10">
                            <button
                                onClick={() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setUnread(0); }}
                                className="relative w-10 h-10 flex items-center justify-center transition-all hover:scale-110"
                                style={{
                                    borderRadius: "50%",
                                    background: "#fff",
                                    border: "1px solid #e8ecf5",
                                    boxShadow: "0 6px 24px rgba(0,0,0,0.1)",
                                }}>
                                <svg className="w-4 h-4" style={{ color: "#6366f1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                </svg>
                                {unread > 0 && (
                                    <span className="absolute text-white text-[9px] font-black flex items-center justify-center"
                                        style={{
                                            top: -6, right: -6,
                                            minWidth: 18, height: 18,
                                            borderRadius: 9,
                                            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                                            padding: "0 4px",
                                            boxShadow: "0 2px 8px rgba(99,102,241,0.4)",
                                        }}>
                                        {unread > 9 ? "9+" : unread}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}

                    <InputArea
                        currentUser={currentUser}
                        replyTo={replyTo}
                        users={users}
                        onCancelReply={() => setReplyTo(null)}
                        onSend={send}
                        onSendAttachment={sendAttachment}
                        onSendVoice={sendVoiceNote}
                    />
                </div>

                {/* ── Kolom kanan: Embedded DM Panel ── */}
                {embeddedDMUser && (
                    <div className="flex-1 flex flex-col overflow-hidden min-w-0"
                        style={{ animation: "dmSlideIn 0.22s cubic-bezier(0.22,1,0.36,1)", willChange: "transform, opacity" }}>
                        {/* DM Header */}
                        <div
                            className="flex-shrink-0 flex items-center gap-3 px-4 py-3.5"
                            style={{
                                background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)",
                                borderBottom: "2px solid transparent",
                                backgroundClip: "padding-box",
                            }}
                        >
                            <div
                                className="flex-shrink-0 flex items-center justify-center text-white font-bold text-[11px]"
                                style={{
                                    width: 34, height: 34,
                                    borderRadius: 10,
                                    background: `linear-gradient(135deg, ${getAvatarColor(embeddedDMUser.role)}cc, ${getAvatarColor(embeddedDMUser.role)})`,
                                    boxShadow: `0 2px 8px ${getAvatarColor(embeddedDMUser.role)}55`,
                                }}
                            >
                                {getInitials(embeddedDMUser.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold text-white truncate leading-tight">
                                    {embeddedDMUser.name}
                                </p>
                                <p className="text-[9.5px] mt-0.5 truncate"
                                    style={{ color: getAvatarColor(embeddedDMUser.role) }}>
                                    {presenceMap[embeddedDMUser.id]?.is_online
                                        ? "online"
                                        : `Terakhir online ${formatLastSeen(presenceMap[embeddedDMUser.id]?.seconds_ago ?? null)}`}
                                </p>
                            </div>
                            <button
                                onClick={() => setEmbeddedDMUser(null)}
                                className="w-7 h-7 flex items-center justify-center rounded-xl transition hover:bg-white/10 flex-shrink-0"
                                style={{ color: "rgba(255,255,255,0.45)" }}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {/* Accent line */}
                        <div style={{ height: 2, background: "linear-gradient(90deg,#6366f1,#8b5cf6 50%,#ec4899)", flexShrink: 0, opacity: 0.7 }} />

                        {/* DM Messages — pakai EmbeddedDMMessages */}
                        <EmbeddedDMMessages
                            currentUser={currentUser}
                            targetUser={embeddedDMUser}
                        />
                    </div>
                )}

            </div>

            <style jsx global>{`
                @keyframes highlightMsg {
                    0%   { background-color: transparent; }
                    25%  { background-color: rgba(99, 102, 241, 0.1); }
                    100% { background-color: transparent; }
                }
                .highlight-msg {
                    animation: highlightMsg 1.5s ease-out;
                    border-radius: 18px;
                }
                @keyframes dmSlideIn {
                    from { opacity: 0; transform: translateX(16px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}   