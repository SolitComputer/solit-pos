// src/components/layout/SellerReminderNotifier.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useSellerReminderNotify, SellerReminder } from "@/hooks/useSellerReminderNotify";
import { useSellerFollowupDueAlert, DueFollowupItem } from "@/hooks/useSellerFollowupDueAlert";
import { useDraggablePosition } from "@/hooks/useDraggablePosition";
import { playReminderBeep } from "@/lib/reminderSound";

const BUBBLE_SIZE = 44;
const PANEL_MAX_HEIGHT = 420;

const BellIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
);

const AdminIcon = ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
);

const ClockAlertIcon = ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 14" />
    </svg>
);

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

function formatRoleLabel(role: string): string {
    if (!role) return "";
    return role
        .split("_")
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(" ");
}

function timeAgo(iso: string): string {
    const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diffMin < 1) return "Baru saja";
    if (diffMin < 60) return `${diffMin} menit lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam lalu`;
    return `${Math.floor(diffHour / 24)} hari lalu`;
}

function daysOverdue(iso: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

/** Posisi panel menyesuaikan sisi bubble supaya tidak kepotong layar (responsif). */
function computeAnchorStyle(pos: { x: number; y: number }): CSSProperties {
    if (typeof window === "undefined") return { position: "fixed" };
    const openLeft = pos.x + BUBBLE_SIZE / 2 > window.innerWidth / 2;
    const openAbove = pos.y + BUBBLE_SIZE / 2 > window.innerHeight / 2;
    const style: CSSProperties = { position: "fixed" };

    if (openLeft) style.right = Math.max(8, window.innerWidth - (pos.x + BUBBLE_SIZE));
    else style.left = pos.x;

    if (openAbove) style.bottom = Math.max(8, window.innerHeight - pos.y);
    else style.top = pos.y + BUBBLE_SIZE + 8;

    return style;
}

export function SellerReminderNotifier({ userId }: { userId: string | null | undefined }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const bubbleRef = useRef<HTMLButtonElement>(null);

    const storageKey = userId ? `solit_notif_bubble_pos_${userId}` : "solit_notif_bubble_pos_guest";
    const { pos, isDragging, isSnapping, handlePointerDown, handlePointerMove, handlePointerUp, wasDragged } =
        useDraggablePosition(storageKey);

    const {
        reminders,
        unreadCount,
        latest,
        markAllRead,
        dismissLatest,
        forbidden: reminderForbidden,
    } = useSellerReminderNotify(userId);

    const {
        dueItems,
        dueCount,
        newAlert,
        dismissDueAlert,
        forbidden: dueForbidden,
    } = useSellerFollowupDueAlert(userId);

    // Bunyi + toast singkat tiap ada reminder MANUAL baru
    useEffect(() => {
        if (!latest) return;
        playReminderBeep();
        const t = setTimeout(() => dismissLatest(), 6000);
        return () => clearTimeout(t);
    }, [latest, dismissLatest]);

    // Bunyi + toast singkat tiap ada customer yang BARU jadi overdue (OTOMATIS)
    useEffect(() => {
        if (!newAlert) return;
        playReminderBeep();
        const t = setTimeout(() => dismissDueAlert(), 6000);
        return () => clearTimeout(t);
    }, [newAlert, dismissDueAlert]);

    // Klik di luar bubble & panel → tutup panel (bubble tetap ada)
    useEffect(() => {
        if (!open) return;
        const onDocPointerDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (panelRef.current?.contains(target)) return;
            if (bubbleRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onDocPointerDown);
        return () => document.removeEventListener("pointerdown", onDocPointerDown);
    }, [open]);

    if (reminderForbidden || dueForbidden) return null;

    const totalCount = unreadCount + dueCount;
    const badgeColor =
        unreadCount > 0 && dueCount > 0 ? "bg-red-600" : dueCount > 0 ? "bg-rose-600" : "bg-amber-500";

    const goTo = () => router.push("/dashboard/management-seller");

    const handleBubbleClick = () => {
        if (wasDragged()) return; // habis digeser → jangan toggle panel
        setOpen((o) => !o);
    };

    const handleReminderItemClick = () => {
        markAllRead();
        setOpen(false);
        goTo();
    };

    const handleDueItemClick = () => {
        setOpen(false);
        goTo();
    };

    return (
        <>
            {/* ── Toast singkat: reminder MANUAL dari Admin ── */}
            {latest && !open && (
                <button
                    onClick={handleReminderItemClick}
                    style={{ animation: "solitReminderIn 0.25s ease-out both", ...computeAnchorStyle(pos) }}
                    className="fixed z-[85] pointer-events-auto max-w-[280px] bg-white border border-amber-200 shadow-2xl shadow-amber-900/10 rounded-2xl px-4 py-3 flex items-start gap-2.5 text-left hover:bg-amber-50 transition active:scale-[0.98]"
                >
                    <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                        <AdminIcon />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider leading-none mb-1 truncate">
                            {latest.sent_by_name}
                            {latest.sent_by_role ? ` · ${formatRoleLabel(latest.sent_by_role)}` : ""}
                        </span>
                        <span className="block text-xs font-semibold text-gray-700 leading-snug">
                            {latest.message}
                        </span>
                    </span>
                </button>
            )}

            {/* ── Toast singkat: notifikasi OTOMATIS ── */}
            {newAlert && !latest && !open && (
                <button
                    onClick={handleDueItemClick}
                    style={{ animation: "solitReminderIn 0.25s ease-out both", ...computeAnchorStyle(pos) }}
                    className="fixed z-[85] pointer-events-auto max-w-[280px] bg-white border border-rose-200 shadow-2xl shadow-rose-900/10 rounded-2xl px-4 py-3 flex items-start gap-2.5 text-left hover:bg-rose-50 transition active:scale-[0.98]"
                >
                    <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                        <ClockAlertIcon size={16} />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-[10px] font-bold text-rose-500 uppercase tracking-wider leading-none mb-1">
                            Notifikasi Otomatis
                        </span>
                        <span className="block text-xs font-semibold text-gray-700 leading-snug">
                            {newAlert.count === 1
                                ? `${newAlert.sample} belum di-follow-up, yuk follow-up sekarang!`
                                : `${newAlert.count} customer belum di-follow-up, yuk follow-up sekarang!`}
                        </span>
                    </span>
                </button>
            )}

            {/* ── Bubble mengambang — bisa digeser, selalu ada ── */}
            {/* ── Bubble mengambang — bisa digeser bebas, snap balik ke tepi saat dilepas ── */}
            <button
                ref={bubbleRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={handleBubbleClick}
                style={{
                    left: pos.x,
                    top: pos.y,
                    width: BUBBLE_SIZE,
                    height: BUBBLE_SIZE,
                    touchAction: "none",
                    transition: isSnapping
                        ? "left 0.26s cubic-bezier(0.34,1.4,0.64,1), top 0.26s cubic-bezier(0.34,1.4,0.64,1), transform 0.15s ease, box-shadow 0.15s ease"
                        : "transform 0.15s ease, box-shadow 0.15s ease",
                    transform: isDragging ? "scale(1.15)" : "scale(1)",
                }}
                aria-expanded={open}
                aria-label="Notifikasi follow-up"
                title="Notifikasi follow-up — tahan & geser untuk pindah"
                className={`fixed z-[80] rounded-full text-white flex items-center justify-center select-none
          ${isDragging
                        ? "bg-[#2d2d4a] shadow-2xl shadow-black/40 ring-4 ring-white/40"
                        : "bg-[#1a1a2e] shadow-lg shadow-black/25 hover:bg-[#2d2d4a] hover:ring-2 hover:ring-[#1a1a2e]/20 active:scale-95"
                    }`}
            >
                <BellIcon />
                {totalCount > 0 && (
                    <span
                        className={`absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full text-white text-[9px] font-black tabular-nums transition-transform ${badgeColor} ${isDragging ? "scale-110" : ""}`}
                    >
                        {totalCount > 9 ? "9+" : totalCount}
                    </span>
                )}
            </button>

            {/* ── Panel pesan — bisa ditutup/dibuka, bubble tetap ada ── */}
            {open && (
                <div
                    ref={panelRef}
                    style={computeAnchorStyle(pos)}
                    className="fixed z-[81] w-[min(90vw,340px)] bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col"
                >
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between flex-shrink-0">
                        <p className="text-xs font-black text-gray-900">Notifikasi Follow-up</p>
                        <button
                            onClick={() => setOpen(false)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition"
                            aria-label="Tutup"
                        >
                            <CloseIcon />
                        </button>
                    </div>

                    <div className="overflow-y-auto overscroll-contain flex-1" style={{ maxHeight: PANEL_MAX_HEIGHT }}>
                        {reminders.length === 0 && dueItems.length === 0 ? (
                            <div className="px-4 py-8 text-center text-xs text-gray-400">
                                Tidak ada notifikasi saat ini
                            </div>
                        ) : (
                            <>
                                {reminders.length > 0 && (
                                    <div className="pb-1">
                                        <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                                            <span className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">
                                                Dari Admin
                                            </span>
                                            <button
                                                onClick={markAllRead}
                                                className="text-[9px] font-semibold text-gray-400 hover:text-gray-600 underline underline-offset-2"
                                            >
                                                Tandai dibaca
                                            </button>
                                        </div>
                                        {reminders.map((r: SellerReminder) => (
                                            <button
                                                key={r.id}
                                                onClick={handleReminderItemClick}
                                                className="w-full px-4 py-2.5 flex items-start gap-2.5 hover:bg-amber-50 transition text-left"
                                            >
                                                <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <AdminIcon size={13} />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[10px] font-bold text-gray-700 truncate">
                                                        {r.sent_by_name}
                                                        {r.sent_by_role ? ` · ${formatRoleLabel(r.sent_by_role)}` : ""}
                                                    </span>
                                                    <span className="block text-xs text-gray-600 leading-snug mt-0.5">
                                                        {r.message}
                                                    </span>
                                                    <span className="block text-[9px] text-gray-400 mt-1">
                                                        {timeAgo(r.created_at)}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {dueItems.length > 0 && (
                                    <div className="pb-1 border-t border-gray-100">
                                        <div className="px-4 pt-3 pb-1.5">
                                            <span className="text-[9px] font-bold text-rose-600 uppercase tracking-widest">
                                                Perlu Follow-up{dueCount > dueItems.length ? ` (${dueCount})` : ""}
                                            </span>
                                        </div>
                                        {dueItems.map((d: DueFollowupItem) => {
                                            const overdue = daysOverdue(d.next_followup_at);
                                            return (
                                                <button
                                                    key={d.id}
                                                    onClick={handleDueItemClick}
                                                    className="w-full px-4 py-2.5 flex items-start gap-2.5 hover:bg-rose-50 transition text-left"
                                                >
                                                    <span className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                        <ClockAlertIcon size={13} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-xs font-bold text-gray-700 truncate">
                                                            {d.customer_name}
                                                        </span>
                                                        <span className="block text-[10px] text-rose-500 font-semibold mt-0.5">
                                                            {overdue <= 0 ? "Jatuh tempo hari ini" : `Telat ${overdue} hari`}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="px-3 py-2.5 border-t border-gray-100 flex-shrink-0">
                        <button
                            onClick={() => {
                                setOpen(false);
                                goTo();
                            }}
                            className="w-full h-9 rounded-xl bg-[#1a1a2e] text-white text-xs font-bold hover:bg-[#2d2d4a] active:scale-[0.98] transition"
                        >
                            Buka Management Seller
                        </button>
                    </div>
                </div>
            )}

            <style>{`
        @keyframes solitReminderIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </>
    );
}