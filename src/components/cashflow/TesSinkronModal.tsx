"use client";
// src/components/cashflow/TesSinkronModal.tsx

import { useCallback, useEffect, useState } from "react";
import { X, Check, AlertTriangle, RefreshCw, ArrowLeftRight } from "lucide-react";
import { CASHFLOW_START_DATE } from "@/lib/cashflow";

// Akun kas yang disinkronkan (Kas 1 kesatuan): 110 Saldo · 120 Cash Utama · 121 Cash Jogja.
const KAS_ACCOUNTS = ["110", "120", "121"] as const;

const rp = (n: number) => `Rp${Math.round(Number(n || 0)).toLocaleString("id-ID")}`;

const todayWIB = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// H-1 dari "YYYY-MM-DD" via UTC murni — biar tidak kepengaruh timezone browser,
// karena string tanggalnya tanpa jam (sama pola dgn dayBefore() di page.tsx).
const dayBefore = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
};

const periodOf = (dateStr: string) => dateStr.slice(0, 7); // "YYYY-MM"

const fmtTanggal = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

type KasPart = { code: string; saldo: number };
type Row = { tanggal: string; kas: number; cashflow: number; selisih: number; sinkron: boolean; parts: KasPart[] };
type Status = "synced" | "unsynced" | "exhausted" | "no-data";

type CfEntry = {
    tanggal: string;
    nominal: number;
    is_voided?: boolean;
    is_stale?: boolean;
    source_nominal?: number | null;
};

type LedgerLine = { tanggal: string; saldo_debit: number; saldo_kredit: number };
type LedgerCache = { saldo_awal: number; lines: LedgerLine[] };

export default function TesSinkronModal({ onClose }: { onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [rows, setRows] = useState<Row[]>([]);
    const [status, setStatus] = useState<Status>("synced");

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const run = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            // ── 1) Cashflow: saldo akhir (kumulatif) per tanggal ──────────────────
            // skipSync=1 → cepat, cukup baca cashflow_entries yang sudah ada.
            // Tanpa param branch → konsolidasi semua cabang (kas 1 kesatuan).
            const cfRes = await fetch("/api/cashflow?skipSync=1", { cache: "no-store" });
            const cfJson = await cfRes.json();
            if (!cfJson?.success) throw new Error(cfJson?.message || "Gagal memuat data cashflow");
            const masuk: CfEntry[] = cfJson.data?.masuk ?? [];
            const keluar: CfEntry[] = cfJson.data?.keluar ?? [];

            // Sama dengan effectiveNominalOf() di page.tsx: entry stale dihitung pakai harga terkini.
            const effNominal = (e: CfEntry) =>
                e.is_stale && e.source_nominal != null ? Number(e.source_nominal) : Number(e.nominal || 0);

            // Saldo akhir Cashflow s/d tanggal d (termasuk Modal Awal, kecuali voided) —
            // identik dengan cumulativeSaldoUpTo() di kartu "Saldo Cashflow".
            const cashflowSaldoAt = (d: string) => {
                const masukSum = masuk.reduce((s, e) => (!e.is_voided && e.tanggal <= d ? s + effNominal(e) : s), 0);
                const keluarSum = keluar.reduce((s, e) => (!e.is_voided && e.tanggal <= d ? s + Number(e.nominal || 0) : s), 0);
                return masukSum - keluarSum;
            };

            // ── 2) Buku Besar: saldo berjalan akun kas per tanggal ────────────────
            const ledgerCache = new Map<string, LedgerCache>(); // key: `${account}|${period}`
            const getLedger = async (account: string, period: string): Promise<LedgerCache> => {
                const key = `${account}|${period}`;
                const cached = ledgerCache.get(key);
                if (cached) return cached;
                const res = await fetch(`/api/akutansi/buku-besar?period=${period}&account_code=${account}`, { cache: "no-store" });
                const json = await res.json();
                if (!json?.success) throw new Error(json?.message || `Gagal memuat buku besar akun ${account}`);
                const data: LedgerCache = {
                    saldo_awal: Number(json.data?.saldo_awal ?? 0),
                    lines: (json.data?.lines ?? []).map((l: any) => ({
                        tanggal: l.tanggal as string,
                        saldo_debit: Number(l.saldo_debit ?? 0),
                        saldo_kredit: Number(l.saldo_kredit ?? 0),
                    })),
                };
                ledgerCache.set(key, data);
                return data;
            };

            // Saldo berjalan 1 akun pada tanggal d = running saldo baris TERAKHIR yang
            // tanggal <= d (lines sudah urut menaik), atau saldo_awal periode kalau belum ada.
            // net = saldo_debit>0 ? saldo_debit : -saldo_kredit  (sama dgn saldoNet di BukuBesar.tsx).
            const accountSaldoAt = async (account: string, d: string) => {
                const led = await getLedger(account, periodOf(d));
                let net = led.saldo_awal;
                for (const l of led.lines) {
                    if (l.tanggal <= d) net = l.saldo_debit > 0 ? l.saldo_debit : -l.saldo_kredit;
                }
                return net;
            };

            const kasBreakdownAt = async (d: string) => {
                const parts: KasPart[] = [];
                let total = 0;
                for (const acc of KAS_ACCOUNTS) {
                    const saldo = Math.round(await accountSaldoAt(acc, d));
                    parts.push({ code: acc, saldo });
                    total += saldo;
                }
                return { total, parts };
            };

            // ── 3) Loop mundur dari kemarin sampai ketemu tanggal sinkron ─────────
            const floor = CASHFLOW_START_DATE;
            const start = dayBefore(todayWIB()); // kemarin — hari ini belum genap 24 jam
            if (start < floor) {
                setRows([]);
                setStatus("no-data");
                return;
            }

            const out: Row[] = [];
            let d = start;
            let found = false;
            let guard = 0; // pengaman anti infinite-loop
            while (d >= floor && guard < 1000) {
                guard++;
                const { total: kas, parts } = await kasBreakdownAt(d);
                const cashflow = Math.round(cashflowSaldoAt(d));
                const sinkron = kas === cashflow;
                out.push({ tanggal: d, kas, cashflow, selisih: kas - cashflow, sinkron, parts });
                if (sinkron) { found = true; break; }
                d = dayBefore(d);
            }

            setRows(out);
            if (out.length === 0) setStatus("no-data");
            else if (found) setStatus(out.length === 1 ? "synced" : "unsynced");
            else setStatus("exhausted");
        } catch (e: any) {
            setError(e?.message || "Terjadi kesalahan saat mengecek sinkronisasi");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { run(); }, [run]);

    const note = (() => {
        if (status === "synced" && rows[0]) {
            return {
                tone: "bg-emerald-50 text-emerald-700 border border-emerald-200",
                icon: <Check size={14} className="shrink-0 mt-0.5" />,
                text: `Semua sinkron. Hanya menampilkan 1 hari terakhir yang sudah berlalu (${fmtTanggal(rows[0].tanggal)}). Hari ini belum dicek karena belum genap 24 jam.`,
            };
        }
        if (status === "unsynced" && rows.length > 0) {
            return {
                tone: "bg-amber-50 text-amber-700 border border-amber-200",
                icon: <AlertTriangle size={14} className="shrink-0 mt-0.5" />,
                text: `Pengecekan mundur dari kemarin dan berhenti di tanggal sinkron pertama (${fmtTanggal(rows[rows.length - 1].tanggal)}).`,
            };
        }
        if (status === "exhausted") {
            return {
                tone: "bg-red-50 text-red-700 border border-red-200",
                icon: <AlertTriangle size={14} className="shrink-0 mt-0.5" />,
                text: `Tidak ditemukan tanggal yang sinkron sampai data paling awal (${fmtTanggal(CASHFLOW_START_DATE)}). Periksa kembali Jurnal Umum / Cashflow pada tanggal-tanggal di atas.`,
            };
        }
        return null;
    })();

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                <div className="h-1 bg-gradient-to-r from-[#1a1545] to-[#0f0c29]" />

                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center"><ArrowLeftRight size={17} className="text-violet-700" /></div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">Tes Sinkron Kas</p>
                            <p className="text-[11px] text-gray-400">Saldo akhir Kas Buku Besar (110, 120, 121) vs Saldo Cashflow per tanggal</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition"><X size={16} /></button>
                </div>

                <div className="p-5 max-h-[70vh] overflow-y-auto">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-400">
                            <RefreshCw size={26} className="animate-spin" />
                            <p className="text-sm">Mengecek sinkronisasi…</p>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                            <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="py-10 text-center text-sm text-gray-400">
                            Belum ada hari yang bisa dicek (tanggal mulai cashflow belum terlewati).
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm" style={{ minWidth: 460 }}>
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-2">Tanggal</th>
                                            <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-2">Kas (Buku Besar)</th>
                                            <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-2">Cashflow</th>
                                            <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {rows.map((r) => (
                                            <tr key={r.tanggal}>
                                                <td className="px-2 py-3 align-top">
                                                    <p className="text-[13px] font-semibold text-gray-800">{fmtTanggal(r.tanggal)}</p>
                                                </td>
                                                <td className="px-2 py-3 text-right align-top">
                                                    <p className="text-[13px] font-mono font-bold text-gray-900">{rp(r.kas)}</p>
                                                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                        {r.parts.map((p) => `${p.code}: ${Math.round(p.saldo).toLocaleString("id-ID")}`).join(" · ")}
                                                    </p>
                                                </td>
                                                <td className="px-2 py-3 text-right align-top text-[13px] font-mono text-gray-900">{rp(r.cashflow)}</td>
                                                <td className="px-2 py-3 text-right align-top">
                                                    {r.sinkron ? (
                                                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2 py-0.5 rounded-full"><Check size={12} /> Sinkron</span>
                                                    ) : (
                                                        <>
                                                            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold px-2 py-0.5 rounded-full"><AlertTriangle size={12} /> Tidak Sinkron</span>
                                                            <p className="text-[10px] font-semibold text-red-600 mt-1">Selisih {rp(Math.abs(r.selisih))}</p>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {note && (
                                <div className={`mt-4 rounded-xl px-3.5 py-3 text-[12px] leading-relaxed flex items-start gap-2 ${note.tone}`}>
                                    {note.icon}<span>{note.text}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
                    <button onClick={run} disabled={loading} className="inline-flex items-center gap-1.5 h-10 px-4 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Cek ulang
                    </button>
                    <button onClick={onClose} className="flex-1 h-10 bg-gradient-to-r from-[#1a1545] to-[#0f0c29] text-white rounded-xl text-sm font-medium hover:opacity-90 transition">Tutup</button>
                </div>
            </div>
        </div>
    );
}