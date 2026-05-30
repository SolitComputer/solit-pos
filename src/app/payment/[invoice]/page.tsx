"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

interface Transaction {
  invoice_number: string;
  customer_name: string;
  customer_phone: string;
  company_name: string;
  laptop_name: string;
  serial_number: string;
  amount: number;
  deal_price: number;
  inventory_price: number;
  other: number;
  payment_method: string;
  pickup_method: string;
  pickup_date: string;
  pickup_time: string;
  pickup_location: string;
  source_platform: string;
  software_request: string;
  status: string;
  notes: string;
  sales_name: string;
  created_at: string;
  last_edited_by: string;
  last_edited_at: string;
}

const inputCls = "w-full border border-gray-200 rounded-xl h-11 px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition";
const selectCls = "w-full border border-gray-200 rounded-xl h-11 px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition";

export default function EditTransactionPage() {
  const params = useParams();
  const router = useRouter();
  const invoice = params.invoice as string;

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(r => setUserRole(r.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  useEffect(() => {
    const fetchTransaction = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/transaction/${invoice}`);
        const result = await res.json();
        if (result.success) {
          setTransaction(result.data);
          setFormData(result.data);
        }
      } catch {
        /* ignore */
      } finally {
        setIsLoading(false);
      }
    };
    if (invoice) fetchTransaction();
  }, [invoice]);

  // Cek permission — hanya ADMIN & KEPALA_SALES
  const canEdit = userRole
    ? hasPermission(userRole, PERMISSIONS.EDIT_TRANSACTION)
    : false;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setShowConfirm(false);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/transaction/${invoice}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          deal_price: Number(formData.deal_price || formData.amount),
          amount: Number(formData.deal_price || formData.amount),
        }),
      });
      const result = await res.json();
      if (!result.success) {
        alert("Gagal menyimpan: " + result.message);
        return;
      }
      setTransaction(result.data);
      setHasChanges(false);
      alert("✅ Transaksi berhasil diupdate");
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          <div className="h-8 bg-gray-100 rounded-xl w-48" />
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-11 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
    );
  }

  if (!canEdit) {
    return (
        <div className="max-w-md mx-auto mt-20 text-center bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="font-bold text-gray-800 text-lg">Akses Ditolak</h2>
          <p className="text-gray-500 text-sm mt-2">
            Hanya <span className="font-semibold">Admin</span> dan <span className="font-semibold">Kepala Sales</span> yang bisa mengedit transaksi.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-5 px-5 py-2.5 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition"
          >
            Kembali
          </button>
        </div>
    );
  }

  if (!transaction) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto mt-20 text-center">
          <p className="text-gray-500">Transaksi tidak ditemukan</p>
        </div>
      </DashboardLayout>
    );
  }

  const fmt = (n: number) => "Rp" + (n || 0).toLocaleString("id-ID");
  const dealPrice = Number(formData.deal_price || formData.amount || 0);
  const other = dealPrice - (transaction.inventory_price || 0);

  return (
    <>

      <div className="max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition mb-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Kembali
            </button>
            <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">Edit Transaksi</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{invoice}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/receipt/${invoice}`}
              className="px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              Lihat Receipt
            </a>
          </div>
        </div>

        {/* Info transaksi asli */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-700">Mode Edit Transaksi</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Dibuat oleh <span className="font-semibold">{transaction.sales_name}</span> pada{" "}
              {new Date(transaction.created_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "long", year: "numeric",
                hour: "2-digit", minute: "2-digit"
              })}
            </p>
            {transaction.last_edited_by && (
              <p className="text-xs text-amber-500 mt-0.5">
                Terakhir diedit oleh <span className="font-semibold">{transaction.last_edited_by}</span>{" "}
                {transaction.last_edited_at && `pada ${new Date(transaction.last_edited_at).toLocaleDateString("id-ID", {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit"
                })}`}
              </p>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Section: Pembeli */}
          <SectionHeader icon="👤" title="Data Pembeli" />
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nama Pembeli" required>
              <input name="customer_name" value={formData.customer_name || ""} onChange={handleChange} className={inputCls} />
            </Field>
            <Field label="No. WhatsApp">
              <input name="customer_phone" value={formData.customer_phone || ""} onChange={handleChange} className={inputCls} />
            </Field>
            <Field label="Perusahaan">
              <input name="company_name" value={formData.company_name || ""} onChange={handleChange} className={inputCls} />
            </Field>
            <Field label="Sumber">
              <select name="source_platform" value={formData.source_platform || ""} onChange={handleChange} className={selectCls}>
                {["Instagram", "TikTok", "Facebook", "WhatsApp", "Google", "Shopee", "Tokopedia", "Teman", "Lainnya"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="h-px bg-gray-100 mx-5" />

          {/* Section: Laptop */}
          <SectionHeader icon="💻" title="Detail Laptop" />
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nama Laptop">
              <input name="laptop_name" value={formData.laptop_name || ""} onChange={handleChange} className={inputCls} />
            </Field>
            <Field label="Serial Number">
              <input name="serial_number" value={formData.serial_number || ""} onChange={handleChange} className={inputCls} />
            </Field>
            <Field label="Software Request">
              <input name="software_request" value={formData.software_request || ""} onChange={handleChange} className={inputCls} placeholder="-" />
            </Field>
          </div>

          <div className="h-px bg-gray-100 mx-5" />

          {/* Section: Harga */}
          <SectionHeader icon="💰" title="Harga & Pembayaran" />
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Harga Deal (Rp)" required>
              <input
                name="deal_price"
                type="number"
                value={formData.deal_price || formData.amount || ""}
                onChange={handleChange}
                className={inputCls}
              />
            </Field>
            <Field label="Metode Pembayaran">
              <select name="payment_method" value={formData.payment_method || ""} onChange={handleChange} className={selectCls}>
                {["CASH", "TRANSFER", "DP", "CICILAN", "LAINNYA"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Status Transaksi">
              <select name="status" value={formData.status || ""} onChange={handleChange} className={selectCls}>
                {["PAID", "PENDING", "FAILED", "CANCELLED"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            {/* Preview selisih */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Harga Modal</p>
                <p className="text-sm font-medium text-gray-700">{fmt(transaction.inventory_price)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Selisih / Profit</p>
                <p className={`text-sm font-bold ${other >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {other >= 0 ? "+" : ""}{fmt(other)}
                </p>
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-100 mx-5" />

          {/* Section: Pengambilan */}
          <SectionHeader icon="📦" title="Info Pengambilan" />
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Metode Pengambilan">
              <select name="pickup_method" value={formData.pickup_method || ""} onChange={handleChange} className={selectCls}>
                <option value="DATANG">Datang ke Toko</option>
                <option value="DIANTAR">Diantar</option>
              </select>
            </Field>
            <Field label="Tanggal">
              <input name="pickup_date" type="date" value={formData.pickup_date || ""} onChange={handleChange} className={inputCls} />
            </Field>
            <Field label="Jam">
              <input name="pickup_time" type="time" value={formData.pickup_time || ""} onChange={handleChange} className={inputCls} />
            </Field>
            {formData.pickup_method === "DIANTAR" && (
              <Field label="Alamat Pengiriman">
                <input name="pickup_location" value={formData.pickup_location || ""} onChange={handleChange} className={inputCls} />
              </Field>
            )}
          </div>

          <div className="h-px bg-gray-100 mx-5" />

          {/* Section: Catatan */}
          <SectionHeader icon="📝" title="Catatan" />
          <div className="p-5">
            <textarea
              name="notes"
              value={formData.notes || ""}
              onChange={handleChange}
              rows={3}
              placeholder="Catatan tambahan..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition resize-none"
            />
          </div>
        </div>

        {/* Footer save */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={() => router.back()}
            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
          >
            Batal
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!hasChanges || isSaving}
            className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Simpan Perubahan
              </>
            )}
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#1a1a2e] px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-white text-sm">Konfirmasi Edit Transaksi</p>
                <p className="text-xs text-slate-400 mt-0.5">Perubahan akan tersimpan permanen</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Preview perubahan harga */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="text-xs text-emerald-600">Harga Deal Baru</p>
                  <p className="text-xl font-black text-emerald-700">
                    {fmt(Number(formData.deal_price || formData.amount || 0))}
                  </p>
                </div>
                {transaction.deal_price !== Number(formData.deal_price || formData.amount) && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Sebelumnya</p>
                    <p className="text-sm text-gray-500 line-through">{fmt(transaction.deal_price)}</p>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-xs text-amber-700">
                  Perubahan akan <span className="font-semibold">dicatat atas nama {userRole}</span> dan tidak dapat di-undo.
                </p>
              </div>
            </div>

            <div className="px-5 pb-6 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Ya, Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-4 pb-0">
      <span className="text-base">{icon}</span>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</p>
    </div>
  );
}

function Field({ label, children, required }: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}