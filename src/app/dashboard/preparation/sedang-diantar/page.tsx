"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import { deriveLiveStatus, type LiveOrder } from "@/lib/trackingStatus";
import TrackingStatusBadge from "@/components/preparation/TrackingStatusBadge";
import { useHTCall } from "@/contexts/HTCallContext";
import { hasAnyRole, PERMISSIONS } from "@/lib/permissions";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface PrepItem { id: string; serial_number: string; laptop_name: string | null }
interface ActiveOrder extends LiveOrder {
    id: string; order_number: string; customer_name: string; customer_phone: string | null;
    delivery_user_id: string | null; delivery_user_name: string | null; delivery_address: string | null;
    updated_at: string; preparation_items: PrepItem[];
}

export default function PreparationSedangDiantarPage() {
    const [orders, setOrders] = useState<ActiveOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [now, setNow] = useState(() => Date.now());
    const { online, state: callState, callUser } = useHTCall();

    const onlineById = useMemo(() => {
        const m = new Map<string, { userId: string; name: string; role: string }>();
        online.forEach(u => m.set(u.userId, u));
        return m;
    }, [online]);

    const confirm = useConfirm();
    const [canForce, setCanForce] = useState(false);
    const [forcingId, setForcingId] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/auth/me").then(r => r.json())
            .then(r => {
                const roles: string[] = r.user?.roles ?? (r.user?.role ? [r.user.role] : []);
                setCanForce(hasAnyRole(roles, PERMISSIONS.FORCE_COMPLETE_PREPARATION));
            })
            .catch(() => setCanForce(false));
    }, []);

    const callBusy = callState !== "idle";

    useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(iv); }, []);

    const fetchOrders = useCallback(async () => {
        try {
            const res = await fetch("/api/preparation", { cache: "no-store" });
            const result = await res.json();
            const data: ActiveOrder[] = result.data || [];
            const active = data.filter(o =>
                o.status === "DIKIRIM" && o.delivery_method === "PENGANTARAN"
            );
            setOrders(active);
        } catch { setOrders([]); } finally { setIsLoading(false); }
    }, []);
    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const forceDone = useCallback(async (orderId: string, orderNumber: string) => {
        const ok = await confirm({
            title: "Selesaikan pengantaran ini?",
            message: `Order ${orderNumber} akan ditandai SELESAI walau pengantar belum menekan tombol. Pastikan barang sudah sampai ke customer.`,
            variant: "warning", confirmText: "Ya, Selesaikan",
        });
        if (!ok) return;
        setForcingId(orderId);
        try {
            const res = await fetch(`/api/preparation/${orderId}/force-complete`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: null }),
            });
            const result = await res.json();
            if (result.success) await fetchOrders();
            else alert(result.message || "Gagal menyelesaikan");
        } catch { alert("Gagal menyelesaikan"); } finally { setForcingId(null); }
    }, [confirm, fetchOrders]);

    useEffect(() => {
        const ch = supabase
            .channel("prep-sedang-diantar")
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_orders" }, () => fetchOrders())
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "preparation_orders" }, () => fetchOrders())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [fetchOrders]);

    const filtered = useMemo(() => {
        if (!search.trim()) return orders;
        const t = search.toLowerCase();
        return orders.filter(o =>
            o.order_number.toLowerCase().includes(t) ||
            o.customer_name.toLowerCase().includes(t) ||
            (o.delivery_user_name || "").toLowerCase().includes(t) ||
            (o.delivery_address || "").toLowerCase().includes(t)
        );
    }, [orders, search]);

    const problemCount = useMemo(
        () => orders.filter(o => deriveLiveStatus(o, now).tone === "bad").length,
        [orders, now]
    );

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-b from-[#F7F7F8] to-white p-3 sm:p-6 lg:p-8">
                <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

                    {/* Header */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30 flex-shrink-0">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5">
                                    <circle cx="6" cy="19" r="2" />
                                    <circle cx="18" cy="5" r="2" />
                                    <path d="M8 19h7a3 3 0 003-3v-6M16 5H9a3 3 0 00-3 3v6" />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight leading-none truncate">
                                        Sedang Diantar
                                    </h1>
                                    <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-violet-600 bg-violet-50 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-violet-200 flex-shrink-0">
                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                                        LIVE
                                    </span>
                                </div>
                                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1 font-medium truncate">
                                    Pantau pengantaran berjalan + status GPS realtime
                                </p>
                            </div>
                        </div>

                        {/* Action buttons — full width row on mobile, inline on desktop */}
                        <div className="flex items-center gap-2">
                            <Link
                                href="/dashboard/preparation/siap-kirim"
                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm"
                            >
                                Siap Dikirim
                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                            <Link
                                href="/dashboard/preparation/history"
                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm"
                            >
                                Riwayat
                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                        <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200 rounded-2xl p-3 sm:p-4 transition hover:shadow-md hover:scale-[1.02] active:scale-95">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                    <span className="text-lg sm:text-xl flex-shrink-0">🛵</span>
                                    <span className="text-[10px] sm:text-xs font-bold text-violet-600 uppercase tracking-wide truncate">Sedang Berjalan</span>
                                </div>
                                <span className="text-2xl sm:text-3xl font-black tabular-nums text-violet-700 flex-shrink-0">
                                    {isLoading ? "…" : orders.length}
                                </span>
                            </div>
                        </div>
                        <div className={`rounded-2xl p-3 sm:p-4 border transition hover:shadow-md hover:scale-[1.02] active:scale-95 ${problemCount > 0
                            ? "bg-gradient-to-br from-red-50 to-red-100/50 border-red-200"
                            : "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200"
                            }`}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                    <span className="text-lg sm:text-xl flex-shrink-0">{problemCount > 0 ? "⚠️" : "✅"}</span>
                                    <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wide truncate ${problemCount > 0 ? "text-red-600" : "text-emerald-600"
                                        }`}>
                                        Bermasalah
                                    </span>
                                </div>
                                <span className={`text-2xl sm:text-3xl font-black tabular-nums flex-shrink-0 ${problemCount > 0 ? "text-red-700" : "text-emerald-700"
                                    }`}>
                                    {isLoading ? "…" : problemCount}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Alert Banner */}
                    {problemCount > 0 && (
                        <div className="bg-gradient-to-r from-red-50 to-red-100/70 border border-red-200 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 flex items-center gap-3 sm:gap-4 shadow-sm animate-pulse">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/25">
                                <span className="text-lg sm:text-xl">📡</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs sm:text-sm font-bold text-red-800">
                                    {problemCount} pengantaran kehilangan sinyal / izin GPS mati
                                </p>
                                <p className="text-[10px] sm:text-xs text-red-600 mt-0.5">
                                    Kemungkinan app pengantar ditutup atau GPS dimatikan.
                                </p>
                            </div>
                            <span className="text-xl sm:text-2xl animate-pulse flex-shrink-0">⚠️</span>
                        </div>
                    )}

                    {/* Search */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 sticky top-2 z-20 backdrop-blur-sm bg-white/95">
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Cari customer, pengantar, alamat, no order..."
                                className="w-full h-10 sm:h-11 border border-gray-200 rounded-xl pl-9 sm:pl-10 pr-9 sm:pr-4 text-xs sm:text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition"
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

                    {/* Order Cards */}
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 animate-pulse">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-2 flex-1">
                                            <div className="h-4 bg-gray-200 rounded w-28 sm:w-32" />
                                            <div className="h-5 sm:h-6 bg-gray-200 rounded w-40 sm:w-48" />
                                            <div className="h-3 bg-gray-200 rounded w-32 sm:w-36" />
                                        </div>
                                        <div className="h-9 sm:h-10 w-20 sm:w-24 bg-gray-200 rounded-xl flex-shrink-0" />
                                    </div>
                                    <div className="mt-4 h-8 bg-gray-200 rounded-xl" />
                                    <div className="mt-3 h-10 bg-gray-200 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-gray-100 py-16 sm:py-20 text-center shadow-sm px-4">
                            <div className="text-5xl sm:text-6xl mb-4 opacity-30">🛵</div>
                            <p className="text-gray-500 text-sm sm:text-base font-medium">
                                {search ? "Tidak ada yang cocok dengan pencarian" : "Tidak ada pengantaran yang sedang berjalan"}
                            </p>
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-600 hover:text-violet-700 transition"
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
                            {filtered.map(o => {
                                const live = deriveLiveStatus(o, now);
                                const isReturn = o.status === "SELESAI";
                                const driver = o.delivery_user_id ? onlineById.get(o.delivery_user_id) : null;
                                return (
                                    <Link
                                        key={o.id}
                                        href={`/dashboard/preparation/${o.id}`}
                                        className={`group block bg-white rounded-2xl border shadow-sm p-4 sm:p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${live.tone === "bad"
                                            ? "border-red-300 ring-2 ring-red-200 ring-offset-2"
                                            : "border-gray-100 hover:border-violet-200"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
                                                    <span className="font-mono text-[11px] sm:text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg">
                                                        {o.order_number}
                                                    </span>
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full text-white animate-pulse ${isReturn ? "bg-orange-500" : "bg-violet-500"
                                                        }`}>
                                                        {isReturn ? "PULANG" : "DIANTAR"}
                                                    </span>
                                                    {live.tone === "bad" && (
                                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                                                            ⚠️ MASALAH
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-base sm:text-lg font-black text-gray-900 leading-tight truncate">
                                                    {o.customer_name}
                                                </p>
                                                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                                                    <span>🛵</span> {o.delivery_user_name || "—"}
                                                    {o.delivery_address && (
                                                        <span className="text-gray-400 truncate">· 📍 {o.delivery_address}</span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="flex-shrink-0">
                                                <TrackingStatusBadge order={o} />
                                            </div>
                                        </div>

                                        <div className={`rounded-xl px-3 py-2 text-[11px] sm:text-xs font-semibold border ${live.tone === "bad"
                                            ? "bg-red-50 border-red-200 text-red-600"
                                            : "bg-gray-50 border-gray-100 text-gray-600"
                                            }`}>
                                            {live.label}
                                        </div>

                                        {o.delivery_user_id && (
                                            driver ? (
                                                <button
                                                    type="button"
                                                    disabled={callBusy}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        callUser(driver, o.order_number);
                                                    }}
                                                    className="mt-3 w-full h-11 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 px-2 transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/30 group-hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    <span className="text-base sm:text-lg flex-shrink-0">📞</span>
                                                    <span className="truncate">Panggil HT — {o.delivery_user_name || "Pengantar"}</span>
                                                    <svg className="w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <div className="mt-3 w-full h-11 bg-gray-100 border border-gray-200 rounded-xl text-gray-400 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-2 px-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse flex-shrink-0" />
                                                    <span className="truncate">{o.delivery_user_name || "Pengantar"} sedang offline</span>
                                                </div>
                                            )
                                        )}
                                        {canForce && o.status === "DIKIRIM" && (
                                            <button
                                                type="button"
                                                disabled={forcingId === o.id}
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); forceDone(o.id, o.order_number); }}
                                                className="mt-2 w-full h-10 rounded-xl bg-[#1a1a2e] hover:bg-[#16213e] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40"
                                            >
                                                {forcingId === o.id ? "Menyelesaikan..." : "✅ Tandai Selesai (Override)"}
                                            </button>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </DashboardLayout>
    );
}