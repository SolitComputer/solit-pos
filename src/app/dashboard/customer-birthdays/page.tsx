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

function getInitials(name: string) {
    return name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase();
}

const AGE_COLORS = [
    { bg: "linear-gradient(135deg, #fbbf24, #f59e0b)", shadow: "rgba(251,191,36,0.4)", text: "#78350f" },
    { bg: "linear-gradient(135deg, #34d399, #10b981)", shadow: "rgba(16,185,129,0.4)", text: "#064e3b" },
    { bg: "linear-gradient(135deg, #818cf8, #6366f1)", shadow: "rgba(99,102,241,0.4)", text: "#1e1b4b" },
    { bg: "linear-gradient(135deg, #f472b6, #ec4899)", shadow: "rgba(236,72,153,0.4)", text: "#500724" },
    { bg: "linear-gradient(135deg, #38bdf8, #0ea5e9)", shadow: "rgba(14,165,233,0.4)", text: "#0c4a6e" },
];

function getAgeColor(idx: number) {
    return AGE_COLORS[idx % AGE_COLORS.length];
}

export default function CustomerBirthdaysPage() {
    const [customers, setCustomers] = useState<BirthdayCustomer[]>([]);
    const [loading, setLoading] = useState(true);

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

    const todayFull = new Date().toLocaleDateString("id-ID", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const todayShort = new Date().toLocaleDateString("id-ID", {
        day: "numeric", month: "short", year: "numeric",
    });

    return (
        <DashboardLayout>
            <div className="min-h-screen" style={{ background: "#f8f7ff" }}>
                <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">

                    {/* ── Header ── */}
                    <div
                        className="relative overflow-hidden rounded-2xl px-4 sm:px-6 py-5 sm:py-6"
                        style={{
                            background: "linear-gradient(135deg, #1a1535 0%, #2d2660 60%, #3b3285 100%)",
                            boxShadow: "0 8px 32px rgba(26,21,53,0.22)",
                        }}
                    >
                        {/* Decorative blobs */}
                        <div
                            className="absolute -top-6 -right-6 w-32 h-32 rounded-full opacity-20 pointer-events-none"
                            style={{ background: "radial-gradient(circle, #fbbf24 0%, transparent 70%)" }}
                        />
                        <div
                            className="absolute -bottom-4 left-10 w-20 h-20 rounded-full opacity-10 pointer-events-none"
                            style={{ background: "radial-gradient(circle, #818cf8 0%, transparent 70%)" }}
                        />

                        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                            <div className="flex items-center gap-3.5">
                                {/* Icon */}
                                <div
                                    className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                                    style={{
                                        background: "linear-gradient(135deg, #fde68a, #fbbf24)",
                                        boxShadow: "0 4px 16px rgba(251,191,36,0.4)",
                                    }}
                                >
                                    
                                </div>
                                <div>
                                    <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
                                        Ulang Tahun Customer
                                    </h1>
                                    <p className="text-[11px] sm:text-xs mt-0.5 font-medium" style={{ color: "#a5b4fc" }}>
                                        {todayFull}
                                    </p>
                                </div>
                            </div>

                            {/* Today badge */}
                            <div
                                className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                                style={{
                                    background: "rgba(251,191,36,0.15)",
                                    border: "1px solid rgba(251,191,36,0.3)",
                                }}
                            >
                                <span className="text-[10px] sm:text-[11px] font-bold" style={{ color: "#fde68a" }}>
                                     {todayShort}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── Content ── */}
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-24 rounded-2xl animate-pulse"
                                    style={{ background: "linear-gradient(90deg, #e2e2f0 0%, #ededf9 50%, #e2e2f0 100%)" }}
                                />
                            ))}
                        </div>
                    ) : customers.length === 0 ? (
                        /* ── Empty State ── */
                        <div
                            className="rounded-2xl overflow-hidden"
                            style={{
                                background: "#fff",
                                border: "1px solid #ebebf8",
                                boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                            }}
                        >
                            <div className="text-center py-16 px-6">
                                <div className="text-5xl mb-4"></div>
                                <p className="text-sm font-black text-slate-700">
                                    Tidak ada customer yang ulang tahun hari ini
                                </p>
                                <p className="text-xs text-slate-400 mt-2 leading-relaxed max-w-xs mx-auto">
                                    Data diambil dari tanggal lahir yang diisi saat transaksi
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ── Summary Banner ── */}
                            <div
                                className="flex items-center gap-3 px-4 sm:px-5 py-3.5 rounded-2xl"
                                style={{
                                    background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                                    border: "1px solid rgba(245,158,11,0.25)",
                                    boxShadow: "0 2px 12px rgba(245,158,11,0.12)",
                                }}
                            >
                                <span className="text-2xl flex-shrink-0"></span>
                                <div>
                                    <p className="text-sm font-black text-amber-900">
                                        {customers.length} Customer Ulang Tahun Hari Ini!
                                    </p>
                                    <p className="text-[11px] text-amber-700 mt-0.5">
                                        Kirim ucapan untuk menjaga hubungan baik 
                                    </p>
                                </div>
                            </div>

                            {/* ── Customer List ── */}
                            <div
                                className="rounded-2xl overflow-hidden"
                                style={{
                                    background: "#fff",
                                    border: "1px solid #ebebf8",
                                    boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
                                }}
                            >
                                {customers.map((c, idx) => {
                                    const color = getAgeColor(idx);
                                    const phone = c.customer_phone?.replace(/\D/g, "") ?? "";
                                    const normalized = phone.startsWith("0")
                                        ? "62" + phone.slice(1)
                                        : phone.startsWith("62")
                                        ? phone
                                        : "62" + phone;
                                    const waMsg = encodeURIComponent(
                                        ` Selamat Ulang Tahun, ${c.customer_name}!\n\nDari kami Solit 03, semoga sehat & sukses selalu! \n\nTerima kasih sudah menjadi pelanggan setia kami. `
                                    );
                                    const waLink = `https://wa.me/${normalized}?text=${waMsg}`;

                                    return (
                                        <div
                                            key={c.id}
                                            className="relative transition-colors duration-150"
                                            style={{
                                                borderBottom:
                                                    idx < customers.length - 1 ? "1px solid #f0f0fa" : "none",
                                            }}
                                        >
                                            {/* Subtle left accent stripe */}
                                            <div
                                                className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full"
                                                style={{ background: color.bg }}
                                            />

                                            <div className="px-4 sm:px-6 py-4 sm:py-5 pl-5 sm:pl-7 flex items-start gap-3 sm:gap-4 hover:bg-slate-50/60 transition-colors duration-150">

                                                {/* ── Avatar ── */}
                                                <div
                                                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0"
                                                    style={{
                                                        background: color.bg,
                                                        boxShadow: `0 4px 12px ${color.shadow}`,
                                                        color: color.text,
                                                        letterSpacing: "0.02em",
                                                    }}
                                                >
                                                    {getInitials(c.customer_name)}
                                                </div>

                                                {/* ── Info ── */}
                                                <div className="flex-1 min-w-0">
                                                    {/* Name + age */}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-black text-slate-900 leading-snug">
                                                            {c.customer_name}
                                                        </span>
                                                        <span
                                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 flex-shrink-0"
                                                            style={{
                                                                background: color.bg,
                                                                color: color.text,
                                                                boxShadow: `0 2px 6px ${color.shadow}`,
                                                            }}
                                                        >
                                                             {c.age} tahun
                                                        </span>
                                                    </div>

                                                    {/* Details grid */}
                                                    <div className="mt-2 space-y-1">
                                                        {c.customer_phone && (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px]"></span>
                                                                <span className="text-[11px] font-semibold text-slate-500">
                                                                    {c.customer_phone}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px]"></span>
                                                            <span className="text-[11px] text-slate-400">
                                                                {formatDate(c.customer_birth_date)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-[10px]"></span>
                                                            <span className="text-[11px] text-slate-400">
                                                                {c.invoice_number}
                                                            </span>
                                                            <span className="text-slate-300 text-[10px]">·</span>
                                                            <span className="text-[11px] text-slate-400">
                                                                Sales: <span className="font-semibold text-slate-500">{c.sales_name}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* ── WA Button ── */}
                                                {c.customer_phone && (
                                                    <div className="flex-shrink-0 self-center">
                                                        <a
                                                            href={waLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white px-3 py-2 rounded-xl transition-transform duration-150 hover:scale-[1.03] active:scale-95 whitespace-nowrap"
                                                            style={{
                                                                background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                                                                boxShadow: "0 4px 12px rgba(37,211,102,0.35)",
                                                            }}
                                                        >
                                                            {/* Icon only on mobile, text+icon on desktop */}
                                                            <span className="hidden sm:inline"> Kirim WA</span>
                                                            <span className="sm:hidden text-base leading-none"></span>
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ── Footer note ── */}
                            <p className="text-center text-[11px] text-slate-400 pb-2">
                                Data berdasarkan tanggal lahir yang diisi saat transaksi
                            </p>
                        </>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}