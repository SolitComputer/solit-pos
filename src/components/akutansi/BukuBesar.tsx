"use client";
// src/components/akutansi/BukuBesar.tsx

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ACCOUNTS, ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/accounting";
import { Lock, Pencil, BookOpen, Check, X, AlertTriangle, DollarSign, Search } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LedgerLine {
    id: string;
    tanggal: string;
    keterangan: string;
    // (baru) keterangan entry (judul) & keterangan per-baris, dipisah supaya bisa
    // ditampilkan bertingkat. Null-safe: kalau route belum mengirim, fallback ke `keterangan`.
    keterangan_entry?: string | null;
    keterangan_baris?: string | null;
    ref: string;
    // (baru) No. Jurnal (kode GJ) — dikembalikan /api/akutansi/buku-besar kalau
    // barisnya berasal dari journal_entries yang punya journal_no. Opsional &
    // null-safe: kalau route belum mengembalikannya, kolom "No. Jurnal" cukup
    // nampilin "—" tanpa error.
    journal_no?: string | null;
    side: "DEBIT" | "KREDIT";
    debit: number;
    kredit: number;
    saldo_debit: number;
    saldo_kredit: number;
    checked: boolean;
    checked_at: string | null;
    checked_by_name: string | null;
    is_synthetic: boolean;
    trx_meta: {
        company_name: string | null;
        cpu: string | null;
        ram: string | null;
        storage: string | null;
    } | null;
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

// (baru) Satu baris Neraca Saldo — dipakai cuma buat angka saldo di sidebar akun.
// Bentuknya mengikuti /api/akutansi/neraca (lihat Neraca.tsx).
interface NeracaRow {
    code: string;
    name: string;
    debit: number;
    kredit: number;
    is_abnormal: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number) => `Rp${Math.round(Number(n || 0)).toLocaleString("id-ID")}`;
// (baru) Format ringkas buat sidebar — biar muat di kolom sempit: 85.600.000 → "85.6jt".
// 0 ditampilkan "—" supaya akun tanpa saldo nggak ramai.
const rpShort = (n: number) => {
    const v = Math.abs(Math.round(Number(n || 0)));
    if (v === 0) return "—";
    return `${(v / 1_000_000).toFixed(1)}jt`;
};
const fmtTgl = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });
// (baru) — format tanggal + jam (WIB) khusus buat tooltip "Cek", beda dari fmtTgl yang cuma tanggal
const fmtTglJam = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
    });

// Badge nama toko — replikasi persis logic getCompanyBadge() di JurnalUmum.tsx,
// supaya label & warnanya konsisten antar tab Akuntansi.
function getCompanyBadge(company?: string | null): { label: string; color: string } | null {
    if (!company) return null;
    const cn = company.toLowerCase();
    if (cn.includes("sotech")) return { label: "Sotech", color: "bg-orange-50 text-orange-700 border-orange-200" };
    if (cn.includes("solit")) return { label: "Solit 03", color: "bg-blue-50 text-blue-700 border-blue-200" };
    if (cn.includes("on point") || cn.includes("onpoint")) return { label: "On Point", color: "bg-purple-50 text-purple-700 border-purple-200" };
    if (cn.includes("zenit.id")) return { label: "Zenit.id", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    if (cn.includes("zenit")) return { label: "Zenit", color: "bg-teal-50 text-teal-700 border-teal-200" };
    return { label: company.trim(), color: "bg-gray-50 text-gray-600 border-gray-200" };
}

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

export default function BukuBesar({ period, branch = "ALL" }: { period: string; branch?: "ALL" | "JOGJA" }) {
    const [allAccounts, setAllAccounts] = useState<{ code: string; name: string; type: string }[]>(ACCOUNTS);
    const [accountCode, setAccountCode] = useState<string>(ACCOUNTS[0]?.code ?? "");
    const [tableSearch, setTableSearch] = useState("");
    // Filter status cek: "all" = semua, "checked" = sudah dicek, "unchecked" = belum dicek
    const [checkFilter, setCheckFilter] = useState<"all" | "checked" | "unchecked">("all");
    // Filter nama pencentang: "all" = semua, atau nama orang tertentu (lihat hanya baris yang dia cek)
    const [checkerFilter, setCheckerFilter] = useState<string>("all");
    const [data, setData] = useState<LedgerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showOpeningModal, setShowOpeningModal] = useState(false);
    // (baru) Saldo seluruh akun (Neraca Saldo) buat angka di sidebar. Dipisah dari
    // `data` yang hanya 1 akun. Gagal fetch-nya diabaikan — sidebar tetap jalan
    // tanpa angka (nggak nge-block buku besar utama).
    const [neraca, setNeraca] = useState<NeracaRow[]>([]);
    // (fix) baris id yang lagi proses centang (PATCH belum selesai) — dipakai load()
    // supaya auto-refresh nggak nimpa optimistic update yang belum ke-confirm server.
    const pendingChecksRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        fetch("/api/akutansi/accounts")
            .then((r) => r.json())
            .then((j) => { if (j.success) setAllAccounts(j.data); })
            .catch(() => { });
    }, []);

    const load = useCallback(async (opts?: { silent?: boolean }) => {
        if (!accountCode) return;
        const silent = opts?.silent ?? false;
        if (!silent) setLoading(true);
        setError("");
        try {
            const branchQS = branch === "JOGJA" ? "&branch=JOGJA" : "";
            const res = await fetch(`/api/akutansi/buku-besar?period=${period}&account_code=${accountCode}${branchQS}`);
            const json = await res.json();
            if (!json.success) {
                if (!silent) {
                    setError(json.message ?? "Gagal memuat buku besar");
                    setData(null);
                }
                return;
            }
            setData((prev) => {
                // (fix) kalau ada centang yang masih pending, pertahankan nilai checked
                // lokal untuk baris itu — jangan biarkan snapshot GET yang datang telat
                // (diambil sebelum PATCH commit) menimpa balik jadi unchecked.
                if (pendingChecksRef.current.size === 0 || !prev) return json.data;
                const prevById = new Map(prev.lines.map((l) => [l.id, l]));
                const mergedLines = json.data.lines.map((l: LedgerLine) => {
                    if (!pendingChecksRef.current.has(l.id)) return l;
                    const local = prevById.get(l.id);
                    return local
                        ? { ...l, checked: local.checked, checked_at: local.checked_at, checked_by_name: local.checked_by_name }
                        : l;
                });
                return { ...json.data, lines: mergedLines };
            });
        } catch {
            if (!silent) {
                setError("Koneksi bermasalah");
                setData(null);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [period, accountCode, branch]);

    // (baru) Muat Neraca Saldo (semua akun) buat angka di sidebar. Read-only,
    // nggak ngubah logic buku besar; error-nya sengaja ditelan.
    const loadNeraca = useCallback(async () => {
        try {
            const branchQS = branch === "JOGJA" ? "&branch=JOGJA" : "";
            const res = await fetch(`/api/akutansi/neraca?period=${period}${branchQS}`, { cache: "no-store" });
            const json = await res.json();
            if (json.success && Array.isArray(json.data?.rows)) setNeraca(json.data.rows);
        } catch {
            /* sidebar saldo bersifat opsional — abaikan kalau gagal */
        }
    }, [period, branch]);

    // Toggle status "sudah dicek" per baris jurnal.
    // Optimistic update dulu (UI langsung berubah), lalu simpan ke server;
    // kalau gagal, rollback ke nilai sebelumnya supaya tidak beda dengan DB.
    const toggleChecked = useCallback(async (lineId: string, next: boolean) => {
        // (fix) guard: kalau baris ini masih ada PATCH yang berjalan, abaikan klik baru.
        // Tanpa ini, klik cepat berturut-turut bisa kirim 2 PATCH bareng untuk line_id
        // yang sama dan responsnya bisa datang tidak berurutan — ini akar masalah
        // checklist "kadang kesimpan kadang enggak".
        if (pendingChecksRef.current.has(lineId)) return;
        pendingChecksRef.current.add(lineId);
        setData((prev) =>
            prev
                ? {
                    ...prev,
                    lines: prev.lines.map((l) =>
                        l.id === lineId
                            ? { ...l, checked: next, checked_at: next ? new Date().toISOString() : null, checked_by_name: next ? l.checked_by_name : null }
                            : l
                    ),
                }
                : prev
        );
        try {
            const res = await fetch("/api/akutansi/buku-besar/check", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ line_id: lineId, checked: next }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            // (baru) sinkronkan nama pencentang dari respons server — server yang tau siapa
            // user yg login (bukan tebakan client), jadi tooltip langsung akurat tanpa reload.
            if (next) {
                setData((prev) =>
                    prev
                        ? {
                            ...prev,
                            lines: prev.lines.map((l) =>
                                l.id === lineId ? { ...l, checked_by_name: json.data?.checked_by_name ?? null } : l
                            ),
                        }
                        : prev
                );
            }
        } catch {
            // (fix) hanya balikin flag `checked` ke kebalikan `next` (state sebelum
            // optimistic update). Sebelumnya di sini juga nebak-nebak checked_at/checked_by_name
            // secara manual dan hasilnya salah (khusus gagal uncheck, checked_at malah
            // ditulis ulang ke waktu sekarang, checked_by_name juga tidak dikembalikan).
            // Solusinya: tarik ulang data asli dari server secara silent supaya kedua
            // field itu akurat, bukan ditebak di client.
            setData((prev) =>
                prev
                    ? {
                        ...prev,
                        lines: prev.lines.map((l) => (l.id === lineId ? { ...l, checked: !next } : l)),
                    }
                    : prev
            );
            load({ silent: true });
        } finally {
            pendingChecksRef.current.delete(lineId);
        }
    }, [load]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        loadNeraca();
    }, [loadNeraca]);

    // Auto-refresh saat user kembali ke tab ini (misal habis edit di Jurnal Umum
    // lalu balik lagi ke Buku Besar) — supaya data selalu sinkron tanpa perlu reload manual.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible") {
                load({ silent: true });
                loadNeraca();
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
    }, [load, loadNeraca]);

    // (baru) Peta kode akun → saldo (dari Neraca Saldo) buat ditampilkan di sidebar.
    const neracaByCode = useMemo(() => {
        const m = new Map<string, { net: number; abnormal: boolean }>();
        for (const r of neraca) m.set(r.code, { net: r.debit - r.kredit, abnormal: r.is_abnormal });
        return m;
    }, [neraca]);

    // Filter baris buku besar berdasarkan keterangan, nominal debit, atau nominal kredit.
    const filteredLines = useMemo(() => {
        if (!data) return [];
        const q = tableSearch.trim().toLowerCase();
        return data.lines.filter((l) => {
            // 1) Filter status cek
            //    - "checked": hanya baris yang sudah dicek
            //    - "unchecked": belum dicek DAN bukan baris sintetis (sintetis nggak bisa dicek manual)
            if (checkFilter === "checked" && !l.checked) return false;
            if (checkFilter === "unchecked" && (l.checked || l.is_synthetic)) return false;

            // 1b) Filter nama pencentang — kalau nama dipilih, hanya baris yang dicek orang itu
            if (checkerFilter !== "all" && l.checked_by_name !== checkerFilter) return false;

            // 2) Filter pencarian teks (kalau kosong, lolos semua)
            if (!q) return true;
            if (l.keterangan.toLowerCase().includes(q)) return true;
            if (l.journal_no && l.journal_no.toLowerCase().includes(q)) return true;
            if (l.debit > 0 && (String(l.debit).includes(q) || rp(l.debit).toLowerCase().includes(q))) return true;
            if (l.kredit > 0 && (String(l.kredit).includes(q) || rp(l.kredit).toLowerCase().includes(q))) return true;
            return false;
        });
    }, [data, tableSearch, checkFilter, checkerFilter]);

    // Daftar nama pencentang yang unik (buat opsi dropdown filter).
    // Diambil dari baris yang sudah dicek & punya nama — diurut alfabet biar rapi.
    const checkerNames = useMemo(() => {
        if (!data) return [];
        const set = new Set<string>();
        for (const l of data.lines) {
            if (l.checked && l.checked_by_name) set.add(l.checked_by_name);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, "id-ID"));
    }, [data]);

    // Kalau nama yang sedang difilter sudah tidak ada lagi di daftar pencentang
    // (misal baris terakhirnya di-uncheck), balikin filter ke "Semua" biar tabel
    // nggak jadi kosong tanpa sebab yang kelihatan.
    // CATATAN: wajib DI BAWAH `checkerNames` — kalau di atas, variabelnya masih
    // di TDZ saat baris ini dirender (ini persis sumber error-nya).
    useEffect(() => {
        if (checkerFilter !== "all" && !checkerNames.includes(checkerFilter)) {
            setCheckerFilter("all");
        }
    }, [checkerNames, checkerFilter]);

    const normalSide = useMemo(() => getNormalSide(accountCode), [accountCode]);

    // Jumlah baris yang sudah dicek, ditampilkan di header kolom "Cek" (paling atas tabel)
    const checkedCount = useMemo(
        () => (data ? data.lines.filter((l) => l.checked).length : 0),
        [data]
    );

    return (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/* ══════════════════ SIDEBAR AKUN ══════════════════ */}
            {/* Mobile/tablet (< lg): dropdown ringkas — sidebar penuh terlalu makan tempat */}
            <div className="lg:hidden w-full bg-white rounded-xl border border-gray-200 p-3 flex gap-2">
                <select
                    value={accountCode}
                    onChange={(e) => setAccountCode(e.target.value)}
                    className="flex-1 h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                >
                    {ACCOUNT_TYPE_ORDER.map((type) => {
                        const accs = allAccounts.filter((a) => a.type === type);
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
                    onClick={() => { load(); loadNeraca(); }}
                    disabled={loading}
                    title="Muat ulang data terbaru"
                    className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 active:scale-90 transition-all duration-150 disabled:opacity-40 shrink-0"
                >
                    <span className={loading ? "inline-block animate-spin" : "inline-block"}>⟳</span>
                </button>
            </div>

            {/* Desktop (≥ lg): daftar akun berkelompok + saldo tiap akun */}
            <aside className="hidden lg:flex lg:flex-col w-72 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Daftar Akun</span>
                    <button
                        onClick={() => { load(); loadNeraca(); }}
                        disabled={loading}
                        title="Muat ulang data terbaru"
                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700 active:scale-90 transition-all duration-150 disabled:opacity-40"
                    >
                        <span className={loading ? "inline-block animate-spin text-xs" : "inline-block text-xs"}>⟳</span>
                    </button>
                </div>
                <div className="overflow-y-auto max-h-[calc(100vh-220px)] py-1">
                    {ACCOUNT_TYPE_ORDER.map((type) => {
                        const accs = allAccounts.filter((a) => a.type === type);
                        if (accs.length === 0) return null;
                        return (
                            <div key={type} className="mb-1">
                                <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    {ACCOUNT_TYPE_LABEL[type]}
                                </p>
                                {accs.map((a) => {
                                    const active = a.code === accountCode;
                                    const info = neracaByCode.get(a.code);
                                    const net = info?.net ?? 0;
                                    return (
                                        <button
                                            key={a.code}
                                            onClick={() => setAccountCode(a.code)}
                                            className={`w-full flex items-center gap-2 px-4 py-2 text-left border-l-[3px] transition-colors duration-150 ${active
                                                ? "border-blue-600 bg-blue-50"
                                                : "border-transparent hover:bg-gray-50"
                                                }`}
                                        >
                                            <span className={`text-[11px] font-mono font-bold shrink-0 ${active ? "text-blue-600" : "text-gray-400"}`}>
                                                {a.code}
                                            </span>
                                            <span className={`text-[12px] flex-1 truncate ${active ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                                                {a.name}
                                            </span>
                                            <span className={`text-[11px] font-mono shrink-0 ${info?.abnormal ? "text-red-500" : "text-gray-400"}`}>
                                                {rpShort(net)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </aside>

            {/* ══════════════════ KONTEN KANAN ══════════════════ */}
            <div className="flex-1 min-w-0 w-full space-y-4">
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">{error}</div>
                )}

                {/* ── Saldo Awal Manual (one-time input) ── */}
                {data && (
                    <div
                        className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 flex-wrap ${data.opening_balance ? "bg-gray-50 border-gray-200" : "bg-amber-50 border-amber-200"
                            }`}
                    >
                        {data.opening_balance ? (
                            <>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-400"><Lock className="w-4 h-4" /></span>
                                    <span className="text-gray-600">
                                        Saldo awal manual akun ini:{" "}
                                        <b className="text-gray-900 font-mono">
                                            {rp(data.opening_balance.nominal)}
                                        </b>{" "}
                                        di sisi{" "}
                                        <b className={data.opening_balance.side === "DEBIT" ? "text-blue-700" : "text-emerald-700"}>
                                            {data.opening_balance.side === "DEBIT" ? "Debit" : "Kredit"}
                                        </b>
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowOpeningModal(true)}
                                    className="h-8 px-3 rounded-lg bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white text-[11px] font-bold hover:opacity-90 active:scale-[0.96] transition-all duration-150 whitespace-nowrap shrink-0 inline-flex items-center"
                                >
                                    <Pencil className="w-3.5 h-3.5 inline mr-1" /> Koreksi
                                </button>
                            </>
                        ) : (
                            <>
                                <span className="text-xs text-amber-800">
                                    Akun ini belum punya saldo awal manual (saldo dihitung murni dari mutasi jurnal).
                                </span>
                                <button
                                    onClick={() => setShowOpeningModal(true)}
                                    className="h-8 px-3 rounded-lg bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 active:scale-[0.96] transition-all duration-150 whitespace-nowrap"
                                >
                                    + Set Saldo Awal
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* ══════════════════ KARTU BUKU BESAR ══════════════════ */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Header kartu: kode · nama + badge saldo normal */}
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                        <h3 className="text-base font-black text-gray-900 flex items-center gap-2 min-w-0">
                            <span className="font-mono text-blue-600">{data ? data.account.code : "—"}</span>
                            <span className="truncate">{data ? data.account.name : "Pilih akun"}</span>
                        </h3>
                        {normalSide && (
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                                Saldo normal: {normalSide === "DEBIT" ? "Debit" : "Kredit"}
                            </span>
                        )}
                    </div>

                    {/* Strip 4 angka ringkas */}
                    {data && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
                            <SummaryCell label="Saldo Awal" value={rp(Math.abs(data.saldo_awal))} tone="dark" badge={<SaldoBadge amount={data.saldo_awal} normalSide={normalSide} />} />
                            <SummaryCell label="Mutasi Debit" value={rp(data.totals.debit)} tone="blue" />
                            <SummaryCell label="Mutasi Kredit" value={rp(data.totals.kredit)} tone="emerald" />
                            <SummaryCell label="Saldo Akhir" value={rp(Math.abs(data.totals.saldo_akhir))} tone="dark" badge={<SaldoBadge amount={data.totals.saldo_akhir} normalSide={normalSide} />} />
                        </div>
                    )}

                    {/* Toolbar: cari + filter */}
                    {data && (
                        <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row gap-2 sm:items-center">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    value={tableSearch}
                                    onChange={(e) => setTableSearch(e.target.value)}
                                    placeholder="Cari keterangan, no. jurnal, atau nominal..."
                                    className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                                />
                            </div>
                            {data.lines.length > 0 && (
                                <div className="flex gap-2 flex-wrap shrink-0">
                                    {checkerNames.length > 0 && (
                                        <select
                                            value={checkerFilter}
                                            onChange={(e) => setCheckerFilter(e.target.value)}
                                            title="Filter berdasarkan siapa yang mencentang"
                                            className="h-9 border border-gray-200 rounded-lg px-3 pr-8 text-xs font-bold bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition cursor-pointer"
                                        >
                                            <option value="all">Semua Pencentang</option>
                                            {checkerNames.map((name) => (
                                                <option key={name} value={name}>
                                                    {name} ({data.lines.filter((l) => l.checked_by_name === name).length})
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <select
                                        value={checkFilter}
                                        onChange={(e) => setCheckFilter(e.target.value as "all" | "checked" | "unchecked")}
                                        className="h-9 border border-gray-200 rounded-lg px-3 pr-8 text-xs font-bold bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition cursor-pointer"
                                    >
                                        <option value="all">Semua ({data.lines.length})</option>
                                        <option value="checked">Sudah Dicek ({data.lines.filter((l) => l.checked).length})</option>
                                        <option value="unchecked">Belum Dicek ({data.lines.filter((l) => !l.checked && !l.is_synthetic).length})</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Mobile: kartu per mutasi ── */}
                    <div className="md:hidden p-3 space-y-2">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="bg-white rounded-xl border border-gray-200 p-3.5 space-y-2 animate-pulse">
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                                </div>
                            ))
                        ) : !data ? (
                            <div className="py-16 text-center text-sm text-gray-400">Pilih akun untuk melihat buku besar</div>
                        ) : (
                            <>
                                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3.5 flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-gray-500 italic">Saldo Awal</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-mono font-bold text-gray-900">{rp(Math.abs(data.saldo_awal))}</span>
                                        <SaldoBadge amount={data.saldo_awal} normalSide={normalSide} />
                                    </div>
                                </div>

                                {data.lines.length === 0 ? (
                                    <div className="bg-white rounded-xl border border-gray-200 py-14 text-center">
                                        <div className="flex justify-center mb-3 opacity-40"><BookOpen className="w-10 h-10" /></div>
                                        <p className="text-sm text-gray-500 font-medium">Belum ada mutasi di periode ini</p>
                                        <p className="text-xs text-gray-400 mt-1 px-6">Konfirmasi data di Jurnal Umum agar muncul di sini.</p>
                                    </div>
                                ) : filteredLines.length === 0 ? (
                                    <div className="bg-white rounded-xl border border-gray-200 py-14 text-center">
                                        <div className="flex justify-center mb-3 opacity-40"><Search className="w-10 h-10" /></div>
                                        <p className="text-sm text-gray-500 font-medium">Tidak ada baris yang cocok</p>
                                        <p className="text-xs text-gray-400 mt-1 px-6">Coba kata kunci lain untuk keterangan, no. jurnal, debit, atau kredit.</p>
                                    </div>
                                ) : (
                                    filteredLines.map((l) => {
                                        const companyBadge = getCompanyBadge(l.trx_meta?.company_name);
                                        const specParts = [l.trx_meta?.cpu, l.trx_meta?.ram, l.trx_meta?.storage].filter(Boolean) as string[];
                                        const saldoNet = l.saldo_debit > 0 ? l.saldo_debit : -l.saldo_kredit;
                                        return (
                                            <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-3.5">
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[11px] font-semibold text-gray-500">{fmtTgl(l.tanggal)}</span>
                                                        {l.journal_no && (
                                                            <span className="text-[10px] font-mono font-bold text-blue-600">{l.journal_no}</span>
                                                        )}
                                                    </div>
                                                    {l.is_synthetic ? (
                                                        <span
                                                            title="Baris otomatis (modal belum diinput) — tidak bisa dicek manual"
                                                            className="w-7 h-7 rounded-md border border-dashed border-gray-200 flex items-center justify-center text-gray-300 shrink-0"
                                                        >
                                                            —
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => toggleChecked(l.id, !l.checked)}
                                                            title={
                                                                l.checked
                                                                    ? `Sudah dicek${l.checked_at ? " · " + fmtTglJam(l.checked_at) : ""} · ${l.checked_by_name ? "oleh " + l.checked_by_name : "pencentang tidak tercatat"}`
                                                                    : "Tandai sudah dicek"
                                                            }
                                                            className={`w-7 h-7 rounded-md border flex items-center justify-center active:scale-90 transition-all duration-150 shrink-0 ${l.checked
                                                                ? "bg-green-600 border-green-600 text-white"
                                                                : "bg-white border-gray-300 text-gray-300"
                                                                }`}
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                                    {companyBadge && (
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${companyBadge.color}`}>
                                                            {companyBadge.label}
                                                        </span>
                                                    )}
                                                    {l.is_synthetic && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-0.5" title="Harga modal belum diinput di transaksi ini">
                                                            <AlertTriangle className="w-2.5 h-2.5" /> Modal Rp0
                                                        </span>
                                                    )}
                                                    {l.ref && <span className="text-[10px] font-mono font-bold text-gray-400">Ref: {l.ref}</span>}
                                                </div>
                                                {l.keterangan_entry ? (
                                                    <p className="text-[13px] font-semibold text-gray-900">{l.keterangan_entry}</p>
                                                ) : (
                                                    <p className="text-[13px] text-gray-800">{l.keterangan}</p>
                                                )}
                                                {l.keterangan_baris && l.keterangan_baris !== l.keterangan_entry && (
                                                    <p className="text-[12px] text-gray-500 mt-0.5 pl-2 border-l-2 border-gray-200">{l.keterangan_baris}</p>
                                                )}
                                                {specParts.length > 0 && (
                                                    <p className="text-[10px] text-gray-400 mt-0.5">{specParts.join(" · ")}</p>
                                                )}
                                                {l.checked && (
                                                    <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                                                        <Check className="w-2.5 h-2.5" />
                                                        Dicek {l.checked_by_name ?? "—"}
                                                        {l.checked_at && <span className="text-gray-400 font-normal">· {fmtTglJam(l.checked_at)}</span>}
                                                    </p>
                                                )}

                                                <div className="mt-2.5 pt-2.5 border-t border-gray-100 grid grid-cols-3 gap-x-3 gap-y-1 text-[12px] font-mono">
                                                    <span className="text-gray-400 text-[10px] uppercase font-sans font-bold">Debit</span>
                                                    <span className="text-gray-400 text-[10px] uppercase font-sans font-bold">Kredit</span>
                                                    <span className="text-gray-400 text-[10px] uppercase font-sans font-bold text-right">Saldo</span>
                                                    <span className={l.is_synthetic ? "text-gray-400" : "font-bold text-gray-900"}>
                                                        {l.debit > 0 || (l.is_synthetic && l.side === "DEBIT") ? rp(l.debit) : "—"}
                                                    </span>
                                                    <span className={l.is_synthetic ? "text-gray-400" : "font-bold text-gray-900"}>
                                                        {l.kredit > 0 || (l.is_synthetic && l.side === "KREDIT") ? rp(l.kredit) : "—"}
                                                    </span>
                                                    <span className="text-right font-bold inline-flex items-center justify-end gap-1">
                                                        <span className="text-gray-900">{rp(Math.abs(saldoNet))}</span>
                                                        <SaldoBadge amount={saldoNet} normalSide={normalSide} />
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}

                                {data.lines.length > 0 && (
                                    <div className="rounded-xl border-2 border-gray-300 bg-gray-50 p-3.5">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-gray-600 uppercase">Total &amp; Saldo Akhir</span>
                                            <SaldoBadge amount={data.totals.saldo_akhir} size="md" normalSide={normalSide} />
                                        </div>
                                        <div className="grid grid-cols-3 gap-x-3 text-sm font-black font-mono">
                                            <span className="text-gray-900">{rp(data.totals.debit)}</span>
                                            <span className="text-gray-900">{rp(data.totals.kredit)}</span>
                                            <span className="text-gray-900 text-right">{rp(Math.abs(data.totals.saldo_akhir))}</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ── Desktop/tablet: Tabel Buku Besar ── */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border-collapse" style={{ minWidth: "960px" }}>
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[92px]">Tanggal</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[120px]">No. Jurnal</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">Keterangan</th>
                                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[130px]">Debit</th>
                                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[130px]">Kredit</th>
                                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[150px]">Saldo</th>
                                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[64px] border-l-2 border-gray-200">
                                        <div>Cek</div>
                                        {data && data.lines.length > 0 && (
                                            <div className="mt-1 text-[10px] font-bold text-gray-400 normal-case tracking-normal font-mono whitespace-nowrap">
                                                {checkedCount}/{data.lines.length}
                                            </div>
                                        )}
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
                                        {/* Baris Saldo Awal periode */}
                                        <tr className="bg-gray-50/70">
                                            <td colSpan={5} className="px-4 py-2.5">
                                                <span className="text-[11px] font-bold text-gray-500 italic">Saldo awal periode</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className="inline-flex items-center gap-1.5 text-[12px] font-mono font-bold text-gray-700">
                                                    {rp(Math.abs(data.saldo_awal))}
                                                    <SaldoBadge amount={data.saldo_awal} normalSide={normalSide} />
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center text-gray-300 border-l-2 border-gray-100">—</td>
                                        </tr>

                                        {data.lines.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-14 text-center">
                                                    <div className="flex justify-center mb-3 opacity-40"><BookOpen className="w-10 h-10" /></div>
                                                    <p className="text-sm text-gray-500 font-medium">Belum ada mutasi di periode ini</p>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        Konfirmasi data di Jurnal Umum agar muncul di sini.
                                                    </p>
                                                </td>
                                            </tr>
                                        ) : filteredLines.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-14 text-center">
                                                    <div className="flex justify-center mb-3 opacity-40"><Search className="w-10 h-10" /></div>
                                                    <p className="text-sm text-gray-500 font-medium">Tidak ada baris yang cocok dengan pencarian</p>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        Coba kata kunci lain untuk keterangan, no. jurnal, debit, atau kredit.
                                                    </p>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredLines.map((l) => {
                                                const companyBadge = getCompanyBadge(l.trx_meta?.company_name);
                                                const specParts = [l.trx_meta?.cpu, l.trx_meta?.ram, l.trx_meta?.storage].filter(Boolean) as string[];
                                                const saldoNet = l.saldo_debit > 0 ? l.saldo_debit : -l.saldo_kredit;
                                                return (
                                                    <tr key={l.id} className="hover:bg-blue-50/30 transition border-b border-gray-50">
                                                        <td className="px-4 py-2.5 text-[11px] font-semibold text-gray-700 whitespace-nowrap align-top">
                                                            {fmtTgl(l.tanggal)}
                                                        </td>
                                                        <td className="px-4 py-2.5 align-top">
                                                            {l.journal_no ? (
                                                                <span className="text-[11px] font-mono font-bold text-blue-600">{l.journal_no}</span>
                                                            ) : (
                                                                <span className="text-[11px] font-mono text-gray-300">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-[11px] text-gray-800 align-top">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                {companyBadge && (
                                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${companyBadge.color}`}>
                                                                        {companyBadge.label}
                                                                    </span>
                                                                )}
                                                                {l.is_synthetic && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-0.5" title="Harga modal belum diinput di transaksi ini">
                                                                        <AlertTriangle className="w-2.5 h-2.5" /> Modal Rp0
                                                                    </span>
                                                                )}
                                                                {l.keterangan_entry ? (
                                                                    <span className="font-semibold text-gray-900">{l.keterangan_entry}</span>
                                                                ) : (
                                                                    <span>{l.keterangan}</span>
                                                                )}
                                                            </div>
                                                            {l.keterangan_baris && l.keterangan_baris !== l.keterangan_entry && (
                                                                <div className="text-[11px] text-gray-500 mt-0.5 pl-0.5 border-l-2 border-gray-200 ml-0.5 pl-2">
                                                                    {l.keterangan_baris}
                                                                </div>
                                                            )}
                                                            {(specParts.length > 0 || l.ref) && (
                                                                <div className="text-[10px] text-gray-400 mt-0.5">
                                                                    {l.ref && <span className="font-mono mr-2">Ref: {l.ref}</span>}
                                                                    {specParts.join(" · ")}
                                                                </div>
                                                            )}
                                                            {l.checked && (
                                                                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                                                                    <Check className="w-2.5 h-2.5" />
                                                                    Dicek {l.checked_by_name ?? "—"}
                                                                    {l.checked_at && (
                                                                        <span className="text-gray-400 font-normal">· {fmtTglJam(l.checked_at)}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className={`px-4 py-2.5 text-right text-[12px] font-mono align-top ${l.is_synthetic ? "text-gray-400" : "font-bold text-gray-900"}`}>
                                                            {l.debit > 0 || (l.is_synthetic && l.side === "DEBIT") ? rp(l.debit) : ""}
                                                        </td>
                                                        <td className={`px-4 py-2.5 text-right text-[12px] font-mono align-top ${l.is_synthetic ? "text-gray-400" : "font-bold text-gray-900"}`}>
                                                            {l.kredit > 0 || (l.is_synthetic && l.side === "KREDIT") ? rp(l.kredit) : ""}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right align-top">
                                                            <span className="inline-flex items-center justify-end gap-1.5 text-[12px] font-mono font-bold text-gray-900">
                                                                {rp(Math.abs(saldoNet))}
                                                                <SaldoBadge amount={saldoNet} normalSide={normalSide} />
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center border-l-2 border-gray-100 align-top">
                                                            {l.is_synthetic ? (
                                                                <span
                                                                    title="Baris otomatis (modal belum diinput) — tidak bisa dicek manual"
                                                                    className="w-6 h-6 rounded-md border border-dashed border-gray-200 flex items-center justify-center text-gray-300 mx-auto"
                                                                >
                                                                    —
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => toggleChecked(l.id, !l.checked)}
                                                                    title={
                                                                        l.checked
                                                                            ? `Sudah dicek${l.checked_at ? " · " + fmtTglJam(l.checked_at) : ""} · ${l.checked_by_name ? "oleh " + l.checked_by_name : "pencentang tidak tercatat (data sebelum fitur ini aktif)"}`
                                                                            : "Tandai sudah dicek"
                                                                    }
                                                                    className={`w-6 h-6 rounded-md border flex items-center justify-center text-[11px] font-black active:scale-90 transition-all duration-150 mx-auto ${l.checked
                                                                        ? "bg-green-600 border-green-600 text-white"
                                                                        : "bg-white border-gray-300 text-transparent hover:border-gray-400 hover:text-gray-300"
                                                                        }`}
                                                                >
                                                                    <Check className="w-3.5 h-3.5 mx-auto" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </>
                                )}
                            </tbody>

                            {data && data.lines.length > 0 && (
                                <tfoot>
                                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                                        <td colSpan={3} className="px-4 py-3">
                                            <span className="text-xs font-bold text-gray-600 uppercase">Saldo Akhir</span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-black text-gray-900 font-mono">
                                            {rp(data.totals.debit)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-black text-gray-900 font-mono">
                                            {rp(data.totals.kredit)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="inline-flex items-center justify-end gap-1.5 text-sm font-black text-gray-900 font-mono">
                                                {rp(Math.abs(data.totals.saldo_akhir))}
                                                <SaldoBadge amount={data.totals.saldo_akhir} size="md" normalSide={normalSide} />
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-center border-l-2 border-gray-200" />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </div>

            {/* ── Modal Set/Edit Saldo Awal ── */}
            {showOpeningModal && data && (
                <OpeningBalanceModal
                    accountCode={data.account.code}
                    accountLabel={`${data.account.code} · ${data.account.name}`}
                    existing={data.opening_balance}
                    onClose={() => setShowOpeningModal(false)}
                    onSaved={() => {
                        setShowOpeningModal(false);
                        load();
                        loadNeraca();
                    }}
                />
            )}
        </div>
    );
}

// ─── Sel ringkasan di header kartu ──────────────────────────────────────────
function SummaryCell({
    label,
    value,
    tone,
    badge,
}: {
    label: string;
    value: string;
    tone: "dark" | "blue" | "emerald";
    badge?: ReactNode;
}) {
    const valueColor = tone === "blue" ? "text-blue-700" : tone === "emerald" ? "text-emerald-700" : "text-gray-900";
    return (
        <div className="px-5 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
            <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-[15px] font-black font-mono ${valueColor}`}>{value}</p>
                {badge}
            </div>
        </div>
    );
}

// ─── Modal: Set/Edit Saldo Awal ────────────────────────────────────────────
function OpeningBalanceModal({
    accountCode,
    accountLabel,
    existing,
    onClose,
    onSaved,
}: {
    accountCode: string;
    accountLabel: string;
    existing: OpeningBalance | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = !!existing;
    const [side, setSide] = useState<"DEBIT" | "KREDIT">(existing?.side ?? "DEBIT");
    const [nominalInput, setNominalInput] = useState<string>(
        existing ? String(existing.nominal) : ""
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setError("");
        if (nominalInput.trim() === "") return setError("Nominal wajib diisi");
        const nominal = Number(nominalInput);
        if (!Number.isFinite(nominal) || nominal <= 0) return setError("Nominal harus lebih dari 0");

        const ok = confirm(
            isEdit
                ? `Yakin KOREKSI saldo awal "${accountLabel}" menjadi ${rp(nominal)} di sisi ${side === "DEBIT" ? "Debit" : "Kredit"
                }?\n\nPERINGATAN: Ini akan mengubah saldo berjalan di seluruh periode setelahnya. Pastikan sudah benar.`
                : `Yakin input saldo awal "${accountLabel}" sebesar ${rp(nominal)} di sisi ${side === "DEBIT" ? "Debit" : "Kredit"
                }?`
        );
        if (!ok) return;

        setSaving(true);
        try {
            const res = await fetch("/api/akutansi/saldo-awal", {
                method: isEdit ? "PUT" : "POST",
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
            <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className={`h-1 ${isEdit ? "bg-gradient-to-r from-red-500 to-red-700" : "bg-gradient-to-r from-[#0f0c29] to-[#1a1545]"}`} />
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm">
                            {isEdit ? "Koreksi Saldo Awal" : "Set Saldo Awal"}
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">{accountLabel}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 active:scale-90 transition-all duration-150 flex items-center justify-center"><X className="w-4 h-4" /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div className={`rounded-xl px-3 py-2.5 text-[11px] leading-relaxed border ${isEdit ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
                        }`}>
                        {isEdit ? (
                            <><AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" /> Ini <b>koreksi</b> saldo awal yang sudah tersimpan. Perubahan langsung mempengaruhi saldo berjalan di semua periode setelahnya — pastikan nominal & sisinya sudah benar.</>
                        ) : (
                            <><AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" /> Saldo awal hanya bisa diinput <b>1 kali</b> secara normal, tapi bisa dikoreksi lagi kapan saja lewat tombol "Koreksi" kalau ada kesalahan.</>
                        )}
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Sisi Saldo</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setSide("DEBIT")}
                                className={`h-10 rounded-lg text-sm font-bold border active:scale-[0.97] transition-all duration-150 ${side === "DEBIT"
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                    }`}
                            >
                                Debit
                            </button>
                            <button
                                type="button"
                                onClick={() => setSide("KREDIT")}
                                className={`h-10 rounded-lg text-sm font-bold border active:scale-[0.97] transition-all duration-150 ${side === "KREDIT"
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
                            value={nominalInput}
                            onChange={(e) => setNominalInput(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="0"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 active:scale-[0.97] transition-all duration-150"
                    >
                        Batal
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving || nominalInput.trim() === ""}
                        className={`flex-1 h-10 text-white rounded-xl text-sm font-bold active:scale-[0.97] transition-all duration-150 disabled:opacity-40 disabled:active:scale-100 ${isEdit ? "bg-red-600 hover:bg-red-700" : "bg-gradient-to-br from-[#0f0c29] to-[#1a1545] hover:opacity-90"
                            }`}
                    >
                        {saving ? "Menyimpan..." : isEdit ? "Simpan Koreksi" : "Simpan Saldo Awal"}
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
            <span>{isAbnormal ? <AlertTriangle className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}</span>
            <span>{isDebit ? "D" : "K"}</span>
        </span>
    );
}