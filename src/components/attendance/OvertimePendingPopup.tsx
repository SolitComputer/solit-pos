// src/components/attendance/OvertimePendingPopup.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingOvertimeItem } from "@/hooks/useOvertimeNotify";

function formatMinutesShort(min: number): string {
    if (!min || min <= 0) return "—";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}j`;
    return `${h}j ${m}m`;
}

// ✅ NEW — popup modal otomatis (bukan cuma badge+suara) begitu ada lemburan
// PENDING baru yang siap di-ACC. Muncul cuma untuk item yang belum pernah
// ditampilkan sesi ini; kalau ditutup ("Nanti Saja"), tidak muncul lagi
// sampai ada item PENDING baru lainnya.
export function OvertimePendingPopup({ pending }: { pending: PendingOvertimeItem[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const shownIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const hasNew = pending.some((p) => !shownIdsRef.current.has(p.id));
        if (hasNew && pending.length > 0) setOpen(true);
        pending.forEach((p) => shownIdsRef.current.add(p.id));
    }, [pending]);

    if (!open || pending.length === 0) return null;

    const goTo = (userId: string) => {
        setOpen(false);
        router.push(`/dashboard/attendance/overtime?user=${userId}`);
    };

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}
            onClick={() => setOpen(false)}
        >
            <div
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-gray-100/80"
                style={{ animation: "modalUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-lg flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-bold text-white leading-tight">{pending.length} Lemburan Menunggu ACC</h2>
                        <p className="text-[11px] text-white/70 mt-0.5">Perlu persetujuanmu</p>
                    </div>
                    <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-50">
                    {pending.map((p) => (
                        <button key={p.id} onClick={() => goTo(p.user_id)} className="w-full px-5 py-3.5 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{p.user_name}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                    {new Date(p.request_date + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                    {" · "}{formatMinutesShort(p.overtime_minutes)}
                                </p>
                            </div>
                            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    ))}
                </div>
                <div className="px-5 py-3.5 border-t border-gray-100">
                    <button onClick={() => setOpen(false)} className="w-full h-9 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-all">Nanti Saja</button>
                </div>
            </div>
        </div>
    );
}