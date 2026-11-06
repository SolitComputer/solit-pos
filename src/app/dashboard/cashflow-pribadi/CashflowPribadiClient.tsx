"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  formatIDR, monthStartWIB, todayWIB, PAYMENT_METHODS,
  type CashflowType, type PaymentMethod,
  type PersonalCategory, type PersonalTransaction, type PersonalSummary,
} from "@/lib/cashflowPribadi";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function CashflowPribadiClient() {
  const [periodStart, setPeriodStart] = useState(monthStartWIB());
  const [periodEnd, setPeriodEnd] = useState(todayWIB());
  const [filterType, setFilterType] = useState<"all" | CashflowType>("all");

  const [summary, setSummary] = useState<PersonalSummary | null>(null);
  const [transactions, setTransactions] = useState<PersonalTransaction[]>([]);
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx] = useState<PersonalTransaction | null>(null);
  const [showCategoryMgr, setShowCategoryMgr] = useState(false);

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    try {
      const r = await fetch("/api/cashflow-pribadi/categories", { cache: "no-store" });
      const j = await r.json();
      if (j.success) setCategories(j.data ?? []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ start: periodStart, end: periodEnd });
      if (filterType !== "all") qs.set("type", filterType);

      const [sumRes, txRes] = await Promise.all([
        fetch(`/api/cashflow-pribadi/summary?start=${periodStart}&end=${periodEnd}`, { cache: "no-store" }),
        fetch(`/api/cashflow-pribadi/transactions?${qs.toString()}&limit=100`, { cache: "no-store" }),
      ]);
      const sumJ = await sumRes.json();
      const txJ = await txRes.json();
      if (sumJ.success) setSummary(sumJ.data);
      if (txJ.success) setTransactions(txJ.data ?? []);
    } catch (e: any) {
      toast.error("Gagal memuat data: " + (e?.message ?? "unknown"));
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, filterType]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm("Hapus transaksi ini? Tindakan ini tidak bisa dibatalkan.")) return;
    const r = await fetch(`/api/cashflow-pribadi/transactions/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      toast.success("Transaksi dihapus");
      fetchData();
    } else {
      toast.error(j.message ?? "Gagal menghapus");
    }
  };

  const openEdit = (tx: PersonalTransaction) => {
    setEditTx(tx);
    setShowForm(true);
  };

  const openCreate = () => {
    setEditTx(null);
    setShowForm(true);
  };

  // ── Quick period presets ───────────────────────────────────────────────────
  const setThisMonth = () => { setPeriodStart(monthStartWIB()); setPeriodEnd(todayWIB()); };
  const setLastMonth = () => {
    const start = monthStartWIB(-1);
    const end = (() => {
      const d = new Date(monthStartWIB());
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();
    setPeriodStart(start); setPeriodEnd(end);
  };
  const setLast7Days = () => {
    const d = new Date(todayWIB());
    d.setUTCDate(d.getUTCDate() - 6);
    setPeriodStart(d.toISOString().slice(0, 10)); setPeriodEnd(todayWIB());
  };

  const balance = summary?.balance ?? 0;
  const income = summary?.total_income ?? 0;
  const expense = summary?.total_expense ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 lg:pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8 space-y-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cashflow Pribadi</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Kelola keuangan pribadi Anda — <span className="font-semibold text-indigo-600">100% privat</span>, hanya Anda yang bisa lihat.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCategoryMgr(true)}
              className="px-3 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
            >
              Kelola Kategori
            </button>
            <button
              onClick={openCreate}
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm shadow-indigo-500/20"
            >
              + Tambah Transaksi
            </button>
          </div>
        </div>

        {/* ── Summary Cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white p-5 shadow-lg shadow-indigo-500/20">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl" />
            <p className="text-xs uppercase tracking-wider text-indigo-100/80 font-semibold">Saldo Periode Ini</p>
            <p className={`text-3xl font-bold mt-2 ${balance < 0 ? "text-rose-200" : "text-white"}`}>
              {formatIDR(balance)}
            </p>
            <p className="text-xs text-indigo-100/70 mt-2">{periodStart} → {periodEnd}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                </svg>
              </div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Pemasukan</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{formatIDR(income)}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" /><path d="M19 12l-7 7-7-7" />
                </svg>
              </div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Pengeluaran</p>
            </div>
            <p className="text-2xl font-bold text-rose-600">{formatIDR(expense)}</p>
          </div>
        </div>

        {/* ── Period & Filter ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={setLast7Days} className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition">7 Hari</button>
            <button onClick={setThisMonth} className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition">Bulan Ini</button>
            <button onClick={setLastMonth} className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition">Bulan Lalu</button>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none" />
              <span className="text-slate-400 text-sm">→</span>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none" />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none">
                <option value="all">Semua</option>
                <option value="income">Pemasukan</option>
                <option value="expense">Pengeluaran</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Breakdown by Category ───────────────────────────────────── */}
        {summary && summary.by_category.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Breakdown per Kategori</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {summary.by_category.map((c) => {
                const totalOfType = c.type === "income" ? income : expense;
                const pct = totalOfType > 0 ? (c.total / totalOfType) * 100 : 0;
                return (
                  <div key={`${c.category_id ?? "none"}-${c.type}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-2 text-slate-700 font-medium">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color ?? "#6b7280" }} />
                        {c.category_name}
                        <span className="text-slate-400 font-normal">({c.count}x)</span>
                      </span>
                      <span className={`font-semibold ${c.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                        {c.type === "income" ? "+" : "-"}{formatIDR(c.total)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color ?? "#6b7280" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Transaction List ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Daftar Transaksi</h2>
            <span className="text-xs text-slate-500">{transactions.length} transaksi</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat data...</div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-3">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                  <path d="M12 2v20M5 9h14M3 15h18" />
                </svg>
              </div>
              <p className="text-sm text-slate-600 font-medium">Belum ada transaksi</p>
              <p className="text-xs text-slate-400 mt-1">Klik "Tambah Transaksi" untuk mulai mencatat keuangan pribadi.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <li key={tx.id} className="p-4 hover:bg-slate-50 transition group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === "income" ? "bg-emerald-50" : "bg-rose-50"}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tx.type === "income" ? "#10b981" : "#ef4444"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        {tx.type === "income"
                          ? <><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>
                          : <><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></>}
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {tx.category?.name ?? "Tanpa Kategori"}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {tx.payment_method}
                        </span>
                      </div>
                      {tx.description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{tx.description}</p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-0.5">{tx.transaction_date}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${tx.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                        {tx.type === "income" ? "+" : "-"}{formatIDR(tx.amount)}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
                        <button onClick={() => openEdit(tx)} title="Edit" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(tx.id)} title="Hapus" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────── */}
      {showForm && (
        <TransactionFormModal
          categories={categories}
          editTx={editTx}
          onClose={() => { setShowForm(false); setEditTx(null); }}
          onSaved={() => { setShowForm(false); setEditTx(null); fetchData(); }}
        />
      )}

      {showCategoryMgr && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setShowCategoryMgr(false)}
          onChanged={() => fetchCategories()}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: Form Transaksi (add/edit)
// ─────────────────────────────────────────────────────────────────────────────
function TransactionFormModal({
  categories, editTx, onClose, onSaved,
}: {
  categories: PersonalCategory[];
  editTx: PersonalTransaction | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<CashflowType>(editTx?.type ?? "expense");
  const [amount, setAmount] = useState<string>(editTx ? String(editTx.amount) : "");
  const [categoryId, setCategoryId] = useState<string>(editTx?.category_id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(editTx?.payment_method ?? "cash");
  const [transactionDate, setTransactionDate] = useState<string>(editTx?.transaction_date ?? todayWIB());
  const [description, setDescription] = useState<string>(editTx?.description ?? "");
  const [submitting, setSubmitting] = useState(false);

  const availableCategories = useMemo(
    () => categories.filter((c) => c.type === type && c.is_active),
    [categories, type]
  );

  // Reset kategori saat ganti type, kalau kategori lama beda type
  useEffect(() => {
    if (categoryId && !availableCategories.some((c) => c.id === categoryId)) {
      setCategoryId("");
    }
  }, [type, availableCategories, categoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = Number(amount.replace(/[^\d]/g, ""));
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      toast.error("Nominal harus lebih dari 0");
      return;
    }

    setSubmitting(true);
    try {
      const url = editTx
        ? `/api/cashflow-pribadi/transactions/${editTx.id}`
        : "/api/cashflow-pribadi/transactions";
      const method = editTx ? "PATCH" : "POST";

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: amtNum,
          category_id: categoryId || null,
          payment_method: paymentMethod,
          transaction_date: transactionDate,
          description: description.trim() || null,
        }),
      });
      const j = await r.json();
      if (j.success) {
        toast.success(editTx ? "Transaksi diperbarui" : "Transaksi disimpan");
        onSaved();
      } else {
        toast.error(j.message ?? "Gagal menyimpan");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal menyimpan");
    } finally {
      setSubmitting(false);
    }
  };

  const formatInput = (v: string) => {
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return "";
    return new Intl.NumberFormat("id-ID").format(Number(digits));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">
            {editTx ? "Edit Transaksi" : "Tambah Transaksi"}
          </h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" aria-label="Tutup">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Tipe */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType("expense")} className={`py-3 rounded-xl font-semibold text-sm transition ${type === "expense" ? "bg-rose-50 text-rose-700 border-2 border-rose-500" : "bg-slate-50 text-slate-500 border-2 border-transparent"}`}>
              - Pengeluaran
            </button>
            <button type="button" onClick={() => setType("income")} className={`py-3 rounded-xl font-semibold text-sm transition ${type === "income" ? "bg-emerald-50 text-emerald-700 border-2 border-emerald-500" : "bg-slate-50 text-slate-500 border-2 border-transparent"}`}>
              + Pemasukan
            </button>
          </div>

          {/* Nominal */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Nominal</label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
              <input
                type="text" inputMode="numeric" value={formatInput(amount)}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0" required autoFocus
                className="w-full pl-10 pr-3 py-3 text-lg font-bold border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Kategori */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Kategori</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm">
              <option value="">— Tanpa Kategori —</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.is_default ? "(default)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Metode */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Metode Pembayaran</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm">
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Tanggal */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Tanggal</label>
            <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} required className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" />
          </div>

          {/* Catatan */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Catatan (opsional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} placeholder="Mis. beli kopi di indomaret"
              className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition text-sm">
              Batal
            </button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition text-sm disabled:opacity-50">
              {submitting ? "Menyimpan..." : (editTx ? "Update" : "Simpan")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: Category Manager
// ─────────────────────────────────────────────────────────────────────────────
function CategoryManagerModal({
  categories, onClose, onChanged,
}: {
  categories: PersonalCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CashflowType>("expense");
  const [newColor, setNewColor] = useState("#6366f1");
  const [submitting, setSubmitting] = useState(false);

  const custom = categories.filter((c) => !c.is_default);
  const defaults = categories.filter((c) => c.is_default);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim().length < 2) {
      toast.error("Nama kategori minimal 2 karakter");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/cashflow-pribadi/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType, color: newColor }),
      });
      const j = await r.json();
      if (j.success) {
        toast.success("Kategori ditambahkan");
        setNewName("");
        onChanged();
      } else {
        toast.error(j.message ?? "Gagal menambahkan");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus kategori "${name}"? Transaksi lama yang pakai kategori ini akan jadi "Tanpa Kategori".`)) return;
    const r = await fetch(`/api/cashflow-pribadi/categories/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) {
      toast.success("Kategori dihapus");
      onChanged();
    } else {
      toast.error(j.message ?? "Gagal menghapus");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Kelola Kategori</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" aria-label="Tutup">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          <form onSubmit={handleCreate} className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-indigo-900 uppercase tracking-wider">Tambah Kategori Baru</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setNewType("expense")} className={`py-2 rounded-lg text-xs font-semibold transition ${newType === "expense" ? "bg-rose-500 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>Pengeluaran</button>
              <button type="button" onClick={() => setNewType("income")} className={`py-2 rounded-lg text-xs font-semibold transition ${newType === "income" ? "bg-emerald-500 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>Pemasukan</button>
            </div>
            <div className="flex gap-2">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama kategori" maxLength={50}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20" />
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer" />
              <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                +
              </button>
            </div>
          </form>

          {custom.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Kategori Saya ({custom.length})</p>
              <ul className="space-y-1.5">
                {custom.map((c) => (
                  <li key={c.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full" style={{ background: c.color ?? "#6b7280" }} />
                      {c.name}
                      <span className="text-[10px] uppercase font-semibold text-slate-400">{c.type === "income" ? "IN" : "OUT"}</span>
                    </span>
                    <button onClick={() => handleDelete(c.id, c.name)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Kategori Default ({defaults.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {defaults.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1 text-xs text-slate-700">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color ?? "#6b7280" }} />
                  {c.name}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Kategori default tidak bisa dihapus/diedit.</p>
          </div>
        </div>
      </div>
    </div>
  );
}