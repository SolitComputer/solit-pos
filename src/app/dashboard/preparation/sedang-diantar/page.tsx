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
                (o.status === "DIKIRIM" && o.delivery_method === "PENGANTARAN") ||
                (o.status === "SELESAI" && o.return_started_at && !o.returned_at)
            );
            setOrders(active);
        } catch { setOrders([]); } finally { setIsLoading(false); }
    }, []);
    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    // ✅ forceDone dipindah ke SINI — setelah fetchOrders dideklarasikan
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
            <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
                <div className="max-w-5xl mx-auto space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 bg-violet-500 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/25 flex-shrink-0">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 003-3v-6M16 5H9a3 3 0 00-3 3v6" /></svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Sedang Diantar</h1>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />LIVE
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5 font-medium">Pantau pengantaran berjalan + status GPS realtime</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link href="/dashboard/preparation/siap-kirim" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">Siap Dikirim →</Link>
                            <Link href="/dashboard/preparation/history" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">Riwayat →</Link>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200 text-violet-700 rounded-2xl p-3">
                            <div className="flex items-center justify-between"><span className="text-lg">🛵</span><span className="text-2xl font-black tabular-nums">{orders.length}</span></div>
                            <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">Sedang Berjalan</p>
                        </div>
                        <div className={`rounded-2xl p-3 border ${problemCount > 0 ? "bg-gradient-to-br from-red-50 to-red-100/50 border-red-200 text-red-700" : "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-700"}`}>
                            <div className="flex items-center justify-between"><span className="text-lg">{problemCount > 0 ? "⚠️" : "✅"}</span><span className="text-2xl font-black tabular-nums">{problemCount}</span></div>
                            <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">Bermasalah</p>
                        </div>
                    </div>

                    {problemCount > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                            <span className="text-2xl">📡</span>
                            <div>
                                <p className="text-sm font-bold text-red-800">{problemCount} pengantaran kehilangan sinyal / izin GPS mati</p>
                                <p className="text-xs text-red-600">Kemungkinan app pengantar ditutup atau GPS dimatikan.</p>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sticky top-2 z-20">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari customer, pengantar, alamat, no order..."
                                className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
                            <div className="text-4xl mb-3 opacity-40">🛵</div>
                            <p className="text-gray-500 text-sm font-medium">{search ? "Tidak ada yang cocok" : "Tidak ada pengantaran yang sedang berjalan"}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                            {filtered.map(o => {
                                const live = deriveLiveStatus(o, now);
                                const isReturn = o.status === "SELESAI";
                                return (
                                    <Link key={o.id} href={`/dashboard/preparation/${o.id}`}
                                        className={`block bg-white rounded-2xl border shadow-sm p-4 transition hover:shadow-md hover:border-gray-200 ${live.tone === "bad" ? "border-red-300 ring-2 ring-red-100" : "border-gray-100"}`}>
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                    <span className="font-mono text-xs font-bold text-gray-700">{o.order_number}</span>
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded text-white animate-pulse ${isReturn ? "bg-orange-500" : "bg-violet-500"}`}>{isReturn ? "PULANG" : "DIANTAR"}</span>
                                                </div>
                                                <p className="text-base font-black text-gray-900 leading-tight truncate">{o.customer_name}</p>
                                                <p className="text-[11px] text-gray-400 mt-0.5 truncate">🛵 {o.delivery_user_name || "—"}{o.delivery_address ? ` · 📍 ${o.delivery_address}` : ""}</p>
                                            </div>
                                            <TrackingStatusBadge order={o} />
                                        </div>
                                        <div className="mt-2 rounded-xl px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-100 text-gray-600">
                                            {live.label}
                                        </div>

                                        {(() => {
                                            const driver = o.delivery_user_id ? onlineById.get(o.delivery_user_id) : null;
                                            if (!o.delivery_user_id) return null;
                                            return driver ? (
                                                <button
                                                    type="button"
                                                    disabled={callBusy}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        callUser(driver, o.order_number);
                                                    }}
                                                    className="mt-2 w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40"
                                                >
                                                    📞 Panggil HT — {o.delivery_user_name || "Pengantar"}
                                                </button>
                                            ) : (
                                                <div className="mt-2 w-full h-10 rounded-xl bg-gray-100 text-gray-400 text-xs font-semibold flex items-center justify-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                                    {o.delivery_user_name || "Pengantar"} sedang offline
                                                </div>
                                            );
                                        })()}
                                        {canForce && (
                                            <button
                                                type="button"
                                                disabled={forcingId === o.id}
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); forceDone(o.id, o.order_number); }}
                                                className="mt-2 w-full h-10 rounded-xl bg-[#1a1a2e] hover:bg-[#16213e] text-white text-sm font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40"
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