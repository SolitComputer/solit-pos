"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import { playNotifSound, unlockAudio } from "@/lib/preparationSound";
import { OrderCard, type PrepOrder } from "@/components/preparation/prepShared";
import { usePrepAlarm, ALARM_KEYS, isPrepSilent } from "@/lib/prepAlarm";

export default function PreparationSiapKirimPage() {
    const [orders, setOrders] = useState<PrepOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
    const [soundOn, setSoundOn] = useState(true);
    const soundOnRef = useRef(true);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [newIds, setNewIds] = useState<Set<string>>(new Set());
    const knownIdsRef = useRef<Set<string>>(new Set());
    const [userId, setUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/auth/me").then(r => r.json())
            .then(r => { setUserId(r.user?.id ?? null); setUserRole(r.user?.role ?? null); })
            .catch(() => { setUserId(null); setUserRole(null); });
    }, []);

    const silent = isPrepSilent(userRole);

    const myOrders = useMemo(
        () => (userId ? orders.filter(o => o.created_by === userId) : []),
        [orders, userId]
    );

    useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

    const showToast = useCallback((title: string, sub: string) => {
        setToast({ title, sub });
        if (soundOnRef.current) playNotifSound();
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 7000);
    }, []);

    const { unackedCount: alarmCount, unackedIds: alarmIds, acknowledge: ackOrder } = usePrepAlarm(
        myOrders,
        ALARM_KEYS.SIAP_KIRIM,
        soundOn && !silent
    );

    const didInitAckRef = useRef(false);
    useEffect(() => {
        if (didInitAckRef.current || isLoading) return;
        orders.forEach((o) => ackOrder(o.id));
        didInitAckRef.current = true;
    }, [isLoading, orders, ackOrder]);

    useEffect(() => {
        const unlock = () => { unlockAudio(); window.removeEventListener("pointerdown", unlock); };
        window.addEventListener("pointerdown", unlock);
        return () => window.removeEventListener("pointerdown", unlock);
    }, []);

    const fetchOrders = useCallback(async () => {
        try {
            const res = await fetch("/api/preparation?status=SIAP_KIRIM");
            const result = await res.json();
            const data: PrepOrder[] = result.data || [];
            setOrders(data);
            data.forEach(o => knownIdsRef.current.add(o.id));
        } catch { setOrders([]); } finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    // Realtime: dengarkan UPDATE ke SIAP_KIRIM
    useEffect(() => {
        const channel = supabase
            .channel("prep-siap-kirim-realtime")
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_orders" }, payload => {
                const row: any = payload.new;
                if (
                    row.status === "SIAP_KIRIM" &&
                    userId && row.created_by === userId &&
                    !silent &&
                    !knownIdsRef.current.has(row.id)
                ) {
                showToast("Barang siap dikirim!", `${row.customer_name ?? "Customer"} · ${row.order_number ?? ""}`);
                    setNewIds(prev => { const n = new Set(prev); n.add(row.id); return n; });
                    setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(row.id); return n; }), 12000);
                }
                fetchOrders();
            })
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "preparation_orders" }, () => fetchOrders())
            .on("postgres_changes", { event: "DELETE", schema: "public", table: "preparation_orders" }, () => fetchOrders())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [showToast, fetchOrders, userId, silent]);

    useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return orders;
        const t = search.toLowerCase();
        return orders.filter(o =>
            o.order_number.toLowerCase().includes(t) ||
            o.customer_name.toLowerCase().includes(t) ||
            (o.customer_phone || "").toLowerCase().includes(t) ||
            o.preparation_items.some(it => it.serial_number.toLowerCase().includes(t))
        );
    }, [orders, search]);

    const totalUnits = useMemo(() => orders.reduce((s, o) => s + o.preparation_items.length, 0), [orders]);

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-b from-[#F7F7F8] to-white p-4 sm:p-6 lg:p-8">
                {toast && (
                    <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 fade-in duration-300">
                        <div className="bg-white border-2 border-orange-300 rounded-2xl shadow-2xl shadow-orange-900/20 px-5 py-4 flex items-center gap-4 max-w-sm backdrop-blur-sm bg-white/95">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0 animate-bounce shadow-lg shadow-orange-500/30">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-gray-900 truncate">{toast.title}</p>
                                <p className="text-xs text-gray-500 truncate mt-0.5">{toast.sub}</p>
                            </div>
                            <button onClick={() => setToast(null)} className="text-gray-300 hover:text-gray-500 hover:bg-gray-100 p-1.5 rounded-lg transition flex-shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                {alarmCount > 0 && (
                    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] animate-in slide-in-from-top-2 duration-300">
                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-3 rounded-full shadow-2xl shadow-orange-900/40 flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse flex-shrink-0" />
                            <p className="text-sm font-black">{alarmCount} barang siap — pilih metode pengiriman!</p>
                            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse flex-shrink-0" />
                        </div>
                    </div>
                )}

                <div className="max-w-6xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
                                        Siap Dikirim
                                    </h1>
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                        LIVE
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1 font-medium">
                                    Barang sudah dicek penyedia — pilih metode pengiriman
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link 
                                href="/dashboard/preparation" 
                                className="hidden sm:inline-flex items-center gap-2 h-9 px-4 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm"
                            >
                                Semua Penyiapan
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                            <button 
                                onClick={() => setSoundOn(v => !v)}
                                title={soundOn ? "Suara notif aktif" : "Suara notif mati"}
                                className={`w-10 h-10 flex items-center justify-center rounded-xl border transition ${
                                    soundOn 
                                        ? "bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100" 
                                        : "bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-200"
                                }`}
                            >
                                {soundOn ? (
                                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    </svg>
                                ) : (
                                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l4-4m0 4l-4-4" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Summary cards with improved design */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200 rounded-2xl p-4 transition hover:shadow-md hover:scale-[1.02] active:scale-95">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>
                                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">Menunggu Dispatch</span>
                                </div>
                                <span className="text-3xl font-black tabular-nums text-orange-700">
                                    {isLoading ? "…" : orders.length}
                                </span>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200 rounded-2xl p-4 transition hover:shadow-md hover:scale-[1.02] active:scale-95">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                                    <span className="text-xs font-bold text-violet-600 uppercase tracking-wide">Total Unit</span>
                                </div>
                                <span className="text-3xl font-black tabular-nums text-violet-700">
                                    {isLoading ? "…" : totalUnits}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Alert banner with better design */}
                    {orders.length > 0 && (
                        <div className="bg-gradient-to-r from-orange-50 to-orange-100/70 border border-orange-200 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm">
                            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/25">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-orange-800">
                                    {orders.length} penyiapan butuh konfirmasi pengiriman
                                </p>
                                <p className="text-xs text-orange-600 mt-0.5">
                                    Klik untuk pilih: Diambil langsung, Diantar, atau Kurir
                                </p>
                            </div>
                            <svg className="w-5 h-5 text-orange-500 animate-pulse flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                    )}

                    {/* Search with improved design */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sticky top-2 z-20 backdrop-blur-sm bg-white/95">
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                <svg className="w-4.5 h-4.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input 
                                value={search} 
                                onChange={e => setSearch(e.target.value)} 
                                placeholder="Cari nomor, customer, WA, SN..."
                                className="w-full h-11 border border-gray-200 rounded-xl pl-10 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition" 
                            />
                            {search && (
                                <button 
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Order cards with premium design */}
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-2 flex-1">
                                            <div className="h-4 bg-gray-200 rounded w-32" />
                                            <div className="h-6 bg-gray-200 rounded w-48" />
                                            <div className="h-3 bg-gray-200 rounded w-36" />
                                        </div>
                                        <div className="h-4 bg-gray-200 rounded w-20" />
                                    </div>
                                    <div className="mt-4 h-10 bg-gray-200 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-gray-100 py-20 text-center shadow-sm">
                            <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-gray-500 text-base font-medium">
                                {search ? "Tidak ada yang cocok dengan pencarian" : "Semua penyiapan sudah dikonfirmasi pengirimannya!"}
                            </p>
                            {search && (
                                <button 
                                    onClick={() => setSearch("")}
                                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700 transition"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Hapus filter
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {filtered.map(o => (
                                <Link
                                    key={o.id}
                                    href={`/dashboard/preparation/${o.id}`}
                                    onClick={() => ackOrder(o.id)}
                                    className={`group block bg-white rounded-2xl border shadow-sm p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
                                        newIds.has(o.id) || alarmIds.has(o.id)
                                            ? "border-orange-400 ring-2 ring-orange-200 ring-offset-2"
                                            : "border-gray-100 hover:border-orange-200"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg">
                                                    {o.order_number}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                                    Siap Kirim
                                                </span>
                                                {newIds.has(o.id) && (
                                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-orange-500 text-white animate-pulse">
                                                        BARU
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-lg font-black text-gray-900 leading-tight truncate">
                                                {o.customer_name}
                                            </p>
                                            {o.customer_phone && (
                                                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> {o.customer_phone}
                                                </p>
                                            )}
                                        </div>
                                        <span className="text-xs text-gray-400 flex-shrink-0 bg-gray-50 px-2 py-1 rounded-lg">
                                            {new Date(o.created_at).toLocaleString("id-ID", { 
                                                day: "2-digit", 
                                                month: "short", 
                                                hour: "2-digit", 
                                                minute: "2-digit" 
                                            })}
                                        </span>
                                    </div>

                                    {o.delivery_address && (
                                        <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 border border-gray-100 rounded-xl px-3 py-2 mb-3">
                                            <p className="text-xs text-gray-600 truncate flex items-center gap-1.5">
                                                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg> {o.delivery_address}
                                            </p>
                                        </div>
                                    )}

                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                                                {o.preparation_items.length} Unit · Semua sudah dicek
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {o.preparation_items.slice(0, 3).map(it => (
                                                <span key={it.id} className="font-mono text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-lg">
                                                    {it.serial_number}
                                                </span>
                                            ))}
                                            {o.preparation_items.length > 3 && (
                                                <span className="text-[11px] text-gray-400 font-semibold px-1">
                                                    +{o.preparation_items.length - 3} lagi
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="h-11 bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/30 group-hover:scale-[1.02] active:scale-95">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        Pilih Metode Pengiriman
                                        <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </DashboardLayout>
    );
}