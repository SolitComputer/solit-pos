"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, AlertTriangle, Check } from "lucide-react";

interface NeracaRow {
    code: string;
    name: string;
    debit: number;
    kredit: number;
    is_abnormal: boolean;
}

interface NeracaData {
    rows: NeracaRow[];
    totals: { debit: number; kredit: number; balanced: boolean; selisih: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number) => `Rp${Math.round(Number(n || 0)).toLocaleString("id-ID")}`;

export default function Neraca({ period, branch = "ALL" }: { period: string; branch?: "ALL" | "JOGJA" }) {
    const [data, setData] = useState<NeracaData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const branchQS = branch === "JOGJA" ? "&branch=JOGJA" : "";
            const res = await fetch(`/api/akutansi/neraca?period=${period}${branchQS}`, { cache: "no-store" });
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "Gagal memuat neraca");
                setData(null);
                return;
            }
            setData(json.data);
        } catch {
            setError("Koneksi bermasalah");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [period, branch]);

    useEffect(() => {
        load();
    }, [load]);

    // Auto-refresh saat balik ke tab ini — biar sinkron kalau ada perubahan
    // di Jurnal Umum / Buku Besar sebelumnya.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible") load();
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
    }, [load]);

    const balanced = data?.totals.balanced ?? true;
    const hasRows = !!data && data.rows.length > 0;

    return (
        <div className="space-y-4">
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">{error}</div>
            )}

            {/* ══════════════════ KARTU NERACA SALDO ══════════════════ */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header: judul + badge status balance + refresh */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <h3 className="text-base font-black text-gray-900">Neraca Saldo</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                            Saldo akhir semua akun sampai akhir periode ini. Total Debit &amp; Kredit harus sama.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {hasRows && (
                            <span
                                className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${balanced
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-red-50 text-red-700 border-red-200"
                                    }`}
                            >
                                {balanced ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                {balanced ? "Balance" : "Tidak Balance"}
                            </span>
                        )}
                        <button
                            onClick={() => load()}
                            disabled={loading}
                            title="Muat ulang data terbaru"
                            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 active:scale-90 transition-all duration-150 disabled:opacity-40 shrink-0"
                        >
                            <span className={loading ? "inline-block animate-spin" : "inline-block"}>⟳</span>
                        </button>
                    </div>
                </div>

                {/* Strip 3 angka: Total Debit · Total Kredit · Selisih */}
                {data && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 border-b border-gray-100">
                        <div className="px-5 py-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Total Debit</p>
                            <p className="text-[15px] font-black font-mono text-blue-700">{rp(data.totals.debit)}</p>
                        </div>
                        <div className="px-5 py-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Total Kredit</p>
                            <p className="text-[15px] font-black font-mono text-emerald-700">{rp(data.totals.kredit)}</p>
                        </div>
                        <div className="px-5 py-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Selisih</p>
                            <p className={`text-[15px] font-black font-mono ${balanced ? "text-gray-900" : "text-red-600"}`}>
                                {rp(Math.abs(data.totals.selisih))}
                            </p>
                        </div>
                    </div>
                )}

                {/* Penjelasan kalau Tidak Balance (muncul hanya saat selisih ≠ 0) */}
                {hasRows && !balanced && (
                    <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-red-700 leading-relaxed">
                            Selisih <b className="font-mono">{rp(Math.abs(data!.totals.selisih))}</b>. Kemungkinan ada input Saldo Awal
                            Manual (di tab Buku Besar) yang belum lengkap pasangannya, atau ada jurnal manual yang tidak seimbang.
                        </span>
                    </div>
                )}

                {/* ── Mobile: kartu per akun ── */}
                <div className="md:hidden p-3 space-y-2">
                    {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="bg-white rounded-xl border border-gray-200 p-3.5 space-y-2 animate-pulse">
                                <div className="h-3 bg-gray-100 rounded w-1/2" />
                                <div className="h-3 bg-gray-100 rounded w-1/3" />
                            </div>
                        ))
                    ) : !hasRows ? (
                        <div className="py-16 text-center">
                            <div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>
                            <p className="text-sm text-gray-500 font-medium">Belum ada saldo di periode ini</p>
                            <p className="text-xs text-gray-400 mt-1 px-6">
                                Konfirmasi jurnal di Jurnal Umum, atau input Saldo Awal Manual di Buku Besar dulu.
                            </p>
                        </div>
                    ) : (
                        <>
                            {data!.rows.map((r) => (
                                <div key={r.code} className="bg-white rounded-xl border border-gray-200 p-3.5">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="text-[11px] font-mono font-bold text-gray-500">{r.code}</span>
                                        {r.is_abnormal && (
                                            <span className="inline-flex text-amber-500" title="Posisi saldo tidak wajar — cek Buku Besar akun ini">
                                                <AlertTriangle className="w-3 h-3" />
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[13px] text-gray-800 font-medium mb-2">{r.name}</p>
                                    <div className="flex items-center justify-between text-[12px] font-mono font-bold">
                                        <span className={r.is_abnormal ? "text-red-600" : "text-blue-700"}>
                                            D {r.debit > 0 ? rp(r.debit) : "—"}
                                        </span>
                                        <span className={r.is_abnormal ? "text-red-600" : "text-emerald-700"}>
                                            K {r.kredit > 0 ? rp(r.kredit) : "—"}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div className={`rounded-xl border-2 p-3.5 ${balanced ? "border-gray-300 bg-gray-50" : "border-red-300 bg-red-50"}`}>
                                <p className="text-xs font-bold text-gray-600 uppercase mb-2">Total</p>
                                <div className="flex items-center justify-between text-sm font-black font-mono">
                                    <span className="text-blue-700">{rp(data!.totals.debit)}</span>
                                    <span className="text-emerald-700">{rp(data!.totals.kredit)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* ── Desktop/tablet: Tabel Neraca Saldo ── */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: "640px" }}>
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[90px]">
                                    Kode
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                                    Keterangan
                                </th>
                                <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[180px]">
                                    Debit
                                </th>
                                <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[180px]">
                                    Kredit
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <tr key={i} className="border-b border-gray-50">
                                        {Array.from({ length: 4 }).map((__, j) => (
                                            <td key={j} className="px-4 py-4">
                                                <div className="h-3 bg-gray-100 rounded animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : !hasRows ? (
                                <tr>
                                    <td colSpan={4} className="py-16 text-center">
                                        <div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>
                                        <p className="text-sm text-gray-500 font-medium">Belum ada saldo di periode ini</p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Konfirmasi jurnal di Jurnal Umum, atau input Saldo Awal Manual di Buku Besar dulu.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                data!.rows.map((r) => (
                                    <tr key={r.code} className="hover:bg-blue-50/30 transition border-b border-gray-50">
                                        <td className="px-4 py-2.5 text-[11px] font-mono font-bold text-gray-500">
                                            {r.code}
                                            {r.is_abnormal && <span className="ml-1 inline-flex text-amber-500" title="Posisi saldo tidak wajar — cek Buku Besar akun ini"><AlertTriangle className="w-3 h-3" /></span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-[12px] text-gray-800">{r.name}</td>
                                        <td
                                            className={`px-4 py-2.5 text-right text-[12px] font-bold font-mono ${r.is_abnormal ? "text-red-600" : "text-blue-700"}`}
                                            title={r.is_abnormal ? "Posisi saldo tidak wajar untuk tipe akun ini" : undefined}
                                        >
                                            {r.debit > 0 ? rp(r.debit) : ""}
                                        </td>
                                        <td
                                            className={`px-4 py-2.5 text-right text-[12px] font-bold font-mono ${r.is_abnormal ? "text-red-600" : "text-emerald-700"}`}
                                            title={r.is_abnormal ? "Posisi saldo tidak wajar untuk tipe akun ini" : undefined}
                                        >
                                            {r.kredit > 0 ? rp(r.kredit) : ""}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>

                        {hasRows && (
                            <tfoot>
                                <tr className={`border-t-2 bg-gray-50 ${balanced ? "border-gray-300" : "border-red-300"}`}>
                                    <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">
                                        Total
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-black text-blue-700 font-mono">
                                        {rp(data!.totals.debit)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-black text-emerald-700 font-mono">
                                        {rp(data!.totals.kredit)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}