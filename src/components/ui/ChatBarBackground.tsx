// src/components/ui/ChatBarBackground.tsx
// Floating button chat — drag + snap ke tepi (gaya Android) + daftar semua user
"use client";

import { useChatContext } from "@/contexts/ChatContext";
import { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";

const BTN_SIZE = 48;
const MARGIN = 12;
const DRAG_THRESHOLD = 4;
const POS_KEY = "solit_chat_btn_pos";
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

interface ChatUser { id: string; name: string; role: string; }
interface PresenceInfo { is_online: boolean; last_seen: string | null; seconds_ago: number | null; }

// fungsi pembuka DM yang mungkin ada di ChatContext (nama bervariasi)
type OpenChatCtx = {
    openChat?: (u: ChatUser) => void;
    addChat?: (u: ChatUser) => void;
    startChat?: (u: ChatUser) => void;
    openDM?: (u: ChatUser) => void;
};

const getInitials = (n: string) => n.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
const roleLabel = (r: string) => r.split("_").map(w => (w[0] ?? "") + w.slice(1).toLowerCase()).join(" ");
const lastSeenLabel = (s: number | null) => {
    if (s === null) return "lama tidak aktif";
    if (s < 60) return "baru saja";
    if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
    if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
    return `${Math.floor(s / 86400)} hari lalu`;
};

export default function ChatBarBackground() {
    const chatCtx = useChatContext();
    const { setOpenGroupChat, openGroupChat, activeChats, setExpandedChatId } = chatCtx;

    const [ready, setReady] = useState(false);
    const [meId, setMeId] = useState<string | null>(null);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // posisi tombol
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const [snapping, setSnapping] = useState(false);
    const [liftRatio, setLiftRatio] = useState(0);
    const dragState = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: false, pointerId: -1 });
    const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // data user untuk popup
    const [users, setUsers] = useState<ChatUser[]>([]);
    const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
    const [search, setSearch] = useState("");

    useEffect(() => {
        getCurrentUserClient().then(u => { if (u) { setReady(true); setMeId(u.id); } });
    }, []);

    const clampPos = useCallback((x: number, y: number) => ({
        x: Math.min(Math.max(x, MARGIN), window.innerWidth - BTN_SIZE - MARGIN),
        y: Math.min(Math.max(y, MARGIN), window.innerHeight - BTN_SIZE - MARGIN),
    }), []);

    // init posisi
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(POS_KEY);
            if (raw) { const p = JSON.parse(raw); setPos(clampPos(p.x, p.y)); return; }
        } catch { /* ignore */ }
        setPos(clampPos(window.innerWidth - BTN_SIZE - 16, window.innerHeight - BTN_SIZE - 90));
    }, [clampPos]);

    useEffect(() => {
        const onResize = () => setPos(prev => (prev ? clampPos(prev.x, prev.y) : prev));
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [clampPos]);

    useEffect(() => () => { if (snapTimer.current) clearTimeout(snapTimer.current); }, []);

    // tutup menu saat klik di luar
    useEffect(() => {
        if (!showMenu) return;
        const h = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [showMenu]);

    // ambil daftar user sekali
    useEffect(() => {
        if (!ready) return;
        fetch("/api/users").then(r => r.json()).then(d => {
            if (d.success) setUsers((d.users as ChatUser[]).filter(u => u.id !== meId));
        }).catch(() => { });
    }, [ready, meId]);

    // presence: poll saat popup terbuka saja (hemat)
    const fetchPresence = useCallback(async () => {
        try {
            const res = await fetch("/api/presence");
            const d = await res.json();
            if (d.success) {
                const now = Date.now();
                const map: Record<string, PresenceInfo> = {};
                for (const p of (d.data ?? [])) {
                    const ls: string | null = p.last_seen ?? null;
                    map[p.user_id] = {
                        last_seen: ls,
                        is_online: ls ? now - new Date(ls).getTime() < ONLINE_THRESHOLD_MS : false,
                        seconds_ago: ls ? Math.floor((now - new Date(ls).getTime()) / 1000) : null,
                    };
                }
                setPresence(map);
            }
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        if (!showMenu) return;
        fetchPresence();
        const t = setInterval(fetchPresence, 30_000);
        return () => clearInterval(t);
    }, [showMenu, fetchPresence]);

    const computeLift = useCallback((y: number) => {
        const r = 1 - y / (window.innerHeight * 0.8);
        return Math.min(Math.max(r, 0), 1);
    }, []);

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!pos) return;
        if (snapTimer.current) { clearTimeout(snapTimer.current); setSnapping(false); }
        const ds = dragState.current;
        ds.startX = e.clientX; ds.startY = e.clientY;
        ds.originX = pos.x; ds.originY = pos.y;
        ds.moved = false; ds.pointerId = e.pointerId;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        const ds = dragState.current;
        if (ds.pointerId !== e.pointerId || e.buttons === 0) return;
        const dx = e.clientX - ds.startX;
        const dy = e.clientY - ds.startY;
        if (!ds.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!ds.moved) { ds.moved = true; setDragging(true); setShowMenu(false); }
        const next = clampPos(ds.originX + dx, ds.originY + dy);
        setPos(next);                       // ikut jari, tanpa transisi (instan)
        setLiftRatio(computeLift(next.y));
    };

    const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
        const ds = dragState.current;
        if (ds.pointerId !== e.pointerId) return;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

        if (ds.moved) {
            // ⬅️➡️ SNAP ke tepi terdekat (gaya bubble Android) — tidak berhenti di tengah
            setPos(prev => {
                if (!prev) return prev;
                const maxX = window.innerWidth - BTN_SIZE - MARGIN;
                const center = prev.x + BTN_SIZE / 2;
                const snappedX = center < window.innerWidth / 2 ? MARGIN : maxX;
                const snapped = { x: snappedX, y: prev.y };
                try { localStorage.setItem(POS_KEY, JSON.stringify(snapped)); } catch { /* ignore */ }
                return snapped;
            });
            setSnapping(true); // aktifkan transisi sebentar agar meluncur halus ke tepi
            if (snapTimer.current) clearTimeout(snapTimer.current);
            snapTimer.current = setTimeout(() => setSnapping(false), 300);
        } else {
            setShowMenu(v => !v); // klik biasa → toggle menu
        }
        ds.moved = false; ds.pointerId = -1;
        setDragging(false);
        setLiftRatio(0);
    };

    const openDM = (u: ChatUser) => {
        const c = chatCtx as unknown as OpenChatCtx;
        const fn = c.openChat ?? c.addChat ?? c.startChat ?? c.openDM;
        if (typeof fn === "function") fn(u);
        else if (activeChats.some(ch => ch.id === u.id)) setExpandedChatId(u.id);
        else console.warn("[chat] fungsi pembuka DM tidak ditemukan di ChatContext — sebutkan namanya.");
        setShowMenu(false);
    };

    if (!ready || !pos) return null;

    const totalActive = activeChats.length + (openGroupChat ? 1 : 0);
    const openUp = pos.y > window.innerHeight / 2;
    const alignRight = pos.x > window.innerWidth / 2;
    const glow = liftRatio;
    const liftScale = dragging ? 1.08 + glow * 0.22 : 1;

    // urutan: online dulu → terakhir online terbaru → nama
    const sortedUsers = [...users]
        .filter(u =>
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            roleLabel(u.role).toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
            const ao = presence[a.id]?.is_online ? 1 : 0;
            const bo = presence[b.id]?.is_online ? 1 : 0;
            if (ao !== bo) return bo - ao;
            const al = presence[a.id]?.last_seen ?? null;
            const bl = presence[b.id]?.last_seen ?? null;
            if (!al && !bl) return a.name.localeCompare(b.name);
            if (!al) return 1;
            if (!bl) return -1;
            return new Date(bl).getTime() - new Date(al).getTime();
        });
    const onlineCount = users.filter(u => presence[u.id]?.is_online).length;

    return (
        <div
            ref={menuRef}
            className="fixed z-[9990]"
            style={{
                left: pos.x, top: pos.y, touchAction: "none",
                transition: snapping
                    ? "left 0.28s cubic-bezier(0.22,1,0.36,1), top 0.28s cubic-bezier(0.22,1,0.36,1)"
                    : "none",
            }}
        >
            {/* Aura glow saat diangkat */}
            {dragging && glow > 0.02 && (
                <span aria-hidden className="pointer-events-none absolute rounded-full"
                    style={{
                        left: "50%", top: "50%", width: BTN_SIZE, height: BTN_SIZE,
                        transform: `translate(-50%,-50%) scale(${1 + glow * 2.2})`,
                        background: `radial-gradient(circle, rgba(124,58,237,${0.35 * glow}) 0%, rgba(79,70,229,0) 70%)`,
                        filter: `blur(${4 + glow * 6}px)`, transition: "transform 0.08s linear",
                    }} />
            )}
            {dragging && glow > 0.25 && (
                <span aria-hidden className="pointer-events-none absolute rounded-full"
                    style={{
                        left: "50%", top: "50%", width: BTN_SIZE, height: BTN_SIZE,
                        transform: "translate(-50%,-50%)", border: `2px solid rgba(124,58,237,${0.5 * glow})`,
                        animation: "chatAuraPulse 1s ease-out infinite",
                    }} />
            )}

            {/* POPUP */}
            {showMenu && !dragging && (
                <div className="absolute bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                    style={{
                        width: 240, maxHeight: 420, border: "1px solid #e5e7eb",
                        animation: "floatMenuIn 0.15s ease-out",
                        ...(openUp ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }),
                        ...(alignRight ? { right: 0 } : { left: 0 }),
                    }}>
                    {/* header */}
                    <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ background: "#1a1a2e" }}>
                        <div>
                            <p className="text-xs font-bold text-white">Solit Chat</p>
                            <p className="text-[10px] text-white/40 mt-0.5">{onlineCount} online</p>
                        </div>
                        <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(16,185,129,0.15)", color: "#34d399" }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
                        </span>
                    </div>

                    {/* Grup Chat */}
                    <button onClick={() => { setOpenGroupChat(!openGroupChat); setShowMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition hover:bg-gray-50 flex-shrink-0 border-b border-gray-100"
                        style={{ color: openGroupChat ? "#4f46e5" : "#374151" }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: openGroupChat ? "#eef2ff" : "#f3f4f6" }}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                            </svg>
                        </div>
                        <span>Grup Chat</span>
                        {openGroupChat && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                    </button>

                    {/* search */}
                    <div className="px-3 py-2 flex-shrink-0 border-b border-gray-100">
                        <div className="relative">
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari anggota..."
                                className="w-full h-8 rounded-lg pl-8 pr-2 text-[11px] outline-none focus:ring-2 focus:ring-indigo-200"
                                style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#334155" }} />
                        </div>
                    </div>

                    {/* daftar semua user (online dulu) */}
                    <div className="overflow-y-auto flex-1">
                        <p className="px-4 pt-2 pb-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Semua Anggota</p>
                        {sortedUsers.length === 0 ? (
                            <p className="text-[11px] text-gray-400 text-center py-4">Tidak ada anggota</p>
                        ) : sortedUsers.map(u => {
                            const pr = presence[u.id];
                            const online = !!pr?.is_online;
                            return (
                                <button key={u.id} onClick={() => openDM(u)}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-indigo-50 transition text-left">
                                    <div className="relative flex-shrink-0">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[9px] font-bold"
                                            style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)", opacity: online ? 1 : 0.55 }}>
                                            {getInitials(u.name)}
                                        </div>
                                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${online ? "bg-emerald-500" : "bg-gray-300"}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-700 truncate">{u.name}</p>
                                        <p className="text-[9px] truncate" style={{ color: online ? "#059669" : "#94a3b8" }}>
                                            {online ? "online" : lastSeenLabel(pr?.seconds_ago ?? null)}
                                        </p>
                                    </div>
                                    <svg className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* BUTTON */}
            <button
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowMenu(v => !v); } }}
                className="relative w-12 h-12 rounded-full flex items-center justify-center text-white select-none"
                style={{
                    cursor: dragging ? "grabbing" : "grab",
                    touchAction: "none", willChange: "transform",
                    transform: `scale(${liftScale}) rotate(${dragging ? -glow * 6 : 0}deg)`,
                    transition: dragging
                        ? "transform 0.08s linear, box-shadow 0.12s ease, background 0.2s ease"
                        : "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease, background 0.2s ease",
                    background: (showMenu || dragging) ? "linear-gradient(135deg,#4f46e5,#7c3aed)" : "linear-gradient(135deg,#1a1a2e,#16213e)",
                    boxShadow: dragging
                        ? `0 ${10 + glow * 26}px ${20 + glow * 44}px rgba(79,70,229,${0.25 + glow * 0.45}), 0 2px 8px rgba(0,0,0,0.25)`
                        : "0 4px 20px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)",
                }}
                title="Geser untuk pindah • Klik untuk buka chat">
                {showMenu && !dragging ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                )}
                {!showMenu && totalActive > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[8px] font-black flex items-center justify-center" style={{ background: "#ef4444" }}>
                        {totalActive}
                    </span>
                )}
            </button>

            <style>{`
                @keyframes floatMenuIn { from { opacity:0; transform: translateY(8px) scale(0.96);} to {opacity:1; transform: translateY(0) scale(1);} }
                @keyframes chatAuraPulse { 0%{transform:translate(-50%,-50%) scale(1);opacity:.6;} 100%{transform:translate(-50%,-50%) scale(2.4);opacity:0;} }
            `}</style>
        </div>
    );
}