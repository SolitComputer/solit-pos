"use client";

import { useState, useEffect, useRef } from "react";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import ServiceDetailModal from "@/components/service/ServiceDetailModal";
import ServicePaymentModal from "@/components/service/ServicePaymentModal";
import type { ServiceOrder, ServiceStatus } from "@/types/service";
import DashboardLayout from "@/components/layout/DashboardLayout";

const DONE_STATUSES: ServiceStatus[] = ["DONE", "GAGAL_DIPERBAIKI"];

function formatDate(iso?: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
}

function getDuration(masuk: string, selesai?: string) {
    if (!selesai) return "—";
    const diff = Math.floor((new Date(selesai).getTime() - new Date(masuk).getTime()) / 60000);
    if (diff < 60) return `${diff} mnt`;
    const h = Math.floor(diff / 60);
    return h < 24 ? `${h} j ${diff % 60} mnt` : `${Math.floor(h / 24)} hr ${h % 24} j`;
}

function fmtRupiah(n?: number) {
    if (!n) return "—";
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

type DialogState = {
    open: boolean;
    orderId: string;
    action: "tidak_jadi" | "diambil_langsung" | "";
    title: string;
    description: string;
    confirmLabel: string;
    confirmClass?: string;
    requireReason?: boolean;
};
const DIALOG_CLOSED: DialogState = {
    open: false, orderId: "", action: "", title: "", description: "", confirmLabel: ""
};

// ✅ State khusus untuk pilihan diambil di GAGAL_DIPERBAIKI
type PickupChoiceState = {
    open: boolean;
    order: ServiceOrder | null;
};

function useDoneRealtime() {
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const esRef = useRef<EventSource | null>(null);
    const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchREST = async () => {
        try {
            const params = DONE_STATUSES.map(s => `status=${s}`).join("&");
            const res = await fetch(`/api/service?${params}`);
            const json = await res.json();
            if (json.success) setOrders(json.data ?? []);
        } finally { setLoading(false); }
    };

    const connect = () => {
        esRef.current?.close();
        if (typeof EventSource === "undefined") { fetchREST(); return; }
        const es = new EventSource("/api/service/stream/internal");
        esRef.current = es;
        const handle = (e: MessageEvent) => {
            try {
                const all: ServiceOrder[] = JSON.parse(e.data).orders ?? [];
                setOrders(all.filter(o => (DONE_STATUSES as string[]).includes(o.status)));
                setConnected(true); setLoading(false);
                if (fallbackRef.current) { clearInterval(fallbackRef.current); fallbackRef.current = null; }
            } catch { }
        };
        es.addEventListener("init", handle);
        es.addEventListener("update", handle);
        es.addEventListener("error", () => {
            setConnected(false); es.close(); esRef.current = null;
            if (!fallbackRef.current) fallbackRef.current = setInterval(fetchREST, 15_000);
            reconnectRef.current = setTimeout(connect, 10_000);
        });
    };

    useEffect(() => {
        fetchREST(); connect();
        return () => {
            esRef.current?.close();
            if (fallbackRef.current) clearInterval(fallbackRef.current);
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
        };
    }, []); // eslint-disable-line

    const refresh = () => { setLoading(true); fetchREST(); };
    return { orders, loading, connected, refresh };
}

export default function DonePage() {
    const { orders, loading, connected, refresh } = useDoneRealtime();
    const [dialog, setDialog] = useState<DialogState>(DIALOG_CLOSED);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [paymentOrder, setPaymentOrder] = useState<ServiceOrder | null>(null);
    // ✅ State untuk pilihan modal di GAGAL_DIPERBAIKI
    const [pickupChoice, setPickupChoice] = useState<PickupChoiceState>({ open: false, order: null });
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    const showToast = (msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // ✅ Routing tombol "Diambil" berdasarkan status order
    const handleDiambilClick = (order: ServiceOrder) => {
        if (order.status === "DONE") {
            // DONE → langsung buka payment modal
            setPaymentOrder(order);
        } else {
            // GAGAL_DIPERBAIKI → tampilkan pilihan dulu
            setPickupChoice({ open: true, order });
        }
    };

    // ✅ Dari pilihan modal GAGAL: pilih "Dengan Payment"
    const handleGagalWithPayment = () => {
        if (!pickupChoice.order) return;
        setPaymentOrder(pickupChoice.order);
        setPickupChoice({ open: false, order: null });
    };

    // ✅ Dari pilihan modal GAGAL: pilih "Langsung Ambil" (tanpa payment)
    const handleGagalWithoutPayment = () => {
        if (!pickupChoice.order) return;
        setDialog({
            open: true,
            orderId: pickupChoice.order.id,
            action: "diambil_langsung",
            title: "Konfirmasi Laptop Diambil",
            description: `Laptop "${pickupChoice.order.nama} — ${pickupChoice.order.type_laptop}" dikonfirmasi sudah diambil tanpa payment?`,
            confirmLabel: "Ya, Sudah Diambil",
            confirmClass: "bg-emerald-600 hover:bg-emerald-700",
        });
        setPickupChoice({ open: false, order: null });
    };

    // Handler untuk dialog konfirmasi (tidak_jadi & diambil_langsung)
    const handleConfirmDialog = async () => {
        const res = await fetch(`/api/service/${dialog.orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: dialog.action === "diambil_langsung" ? "diambil" : dialog.action,
                // Tidak kirim payment fields → backend akan skip payment
            }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "Gagal");
        setDialog(DIALOG_CLOSED);
        showToast(
            dialog.action === "diambil_langsung"
                ? "Laptop berhasil ditandai sudah diambil."
                : "Order ditandai tidak jadi."
        );
        refresh();
    };

    const openTidakJadiDialog = (order: ServiceOrder) => {
        setDialog({
            open: true,
            orderId: order.id,
            action: "tidak_jadi",
            title: "Tandai Tidak Jadi",
            description: `Order "${order.nama}" akan masuk ke History dengan status TIDAK JADI. Tulis alasannya.`,
            confirmLabel: "Tandai Tidak Jadi",
            confirmClass: "bg-red-600 hover:bg-red-700",
            requireReason: true,
        });
    };

    // ✅ Payment confirm — untuk DONE (action: diambil + payment)
    const handlePaymentConfirm = async (payment: {
        payment_amount: number;
        payment_note: string;
        payment_method: "CASH" | "TRANSFER" | "QRIS";
        hasil_analisa?: string;
    }) => {
        if (!paymentOrder) return;
        const res = await fetch(`/api/service/${paymentOrder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "diambil", ...payment }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "Gagal");
        setPaymentOrder(null);
        showToast("Laptop berhasil ditandai sudah diambil & payment tersimpan!");
        refresh();
    };

    const doneOrders = orders.filter(o => o.status === "DONE");
    const gagalOrders = orders.filter(o => o.status === "GAGAL_DIPERBAIKI");

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-bold text-[#1a1a2e]">Selesai & Gagal</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-gray-400">{orders.length} order menunggu</p>
                                <span className="text-gray-300">·</span>
                                {connected ? (
                                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                        <span className="relative flex h-1.5 w-1.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                        </span>
                                        Live
                                    </span>
                                ) : <span className="text-xs text-gray-400">Polling</span>}
                            </div>
                        </div>
                        <button onClick={refresh} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {loading ? (
                        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-gray-100" />)}</div>
                    ) : orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
                                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-gray-600">Belum ada order selesai</p>
                        </div>
                    ) : (
                        <>
                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl px-4 py-3 border bg-green-50 border-green-200 text-green-700">
                                    <p className="text-2xl font-bold">{doneOrders.length}</p>
                                    <p className="text-xs font-medium mt-0.5 opacity-80">Selesai (menunggu diambil)</p>
                                </div>
                                <div className="rounded-xl px-4 py-3 border bg-rose-50 border-rose-200 text-rose-700">
                                    <p className="text-2xl font-bold">{gagalOrders.length}</p>
                                    <p className="text-xs font-medium mt-0.5 opacity-80">Gagal Diperbaiki</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-100">
                                                {["No", "Pelanggan", "Laptop", "Selesai", "Total Waktu", "Oleh", "Payment", "Status", "Aksi"].map(h => (
                                                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orders.map(o => (
                                                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer" onClick={() => setDetailId(o.id)}>
                                                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{o.no_urut}</td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-semibold text-gray-800">{o.nama}</p>
                                                        <p className="text-xs text-gray-400">{o.no_hp}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-gray-700">{o.type_laptop}</p>
                                                        <p className="text-xs text-gray-400">{[o.cpu, o.ram].filter(Boolean).join(" · ") || "—"}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(o.tanggal_selesai)}</td>
                                                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{getDuration(o.tanggal_masuk, o.tanggal_selesai)}</td>
                                                    <td className="px-4 py-3 text-xs text-gray-500">{o.dikerjakan_by_user?.name || "—"}</td>
                                                    <td className="px-4 py-3">
                                                        {o.payment_amount ? (
                                                            <div>
                                                                <p className="text-xs font-semibold text-emerald-700">{fmtRupiah(o.payment_amount)}</p>
                                                                <p className="text-[10px] text-gray-400">{o.payment_method || "CASH"}</p>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-orange-500">
                                                                {o.status === "GAGAL_DIPERBAIKI" ? "—" : "Konfirmasi saat diambil"}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3"><ServiceStatusBadge status={o.status} /></td>
                                                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center gap-1.5">
                                                            {/* ✅ Satu tombol, routing berdasarkan status */}
                                                            <button
                                                                onClick={() => handleDiambilClick(o)}
                                                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition whitespace-nowrap"
                                                            >
                                                                ✓ Diambil
                                                            </button>
                                                            {o.status === "DONE" && (
                                                                <button
                                                                    onClick={() => openTidakJadiDialog(o)}
                                                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition whitespace-nowrap"
                                                                >
                                                                    Tidak Jadi
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">Klik baris untuk melihat detail</p>
                            </div>
                        </>
                    )}
                </div>

                <ServiceDetailModal orderId={detailId} onClose={() => setDetailId(null)} />

                {/* Dialog: Tidak Jadi & Diambil Langsung */}
                <ServiceConfirmDialog
                    open={dialog.open}
                    title={dialog.title}
                    description={dialog.description}
                    confirmLabel={dialog.confirmLabel}
                    confirmClass={dialog.confirmClass}
                    requireReason={dialog.requireReason}
                    reasonLabel="Alasan Tidak Jadi"
                    reasonPlaceholder="Tuliskan alasannya..."
                    onCancel={() => setDialog(DIALOG_CLOSED)}
                    onConfirm={handleConfirmDialog}
                />

                {/* Payment modal — untuk DONE */}
                <ServicePaymentModal
                    open={!!paymentOrder}
                    order={paymentOrder}
                    onClose={() => setPaymentOrder(null)}
                    onConfirm={handlePaymentConfirm}
                />

                {/* ✅ Pickup choice modal — khusus GAGAL_DIPERBAIKI */}
                {pickupChoice.open && pickupChoice.order && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setPickupChoice({ open: false, order: null })}
                        />
                        <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-base font-bold text-[#1a1a2e]">Konfirmasi Pengambilan</h2>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {pickupChoice.order.nama} · {pickupChoice.order.type_laptop}
                                </p>
                            </div>

                            {/* Body */}
                            <div className="px-6 py-5">
                                {/* Info status gagal */}
                                <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-100 rounded-xl mb-5">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-500 mt-0.5 flex-shrink-0">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <p className="text-xs text-rose-700">
                                        Laptop ini <strong>gagal diperbaiki</strong>. Apakah ada biaya diagnosa / penanganan yang perlu ditagihkan?
                                    </p>
                                </div>

                                <p className="text-sm text-gray-600 mb-4">Pilih opsi pengambilan:</p>

                                <div className="space-y-2.5">
                                    {/* Opsi dengan payment */}
                                    <button
                                        onClick={handleGagalWithPayment}
                                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition text-left group"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center flex-shrink-0 transition">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-emerald-700">
                                                <line x1="12" y1="1" x2="12" y2="23" />
                                                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">Ada Biaya</p>
                                            <p className="text-xs text-gray-400">Isi nominal biaya diagnosa / penanganan</p>
                                        </div>
                                    </button>

                                    {/* Opsi tanpa payment */}
                                    <button
                                        onClick={handleGagalWithoutPayment}
                                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition text-left group"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center flex-shrink-0 transition">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-gray-600">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">Gratis / Tanpa Biaya</p>
                                            <p className="text-xs text-gray-400">Laptop langsung dikembalikan ke pelanggan</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 pb-5">
                                <button
                                    onClick={() => setPickupChoice({ open: false, order: null })}
                                    className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
                                >
                                    Batal
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {toast && (
                    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
                        {toast.msg}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}