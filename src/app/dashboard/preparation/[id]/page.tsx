"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DeliveryMap, { type TrackPoint } from "@/components/preparation/DeliveryMap";
import StartTripModal, { type StartTripPayload } from "@/components/preparation/StartTripModal";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import { haversineM, bearingDeg, computeSpeedKmh } from "@/lib/geo";
import DeliveryVoiceHT from "@/components/preparation/DeliveryVoiceHT";
import { supabase } from "@/services/supabase";

interface PrepItem { id: string; serial_number: string; laptop_name: string | null; is_checked: boolean; check_note: string | null }
interface PrepOrder {
    id: string; order_number: string; customer_name: string; customer_phone: string | null;
    status: string; delivery_method: string | null; notes: string | null;
    created_by_name: string | null; received_by_name: string | null; done_by_name: string | null;
    received_at: string | null; done_at: string | null;
    delivery_user_id: string | null; delivery_user_name: string | null; delivery_started_at: string | null; delivered_at: string | null;
    delivery_address: string | null; dest_lat: number | null; dest_lng: number | null;
    route_polyline: string | null; delivery_distance_m: number | null; delivery_duration_s: number | null;
    return_started_at: string | null; returned_at: string | null;
    courier_service: string | null; courier_tracking_number: string | null; courier_note: string | null;
    transaction_invoice: string | null;
    created_at: string; preparation_items: PrepItem[];
}

const fmtFull = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function fmtElapsed(ms: number): string {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
    MENUNGGU: { label: "Menunggu", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
    DIPROSES: { label: "Diproses", badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
    DIKIRIM: { label: "Dikirim", badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
    SELESAI: { label: "Selesai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    DIBATALKAN: { label: "Batal", badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400" },
};

/* ── DoneModal (penyedia barang) — sama seperti sebelumnya ── */
function DoneModal({ order, onClose, onDone }: { order: PrepOrder; onClose: () => void; onDone: () => void }) {
    const [method, setMethod] = useState<"DIAMBIL_CUSTOMER" | "PENGANTARAN" | "KURIR" | null>(null);
    const [address, setAddress] = useState(order.delivery_address || "");
    const [courierService, setCourierService] = useState("");
    const [trackingNumber, setTrackingNumber] = useState("");
    const [courierNote, setCourierNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [drivers, setDrivers] = useState<{ id: string; name: string; role: string }[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [driverId, setDriverId] = useState("");

    useEffect(() => {
        if (method !== "PENGANTARAN" || drivers.length > 0) return;
        setDriversLoading(true);
        fetch("/api/preparation/delivery-users").then((r) => r.json())
            .then((r) => { if (r.success) setDrivers(r.data || []); })
            .catch(() => { }).finally(() => setDriversLoading(false));
    }, [method, drivers.length]);

    const submit = async () => {
        setError("");
        if (!method) { setError("Pilih metode pengiriman dulu"); return; }
        if (method === "PENGANTARAN" && !driverId) { setError("Pilih akun pengantaran yang bertugas dulu"); return; }
        if (method === "KURIR" && !courierService.trim()) { setError("Nama jasa kurir wajib diisi"); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/preparation/${order.id}/done`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    delivery_method: method,
                    delivery_address: address.trim() || null,
                    delivery_user_id: method === "PENGANTARAN" ? driverId : null,
                    delivery_user_name: method === "PENGANTARAN" ? (drivers.find((d) => d.id === driverId)?.name ?? null) : null,
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
        { value: "PENGANTARAN", icon: "🛵", title: "Diantar Role Pengantaran", desc: "Pengantar yang pilih rute + live tracking" },
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
                    {OPTIONS.map((opt) => (
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
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Pilih Pengantar *</label>
                                {driversLoading ? (
                                    <div className="text-xs text-gray-400 py-2">Memuat daftar pengantar...</div>
                                ) : drivers.length === 0 ? (
                                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Belum ada akun role Pengantaran. Buat dulu di menu Users.</div>
                                ) : (
                                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                        {drivers.map((d) => (
                                            <button key={d.id} type="button" onClick={() => setDriverId(d.id)}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition ${driverId === d.id ? "border-violet-500 bg-violet-100" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${driverId === d.id ? "bg-violet-500 text-white" : "bg-gray-100 text-gray-500"}`}>{d.name?.charAt(0)?.toUpperCase() ?? "?"}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-sm font-bold truncate ${driverId === d.id ? "text-violet-800" : "text-gray-700"}`}>{d.name}</p>
                                                    <p className="text-[10px] text-gray-400">{d.role}</p>
                                                </div>
                                                {driverId === d.id && <span className="ml-auto text-violet-600 flex-shrink-0">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Alamat (opsional — pengantar bisa atur ulang)</label>
                                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Alamat customer" className={inputCls} />
                            </div>
                            <p className="text-[11px] text-violet-600">📲 Akun pengantar akan dapat notif bunyi & pilih rute sendiri saat mulai antar.</p>
                        </div>
                    )}
                    {method === "KURIR" && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2.5">
                            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Jasa Kurir *</label><input value={courierService} onChange={(e) => setCourierService(e.target.value)} placeholder="JNE, J&T, SiCepat..." className={inputCls} /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">No. Resi (opsional)</label><input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Nomor resi" className={`${inputCls} font-mono`} /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Catatan (opsional)</label><input value={courierNote} onChange={(e) => setCourierNote(e.target.value)} placeholder="Catatan kurir" className={inputCls} /></div>
                        </div>
                    )}
                    {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">{saving ? "Menyimpan..." : "Konfirmasi Selesai"}</button>
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
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>("User");
    const [nowTs, setNowTs] = useState<number>(() => Date.now());
    const [showDone, setShowDone] = useState(false);
    const [showStart, setShowStart] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const [points, setPoints] = useState<TrackPoint[]>([]);
    const [tracking, setTracking] = useState(false);
    const [signalLost, setSignalLost] = useState(false);
    const watchIdRef = useRef<number | null>(null);
    const lastPostRef = useRef<number>(0);
    const lastPtRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
    const isAssignedRef = useRef(false);
    const returnActiveRef = useRef(false);

    const canDone = userRole ? hasPermission(userRole, PERMISSIONS.DONE_PREPARATION) : false;
    const canDeliver = userRole ? hasPermission(userRole, PERMISSIONS.DELIVERY_PREPARATION) : false;

    useEffect(() => {
        fetch("/api/auth/me").then((r) => r.json())
            .then((r) => { setUserRole(r.user?.role ?? null); setUserId(r.user?.id ?? null); setUserName(r.user?.name ?? "User"); })
            .catch(() => { setUserRole(null); setUserId(null); });
    }, []);

    const fetchOrder = useCallback(async () => {
        try {
            const res = await fetch(`/api/preparation/${id}`);
            const result = await res.json();
            if (result.success) setOrder(result.data);
        } catch { /* ignore */ } finally { setIsLoading(false); }
    }, [id]);
    useEffect(() => { fetchOrder(); }, [fetchOrder]);

    // ticking durasi (cuma saat aktif antar/pulang)
    useEffect(() => {
        const goActive = order?.status === "DIKIRIM";
        const retActive = order?.status === "SELESAI" && !!order?.return_started_at && !order?.returned_at;
        if (!goActive && !retActive) return;
        const iv = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(iv);
    }, [order?.status, order?.return_started_at, order?.returned_at]);

    // refs turunan
    useEffect(() => {
        isAssignedRef.current = !!userId && !!order && order.delivery_user_id === userId;
        returnActiveRef.current = !!order && order.status === "SELESAI" && !!order.return_started_at && !order.returned_at;
    }, [userId, order]);

    // realtime order
    useEffect(() => {
        const ch = supabase.channel(`preparation-detail-${id}`)
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_orders", filter: `id=eq.${id}` }, () => fetchOrder())
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_items", filter: `preparation_id=eq.${id}` }, () => fetchOrder())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [id, fetchOrder]);

    // ── initial fetch titik tracking ──
    const fetchTracking = useCallback(async () => {
        try {
            const res = await fetch(`/api/preparation/${id}/tracking`);
            const r = await res.json();
            if (r.success) setPoints(r.data.map((p: any) => ({
                lat: p.lat, lng: p.lng,
                t: p.recorded_at ? new Date(p.recorded_at).getTime() : undefined,
                speed: p.speed, phase: p.phase === "RETURN" ? "RETURN" : "GO",
            })));
        } catch { /* ignore */ }
    }, [id]);
    useEffect(() => { fetchTracking(); }, [fetchTracking]);

    // ── realtime titik tracking (viewer; pengantar pakai update lokal) ──
    useEffect(() => {
        const ch = supabase.channel(`tracking-${id}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_tracking", filter: `preparation_id=eq.${id}` },
                (payload) => {
                    if (isAssignedRef.current) return; // pengantar sudah append sendiri
                    const p: any = payload.new;
                    setPoints((prev) => [...prev, {
                        lat: p.lat, lng: p.lng,
                        t: p.recorded_at ? new Date(p.recorded_at).getTime() : Date.now(),
                        speed: p.speed, phase: p.phase === "RETURN" ? "RETURN" : "GO",
                    }]);
                })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [id]);

    // ── kirim lokasi + offline buffer ──
    const postTracking = useCallback(async (p: { lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null }) => {
        try {
            const r = await fetch(`/api/preparation/${id}/tracking`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
            });
            if (!r.ok) throw new Error("fail");
            setSignalLost(false);
        } catch {
            const key = `track_buf_${id}`;
            const arr = JSON.parse(localStorage.getItem(key) || "[]");
            arr.push(p);
            localStorage.setItem(key, JSON.stringify(arr.slice(-300)));
            setSignalLost(true);
        }
    }, [id]);

    const flushBuffer = useCallback(async () => {
        const key = `track_buf_${id}`;
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        if (!arr.length) return;
        const remain: any[] = [];
        for (const p of arr) {
            try {
                const r = await fetch(`/api/preparation/${id}/tracking`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
                if (!r.ok) remain.push(p);
            } catch { remain.push(p); }
        }
        localStorage.setItem(key, JSON.stringify(remain));
        if (remain.length === 0) setSignalLost(false);
    }, [id]);

    useEffect(() => {
        const onOnline = () => flushBuffer();
        window.addEventListener("online", onOnline);
        return () => window.removeEventListener("online", onOnline);
    }, [flushBuffer]);

    // ── start/stop GPS watch ──
    const startTracking = useCallback(() => {
        if (!isAssignedRef.current) return;
        if (!navigator.geolocation || watchIdRef.current != null) return;
        setTracking(true);
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude, lng = pos.coords.longitude, now = Date.now();
                let speed: number | null = pos.coords.speed; // m/s atau null
                let heading: number | null = pos.coords.heading;
                const prev = lastPtRef.current;
                if ((speed == null || isNaN(speed)) && prev) {
                    const dt = (now - prev.t) / 1000, d = haversineM(prev, { lat, lng });
                    speed = dt > 0 ? d / dt : 0;
                }
                if ((heading == null || isNaN(heading)) && prev) heading = bearingDeg(prev, { lat, lng });
                lastPtRef.current = { lat, lng, t: now };

                setPoints((prev2) => [...prev2, { lat, lng, t: now, speed, phase: returnActiveRef.current ? "RETURN" : "GO" }]);

                if (now - lastPostRef.current > 3000) {
                    lastPostRef.current = now;
                    postTracking({ lat, lng, accuracy: pos.coords.accuracy ?? null, speed, heading });
                }
            },
            (err) => console.error("watch error", err),
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
        );
    }, [postTracking]);

    const stopTracking = useCallback(() => {
        if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
        setTracking(false);
    }, []);
    useEffect(() => () => stopTracking(), [stopTracking]);

    // auto-resume tracking kalau pengantar yang ditugaskan & order sedang jalan/pulang
    useEffect(() => {
        if (!order || !isAssignedRef.current) return;
        const goActive = order.status === "DIKIRIM" && order.delivery_method === "PENGANTARAN" && !!order.delivery_started_at;
        const retActive = order.status === "SELESAI" && !!order.return_started_at && !order.returned_at;
        if ((goActive || retActive) && watchIdRef.current == null) startTracking();
    }, [order, startTracking]);

    // ── checklist unit ──
    const toggleItem = async (item: PrepItem) => {
        if (!order || order.status !== "DIPROSES" || !canDone) return;
        setOrder((prev) => prev ? { ...prev, preparation_items: prev.preparation_items.map((it) => it.id === item.id ? { ...it, is_checked: !it.is_checked } : it) } : prev);
        try {
            await fetch(`/api/preparation/${id}/check`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: item.id, is_checked: !item.is_checked }) });
        } catch { fetchOrder(); }
    };

    // ── START antar (pengantar pilih rute di modal) ──
    const handleStartTrip = async (payload: StartTripPayload) => {
        const res = await fetch(`/api/preparation/${id}/delivery`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "START",
                dest_lat: payload.dest.lat, dest_lng: payload.dest.lng,
                delivery_address: payload.address,
                route_polyline: payload.route ? JSON.stringify(payload.route.coords) : null,
                distance_m: payload.route?.distanceM ?? null,
                duration_s: payload.route?.durationS ?? null,
            }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);
        await fetchOrder();
        startTracking();
    };

    const completeDelivery = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "COMPLETE" }) });
            const result = await res.json();
            if (result.success) { stopTracking(); await fetchOrder(); } else alert(result.message);
        } catch { alert("Gagal"); } finally { setActionLoading(false); }
    };

    const doReturnAction = async (action: "RETURN_START" | "RETURN_COMPLETE") => {
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
            const result = await res.json();
            if (result.success) {
                await fetchOrder();
                if (action === "RETURN_START") startTracking();
                else stopTracking();
            } else alert(result.message);
        } catch { alert("Gagal"); } finally { setActionLoading(false); }
    };

    if (isLoading) return <DashboardLayout><main className="min-h-screen bg-[#F7F7F8] p-6"><div className="max-w-3xl mx-auto"><div className="h-40 bg-white rounded-2xl border border-gray-100 animate-pulse" /></div></main></DashboardLayout>;
    if (!order) return <DashboardLayout><main className="min-h-screen bg-[#F7F7F8] p-6"><div className="max-w-3xl mx-auto text-center py-20"><p className="text-gray-500">Data tidak ditemukan</p><Link href="/dashboard/preparation" className="text-sm text-blue-600 hover:underline mt-2 inline-block">← Kembali</Link></div></main></DashboardLayout>;

    const sm = STATUS_META[order.status] ?? STATUS_META.MENUNGGU;
    const checked = order.preparation_items.filter((it) => it.is_checked).length;
    const allChecked = order.preparation_items.length > 0 && checked === order.preparation_items.length;
    const dest = order.dest_lat != null && order.dest_lng != null ? { lat: order.dest_lat, lng: order.dest_lng } : null;
    const isAssignedDriver = !!userId && order.delivery_user_id === userId;
    const routeLine: [number, number][] | null = (() => {
        try { return order.route_polyline ? JSON.parse(order.route_polyline) : null; } catch { return null; }
    })();
    const speedKmh = computeSpeedKmh(points);

    const isDeliveringGo = order.status === "DIKIRIM" && order.delivery_method === "PENGANTARAN";
    const isReturning = order.status === "SELESAI" && !!order.return_started_at && !order.returned_at;

    const startMs = isReturning
        ? (order.return_started_at ? new Date(order.return_started_at).getTime() : nowTs)
        : (order.delivery_started_at ? new Date(order.delivery_started_at).getTime() : nowTs);
    const elapsedMs = nowTs - startMs;

    const isBaseRole = userRole ? ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "KEPALA_SALES"].includes(userRole) : false;
    const canVoice = isAssignedDriver || isBaseRole;

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
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${sm.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{sm.label}</span>
                                </div>
                                <h1 className="text-lg font-black text-gray-900">{order.customer_name}</h1>
                                {order.customer_phone && <p className="text-sm text-gray-500">📱 {order.customer_phone}</p>}

                                {order.delivery_address && <p className="text-xs text-gray-500 mt-1">📍 {order.delivery_address}</p>}

                            </div>

                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {[
                                { label: "Dibuat", name: order.created_by_name, time: order.created_at },
                                { label: "Diterima", name: order.received_by_name, time: order.received_at },
                                { label: "Disiapkan", name: order.done_by_name, time: order.done_at },
                                { label: "Pengantar", name: order.delivery_user_name, time: order.delivered_at ?? order.delivery_started_at },
                            ].map((x) => (
                                <div key={x.label} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase">{x.label}</p>
                                    <p className="font-bold text-gray-700 mt-0.5 truncate">{x.name || "—"}</p>
                                    <p className="text-[9px] text-gray-400 mt-0.5">{x.time ? fmtFull(x.time) : "—"}</p>
                                </div>
                            ))}
                        </div>

                        {/* estimasi rute kalau ada */}
                        {(order.delivery_distance_m || order.delivery_duration_s) && (
                            <div className="mt-3 flex gap-2">
                                {order.delivery_distance_m != null && <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-lg">📏 {(order.delivery_distance_m / 1000).toFixed(1)} km</span>}
                                {order.delivery_duration_s != null && <span className="text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-lg">⏱️ {Math.round(order.delivery_duration_s / 60)} mnt</span>}
                            </div>
                        )}

                        {order.notes && <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3"><p className="text-[10px] text-amber-600 font-semibold uppercase mb-1">Catatan</p><p className="text-xs text-amber-900">{order.notes}</p></div>}
                    </div>

                    {/* Checklist SN */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-gray-800">Daftar Unit ({order.preparation_items.length})</h2>
                            {order.status === "DIPROSES" && <span className="text-xs font-semibold text-blue-600">{checked}/{order.preparation_items.length} dicek</span>}
                        </div>
                        <div className="space-y-2">
                            {order.preparation_items.map((it) => {
                                const interactive = order.status === "DIPROSES" && canDone;
                                return (
                                    <button key={it.id} type="button" disabled={!interactive} onClick={() => toggleItem(it)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${it.is_checked ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"} ${interactive ? "hover:border-gray-300 cursor-pointer" : "cursor-default"}`}>
                                        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${it.is_checked ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"}`}>
                                            {it.is_checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </span>
                                        <div className="min-w-0"><p className="font-mono text-sm font-bold text-gray-800">{it.serial_number}</p>{it.laptop_name && <p className="text-xs text-gray-500 truncate">{it.laptop_name}</p>}</div>
                                    </button>
                                );
                            })}
                        </div>
                        {order.status === "DIPROSES" && canDone && (
                            <button onClick={() => setShowDone(true)} disabled={!allChecked}
                                className="w-full mt-4 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                                {allChecked ? "✅ Selesai Disiapkan" : `Cek semua unit dulu (${checked}/${order.preparation_items.length})`}
                            </button>
                        )}
                    </div>

                    {/* ── PENGANTARAN ── */}
                    {(isDeliveringGo || isReturning) && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-bold text-gray-800">🛵 Live Tracking {isReturning ? "Pulang" : "Pengantaran"}</h2>
                                <div className="flex items-center gap-2">
                                    {signalLost && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">📵 Sinyal hilang — buffer</span>}
                                    {tracking
                                        ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Mengirim lokasi</span>
                                        : !isAssignedDriver && <span className="text-[11px] font-semibold text-gray-400">Mode pantau</span>}
                                </div>
                            </div>

                            {order.delivery_user_name && (
                                <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5">
                                    <span className="w-9 h-9 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{order.delivery_user_name.charAt(0).toUpperCase()}</span>
                                    <div className="min-w-0"><p className="text-[10px] text-violet-500 font-semibold uppercase">Pengantar bertugas</p><p className="text-sm font-bold text-violet-800 truncate">{order.delivery_user_name}</p></div>
                                    {isAssignedDriver && <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex-shrink-0">Anda</span>}
                                </div>
                            )}

                            {!isAssignedDriver && <p className="text-[11px] text-gray-400 mb-2">📡 Lokasi dikirim oleh {order.delivery_user_name || "pengantar"} realtime. Anda memantau.</p>}

                            <DeliveryMap points={points} routeLine={routeLine} destination={dest} height={380} />

                            {/* speed + durasi */}
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center"><p className="text-[10px] text-blue-400 font-semibold uppercase">Kecepatan</p><p className="text-lg font-black text-blue-700 tabular-nums">{speedKmh != null ? `${Math.round(speedKmh)}` : "—"}<span className="text-[10px] font-bold"> km/j</span></p></div>
                                <div className="bg-[#1a1a2e] rounded-xl p-2.5 text-center"><p className="text-[10px] text-gray-300 font-semibold uppercase">Durasi</p><p className="text-lg font-black text-white tabular-nums">{fmtElapsed(elapsedMs)}</p></div>
                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center"><p className="text-[10px] text-gray-400 font-semibold uppercase">Titik</p><p className="text-lg font-black text-gray-700 tabular-nums">{points.length}</p></div>
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center"><p className="text-[10px] text-emerald-400 font-semibold uppercase">Fase</p><p className="text-sm font-black text-emerald-700 mt-1">{isReturning ? "Pulang" : "Antar"}</p></div>
                            </div>

                            {canVoice && userId && (
                                <DeliveryVoiceHT orderId={order.id} userId={userId} userName={userName} userRole={userRole ?? ""} canTalk={canVoice} />
                            )}

                            {/* kontrol PENGANTAR */}
                            {isAssignedDriver && (
                                <div className="mt-3 space-y-2">
                                    {isDeliveringGo && !order.delivery_started_at && (
                                        <button onClick={() => setShowStart(true)} className="w-full h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-bold hover:bg-[#16213e] transition">🎯 Atur Tujuan & Mulai Antar</button>
                                    )}
                                    {isDeliveringGo && order.delivery_started_at && (
                                        <div className="flex gap-2">
                                            {!tracking && <button onClick={startTracking} className="flex-1 h-11 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition">📍 Lanjut Kirim Lokasi</button>}
                                            <button onClick={completeDelivery} disabled={actionLoading} className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">{actionLoading ? "..." : "✅ Sampai ke Customer"}</button>
                                        </div>
                                    )}
                                    {isReturning && (
                                        <button onClick={() => doReturnAction("RETURN_COMPLETE")} disabled={actionLoading} className="w-full h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">{actionLoading ? "..." : "🏠 Sudah Sampai Toko"}</button>
                                    )}
                                </div>
                            )}

                            {isDeliveringGo && order.delivery_started_at && <p className="text-[11px] text-gray-400 mt-2 text-center">Mulai antar: {new Date(order.delivery_started_at).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>}
                        </div>
                    )}

                    {/* ── KURIR ── */}
                    {order.status === "DIKIRIM" && order.delivery_method === "KURIR" && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h2 className="text-sm font-bold text-gray-800 mb-3">📦 Pengiriman via Kurir</h2>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500">Jasa Kurir</span><span className="font-bold text-gray-800">{order.courier_service || "—"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">No. Resi</span><span className="font-mono font-bold text-gray-800">{order.courier_tracking_number || "—"}</span></div>
                                {order.courier_note && <div className="flex justify-between"><span className="text-gray-500">Catatan</span><span className="text-gray-700">{order.courier_note}</span></div>}
                            </div>
                            {canDeliver && <button onClick={completeDelivery} disabled={actionLoading} className="w-full mt-4 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">{actionLoading ? "..." : "✅ Tandai Sudah Terkirim"}</button>}
                        </div>
                    )}

                    {/* SELESAI */}
                    {order.status === "SELESAI" && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                            <div className="text-3xl mb-2">🎉</div>
                            <p className="text-sm font-bold text-emerald-800">Barang sudah sampai ke customer</p>
                            <p className="text-xs text-emerald-600 mt-1">
                                {order.delivery_method === "DIAMBIL_CUSTOMER" ? "Diambil langsung oleh customer" : order.delivery_method === "PENGANTARAN" ? `Diantar oleh ${order.delivery_user_name || "pengantaran"}` : `Dikirim via ${order.courier_service || "kurir"}`}
                                {order.delivered_at && ` · ${new Date(order.delivered_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                            </p>
                            {order.delivery_method === "PENGANTARAN" && order.delivery_started_at && order.delivered_at && (
                                <p className="text-[11px] text-emerald-700 font-bold mt-1">⏱️ Total antar: {fmtElapsed(new Date(order.delivered_at).getTime() - new Date(order.delivery_started_at).getTime())}</p>
                            )}

                            {/* tombol perjalanan pulang utk pengantar */}
                            {order.delivery_method === "PENGANTARAN" && isAssignedDriver && !order.returned_at && (
                                <div className="mt-4">
                                    {!order.return_started_at
                                        ? <button onClick={() => doReturnAction("RETURN_START")} disabled={actionLoading} className="inline-flex items-center gap-2 h-10 px-5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition disabled:opacity-50">{actionLoading ? "..." : "🔙 Mulai Perjalanan Pulang"}</button>
                                        : <span className="text-xs text-orange-600 font-semibold">Sedang dalam perjalanan pulang — tracking aktif di atas</span>}
                                </div>
                            )}
                            {order.returned_at && (
                                <p className="text-[11px] text-gray-400 mt-2">
                                    Pengantar kembali ke toko · {fmtFull(order.returned_at)}
                                    {order.return_started_at && ` · pulang ${fmtElapsed(new Date(order.returned_at).getTime() - new Date(order.return_started_at).getTime())}`}
                                </p>
                            )}
                            
                            <div className="mt-4">
                                {order.transaction_invoice
                                    ? <Link href={`/receipt/${order.transaction_invoice}`} className="inline-flex items-center gap-2 h-10 px-5 bg-emerald-700 text-white rounded-xl text-sm font-bold hover:bg-emerald-800 transition">🧾 Lihat Transaksi {order.transaction_invoice} →</Link>
                                    : <Link href={`/payment/create?prep_id=${order.id}`} className="inline-flex items-center gap-2 h-10 px-5 bg-[#1a1a2e] text-white rounded-xl text-sm font-bold hover:bg-[#16213e] transition">💳 Lanjut ke Pembayaran →</Link>}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {showDone && <DoneModal order={order} onClose={() => setShowDone(false)} onDone={fetchOrder} />}
            {showStart && <StartTripModal defaultAddress={order.delivery_address} onClose={() => setShowStart(false)} onConfirm={async (p) => { await handleStartTrip(p); setShowStart(false); }} />}
        </DashboardLayout>
    );

}
