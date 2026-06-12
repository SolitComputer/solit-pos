"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Transaction {
  id: string;
  invoice_number: string;
  laptop_id: string | null;
  unit_id: string | null;
  unit_ids: string[] | null;
  serial_numbers: string[] | null;
  customer_name: string;
  customer_phone: string;
  company_name: string;
  customer_type?: string;
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

interface ReadyUnit {
  id: string;
  serial_number: string;
  grade: string;
  selling_price: number;
  laptop_id: string;
  laptop: {
    id: string;
    laptop_name: string;
    brand: string;
  } | null;
}

// Unit yang sedang aktif di transaksi ini (untuk UI multi-unit)
interface ActiveUnit {
  unit_id: string;
  serial_number: string;
  laptop_name: string;
  laptop_id: string;
  selling_price: number;
  grade: string;
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

  // ── Unit state ──────────────────────────────────────────────────────────────
  const [activeUnits, setActiveUnits] = useState<ActiveUnit[]>([]);
  const [allReadyUnits, setAllReadyUnits] = useState<ReadyUnit[]>([]);
  const [isFetchingUnits, setIsFetchingUnits] = useState(false);
  const [snSearch, setSnSearch] = useState("");

  // ─────────────────────────────────────────────────────────────────────────────

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
          const tx: Transaction = result.data;
          setTransaction(tx);
          setFormData(tx);

          // Bangun activeUnits dari data transaksi
          // Prioritas: serial_numbers array > serial_number string
          const sns: string[] = Array.isArray(tx.serial_numbers) && tx.serial_numbers.length > 0
            ? tx.serial_numbers
            : tx.serial_number
              ? [tx.serial_number]
              : [];

          const unitIds: string[] = Array.isArray(tx.unit_ids) && tx.unit_ids.length > 0
            ? tx.unit_ids
            : tx.unit_id
              ? [tx.unit_id]
              : [];

          // Fetch detail unit dari DB untuk mendapatkan laptop_name per SN
          if (sns.length > 0) {
            const { data: unitDetails } = await fetchUnitDetailsBySNs(sns);
            if (unitDetails) {
              setActiveUnits(unitDetails);
            } else {
              // Fallback: pakai data dari transaksi saja
              setActiveUnits(sns.map((sn, i) => ({
                unit_id: unitIds[i] ?? "",
                serial_number: sn,
                laptop_name: tx.laptop_name,
                laptop_id: tx.laptop_id ?? "",
                selling_price: tx.deal_price,
                grade: "",
              })));
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        setIsLoading(false);
      }
    };
    if (invoice) fetchTransaction();
  }, [invoice]);

  // Fetch semua unit siap jual (tanpa filter laptop)
  useEffect(() => {
    const fetchAllReady = async () => {
      setIsFetchingUnits(true);
      try {
        const res = await fetch("/api/laptops/ready-units");
        const result = await res.json();
        if (result.success) {
          setAllReadyUnits(result.data as ReadyUnit[]);
        }
      } catch {
        /* ignore */
      } finally {
        setIsFetchingUnits(false);
      }
    };
    fetchAllReady();
  }, []);

  // Helper: fetch detail unit berdasarkan array SN
  async function fetchUnitDetailsBySNs(sns: string[]): Promise<{ data: ActiveUnit[] | null }> {
    try {
      // Fetch satu-satu via search-sn atau gunakan ready-units
      // Pakai endpoint yang sudah ada: search-sn
      const results = await Promise.all(
        sns.map(sn =>
          fetch(`/api/units/check-sn?sn=${encodeURIComponent(sn)}`)
            .then(r => r.json())
            .then(r => r.success ? r.data : null)
            .catch(() => null)
        )
      );

      const units: ActiveUnit[] = results
        .map((r, i) => {
          if (!r) return null;
          return {
            unit_id: r.id,
            serial_number: r.serial_number,
            laptop_name: r.laptop?.laptop_name ?? sns[i],
            laptop_id: r.laptop?.id ?? "",
            selling_price: r.selling_price ?? 0,
            grade: r.grade ?? "",
          };
        })
        .filter((u): u is ActiveUnit => u !== null);

      return { data: units.length > 0 ? units : null };
    } catch {
      return { data: null };
    }
  }

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

  // ── Tambah unit dari dropdown ──────────────────────────────────────────────
  const handleAddUnit = (unit: ReadyUnit) => {
    // Cegah duplikat
    if (activeUnits.some(u => u.serial_number === unit.serial_number)) return;

    const newUnit: ActiveUnit = {
      unit_id: unit.id,
      serial_number: unit.serial_number,
      laptop_name: unit.laptop?.laptop_name ?? "—",
      laptop_id: unit.laptop_id,
      selling_price: unit.selling_price,
      grade: unit.grade,
    };

    const updated = [...activeUnits, newUnit];
    setActiveUnits(updated);
    syncFormDataFromUnits(updated);
    setSnSearch("");
    setHasChanges(true);
  };

  // ── Hapus unit dari daftar ────────────────────────────────────────────────
  const handleRemoveUnit = (idx: number) => {
    if (activeUnits.length <= 1) {
      alert("Transaksi harus memiliki minimal 1 unit");
      return;
    }
    const updated = activeUnits.filter((_, i) => i !== idx);
    setActiveUnits(updated);
    syncFormDataFromUnits(updated);
    setHasChanges(true);
  };

  // ── Ganti unit (replace satu posisi) ─────────────────────────────────────
  const handleReplaceUnit = (idx: number, newUnit: ReadyUnit) => {
    // Cegah duplikat di posisi lain
    if (activeUnits.some((u, i) => i !== idx && u.serial_number === newUnit.serial_number)) {
      alert("Unit ini sudah ada di transaksi");
      return;
    }

    const replacement: ActiveUnit = {
      unit_id: newUnit.id,
      serial_number: newUnit.serial_number,
      laptop_name: newUnit.laptop?.laptop_name ?? "—",
      laptop_id: newUnit.laptop_id,
      selling_price: newUnit.selling_price,
      grade: newUnit.grade,
    };

    const updated = activeUnits.map((u, i) => i === idx ? replacement : u);
    setActiveUnits(updated);
    syncFormDataFromUnits(updated);
    setHasChanges(true);
  };

  // ── Sync formData dari activeUnits ────────────────────────────────────────
  // Update serial_numbers, unit_ids, serial_number, unit_id, laptop_name, laptop_id
  const syncFormDataFromUnits = (units: ActiveUnit[]) => {
    const sns = units.map(u => u.serial_number);
    const unitIds = units.map(u => u.unit_id);

    // laptop_name: pakai nama laptop dari unit pertama
    // (kalau multi-laptop, join namanya)
    const laptopNames = [...new Set(units.map(u => u.laptop_name))];
    const laptopName = laptopNames.join(" + ");

    // laptop_id: pakai dari unit pertama
    const laptopId = units[0]?.laptop_id ?? null;

    setFormData(prev => ({
      ...prev,
      serial_numbers: sns,
      unit_ids: unitIds,
      serial_number: sns[0] ?? "",
      unit_id: unitIds[0] ?? null,
      laptop_name: laptopName,
      laptop_id: laptopId,
    }));
  };

  // ── Filter dropdown berdasarkan search + exclude unit yang sudah aktif ────
  const filteredReadyUnits = allReadyUnits.filter(u => {
    const isAlreadyActive = activeUnits.some(a => a.serial_number === u.serial_number);
    if (isAlreadyActive) return false;
    if (!snSearch.trim()) return false; // hanya tampil kalau ada input
    const q = snSearch.toLowerCase();
    return (
      u.serial_number.toLowerCase().includes(q) ||
      (u.laptop?.laptop_name ?? "").toLowerCase().includes(q)
    );
  });

  const handleSave = async () => {
    setShowConfirm(false);
    setIsSaving(true);
    try {
      const sns = activeUnits.map(u => u.serial_number);
      const unitIds = activeUnits.map(u => u.unit_id);
      const laptopNames = [...new Set(activeUnits.map(u => u.laptop_name))];

      const res = await fetch(`/api/transaction/${invoice}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          deal_price: Number(formData.deal_price || formData.amount),
          amount: Number(formData.deal_price || formData.amount),
          // Multi-unit fields
          serial_numbers: sns,
          unit_ids: unitIds,
          serial_number: sns[0] ?? "",
          unit_id: unitIds[0] ?? null,
          laptop_name: laptopNames.join(" + "),
          laptop_id: activeUnits[0]?.laptop_id ?? null,
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
        <button onClick={() => router.back()} className="mt-5 px-5 py-2.5 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition">
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
            <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition mb-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Kembali
            </button>
            <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">Edit Transaksi</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{invoice}</p>
          </div>
          <a href={`/receipt/${invoice}`} className="px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
            Lihat Receipt
          </a>
        </div>

        {/* Info transaksi asli */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-700">Mode Edit Transaksi</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Dibuat oleh <span className="font-semibold">{transaction.sales_name}</span> pada{" "}
              {new Date(transaction.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
            {transaction.last_edited_by && (
              <p className="text-xs text-amber-500 mt-0.5">
                Terakhir diedit oleh <span className="font-semibold">{transaction.last_edited_by}</span>{" "}
                {transaction.last_edited_at && `pada ${new Date(transaction.last_edited_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              </p>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Section: Pembeli */}
          <SectionHeader icon="👤" title="Data Pembeli" />
          <Field label="Tipe Customer">
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "UMUM", label: "Umum", icon: "👤" },
                { value: "RESELLER", label: "Reseller", icon: "🔄" },
                { value: "MITRA", label: "Mitra", icon: "🤝" },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => { setFormData(prev => ({ ...prev, customer_type: opt.value })); setHasChanges(true); }}
                  className={`flex items-center justify-center gap-1.5 h-11 rounded-xl border text-sm font-medium transition ${(formData.customer_type ?? "UMUM") === opt.value ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                >
                  <span>{opt.icon}</span>{opt.label}
                </button>
              ))}
            </div>
          </Field>
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

          {/* ── Section: Unit / Laptop ── */}
          <SectionHeader icon="💻" title="Unit Laptop" />
          <div className="p-5 space-y-4">

            {/* Daftar unit aktif */}
            {activeUnits.length > 0 && (
              <div className="space-y-2">
                {activeUnits.map((unit, idx) => (
                  <UnitEditRow
                    key={unit.unit_id + idx}
                    unit={unit}
                    index={idx}
                    allReadyUnits={allReadyUnits}
                    isFetchingUnits={isFetchingUnits}
                    canRemove={activeUnits.length > 1}
                    onRemove={() => handleRemoveUnit(idx)}
                    onReplace={(newUnit) => handleReplaceUnit(idx, newUnit)}
                  />
                ))}
              </div>
            )}

            {/* Tambah unit baru */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Tambah Unit
                {isFetchingUnits && <span className="ml-1.5 text-gray-400">⏳ Memuat...</span>}
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ketik SN atau nama laptop..."
                  className={inputCls}
                  value={snSearch}
                  onChange={e => setSnSearch(e.target.value)}
                  disabled={isFetchingUnits}
                />
                {snSearch.trim() && filteredReadyUnits.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {filteredReadyUnits.slice(0, 10).map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleAddUnit(u)}
                        className="w-full px-4 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition"
                      >
                        <p className="text-xs font-bold text-gray-800 font-mono">{u.serial_number}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {u.laptop?.laptop_name ?? "—"}
                          {u.grade ? ` · Grade ${u.grade}` : ""}
                          {u.selling_price ? ` · ${fmt(u.selling_price)}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {snSearch.trim().length >= 2 && filteredReadyUnits.length === 0 && !isFetchingUnits && (
                  <p className="absolute top-full left-0 mt-1 text-[11px] text-gray-400 px-1">
                    Tidak ada unit siap jual yang cocok
                  </p>
                )}
              </div>
            </div>

            {/* Nama laptop (auto dari unit, masih bisa diedit manual) */}
            <Field label="Nama Laptop (dari unit pertama)">
              <input
                name="laptop_name"
                value={formData.laptop_name || ""}
                onChange={handleChange}
                className={inputCls}
                placeholder="Otomatis terisi dari unit"
              />
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
              <input name="deal_price" type="number" value={formData.deal_price || formData.amount || ""} onChange={handleChange} className={inputCls} />
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
            <textarea name="notes" value={formData.notes || ""} onChange={handleChange} rows={3} placeholder="Catatan tambahan..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 pb-8">
          <button onClick={() => router.back()} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
            Batal
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!hasChanges || isSaving}
            className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Simpan Perubahan</>
            )}
          </button>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#1a1a2e] px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center shrink-0">
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

              {/* Preview perubahan unit */}
              {activeUnits.length > 0 && (
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-400 mb-2">💻 Unit ({activeUnits.length})</p>
                  {activeUnits.map((u, i) => (
                    <div key={i} className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 truncate max-w-[55%]">{i + 1}. {u.laptop_name}</span>
                      <span className="font-mono text-gray-500">{u.serial_number}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-xs text-amber-700">
                  Perubahan akan <span className="font-semibold">dicatat atas nama {userRole}</span> dan tidak dapat di-undo.
                </p>
              </div>
            </div>
            <div className="px-5 pb-6 flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
              <button onClick={handleSave} className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Ya, Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── UnitEditRow: satu baris unit dengan opsi replace & remove ────────────────
function UnitEditRow({
  unit, index, allReadyUnits, isFetchingUnits, canRemove, onRemove, onReplace
}: {
  unit: ActiveUnit;
  index: number;
  allReadyUnits: ReadyUnit[];
  isFetchingUnits: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onReplace: (newUnit: ReadyUnit) => void;
}) {
  const [showReplace, setShowReplace] = useState(false);
  const [replaceSearch, setReplaceSearch] = useState("");

  const fmt = (n: number) => "Rp" + (n || 0).toLocaleString("id-ID");

  const filteredForReplace = allReadyUnits.filter(u => {
    if (!replaceSearch.trim()) return false;
    const q = replaceSearch.toLowerCase();
    return (
      u.serial_number.toLowerCase().includes(q) ||
      (u.laptop?.laptop_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-[10px] font-bold text-gray-500 bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">{unit.laptop_name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono text-gray-500">{unit.serial_number}</span>
            {unit.grade && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                Grade {unit.grade}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Tombol ganti */}
          <button
            type="button"
            onClick={() => { setShowReplace(!showReplace); setReplaceSearch(""); }}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition text-[10px] font-semibold"
            title="Ganti unit"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* Tombol hapus */}
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Hapus unit dari transaksi"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Replace dropdown */}
      {showReplace && (
        <div className="px-3 pb-3 border-t border-gray-200 bg-white">
          <p className="text-[10px] font-semibold text-blue-600 mt-2 mb-1.5">🔄 Pilih unit pengganti</p>
          <div className="relative">
            <input
              type="text"
              placeholder="Ketik SN atau nama laptop..."
              className="w-full border border-gray-200 rounded-lg h-9 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
              value={replaceSearch}
              onChange={e => setReplaceSearch(e.target.value)}
              autoFocus
            />
            {replaceSearch.trim() && filteredForReplace.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                {filteredForReplace.slice(0, 8).map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      onReplace(u);
                      setShowReplace(false);
                      setReplaceSearch("");
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0 transition"
                  >
                    <p className="text-xs font-bold text-gray-800 font-mono">{u.serial_number}</p>
                    <p className="text-[10px] text-gray-500">
                      {u.laptop?.laptop_name ?? "—"}
                      {u.grade ? ` · Grade ${u.grade}` : ""}
                      {u.selling_price ? ` · ${fmt(u.selling_price)}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {replaceSearch.trim().length >= 2 && filteredForReplace.length === 0 && (
              <p className="text-[10px] text-gray-400 mt-1">Tidak ada unit yang cocok</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setShowReplace(false); setReplaceSearch(""); }}
            className="mt-2 text-[10px] text-gray-400 hover:text-gray-600 transition"
          >
            ✕ Batal
          </button>
        </div>
      )}
    </div>
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
  label: string; children: React.ReactNode; required?: boolean;
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