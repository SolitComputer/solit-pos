"use client";
// src/components/akutansi/BukuBesar.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { ACCOUNTS, ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/accounting";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LedgerLine {
    id: string;
    tanggal: string;
    keterangan: string;
    ref: string;
    debit: number;
    kredit: number;
    saldo_debit: number;
    saldo_kredit: number;
}

interface OpeningBalance {
    side: "DEBIT" | "KREDIT";
    nominal: number;
}

interface LedgerData {
    account: { code: string; name: string };
    saldo_awal: number;
    opening_balance: OpeningBalance | null;
    lines: LedgerLine[];
    totals: { debit: number; kredit: number; saldo_akhir: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number) => `Rp${Math.round(Number(n || 0)).toLocaleString("id-ID")}`;
const fmtTgl = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });

type NormalSide = "DEBIT" | "KREDIT" | null;

// Sisi saldo normal per akun (dari rentang kode):
//   110–191 (Aset) & 440–540 (Beban)      -> normal DEBIT
//   210–430 (Kewajiban/Modal/Pendapatan)  -> normal KREDIT
// Dipakai untuk mendeteksi saldo yang "tidak wajar" (misal akun Aset tapi
// saldonya malah di sisi Kredit — biasanya tanda ada salah input/jurnal).
function getNormalSide(code: string): NormalSide {
    const num = parseInt(code, 10);
    if (Number.isNaN(num)) return null;
    if ((num >= 110 && num <= 191) || (num >= 440 && num <= 540)) return "DEBIT";
    if (num >= 210 && num <= 430) return "KREDIT";
    return null;
}

export default function BukuBesar({ period }: { period: string }) {
    const [accountCode, setAccountCode] = useState<string>(ACCOUNTS[0]?.code ?? "");
    const [search, setSearch] = useState("");
    const [data, setData] = useState<LedgerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showOpeningModal, setShowOpeningModal] = useState(false);

    const load = useCallback(async () => {
        if (!accountCode) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/akutansi/buku-besar?period=${period}&account_code=${accountCode}`);
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "Gagal memuat buku besar");
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
    }, [period, accountCode]);

    useEffect(() => {
        load();
    }, [load]);

    // Auto-refresh saat user kembali ke tab ini (misal habis edit di Jurnal Umum
    // lalu balik lagi ke Buku Besar) — supaya data selalu sinkron tanpa perlu reload manual.
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

    const filteredAccounts = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return ACCOUNTS;
        return ACCOUNTS.filter((a) => a.code.includes(q) || a.name.toLowerCase().includes(q));
    }, [search]);

    const normalSide = useMemo(() => getNormalSide(accountCode), [accountCode]);

    return (
        <div className="space-y-4">
            {/* ── Account picker ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col sm:flex-row gap-2">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari kode / nama akun..."
                    className="sm:w-64 h-10 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                />
                <select
                    value={accountCode}
                    onChange={(e) => setAccountCode(e.target.value)}
                    className="flex-1 h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white"
                >
                    {ACCOUNT_TYPE_ORDER.map((type) => {
                        const accs = filteredAccounts.filter((a) => a.type === type);
                        if (accs.length === 0) return null;
                        return (
                            <optgroup key={type} label={ACCOUNT_TYPE_LABEL[type]}>
                                {accs.map((a) => (
                                    <option key={a.code} value={a.code}>
                                        {a.code} · {a.name}
                                    </option>
                                ))}
                            </optgroup>
                        );
                    })}
                </select>
                <button
                    onClick={() => load()}
                    disabled={loading}
                    title="Muat ulang data terbaru"
                    className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition disabled:opacity-40 shrink-0"
                >
                    <span className={loading ? "inline-block animate-spin" : "inline-block"}>⟳</span>
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">{error}</div>
            )}

            {/* ── Summary ── */}
            {data && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-50 mb-1">Akun</p>
                        <p className="text-base font-black font-mono truncate text-gray-900">
                            {data.account.code} · {data.account.name}
                        </p>
                        {normalSide && (
                            <span
                                className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${normalSide === "DEBIT"
                                        ? "bg-blue-50 text-blue-600 border-blue-200"
                                        : "bg-emerald-50 text-emerald-600 border-emerald-200"
                                    }`}
                            >
                                Normal: {normalSide === "DEBIT" ? "Debit" : "Kredit"}
                            </span>
                        )}
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-50 mb-1">Saldo Awal (Total)</p>
                        <div className="flex items-center gap-2">
                            <p className="text-base font-black font-mono truncate text-gray-900">
                                {rp(Math.abs(data.saldo_awal))}
                            </p>
                            <SaldoBadge amount={data.saldo_awal} normalSide={normalSide} />
                        </div>
                    </div>
                    <Stat label="Mutasi Debit" value={rp(data.totals.debit)} tone="blue" />
                    <Stat label="Mutasi Kredit" value={rp(data.totals.kredit)} tone="emerald" />
                </div>
            )}

            {/* ── Saldo Awal Manual (one-time input) ── */}
            {data && (
                <div
                    className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${data.opening_balance ? "bg-gray-50 border-gray-200" : "bg-amber-50 border-amber-200"
                        }`}
                >
                    {data.opening_balance ? (
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400">🔒</span>
                            <span className="text-gray-600">
                                Saldo awal manual akun ini:{" "}
                                <b className="text-gray-900 font-mono">
                                    {rp(data.opening_balance.nominal)}
                                </b>{" "}
                                di sisi{" "}
                                <b className={data.opening_balance.side === "DEBIT" ? "text-blue-700" : "text-emerald-700"}>
                                    {data.opening_balance.side === "DEBIT" ? "Debit" : "Kredit"}
                                </b>{" "}
                                — sudah terkunci, tidak bisa diubah lagi.
                            </span>
                        </div>
                    ) : (
                        <>
                            <span className="text-xs text-amber-800">
                                Akun ini belum punya saldo awal manual (saldo dihitung murni dari mutasi jurnal).
                            </span>
                            <button
                                onClick={() => setShowOpeningModal(true)}
                                className="h-8 px-3 rounded-lg bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 transition whitespace-nowrap"
                            >
                                + Set Saldo Awal
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── Tabel Buku Besar ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: "980px" }}>
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                                <th rowSpan={2} className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[100px] align-bottom">
                                    Tanggal
                                </th>
                                <th rowSpan={2} className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider align-bottom">
                                    Keterangan
                                </th>
                                <th rowSpan={2} className="px-4 py-3 text-center text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[100px] align-bottom">
                                    Ref
                                </th>
                                <th rowSpan={2} className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[140px] align-bottom">
                                    Debit
                                </th>
                                <th rowSpan={2} className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[140px] align-bottom">
                                    Kredit
                                </th>
                                <th colSpan={2} className="px-4 py-2 text-center text-[11px] font-bold text-gray-600 uppercase tracking-wider border-l-2 border-gray-200">
                                    Saldo
                                </th>
                            </tr>
                            <tr className="border-b-2 border-gray-200 bg-gray-50">
                                <th className="px-4 py-2 text-right text-[10px] font-bold text-blue-600 uppercase tracking-wider w-[140px] border-l-2 border-gray-200">
                                    Debit
                                </th>
                                <th className="px-4 py-2 text-right text-[10px] font-bold text-emerald-600 uppercase tracking-wider w-[140px]">
                                    Kredit
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b border-gray-50">
                                        {Array.from({ length: 7 }).map((__, j) => (
                                            <td key={j} className="px-4 py-4">
                                                <div className="h-3 bg-gray-100 rounded animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : !data ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-sm text-gray-400">
                                        Pilih akun untuk melihat buku besar
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {/* Baris Saldo Awal */}
                                    <tr className="bg-gray-50/70">
                                        <td colSpan={3} className="px-4 py-2.5">
                                            <span className="text-[11px] font-bold text-gray-500 italic mr-2">Saldo Awal</span>
                                            <SaldoBadge amount={data.saldo_awal} normalSide={normalSide} />
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-[11px] font-mono text-gray-400">—</td>
                                        <td className="px-4 py-2.5 text-right text-[11px] font-mono text-gray-400">—</td>
                                        <td className="px-4 py-2.5 text-right text-[12px] font-mono font-bold text-blue-700 border-l-2 border-gray-200">
                                            {data.saldo_awal >= 0 ? rp(data.saldo_awal) : ""}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-[12px] font-mono font-bold text-emerald-700">
                                            {data.saldo_awal < 0 ? rp(Math.abs(data.saldo_awal)) : ""}
                                        </td>
                                    </tr>

                                    {data.lines.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-14 text-center">
                                                <div className="text-4xl mb-3 opacity-40">📘</div>
                                                <p className="text-sm text-gray-500 font-medium">Belum ada mutasi di periode ini</p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Konfirmasi data di Jurnal Umum agar muncul di sini.
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        data.lines.map((l) => (
                                            <tr key={l.id} className="hover:bg-blue-50/30 transition border-b border-gray-50">
                                                <td className="px-4 py-2.5 text-[11px] font-semibold text-gray-700 whitespace-nowrap">
                                                    {fmtTgl(l.tanggal)}
                                                </td>
                                                <td className="px-4 py-2.5 text-[11px] text-gray-800">{l.keterangan}</td>
                                                <td className="px-4 py-2.5 text-center text-[10px] font-mono font-bold text-gray-400">
                                                    {l.ref || "—"}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-[12px] font-bold text-gray-900 font-mono">
                                                    {l.debit > 0 ? rp(l.debit) : ""}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-[12px] font-bold text-gray-900 font-mono">
                                                    {l.kredit > 0 ? rp(l.kredit) : ""}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-[12px] font-mono text-blue-700 border-l-2 border-gray-100">
                                                    {l.saldo_debit > 0 ? rp(l.saldo_debit) : ""}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-[12px] font-mono text-emerald-700">
                                                    {l.saldo_kredit > 0 ? rp(l.saldo_kredit) : ""}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </>
                            )}
                        </tbody>

                        {data && data.lines.length > 0 && (
                            <tfoot>
                                <tr className="border-t-2 border-gray-300 bg-gray-50">
                                    <td colSpan={3} className="px-4 py-3 text-right">
                                        <span className="text-xs font-bold text-gray-600 uppercase mr-2">Total &amp; Saldo Akhir</span>
                                        <SaldoBadge amount={data.totals.saldo_akhir} size="md" normalSide={normalSide} />
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-black text-gray-900 font-mono">
                                        {rp(data.totals.debit)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-black text-gray-900 font-mono">
                                        {rp(data.totals.kredit)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-black text-blue-700 font-mono border-l-2 border-gray-200">
                                        {data.totals.saldo_akhir >= 0 ? rp(data.totals.saldo_akhir) : ""}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-black text-emerald-700 font-mono">
                                        {data.totals.saldo_akhir < 0 ? rp(Math.abs(data.totals.saldo_akhir)) : ""}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* ── Modal Set Saldo Awal ── */}
            {showOpeningModal && data && (
                <OpeningBalanceModal
                    accountCode={data.account.code}
                    accountLabel={`${data.account.code} · ${data.account.name}`}
                    onClose={() => setShowOpeningModal(false)}
                    onSaved={() => {
                        setShowOpeningModal(false);
                        load();
                    }}
                />
            )}
        </div>
    );
}

// ─── Modal: Set Saldo Awal (hanya bisa sekali input) ──────────────────────────
function OpeningBalanceModal({
    accountCode,
    accountLabel,
    onClose,
    onSaved,
}: {
    accountCode: string;
    accountLabel: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [side, setSide] = useState<"DEBIT" | "KREDIT">("DEBIT");
    const [nominal, setNominal] = useState<number>(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setError("");
        if (!nominal || nominal <= 0) return setError("Nominal harus lebih dari 0");

        const ok = confirm(
            `Yakin input saldo awal "${accountLabel}" sebesar ${rp(nominal)} di sisi ${side === "DEBIT" ? "Debit" : "Kredit"
            }?\n\nData ini HANYA BISA DIINPUT SEKALI dan tidak bisa diubah/dihapus lagi setelah disimpan.`
        );
        if (!ok) return;

        setSaving(true);
        try {
            const res = await fetch("/api/akutansi/saldo-awal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_code: accountCode, side, nominal }),
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.message ?? "Gagal menyimpan");
                return;
            }
            onSaved();
        } catch {
            setError("Koneksi bermasalah");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm">Set Saldo Awal</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">{accountLabel}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100">✕</button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-800 leading-relaxed">
                        ⚠️ Saldo awal hanya bisa diinput <b>1 kali</b> per akun dan tidak bisa diubah / dihapus lagi
                        setelah disimpan. Pastikan nominal &amp; sisinya sudah benar sebelum submit.
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Sisi Saldo</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setSide("DEBIT")}
                                className={`h-10 rounded-lg text-sm font-bold border transition ${side === "DEBIT"
                                        ? "bg-blue-600 text-white border-blue-600"
                                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                    }`}
                            >
                                Debit
                            </button>
                            <button
                                type="button"
                                onClick={() => setSide("KREDIT")}
                                className={`h-10 rounded-lg text-sm font-bold border transition ${side === "KREDIT"
                                        ? "bg-emerald-600 text-white border-emerald-600"
                                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                    }`}
                            >
                                Kredit
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Nominal</label>
                        <input
                            type="number"
                            min={0}
                            value={nominal || ""}
                            onChange={(e) => setNominal(Math.max(0, Number(e.target.value)))}
                            placeholder="0"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-mono"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50"
                    >
                        Batal
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving || !nominal}
                        className="flex-1 h-10 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-40"
                    >
                        {saving ? "Menyimpan..." : "Simpan Saldo Awal"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Saldo Badge — tanda visual posisi saldo (Debit/Kredit) ──────────────────
function SaldoBadge({
    amount,
    size = "sm",
    normalSide,
}: {
    amount: number;
    size?: "sm" | "md";
    normalSide?: NormalSide;
}) {
    const isDebit = amount >= 0;
    const actualSide: "DEBIT" | "KREDIT" = isDebit ? "DEBIT" : "KREDIT";
    const isAbnormal = !!normalSide && normalSide !== actualSide;

    const cls = isAbnormal
        ? "bg-red-50 text-red-700 border-red-200"
        : isDebit
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-emerald-50 text-emerald-700 border-emerald-200";

    const sizeCls = size === "md" ? "px-2.5 py-1 text-[11px] gap-1.5" : "px-1.5 py-0.5 text-[9px] gap-1";

    return (
        <span
            className={`inline-flex items-center rounded-full border font-black ${cls} ${sizeCls}`}
            title={
                isAbnormal
                    ? `Saldo tidak wajar — akun ini normalnya di sisi ${normalSide === "DEBIT" ? "Debit" : "Kredit"}`
                    : undefined
            }
        >
            <span>{isAbnormal ? "⚠️" : "💰"}</span>
            <span>{isDebit ? "D" : "K"}</span>
        </span>
    );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function Stat({ label, value, tone }: { label: string; value: string; tone: "gray" | "blue" | "emerald" }) {
    const map = {
        gray: "border-gray-200 text-gray-900",
        blue: "border-blue-200 text-blue-800",
        emerald: "border-emerald-200 text-emerald-800",
    };
    return (
        <div className={`bg-white rounded-xl border p-4 ${map[tone]}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-50 mb-1">{label}</p>
            <p className="text-base font-black font-mono truncate">{value}</p>
        </div>
    );
}