"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface BirthdayCustomer {
    id: string;
    customer_name: string;
    customer_phone: string | null;
    customer_birth_date: string;
    age: number;
    sales_name: string;
    sales_id: string;
    invoice_number: string;
    transaction_date: string;
}

function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
        day: "numeric", month: "long", year: "numeric",
    });
}

export default function CustomerBirthdaysPage() {
    const [customers, setCustomers] = useState<BirthdayCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState<string | null>(null);
    const [sentSet, setSentSet] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetch_ = async () => {
            setLoading(true);
            try {
                const res = await fetch("/api/transaction/customer-birthdays");
                const data = await res.json();
                if (data.success) setCustomers(data.customers);
            } catch { /* silent */ }
            finally { setLoading(false); }
        };
        fetch_();
    }, []);

    const sendWish = async (phone: string, name: string) => {
        if (!phone || sending) return;
        setSending(phone);
        try {
            const msg = [
                `🎂 Selamat Ulang Tahun, ${name}!`,
                ``,
                `Dari kami Solit 03, semoga sehat & sukses selalu! 🎉🎈`,
                ``,
                `Terima kasih sudah menjadi pelanggan setia kami. 💙`,
            ].join("\n");

            const payload = { target: phone, message: msg };
            console.log("[Birthday WA] Sending:", payload);

            const res = await fetch("/api/test-whatsapp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            console.log("[Birthday WA] Response:", data);

            if (data.success) {
                setSentSet(prev => new Set(prev).add(phone));
            } else {
                alert(`Gagal kirim WA: ${data.message || "Unknown error"}`);
            }
        } catch (err) {
            console.error("[Birthday WA] Error:", err);
            alert("Gagal mengirim pesan WhatsApp");
        } finally {
            setSending(null);
        }
    };

    const todayStr = new Date().toLocaleDateString("id-ID", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    return (
        <DashboardLayout>
            <div className="max-w-3xl mx-auto space-y-5">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl"
                        style={{ background: "linear-gradient(135deg, #fef3c7, #fbbf24)", boxShadow: "0 4px 14px rgba(251,191,36,0.35)" }}>
                        🎂
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Ulang Tahun Customer</h1>
                        <p className="text-[11px] mt-0.5" style={{ color: "#94a3b8" }}>{todayStr}</p>
                    </div>
                </div>

                {/* Content */}
                <div className="bg-white rounded-2xl overflow-hidden"
                    style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>

                    {loading ? (
                        <div className="p-8 space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
                            ))}
                        </div>
                    ) : customers.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="text-4xl mb-3">🎈</div>
                            <p className="text-sm font-bold text-slate-600">Tidak ada customer yang ulang tahun hari ini</p>
                            <p className="text-xs text-slate-400 mt-1">Data diambil dari tanggal lahir yang diisi saat transaksi</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary */}
                            <div className="px-5 py-4 flex items-center gap-3"
                                style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", borderBottom: "1px solid #f59e0b33" }}>
                                <span className="text-2xl">🎉</span>
                                <div>
                                    <p className="text-sm font-black text-amber-900">
                                        {customers.length} Customer Ulang Tahun Hari Ini!
                                    </p>
                                    <p className="text-[11px] text-amber-700 mt-0.5">
                                        Kirim ucapan untuk menjaga hubungan baik 💛
                                    </p>
                                </div>
                            </div>

                            {/* List */}
                            <div>
                                {customers.map((c, idx) => (
                                    <div key={c.id}
                                        className="px-5 py-4 hover:bg-slate-50/70 transition-colors"
                                        style={{ borderBottom: idx < customers.length - 1 ? "1px solid #f5f5fb" : "none" }}>
                                        <div className="flex items-start gap-3.5">
                                            {/* Avatar */}
                                            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                                                style={{
                                                    background: "linear-gradient(135deg, #fef3c7, #fbbf24)",
                                                    boxShadow: "0 2px 8px rgba(251,191,36,0.2)",
                                                }}>
                                                🎂
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-slate-900">{c.customer_name}</span>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                                        style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                                                        {c.age} tahun
                                                    </span>
                                                </div>
                                                {c.customer_phone && (
                                                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">📱 {c.customer_phone}</p>
                                                )}
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    🎂 {formatDate(c.customer_birth_date)}
                                                </p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    🧾 {c.invoice_number} · Sales: {c.sales_name}
                                                </p>
                                            </div>

                                            {/* Action */}
                                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                {c.customer_phone && (() => {
                                                    const phone = c.customer_phone!.replace(/\D/g, "");
                                                    const normalized = phone.startsWith("0") ? "62" + phone.slice(1) : phone.startsWith("62") ? phone : "62" + phone;
                                                    const msg = encodeURIComponent(
                                                        `🎂 Selamat Ulang Tahun, ${c.customer_name}!\n\nDari kami Solit 03, semoga sehat & sukses selalu! 🎉🎈\n\nTerima kasih sudah menjadi pelanggan setia kami. 💙`
                                                    );
                                                    return (
                                                        <a href={`https://wa.me/${normalized}?text=${msg}`} target="_blank" rel="noopener noreferrer"
                                                            className="text-[10px] font-bold text-white px-3 py-1.5 rounded-xl text-center transition hover:scale-[1.02] active:scale-95 flex items-center gap-1"
                                                            style={{
                                                                background: "linear-gradient(135deg, #25D366, #128C7E)",
                                                                boxShadow: "0 2px 8px rgba(37,211,102,0.3)",
                                                            }}>
                                                            💬 Kirim Ucapan WA
                                                        </a>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}