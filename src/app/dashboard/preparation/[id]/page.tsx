"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DeliveryMap from "@/components/preparation/DeliveryMap";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import { supabase } from "@/services/supabase";

interface PrepItem { id: string; serial_number: string; laptop_name: string | null; is_checked: boolean; check_note: string | null }
interface PrepOrder {
    id: string; order_number: string; customer_name: string; customer_phone: string | null;
    status: string; delivery_method: string | null; notes: string | null;
    created_by_name: string | null; received_by_name: string | null; done_by_name: string | null;
    received_at: string | null; done_at: string | null;
    delivery_user_name: string | null; delivery_started_at: string | null; delivered_at: string | null;
    delivery_address: string | null; dest_lat: number | null; dest_lng: number | null;
    courier_service: string | null; courier_tracking_number: string | null; courier_note: string | null;
    transaction_invoice: string | null;
    created_at: string; preparation_items: PrepItem[];
}

const fmtFull = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
    MENUNGGU: { label: "Menunggu", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
    DIPROSES: { label: "Diproses", badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
    DIKIRIM: { label: "Dikirim", badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
    SELESAI: { label: "Selesai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    DIBATALKAN: { label: "Batal", badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400" },
};

// ── Popup pilih metode pengiriman (saat klik Selesai) ──
function DoneModal({ order, onClose, onDone }: { order: PrepOrder; onClose: () => void; onDone: () => void }) {
    const [method, setMethod] = useState<"DIAMBIL_CUSTOMER" | "PENGANTARAN" | "KURIR" | null>(null);
    const [address, setAddress] = useState(order.delivery_address || "");
    const [destLat, setDestLat] = useState<number | null>(order.dest_lat);
    const [destLng, setDestLng] = useState<number | null>(order.dest_lng);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [courierService, setCourierService] = useState("");
    const [trackingNumber, setTrackingNumber] = useState("");
    const [courierNote, setCourierNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const getGPS = () => {
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => { setDestLat(pos.coords.latitude); setDestLng(pos.coords.longitude); setGpsLoading(false); },
            () => { alert("Gagal ambil GPS"); setGpsLoading(false); },
            { enableHighAccuracy: true }
        );
    };

    const submit = async () => {
        setError("");
        if (!method) { setError("Pilih metode pengiriman dulu"); return; }
        if (method === "PENGANTARAN" && !address.trim()) { setError("Alamat tujuan wajib diisi"); return; }
        if (method === "KURIR" && !courierService.trim()) { setError("Nama jasa kurir wajib diisi"); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/preparation/${order.id}/done`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    delivery_method: method,
                    delivery_address: address.trim() || null,
                    dest_lat: destLat, dest_lng: destLng,
                    courier_service: courierService.trim() || null,
                    courier_tracking_number: trackingNumber.trim() || null,
                    courier_note: courierNote.trim() || null,
                }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal"); return; }
            onDone(); onClose();
        } catch { setError("Terjadi kesalahan koneksi"); } finally { setSaving(false); }
    };

    const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition";
    const OPTIONS = [
        { value: "DIAMBIL_CUSTOMER", icon: "🧍", title: "Langsung Diambil Customer", desc: "Customer ambil ke toko, langsung selesai" },
        { value: "PENGANTARAN", icon: "🛵", title: "Diantar Role Pengantaran", desc: "Diantar internal + live tracking maps" },
        { value: "KURIR", icon: "📦", title: "Diantar Kurir", desc: "Jasa kurir pihak ketiga (JNE, J&T, dll)" },
    ] as const;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
                <div className="bg-emerald-600 px-5 py-4 flex-shrink-0">
                    <p className="font-bold text-white text-sm">✅ Barang Selesai Disiapkan</p>
                    <p className="text-xs text-emerald-100 mt-0.5">Pilih cara barang sampai ke customer</p>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2.5">
                    {OPTIONS.map(opt => (
                        <button key={opt.value} type="button" onClick={() => setMethod(opt.value)}
                            className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition ${method === opt.value ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                            <span className="text-2xl">{opt.icon}</span>
                            <div>
                                <p className={`text-sm font-bold ${method === opt.value ? "text-emerald-700" : "text-gray-700"}`}>{opt.title}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                            </div>
                        </button>
                    ))}

                    {method === "PENGANTARAN" && (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2.5">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Alamat Tujuan *</label>
                                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Alamat lengkap customer" className={inputCls} />
                            </div>
                            <button type="button" onClick={getGPS}
                                className={`w-full h-9 rounded-lg text-xs font-semibold transition ${destLat ? "bg-emerald-100 text-emerald-700" : "bg-[#1a1a2e] text-white hover:bg-[#16213e]"}`}>
                                {gpsLoading ? "Mengambil..." : destLat ? "✓ Titik tujuan tersimpan" : "📍 Ambil titik GPS tujuan (opsional)"}
                            </button>
                        </div>
                    )}

                    {method === "KURIR" && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2.5">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Jasa Kurir *</label>
                                <input value={courierService} onChange={e => setCourierService(e.target.value)} placeholder="JNE, J&T, SiCepat, Grab..." className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">No. Resi (opsional)</label>
                                <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="Nomor resi" className={`${inputCls} font-mono`} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Catatan (opsional)</label>
                                <input value={courierNote} onChange={e => setCourierNote(e.target.value)} placeholder="Catatan kurir" className={inputCls} />
                            </div>
                        </div>
                    )}

                    {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
                        {saving ? "Menyimpan..." : "Konfirmasi Selesai"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function PreparationDetailPage() {
    const params = useParams();
    const id = params.id as string;

    const [order, setOrder] = useState<PrepOrder | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [showDone, setShowDone] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Tracking
    const [points, setPoints] = useState<{ lat: number; lng: number }[]>([]);
    const [tracking, setTracking] = useState(false);
    const watchIdRef = useRef<number | null>(null);
    const lastPostRef = useRef<number>(0);

    const canDone = userRole ? hasPermission(userRole, PERMISSIONS.DONE_PREPARATION) : false;
    const canDeliver = userRole ? hasPermission(userRole, PERMISSIONS.DELIVERY_PREPARATION) : false;

    useEffect(() => {
        fetch("/api/auth/me").then(r => r.json()).then(r => setUserRole(r.user?.role ?? null)).catch(() => setUserRole(null));
    }, []);

    const fetchOrder = useCallback(async () => {
        try {
            const res = await fetch(`/api/preparation/${id}`);
            const result = await res.json();
            if (result.success) setOrder(result.data);
        } catch { /* ignore */ } finally { setIsLoading(false); }
    }, [id]);
    useEffect(() => { fetchOrder(); }, [fetchOrder]);

    useEffect(() => {
        const channel = supabase
            .channel(`preparation-detail-${id}`)
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "preparation_orders", filter: `id=eq.${id}` },
                () => { fetchOrder(); }
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "preparation_items", filter: `preparation_id=eq.${id}` },
                () => { fetchOrder(); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [id, fetchOrder]);

    // ── Live tracking: kirim lokasi device pengantar ──
    const startTracking = useCallback(() => {
        if (!navigator.geolocation || watchIdRef.current != null) return;
        setTracking(true);
        watchIdRef.current = navigator.geolocation.watchPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setPoints(prev => [...prev, { lat, lng }]);
                const now = Date.now();
                if (now - lastPostRef.current > 7000) { // throttle 7 detik
                    lastPostRef.current = now;
                    try {
                        await fetch(`/api/preparation/${id}/tracking`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ lat, lng, accuracy: pos.coords.accuracy }),
                        });
                    } catch { /* ignore */ }
                }
            },
            (err) => console.error("watch error", err),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }, [id]);

    const stopTracking = useCallback(() => {
        if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
        setTracking(false);
    }, []);

    useEffect(() => () => stopTracking(), [stopTracking]);

    // Poll titik tracking utk semua viewer (saat DIKIRIM + PENGANTARAN)
    useEffect(() => {
        if (!order || order.status !== "DIKIRIM" || order.delivery_method !== "PENGANTARAN") return;
        let active = true;
        const fetchPoints = async () => {
            try {
                const res = await fetch(`/api/preparation/${id}/tracking`);
                const result = await res.json();
                if (active && result.success) {
                    setPoints(result.data.map((p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng })));
                }
            } catch { /* ignore */ }
        };
        fetchPoints();
        const iv = setInterval(fetchPoints, 8000);
        return () => { active = false; clearInterval(iv); };
    }, [order, id]);

    const toggleItem = async (item: PrepItem) => {
        if (!order || order.status !== "DIPROSES" || !canDone) return;
        // optimistic update
        setOrder(prev => prev
            ? { ...prev, preparation_items: prev.preparation_items.map(it => it.id === item.id ? { ...it, is_checked: !it.is_checked } : it) }
            : prev);
        try {
            await fetch(`/api/preparation/${id}/check`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: item.id, is_checked: !item.is_checked }),
            });
        } catch { fetchOrder(); }
    };

    const startDelivery = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/delivery`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "START" }),
            });
            const result = await res.json();
            if (result.success) { await fetchOrder(); startTracking(); }
            else alert(result.message);
        } catch { alert("Gagal"); } finally { setActionLoading(false); }
    };

    const completeDelivery = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/delivery`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "COMPLETE" }),
            });
            const result = await res.json();
            if (result.success) { stopTracking(); await fetchOrder(); }
            else alert(result.message);
        } catch { alert("Gagal"); } finally { setActionLoading(false); }
    };

    if (isLoading) {
        return <DashboardLayout><main className="min-h-screen bg-[#F7F7F8] p-6"><div className="max-w-3xl mx-auto"><div className="h-40 bg-white rounded-2xl border border-gray-100 animate-pulse" /></div></main></DashboardLayout>;
    }
    if (!order) {
        return <DashboardLayout><main className="min-h-screen bg-[#F7F7F8] p-6"><div className="max-w-3xl mx-auto text-center py-20"><p className="text-gray-500">Data tidak ditemukan</p><Link href="/dashboard/preparation" className="text-sm text-blue-600 hover:underline mt-2 inline-block">← Kembali</Link></div></main></DashboardLayout>;
    }

    const sm = STATUS_META[order.status] ?? STATUS_META.MENUNGGU;
    const checked = order.preparation_items.filter(it => it.is_checked).length;
    const allChecked = order.preparation_items.length > 0 && checked === order.preparation_items.length;
    const dest = order.dest_lat != null && order.dest_lng != null ? { lat: order.dest_lat, lng: order.dest_lng } : null;

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
                <div className="max-w-3xl mx-auto space-y-4">
                    <Link href="/dashboard/preparation" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Kembali ke daftar
                    </Link>

                    {/* Header card */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-mono text-sm font-bold text-gray-700">{order.order_number}</span>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${sm.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{sm.label}
                                    </span>
                                </div>
                                <h1 className="text-lg font-black text-gray-900">{order.customer_name}</h1>
                                {order.customer_phone && <p className="text-sm text-gray-500">📱 {order.customer_phone}</p>}
                                {order.delivery_address && <p className="text-xs text-gray-500 mt-1">📍 {order.delivery_address}</p>}
                            </div>
                        </div>

                        {/* Timeline ringkas — dengan tanggal & jam */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Dibuat</p>
                                <p className="font-bold text-gray-700 mt-0.5 truncate">{order.created_by_name || "—"}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">{fmtFull(order.created_at)}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Diterima</p>
                                <p className="font-bold text-gray-700 mt-0.5 truncate">{order.received_by_name || "—"}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">{order.received_at ? fmtFull(order.received_at) : "—"}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Disiapkan</p>
                                <p className="font-bold text-gray-700 mt-0.5 truncate">{order.done_by_name || "—"}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">{order.done_at ? fmtFull(order.done_at) : "—"}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Pengantar</p>
                                <p className="font-bold text-gray-700 mt-0.5 truncate">{order.delivery_user_name || "—"}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">{order.delivered_at ? fmtFull(order.delivered_at) : order.delivery_started_at ? fmtFull(order.delivery_started_at) : "—"}</p>
                            </div>
                        </div>

                        {order.notes && (
                            <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                <p className="text-[10px] text-amber-600 font-semibold uppercase mb-1">Catatan</p>
                                <p className="text-xs text-amber-900">{order.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Checklist SN */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-gray-800">Daftar Unit ({order.preparation_items.length})</h2>
                            {order.status === "DIPROSES" && (
                                <span className="text-xs font-semibold text-blue-600">{checked}/{order.preparation_items.length} dicek</span>
                            )}
                        </div>
                        <div className="space-y-2">
                            {order.preparation_items.map(it => {
                                const interactive = order.status === "DIPROSES" && canDone;
                                return (
                                    <button key={it.id} type="button" disabled={!interactive} onClick={() => toggleItem(it)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${it.is_checked ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"} ${interactive ? "hover:border-gray-300 cursor-pointer" : "cursor-default"}`}>
                                        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${it.is_checked ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"}`}>
                                            {it.is_checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-mono text-sm font-bold text-gray-800">{it.serial_number}</p>
                                            {it.laptop_name && <p className="text-xs text-gray-500 truncate">{it.laptop_name}</p>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tombol Selesai (penyedia) */}
                        {order.status === "DIPROSES" && canDone && (
                            <button onClick={() => setShowDone(true)} disabled={!allChecked}
                                className="w-full mt-4 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                                {allChecked ? "✅ Selesai Disiapkan" : `Cek semua unit dulu (${checked}/${order.preparation_items.length})`}
                            </button>
                        )}
                    </div>

                    {/* ── PENGIRIMAN: PENGANTARAN ── */}
                    {order.status === "DIKIRIM" && order.delivery_method === "PENGANTARAN" && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-bold text-gray-800">🛵 Live Tracking Pengantaran</h2>
                                {tracking && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Mengirim lokasi</span>}
                            </div>

                            <DeliveryMap points={points} destination={dest} height={320} />

                            <div className="mt-3 flex gap-2">
                                {canDeliver && !order.delivery_started_at && (
                                    <button onClick={startDelivery} disabled={actionLoading}
                                        className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-bold hover:bg-[#16213e] transition disabled:opacity-50">
                                        {actionLoading ? "..." : "🚀 Mulai Antar (aktifkan tracking)"}
                                    </button>
                                )}
                                {canDeliver && order.delivery_started_at && !tracking && (
                                    <button onClick={startTracking}
                                        className="flex-1 h-11 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition">
                                        📍 Lanjut Kirim Lokasi
                                    </button>
                                )}
                                {canDeliver && order.delivery_started_at && (
                                    <button onClick={completeDelivery} disabled={actionLoading}
                                        className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
                                        {actionLoading ? "..." : "✅ Sudah Sampai"}
                                    </button>
                                )}
                            </div>
                            {order.delivery_started_at && (
                                <p className="text-[11px] text-gray-400 mt-2 text-center">
                                    Mulai antar: {new Date(order.delivery_started_at).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── PENGIRIMAN: KURIR ── */}
                    {order.status === "DIKIRIM" && order.delivery_method === "KURIR" && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h2 className="text-sm font-bold text-gray-800 mb-3">📦 Pengiriman via Kurir</h2>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500">Jasa Kurir</span><span className="font-bold text-gray-800">{order.courier_service || "—"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">No. Resi</span><span className="font-mono font-bold text-gray-800">{order.courier_tracking_number || "—"}</span></div>
                                {order.courier_note && <div className="flex justify-between"><span className="text-gray-500">Catatan</span><span className="text-gray-700">{order.courier_note}</span></div>}
                            </div>
                            {canDeliver && (
                                <button onClick={completeDelivery} disabled={actionLoading}
                                    className="w-full mt-4 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
                                    {actionLoading ? "..." : "✅ Tandai Sudah Terkirim"}
                                </button>
                            )}
                        </div>
                    )}

                    {/* SELESAI → lanjut ke payment */}
                    {order.status === "SELESAI" && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                            <div className="text-3xl mb-2">🎉</div>
                            <p className="text-sm font-bold text-emerald-800">Barang sudah sampai ke customer</p>
                            <p className="text-xs text-emerald-600 mt-1">
                                {order.delivery_method === "DIAMBIL_CUSTOMER" ? "Diambil langsung oleh customer" :
                                    order.delivery_method === "PENGANTARAN" ? `Diantar oleh ${order.delivery_user_name || "pengantaran"}` :
                                        `Dikirim via ${order.courier_service || "kurir"}`}
                                {order.delivered_at && ` · ${new Date(order.delivered_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                            </p>
                            {order.transaction_invoice ? (
                                <Link href={`/receipt/${order.transaction_invoice}`}
                                    className="inline-flex items-center gap-2 mt-4 h-10 px-5 bg-emerald-700 text-white rounded-xl text-sm font-bold hover:bg-emerald-800 transition">
                                    🧾 Lihat Transaksi {order.transaction_invoice} →
                                </Link>
                            ) : (
                                <Link href={`/payment/create?prep_id=${order.id}`}
                                    className="inline-flex items-center gap-2 mt-4 h-10 px-5 bg-[#1a1a2e] text-white rounded-xl text-sm font-bold hover:bg-[#16213e] transition">
                                    💳 Lanjut ke Pembayaran →
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {showDone && <DoneModal order={order} onClose={() => setShowDone(false)} onDone={fetchOrder} />}
        </DashboardLayout>
    );
}