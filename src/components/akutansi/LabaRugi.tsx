"use client";
// src/components/akutansi/LabaRugi.tsx

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Inbox } from "lucide-react";
import { periodLabel } from "@/lib/accounting";

interface LabaRugiRow {
    code: string;
    name: string;
    nominal: number;
}
interface LabaRugiSection {
    rows: LabaRugiRow[];
    total: number;
}
interface LabaRugiData {
    period: string;
    pendapatan: LabaRugiSection;
    modal_keluar: LabaRugiSection;
    operasional: LabaRugiSection;
    luar_operasional: LabaRugiSection;
    laba_ditahan: LabaRugiSection;
    laba_operasional: number;
    total_laba: number;
    akun_laba_periode: LabaRugiRow | null;
    selisih_verifikasi: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number) => {
    const v = Math.round(Number(n || 0));
    if (v === 0) return "—";
    return `${v < 0 ? "-" : ""}Rp${Math.abs(v).toLocaleString("id-ID")}`;
};

export default function LabaRugi({ period }: { period: string }) {
    const [data, setData] = useState<LabaRugiData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/akutansi/laba-rugi?period=${period}`);
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "Gagal memuat laba rugi");
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

    const kosong =
        !!data &&
        data.pendapatan.rows.length === 0 &&
        data.modal_keluar.rows.length === 0 &&
        data.operasional.rows.length === 0 &&
        data.luar_operasional.rows.length === 0;

    return (
        <div className="space-y-4">
            {/* ── Toolbar ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                    Laporan Laba Rugi {periodLabel(period)} — Pendapatan dikurangi Modal Keluar, Operasional, dan
                    Biaya di Luar Operasional, lalu ditambah Laba Ditahan.
                </p>
                <button
                    onClick={() => load()}
                    disabled={loading}
                    title="Muat ulang data terbaru"
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 active:scale-90 transition-all duration-150 disabled:opacity-40 shrink-0"
                >
                    <span className={loading ? "inline-block animate-spin" : "inline-block"}>⟳</span>
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">{error}</div>
            )}

            {/* ── Verifikasi vs akun Laba di Neraca ── */}
            {data && data.akun_laba_periode && (
                <VerifikasiBox
                    accountLabel={`${data.akun_laba_periode.code} · ${data.akun_laba_periode.name}`}
                    saldoAkun={data.akun_laba_periode.nominal}
                    selisih={data.selisih_verifikasi ?? 0}
                />
            )}

            {/* ── Tabel Laba Rugi ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: "640px" }}>
                        <thead>
                            <tr className="border-b-2 border-[#D9A94A]/25 bg-gray-50">
                                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                                    Keterangan
                                </th>
                                <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[180px]">
                                    Nominal
                                </th>
                                <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[190px]">
                                    Jumlah
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i} className="border-b border-gray-50">
                                        {Array.from({ length: 3 }).map((__, j) => (
                                            <td key={j} className="px-4 py-4">
                                                <div className="h-3 bg-gray-100 rounded animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : !data || kosong ? (
                                <tr>
                                    <td colSpan={3} className="py-16 text-center">
                                        <div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>
                                        <p className="text-sm text-gray-500 font-medium">Belum ada pendapatan / beban di periode ini</p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Konfirmasi jurnal di tab Jurnal Umum dulu, ya.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    <Section title="Total Pendapatan" section={data.pendapatan} tone="emerald" />
                                    <Spacer />
                                    <Section title="Total Modal Keluar" section={data.modal_keluar} tone="red" />
                                    <Spacer />
                                    <Section title="Total Operasional" section={data.operasional} tone="red" />
                                    <Spacer />
                                    <Section title="Total di Luar Operasional" section={data.luar_operasional} tone="red" />
                                    <Spacer />

                                    {/* Laba periode berjalan (sebelum laba ditahan) */}
                                    <tr className="bg-gray-50/70 border-y border-gray-200">
                                        <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">
                                            Laba Periode Berjalan
                                        </td>
                                        <td className={`px-4 py-3 text-right text-sm font-black font-mono ${data.laba_operasional >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                            {rp(data.laba_operasional)}
                                        </td>
                                    </tr>
                                    <Spacer />

                                   <Section
                                        title="Total Laba Ditahan"
                                        section={data.laba_ditahan}
                                        tone="emerald"
                                        showRows={false}
                                    />
                                </>
                            )}
                        </tbody>

                        {data && !kosong && (
                            <tfoot>
                                <tr className="border-t-2 border-[#D9A94A]/50 bg-gray-100">
                                    <td colSpan={2} className="px-4 py-3.5 text-right text-xs font-black text-gray-700 uppercase tracking-wider">
                                        Total Laba
                                    </td>
                                    <td className={`px-4 py-3.5 text-right text-base font-black font-mono ${data.total_laba >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                        {rp(data.total_laba)}
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

// ─── Blok section: baris akun + baris subtotal ───────────────────────────────
 function Section({
     title,
     section,
     tone,
     emptyLabel,
     showRows = true,
 }: {
     title: string;
     section: LabaRugiSection;
     tone: "emerald" | "red";
     emptyLabel?: string;
     showRows?: boolean;
}) {
    const totalColor = tone === "emerald" ? "text-emerald-700" : "text-red-600";

    return (
        <>
           {showRows && (
                section.rows.length === 0 ? (
                    <tr className="border-b border-gray-50">
                        <td className="px-4 py-2.5 text-[12px] text-gray-400 italic">{emptyLabel ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right text-[12px] font-mono text-gray-300">—</td>
                        <td className="px-4 py-2.5" />
                    </tr>
                ) : (
                    section.rows.map((r) => (
                        <tr key={r.code} className="hover:bg-blue-50/30 transition border-b border-gray-50">
                            <td className="px-4 py-2.5 text-[12px] text-gray-800">
                                <span className="text-[11px] font-mono font-bold text-gray-400 mr-2">{r.code}</span>
                                {r.name}
                            </td>
                            <td className="px-4 py-2.5 text-right text-[12px] font-bold font-mono text-gray-800">
                                {rp(r.nominal)}
                            </td>
                            <td className="px-4 py-2.5" />
                        </tr>
                    ))
                )
            )}
            <tr className="bg-gray-50/60 border-b border-gray-100">
                <td className="px-4 py-2.5 text-[12px] font-bold text-gray-700 pl-8">{title}</td>
                <td className="px-4 py-2.5" />
                <td className={`px-4 py-2.5 text-right text-[13px] font-black font-mono ${totalColor}`}>
                    {rp(section.total)}
                </td>
            </tr>
        </>
    );
}

// Baris kosong pemisah antar blok — biar mirip format laporan Excel
function Spacer() {
    return (
        <tr>
            <td colSpan={3} className="py-1.5" />
        </tr>
    );
}

// ─── Kotak verifikasi vs saldo akun Laba di Neraca ───────────────────────────
function VerifikasiBox({
    accountLabel,
    saldoAkun,
    selisih,
}: {
    accountLabel: string;
    saldoAkun: number;
    selisih: number;
}) {
    const cocok = Math.abs(selisih) < 1;
    const belumDijurnal = Math.round(saldoAkun) === 0;

    return (
        <div
            className={`rounded-xl border p-3.5 flex items-start gap-2.5 ${cocok ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
                }`}
        >
            <span className={`shrink-0 mt-0.5 ${cocok ? "text-emerald-600" : "text-amber-600"}`}>
                {cocok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </span>
            <span className={`text-xs font-semibold leading-relaxed ${cocok ? "text-emerald-700" : "text-amber-800"}`}>
               {cocok ? (
                    <>Saldo Awal Manual akun <b className="font-mono">{accountLabel}</b> sudah sinkron dengan Laba Ditahan di laporan ini.</>
                ) : belumDijurnal ? (
                    <>
                        Akun <b className="font-mono">{accountLabel}</b> masih kosong di Neraca — Saldo Awal Manual
                        (Laba Ditahan) untuk periode ini belum diinput. Buka tab Buku Besar → pilih akun ini → "Set
                        Saldo Awal".
                    </>
                ) : (
                    <>
                        Selisih <b className="font-mono">{rp(Math.abs(selisih))}</b> antara Laba Ditahan yang dipakai di
                        laporan ini dengan saldo akun <b className="font-mono">{accountLabel}</b> di Neraca (
                        <b className="font-mono">{rp(saldoAkun)}</b>). Kemungkinan ada jurnal lain yang ikut nyentuh
                        akun ini di luar Saldo Awal Manual — cek lagi di Buku Besar.
                    </>
                )}
            </span>
        </div>
    );
}