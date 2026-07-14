"use client";

import { useCallback, useEffect, useState } from "react";

interface NeracaRow {
    code: string;
    name: string;
    debit: number;
    kredit: number;
}

interface NeracaData {
    rows: NeracaRow[];
    totals: { debit: number; kredit: number; balanced: boolean; selisih: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number) => `Rp${Math.round(Number(n || 0)).toLocaleString("id-ID")}`;

export default function Neraca({ period }: { period: string }) {
    const [data, setData] = useState<NeracaData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/akutansi/neraca?period=${period}`);
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
    }, [period]);

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

    return (
        <div className="space-y-4">
            {/* ── Toolbar ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                    Neraca Saldo — saldo akhir semua akun sampai akhir periode ini. Total Debit &amp; Kredit harus sama.
                </p>
                <button
                    onClick={() => load()}
                    disabled={loading}
                    title="Muat ulang data terbaru"
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition disabled:opacity-40 shrink-0"
                >
                    <span className={loading ? "inline-block animate-spin" : "inline-block"}>⟳</span>
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">{error}</div>
            )}

            {/* ── Status Balance ── */}
            {data && data.rows.length > 0 && (
                <div
                    className={`rounded-xl border p-3.5 flex items-start gap-2.5 ${data.totals.balanced ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                        }`}
                >
                    <span className="text-lg leading-none">{data.totals.balanced ? "✅" : "⚠️"}</span>
                    <span className={`text-xs font-semibold leading-relaxed ${data.totals.balanced ? "text-emerald-700" : "text-red-700"}`}>
                        {data.totals.balanced ? (
                            "Neraca Balance — total Debit sama dengan total Kredit."
                        ) : (
                            <>
                                Tidak Balance — selisih <b className="font-mono">{rp(Math.abs(data.totals.selisih))}</b>.
                                Kemungkinan ada input Saldo Awal Manual (di tab Buku Besar) yang belum lengkap pasangannya,
                                atau ada jurnal manual yang tidak seimbang.
                            </>
                        )}
                    </span>
                </div>
            )}

            {/* ── Tabel Neraca Saldo ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: "640px" }}>
                        <thead>
                            <tr className="border-b-2 border-gray-200 bg-gray-50">
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
                            ) : !data || data.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-16 text-center">
                                        <div className="text-4xl mb-3 opacity-40">⚖️</div>
                                        <p className="text-sm text-gray-500 font-medium">Belum ada saldo di periode ini</p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Konfirmasi jurnal di Jurnal Umum, atau input Saldo Awal Manual di Buku Besar dulu.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                data.rows.map((r) => (
                                    <tr key={r.code} className="hover:bg-blue-50/30 transition border-b border-gray-50">
                                        <td className="px-4 py-2.5 text-[11px] font-mono font-bold text-gray-500">{r.code}</td>
                                        <td className="px-4 py-2.5 text-[12px] text-gray-800">{r.name}</td>
                                        <td className="px-4 py-2.5 text-right text-[12px] font-bold text-blue-700 font-mono">
                                            {r.debit > 0 ? rp(r.debit) : ""}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-[12px] font-bold text-emerald-700 font-mono">
                                            {r.kredit > 0 ? rp(r.kredit) : ""}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>

                        {data && data.rows.length > 0 && (
                            <tfoot>
                                <tr className={`border-t-2 bg-gray-50 ${data.totals.balanced ? "border-gray-300" : "border-red-300"}`}>
                                    <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">
                                        Total
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-black text-blue-700 font-mono">
                                        {rp(data.totals.debit)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-black text-emerald-700 font-mono">
                                        {rp(data.totals.kredit)}
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