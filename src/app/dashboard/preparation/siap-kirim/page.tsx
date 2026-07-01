"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import { playNotifSound, unlockAudio } from "@/lib/preparationSound";
import { OrderCard, type PrepOrder } from "@/components/preparation/prepShared";
import { usePrepAlarm, ALARM_KEYS } from "@/lib/prepAlarm";

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

    useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

    const showToast = useCallback((title: string, sub: string) => {
        setToast({ title, sub });
        if (soundOnRef.current) playNotifSound();
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 7000);
    }, []);

    const { unackedCount: alarmCount, unackedIds: alarmIds, acknowledge: ackOrder } = usePrepAlarm(
        orders,
        ALARM_KEYS.SIAP_KIRIM,
        soundOn
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
                if (row.status === "SIAP_KIRIM" && !knownIdsRef.current.has(row.id)) {
                    showToast("📦 Barang siap dikirim!", `${row.customer_name ?? "Customer"} · ${row.order_number ?? ""}`);
                    setNewIds(prev => { const n = new Set(prev); n.add(row.id); return n; });
                    setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(row.id); return n; }), 12000);
                }
                fetchOrders();
            })
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "preparation_orders" }, () => fetchOrders())
            .on("postgres_changes", { event: "DELETE", schema: "public", table: "preparation_orders" }, () => fetchOrders())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [showToast, fetchOrders]);

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
            <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
                {toast && (
                    <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 fade-in duration-300">
                        <div className="bg-white border-2 border-orange-300 rounded-2xl shadow-2xl shadow-orange-900/20 px-4 py-3.5 flex items-center gap-3 max-w-sm">
                            <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 animate-bounce">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-gray-900 truncate">{toast.title}</p>
                                <p className="text-xs text-gray-500 truncate mt-0.5">{toast.sub}</p>
                            </div>
                            <button onClick={() => setToast(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>
                )}

                {alarmCount > 0 && (
                    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] animate-in slide-in-from-top-2 duration-300">
                        <div className="bg-orange-600 text-white px-5 py-2.5 rounded-full shadow-2xl shadow-orange-900/40 flex items-center gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse flex-shrink-0" />
                            <p className="text-sm font-black">📦 {alarmCount} barang siap — pilih metode pengiriman!</p>
                        </div>
                    </div>
                )}

                <div className="max-w-5xl mx-auto space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25 flex-shrink-0">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Siap Dikirim</h1>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />LIVE
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5 font-medium">Barang sudah dicek penyedia — pilih metode pengiriman</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link href="/dashboard/preparation" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                                Semua Penyiapan →
                            </Link>
                            <button onClick={() => setSoundOn(v => !v)}
                                title={soundOn ? "Suara notif aktif" : "Suara notif mati"}
                                className={`w-9 h-9 flex items-center justify-center rounded-xl border transition ${soundOn ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-gray-100 border-gray-200 text-gray-400"}`}>
                                {soundOn ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l4-4m0 4l-4-4" /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200 text-orange-700 rounded-2xl p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-lg">📦</span>
                                <span className="text-2xl font-black tabular-nums">{orders.length}</span>
                            </div>
                            <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">Menunggu Dispatch</p>
                        </div>
                        <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200 text-violet-700 rounded-2xl p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-lg">💻</span>
                                <span className="text-2xl font-black tabular-nums">{totalUnits}</span>
                            </div>
                            <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">Total Unit</p>
                        </div>
                    </div>

                    {orders.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                            <span className="text-2xl">⚡</span>
                            <div>
                                <p className="text-sm font-bold text-orange-800">{orders.length} penyiapan butuh konfirmasi pengiriman</p>
                                <p className="text-xs text-orange-600">Klik untuk pilih: Diambil langsung, Diantar, atau Kurir</p>
                            </div>
                        </div>
                    )}

                    {/* Search */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sticky top-2 z-20">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor, customer, WA, SN..."
                                className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="h-44 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
                            <div className="text-4xl mb-3 opacity-40">🎉</div>
                            <p className="text-gray-500 text-sm font-medium">
                                {search ? "Tidak ada yang cocok" : "Semua penyiapan sudah dikonfirmasi pengirimannya!"}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                            {filtered.map(o => (
                                <Link
                                    key={o.id}
                                    href={`/dashboard/preparation/${o.id}`}
                                    onClick={() => ackOrder(o.id)}
                                    className={`block bg-white rounded-2xl border shadow-sm p-4 transition hover:shadow-md hover:border-gray-200 ${newIds.has(o.id) || alarmIds.has(o.id)
                                        ? "border-orange-400 ring-2 ring-orange-200"
                                        : "border-gray-100"
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <span className="font-mono text-xs font-bold text-gray-700">{o.order_number}</span>
                                                <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border bg-orange-50 text-orange-700 border-orange-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />Siap Kirim
                                                </span>
                                                {newIds.has(o.id) && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-500 text-white animate-pulse">BARU</span>}
                                            </div>
                                            <p className="text-base font-black text-gray-900 leading-tight truncate">{o.customer_name}</p>
                                            {o.customer_phone && <p className="text-xs text-gray-500 mt-0.5">📱 {o.customer_phone}</p>}
                                        </div>
                                        <span className="text-xs text-gray-400 flex-shrink-0">
                                            {new Date(o.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>

                                    {o.delivery_address && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 mb-2">
                                            <p className="text-xs text-gray-600 truncate">📍 {o.delivery_address}</p>
                                        </div>
                                    )}

                                    <div className="mb-3">
                                        <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1.5">
                                            {o.preparation_items.length} Unit · Semua sudah dicek ✅
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {o.preparation_items.slice(0, 3).map(it => (
                                                <span key={it.id} className="font-mono text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-lg">
                                                    {it.serial_number}
                                                </span>
                                            ))}
                                            {o.preparation_items.length > 3 && (
                                                <span className="text-[11px] text-gray-400 font-semibold">+{o.preparation_items.length - 3} lagi</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="h-10 bg-orange-500 rounded-xl flex items-center justify-center text-sm font-bold text-white transition hover:bg-orange-600">
                                        📮 Pilih Metode Pengiriman →
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