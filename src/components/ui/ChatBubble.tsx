// src/components/ui/ChatBubble.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { getSupabaseClient } from "@/services/supabaseClient";
import { useChatContext } from "@/contexts/ChatContext";
import { GroupChatPanel } from "@/components/ui/GroupChatPanel";

const supabase = getSupabaseClient();

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ChatUser {
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
    attachment_type: "image" | "file" | "voice" | null;
    attachment_name: string | null;
    attachment_size: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
    ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
    KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing",
    KEPALA_TEKNISI: "Kepala Teknisi", CREW_SALES: "Crew Sales",
    SOTECH: "Sotech", ACCOUNTING: "Accounting", PENGELOLA_BARANG: "Pengelola Barang",
    TEKNISI: "Teknisi", PENGANTARAN: "Pengantaran", MARKETING: "Marketing",
    KEBERSIHAN: "Kebersihan", PENYEDIA_BARANG: "Penyedia Barang",
    KEPALA_PENYEDIA_BARANG: "Kepala Penyedia Barang", KONTEN: "Konten",
    KEPALA_ONPOINT: "Kepala Onpoint", ONPOINT: "Onpoint",
    KEPALA_SOTECH: "Kepala Sotech", PKL: "PKL", CUSTOMER_SERVICE: "Customer Service",
};

const ROLE_COLOR: Record<string, string> = {
    ADMIN: "#7c3aed", PROGRAMMER: "#4f46e5", ASISTEN_CEO: "#9333ea",
    KEPALA_SALES: "#059669", KEPALA_MARKETING: "#e11d48", KEPALA_TEKNISI: "#dc2626",
    CREW_SALES: "#0284c7", SOTECH: "#65a30d", ACCOUNTING: "#d97706",
    PENGELOLA_BARANG: "#2563eb", TEKNISI: "#ea580c", PENGANTARAN: "#0d9488",
    MARKETING: "#db2777", KEBERSIHAN: "#0891b2", PENYEDIA_BARANG: "#ca8a04",
    KEPALA_PENYEDIA_BARANG: "#c2410c", KONTEN: "#a21caf",
    KEPALA_ONPOINT: "#16a34a", ONPOINT: "#15803d", KEPALA_SOTECH: "#4d7c0f",
    PKL: "#475569", CUSTOMER_SERVICE: "#0369a1",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string) {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function getRoleColor(role: string) {
    return ROLE_COLOR[role] ?? "#6b7280";
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

// ─── UserAvatar ───────────────────────────────────────────────────────────────
function UserAvatar({ name, role, size = 28 }: { name: string; role: string; size?: number }) {
    const color = getRoleColor(role);
    return (
        <div
            className="flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
            style={{
                width: size, height: size,
                borderRadius: Math.round(size * 0.3),
                background: `linear-gradient(135deg, ${color}cc, ${color})`,
                fontSize: Math.round(size * 0.36),
            }}
        >
            {getInitials(name)}
        </div>
    );
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────
function ImageLightbox({ url, name, onClose }: { url: string; name: string | null; onClose: () => void }) {
    useEffect(() => {
        const h = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(10px)" }}
            onClick={onClose}>
            <button onClick={onClose}
                className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/20"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            <img src={url} alt={name ?? "Foto"}
                className="max-w-[88vw] max-h-[88vh] object-contain"
                style={{ borderRadius: 12, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}
                onClick={e => e.stopPropagation()} />
        </div>
    );
}

// ─── AttachmentDisplay ────────────────────────────────────────────────────────
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
                <div className="cursor-pointer overflow-hidden transition hover:opacity-90"
                    style={{ maxWidth: 175, borderRadius: 10 }}
                    onClick={() => setLightbox(true)}>
                    <img src={url} alt={name ?? "Foto"} className="w-full object-cover"
                        style={{ maxHeight: 175, borderRadius: 10 }} loading="lazy" />
                </div>
                {lightbox && <ImageLightbox url={url} name={name} onClose={() => setLightbox(false)} />}
            </>
        );
    }

    const ext = name?.split(".").pop()?.toUpperCase() ?? "FILE";
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" download={name ?? ""}
            className={`flex items-center gap-2 px-2.5 py-2 no-underline transition hover:opacity-90 rounded-xl ${isMine ? "bg-white/10 border border-white/10" : "bg-gray-50 border border-gray-100"}`}
            style={{ maxWidth: 195 }}
            onClick={e => e.stopPropagation()}>
            <div className="w-8 h-8 rounded-lg flex flex-col items-center justify-center gap-0.5 flex-shrink-0 text-white"
                style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", fontSize: 7, fontWeight: 900 }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>{ext.slice(0, 4)}</span>
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-semibold truncate ${isMine ? "text-white" : "text-gray-800"}`}>{name ?? "File"}</p>
                {size != null && <p className={`text-[9px] mt-0.5 ${isMine ? "text-white/50" : "text-gray-400"}`}>{formatFileSize(size)}</p>}
            </div>
        </a>
    );
}

// ─── VoicePlayer ──────────────────────────────────────────────────────────────
function VoicePlayer({ url, isMine }: { url: string; isMine: boolean }): React.JSX.Element {    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const animRef = useRef<number | null>(null);

    // Reset state saat URL berubah
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        setPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        setDuration(0);
        setAudioError(null);
        setIsLoading(false);
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        audio.pause();
        audio.load();
    }, [url]);

    // Cleanup on unmount
    useEffect(() => {
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, []);

    const fmt = (s: number): string => {
        if (!isFinite(s) || isNaN(s) || s <= 0) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const tick = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || audio.paused) return;
        const cur = audio.currentTime;
        const dur = isFinite(audio.duration) ? audio.duration : 0;
        setCurrentTime(cur);
        setProgress(dur > 0 ? (cur / dur) * 100 : 0);
        animRef.current = requestAnimationFrame(tick);
    }, []);

    const togglePlay = async (): Promise<void> => {
        const audio = audioRef.current;
        if (!audio || audioError) return;

        if (playing) {
            audio.pause();
            if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
            setPlaying(false);
            return;
        }

        setIsLoading(true);
        try {
            await audio.play();
            setPlaying(true);
            setAudioError(null);
            animRef.current = requestAnimationFrame(tick);
        } catch (err: unknown) {
            const errName = err instanceof Error ? err.message : "Unknown error";
            console.error("[VoicePlayer] play() failed:", errName, "| url:", url);
            setAudioError("Gagal memutar audio");
            setPlaying(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEnded = (): void => {
        setPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        if (audioRef.current) audioRef.current.currentTime = 0;
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    };

    const handleLoadedMetadata = (): void => {
        const audio = audioRef.current;
        if (!audio) return;
        const dur = audio.duration;
        setDuration(isFinite(dur) ? dur : 0);
    };

    const handleError = (e: React.SyntheticEvent<HTMLAudioElement>): void => {
        const err = e.currentTarget.error;
        let msg = "Audio tidak dapat dimuat";
        if (err) {
            switch (err.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    msg = "Pemutaran dibatalkan";
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    msg = "Error jaringan";
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    msg = "Format tidak didukung";
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    msg = "Format tidak didukung";
                    break;
                default:
                    msg = "Audio tidak dapat dimuat";
            }
        }
        console.error("[VoicePlayer] error:", err?.code, msg, "| url:", url);
        setAudioError(msg);
        setPlaying(false);
        setIsLoading(false);
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>): void => {
        const audio = audioRef.current;
        if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
        setProgress(ratio * 100);
        setCurrentTime(audio.currentTime);
    };

    const cycleSpeed = (): void => {
        const speeds = [1, 1.5, 2];
        const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
        setSpeed(next);
        if (audioRef.current) audioRef.current.playbackRate = next;
    };

    const base = isMine ? "rgba(255,255,255,0.2)" : "#e8ecf4";
    const fill = isMine ? "rgba(255,255,255,0.9)" : "#4f46e5";
    const text = isMine ? "rgba(255,255,255,0.75)" : "#64748b";
    const bars = [3, 5, 8, 6, 10, 7, 4, 9, 6, 8, 5, 7, 10, 6, 4, 8, 5, 9, 7, 6, 8, 4, 7, 9, 5, 8, 6, 10, 7, 5];

    // ── Render: Error state ────────────────────────────────────────────────────
    if (audioError) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 200, maxWidth: 230 }}>
                <audio ref={audioRef} src={url} onError={handleError} />
                <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: isMine ? "rgba(255,255,255,0.15)" : "#fee2e2",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke={isMine ? "rgba(255,255,255,0.6)" : "#ef4444"}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <span style={{
                    fontSize: 10,
                    color: isMine ? "rgba(255,255,255,0.6)" : "#ef4444",
                    fontStyle: "italic",
                }}>
                    {audioError}
                </span>
            </div>
        );
    }

    // ── Render: Normal ─────────────────────────────────────────────────────────
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 200, maxWidth: 230 }}>
            <audio
                ref={audioRef}
                src={url}
                preload="auto"
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                onError={handleError}
            />
            <button
                onClick={togglePlay}
                disabled={isLoading}
                style={{
                    width: 34, height: 34, borderRadius: "50%", border: "none",
                    background: isMine
                        ? "rgba(255,255,255,0.25)"
                        : "linear-gradient(135deg,#4f46e5,#7c3aed)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: isLoading ? "wait" : "pointer", flexShrink: 0,
                    boxShadow: isMine ? "none" : "0 3px 10px rgba(79,70,229,0.4)",
                    transition: "transform 0.1s, opacity 0.1s",
                    opacity: isLoading ? 0.6 : 1,
                }}
            >
                {isLoading ? (
                    <div style={{
                        width: 14, height: 14, borderRadius: "50%",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "white",
                        animation: "vnSpin 0.7s linear infinite",
                    }} />
                ) : playing ? (
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                        <rect x="0.5" y="0.5" width="4" height="13" rx="1.5" fill="white" />
                        <rect x="7.5" y="0.5" width="4" height="13" rx="1.5" fill="white" />
                    </svg>
                ) : (
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                        <path d="M1.5 1.5L10.5 7L1.5 12.5V1.5Z"
                            fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round" />
                    </svg>
                )}
            </button>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                    style={{ display: "flex", alignItems: "center", gap: 2, height: 26, cursor: "pointer" }}
                    onClick={handleSeek}
                >
                    {bars.map((h, i) => {
                        const barProgress = (i / bars.length) * 100;
                        const isPlayed = barProgress <= progress;
                        return (
                            <div key={i} style={{
                                width: 3, borderRadius: 2, flexShrink: 0,
                                height: `${Math.max(3, Math.min(h * 2.2, 26))}px`,
                                background: isPlayed ? fill : base,
                                transition: "background 0.05s",
                            }} />
                        );
                    })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: text, fontVariantNumeric: "tabular-nums" }}>
                        {playing || currentTime > 0 ? fmt(currentTime) : fmt(duration)}
                    </span>
                    <button onClick={cycleSpeed} style={{
                        fontSize: 8, fontWeight: 800, color: text,
                        background: isMine ? "rgba(255,255,255,0.15)" : "rgba(79,70,229,0.1)",
                        border: "none", borderRadius: 4, padding: "1px 5px",
                        cursor: "pointer", lineHeight: 1.5,
                    }}>
                        {speed}×
                    </button>
                </div>
            </div>

            <svg width="12" height="16" viewBox="0 0 24 24" fill="none"
                style={{ flexShrink: 0, opacity: 0.4 }}
                stroke={isMine ? "white" : "#64748b"} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
            </svg>

            <style>{`@keyframes vnSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ─── MessageItem ──────────────────────────────────────────────────────────────
function MessageItem({ msg, isMine, onEdit, onDelete }: {
    msg: Message; isMine: boolean;
    onEdit: (id: string, content: string) => Promise<boolean>;
    onDelete: (id: string) => void;
}) {
    const [showMenu, setShowMenu] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(msg.content);
    const [saving, setSaving] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const editRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (!isEditing) setEditContent(msg.content); }, [msg.content, isEditing]);
    useEffect(() => { if (isEditing) { editRef.current?.focus(); editRef.current?.select(); } }, [isEditing]);
    useEffect(() => {
        if (!showMenu) return;
        const h = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [showMenu]);

    const handleSaveEdit = async () => {
        const trimmed = editContent.trim();
        if (!trimmed || trimmed === msg.content) { setIsEditing(false); setEditContent(msg.content); return; }
        setSaving(true);
        const ok = await onEdit(msg.id, trimmed);
        setSaving(false);
        if (ok) setIsEditing(false);
    };

    const handleEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(); }
        if (e.key === "Escape") { setIsEditing(false); setEditContent(msg.content); }
    };

    if (msg.is_deleted) {
        return (
            <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <span className="text-[10px] text-gray-400 italic px-2.5 py-1 bg-gray-100 rounded-lg">Pesan dihapus</span>
            </div>
        );
    }

    const hasAttachment = !!msg.attachment_url && !!msg.attachment_type;
    const hasContent = !!msg.content;

    return (
        <div
            className={`flex items-end gap-1.5 group ${isMine ? "justify-end" : "justify-start"}`}
            onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
        >
            {isEditing ? (
                <div className="flex-1 max-w-[85%] px-3 py-2.5 rounded-2xl text-white"
                    style={{ background: "linear-gradient(135deg,#1e40af,#4f46e5)" }}>
                    <input ref={editRef} value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={handleEditKey} maxLength={1000}
                        className="w-full bg-transparent text-xs outline-none font-medium text-white" />
                    <div className="flex justify-between items-center mt-2 gap-2">
                        <span className="text-[9px] text-white/40">Enter simpan · Esc batal</span>
                        <div className="flex gap-1.5">
                            <button onClick={() => { setIsEditing(false); setEditContent(msg.content); }}
                                className="text-[9px] px-2 py-0.5 text-white/60 hover:bg-white/10 rounded-lg transition">Batal</button>
                            <button onClick={handleSaveEdit} disabled={saving || !editContent.trim()}
                                className="text-[9px] px-2 py-0.5 bg-white/20 text-white rounded-lg font-bold transition disabled:opacity-40">
                                {saving ? "..." : "Simpan"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="relative">
                    <div className="max-w-[210px] px-3 py-2"
                        style={{
                            borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                            background: isMine ? "linear-gradient(135deg,#1e40af,#4f46e5)" : "#ffffff",
                            border: isMine ? "none" : "1px solid #e8ecf0",
                            boxShadow: isMine ? "0 3px 10px rgba(79,70,229,0.3)" : "0 1px 6px rgba(0,0,0,0.06)",
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
                                <span className="text-[10px]"
                                    style={{ color: msg.is_read ? "#93c5fd" : "rgba(255,255,255,0.35)" }}>
                                    {msg.is_read ? "✓✓" : "✓"}
                                </span>
                            )}
                        </div>
                    </div>
                    {showMenu && (
                        <div ref={menuRef}
                            className={`absolute bottom-full mb-1.5 z-50 bg-white overflow-hidden py-1 min-w-[135px] ${isMine ? "right-0" : "left-0"}`}
                            style={{ borderRadius: 12, border: "1px solid #f0f0f5", boxShadow: "0 8px 28px rgba(0,0,0,0.12)" }}>
                            {isMine && hasContent && (
                                <button onClick={() => { setIsEditing(true); setShowMenu(false); }}
                                    className="w-full text-left px-3.5 py-2 text-[11px] text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 font-semibold transition">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                </button>
                            )}
                            <button onClick={() => { onDelete(msg.id); setShowMenu(false); }}
                                className="w-full text-left px-3.5 py-2 text-[11px] text-red-500 hover:bg-red-50 flex items-center gap-2 font-semibold transition">
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

// ─── VoiceRecorder ────────────────────────────────────────────────────────────
//
// FIX #1: Tambah prop `onStateChange(active: boolean)` — notify parent kapan
//         recorder aktif (recording/preview) vs idle, supaya parent bisa
//         hide text input dan render VoiceRecorder full-width.
//
// FIX #2: Pakai `uiStateRef` untuk track state di dalam event listeners —
//         menghindari stale closure yang bikin mouse/touch handlers tidak bekerja.
//
// FIX #3: Pakai `cancelledRef` boolean flag yang di-set SEBELUM mr.stop() —
//         menghindari race condition dimana onstop override terlambat.
//
// FIX #4: Pakai `durationRef` untuk simpan durasi rekaman — state bisa stale
//         di saat confirmSend dipanggil.
//
interface VoiceRecorderProps {
    onSend: (blob: Blob, duration: number) => void;
    onCancel: () => void;
    onStateChange: (active: boolean) => void;
    disabled?: boolean;
}

function VoiceRecorder({ onSend, onCancel, onStateChange, disabled }: VoiceRecorderProps) {
    const [uiState, setUiState] = useState<"idle" | "recording" | "preview">("idle");
    const [duration, setDuration] = useState(0);
    const [slideX, setSlideX] = useState(0);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

    // Refs — tidak pernah stale di dalam closures
    const uiStateRef = useRef<"idle" | "recording" | "preview">("idle");
    const mediaRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTsRef = useRef(0);
    const durationRef = useRef(0);
    const cancelledRef = useRef(false);
    const touchStartX = useRef(0);

    // Set uiState + ref + notify parent sekaligus
    const setUiStateSynced = useCallback((next: "idle" | "recording" | "preview") => {
        uiStateRef.current = next;
        setUiState(next);
        onStateChange(next !== "idle");
    }, [onStateChange]);

    const fmt = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const startRecording = async () => {
        if (disabled || uiStateRef.current !== "idle") return;
        cancelledRef.current = false;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeType =
                MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
                    : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
                        : MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg"
                            : "";

            const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            chunksRef.current = [];

            mr.ondataavailable = e => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mr.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                if (cancelledRef.current) {
                    // Cancel path: buang chunks, tidak masuk preview
                    chunksRef.current = [];
                    return;
                }
                // Normal stop: buat preview blob
                const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
                const url = URL.createObjectURL(blob);
                setPreviewBlob(blob);
                setPreviewUrl(url);
                setUiStateSynced("preview");
            };

            mr.start(100);
            mediaRef.current = mr;
            startTsRef.current = Date.now();
            durationRef.current = 0;
            setDuration(0);
            setSlideX(0);
            setUiStateSynced("recording");

            timerRef.current = setInterval(() => {
                const s = Math.floor((Date.now() - startTsRef.current) / 1000);
                durationRef.current = s;
                setDuration(s);
            }, 1000);
        } catch (err) {
            console.error("[VN] mic error:", err);
            alert("Tidak bisa akses mikrofon. Pastikan izin diberikan.");
        }
    };

    // cancel=true  → set cancelledRef SEBELUM stop(), onstop akan discard
    // cancel=false → biarkan onstop buat preview
    const stopRecording = useCallback((cancel: boolean) => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

        cancelledRef.current = cancel;
        const mr = mediaRef.current;
        mediaRef.current = null;

        if (mr && mr.state !== "inactive") mr.stop();

        if (cancel) {
            setSlideX(0);
            setDuration(0);
            durationRef.current = 0;
            setUiStateSynced("idle");
            onCancel();
        }
        // Jika tidak cancel: onstop akan panggil setUiStateSynced("preview")
    }, [onCancel, setUiStateSynced]);

    // ── Touch handlers ────────────────────────────────────────────────────────
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        startRecording();
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (uiStateRef.current !== "recording") return;
        const dx = e.touches[0].clientX - touchStartX.current;
        setSlideX(dx < 0 ? Math.max(dx, -100) : 0);
    };
    const handleTouchEnd = (e: React.TouchEvent) => {
        if (uiStateRef.current !== "recording") return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (dx < -70) stopRecording(true);
        else stopRecording(false);
    };

    // ── Mouse handlers — pakai uiStateRef bukan uiState (avoid stale closure) ─
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        touchStartX.current = e.clientX;
        startRecording();

        const onMove = (ev: MouseEvent) => {
            if (uiStateRef.current !== "recording") return;
            const dx = ev.clientX - touchStartX.current;
            setSlideX(dx < 0 ? Math.max(dx, -100) : 0);
        };
        const onUp = (ev: MouseEvent) => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            if (uiStateRef.current !== "recording") return;
            const dx = ev.clientX - touchStartX.current;
            if (dx < -70) stopRecording(true);
            else stopRecording(false);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

    // ── Cancel preview ────────────────────────────────────────────────────────
    const cancelPreview = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewBlob(null);
        setDuration(0);
        durationRef.current = 0;
        setUiStateSynced("idle");
        onCancel();
    };

    // ── Confirm send ──────────────────────────────────────────────────────────
    const confirmSend = () => {
        if (!previewBlob) return;
        onSend(previewBlob, durationRef.current > 0 ? durationRef.current : duration);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewBlob(null);
        setDuration(0);
        durationRef.current = 0;
        setUiStateSynced("idle");
    };

    // ── Render: Preview ───────────────────────────────────────────────────────
    if (uiState === "preview" && previewUrl) {
        return (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 bg-white border-t border-gray-100">
                <button onClick={cancelPreview}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition hover:bg-red-50 flex-shrink-0"
                    style={{ background: "#fef2f2", color: "#ef4444" }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <div className="flex-1 min-w-0 px-2 py-1.5 rounded-xl"
                    style={{ background: "#f0f4ff", border: "1px solid #e0e7ff" }}>
                    <VoicePlayer url={previewUrl} isMine={false} />
                </div>
                <button onClick={confirmSend}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white transition hover:scale-105 active:scale-95 flex-shrink-0"
                    style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 2px 8px rgba(79,70,229,0.4)" }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                </button>
            </div>
        );
    }

    // ── Render: Recording ─────────────────────────────────────────────────────
    if (uiState === "recording") {
        const cancelProgress = Math.min(Math.abs(slideX) / 70, 1);
        return (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-t border-gray-100"
                style={{ userSelect: "none" }}>
                <div className="flex items-center gap-1.5 flex-1">
                    <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: "#ef4444" }}>
                        {fmt(duration)}
                    </span>
                    <div className="flex-1 flex items-center gap-1 overflow-hidden"
                        style={{ opacity: 1 - cancelProgress * 0.5 }}>
                        <svg className="w-3 h-3 text-gray-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span className="text-[9px] text-gray-300 truncate">Geser untuk batal</span>
                    </div>
                </div>
                <button
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                    style={{
                        width: 38, height: 38, borderRadius: "50%",
                        background: "linear-gradient(135deg,#ef4444,#dc2626)",
                        border: "none", cursor: "pointer", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 0 0 6px rgba(239,68,68,0.2)",
                        transform: `translateX(${slideX}px)`,
                        transition: "box-shadow 0.1s",
                        touchAction: "none",
                    }}>
                    <svg className="w-4 h-4" fill="white" viewBox="0 0 24 24">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"
                            stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                        <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
        );
    }

    // ── Render: Idle — hanya tombol mic ───────────────────────────────────────
    return (
        <button
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            disabled={disabled}
            title="Tahan untuk rekam suara"
            className="w-8 h-8 rounded-full flex items-center justify-center transition hover:scale-110 active:scale-95 disabled:opacity-40 flex-shrink-0"
            style={{
                background: "#f0f4ff", color: "#818cf8",
                border: "none", cursor: "grab", touchAction: "none",
            }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" strokeWidth={2} />
                <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" strokeWidth={2} />
            </svg>
        </button>
    );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────
interface ChatPanelProps {
    currentUser: ChatUser;
    targetUser: ChatUser;
    isMinimized: boolean;
    onToggleMinimize: () => void;
    onClose: () => void;
    unread: number;
}

export function ChatPanel({ currentUser, targetUser, isMinimized, onToggleMinimize, onClose, unread }: ChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<{ url: string; name: string; type: "image" | "file"; size: number } | null>(null);
    // FIX: voiceActive menggantikan voiceState lama yang tidak pernah di-update.
    // VoiceRecorder akan panggil onStateChange(true/false) untuk drive ini.
    const [voiceActive, setVoiceActive] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

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
        if (!isMinimized) {
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
    }, [messages, isMinimized]);

    useEffect(() => {
        const channel = supabase
            .channel(`dm:${[currentUser.id, targetUser.id].sort().join(":")}`)
            .on("postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${currentUser.id}` },
                (payload) => {
                    const msg = payload.new as Message;
                    if (msg.sender_id !== targetUser.id) return;
                    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
                }
            )
            .on("postgres_changes",
                { event: "UPDATE", schema: "public", table: "messages" },
                (payload) => {
                    const u = payload.new as Message;
                    setMessages(prev => prev.map(m => m.id === u.id
                        ? { ...m, content: u.content, is_deleted: u.is_deleted, edited_at: u.edited_at } : m));
                }
            )
            .subscribe();
        return () => { channel.unsubscribe(); };
    }, [currentUser.id, targetUser.id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert("Maks 5MB"); e.target.value = ""; return; }
        const isImage = file.type.startsWith("image/");
        setPreview({ url: isImage ? URL.createObjectURL(file) : "", name: file.name, type: isImage ? "image" : "file", size: file.size });
        setSelectedFile(file);
        e.target.value = "";
    };

    const cancelFilePreview = () => {
        if (preview?.url) URL.revokeObjectURL(preview.url);
        setPreview(null);
        setSelectedFile(null);
    };

    const send = async () => {
        const content = input.trim();
        if (!content || sending) return;
        setSending(true);
        const opt: Message = {
            id: `temp-${Date.now()}`, sender_id: currentUser.id, receiver_id: targetUser.id,
            content, is_read: false, is_deleted: false, edited_at: null, created_at: new Date().toISOString(),
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
            if (data.success) setMessages(prev => prev.map(m => m.id === opt.id ? data.message : m));
            else setMessages(prev => prev.filter(m => m.id !== opt.id));
        } catch { setMessages(prev => prev.filter(m => m.id !== opt.id)); }
        finally { setSending(false); setTimeout(() => inputRef.current?.focus(), 0); }
    };

    const sendAttachment = async () => {
        if (!selectedFile || uploading) return;
        const tempId = `temp-${Date.now()}`;
        const caption = input.trim();
        const isImage = selectedFile.type.startsWith("image/");
        const previewUrl = preview?.url ?? null;
        const opt: Message = {
            id: tempId, sender_id: currentUser.id, receiver_id: targetUser.id,
            content: caption, is_read: false, is_deleted: false, edited_at: null, created_at: new Date().toISOString(),
            attachment_url: previewUrl, attachment_type: isImage ? "image" : "file",
            attachment_name: selectedFile.name, attachment_size: selectedFile.size,
        };
        setMessages(prev => [...prev, opt]);
        setInput("");
        cancelFilePreview();
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", selectedFile);
            const up = await fetch("/api/messages/upload", { method: "POST", body: fd });
            const upData = await up.json();
            if (!upData.success) { setMessages(prev => prev.filter(m => m.id !== tempId)); return; }
            const msg = await fetch("/api/messages", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    receiver_id: targetUser.id, content: caption,
                    attachment_url: upData.url, attachment_type: upData.type,
                    attachment_name: upData.name, attachment_size: upData.size,
                }),
            });
            const msgData = await msg.json();
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            if (msgData.success) setMessages(prev => prev.map(m => m.id === tempId ? msgData.message : m));
            else setMessages(prev => prev.filter(m => m.id !== tempId));
        } catch { setMessages(prev => prev.filter(m => m.id !== tempId)); }
        finally { setUploading(false); }
    };

    const deleteMessage = async (id: string) => {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: true } : m));
        try { await fetch(`/api/messages?id=${id}`, { method: "DELETE" }); }
        catch { setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: false } : m)); }
    };

    const editMessage = async (id: string, content: string): Promise<boolean> => {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, content, edited_at: new Date().toISOString() } : m));
        try {
            const res = await fetch("/api/messages", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, content }),
            });
            const data = await res.json();
            if (!data.success) { await fetchMessages(); return false; }
            return true;
        } catch { await fetchMessages(); return false; }
    };

    // Di ChatPanel — sendVoiceNote
    // Di ChatPanel — ganti fungsi sendVoiceNote
    const sendVoiceNote = async (blob: Blob, recordDuration: number) => {
        const tempId = `temp-${Date.now()}`;

        // FIX: resolve MIME dari blob.type, jangan biarkan kosong
        const mimeType = blob.type && blob.type.startsWith("audio/")
            ? blob.type
            : "audio/webm"; // safe default untuk Chrome/Edge

        const ext = mimeType.includes("ogg") ? "ogg"
            : mimeType.includes("mp4") ? "m4a"
                : "webm";
        const fileName = `voice_${Date.now()}.${ext}`;

        console.log("[sendVoiceNote] blob.type:", blob.type, "→ mimeType:", mimeType, "| ext:", ext);

        const previewBlobUrl = URL.createObjectURL(blob);

        const opt: Message = {
            id: tempId,
            sender_id: currentUser.id,
            receiver_id: targetUser.id,
            content: "",
            is_read: false,
            is_deleted: false,
            edited_at: null,
            created_at: new Date().toISOString(),
            attachment_url: previewBlobUrl,
            attachment_type: "voice",
            attachment_name: fileName,
            attachment_size: blob.size,
        };
        setMessages(prev => [...prev, opt]);
        setUploading(true);

        try {
            const fd = new FormData();

            // FIX UTAMA: buat File eksplisit dengan MIME type yang benar
            // Kalau pakai fd.append("file", blob) langsung → browser tidak set Content-Type
            // di multipart boundary → server terima file.type kosong
            const audioFile = new File([blob], fileName, { type: mimeType });
            fd.append("file", audioFile);

            console.log("[sendVoiceNote] uploading File:", audioFile.name, audioFile.type, audioFile.size);

            const up = await fetch("/api/messages/upload", { method: "POST", body: fd });
            const upData = await up.json();

            console.log("[sendVoiceNote] upload result:", upData);

            if (!upData.success) {
                URL.revokeObjectURL(previewBlobUrl);
                setMessages(prev => prev.filter(m => m.id !== tempId));
                return;
            }

            const res = await fetch("/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    receiver_id: targetUser.id,
                    content: "",
                    attachment_url: upData.url,
                    attachment_type: "voice",
                    attachment_name: fileName,
                    attachment_size: blob.size,
                }),
            });
            const resData = await res.json();

            if (resData.success) {
                setMessages(prev => prev.map(m => m.id === tempId ? resData.message : m));
                setTimeout(() => URL.revokeObjectURL(previewBlobUrl), 500);
            } else {
                URL.revokeObjectURL(previewBlobUrl);
                setMessages(prev => prev.filter(m => m.id !== tempId));
            }
        } catch (err) {
            console.error("[sendVoiceNote] error:", err);
            URL.revokeObjectURL(previewBlobUrl);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setUploading(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            preview ? sendAttachment() : send();
        }
    };

    const isUploading = sending || uploading;
    const canSend = preview ? !uploading : (!!input.trim() && !sending);

    if (isMinimized) return null;

    return (
        <div className="flex flex-col overflow-hidden"
            style={{
                width: 296,
                height: preview ? 472 : 408,
                borderRadius: "14px 14px 0 0",
                background: "#f8f9fc",
                boxShadow: "0 -2px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)",
                transition: "height 0.18s ease",
            }}>

            {/* ── Header ── */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0 cursor-pointer"
                style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", borderRadius: "14px 14px 0 0" }}
                onClick={onToggleMinimize}>
                <div className="relative flex-shrink-0">
                    <UserAvatar name={targetUser.name} role={targetUser.role} size={30} />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400"
                        style={{ border: "1.5px solid #1a1a2e" }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] font-bold text-white truncate leading-tight">{targetUser.name}</p>
                    <p className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.38)" }}>
                        {ROLE_LABEL[targetUser.role] ?? targetUser.role}
                    </p>
                </div>
                <button onClick={e => { e.stopPropagation(); onToggleMinimize(); }}
                    className="w-5 h-5 flex items-center justify-center rounded transition hover:bg-white/10"
                    style={{ color: "rgba(255,255,255,0.4)" }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                    </svg>
                </button>
                <button onClick={e => { e.stopPropagation(); onClose(); }}
                    className="w-5 h-5 flex items-center justify-center rounded transition hover:bg-white/10"
                    style={{ color: "rgba(255,255,255,0.4)" }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* ── Accent line ── */}
            <div style={{ height: 2, background: "linear-gradient(90deg,#6366f1,#8b5cf6 50%,#ec4899)", flexShrink: 0, opacity: 0.65 }} />

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5" style={{ background: "#f8f9fc" }}>
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-5 h-5 rounded-full animate-spin"
                            style={{ border: "2px solid #e2e8f0", borderTopColor: "#6366f1" }} />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                        <div className="text-3xl opacity-20">💬</div>
                        <p className="text-[11px] text-gray-400">Mulai percakapan!</p>
                    </div>
                ) : messages.map(msg => (
                    <MessageItem key={msg.id} msg={msg}
                        isMine={msg.sender_id === currentUser.id}
                        onEdit={editMessage} onDelete={deleteMessage} />
                ))}
                <div ref={bottomRef} />
            </div>

            {/* ── File preview bar ── */}
            {preview && (
                <div className="flex-shrink-0 px-3 py-2 bg-white border-t border-gray-100">
                    <div className="flex items-center gap-2 p-2 rounded-xl"
                        style={{ background: "#f0f4ff", border: "1px solid #e0e7ff" }}>
                        {preview.type === "image"
                            ? <img src={preview.url} alt="preview" className="w-9 h-9 object-cover rounded-lg flex-shrink-0" />
                            : <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                        }
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-gray-700 truncate">{preview.name}</p>
                            <p className="text-[9px] text-gray-400">{formatFileSize(preview.size)}</p>
                        </div>
                        <button onClick={cancelFilePreview}
                            className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center transition hover:bg-gray-300">
                            <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Input area ──
                voiceActive=true  → VoiceRecorder ambil alih full bar (recording atau preview)
                voiceActive=false → Bar input teks normal, mic button di ujung kanan
                Perubahan state di-drive oleh onStateChange dari VoiceRecorder.
            */}
            {voiceActive ? (
                <VoiceRecorder
                    onSend={sendVoiceNote}
                    onCancel={() => setVoiceActive(false)}
                    onStateChange={setVoiceActive}
                    disabled={isUploading}
                />
            ) : (
                <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white border-t border-gray-100">
                    {/* Attachment button */}
                    <button onClick={() => fileRef.current?.click()} disabled={isUploading}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-indigo-50 disabled:opacity-40 flex-shrink-0"
                        style={{ background: "#f0f4ff", color: "#818cf8" }}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                    </button>

                    {/* Text input */}
                    <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder={preview ? "Caption (opsional)..." : "Tulis pesan..."}
                        maxLength={1000} disabled={isUploading}
                        className="flex-1 h-8 rounded-full px-3 text-xs font-medium outline-none disabled:opacity-50"
                        style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", color: "#334155" }} />

                    {/* Send button ATAU Mic button */}
                    {input.trim() || preview ? (
                        <button onClick={preview ? sendAttachment : send} disabled={!canSend}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white transition hover:scale-105 active:scale-95 disabled:opacity-40 flex-shrink-0"
                            style={{
                                background: canSend ? "linear-gradient(135deg,#4f46e5,#7c3aed)" : "#e2e8f0",
                                boxShadow: canSend ? "0 2px 8px rgba(79,70,229,0.35)" : "none",
                            }}>
                            {isUploading
                                ? <div className="w-3 h-3 rounded-full animate-spin"
                                    style={{ border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            }
                        </button>
                    ) : (
                        // Mic button — hanya muncul kalau input kosong & tidak ada file
                        <VoiceRecorder
                            onSend={sendVoiceNote}
                            onCancel={() => { }}
                            onStateChange={setVoiceActive}
                            disabled={isUploading}
                        />
                    )}

                    {/* Hidden file input */}
                    <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} accept="*/*" />
                </div>
            )}
        </div>
    );
}

// ─── ChatManager ──────────────────────────────────────────────────────────────
interface ChatManagerProps {
    currentUser: ChatUser;
    activeChats: { user: ChatUser }[];
    onClose: (userId: string) => void;
}

export function ChatManager({ currentUser, activeChats, onClose }: ChatManagerProps) {
    const { openGroupChat, setOpenGroupChat } = useChatContext();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

    const prevLen = useRef(activeChats.length);
    useEffect(() => {
        if (activeChats.length > prevLen.current) {
            const latest = activeChats[activeChats.length - 1];
            setExpandedId(latest.user.id);
        }
        prevLen.current = activeChats.length;
    }, [activeChats]);

    useEffect(() => {
        if (expandedId) {
            setUnreadMap(prev => ({ ...prev, [expandedId]: 0 }));
        }
    }, [expandedId]);

    const handleClose = (userId: string) => {
        if (expandedId === userId) setExpandedId(null);
        onClose(userId);
    };

    const handleToggle = (userId: string) => {
        setExpandedId(prev => prev === userId ? null : userId);
    };

    const hasAnything = activeChats.length > 0 || openGroupChat;

    return (
        <>
            {/* ── Bottom strip ── */}
            <div
                className="fixed bottom-0 left-0 right-0 z-[9990] flex items-center"
                style={{
                    height: 38,
                    background: "linear-gradient(180deg, #1e1e30 0%, #14141f 100%)",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    paddingLeft: 260,
                    paddingRight: 12,
                    gap: 4,
                }}
            >
                <button
                    onClick={() => setOpenGroupChat(!openGroupChat)}
                    className="flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[10.5px] font-semibold transition"
                    style={openGroupChat
                        ? { background: "rgba(99,102,241,0.25)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }
                        : { color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
                    }
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                    </svg>
                    <span className="hidden sm:inline">Grup Chat</span>
                </button>

                {activeChats.length > 0 && (
                    <div className="w-px h-4 mx-1 flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
                )}

                {activeChats.map(chat => {
                    const isActive = expandedId === chat.user.id;
                    const unread = unreadMap[chat.user.id] ?? 0;
                    return (
                        <div key={chat.user.id} className="flex items-center">
                            <button
                                onClick={() => handleToggle(chat.user.id)}
                                className="flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[10.5px] font-semibold transition max-w-[120px]"
                                style={isActive
                                    ? { background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }
                                    : { color: "rgba(255,255,255,0.5)", border: "1px solid transparent" }
                                }
                            >
                                <UserAvatar name={chat.user.name} role={chat.user.role} size={16} />
                                <span className="truncate">{chat.user.name.split(" ")[0]}</span>
                                {unread > 0 && (
                                    <span className="w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[7px] font-black flex items-center justify-center flex-shrink-0">
                                        {unread > 9 ? "9+" : unread}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => handleClose(chat.user.id)}
                                className="w-4 h-4 flex items-center justify-center rounded ml-0.5 transition hover:bg-white/10"
                                style={{ color: "rgba(255,255,255,0.25)" }}
                            >
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    );
                })}

                <div className="flex-1" />
                <div className="flex items-center gap-1 text-[9px] mr-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="hidden sm:inline">Online</span>
                </div>
            </div>

            {/* ── Chat panels ── */}
            {hasAnything && (
                <div className="fixed z-[9991] flex items-end gap-2"
                    style={{ bottom: 38, right: 16 }}>
                    {openGroupChat && (
                        <div style={{ animation: "chatSlideUp 0.18s ease-out" }}>
                            <GroupChatPanel
                                currentUser={currentUser}
                                onClose={() => setOpenGroupChat(false)}
                            />
                        </div>
                    )}
                    {activeChats
                        .filter(c => expandedId === c.user.id)
                        .map(chat => (
                            <div key={chat.user.id} style={{ animation: "chatSlideUp 0.18s ease-out" }}>
                                <ChatPanel
                                    currentUser={currentUser}
                                    targetUser={chat.user}
                                    isMinimized={false}
                                    onToggleMinimize={() => handleToggle(chat.user.id)}
                                    onClose={() => handleClose(chat.user.id)}
                                    unread={unreadMap[chat.user.id] ?? 0}
                                />
                            </div>
                        ))
                    }
                </div>
            )}

            <style>{`
                @keyframes chatSlideUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    );
}

// ─── Backward-compat export ───────────────────────────────────────────────────
export function ChatBubble({ currentUser, targetUser, onClose }: {
    currentUser: ChatUser; targetUser: ChatUser; onClose: () => void;
}) {
    return (
        <ChatPanel
            currentUser={currentUser}
            targetUser={targetUser}
            isMinimized={false}
            onToggleMinimize={onClose}
            onClose={onClose}
            unread={0}
        />
    );
}