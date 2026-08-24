"use client";
// src/app/dashboard/preparation/[id]/page.tsx

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DeliveryMap, { type TrackPoint } from "@/components/preparation/DeliveryMap";
import StartTripModal, { type StartTripPayload } from "@/components/preparation/StartTripModal";
import { UserRole, PERMISSIONS, hasAnyRole } from "@/lib/permissions";
import { computeSpeedKmh } from "@/lib/geo";
import { useDeliveryTracker, type TrackerPoint } from "@/hooks/useDeliveryTracker";
import TrackingStatusBadge from "@/components/preparation/TrackingStatusBadge";
import DeliveryVoiceHT from "@/components/preparation/DeliveryVoiceHT";
import { supabase } from "@/services/supabase";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import ReassignModal from "@/components/preparation/ReassignModal";
import ManualStatusModal from "@/components/preparation/ManualStatusModal";
import { CheckCircle2, FileText, Clock, Inbox, AlertCircle, User, Bike, Package } from "lucide-react";
import { getAuthUser } from "@/hooks/useAuthUser";

interface PrepItem {
    id: string; serial_number: string; laptop_name: string | null;
    laptop_id: string | null;
    laptop_spec?: { cpu: string | null; ram: string | null; storage: string | null; gpu: string | null } | null;
    is_checked: boolean; check_note: string | null;
    is_cancelled: boolean; cancel_reason: string | null;
    cancelled_at: string | null; cancelled_by_name: string | null;
    // Diisi oleh GET /api/preparation/[id] kalau unit_id item ini ternyata
    // sudah SOLD lewat transaksi di pesanan LAIN (business rule: SN yang sama
    // boleh dipakai di lebih dari 1 penyiapan sekaligus — lihat units/search-sn).
    sold_elsewhere?: {
        invoice_number: string;
        preparation_id: string | null;
        preparation_order_number: string | null;
    } | null;
}
interface PrepOrder {
    id: string; order_number: string; customer_name: string; customer_phone: string | null;
    status: string; delivery_method: string | null; notes: string | null; notes_from_provider?: string | null;
    created_by_name: string | null; received_by_name: string | null; done_by_name: string | null;
    dispatched_by_name?: string | null; dispatched_at?: string | null;
    received_at: string | null; done_at: string | null;
    delivery_user_id: string | null; delivery_user_name: string | null;
    delivery_started_at: string | null; delivered_at: string | null;
    delivery_address: string | null; dest_lat: number | null; dest_lng: number | null;
    route_polyline: string | null; delivery_distance_m: number | null; delivery_duration_s: number | null;
    return_started_at: string | null; returned_at: string | null;
    courier_service: string | null; courier_tracking_number: string | null; courier_note: string | null;
    transaction_invoice: string | null;
    tracking_status: string | null; tracking_reason: string | null; tracking_last_ping: string | null;
    // ── persetujuan pengantar (item 1) ──
    delivery_accepted_at: string | null; delivery_declined_at: string | null; delivery_decline_reason: string | null;
    // ── batalkan pesanan (item 4) ──
    cancelled_at: string | null; cancelled_by_name: string | null; cancel_reason: string | null;
    created_at: string; preparation_items: PrepItem[]; scheduled_delivery_date: string | null;
    sales_channel?: "MANUAL" | "ECOMMERCE" | null; ecommerce_platform?: string | null; deal_price?: number | null;
}

const fmtFull = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const fmtDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

const todayLocal = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// TAMBAH setelah fmtDate function
function fmtDuration(from: string | null, to: string | null): string | null {
    if (!from || !to) return null;
    const diffMs = new Date(to).getTime() - new Date(from).getTime();
    if (diffMs <= 0) return null;
    const totalMin = Math.floor(diffMs / 60000);
    if (totalMin < 1) return "< 1 mnt";
    if (totalMin < 60) return `${totalMin} mnt`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h} jam ${m} mnt` : `${h} jam`;
}

const addDaysLocal = (n: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function fmtElapsed(ms: number): string {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

function isMapUrl(str: string | null): boolean {
    if (!str) return false;
    return /^https?:\/\//i.test(str.trim());
}

function AddressDisplay({ address, className }: { address: string; className?: string }) {
    if (isMapUrl(address)) {
        return (
            <a
                href={address}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-blue-600 underline underline-offset-2 break-all hover:text-blue-800 transition ${className ?? ""}`
                }
                onClick={(e) => e.stopPropagation()
                }
            >
                Buka Maps →
            </a >
        );
    }
    return <span className={className}>{address}</span>;
}

// Status includes SIAP_KIRIM + MENUNGGU_PENGANTAR (persetujuan pengantar)
const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
    MENUNGGU: { label: "Menunggu", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
    DIPROSES: { label: "Diproses", badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
    SIAP_KIRIM: { label: "Siap Kirim", badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
    MENUNGGU_PENGANTAR: { label: "Menunggu Pengantar", badge: "bg-yellow-50 text-yellow-700 border-yellow-200", dot: "bg-yellow-400" },
    DIKIRIM: { label: "Dikirim", badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
    SELESAI: { label: "Selesai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    DIBATALKAN: { label: "Batal", badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400" },
};

// ── DispatchModal: Sales pilih metode pengiriman setelah penyedia done ──────────
function DispatchModal({ order, onClose, onDispatched }: {
    order: PrepOrder; onClose: () => void; onDispatched: () => void;
}) {
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
    const [driverName, setDriverName] = useState("");
    const [schedule, setSchedule] = useState<"TODAY" | "TOMORROW">("TODAY");

    useEffect(() => {
        if (method !== "PENGANTARAN" || drivers.length > 0) return;
        setDriversLoading(true);
        fetch("/api/preparation/delivery-users")
            .then(r => r.json())
            .then(r => { if (r.success) setDrivers(r.data || []); })
            .catch(() => { })
            .finally(() => setDriversLoading(false));
    }, [method, drivers.length]);

    const submit = async () => {
        setError("");
        if (!method) { setError("Pilih metode pengiriman dulu"); return; }
        if (method === "PENGANTARAN" && !driverId) { setError("Pilih pengantar yang bertugas"); return; }
        if (method === "KURIR" && !courierService.trim()) { setError("Nama jasa kurir wajib diisi"); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/preparation/${order.id}/dispatch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    delivery_method: method,
                    delivery_address: address.trim() || null,
                    delivery_user_id: method === "PENGANTARAN" ? driverId : null,
                    delivery_user_name: method === "PENGANTARAN" ? driverName : null,
                    scheduled_delivery_date:
                        method === "PENGANTARAN"
                            ? (schedule === "TODAY" ? todayLocal() : addDaysLocal(1))
                            : null,   // ← baru
                    courier_service: courierService.trim() || null,
                    courier_tracking_number: trackingNumber.trim() || null,
                    courier_note: courierNote.trim() || null,
                }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal"); return; }
            onDispatched();
            onClose();
        } catch { setError("Terjadi kesalahan koneksi"); } finally { setSaving(false); }
    };

    const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition";

    const OPTIONS = [
        { value: "DIAMBIL_CUSTOMER", icon: User, title: "Langsung Diambil Customer", desc: "Customer ambil ke toko, langsung selesai" },
        { value: "PENGANTARAN", icon: Bike, title: "Diantar Role Pengantaran", desc: "Pengantar dapat notif tugas & harus menyetujui dulu" },
        { value: "KURIR", icon: Package, title: "Diantar Kurir", desc: "Jasa kurir pihak ketiga (JNE, J&T, dll)" },
    ] as const;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
                <div className="bg-orange-500 px-5 py-4 flex-shrink-0">
                    <p className="font-bold text-white text-sm"> Barang Siap Dikirim</p>
                    <p className="text-xs text-orange-100 mt-0.5">Pilih cara barang sampai ke customer</p>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2.5">
                    {OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        return (
                            <button key={opt.value} type="button" onClick={() => setMethod(opt.value)}
                                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition ${method === opt.value ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                                <span className="flex-shrink-0"><Icon className="w-6 h-6 text-gray-500" /></span>
                                <div>
                                    <p className={`text-sm font-bold ${method === opt.value ? "text-orange-700" : "text-gray-700"}`}>{opt.title}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                                </div>
                            </button>
                        );
                    })}

                    {method === "PENGANTARAN" && (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2.5">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Pilih Pengantar *</label>
                                {driversLoading ? (
                                    <div className="text-xs text-gray-400 py-2">Memuat daftar pengantar...</div>
                                ) : drivers.length === 0 ? (
                                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        Belum ada akun role Pengantaran.
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                                        {drivers.map(d => (
                                            <button key={d.id} type="button" onClick={() => { setDriverId(d.id); setDriverName(d.name); }}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition ${driverId === d.id ? "border-violet-500 bg-violet-100" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${driverId === d.id ? "bg-violet-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                                                    {d.name?.charAt(0)?.toUpperCase() ?? "?"}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-sm font-bold truncate ${driverId === d.id ? "text-violet-800" : "text-gray-700"}`}>{d.name}</p>
                                                    <p className="text-[10px] text-gray-400">{d.role}</p>
                                                </div>
                                                {driverId === d.id && <CheckCircle2 className="text-violet-600 w-5 h-5 flex-shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Alamat Tujuan *</label>
                                <input
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="Alamat atau paste link Google Maps"
                                    className={inputCls}
                                />
                                <p className="text-[11px] text-violet-500 mt-1">
                                    Bisa isi alamat biasa atau paste link Google Maps / Waze
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Jadwal Antar *</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setSchedule("TODAY")}
                                        className={`h-11 rounded-xl border-2 text-sm font-bold transition ${schedule === "TODAY" ? "border-violet-500 bg-violet-100 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                                        Antar Hari Ini
                                    </button>
                                    <button type="button" onClick={() => setSchedule("TOMORROW")}
                                        className={`h-11 rounded-xl border-2 text-sm font-bold transition ${schedule === "TOMORROW" ? "border-violet-500 bg-violet-100 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                                        Antar Besok
                                    </button>
                                </div>
                                <p className="text-[11px] text-violet-500 mt-1">
                                    {schedule === "TODAY"
                                        ? "Pengantar bisa langsung mulai antar hari ini."
                                        : `Pengantar baru bisa mulai antar besok (${addDaysLocal(1)}).`}
                                </p>
                            </div>

                            {isMapUrl(address) && (
                                <a
                                    href={address}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 underline mt-1"
                                >
                                    Preview Maps →
                                </a>
                            )}
                            <p className="text-[11px] text-violet-600"> Pengantar yang dipilih akan menerima notifikasi dan harus menyetujui tugas sebelum mulai antar.</p>
                        </div>
                    )}

                    {method === "KURIR" && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2.5">
                            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Jasa Kurir *</label>
                                <input value={courierService} onChange={e => setCourierService(e.target.value)} placeholder="JNE, J&T, SiCepat..." className={inputCls} /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">No. Resi (opsional)</label>
                                <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="Nomor resi" className={`${inputCls} font-mono`} /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Catatan (opsional)</label>
                                <input value={courierNote} onChange={e => setCourierNote(e.target.value)} placeholder="Catatan kurir" className={inputCls} /></div>
                        </div>
                    )}

                    {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-11 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50">
                        {saving ? "Menyimpan..." : "Konfirmasi Pengiriman"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── DoneModal: Penyedia barang menyelesaikan pengecekan ──────────────────────
function DoneModal({ order, onClose, onDone }: {
    order: PrepOrder; onClose: () => void; onDone: () => void;
}) {
    const [notesFromProvider, setNotesFromProvider] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setSaving(true);
        setError("");
        try {
            const res = await fetch(`/api/preparation/${order.id}/done`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes_from_provider: notesFromProvider.trim() || null }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal"); return; }
            onDone();
            onClose();
        } catch { setError("Terjadi kesalahan koneksi"); } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-emerald-600 px-5 py-4">
                    <p className="font-bold text-white text-sm"> Selesai Pengecekan</p>
                    <p className="text-xs text-emerald-100 mt-0.5">Semua unit sudah dicek. Konfirmasi ke sales untuk pilih metode pengiriman.</p>
                </div>
                <div className="px-5 py-4 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Catatan ke Sales (opsional)</label>
                        <textarea
                            value={notesFromProvider}
                            onChange={e => setNotesFromProvider(e.target.value)}
                            rows={3}
                            placeholder="Contoh: Ada goresan kecil di unit ke-2, sudah difoto."
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition resize-none"
                        />
                    </div>
                    {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
                        {saving ? "Menyimpan..." : " Tandai Siap Kirim"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── CancelModal: konfirmasi + alasan pembatalan ──────────────────────────────
function CancelModal({ order, onClose, onCancelled }: {
    order: PrepOrder; onClose: () => void; onCancelled: () => void;
}) {
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setSaving(true);
        setError("");
        try {
            const res = await fetch(`/api/preparation/${order.id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason.trim() || null }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal membatalkan"); return; }
            onCancelled();
            onClose();
        } catch { setError("Terjadi kesalahan koneksi"); } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-red-600 px-5 py-4">
                    <p className="font-bold text-white text-sm"> Batalkan Penyiapan</p>
                    <p className="text-xs text-red-100 mt-0.5">
                        Pesanan {order.order_number} akan dibatalkan permanen dan tidak bisa dikembalikan.
                    </p>
                </div>
                <div className="px-5 py-4 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Alasan (opsional)</label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows={3}
                            placeholder="Contoh: Customer batal order, salah input, dll."
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:bg-white transition resize-none"
                        />
                    </div>
                    {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Jangan Batalkan</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-11 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
                        {saving ? "Membatalkan..." : "Ya, Batalkan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── CancelItemModal: batalkan 1 SN/unit di dalam penyiapan ──────────────────
function CancelItemModal({ order, item, onClose, onCancelled }: {
    order: PrepOrder; item: PrepItem; onClose: () => void; onCancelled: () => void;
}) {
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setSaving(true);
        setError("");
        try {
            const res = await fetch(`/api/preparation/${order.id}/items/${item.id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason.trim() || null }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal membatalkan unit"); return; }
            onCancelled();
            onClose();
        } catch { setError("Terjadi kesalahan koneksi"); } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-red-600 px-5 py-4">
                    <p className="font-bold text-white text-sm"> Batalkan Unit</p>
                    <p className="text-xs text-red-100 mt-0.5">
                        SN <span className="font-mono font-bold">{item.serial_number}</span> akan dibatalkan dan tidak ikut masuk ke pembayaran.
                    </p>
                </div>
                <div className="px-5 py-4 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Alasan (opsional)</label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows={3}
                            placeholder="Contoh: Unit rusak, salah kirim SN, dll."
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:bg-white transition resize-none"
                        />
                    </div>
                    {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-11 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
                        {saving ? "Membatalkan..." : "Ya, Batalkan Unit"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function PreparationDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const confirm = useConfirm();

    const [order, setOrder] = useState<PrepOrder | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>("User");
    const [nowTs, setNowTs] = useState<number>(() => Date.now());
    const [showDone, setShowDone] = useState(false);
    const [showDispatch, setShowDispatch] = useState(false);
    const [showStart, setShowStart] = useState(false);
    const [showReassign, setShowReassign] = useState(false);
    const [showManualStatus, setShowManualStatus] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const [points, setPoints] = useState<TrackPoint[]>([]);
    const isAssignedRef = useRef(false);
    const phaseRef = useRef<"GO" | "RETURN">("GO");
    const [userRoles, setUserRoles] = useState<string[]>([]);

    const canDone = hasAnyRole(userRoles, PERMISSIONS.DONE_PREPARATION);
    const canDispatch = hasAnyRole(userRoles, PERMISSIONS.DISPATCH_PREPARATION);
    const canDeliver = hasAnyRole(userRoles, PERMISSIONS.DELIVERY_PREPARATION);
    const canVoice = hasAnyRole(userRoles, PERMISSIONS.DELIVERY_VOICE);
    const canTargetVoice = hasAnyRole(userRoles, PERMISSIONS.DELIVERY_VOICE_TARGET);
    const canCancel = hasAnyRole(userRoles, PERMISSIONS.CANCEL_PREPARATION);
    const canForceComplete = hasAnyRole(userRoles, PERMISSIONS.FORCE_COMPLETE_PREPARATION);

    const [showCancel, setShowCancel] = useState(false);
    const [cancelItemTarget, setCancelItemTarget] = useState<PrepItem | null>(null);

    useEffect(() => {
        getAuthUser().then(u => ({ success: true, user: u }))
            .then(r => {
                const roles: string[] = r.user?.roles ?? (r.user?.role ? [r.user.role] : []);
                setUserRoles(roles);
                setUserRole((r.user?.role ?? roles[0] ?? null) as UserRole | null);
                setUserId(r.user?.id ?? null);
                setUserName(r.user?.name ?? "User");
            })
            .catch(() => { setUserRoles([]); setUserRole(null); setUserId(null); });
    }, []);

    const fetchOrder = useCallback(async () => {
        try {
            const res = await fetch(`/api/preparation/${id}`);
            const result = await res.json();
            if (result.success) setOrder(result.data);
        } catch { } finally { setIsLoading(false); }
    }, [id]);

    useEffect(() => { fetchOrder(); }, [fetchOrder]);

    // Ticking durasi saat aktif antar/pulang
    useEffect(() => {
        const goActive = order?.status === "DIKIRIM";
        const retActive = order?.status === "SELESAI" && !!order?.return_started_at && !order?.returned_at;
        if (!goActive && !retActive) return;
        const iv = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(iv);
    }, [order?.status, order?.return_started_at, order?.returned_at]);

    useEffect(() => {
        isAssignedRef.current = !!userId && !!order && order.delivery_user_id === userId;
        phaseRef.current = (!!order && order.status === "SELESAI" && !!order.return_started_at && !order.returned_at) ? "RETURN" : "GO";
    }, [userId, order]);

    // Realtime order updates
    useEffect(() => {
        const ch = supabase.channel(`preparation-detail-${id}`)
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_orders", filter: `id=eq.${id}` }, () => fetchOrder())
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_items", filter: `preparation_id=eq.${id}` }, () => fetchOrder())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [id, fetchOrder]);

    // Fetch tracking points
    const fetchTracking = useCallback(async () => {
        try {
            const res = await fetch(`/api/preparation/${id}/tracking`);
            const r = await res.json();
            if (r.success) setPoints(r.data.map((p: any) => ({
                lat: p.lat, lng: p.lng,
                t: p.recorded_at ? new Date(p.recorded_at).getTime() : undefined,
                speed: p.speed, phase: p.phase === "RETURN" ? "RETURN" : "GO",
            })));
        } catch { }
    }, [id]);

    useEffect(() => { fetchTracking(); }, [fetchTracking]);

    // Realtime tracking (viewer)
    useEffect(() => {
        const ch = supabase.channel(`tracking-${id}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_tracking", filter: `preparation_id=eq.${id}` },
                payload => {
                    if (isAssignedRef.current) return;
                    const p: any = payload.new;
                    setPoints(prev => [...prev, {
                        lat: p.lat, lng: p.lng,
                        t: p.recorded_at ? new Date(p.recorded_at).getTime() : Date.now(),
                        speed: p.speed, phase: p.phase === "RETURN" ? "RETURN" : "GO",
                    }]);
                })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [id]);

    const handlePoint = useCallback((p: TrackerPoint) => {
        setPoints(prev => [...prev, { lat: p.lat, lng: p.lng, t: p.t, speed: p.speed, phase: p.phase }]);
    }, []);

    // Tracker aktif HANYA kalau user = pengantar yang ditugaskan & order lagi fase jalan/pulang
    const _isAssigned = !!userId && order?.delivery_user_id === userId;
    const _goActive = order?.status === "DIKIRIM" && order?.delivery_method === "PENGANTARAN" && !!order?.delivery_started_at;
    const _retActive = order?.status === "SELESAI" && !!order?.return_started_at && !order?.returned_at;
    const trackerEnabled = !!_isAssigned && (!!_goActive || !!_retActive);

    const tracker = useDeliveryTracker({
        orderId: id,
        enabled: trackerEnabled,
        phaseRef,
        onPoint: handlePoint,
    });

    const toggleItem = async (item: PrepItem) => {
        if (!order || order.status !== "DIPROSES" || !canDone || item.is_cancelled) return;
        setOrder(prev => prev ? {
            ...prev,
            preparation_items: prev.preparation_items.map(it => it.id === item.id ? { ...it, is_checked: !it.is_checked } : it)
        } : prev);
        try {
            await fetch(`/api/preparation/${id}/check`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: item.id, is_checked: !item.is_checked }),
            });
        } catch { fetchOrder(); }
    };

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
        await fetchOrder(); // begitu delivery_started_at keisi, tracker otomatis mulai
    };

    // ── (item 2) 2-step verifikasi: pengantar SETUJU tugas ──
    const handleAccept = async () => {
        const ok = await confirm({
            title: "Setujui tugas antar ini?",
            message: "Setelah setuju, kamu bertugas mengantar pesanan ini dan tracking GPS akan aktif.",
            variant: "success", confirmText: " Ya, Setuju",
        });
        if (!ok) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/accept`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "ACCEPT" }),
            });
            const result = await res.json();
            if (result.success) { await fetchOrder(); } else alert(result.message);
        } catch { alert("Gagal"); } finally { setActionLoading(false); }
    };

    // ── (item 2) 2-step verifikasi: pengantar TOLAK tugas (pengaman anti-nyangkut) ──
    const handleDecline = async () => {
        const ok = await confirm({
            title: "Tolak tugas antar ini?",
            message: "Tugas dikembalikan ke sales untuk ditugaskan ke pengantar lain.",
            variant: "danger", confirmText: "Ya, Tolak",
        });
        if (!ok) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/accept`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "DECLINE" }),
            });
            const result = await res.json();
            if (result.success) { await fetchOrder(); } else alert(result.message);
        } catch { alert("Gagal"); } finally { setActionLoading(false); }
    };

    const handleCancel = async () => {
        if (!order || actionLoading) return;

        let ok = false;
        try {
            ok = await confirm({
                title: "Batalkan Penyiapan Ini?",
                message: `Pesanan ${order.order_number} akan dibatalkan permanen dan tidak bisa dikembalikan.`,
                variant: "danger",
                confirmText: "Ya, Batalkan",
            });
        } catch (err) {
            console.error("[cancel confirm]", err);
            ok = window.confirm(`Batalkan pesanan ${order.order_number}? Tindakan ini permanen.`);
        }
        if (!ok) return;

        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: null }),
            });
            const result = await res.json();
            if (result.success) await fetchOrder();
            else alert(result.message || "Gagal membatalkan");
        } catch (err) {
            console.error("[cancel]", err);
            alert("Gagal membatalkan pesanan");
        } finally {
            setActionLoading(false);
        }
    };

    const completeDelivery = async () => {
        const ok = await confirm({
            title: "Barang sudah sampai ke customer?",
            message: "Pastikan barang benar-benar sudah diterima customer sebelum menandai selesai.",
            variant: "success", confirmText: "Ya, Sudah Sampai",
        });
        if (!ok) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/delivery`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "COMPLETE" }),
            });
            const result = await res.json();
            if (result.success) { await fetchOrder(); } else alert(result.message); // tracker auto-stop saat status berubah
        } catch { alert("Gagal"); } finally { setActionLoading(false); }
    };

    const forceComplete = async () => {
        if (!order || actionLoading) return;
        const ok = await confirm({
            title: "Selesaikan pengantaran secara paksa?",
            message: "Status langsung jadi SELESAI walau pengantar belum menekan tombol. Pastikan barang benar-benar sudah diterima customer.",
            variant: "warning", confirmText: "Ya, Selesaikan",
        });
        if (!ok) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/force-complete`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: null }),
            });
            const result = await res.json();
            if (result.success) await fetchOrder();
            else alert(result.message || "Gagal menyelesaikan");
        } catch { alert("Gagal menyelesaikan"); } finally { setActionLoading(false); }
    };

    const doReturnAction = async (action: "RETURN_START" | "RETURN_COMPLETE") => {
        const ok = await confirm(
            action === "RETURN_START"
                ? { title: "Mulai perjalanan pulang?", message: "Tracking pulang akan diaktifkan.", variant: "warning", confirmText: "Ya, Mulai Pulang" }
                : { title: "Sudah sampai di toko?", message: "Perjalanan pulang akan ditandai selesai.", variant: "success", confirmText: "Ya, Sudah Sampai" }
        );
        if (!ok) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/preparation/${id}/delivery`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const result = await res.json();
            if (result.success) {
                await fetchOrder();
            } else alert(result.message);
        } catch { alert("Gagal"); } finally { setActionLoading(false); }
    };

    if (isLoading) return (
        <DashboardLayout>
            <main className="min-h-screen bg-[#F7F7F8] p-6">
                <div className="max-w-3xl mx-auto">
                    <div className="h-40 bg-white rounded-2xl border border-gray-100 animate-pulse" />
                </div>
            </main>
        </DashboardLayout>
    );

    if (!order) return (
        <DashboardLayout>
            <main className="min-h-screen bg-[#F7F7F8] p-6">
                <div className="max-w-3xl mx-auto text-center py-20">
                    <p className="text-gray-500">Data tidak ditemukan</p>
                    <Link href="/dashboard/preparation" className="text-sm text-blue-600 hover:underline mt-2 inline-block">← Kembali</Link>
                </div>
            </main>
        </DashboardLayout>
    );

    const sm = STATUS_META[order.status] ?? STATUS_META.MENUNGGU;
    const activeItems = order.preparation_items.filter(it => !it.is_cancelled);
    const cancelledItems = order.preparation_items.filter(it => it.is_cancelled);
    // Unit yang sudah kedeteksi "sold_elsewhere" (terjual lewat pesanan lain)
    // TIDAK BISA dicentang manual — unitnya sudah tidak ada secara fisik.
    // Jadi tidak ikut disyaratkan checked, supaya "Tandai Siap Kirim" tidak
    // macet permanen gara-gara 1 unit yang memang sudah tidak bisa diproses
    // di sini. Provider harus klik "Batalkan" pada unit itu untuk beres-beres.
    const checkableItems = activeItems.filter(it => !it.sold_elsewhere);
    const checked = checkableItems.filter(it => it.is_checked).length;
    const allChecked = checkableItems.length > 0 && checked === checkableItems.length;
    const canCancelItem = canCancel && !order.transaction_invoice && order.status !== "DIBATALKAN";
    const dest = order.dest_lat != null && order.dest_lng != null ? { lat: order.dest_lat, lng: order.dest_lng } : null;
    const isAssignedDriver = !!userId && order.delivery_user_id === userId;
    const routeLine: [number, number][] | null = (() => {
        try { return order.route_polyline ? JSON.parse(order.route_polyline) : null; } catch { return null; }
    })();
    const speedKmh = computeSpeedKmh(points);
    const isDeliveringGo = order.status === "DIKIRIM" && order.delivery_method === "PENGANTARAN";
    const isReturning = order.status === "SELESAI" && !!order.return_started_at && !order.returned_at;
    const scheduledReady =
        !order.scheduled_delivery_date || order.scheduled_delivery_date <= todayLocal();
    const startMs = isReturning
        ? (order.return_started_at ? new Date(order.return_started_at).getTime() : nowTs)
        : (order.delivery_started_at ? new Date(order.delivery_started_at).getTime() : nowTs);
    const elapsedMs = nowTs - startMs;

    // Tombol batal tetap muncul walau status sudah SELESAI (barang sudah
    // diantar) — sesuai business rule: kalau customer batal beli SETELAH
    // barang sampai, order ini masih harus bisa dibatalkan supaya unit-nya
    // dilepas balik ke stok. Yang tetap diblokir cuma:
    // 1) sudah pernah DIBATALKAN sebelumnya
    // 2) sudah terhubung ke transaksi (transaction_invoice terisi) — proses
    //    pembayaran sudah jalan di sisi Sales, harus dibatalkan dari sana.
    // Kondisi ini sengaja disamakan persis dengan guard di
    // api/preparation/[id]/cancel/route.ts supaya tombol tidak pernah
    // tampil untuk kasus yang backend-nya akan tetap tolak.
    const canShowCancel = canCancel && order.status !== "DIBATALKAN" && !order.transaction_invoice;

    // Kalau SEMUA unit aktif (belum dibatalkan) di order ini ternyata sudah
    // "sold_elsewhere" (SN yang sama sudah lunas duluan lewat pesanan lain
    // — lihat GET /api/preparation/[id]), order ini TIDAK PUNYA lagi unit
    // yang bisa dijual. Klik "Lanjut ke Pembayaran" di kondisi ini akan
    // selalu gagal (unitnya sudah tidak ada secara fisik), jadi CTA diganti
    // jadi "Lihat Transaksi" yang mengarah ke invoice yang BENAR-BENAR
    // menjual unit tersebut — bukan order.transaction_invoice, karena order
    // ini sendiri belum pernah dilink ke transaksi manapun.
    const activeItemsForPayment = order.preparation_items.filter(it => !it.is_cancelled);
    const soldElsewhereItems = activeItemsForPayment.filter(it => it.sold_elsewhere);
    const allSoldElsewhere =
        activeItemsForPayment.length > 0 && soldElsewhereItems.length === activeItemsForPayment.length;
    const soldElsewhereInvoice = soldElsewhereItems[0]?.sold_elsewhere?.invoice_number ?? null;

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
                <div className="max-w-3xl mx-auto space-y-4">
                    <Link href="/dashboard/preparation" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Kembali
                    </Link>

                    {/* Header */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-mono text-sm font-bold text-gray-700">{order.order_number}</span>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${sm.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{sm.label}
                                    </span>
                                    {order.sales_channel === "ECOMMERCE" && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold border bg-orange-50 text-orange-700 border-orange-200">
                                            {order.ecommerce_platform ?? "E-COMMERCE"}
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-lg font-black text-gray-900">{order.customer_name}</h1>
                                {order.customer_phone && <p className="text-sm text-gray-500"> {order.customer_phone}</p>}
                                {order.delivery_address && (
                                    <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 mb-3 mt-2">
                                        <p className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">Tujuan</p>
                                        <AddressDisplay address={order.delivery_address} className="text-xs text-gray-700" />
                                    </div>
                                )}
                                {order.scheduled_delivery_date && order.status !== "SELESAI" && order.status !== "DIBATALKAN" && (
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 mt-2 inline-flex items-center gap-2">
                                        <FileText className="w-4 h-4 inline" />
                                        <div>
                                            <p className="text-[10px] text-indigo-400 font-semibold uppercase">Jadwal Antar</p>
                                            <p className="text-xs font-bold text-indigo-700">{fmtDate(order.scheduled_delivery_date)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {canShowCancel && (
                                <button onClick={() => setShowCancel(true)}
                                    className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    Batalkan
                                </button>
                            )}
                        </div>

                        {/* GANTI grid info dibuat/diterima/dll */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {[
                                { label: "Dibuat oleh", name: order.created_by_name, time: order.created_at },
                                { label: "Diterima oleh", name: order.received_by_name, time: order.received_at },
                                { label: "Diselesaikan Penyedia", name: order.done_by_name, time: order.done_at },
                                { label: "Dispatch Sales", name: order.dispatched_by_name ?? null, time: order.dispatched_at ?? null },
                            ].map(x => (
                                <div key={x.label} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase leading-tight">{x.label}</p>
                                    <p className="font-bold text-gray-700 mt-0.5 truncate">{x.name || "—"}</p>
                                    <p className="text-[9px] text-gray-400 mt-0.5">{x.time ? fmtFull(x.time) : "—"}</p>
                                </div>
                            ))}
                        </div>

                        {/* ── Ringkasan Waktu ── */}
                        {/* ── Ringkasan Waktu ── */}
                        {(order.received_at || order.done_at || order.dispatched_at) && (
                            <div className="mt-3 flex flex-wrap gap-2">

                                {/* 1. Tunggu diterima: created → received */}
                                {(() => {
                                    const dur = fmtDuration(order.created_at, order.received_at);
                                    return dur ? (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg">
                                            Tunggu diterima: <span className="font-black">{dur}</span>
                                        </span>
                                    ) : null;
                                })()}

                                {/* 2. Durasi penyiapan: received → done */}
                                {(() => {
                                    const dur = fmtDuration(order.received_at, order.done_at);
                                    return dur ? (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg">
                                            Durasi penyiapan: <span className="font-black">{dur}</span>
                                        </span>
                                    ) : null;
                                })()}

                                {/* 3. Dispatch: done → dispatched (penyedia → sales konfirmasi) */}
                                {(() => {
                                    const dur = fmtDuration(order.done_at, order.dispatched_at ?? null);
                                    return dur ? (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-lg">
                                            Siap → dispatch: <span className="font-black">{dur}</span>
                                        </span>
                                    ) : null;
                                })()}

                                {/* 4. Total dari dibuat sampai selesai penyiapan (done) */}
                                {(() => {
                                    const dur = fmtDuration(order.created_at, order.done_at);
                                    return dur ? (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                            Total hingga siap: <span className="font-black">{dur}</span>
                                        </span>
                                    ) : null;
                                })()}

                            </div>
                        )}

                        {(order.delivery_distance_m || order.delivery_duration_s) && (
                            <div className="mt-3 flex gap-2">
                                {order.delivery_distance_m != null && <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-lg"> {(order.delivery_distance_m / 1000).toFixed(1)} km</span>}
                                {order.delivery_duration_s != null && <span className="text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-lg">{Math.round(order.delivery_duration_s / 60)} mnt</span>}
                            </div>
                        )}

                        {order.notes && (
                            <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                <p className="text-[10px] text-amber-600 font-semibold uppercase mb-1">Catatan dari Sales</p>
                                <p className="text-xs text-amber-900">{order.notes}</p>
                            </div>
                        )}

                        {/* Catatan dari penyedia ke sales */}
                        {order.notes_from_provider && (
                            <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                                <p className="text-[10px] text-blue-600 font-semibold uppercase mb-1">Catatan dari Penyedia Barang</p>
                                <p className="text-xs text-blue-900">{order.notes_from_provider}</p>
                            </div>
                        )}
                    </div>

                    {/* ── SIAP KIRIM: Sales perlu pilih metode pengiriman ── */}
                    {order.status === "SIAP_KIRIM" && (
                        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <Clock className="w-6 h-6 inline" />
                                <div>
                                    <p className="text-sm font-bold text-orange-800">Barang sudah disiapkan oleh penyedia!</p>
                                    <p className="text-xs text-orange-600 mt-0.5">
                                        {canDispatch
                                            ? "Pilih cara pengiriman ke customer."
                                            : "Menunggu Sales konfirmasi metode pengiriman."}
                                    </p>
                                </div>
                            </div>
                            {order.delivery_declined_at && order.delivery_decline_reason && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3 text-xs text-red-700">
                                    Pengantar sebelumnya menolak: {order.delivery_decline_reason}
                                </div>
                            )}
                            {canDispatch && (
                                <button onClick={() => setShowDispatch(true)}
                                    className="w-full h-11 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition">
                                    Pilih Metode Pengiriman
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── MENUNGGU PERSETUJUAN PENGANTAR (item 1) ── */}
                    {order.status === "MENUNGGU_PENGANTAR" && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <Clock className="w-6 h-6 inline" />
                                <div>
                                    <p className="text-sm font-bold text-yellow-800">
                                        {isAssignedDriver ? "Kamu ditugaskan mengantar pesanan ini" : "Menunggu pengantar menyetujui tugas"}
                                    </p>
                                    <p className="text-xs text-yellow-600 mt-0.5">
                                        {isAssignedDriver
                                            ? "Setujui dulu untuk mulai antar & mengaktifkan tracking."
                                            : `Menunggu ${order.delivery_user_name || "pengantar"} klik setuju.`}
                                    </p>
                                </div>
                            </div>

                            {order.delivery_user_name && (
                                <div className="bg-white border border-yellow-200 rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5">
                                    <span className="w-9 h-9 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                                        {order.delivery_user_name.charAt(0).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-yellow-600 font-semibold uppercase">Ditugaskan ke</p>
                                        <p className="text-sm font-bold text-yellow-900 truncate">{order.delivery_user_name}</p>
                                    </div>
                                    {isAssignedDriver && <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex-shrink-0">Anda</span>}
                                </div>
                            )}

                            {isAssignedDriver && (
                                <button onClick={handleAccept} disabled={actionLoading}
                                    className="w-full h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
                                    {actionLoading ? "..." : " Setuju & Terima Tugas"}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Checklist unit */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                Daftar Unit ({activeItems.length})
                                {cancelledItems.length > 0 && (
                                    <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                                        {cancelledItems.length} dibatalkan
                                    </span>
                                )}
                            </h2>
                            {order.status === "DIPROSES" && (
                                <span className="text-xs font-semibold text-blue-600">{checked}/{checkableItems.length} dicek</span>
                            )}
                        </div>
                        <div className="space-y-2">
                            {order.preparation_items.map(it => {
                                const interactive = order.status === "DIPROSES" && canDone && !it.is_cancelled && !it.sold_elsewhere;
                                return (
                                    <div key={it.id}
                                        className={`w-full rounded-xl border transition p-3 ${it.is_cancelled ? "border-gray-200 bg-gray-50 opacity-60" : it.sold_elsewhere ? "border-red-200 bg-red-50" : it.is_checked ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"}`}>
                                        <div className="flex items-center gap-3">
                                            <button type="button" disabled={!interactive} onClick={() => toggleItem(it)}
                                                className={`flex items-center gap-3 flex-1 min-w-0 text-left ${interactive ? "cursor-pointer" : "cursor-default"}`}>
                                                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${it.is_checked && !it.is_cancelled ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"}`}>
                                                    {it.is_checked && !it.is_cancelled && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className={`font-mono text-sm font-bold text-gray-800 ${it.is_cancelled ? "line-through" : ""}`}>{it.serial_number}</p>
                                                    {it.laptop_name && <p className="text-xs text-gray-500 truncate">{it.laptop_name}</p>}
                                                    {it.laptop_spec && (it.laptop_spec.cpu || it.laptop_spec.ram || it.laptop_spec.storage || it.laptop_spec.gpu) && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {it.laptop_spec.cpu && <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">{it.laptop_spec.cpu}</span>}
                                                            {it.laptop_spec.ram && <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">{it.laptop_spec.ram}</span>}
                                                            {it.laptop_spec.storage && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">{it.laptop_spec.storage}</span>}
                                                            {it.laptop_spec.gpu && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">{it.laptop_spec.gpu}</span>}
                                                        </div>
                                                    )}
                                                    {it.is_cancelled && (
                                                        <p className="text-[10px] text-red-500 mt-0.5">
                                                            Dibatalkan{it.cancelled_by_name ? ` oleh ${it.cancelled_by_name}` : ""}{it.cancel_reason ? ` — ${it.cancel_reason}` : ""}
                                                        </p>
                                                    )}
                                                </div>
                                            </button>
                                            {it.is_cancelled ? (
                                                <span className="flex-shrink-0 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Batal</span>
                                            ) : canCancelItem ? (
                                                <button type="button" onClick={() => setCancelItemTarget(it)}
                                                    className="flex-shrink-0 text-[11px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition">
                                                    Batalkan
                                                </button>
                                            ) : null}
                                        </div>
                                        {/* Unit ini kedeteksi sudah dibayar lewat pesanan/transaksi LAIN — bisa
                                            terjadi karena SN yang sama sengaja boleh dipakai di lebih dari 1
                                            penyiapan sekaligus (lihat units/search-sn). Provider tidak bisa
                                            centang unit ini (interactive = false di atas); harus klik
                                            "Batalkan" supaya order ini tidak macet di "Tandai Siap Kirim". */}
                                        {it.sold_elsewhere && !it.is_cancelled && (
                                            <div className="mt-2 flex items-start gap-1.5 bg-red-100 border border-red-200 rounded-lg px-2.5 py-1.5">
                                                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                                <p className="text-[11px] text-red-700 font-semibold">
                                                    Sudah dibayar via{" "}
                                                    {it.sold_elsewhere.preparation_order_number && it.sold_elsewhere.preparation_id ? (
                                                        <Link
                                                            href={`/dashboard/preparation/${it.sold_elsewhere.preparation_id}`}
                                                            className="underline hover:text-red-900"
                                                        >
                                                            pesanan {it.sold_elsewhere.preparation_order_number}
                                                        </Link>
                                                    ) : (
                                                        `invoice ${it.sold_elsewhere.invoice_number}`
                                                    )}
                                                    . Klik "Batalkan" unit ini kalau tidak jadi diproses di sini.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Penyedia: done button */}
                        {order.status === "DIPROSES" && canDone && (
                            <button onClick={() => setShowDone(true)} disabled={!allChecked}
                                className="w-full mt-4 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                                {allChecked ? " Tandai Siap Kirim" : `Cek semua unit dulu (${checked}/${checkableItems.length})`}
                            </button>
                        )}
                    </div>

                    {/* ── LIVE TRACKING PENGANTARAN ── */}
                    {(isDeliveringGo || isReturning) && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-3 gap-2">
                                <h2 className="text-sm font-bold text-gray-800"> Live Tracking {isReturning ? "Pulang" : "Pengantaran"}</h2>
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                    {isAssignedDriver ? (
                                        <>
                                            {tracker.bufferedCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"> {tracker.bufferedCount} tertahan</span>
                                            )}
                                            {tracker.wakeLockActive && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"> Layar aktif</span>
                                            )}
                                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${tracker.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : tracker.status === "NO_PERMISSION" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${tracker.status === "ACTIVE" ? "bg-emerald-500 animate-pulse" : tracker.status === "NO_PERMISSION" ? "bg-red-500" : "bg-amber-500"}`} />
                                                {tracker.status === "ACTIVE" ? "Live" : tracker.status === "ACQUIRING" ? "Cari GPS" : tracker.status === "HIDDEN" ? "Dijeda" : tracker.status === "NO_PERMISSION" ? "Izin off" : tracker.status === "NO_SIGNAL" ? "No GPS" : tracker.status === "OFFLINE" ? "Offline" : "Stop"}
                                            </span>
                                        </>
                                    ) : (
                                        <TrackingStatusBadge order={order} />
                                    )}
                                </div>
                            </div>

                            {/* Status detail buat pengantar */}
                            {isAssignedDriver && tracker.status !== "ACTIVE" && (
                                <div className={`mb-3 rounded-xl px-3 py-2.5 text-xs border ${tracker.status === "NO_PERMISSION" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                                    <p className="font-bold">{tracker.statusLabel}</p>
                                    {tracker.status === "HIDDEN" && <p className="mt-0.5 opacity-80">Buka lagi app ini & jangan kunci layar biar lokasi terus terkirim.</p>}
                                    {tracker.status === "NO_PERMISSION" && <p className="mt-0.5 opacity-80">Aktifkan izin lokasi: Setelan → Situs → Lokasi → Izinkan, lalu refresh.</p>}
                                    {tracker.status === "NO_SIGNAL" && <p className="mt-0.5 opacity-80">Pindah ke area terbuka & pastikan GPS HP nyala.</p>}
                                    {tracker.status === "OFFLINE" && <p className="mt-0.5 opacity-80">Lokasi disimpan otomatis & dikirim ulang saat internet balik.</p>}
                                </div>
                            )}

                            {order.delivery_user_name && (
                                <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5">
                                    <span className="w-9 h-9 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                                        {order.delivery_user_name.charAt(0).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-violet-500 font-semibold uppercase">Pengantar</p>
                                        <p className="text-sm font-bold text-violet-800 truncate">{order.delivery_user_name}</p>
                                    </div>
                                    {isAssignedDriver && <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex-shrink-0">Anda</span>}
                                </div>
                            )}

                            <DeliveryMap points={points} routeLine={routeLine} destination={dest} height={380} />

                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center">
                                    <p className="text-[10px] text-blue-400 font-semibold uppercase">Kecepatan</p>
                                    <p className="text-lg font-black text-blue-700 tabular-nums">{speedKmh != null ? `${Math.round(speedKmh)}` : "—"}<span className="text-[10px] font-bold"> km/j</span></p>
                                </div>
                                <div className="bg-[#1a1a2e] rounded-xl p-2.5 text-center">
                                    <p className="text-[10px] text-gray-300 font-semibold uppercase">Durasi</p>
                                    <p className="text-lg font-black text-white tabular-nums">{fmtElapsed(elapsedMs)}</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase">Titik</p>
                                    <p className="text-lg font-black text-gray-700 tabular-nums">{points.length}</p>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                                    <p className="text-[10px] text-emerald-400 font-semibold uppercase">Fase</p>
                                    <p className="text-sm font-black text-emerald-700 mt-1">{isReturning ? "Pulang" : "Antar"}</p>
                                </div>
                            </div>

                            {canVoice && userId && (
                                <DeliveryVoiceHT orderId={order.id} userId={userId} userName={userName} userRole={userRole ?? ""} canTalk={canVoice} canTarget={canTargetVoice} />
                            )}

                            {isAssignedDriver && (
                                <div className="mt-3 space-y-2">
                                    {isDeliveringGo && !order.delivery_started_at && (
                                        <button
                                            onClick={() => {
                                                if (!scheduledReady) {
                                                    alert(`Belum waktunya. Barang ini dijadwalkan diantar ${fmtDate(order.scheduled_delivery_date!)}.`);
                                                    return;
                                                }
                                                setShowStart(true);
                                            }}
                                            className="w-full h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-bold hover:bg-[#16213e] transition">
                                            Atur Tujuan & Mulai Antar
                                        </button>
                                    )}
                                    {isDeliveringGo && order.delivery_started_at && (
                                        <div className="flex gap-2">
                                            {!tracker.isTracking && <button onClick={tracker.startWatch} className="flex-1 h-11 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition"> Lanjut Kirim Lokasi</button>}                                            <button onClick={completeDelivery} disabled={actionLoading} className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
                                                {actionLoading ? "..." : " Sampai ke Customer"}
                                            </button>
                                        </div>
                                    )}
                                    {isReturning && (
                                        <button onClick={() => doReturnAction("RETURN_COMPLETE")} disabled={actionLoading} className="w-full h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
                                            {actionLoading ? "..." : " Sudah Sampai Toko"}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── KURIR ── */}
                    {order.status === "DIKIRIM" && order.delivery_method === "KURIR" && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h2 className="text-sm font-bold text-gray-800 mb-3"> Pengiriman via Kurir</h2>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500">Jasa Kurir</span><span className="font-bold">{order.courier_service || "—"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">No. Resi</span><span className="font-mono font-bold">{order.courier_tracking_number || "—"}</span></div>
                                {order.courier_note && <div className="flex justify-between"><span className="text-gray-500">Catatan</span><span>{order.courier_note}</span></div>}
                            </div>
                            {canDeliver && (
                                <button onClick={completeDelivery} disabled={actionLoading} className="w-full mt-4 h-11 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
                                    {actionLoading ? "..." : " Tandai Sudah Terkirim"}
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── SELESAI ── */}
                    {order.status === "SELESAI" && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                            <div className="flex justify-center mb-2"><Inbox className="w-8 h-8 opacity-50" /></div>
                            <p className="text-sm font-bold text-emerald-800">Barang sudah sampai ke customer</p>
                            <p className="text-xs text-emerald-600 mt-1">
                                {order.delivery_method === "DIAMBIL_CUSTOMER" ? "Diambil langsung oleh customer"
                                    : order.delivery_method === "PENGANTARAN" ? `Diantar oleh ${order.delivery_user_name || "pengantaran"}`
                                        : `Dikirim via ${order.courier_service || "kurir"}`}
                                {order.delivered_at && ` · ${fmtFull(order.delivered_at)}`}
                            </p>

                            {order.delivery_method === "PENGANTARAN" && isAssignedDriver && !order.returned_at && (
                                <div className="mt-4">
                                    {!order.return_started_at
                                        ? <button onClick={() => doReturnAction("RETURN_START")} disabled={actionLoading} className="inline-flex items-center gap-2 h-10 px-5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition disabled:opacity-50">
                                            {actionLoading ? "..." : " Mulai Perjalanan Pulang"}
                                        </button>
                                        : <span className="text-xs text-orange-600 font-semibold">Sedang dalam perjalanan pulang</span>}
                                </div>
                            )}

                            {order.returned_at && (
                                <p className="text-[11px] text-gray-400 mt-2">
                                    Pengantar kembali ke toko · {fmtFull(order.returned_at)}
                                </p>
                            )}

                            <div className="mt-4">
                                {order.transaction_invoice ? (
                                    <Link href={`/receipt/${order.transaction_invoice}`} className="inline-flex items-center gap-2 h-10 px-5 bg-emerald-700 text-white rounded-xl text-sm font-bold hover:bg-emerald-800 transition">
                                        Lihat Transaksi →
                                    </Link>
                                ) : allSoldElsewhere && soldElsewhereInvoice ? (
                                    <>
                                        <Link href={`/receipt/${soldElsewhereInvoice}`} className="inline-flex items-center gap-2 h-10 px-5 bg-emerald-700 text-white rounded-xl text-sm font-bold hover:bg-emerald-800 transition">
                                            Lihat Transaksi →
                                        </Link>
                                        <p className="text-[11px] text-gray-400 mt-2">
                                            Semua unit di pesanan ini sudah terjual lewat transaksi lain.
                                        </p>
                                    </>
                                ) : (
                                    <Link href={`/payment/create?prep_id=${order.id}`} className="inline-flex items-center gap-2 h-10 px-5 bg-[#1a1a2e] text-white rounded-xl text-sm font-bold hover:bg-[#16213e] transition">
                                        Lanjut ke Pembayaran →
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── DIBATALKAN (item 4) ── */}
                    {order.status === "DIBATALKAN" && (
                        <div className="bg-gray-100 border border-gray-200 rounded-2xl p-5 text-center">
                            <div className="flex justify-center mb-2"><Inbox className="w-8 h-8 opacity-50" /></div>
                            <p className="text-sm font-bold text-gray-700">Pesanan ini dibatalkan</p>
                            {order.cancelled_by_name && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Dibatalkan oleh {order.cancelled_by_name}
                                    {order.cancelled_at && ` · ${fmtFull(order.cancelled_at)}`}
                                </p>
                            )}
                            {order.cancel_reason && (
                                <p className="text-xs text-gray-600 mt-2 bg-white border border-gray-200 rounded-xl px-3 py-2 inline-block">
                                    Alasan: {order.cancel_reason}
                                </p>
                            )}
                        </div>
                    )}
                    {canForceComplete && order.delivery_method === "PENGANTARAN" && (
                        <div className="bg-[#1a1a2e] rounded-2xl p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 inline text-white" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white">Override Supervisor</p>
                                    <p className="text-[11px] text-gray-300 mt-0.5">Khusus Admin, Kepala Sales, Kepala Zenith, Kepala Sotech & Kepala Onpoint — pindah pengantar atau ubah status manual.</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(order.status === "DIKIRIM" || order.status === "MENUNGGU_PENGANTAR") && (
                                    <button onClick={forceComplete} disabled={actionLoading}
                                        className="h-9 px-4 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition disabled:opacity-50">
                                        {actionLoading ? "..." : "Selesaikan"}
                                    </button>
                                )}
                                {(order.status === "MENUNGGU_PENGANTAR" || order.status === "DIKIRIM") && (
                                    <button onClick={() => setShowReassign(true)}
                                        className="h-9 px-4 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition">
                                        Pindah Pengantar
                                    </button>
                                )}
                                <button onClick={() => setShowManualStatus(true)}
                                    className="h-9 px-4 bg-gray-600 text-white rounded-xl text-xs font-bold hover:bg-gray-700 transition">
                                    Ubah Status Manual
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {showDone && <DoneModal order={order} onClose={() => setShowDone(false)} onDone={fetchOrder} />}
            {showDispatch && <DispatchModal order={order} onClose={() => setShowDispatch(false)} onDispatched={fetchOrder} />}
            {showStart && (
                <StartTripModal
                    defaultAddress={order.delivery_address}
                    onClose={() => setShowStart(false)}
                    onConfirm={async p => { await handleStartTrip(p); setShowStart(false); }}
                />
            )}
            {showReassign && (
                <ReassignModal
                    orderId={order.id}
                    currentDriverId={order.delivery_user_id}
                    currentDriverName={order.delivery_user_name}
                    onClose={() => setShowReassign(false)}
                    onReassigned={fetchOrder}
                />
            )}
            {showManualStatus && (
                <ManualStatusModal
                    orderId={order.id}
                    currentStatus={order.status}
                    hasReturnStarted={!!order.return_started_at}
                    onClose={() => setShowManualStatus(false)}
                    onChanged={fetchOrder}
                />
            )}
            {showCancel && <CancelModal order={order} onClose={() => setShowCancel(false)} onCancelled={fetchOrder} />}
            {cancelItemTarget && (
                <CancelItemModal
                    order={order}
                    item={cancelItemTarget}
                    onClose={() => setCancelItemTarget(null)}
                    onCancelled={fetchOrder}
                />
            )}
        </DashboardLayout>
    );
}