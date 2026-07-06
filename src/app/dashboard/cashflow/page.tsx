"use client";
// src/app/dashboard/cashflow/page.tsx

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/cashflow";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtRupiah = (n: number) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const fmtTanggal = (d?: string) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type Entry = {
  id: string;
  direction: "IN" | "OUT";
  category: string;
  nama: string;
  nominal: number;
  modal: number | null;
  keterangan: string | null;
  source_type: "MANUAL" | "TRANSACTION" | "SERVICE";
  tanggal: string;
  is_audited: boolean;
  audited_at: string | null;
  created_by_user?: { name: string } | null;
  audited_by_user?: { name: string } | null;
};

type Summary = { total_masuk: number; total_keluar: number; saldo: number; belum_audit: number };

// ── Icons ────────────────────────────────────────────────────────────────────
const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);
const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconClock = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 7 12 12 15 14" />
  </svg>
);

// ── Audit pill button ────────────────────────────────────────────────────────
function AuditToggle({ entry, onToggle, busy }: { entry: Entry; onToggle: () => void; busy: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition disabled:opacity-50 ${
        entry.is_audited
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
          : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
      }`}
      title={entry.audited_by_user?.name ? `Diaudit oleh ${entry.audited_by_user.name}` : "Klik untuk audit"}
    >
      {entry.is_audited ? <IconCheck /> : <IconClock />}
      {entry.is_audited ? "Sudah Audit" : "Belum Audit"}
    </button>
  );
}

// ── Expense Modal (input manual — uang keluar saja) ──────────────────────────
function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const categories = Object.entries(EXPENSE_CATEGORIES);

  const [nama, setNama] = useState("");
  const [category, setCategory] = useState(categories[0]?.[0] ?? "");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [modal, setModal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const submit = async () => {
    if (!nama.trim()) return setError("Nama wajib diisi");
    if (!nominal || Number(nominal) <= 0) return setError("Nominal harus lebih dari 0");
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: "OUT",
          category,
          nama: nama.trim(),
          nominal: Number(nominal),
          keterangan: keterangan.trim() || null,
          tanggal,
          modal: modal ? Number(modal) : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) return setError(json.message || "Gagal menyimpan");
      onSaved();
      onClose();
    } catch {
      setError("Terjadi kesalahan koneksi");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <IconPlus />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">Tambah Uang Keluar</p>
              <p className="text-[11px] text-gray-400">Pengeluaran manual</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nama</label>
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Contoh: Bayar listrik toko" className={inputCls} autoFocus />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {categories.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nominal</label>
              <input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} />
              {nominal && Number(nominal) > 0 && (
                <p className="text-[11px] text-gray-400 mt-1 font-mono">{fmtRupiah(Number(nominal))}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tanggal</label>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Harga Modal <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input type="number" value={modal} onChange={(e) => setModal(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} />
            {modal && Number(modal) > 0 && (
              <p className="text-[11px] text-gray-400 mt-1 font-mono">{fmtRupiah(Number(modal))}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Keterangan</label>
            <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} placeholder="Catatan tambahan..." className={`${inputCls.replace("h-10", "")} py-2 resize-none`} />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
          <button onClick={onClose} className="flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            Batal
          </button>
          <button onClick={submit} disabled={saving} className="flex-1 h-10 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-60">
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, accent, hint, loading,
}: {
  label: string; value: string; accent: "dark" | "red" | "amber"; hint?: string; loading: boolean;
}) {
  const accentMap = {
    dark: { bar: "bg-gray-900", text: "text-gray-900" },
    red: { bar: "bg-red-500", text: "text-red-600" },
    amber: { bar: "bg-amber-500", text: "text-amber-600" },
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`absolute top-0 left-0 h-full w-1 ${accentMap.bar}`} />
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-2xl font-black tracking-tight tabular-nums ${accentMap.text}`}>
        {loading ? <span className="text-gray-300">—</span> : value}
      </p>
      {hint && <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CashflowPage() {
  const [loading, setLoading] = useState(true);
  const [masuk, setMasuk] = useState<Entry[]>([]);
  const [keluar, setKeluar] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_masuk: 0, total_keluar: 0, saldo: 0, belum_audit: 0 });
  const [tab, setTab] = useState<"IN" | "OUT">("IN");
  const [showModal, setShowModal] = useState(false);
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((r) => {
        const roles: string[] = r.user?.roles?.length ? r.user.roles : [r.user?.role].filter(Boolean);
        setAllowed(roles.some((x) => ["ADMIN", "PROGRAMMER"].includes(x)));
      })
      .catch(() => setAllowed(false));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cashflow");
      const json = await res.json();
      if (json.success) {
        setMasuk(json.data.masuk ?? []);
        setKeluar(json.data.keluar ?? []);
        setSummary(json.summary);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) fetchData();
  }, [allowed, fetchData]);

  const toggleAudit = async (entry: Entry) => {
    setAuditingId(entry.id);
    try {
      const res = await fetch(`/api/cashflow/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_audit" }),
      });
      const json = await res.json();
      if (json.success) fetchData();
    } finally {
      setAuditingId(null);
    }
  };

  const deleteEntry = async (entry: Entry) => {
    if (!confirm(`Hapus "${entry.nama}"?`)) return;
    const res = await fetch(`/api/cashflow/${entry.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) fetchData();
    else alert(json.message || "Gagal menghapus");
  };

  if (allowed === false) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto mt-24 text-center">
          <div className="text-5xl mb-3">🔒</div>
          <p className="text-gray-600 font-semibold">Halaman ini hanya untuk Admin & Programmer.</p>
        </div>
      </DashboardLayout>
    );
  }

  const rows = tab === "IN" ? masuk : keluar;
  const colCount = tab === "OUT" ? 9 : 8;

  return (
    <DashboardLayout>
      {showModal && <ExpenseModal onClose={() => setShowModal(false)} onSaved={fetchData} />}

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 bg-gray-900 rounded-full" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Cashflow</h1>
              <p className="text-sm text-gray-500">Arus kas uang masuk & keluar · sejak 06 Jul 2026</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition"
            title="Refresh"
          >
            <IconRefresh />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Total Uang Keluar" value={fmtRupiah(summary.total_keluar)} accent="red" loading={loading} />
          <StatCard
            label="Saldo Cashflow"
            value={fmtRupiah(summary.saldo)}
            accent="dark"
            hint="Total masuk dikurangi total keluar"
            loading={loading}
          />
          <StatCard
            label="Belum Diaudit"
            value={`${summary.belum_audit} entry`}
            accent="amber"
            hint="Menunggu verifikasi audit"
            loading={loading}
          />
        </div>

        {/* Tabs + Add */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
            {(["IN", "OUT"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                  tab === t ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {t === "IN" ? `Uang Masuk (${masuk.length})` : `Uang Keluar (${keluar.length})`}
              </button>
            ))}
          </div>

          {/* Tombol tambah HANYA untuk uang keluar */}
          {tab === "OUT" && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition"
            >
              <IconPlus />
              Tambah Uang Keluar
            </button>
          )}
        </div>

        {/* Info uang masuk otomatis */}
        {tab === "IN" && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50/60 border border-blue-100 text-[12px] text-blue-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Uang masuk otomatis tercatat dari <b>Riwayat Transaksi</b> (lunas) & <b>Service</b>. Tidak ada input manual.
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 880 }}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  {["Tanggal", "Nama", "Kategori", "Nominal", ...(tab === "OUT" ? ["Modal"] : []), "Keterangan", "Audit", "Oleh", ""].map((h, i) => (
                    <th
                      key={i}
                      className={`px-3.5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                        h === "Nominal" || h === "Modal" ? "text-right" : "text-left"
                      } first:pl-5`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: colCount }).map((__, j) => (
                        <td key={j} className="px-3.5 py-3.5">
                          <div className="h-3 rounded-full bg-gray-100 animate-pulse" style={{ width: j === 1 ? 120 : 60 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-3.5 py-16 text-center">
                      <div className="text-3xl mb-2 opacity-30">📭</div>
                      <p className="text-sm text-gray-400 font-medium">
                        Belum ada data {tab === "IN" ? "uang masuk" : "uang keluar"}.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="pl-5 pr-3.5 py-3 text-[12px] text-gray-500 whitespace-nowrap">{fmtTanggal(e.tanggal)}</td>
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-gray-800">{e.nama}</span>
                          {e.source_type !== "MANUAL" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">AUTO</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="inline-flex text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                          {categoryLabel(e.direction, e.category)}
                        </span>
                      </td>
                      <td className={`px-3.5 py-3 text-right font-mono font-bold text-[13px] tabular-nums whitespace-nowrap ${e.direction === "IN" ? "text-emerald-600" : "text-red-600"}`}>
                        {e.direction === "IN" ? "+" : "−"}{fmtRupiah(e.nominal)}
                      </td>
                      {tab === "OUT" && (
                        <td className="px-3.5 py-3 text-right font-mono text-[12px] text-gray-400 tabular-nums whitespace-nowrap">
                          {e.modal ? fmtRupiah(e.modal) : "—"}
                        </td>
                      )}
                      <td className="px-3.5 py-3 text-[12px] text-gray-500 max-w-[220px] truncate">{e.keterangan || "—"}</td>
                      <td className="px-3.5 py-3">
                        <AuditToggle entry={e} busy={auditingId === e.id} onToggle={() => toggleAudit(e)} />
                      </td>
                      <td className="px-3.5 py-3 text-[11px] whitespace-nowrap">
                        {e.created_by_user?.name && <span className="text-gray-500" title="Dibuat oleh">✍️ {e.created_by_user.name}</span>}
                        {e.audited_by_user?.name && <span className="block text-emerald-600" title="Diaudit oleh">🔍 {e.audited_by_user.name}</span>}
                        {!e.created_by_user?.name && !e.audited_by_user?.name && <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        {e.source_type === "MANUAL" && (
                          <button onClick={() => deleteEntry(e)} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Hapus">
                            <IconTrash />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && rows.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-50 bg-gray-50/40">
              <p className="text-[11px] text-gray-400 font-medium">
                Menampilkan {rows.length} entry {tab === "IN" ? "uang masuk" : "uang keluar"}
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}