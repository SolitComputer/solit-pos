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

// ── Util tanggal singkat "3 Okt" (untuk banner "Berikutnya") ──────────────────
const MONTH_SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function shortBirthDate(birthDateStr: string): string {
    const [, m, d] = birthDateStr.slice(0, 10).split("-").map(Number);
    if (!m || !d) return "";
    return `${d} ${MONTH_SHORT_ID[m - 1]}`;
}

function formatCountdown(days: number): string {
    if (days === 0) return "Hari ini";
    if (days === 1) return "Besok";
    return `${days} hari lagi`;
}

// ── Pill hitung mundur (gaya identik halaman karyawan) ────────────────────────
function CountdownPill({ days }: { days: number }) {
    const tone =
        days === 0
            ? { bg: "#fef3c7", text: "#92400e", border: "#fde68a" }
            : days <= 7
                ? { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" }
                : { bg: "#f8fafc", text: "#64748b", border: "#e8ecf5" };
    return (
        <span
            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10.5px] font-black whitespace-nowrap tabular-nums ${days === 0 ? "animate-pulse" : ""}`}
            style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
        >
            {formatCountdown(days)}
        </span>
    );
}

// ── Banner: ada customer ultah HARI INI (gelap + konfeti) ─────────────────────
function TodayBanner({ people }: { people: BirthdayCustomer[] }) {
    return (
        <section
            className="relative overflow-hidden rounded-2xl sm:rounded-3xl"
            style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }}
        >
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage:
                        "radial-gradient(ellipse at 88% 15%, rgba(236,72,153,0.30) 0%, transparent 58%), radial-gradient(ellipse at 5% 95%, rgba(99,102,241,0.26) 0%, transparent 58%)",
                }}
            />
            <div className="confetti pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                {Array.from({ length: 10 }).map((_, i) => (
                    <span key={i} className={`confetti-bit bit-${i}`} />
                ))}
            </div>

            <div className="relative z-10 px-4 sm:px-6 py-5 sm:py-6">
                <div className="flex items-center gap-2 mb-4">
                    <PartyPopper className="w-4 h-4 flex-shrink-0" style={{ color: "#fbbf24" }} />
                    <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#fbbf24" }}>
                        Ulang tahun customer hari ini
                    </p>
                </div>

                <ul className="space-y-2.5">
                    {people.map((p) => {
                        const wa = getWaLink(p);
                        return (
                            <li
                                key={p.id}
                                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-3.5 sm:py-3"
                                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                            >
                                <div
                                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-black flex-shrink-0 text-sm sm:text-base"
                                    style={{ background: "linear-gradient(135deg, #fde68a, #fbbf24)", boxShadow: "0 4px 14px rgba(251,191,36,0.4)", color: "#78350f" }}
                                >
                                    {getInitials(p.customer_name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm sm:text-base font-black text-white truncate leading-tight">{p.customer_name}</p>
                                    {p.customer_phone && (
                                        <p className="text-[10.5px] sm:text-[11.5px] mt-1 truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                                            {p.customer_phone}
                                        </p>
                                    )}
                                    <p className="text-[10.5px] sm:text-[11.5px] font-bold mt-0.5" style={{ color: "#fbbf24" }}>
                                        Genap {p.age} tahun
                                    </p>
                                </div>
                                {p.customer_phone && (
                                    <a
                                        href={wa}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white px-3 py-2 rounded-xl flex-shrink-0 transition-transform hover:scale-[1.03] active:scale-95"
                                        style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)", boxShadow: "0 4px 12px rgba(37,211,102,0.35)" }}
                                    >
                                        <MessageCircle size={14} /> <span className="hidden sm:inline">Ucapkan</span>
                                    </a>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>

            <style jsx>{`
                .confetti-bit {
                    position: absolute;
                    top: -14px;
                    width: 6px;
                    height: 10px;
                    border-radius: 2px;
                    opacity: 0;
                    animation: fall 6s linear infinite;
                }
                .bit-0 { left: 6%;  background: #fbbf24; animation-delay: 0s;   }
                .bit-1 { left: 16%; background: #ec4899; animation-delay: 0.7s; }
                .bit-2 { left: 27%; background: #6366f1; animation-delay: 1.4s; }
                .bit-3 { left: 38%; background: #34d399; animation-delay: 2.1s; }
                .bit-4 { left: 49%; background: #fbbf24; animation-delay: 2.8s; }
                .bit-5 { left: 60%; background: #a78bfa; animation-delay: 0.4s; }
                .bit-6 { left: 70%; background: #ec4899; animation-delay: 1.1s; }
                .bit-7 { left: 80%; background: #34d399; animation-delay: 1.8s; }
                .bit-8 { left: 88%; background: #6366f1; animation-delay: 2.5s; }
                .bit-9 { left: 95%; background: #fbbf24; animation-delay: 3.2s; }

                @keyframes fall {
                    0%   { transform: translateY(0) rotate(0deg);       opacity: 0;    }
                    12%  {                                              opacity: 0.55; }
                    100% { transform: translateY(260px) rotate(320deg); opacity: 0;    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .confetti { display: none; }
                }
            `}</style>
        </section>
    );
}

// ── Banner: belum ada ultah hari ini → tampilkan yang TERDEKAT ────────────────
function NextUpBanner({ person }: { person: BirthdayCustomer }) {
    return (
        <section
            className="bg-white rounded-2xl sm:rounded-3xl px-4 sm:px-6 py-4 sm:py-5"
            style={{ border: "1px solid #ebebf8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#7c3aed" }} />
                <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#7c3aed" }}>
                    Berikutnya
                </p>
            </div>

            <div className="flex items-center gap-3 sm:gap-3.5">
                <div
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white font-black flex-shrink-0 text-sm sm:text-base"
                    style={{ background: "linear-gradient(135deg, #a78bfa, #7c3aed)", boxShadow: "0 4px 14px rgba(124,58,237,0.25)" }}
                >
                    {getInitials(person.customer_name)}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-base font-black truncate leading-tight" style={{ color: "#0f172a" }}>
                        {person.customer_name}
                    </p>
                    {person.customer_phone && (
                        <p className="text-[10.5px] sm:text-xs mt-1 truncate" style={{ color: "#94a3b8" }}>
                            {person.customer_phone}
                        </p>
                    )}
                    <p className="text-[10.5px] sm:text-xs mt-0.5 font-bold" style={{ color: "#64748b" }}>
                        {shortBirthDate(person.customer_birth_date)} &middot; ke-{person.age}
                    </p>
                </div>
                <div className="flex-shrink-0">
                    <CountdownPill days={person.diff_days} />
                </div>
            </div>
        </section>
    );
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

                // === DUMMY TES BANNER — HAPUS SETELAH SELESAI CEK ===
                setCustomers([
                    { id: "t1", customer_name: "Tes Ultah Hari Ini", customer_phone: "081234567890", customer_birth_date: "2000-10-03", age: 26, diff_days: 0, sales_name: "Sales A", sales_id: "s1", invoice_number: "INV-TEST-1", transaction_date: "2026-10-03" },
                    { id: "t2", customer_name: "Tes H-2", customer_phone: "081234567891", customer_birth_date: "2000-10-05", age: 26, diff_days: 2, sales_name: "Sales B", sales_id: "s2", invoice_number: "INV-TEST-2", transaction_date: "2026-10-03" },
                ]);
                // === END DUMMY ===
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

    // Ultah hari ini (diff_days === 0) → banner gelap.
    const todayList = useMemo(() => customers.filter(c => c.diff_days === 0), [customers]);
    // Yang paling dekat & belum lewat (H-1/H-2/H-3) → banner "Berikutnya".
    const nextUp = useMemo(
        () => customers.filter(c => c.diff_days > 0).sort((a, b) => a.diff_days - b.diff_days)[0] ?? null,
        [customers]
    );

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

                    {/* ── Sorotan: ultah hari ini / terdekat (gaya halaman karyawan) ── */}f
                    {!loading && todayList.length > 0 && <TodayBanner people={todayList} />}
                    {!loading && todayList.length === 0 && nextUp && <NextUpBanner person={nextUp} />}

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
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap ${filter === "ALL"
                                            ? "bg-[#1a1535] text-white shadow-sm"
                                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                                        }`}
                                >
                                    Semua ({counts.total})
                                </button>
                                <button
                                    onClick={() => setFilter("TODAY")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap ${filter === "TODAY"
                                            ? "bg-amber-500 text-white shadow-sm"
                                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                                        }`}
                                >
                                    Hari Ini ({counts.today})
                                </button>
                                <button
                                    onClick={() => setFilter("UPCOMING")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap ${filter === "UPCOMING"
                                            ? "bg-sky-500 text-white shadow-sm"
                                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                                        }`}
                                >
                                    Akan Datang ({counts.upcoming})
                                </button>
                                <button
                                    onClick={() => setFilter("PASSED")}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap ${filter === "PASSED"
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