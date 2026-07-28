"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Cake, CalendarDays, PartyPopper, Gift, Phone, Receipt, MessageCircle, Sparkles, Clock, History } from "lucide-react";

interface BirthdayCustomer {
    id: string;
    customer_name: string;
    customer_phone: string | null;
    customer_birth_date: string;
    age: number;
    diff_days: number;
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

function getStatusBadge(diffDays: number) {
    if (diffDays === 0) {
        return {
            label: "Hari Ini!",
            icon: Cake,
            bg: "linear-gradient(135deg, #fbbf24, #f59e0b)",
            text: "#78350f",
            shadow: "rgba(251,191,36,0.4)",
        };
    }
    if (diffDays > 0) {
        return {
            label: `${diffDays} Hari Lagi (H-${diffDays})`,
            icon: Clock,
            bg: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
            text: "#0c4a6e",
            shadow: "rgba(14,165,233,0.4)",
        };
    }
    const daysAgo = Math.abs(diffDays);
    return {
        label: `${daysAgo} Hari Lalu (H+${daysAgo})`,
        icon: History,
        bg: "linear-gradient(135deg, #a78bfa, #8b5cf6)",
        text: "#2e1065",
        shadow: "rgba(139,92,246,0.4)",
    };
}

function getWaLink(c: BirthdayCustomer) {
    if (!c.customer_phone) return "";
    const phone = c.customer_phone.replace(/\D/g, "");
    const normalized = phone.startsWith("0")
        ? "62" + phone.slice(1)
        : phone.startsWith("62")
        ? phone
        : "62" + phone;

    let text = "";
    if (c.diff_days === 0) {
        text = `Selamat Ulang Tahun, ${c.customer_name}!\n\nDari kami Solit 03, mengucapkan selamat ulang tahun yang ke-${c.age}! Semoga panjang umur, sehat & sukses selalu!\n\nTerima kasih telah menjadi pelanggan setia kami.`;
    } else if (c.diff_days > 0) {
        text = `Halo ${c.customer_name}, sebentar lagi ulang tahun yang ke-${c.age} nih pada tanggal ${formatDate(c.customer_birth_date)}!\n\nDari kami Solit 03, mengucapkan selamat mendahului! Semoga segala harapan tercapai & sehat selalu.\n\nTerima kasih telah menjadi pelanggan setia kami.`;
    } else {
        text = `Halo ${c.customer_name}, Selamat Ulang Tahun yang ke-${c.age}!\n\nMohon maaf kami sedikit terlambat mengucapkan. Dari kami Solit 03, semoga panjang umur, sehat & sukses selalu!\n\nTerima kasih telah menjadi pelanggan setia kami.`;
    }

    return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

export default function CustomerBirthdaysPage() {
    const [customers, setCustomers] = useState<BirthdayCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"ALL" | "TODAY" | "UPCOMING" | "PASSED">("ALL");

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

    const counts = useMemo(() => {
        const todayCount = customers.filter(c => c.diff_days === 0).length;
        const upcomingCount = customers.filter(c => c.diff_days > 0).length;
        const passedCount = customers.filter(c => c.diff_days < 0).length;
        return { total: customers.length, today: todayCount, upcoming: upcomingCount, passed: passedCount };
    }, [customers]);

    const filteredCustomers = useMemo(() => {
        if (filter === "TODAY") return customers.filter(c => c.diff_days === 0);
        if (filter === "UPCOMING") return customers.filter(c => c.diff_days > 0);
        if (filter === "PASSED") return customers.filter(c => c.diff_days < 0);
        return customers;
    }, [customers, filter]);

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
                                    <Cake size={24} style={{ color: "#78350f" }} />
                                </div>
                                <div>
                                    <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
                                        Ulang Tahun Customer
                                    </h1>
                                    <p className="text-[11px] sm:text-xs mt-0.5 font-medium" style={{ color: "#a5b4fc" }}>
                                        Mendeteksi ultah H-3 s.d H+3 (3 hari sebelum &amp; sesudah) · {todayFull}
                                    </p>
                                </div>
                            </div>

                            {/* Range badge */}
                            <div
                                className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                                style={{
                                    background: "rgba(251,191,36,0.15)",
                                    border: "1px solid rgba(251,191,36,0.3)",
                                }}
                            >
                                <span className="text-[10px] sm:text-[11px] font-bold inline-flex items-center gap-1" style={{ color: "#fde68a" }}>
                                    <Sparkles size={12} /> H-3 s.d H+3
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── Summary & Filter Tabs ── */}
                    {!loading && customers.length > 0 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-white rounded-xl border border-amber-200 p-3 text-center shadow-xs">
                                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Hari Ini</p>
                                    <p className="text-lg font-black text-amber-900 mt-0.5">{counts.today}</p>
                                </div>
                                <div className="bg-white rounded-xl border border-sky-200 p-3 text-center shadow-xs">
                                    <p className="text-[10px] font-bold text-sky-700 uppercase tracking-wider">3 Hari Lagi</p>
                                    <p className="text-lg font-black text-sky-900 mt-0.5">{counts.upcoming}</p>
                                </div>
                                <div className="bg-white rounded-xl border border-purple-200 p-3 text-center shadow-xs">
                                    <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">3 Hari Lalu</p>
                                    <p className="text-lg font-black text-purple-900 mt-0.5">{counts.passed}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                                <button
                                    onClick={() => setFilter("ALL")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap ${
                                        filter === "ALL"
                                            ? "bg-[#1a1535] text-white shadow-sm"
                                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                                    }`}
                                >
                                    Semua ({counts.total})
                                </button>
                                <button
                                    onClick={() => setFilter("TODAY")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap ${
                                        filter === "TODAY"
                                            ? "bg-amber-500 text-white shadow-sm"
                                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                                    }`}
                                >
                                    Hari Ini ({counts.today})
                                </button>
                                <button
                                    onClick={() => setFilter("UPCOMING")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap ${
                                        filter === "UPCOMING"
                                            ? "bg-sky-500 text-white shadow-sm"
                                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                                    }`}
                                >
                                    Akan Datang ({counts.upcoming})
                                </button>
                                <button
                                    onClick={() => setFilter("PASSED")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap ${
                                        filter === "PASSED"
                                            ? "bg-purple-500 text-white shadow-sm"
                                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                                    }`}
                                >
                                    Baru Lewat ({counts.passed})
                                </button>
                            </div>
                        </div>
                    )}

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
                    ) : filteredCustomers.length === 0 ? (
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
                                <div className="mb-4 flex justify-center"><Cake size={48} className="text-slate-300" /></div>
                                <p className="text-sm font-black text-slate-700">
                                    Tidak ada customer dalam rentang ini
                                </p>
                                <p className="text-xs text-slate-400 mt-2 leading-relaxed max-w-xs mx-auto">
                                    Sistem mendeteksi ulang tahun H-3 (3 hari sebelum) s.d H+3 (3 hari setelah)
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="rounded-2xl overflow-hidden"
                            style={{
                                background: "#fff",
                                border: "1px solid #ebebf8",
                                boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
                            }}
                        >
                            {filteredCustomers.map((c, idx) => {
                                const badge = getStatusBadge(c.diff_days);
                                const waLink = getWaLink(c);

                                return (
                                    <div
                                        key={c.id}
                                        className="relative transition-colors duration-150"
                                        style={{
                                            borderBottom:
                                                idx < filteredCustomers.length - 1 ? "1px solid #f0f0fa" : "none",
                                        }}
                                    >
                                        {/* Subtle left accent stripe */}
                                        <div
                                            className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full"
                                            style={{ background: badge.bg }}
                                        />

                                        <div className="px-4 sm:px-6 py-4 sm:py-5 pl-5 sm:pl-7 flex items-start gap-3 sm:gap-4 hover:bg-slate-50/60 transition-colors duration-150">

                                            {/* ── Avatar ── */}
                                            <div
                                                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0"
                                                style={{
                                                    background: badge.bg,
                                                    boxShadow: `0 4px 12px ${badge.shadow}`,
                                                    color: badge.text,
                                                    letterSpacing: "0.02em",
                                                }}
                                            >
                                                {getInitials(c.customer_name)}
                                            </div>

                                            {/* ── Info ── */}
                                            <div className="flex-1 min-w-0">
                                                {/* Name + age + status badge */}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-black text-slate-900 leading-snug">
                                                        {c.customer_name}
                                                    </span>
                                                    <span
                                                        className="text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0"
                                                        style={{
                                                            background: badge.bg,
                                                            color: badge.text,
                                                            boxShadow: `0 2px 6px ${badge.shadow}`,
                                                        }}
                                                    >
                                                        <badge.icon size={11} /> {badge.label}
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                                        {c.age} tahun
                                                    </span>
                                                </div>

                                                {/* Details grid */}
                                                <div className="mt-2 space-y-1">
                                                    {c.customer_phone && (
                                                        <div className="flex items-center gap-1.5">
                                                            <Phone size={11} className="text-slate-400 flex-shrink-0" />
                                                            <span className="text-[11px] font-semibold text-slate-600">
                                                                {c.customer_phone}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1.5">
                                                        <CalendarDays size={11} className="text-slate-400 flex-shrink-0" />
                                                        <span className="text-[11px] text-slate-500">
                                                            {formatDate(c.customer_birth_date)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <Receipt size={11} className="text-slate-400 flex-shrink-0" />
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
                                                        <MessageCircle size={14} className="flex-shrink-0" />
                                                        <span className="hidden sm:inline">Kirim WA</span>
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Footer note ── */}
                    <p className="text-center text-[11px] text-slate-400 pb-2">
                        Menampilkan customer yang berulang tahun antara H-3 (3 hari sebelum) sampai H+3 (3 hari setelah)
                    </p>
                </div>
            </div>
        </DashboardLayout>
    );
}