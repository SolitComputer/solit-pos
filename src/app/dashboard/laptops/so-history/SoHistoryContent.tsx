"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SoHistoryRow {
    id: string;
    action: "SO" | "UNSO";
    so_by: string;
    so_at: string;
    notes: string | null;
    laptop_id: string;
    laptop_name: string;
}

const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

const PAGE_SIZE = 25;

export default function SoHistoryContent() {
    const [rows, setRows] = useState<SoHistoryRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [actionFilter, setActionFilter] = useState<"ALL" | "SO" | "UNSO">("ALL");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Debounce input pencarian 350ms supaya tidak fetch di setiap ketikan.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => clearTimeout(t);
    }, [search]);

    // Reset ke halaman 1 setiap kali filter berubah, supaya tidak "nyangkut"
    // di halaman kosong ketika hasil filter baru lebih sedikit dari sebelumnya.
    useEffect(() => { setPage(1); }, [debouncedSearch, actionFilter]);

    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            setError("");
            try {
                const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
                if (debouncedSearch) params.set("search", debouncedSearch);
                if (actionFilter !== "ALL") params.set("action", actionFilter);

                const res = await fetch(`/api/laptops/so-history?${params.toString()}`);
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat riwayat SO");
                if (active) {
                    setRows(json.data ?? []);
                    setTotal(json.total ?? 0);
                }
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : "Terjadi kesalahan");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [page, debouncedSearch, actionFilter]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto space-y-5">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 bg-gray-900 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 109-9 9 9 0 00-7 3.4" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4v4.5H7.5" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-gray-800 tracking-tight leading-none">Riwayat SO</h1>
                            <p className="text-xs text-gray-400 mt-0.5 font-normal">Riwayat Stock Opname seluruh laptop</p>
                        </div>
                    </div>
                    <Link href="/dashboard/laptops/monitoring"
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                        ← Monitoring Stok
                    </Link>
                </div>

                {/* Filter panel */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-2.5">
                    <div className="relative flex-1 min-w-[200px]">
                        <svg className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Cari nama laptop..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full h-9 pl-8 pr-3 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-500 focus:bg-white transition-all"
                        />
                    </div>
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}
                        className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-500 focus:bg-white transition-all cursor-pointer"
                    >
                        <option value="ALL">Semua Aksi</option>
                        <option value="SO">Ditandai SO</option>
                        <option value="UNSO">SO Dibatalkan</option>
                    </select>
                </div>

                {/* Tabel */}
                {loading ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">
                        Memuat riwayat...
                    </div>
                ) : error ? (
                    <div className="bg-white rounded-2xl border border-red-100 shadow-sm py-16 text-center text-sm text-red-500">
                        {error}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
                        <p className="text-gray-700 font-bold text-base">Belum ada riwayat SO</p>
                        <p className="text-gray-400 text-sm mt-1.5">Coba ubah filter pencarian</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto table-scroll">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b-2 border-gray-100">
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Laptop</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Aksi</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Diproses Oleh</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tanggal &amp; Waktu</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Catatan / Lokasi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => {
                                        const isDeleted = r.laptop_name === "(Laptop sudah dihapus)";
                                        return (
                                            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-gray-800 max-w-[220px] truncate" title={r.laptop_name}>
                                                    {isDeleted ? (
                                                        <span className="text-gray-400 italic font-normal">{r.laptop_name}</span>
                                                    ) : (
                                                        <Link href={`/dashboard/laptops/${r.laptop_id}/units`} className="hover:underline">
                                                            {r.laptop_name}
                                                        </Link>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${r.action === "SO"
                                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                                        : "bg-gray-50 text-gray-500 border-gray-200"
                                                        }`}>
                                                        {r.action === "SO" ? "Ditandai SO" : "SO Dibatalkan"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">{r.so_by}</td>
                                                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtWhen(r.so_at)}</td>
                                                <td className="px-4 py-3 text-gray-500 max-w-[260px] truncate" title={r.notes ?? undefined}>
                                                    {r.notes || <span className="text-gray-300">—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer + pagination */}
                        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-gray-400 font-medium">
                                <span className="text-gray-700 font-bold">{total}</span> total riwayat
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="h-8 px-3 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    ← Sebelumnya
                                </button>
                                <span className="text-xs text-gray-500 font-medium px-1">
                                    Hal {page} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="h-8 px-3 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    Selanjutnya →
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}