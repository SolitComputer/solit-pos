// src/components/ui/GroupChatPanel.tsx
"use client";

import {
    useEffect, useRef, useState, useCallback,
    KeyboardEvent, Fragment,
} from "react";
import { getSupabaseClient } from "@/services/supabaseClient";

const supabase = getSupabaseClient();

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReplyPreview {
    id: string;
    sender_name: string;
    content: string;
    is_deleted: boolean;
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
    reply_to?: ReplyPreview | null;
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

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, role, size = 32 }: { name: string; role: string; size?: number }) {
    return (
        <div style={{
            width: size, height: size,
            backgroundColor: getAvatarColor(role),
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
        }}>
            {getInitials(name)}
        </div>
    );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
interface BubbleProps {
    msg: GroupMessage;
    isMine: boolean;
    isAdmin: boolean;
    onReply: (msg: GroupMessage) => void;
    onDelete: (id: string) => void;
    onEdit: (id: string, newContent: string) => Promise<boolean>;
    onScrollToReply: (id: string) => void;
}

function MessageBubble({ msg, isMine, isAdmin, onReply, onDelete, onEdit, onScrollToReply }: BubbleProps) {
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

    const handleEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSaveEdit();
        }
        if (e.key === "Escape") {
            setIsEditing(false);
            setEditContent(msg.content);
        }
    };

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
                        <span
                            className="text-[10px] font-semibold mb-0.5 px-1"
                            style={{ color: getAvatarColor(msg.sender_role) }}
                        >
                            {msg.sender_name} · {ROLE_LABEL[msg.sender_role] ?? msg.sender_role}
                        </span>
                    )}
                    <div className="px-3 py-2 rounded-2xl bg-gray-100 border border-gray-200 text-gray-400 text-xs italic">
                        🚫 menghapus pesan ini
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            id={`msg-${msg.id}`}
            className={`flex gap-2 group ${isMine ? "justify-end" : "justify-start"}`}
        >
            {!isMine && (
                <div className="flex-shrink-0 self-end mb-1">
                    <Avatar name={msg.sender_name} role={msg.sender_role} size={30} />
                </div>
            )}

            <div className={`flex flex-col max-w-[72%] ${isMine ? "items-end" : "items-start"}`}>
                {!isMine && (
                    <span
                        className="text-[10px] font-semibold mb-0.5 px-1"
                        style={{ color: getAvatarColor(msg.sender_role) }}
                    >
                        {msg.sender_name} · {ROLE_LABEL[msg.sender_role] ?? msg.sender_role}
                    </span>
                )}

                <div className="relative">
                    {/* ── Edit mode ── */}
                    {isEditing ? (
                        <div className={`rounded-2xl shadow-sm px-3 pt-2 pb-2 min-w-[200px] ${isMine ? "bg-[#1a1a2e] rounded-br-sm" : "bg-white border border-gray-200 rounded-bl-sm"
                            }`}>
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
                                className={`w-full bg-transparent text-sm resize-none outline-none leading-relaxed ${isMine ? "text-white placeholder:text-white/40" : "text-gray-800 placeholder:text-gray-400"
                                    }`}
                                style={{ minHeight: 22 }}
                            />
                            <div className="flex items-center justify-between mt-2 gap-2">
                                <span className={`text-[10px] ${isMine ? "text-white/40" : "text-gray-400"}`}>
                                    Enter simpan · Esc batal
                                </span>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => { setIsEditing(false); setEditContent(msg.content); }}
                                        className={`text-[10px] px-2 py-0.5 rounded-lg transition ${isMine
                                            ? "text-white/60 hover:bg-white/10 hover:text-white"
                                            : "text-gray-500 hover:bg-gray-100"
                                            }`}
                                    >
                                        Batal
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={saving || !editContent.trim()}
                                        className={`text-[10px] px-2.5 py-0.5 rounded-lg font-semibold transition disabled:opacity-40 ${isMine
                                            ? "bg-white/20 text-white hover:bg-white/30"
                                            : "bg-[#1a1a2e] text-white hover:bg-[#16213e]"
                                            }`}
                                    >
                                        {saving ? "..." : "Simpan"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ── Normal bubble ── */
                        <div
                            className={`relative px-3 py-2 rounded-2xl shadow-sm cursor-pointer select-text ${isMine
                                ? "bg-[#1a1a2e] text-white rounded-br-sm"
                                : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm"
                                }`}
                            onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
                        >
                            {msg.reply_to && (
                                <div
                                    className={`mb-2 px-2 py-1.5 rounded-lg cursor-pointer text-[10px] border-l-2 ${isMine
                                        ? "bg-white/10 border-white/40 text-white/80"
                                        : "bg-gray-50 border-gray-300 text-gray-600"
                                        }`}
                                    onClick={() => onScrollToReply(msg.reply_to_id!)}
                                >
                                    <p className="font-semibold truncate">{msg.reply_to.sender_name}</p>
                                    <p className="truncate mt-0.5 opacity-80">
                                        {msg.reply_to.is_deleted ? "🚫 Pesan dihapus" : msg.reply_to.content}
                                    </p>
                                </div>
                            )}

                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>

                            <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? "text-white/50" : "text-gray-400"}`}>
                                {msg.edited_at && (
                                    <span className="text-[9px] italic opacity-70">diedit</span>
                                )}
                                <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                            </div>
                        </div>
                    )}

                    {/* Context menu */}
                    {showMenu && !isEditing && (
                        <div
                            ref={menuRef}
                            className={`absolute bottom-full mb-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden py-1 min-w-[140px] ${isMine ? "right-0" : "left-0"
                                }`}
                        >
                            <button
                                onClick={() => { onReply(msg); setShowMenu(false); }}
                                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                                Balas
                            </button>

                            {isMine && (
                                <button
                                    onClick={() => { setIsEditing(true); setShowMenu(false); }}
                                    className="w-full text-left px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                </button>
                            )}

                            {(isMine || isAdmin) && (
                                <button
                                    onClick={() => { onDelete(msg.id); setShowMenu(false); }}
                                    className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Hapus
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {!isEditing && (
                <div className={`opacity-0 group-hover:opacity-100 flex items-center self-end mb-1 transition-opacity ${isMine ? "order-first" : ""}`}>
                    <button
                        onClick={() => onReply(msg)}
                        className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition"
                        title="Balas"
                    >
                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Main GroupChatPanel ──────────────────────────────────────────────────────
export function GroupChatPanel({ currentUser, onClose }: GroupChatPanelProps) {
    const [messages, setMessages] = useState<GroupMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
    const [unread, setUnread] = useState(0);
    const [isScrolledUp, setIsScrolledUp] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const isAdmin = FULL_ACCESS.has(currentUser.role);

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/group-chat?limit=60");
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
        } catch { /* fallback ke raw payload */ }
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
                const newUnreadCount = messages
                    .slice(prevMsgCount.current)
                    .filter(m => m.sender_id !== currentUser.id).length;
                if (newUnreadCount > 0) setUnread(u => u + newUnreadCount);
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
                    const fullMsg = await fetchSingleMessage(incoming.id);
                    const msgToAdd = fullMsg ?? incoming;
                    setMessages(prev => {
                        if (prev.some(m => m.id === msgToAdd.id)) return prev;
                        return [...prev, msgToAdd];
                    });
                }
            )
            .on("postgres_changes",
                { event: "UPDATE", schema: "public", table: "group_messages" },
                (payload) => {
                    const updated = payload.new as GroupMessage;
                    setMessages(prev =>
                        prev.map(m => m.id === updated.id
                            ? {
                                ...m,
                                content: updated.content,
                                is_deleted: updated.is_deleted,
                                edited_at: updated.edited_at,
                            }
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

    const send = async () => {
        const content = input.trim();
        if (!content || sending) return;

        setSending(true);
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
            reply_to: replyTo
                ? { id: replyTo.id, sender_name: replyTo.sender_name, content: replyTo.content, is_deleted: replyTo.is_deleted }
                : null,
        };

        setMessages(prev => [...prev, optimistic]);
        setInput("");
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
        } finally {
            setSending(false);
            inputRef.current?.focus();
        }
    };

    const deleteMessage = async (messageId: string) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true } : m));
        try {
            await fetch(`/api/group-chat?id=${messageId}`, { method: "DELETE" });
        } catch {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: false } : m));
        }
    };

    const editMessage = async (messageId: string, newContent: string): Promise<boolean> => {
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
                if (original) {
                    setMessages(prev => prev.map(m => m.id === messageId ? original : m));
                }
                return false;
            }
            return true;
        } catch {
            const original = await fetchSingleMessage(messageId);
            if (original) {
                setMessages(prev => prev.map(m => m.id === messageId ? original : m));
            }
            return false;
        }
    };

    const scrollToReply = (id: string) => {
        const el = document.getElementById(`msg-${id}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("highlight-msg");
            setTimeout(() => el.classList.remove("highlight-msg"), 1500);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
        if (e.key === "Escape" && replyTo) setReplyTo(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        const ta = e.target;
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    };

    // ── Group by date ─────────────────────────────────────────────────────────
    type DateGroup = { dateKey: string; dateLabel: string; msgs: GroupMessage[] };
    const groupedMessages = messages.reduce<DateGroup[]>((acc, msg) => {
        const key = getDateKey(msg.created_at);
        const last = acc[acc.length - 1];
        if (!last || last.dateKey !== key) {
            acc.push({ dateKey: key, dateLabel: formatDateDivider(msg.created_at), msgs: [msg] });
        } else {
            last.msgs.push(msg);
        }
        return acc;
    }, []);

    return (
        <div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
            style={{ backdropFilter: "blur(4px)", backgroundColor: "rgba(0,0,0,0.6)" }}
        >
            <div
                className="relative flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
                style={{ width: "min(900px, 100%)", height: "min(760px, 95vh)" }}
            >
                {/* Header */}
                <div
                    className="flex-shrink-0 flex items-center gap-3 px-5 py-4"
                    style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}
                >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(255,255,255,0.12)" }}>
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-bold text-white">All Team Solit 💬</h2>
                        <p className="text-[11px] text-white/50 mt-0.5">Grup chat seluruh tim</p>
                    </div>
                    <button onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/15 transition flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Messages */}
                <div
                    ref={messagesRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-5 py-4 space-y-1"
                    style={{
                        background: "linear-gradient(180deg, #f0f4ff 0%, #f8f9ff 100%)",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231a1a2e' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                >
                    {loadingMore && (
                        <div className="flex justify-center py-2">
                            <div className="w-5 h-5 border-2 border-gray-300 border-t-[#1a1a2e] rounded-full animate-spin" />
                        </div>
                    )}
                    {hasMore && !loadingMore && (
                        <div className="flex justify-center py-2">
                            <button onClick={loadMore}
                                className="text-[11px] text-[#1a1a2e]/60 hover:text-[#1a1a2e] transition px-3 py-1 bg-white/80 rounded-full border border-gray-200 hover:bg-white">
                                Muat pesan lebih lama ↑
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <div className="w-8 h-8 border-2 border-gray-300 border-t-[#1a1a2e] rounded-full animate-spin" />
                            <p className="text-xs text-gray-400">Memuat pesan...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-3xl">👋</div>
                            <div>
                                <p className="text-sm font-semibold text-gray-700">Belum ada pesan</p>
                                <p className="text-xs text-gray-400 mt-1">Mulai percakapan untuk seluruh tim!</p>
                            </div>
                        </div>
                    ) : (
                        groupedMessages.map((group: DateGroup) => (
                            <Fragment key={group.dateKey}>
                                <div className="flex items-center justify-center py-3">
                                    <div className="bg-white/80 border border-gray-200 text-gray-500 text-[10px] font-semibold px-3 py-1 rounded-full shadow-sm">
                                        {group.dateLabel}
                                    </div>
                                </div>
                                {group.msgs.map((msg: GroupMessage, idx: number) => {
                                    const isMine = msg.sender_id === currentUser.id;
                                    const prevMsg = group.msgs[idx - 1];
                                    const isNewSender = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                                    return (
                                        <div key={msg.id} className={isNewSender ? "mt-3" : "mt-0.5"}>
                                            <MessageBubble
                                                msg={msg}
                                                isMine={isMine}
                                                isAdmin={isAdmin}
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
                    <div className="absolute bottom-24 right-5 z-10">
                        <button
                            onClick={() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setUnread(0); }}
                            className="relative w-10 h-10 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition"
                        >
                            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                            {unread > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1a1a2e] text-white text-[9px] font-bold flex items-center justify-center">
                                    {unread > 9 ? "9+" : unread}
                                </span>
                            )}
                        </button>
                    </div>
                )}

                {/* Reply preview */}
                {replyTo && (
                    <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-t border-gray-100"
                        style={{ background: "#f8f9ff" }}>
                        <div className="flex-1 min-w-0 pl-3 border-l-2 border-[#1a1a2e]">
                            <p className="text-[10px] font-bold text-[#1a1a2e]">{replyTo.sender_name}</p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{replyTo.content}</p>
                        </div>
                        <button onClick={() => setReplyTo(null)}
                            className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition flex-shrink-0">
                            <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Input */}
                <div className="flex-shrink-0 flex items-end gap-3 px-4 py-3 border-t border-gray-100 bg-white">
                    <div className="flex-shrink-0 self-end mb-1">
                        <Avatar name={currentUser.name} role={currentUser.role} size={32} />
                    </div>
                    <div className="flex-1 flex items-end gap-2 bg-gray-100 rounded-2xl px-3 py-2 min-h-[42px]">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Tulis pesan ke All Team Solit..."
                            maxLength={2000}
                            rows={1}
                            className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 resize-none outline-none leading-relaxed max-h-[120px] min-h-[22px]"
                            style={{ height: "22px" }}
                        />
                        {input.length > 1800 && (
                            <span className="text-[10px] text-gray-400 self-end flex-shrink-0">
                                {input.length}/2000
                            </span>
                        )}
                    </div>
                    <button
                        onClick={send}
                        disabled={!input.trim() || sending}
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition self-end disabled:opacity-40"
                        style={{ background: input.trim() ? "#1a1a2e" : "#e5e7eb" }}
                    >
                        {sending ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" fill="none"
                                stroke={input.trim() ? "white" : "#9ca3af"} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            <style jsx global>{`
        @keyframes highlightMsg {
          0%   { background-color: transparent; }
          30%  { background-color: rgba(26, 26, 46, 0.12); }
          100% { background-color: transparent; }
        }
        .highlight-msg {
          animation: highlightMsg 1.5s ease-out;
          border-radius: 12px;
        }
      `}</style>
        </div>
    );
}