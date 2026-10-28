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
// Angka polos (tanpa "Rp") untuk badan laporan — 0 jadi "—", minus pakai tanda "-"
const num = (n: number) => {
    const v = Math.round(Number(n || 0));
    if (v === 0) return "—";
    return `${v < 0 ? "-" : ""}${Math.abs(v).toLocaleString("id-ID")}`;
};
// Pakai "Rp" khusus baris Laba Bersih / Total Laba (biar menonjol seperti di laporan)
const rp = (n: number) => {
    const v = Math.round(Number(n || 0));
    return `${v < 0 ? "-" : ""}Rp${Math.abs(v).toLocaleString("id-ID")}`;
};
const labaColor = (n: number) => (n >= 0 ? "text-emerald-700" : "text-red-600");

export default function LabaRugi({ period, branch = "ALL" }: { period: string; branch?: "ALL" | "JOGJA" }) {
    const [data, setData] = useState<LabaRugiData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const branchQS = branch === "JOGJA" ? "&branch=JOGJA" : "";
            const res = await fetch(`/api/akutansi/laba-rugi?period=${period}${branchQS}`);
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

    const kosong =
        !!data &&
        data.pendapatan.rows.length === 0 &&
        data.modal_keluar.rows.length === 0 &&
        data.operasional.rows.length === 0 &&
        data.luar_operasional.rows.length === 0;

    // Laba Kotor = Total Pendapatan − HPP (Modal Keluar). Laba Bersih = laba_operasional
    // (dihitung server: Pendapatan − HPP − Beban Operasional − Beban Lain).
    const labaKotor = data ? data.pendapatan.total - data.modal_keluar.total : 0;
    const labaBersih = data ? data.laba_operasional : 0;
    // Tampilkan ekor "Laba Ditahan + Total Laba" hanya kalau memang ada nilainya,
    // supaya tampilan default persis laporan di gambar tapi datanya tetap tidak hilang.
    const adaLabaDitahan = !!data && Math.round(data.laba_ditahan.total) !== 0;

    return (
        <div className="space-y-4">
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

            {/* ══════════════════ LAPORAN LABA RUGI ══════════════════ */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-3xl mx-auto">
                {/* Kepala laporan (gaya dokumen) */}
                <div className="px-6 py-6 text-center border-b border-gray-100">
                    <h3 className="text-lg font-black text-gray-900">
                        Solit 03{branch === "JOGJA" ? " · Cabang Jogja" : ""}
                    </h3>
                    <p className="text-[13px] text-gray-500 mt-0.5">Laporan Laba Rugi</p>
                    <p className="text-[11px] text-gray-400">Periode {periodLabel(period)}</p>
                </div>

                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${90 - i * 8}%` }} />
                        ))}
                    </div>
                ) : !data || kosong ? (
                    <div className="py-16 text-center">
                        <div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>
                        <p className="text-sm text-gray-500 font-medium">Belum ada pendapatan / beban di periode ini</p>
                        <p className="text-xs text-gray-400 mt-1 px-6">Konfirmasi jurnal di tab Jurnal Umum dulu, ya.</p>
                    </div>
                ) : (
                    <div className="px-4 sm:px-6 py-5 space-y-5">
                        {/* PENDAPATAN */}
                        <StmtSection
                            sectionLabel="Pendapatan"
                            rows={data.pendapatan.rows}
                            totalLabel="Total Pendapatan"
                            total={data.pendapatan.total}
                        />

                        {/* HARGA POKOK / MODAL KELUAR */}
                        <StmtSection
                            sectionLabel="Harga Pokok / Modal Keluar"
                            rows={data.modal_keluar.rows}
                            totalLabel="Total HPP"
                            total={data.modal_keluar.total}
                        />

                        {/* LABA KOTOR (highlight) */}
                        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-blue-50 border border-blue-100">
                            <span className="text-[13px] font-black text-gray-800">Laba Kotor</span>
                            <span className="text-[14px] font-black font-mono text-blue-700">{num(labaKotor)}</span>
                        </div>

                        {/* BEBAN OPERASIONAL */}
                        <StmtSection
                            sectionLabel="Beban Operasional"
                            rows={data.operasional.rows}
                            totalLabel="Total Beban Operasional"
                            total={data.operasional.total}
                        />

                        {/* BEBAN DI LUAR OPERASIONAL */}
                        <StmtSection
                            sectionLabel="Beban di Luar Operasional"
                            rows={data.luar_operasional.rows}
                            totalLabel="Total Beban Lain"
                            total={data.luar_operasional.total}
                        />

                        {/* LABA BERSIH (hijau kalau laba, merah kalau rugi) */}
                        <div
                            className={`flex items-center justify-between px-4 py-3.5 rounded-xl border ${labaBersih >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                                }`}
                        >
                            <span className={`text-[13px] font-black uppercase tracking-wider ${labaColor(labaBersih)}`}>
                                Laba Bersih
                            </span>
                            <span className={`text-lg font-black font-mono ${labaColor(labaBersih)}`}>{rp(labaBersih)}</span>
                        </div>

                        {/* Ekor Laba Ditahan + Total Laba (hanya kalau ada) */}
                        {adaLabaDitahan && (
                            <div className="space-y-2 pt-1">
                                <div className="flex items-center justify-between px-3.5 py-1.5">
                                    <span className="text-[12px] text-gray-600">+ Laba Ditahan</span>
                                    <span className="text-[12px] font-mono font-bold text-gray-700">{num(data.laba_ditahan.total)}</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-100 border-2 border-gray-300">
                                    <span className="text-[13px] font-black uppercase tracking-wider text-gray-700">Total Laba (Akhir)</span>
                                    <span className={`text-base font-black font-mono ${labaColor(data.total_laba)}`}>{rp(data.total_laba)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Catatan kaki */}
            <p className="text-center text-[11px] text-gray-400 max-w-3xl mx-auto px-4">
                Baris Laba Bersih = Total Pendapatan − HPP − Beban. Hijau artinya laba, merah artinya rugi.
            </p>
        </div>
    );
}

// ─── Satu blok section laporan: baris akun + baris subtotal ──────────────────
function StmtSection({
    sectionLabel,
    rows,
    totalLabel,
    total,
    emptyLabel,
}: {
    sectionLabel: string;
    rows: LabaRugiRow[];
    totalLabel: string;
    total: number;
    emptyLabel?: string;
}) {
    return (
        <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">{sectionLabel}</p>
            {rows.length === 0 ? (
                <div className="flex items-center justify-between py-1.5 pl-3.5">
                    <span className="text-[12px] text-gray-400 italic">{emptyLabel ?? "—"}</span>
                    <span className="text-[12px] font-mono text-gray-300">—</span>
                </div>
            ) : (
                rows.map((r) => (
                    <div key={r.code} className="flex items-center justify-between py-1.5 pl-3.5 gap-3">
                        <span className="text-[13px] text-gray-800 min-w-0 truncate">
                            <span className="text-[11px] font-mono font-bold text-gray-400 mr-2">{r.code}</span>
                            {r.name}
                        </span>
                        <span className="text-[13px] font-mono text-gray-800 shrink-0">{num(r.nominal)}</span>
                    </div>
                ))
            )}
            <div className="flex items-center justify-between py-2 mt-0.5 border-t border-gray-100">
                <span className="text-[13px] font-bold text-gray-800">{totalLabel}</span>
                <span className="text-[13px] font-black font-mono text-gray-900">{num(total)}</span>
            </div>
        </div>
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
            className={`rounded-xl border p-3.5 flex items-start gap-2.5 max-w-3xl mx-auto ${cocok ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
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