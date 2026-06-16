"use client";
// src/app/dashboard/service/done/page.tsx

import { useEffect, useState, useCallback } from "react";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import type { ServiceOrder } from "@/types/service";
import { useAuthUser } from "@/hooks/useAuthUser";
import DashboardLayout from "@/components/layout/DashboardLayout";

function formatDate(iso?: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
}

function getDuration(masuk: string, selesai?: string): string {
    const start = new Date(masuk).getTime();
    const end = selesai ? new Date(selesai).getTime() : Date.now();
    const diff = Math.floor((end - start) / 1000 / 60);
    if (diff < 60) return `${diff} mnt`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    if (h < 24) return `${h} j ${m} mnt`;
    const d = Math.floor(h / 24);
    return `${d} hr ${h % 24} j`;
}

type DialogState = {
    open: boolean;
    orderId: string;
    action: "diambil" | "tidak_jadi" | "";
    title: string;
    description: string;
    confirmLabel: string;
    confirmClass?: string;
    requireReason?: boolean;
};

const DIALOG_CLOSED: DialogState = {
    open: false, orderId: "", action: "",
    title: "", description: "", confirmLabel: "",
};

export default function DonePage() {
    const { user } = useAuthUser();
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState<DialogState>(DIALOG_CLOSED);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/service?status=DONE");
            const json = await res.json();
            if (json.success) setOrders(json.data ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const showToast = (msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const openDialog = (order: ServiceOrder, action: "diambil" | "tidak_jadi") => {
        const configs = {
            diambil: {
                title: "Konfirmasi Sudah Diambil",
                description: `Tandai laptop "${order.nama} — ${order.type_laptop}" sudah diambil oleh pelanggan?`,
                confirmLabel: "Ya, Sudah Diambil",
                confirmClass: "bg-emerald-600 hover:bg-emerald-700",
                requireReason: false,
            },
            tidak_jadi: {
                title: "Tandai Tidak Jadi",
                description: `Order "${order.nama} — ${order.type_laptop}" akan dikembalikan ke antrian dengan status TIDAK JADI. Tulis alasannya.`,
                confirmLabel: "Tandai Tidak Jadi",
                confirmClass: "bg-red-600 hover:bg-red-700",
                requireReason: true,
            },
        };
        setDialog({ open: true, orderId: order.id, action, ...configs[action] });
    };

    const handleConfirm = async (reason?: string) => {
        const res = await fetch(`/api/service/${dialog.orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: dialog.action, alasan: reason }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "Gagal memperbarui");
        setDialog(DIALOG_CLOSED);

        if (dialog.action === "diambil") {
            showToast("Laptop berhasil ditandai sudah diambil — masuk ke History.");
        } else {
            showToast("Order ditandai tidak jadi.");
        }
        fetchOrders();
    };

    return (
        <DashboardLayout>

            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-bold text-[#1a1a2e]">Selesai (Done)</h1>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {orders.length} order menunggu pengambilan
                            </p>
                        </div>
                        <button
                            onClick={fetchOrders}
                            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition"
                            title="Refresh"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
                                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-gray-600">Belum ada order selesai</p>
                            <p className="text-xs text-gray-400 mt-1">Order yang selesai dikerjakan akan muncul di sini</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            {["No", "Pelanggan", "Laptop", "Keluhan", "Masuk", "Selesai", "Total Waktu", "Dikerjakan oleh", "Status", "Aksi"].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.map(o => (
                                            <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                                                <td className="px-4 py-3 text-gray-400 text-xs font-mono">{o.no_urut}</td>
                                                <td className="px-4 py-3">
                                                    <p className="font-semibold text-gray-800">{o.nama}</p>
                                                    <p className="text-xs text-gray-400">{o.no_hp}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-700">{o.type_laptop}</p>
                                                    <p className="text-xs text-gray-400">{[o.cpu, o.ram, o.storage].filter(Boolean).join(" · ") || "—"}</p>
                                                </td>
                                                <td className="px-4 py-3 max-w-[180px]">
                                                    <p className="text-xs text-gray-600 line-clamp-2">{o.keluhan}</p>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                    {formatDate(o.tanggal_masuk)}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                    {formatDate(o.tanggal_selesai)}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                                                    {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500">
                                                    {o.dikerjakan_by_user?.name || "—"}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <ServiceStatusBadge status={o.status} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => openDialog(o, "diambil")}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition whitespace-nowrap"
                                                        >
                                                            ✓ Sudah Diambil
                                                        </button>
                                                        <button
                                                            onClick={() => openDialog(o, "tidak_jadi")}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition whitespace-nowrap"
                                                        >
                                                            Tidak Jadi
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <ServiceConfirmDialog
                    open={dialog.open}
                    title={dialog.title}
                    description={dialog.description}
                    confirmLabel={dialog.confirmLabel}
                    confirmClass={dialog.confirmClass}
                    requireReason={dialog.requireReason}
                    reasonLabel="Alasan Tidak Jadi"
                    reasonPlaceholder="Tuliskan alasan mengapa tidak jadi..."
                    onCancel={() => setDialog(DIALOG_CLOSED)}
                    onConfirm={handleConfirm}
                />

                {toast && (
                    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
                        }`}>
                        {toast.msg}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}