"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import {
  User,
  Laptop,
  Wallet,
  Package,
  FileText,
  RefreshCw,
  Handshake,
  Pencil,
  X,
  Landmark,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  Receipt,
  Search,
  Repeat,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { getAuthUser } from "@/hooks/useAuthUser";

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
  payment_method_2?: string;
  amount_method_1?: number;
  amount_method_2?: number;
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
  purchase_price: number; // ← harga modal unit
  laptop_id: string;
  laptop: {
    id: string;
    laptop_name: string;
    brand: string;
  } | null;
}

interface ActiveUnit {
  unit_id: string;
  serial_number: string;
  laptop_name: string;
  laptop_id: string;
  selling_price: number;
  grade: string;
  purchase_price: number;
  deal_price: number;
}

interface ActiveAccessory {
  accessory_id: string;
  name: string;
  category?: string;
  quantity: number;
  deal_price: number;
  selling_price: number; // modal
  is_bonus: boolean;
  stock?: number;
}

const inputCls =
  "w-full border border-gray-200 rounded-xl h-11 px-4 text-sm bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-400 transition placeholder:text-gray-300";
const selectCls =
  "w-full border border-gray-200 rounded-xl h-11 px-4 text-sm bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-400 transition";

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
  const [editReason, setEditReason] = useState("");

  const [activeUnits, setActiveUnits] = useState<ActiveUnit[]>([]);
  const [allReadyUnits, setAllReadyUnits] = useState<ReadyUnit[]>([]);
  const [isFetchingUnits, setIsFetchingUnits] = useState(false);
  const [snSearch, setSnSearch] = useState("");

  const [activeAccessories, setActiveAccessories] = useState<ActiveAccessory[]>([]);
  const [accSearch, setAccSearch] = useState("");
  const [accResults, setAccResults] = useState<any[]>([]);
  const [isFetchingAccs, setIsFetchingAccs] = useState(false);

  useEffect(() => {
    getAuthUser().then(u => ({ success: true, user: u }))
      .then((r) => setUserRole(r.user?.role ?? null))
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

          const dealMap = new Map<string, number>();
          for (const it of ((tx as any).transaction_items ?? [])) {
            if (it.unit_id) dealMap.set(String(it.unit_id), Number(it.deal_price ?? 0));
            if (it.serial_number) dealMap.set(String(it.serial_number), Number(it.deal_price ?? 0));
          }

          const sns: string[] =
            Array.isArray(tx.serial_numbers) && tx.serial_numbers.length > 0
              ? tx.serial_numbers
              : tx.serial_number
                ? [tx.serial_number]
                : [];

          const unitIds: string[] =
            Array.isArray(tx.unit_ids) && tx.unit_ids.length > 0
              ? tx.unit_ids
              : tx.unit_id
                ? [tx.unit_id]
                : [];

          const realSns = sns.filter((sn) => sn && sn.trim() && sn.trim() !== "-");

          if (realSns.length > 0) {
            const { data: unitDetails } = await fetchUnitDetailsBySNs(realSns);
            if (unitDetails) {
              // ← BARU: tempel deal_price per unit dari dealMap
              const withDeal = unitDetails.map((u) => ({
                ...u,
                deal_price:
                  dealMap.get(u.unit_id) ??
                  dealMap.get(u.serial_number) ??
                  0,
              }));
              setActiveUnits(withDeal);
            } else {
              const perUnitModal =
                unitIds.length > 0
                  ? Math.round((tx.inventory_price ?? 0) / unitIds.length)
                  : tx.inventory_price ?? 0;
              const perUnitDeal =
                unitIds.length > 0
                  ? Math.round((tx.deal_price ?? tx.amount ?? 0) / unitIds.length)
                  : (tx.deal_price ?? 0);
              setActiveUnits(
                realSns.map((sn, i) => ({
                  unit_id: unitIds[i] ?? "",
                  serial_number: sn,
                  laptop_name: tx.laptop_name,
                  laptop_id: tx.laptop_id ?? "",
                  selling_price: tx.deal_price,
                  grade: "",
                  purchase_price: perUnitModal,
                  deal_price: dealMap.get(unitIds[i] ?? "") ?? dealMap.get(sn) ?? perUnitDeal, // ← BARU
                }))
              );
            }
          }
          if (Array.isArray((tx as any).accessory_items)) {
            const accs: ActiveAccessory[] = (tx as any).accessory_items.map((a: any) => ({
              accessory_id: a.accessory_id,
              name: a.name || a.item_name || "Aksesori",
              category: a.category,
              quantity: Number(a.quantity) || 1,
              deal_price: Number(a.deal_price ?? 0),
              selling_price: Number(a.selling_price ?? 0),
              is_bonus: Boolean(a.is_bonus || Number(a.deal_price) === 0),
            }));
            setActiveAccessories(accs);
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

  useEffect(() => {
    const fetchAllReady = async () => {
      setIsFetchingUnits(true);
      try {
        const res = await fetch("/api/laptops/ready-units");
        const result = await res.json();
        if (result.success) setAllReadyUnits(result.data as ReadyUnit[]);
      } catch {
        /* ignore */
      } finally {
        setIsFetchingUnits(false);
      }
    };
    fetchAllReady();
  }, []);

  // begitu metode TF+CASH dipilih, auto isi payment_method_2 = "CASH".
  // Kalau metode diganti ke selain TF+CASH, bersihkan sisa data split-nya.
  useEffect(() => {
    if (formData.payment_method === "TF+CASH") {
      if (!formData.payment_method_2) {
        setFormData((prev) => ({ ...prev, payment_method_2: "CASH" }));
      }
    } else if (
      formData.payment_method_2 ||
      formData.amount_method_1 ||
      formData.amount_method_2
    ) {
      setFormData((prev) => ({
        ...prev,
        payment_method_2: "",
        amount_method_1: 0,
        amount_method_2: 0,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.payment_method]);

  async function fetchUnitDetailsBySNs(
    sns: string[]
  ): Promise<{ data: ActiveUnit[] | null }> {
    try {
      const results = await Promise.all(
        sns.map((sn) => {
          const clean = (sn ?? "").trim();
          if (!clean || clean === "-") return Promise.resolve(null);

          return fetch(`/api/units/check-sn?sn=${encodeURIComponent(clean)}`)
            .then((r) => r.json())
            .then((r) => (r.success ? r.data : null))
            .catch(() => null);
        })
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
            purchase_price: Number(r.purchase_price ?? 0),
            deal_price: 0,
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
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setHasChanges(true);
  };

  // khusus input nominal split TF + Cash (dipaksa jadi number)
  const handleAmountMethodChange = (
    field: "amount_method_1" | "amount_method_2",
    value: string
  ) => {
    setFormData((prev) => ({ ...prev, [field]: Number(value) || 0 }));
    setHasChanges(true);
  };

  const handleAddUnit = (unit: ReadyUnit) => {
    if (activeUnits.some((u) => u.serial_number === unit.serial_number)) return;
    const newUnit: ActiveUnit = {
      unit_id: unit.id,
      serial_number: unit.serial_number,
      laptop_name: unit.laptop?.laptop_name ?? "—",
      laptop_id: unit.laptop_id,
      selling_price: unit.selling_price,
      grade: unit.grade,
      purchase_price: Number(unit.purchase_price ?? 0),
      deal_price: 0,
    };
    const updated = [...activeUnits, newUnit];
    setActiveUnits(updated);
    syncFormDataFromUnits(updated);
    setSnSearch("");
    setHasChanges(true);
  };

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

  const handleReplaceUnit = (idx: number, newUnit: ReadyUnit) => {
    if (
      activeUnits.some(
        (u, i) => i !== idx && u.serial_number === newUnit.serial_number
      )
    ) {
      alert("Unit ini sudah ada di transaksi");
      return;
    }
    // Inherit deal_price dari unit yang diganti supaya total tidak jadi 0
    const previousDealPrice = activeUnits[idx]?.deal_price ?? 0;

    const replacement: ActiveUnit = {
      unit_id: newUnit.id,
      serial_number: newUnit.serial_number,
      laptop_name: newUnit.laptop?.laptop_name ?? "—",
      laptop_id: newUnit.laptop_id,
      selling_price: newUnit.selling_price,
      grade: newUnit.grade,
      purchase_price: Number(newUnit.purchase_price ?? 0),
      deal_price: previousDealPrice,
    };
    const updated = activeUnits.map((u, i) => (i === idx ? replacement : u));
    setActiveUnits(updated);
    syncFormDataFromUnits(updated);
    setHasChanges(true);
  };

  // update harga modal per unit secara realtime
  const handleUpdatePurchasePrice = (idx: number, price: number) => {
    const updated = activeUnits.map((u, i) =>
      i === idx ? { ...u, purchase_price: price } : u
    );
    setActiveUnits(updated);
    setHasChanges(true);
  };

  const handleUpdateDealPrice = (idx: number, price: number) => {
    const updated = activeUnits.map((u, i) =>
      i === idx ? { ...u, deal_price: price } : u
    );
    setActiveUnits(updated);
    setHasChanges(true);
  };

  const syncFormDataFromUnits = (units: ActiveUnit[]) => {
    const sns = units.map((u) => u.serial_number);
    const unitIds = units.map((u) => u.unit_id);
    const laptopNames = [...new Set(units.map((u) => u.laptop_name))];
    const laptopName = laptopNames.join(" + ");
    const laptopId = units[0]?.laptop_id ?? null;
    setFormData((prev) => ({
      ...prev,
      serial_numbers: sns,
      unit_ids: unitIds,
      serial_number: sns[0] ?? "",
      unit_id: unitIds[0] ?? null,
      laptop_name: laptopName,
      laptop_id: laptopId,
    }));
  };

  const filteredReadyUnits = allReadyUnits.filter((u) => {
    const isAlreadyActive = activeUnits.some(
      (a) => a.serial_number === u.serial_number
    );
    if (isAlreadyActive) return false;
    if (!snSearch.trim()) return false;
    const q = snSearch.toLowerCase();
    return (
      u.serial_number.toLowerCase().includes(q) ||
      (u.laptop?.laptop_name ?? "").toLowerCase().includes(q)
    );
  });

  const handleAccSearch = async (q: string) => {
    setAccSearch(q);
    if (q.trim().length < 2) { setAccResults([]); return; }
    setIsFetchingAccs(true);
    try {
      const res = await fetch(`/api/accessories/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) {
        const selectedIds = new Set(activeAccessories.map((a) => a.accessory_id));
        setAccResults((json.data || []).filter((a: any) => !selectedIds.has(a.id)));
      }
    } catch {
      setAccResults([]);
    } finally {
      setIsFetchingAccs(false);
    }
  };

  const handleAddAccessory = (a: any) => {
    const newAcc: ActiveAccessory = {
      accessory_id: a.id,
      name: a.name,
      category: a.category,
      quantity: 1,
      deal_price: Number(a.sell_price ?? 0),
      selling_price: Number(a.buy_price ?? 0),
      is_bonus: false,
      stock: a.stock,
    };
    setActiveAccessories((prev) => [...prev, newAcc]);
    setAccSearch("");
    setAccResults([]);
    setHasChanges(true);
  };

  const handleUpdateAccessory = (idx: number, patch: Partial<ActiveAccessory>) => {
    setActiveAccessories((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, ...patch } : a))
    );
    setHasChanges(true);
  };

  const handleRemoveAccessory = (idx: number) => {
    setActiveAccessories((prev) => prev.filter((_, i) => i !== idx));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!editReason.trim()) {
      alert("Alasan edit wajib diisi");
      return;
    }
    setShowConfirm(false);
    setIsSaving(true);
    try {
      const sns = activeUnits.map((u) => u.serial_number);
      const unitIds = activeUnits.map((u) => u.unit_id);
      const laptopNames = [...new Set(activeUnits.map((u) => u.laptop_name))];

      // Hanya kirim purchase_price yang benar-benar diisi user (> 0)
      // Kalau 0 = tidak diubah, skip agar tidak menimpa data existing di DB
      const purchasePricesPerUnit = activeUnits
        .filter((u) => u.purchase_price > 0)
        .map((u) => ({
          unit_id: u.unit_id,
          purchase_price: u.purchase_price,
        }));

      // Hanya kirim deal_price yang benar-benar diisi user (> 0)
      const dealPricesPerUnit = activeUnits
        .filter((u) => u.deal_price > 0)
        .map((u) => ({
          unit_id: u.unit_id,
          serial_number: u.serial_number,
          deal_price: u.deal_price,
        }));

      const totalAccDeal = activeAccessories.reduce(
        (s, a) => s + (a.is_bonus ? 0 : (a.deal_price || 0)),
        0
      );
      const totalLaptopDeal = activeUnits.reduce(
        (s, u) => s + (u.deal_price || 0),
        0
      );
      const totalDeal =
        (totalLaptopDeal + totalAccDeal) ||
        Number(formData.deal_price || formData.amount || 0);

      const res = await fetch(`/api/transaction/${invoice}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          deal_price: totalDeal,
          amount: totalDeal,
          serial_numbers: sns,
          unit_ids: unitIds,
          serial_number: sns[0] ?? "",
          unit_id: unitIds[0] ?? null,
          laptop_name: laptopNames.join(" + "),
          laptop_id: activeUnits[0]?.laptop_id ?? null,
          accessories: activeAccessories,
          // Hanya include key-nya kalau ada data yang valid
          ...(purchasePricesPerUnit.length > 0 && {
            purchase_prices_per_unit: purchasePricesPerUnit,
          }),
          ...(dealPricesPerUnit.length > 0 && {
            deal_prices_per_unit: dealPricesPerUnit,
          }),
          edit_reason: editReason.trim(),
        }),
      });
      const result = await res.json();
      if (!result.success) {
        alert("Gagal menyimpan: " + result.message);
        return;
      }
      setTransaction(result.data);
      setHasChanges(false);
      setEditReason("");
      alert(" Transaksi berhasil diupdate");
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-0 space-y-4 animate-pulse">
        <div className="h-24 bg-gradient-to-br from-[#1a1545] to-[#0f0c29] rounded-3xl opacity-90" />
        <div className="bg-white rounded-[24px] border border-gray-100 p-5 sm:p-6 space-y-4">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="h-11 bg-gray-100 rounded-xl" />
            ))}
        </div>
      </div>
    );
  }

  // ─── Access denied ────────────────────────────────────────────────────────
  if (!canEdit) {
    return (
      <div className="max-w-md mx-4 sm:mx-auto mt-16 sm:mt-20 text-center bg-white rounded-[28px] border border-gray-100 p-6 sm:p-8 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.15)]">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-red-100">
          <svg
            className="w-7 h-7 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <h2 className="font-black text-gray-800 text-lg">Akses Ditolak</h2>
        <p className="text-gray-400 text-sm mt-2">
          Hanya{" "}
          <span className="font-semibold text-gray-600">Admin</span> dan{" "}
          <span className="font-semibold text-gray-600">Kepala Sales</span> yang
          bisa mengedit transaksi.
        </p>
        <button
          onClick={() => router.back()}
          className="mt-5 px-5 py-2.5 bg-gradient-to-br from-[#1a1545] to-[#0f0c29] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition shadow-lg shadow-[#0f0c29]/20"
        >
          Kembali
        </button>
      </div>
    );
  }

  if (!transaction) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto mt-20 px-4 text-center">
          <p className="text-gray-400 text-sm">Transaksi tidak ditemukan</p>
        </div>
      </DashboardLayout>
    );
  }

  const fmt = (n: number) => "Rp" + (n || 0).toLocaleString("id-ID");
  const totalDealFromUnits = activeUnits.reduce((s, u) => s + (u.deal_price || 0), 0);
  const totalAccDealPreview = activeAccessories.reduce(
    (s, a) => s + (a.is_bonus ? 0 : (a.deal_price || 0)),
    0
  );
  const totalDealFromItems = totalDealFromUnits + totalAccDealPreview;
  const dealPrice =
    totalDealFromItems > 0
      ? totalDealFromItems
      : Number(formData.deal_price || formData.amount || 0);
  const totalInventoryPrice = activeUnits.reduce(
    (s, u) => s + (u.purchase_price || 0),
    0
  );

  const effectiveModal =
    totalInventoryPrice > 0
      ? totalInventoryPrice
      : transaction.inventory_price || 0;
  const other = dealPrice - effectiveModal;

  // total gabungan nominal Transfer + Tunai, buat validasi visual
  const splitTotal =
    Number(formData.amount_method_1 ?? 0) + Number(formData.amount_method_2 ?? 0);
  const splitMatches = formData.payment_method !== "TF+CASH" || splitTotal === dealPrice;

  // ← BARU (opsional, aman dihapus): tombol bantu isi otomatis sisa nominal split.
  // Cuma mengubah formData lewat handler yang sudah ada, tidak nambah API/behaviour baru.
  const handleFillRemainingAmount = (
    field: "amount_method_1" | "amount_method_2"
  ) => {
    const otherValue =
      field === "amount_method_1"
        ? Number(formData.amount_method_2 ?? 0)
        : Number(formData.amount_method_1 ?? 0);
    const remaining = Math.max(0, Math.round(dealPrice - otherValue));
    setFormData((prev) => ({ ...prev, [field]: remaining }));
    setHasChanges(true);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        .edit-page { font-family: 'Inter', sans-serif; }

        .page-hero {
          position: relative;
          overflow: hidden;
          border-radius: 26px;
          padding: 18px 18px 20px;
          background:
            radial-gradient(120% 160% at 100% 0%, rgba(124,58,237,0.35), transparent 55%),
            linear-gradient(135deg, #1a1545 0%, #0f0c29 100%);
          box-shadow: 0 22px 45px -22px rgba(15,12,41,0.65);
        }
        @media (min-width: 640px) { .page-hero { padding: 22px 26px 24px; } }
        .page-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0);
          background-size: 16px 16px;
          pointer-events: none;
        }
        .hero-back-btn {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11.5px; font-weight: 600; color: rgba(255,255,255,0.55);
          transition: color 0.15s;
          position: relative; z-index: 1;
        }
        .hero-back-btn:hover { color: rgba(255,255,255,0.92); }
        .hero-receipt-btn {
          display: inline-flex; align-items: center; gap: 6px;
          height: 36px; padding: 0 14px;
          font-size: 12px; font-weight: 600;
          color: #fff;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 12px;
          backdrop-filter: blur(6px);
          transition: background 0.15s, border-color 0.15s;
          white-space: nowrap;
          position: relative; z-index: 1;
        }
        .hero-receipt-btn:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.28); }
        .invoice-pill {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'Inter', monospace; font-size: 11px; font-weight: 600;
          letter-spacing: 0.02em;
          color: rgba(255,255,255,0.62);
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          padding: 4px 11px 4px 9px;
          border-radius: 999px;
          margin-top: 7px;
        }

        .form-card {
          background: #FFFFFF;
          border: 1px solid #ECEEF3;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 18px 42px -26px rgba(15,23,42,0.22);
          border-radius: 26px;
          overflow: hidden;
        }

        .section-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, #EEF0F4 12%, #EEF0F4 88%, transparent);
          margin: 2px 16px;
        }
        @media (min-width: 640px) { .section-divider { margin: 2px 20px; } }

        .section-header {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 18px 16px 10px;
        }
        @media (min-width: 640px) { .section-header { padding: 20px 20px 12px; } }
        .section-header-icon {
          width: 32px; height: 32px;
          border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: inset 0 0 0 1px rgba(15,23,42,0.04);
        }
        .section-header-title {
          font-size: 11px; font-weight: 800;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: #64748B;
        }

        .ctype-btn {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          height: 44px; border-radius: 13px; border: 1.5px solid #E7EAF0;
          font-weight: 700; transition: all 0.18s;
          background: #FFFFFF; color: #64748B;
        }
        .ctype-btn:hover { background: #F8FAFC; border-color: #CBD5E1; }
        .ctype-btn.active {
          background: linear-gradient(135deg, #1a1545 0%, #0f0c29 100%);
          color: #FFFFFF;
          border-color: transparent;
          box-shadow: 0 6px 16px -4px rgba(15,12,41,0.45);
        }

        .unit-row {
          background: #FAFBFF;
          border: 1px solid #E7EAF0;
          border-radius: 16px;
          overflow: hidden;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .unit-row:hover { border-color: #C4B5FD; box-shadow: 0 10px 26px -14px rgba(109,40,217,0.35); transform: translateY(-1px); }

        .back-btn {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; font-weight: 500; color: #94A3B8;
          transition: color 0.15s;
          margin-bottom: 4px;
        }
        .back-btn:hover { color: #475569; }

        .save-btn {
          background: linear-gradient(135deg, #1a1545 0%, #0f0c29 100%);
          box-shadow: 0 4px 16px -2px rgba(15,12,41,0.4);
          transition: box-shadow 0.2s, opacity 0.2s, transform 0.15s;
        }
        .save-btn:hover:not(:disabled) { box-shadow: 0 10px 26px -6px rgba(15,12,41,0.5); transform: translateY(-1px); }
        .save-btn:active:not(:disabled) { transform: translateY(0); }
        .save-btn:disabled { opacity: 0.4; box-shadow: none; }

        .unit-dropdown {
          background: #FFFFFF;
          border: 1px solid #E7EAF0;
          border-radius: 16px;
          box-shadow: 0 22px 48px -18px rgba(15,23,42,0.25);
          overflow: hidden;
        }
        .unit-dropdown-item { transition: background 0.15s; }
        .unit-dropdown-item:hover { background: #F5F3FF; }

        .warning-banner {
          background: linear-gradient(135deg, #FFFBEB 0%, #FEF6E7 100%);
          border: 1px solid #FCE2A8;
          border-radius: 18px;
        }

        .split-card {
          background: linear-gradient(135deg, #F8F7FF 0%, #F3EFFE 100%);
          border: 1px solid #E4DEFB;
          border-radius: 18px;
          padding: 14px;
        }
        @media (min-width: 640px) { .split-card { padding: 18px; } }

        .confirm-shell {
          background: #FFFFFF;
          border: 1px solid #ECEEF3;
          box-shadow: 0 32px 80px rgba(15,12,41,0.28);
        }
        .confirm-header {
          background: linear-gradient(135deg, #1a1545 0%, #0f0c29 100%);
          position: relative;
          overflow: hidden;
        }
        .confirm-header::before {
          content: "";
          position: absolute; inset: 0;
          background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0);
          background-size: 16px 16px;
        }

        .mobile-action-bar {
          position: fixed;
          left: 0; right: 0; bottom: 0;
          z-index: 40;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(12px);
          border-top: 1px solid #EEF0F4;
          box-shadow: 0 -8px 24px rgba(15,23,42,0.07);
          padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
        }
        @media (min-width: 640px) {
          .mobile-action-bar {
            position: static;
            background: transparent;
            backdrop-filter: none;
            border-top: 0;
            box-shadow: none;
            padding: 0 0 32px;
          }
        }
      `}</style>

      <div className="edit-page max-w-2xl mx-auto px-4 sm:px-0 pb-24 sm:pb-0 space-y-4 sm:space-y-5">

        {/* ── Page Hero ── */}
        <div className="page-hero pt-1">
          <div className="flex flex-wrap items-start justify-between gap-3 relative z-[1]">
            <div className="min-w-0">
              <button onClick={() => router.back()} className="hero-back-btn">
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
                Kembali
              </button>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight mt-1.5">
                Edit Transaksi
              </h1>
              <span className="invoice-pill">
                <Receipt className="w-3 h-3" />
                {invoice}
              </span>
            </div>
            <a
              href={`/receipt/${invoice}`}
              className="hero-receipt-btn"
            >
              <FileText className="w-3.5 h-3.5" />
              Lihat Receipt
            </a>
          </div>
        </div>

        {/* ── Warning Banner ── */}
        <div className="warning-banner px-3.5 sm:px-4 py-3 sm:py-3.5 flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: "#FEF3C7" }}
          >
            <svg
              className="w-3.5 h-3.5 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-700">
              Mode Edit Transaksi
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Dibuat oleh{" "}
              <span className="font-semibold">{transaction.sales_name}</span>{" "}
              pada{" "}
              {new Date(transaction.created_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {transaction.last_edited_by && (
              <p className="text-xs text-amber-500 mt-0.5">
                Terakhir diedit:{" "}
                <span className="font-semibold">
                  {transaction.last_edited_by}
                </span>
                {transaction.last_edited_at &&
                  ` · ${new Date(
                    transaction.last_edited_at
                  ).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`}
              </p>
            )}
          </div>
        </div>

        {/* ── Main Form Card ── */}
        <div className="form-card">

          {/* ─ Section: Pembeli ─ */}
          <SectionHeader icon={User} title="Data Pembeli" tint="violet" />

          <div className="px-4 sm:px-5 pt-1 pb-4">
            <label className="block text-xs font-medium text-gray-400 mb-2">
              Tipe Customer
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "UMUM", label: "Umum", icon: User },
                { value: "RESELLER", label: "Reseller", icon: RefreshCw },
                { value: "MITRA", label: "Mitra", icon: Handshake },
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        customer_type: opt.value,
                      }));
                      setHasChanges(true);
                    }}
                    className={`ctype-btn text-[11px] sm:text-[13px] ${(formData.customer_type ?? "UMUM") === opt.value
                      ? "active"
                      : ""
                      }`}
                  >
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-4 sm:px-5 pb-4 sm:pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Field label="Nama Pembeli" required>
              <input
                name="customer_name"
                value={formData.customer_name || ""}
                onChange={handleChange}
                className={inputCls}
                placeholder="Nama lengkap"
              />
            </Field>
            <Field label="No. WhatsApp">
              <input
                name="customer_phone"
                value={formData.customer_phone || ""}
                onChange={handleChange}
                className={inputCls}
                placeholder="08xx..."
              />
            </Field>
            <Field label="Perusahaan">
              <input
                name="company_name"
                value={formData.company_name || ""}
                onChange={handleChange}
                className={inputCls}
                placeholder="Opsional"
              />
            </Field>
            <Field label="Sumber Platform">
              <select
                name="source_platform"
                value={formData.source_platform || ""}
                onChange={handleChange}
                className={selectCls}
              >
                {[
                  "Instagram",
                  "TikTok",
                  "Facebook",
                  "WhatsApp",
                  "Google",
                  "Shopee",
                  "Tokopedia",
                  "Teman",
                  "Lainnya",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="section-divider" />

          {/* ─ Section: Unit Laptop ─ */}
          <SectionHeader icon={Laptop} title="Unit Laptop" tint="violet" />
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4">

            {/* Active units list */}
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
                    onDealPriceChange={(price) =>
                      handleUpdateDealPrice(idx, price)
                    }
                  />
                ))}
              </div>
            )}

            {/* Add unit search */}
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                Tambah Unit
                {isFetchingUnits && (
                  <span className="flex items-center gap-1 text-violet-500">
                    <div className="w-3 h-3 border-2 border-violet-300 border-t-violet-500 rounded-full animate-spin" />
                    Memuat...
                  </span>
                )}
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Ketik SN atau nama laptop..."
                  className="w-full border border-gray-200 rounded-xl h-11 pl-10 pr-4 text-sm bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-400 transition placeholder:text-gray-300"
                  value={snSearch}
                  onChange={(e) => setSnSearch(e.target.value)}
                  disabled={isFetchingUnits}
                />
                {snSearch.trim() && filteredReadyUnits.length > 0 && (
                  <div className="unit-dropdown absolute top-full left-0 right-0 z-20 mt-1.5 max-h-48 overflow-y-auto">
                    {filteredReadyUnits.slice(0, 10).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleAddUnit(u)}
                        className="unit-dropdown-item w-full px-4 py-2.5 text-left border-b border-gray-50 last:border-0"
                      >
                        <p className="text-xs font-bold text-gray-800 font-mono">
                          {u.serial_number}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {u.laptop?.laptop_name ?? "—"}
                          {u.grade ? ` · Grade ${u.grade}` : ""}
                          {u.selling_price ? ` · ${fmt(u.selling_price)}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {snSearch.trim().length >= 2 &&
                  filteredReadyUnits.length === 0 &&
                  !isFetchingUnits && (
                    <p className="absolute top-full left-0 mt-1.5 text-[11px] text-gray-400 px-1">
                      Tidak ada unit siap jual yang cocok
                    </p>
                  )}
              </div>
            </div>

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
              <input
                name="software_request"
                value={formData.software_request || ""}
                onChange={handleChange}
                className={inputCls}
                placeholder="-"
              />
            </Field>
          </div>

          <div className="section-divider" />

          {/* ─ Section: Aksesori Tambahan ─ */}
          <SectionHeader icon={Package} title="Aksesori Tambahan" tint="emerald" />
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">
            {activeAccessories.length > 0 && (
              <div className="space-y-2">
                {activeAccessories.map((acc, idx) => (
                  <div
                    key={acc.accessory_id + idx}
                    className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-3 sm:p-3.5 space-y-2.5 shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {acc.quantity}x
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-800 truncate">{acc.name}</p>
                        {acc.category && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded-md inline-block mt-0.5">
                            {acc.category}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAccessory(idx)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Toggle Bonus */}
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateAccessory(idx, {
                            is_bonus: !acc.is_bonus,
                            deal_price: !acc.is_bonus ? 0 : acc.deal_price,
                          })
                        }
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition ${acc.is_bonus
                          ? "bg-amber-50 border-amber-200 text-amber-700 shadow-sm"
                          : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                          }`}
                      >
                        {acc.is_bonus ? "🎁 Bonus (Rp0)" : "Berbayar"}
                      </button>

                      {/* Qty Counter */}
                      <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden flex-shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateAccessory(idx, {
                              quantity: Math.max(1, acc.quantity - 1),
                            })
                          }
                          className="px-2.5 py-1.5 text-gray-500 hover:bg-gray-100 text-xs font-bold"
                        >
                          -
                        </button>
                        <span className="px-2.5 text-xs font-bold text-gray-700 font-mono">
                          {acc.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateAccessory(idx, {
                              quantity: acc.quantity + 1,
                            })
                          }
                          className="px-2.5 py-1.5 text-gray-500 hover:bg-gray-100 text-xs font-bold"
                        >
                          +
                        </button>
                      </div>

                      {/* Harga Deal Input */}
                      {!acc.is_bonus && (
                        <div className="relative flex-1 min-w-[110px] sm:min-w-0 sm:w-32">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">
                            Rp
                          </span>
                          <input
                            type="number"
                            className="w-full border border-gray-200 rounded-lg h-8 pl-7 pr-2 text-xs font-bold text-gray-800 font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            value={acc.deal_price || ""}
                            onChange={(e) =>
                              handleUpdateAccessory(idx, {
                                deal_price: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            placeholder="0"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Accessory Input */}
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                Tambah Aksesori
                {isFetchingAccs && (
                  <span className="flex items-center gap-1 text-emerald-600 text-[10px]">
                    <div className="w-3 h-3 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                    Mencari...
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ketik nama aksesori..."
                  className="w-full border border-gray-200 rounded-xl h-10 px-3.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition placeholder:text-gray-300"
                  value={accSearch}
                  onChange={(e) => handleAccSearch(e.target.value)}
                />
                {accSearch.trim().length >= 2 && accResults.length > 0 && (
                  <div className="unit-dropdown absolute top-full left-0 right-0 z-20 mt-1.5 max-h-48 overflow-y-auto">
                    {accResults.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleAddAccessory(a)}
                        className="unit-dropdown-item w-full px-4 py-2.5 text-left border-b border-gray-50 last:border-0 flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{a.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {a.category ? `${a.category} · ` : ""}Stok: {a.stock ?? 0}
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-700 flex-shrink-0 ml-2">
                          {fmt(a.sell_price || 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {accSearch.trim().length >= 2 && accResults.length === 0 && !isFetchingAccs && (
                  <p className="absolute top-full left-0 mt-1 text-[11px] text-gray-400 px-1">
                    Tidak ada aksesori cocok
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="section-divider" />

          {/* ─ Section: Harga ─ */}
          <SectionHeader icon={Wallet} title="Harga & Pembayaran" tint="emerald" />
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <Field label="Total Harga Deal (Rp)">
                <input
                  name="deal_price"
                  type="text"
                  value={fmt(dealPrice)}
                  readOnly
                  className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed shadow-none`}
                  placeholder="Otomatis dari harga tiap unit"
                />
              </Field>
              <Field label="Metode Pembayaran">
                <select
                  name="payment_method"
                  value={formData.payment_method || ""}
                  onChange={handleChange}
                  className={selectCls}
                >
                  {["CASH", "TRANSFER", "TF+CASH", "DP", "CICILAN", "LAINNYA"].map(
                    (m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    )
                  )}
                </select>
              </Field>
            </div>

            {/* Split TF + Tunai — cuma muncul kalau Metode Pembayaran = TF+CASH */}
            {formData.payment_method === "TF+CASH" && (
              <div className="split-card">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <p className="text-[11px] font-bold text-violet-500 uppercase tracking-wider">
                    Rincian TF + Tunai
                  </p>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${splitMatches
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                      }`}
                  >
                    {splitMatches ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {splitMatches ? "Sesuai" : "Belum sesuai"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-400">
                        Nominal Transfer
                      </label>
                      <button
                        type="button"
                        onClick={() => handleFillRemainingAmount("amount_method_1")}
                        className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 transition"
                      >
                        Isi sisa
                      </button>
                    </div>
                    <div className="relative">
                      <Landmark className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                      <input
                        type="number"
                        value={formData.amount_method_1 ?? ""}
                        onChange={(e) =>
                          handleAmountMethodChange("amount_method_1", e.target.value)
                        }
                        onFocus={(e) => e.target.select()}
                        className={`${inputCls} pl-10`}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-400">
                        Nominal Tunai
                      </label>
                      <button
                        type="button"
                        onClick={() => handleFillRemainingAmount("amount_method_2")}
                        className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 transition"
                      >
                        Isi sisa
                      </button>
                    </div>
                    <div className="relative">
                      <Banknote className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
                      <input
                        type="number"
                        value={formData.amount_method_2 ?? ""}
                        onChange={(e) =>
                          handleAmountMethodChange("amount_method_2", e.target.value)
                        }
                        onFocus={(e) => e.target.select()}
                        className={`${inputCls} pl-10`}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-violet-100/70">
                  <span className="text-[11px] text-gray-500">Total split</span>
                  <span
                    className={`text-xs font-bold font-mono ${splitMatches ? "text-emerald-700" : "text-amber-600"
                      }`}
                  >
                    {fmt(splitTotal)}
                    {!splitMatches && (
                      <span className="text-[10px] font-semibold text-amber-500 ml-1.5">
                        (selisih {fmt(Math.abs(dealPrice - splitTotal))})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <Field label="Status Transaksi">
                <select
                  name="status"
                  value={formData.status || ""}
                  onChange={handleChange}
                  className={selectCls}
                >
                  {["PAID", "PENDING", "FAILED", "CANCELLED"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Profit card — realtime dari activeUnits */}
              <div
                className="rounded-2xl p-4 flex items-center justify-between"
                style={{
                  background:
                    "linear-gradient(135deg, #F8FAFC 0%, #F3F0FE 100%)",
                  border: "1px solid #E7E3FA",
                }}
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Total Modal
                  </p>
                  <p className="text-sm font-bold text-gray-700 mt-0.5 truncate">
                    {fmt(effectiveModal)}
                  </p>
                  {totalInventoryPrice > 0 &&
                    totalInventoryPrice !== transaction.inventory_price && (
                      <p className="text-[9px] text-amber-500 font-semibold mt-0.5 inline-flex items-center gap-1">
                        <Pencil className="w-2.5 h-2.5" /> Diubah dari {fmt(transaction.inventory_price)}
                      </p>
                    )}
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Profit
                  </p>
                  <p
                    className={`text-sm font-extrabold mt-0.5 ${other >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                  >
                    {other >= 0 ? "+" : ""}
                    {fmt(other)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="section-divider" />

          {/* ─ Section: Pengambilan ─ */}
          <SectionHeader icon={Package} title="Info Pengambilan" tint="amber" />
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Field label="Metode Pengambilan">
              <select
                name="pickup_method"
                value={formData.pickup_method || ""}
                onChange={handleChange}
                className={selectCls}
              >
                <option value="DATANG">Datang ke Toko</option>
                <option value="DIANTAR">Diantar</option>
              </select>
            </Field>
            <Field label="Tanggal">
              <input
                name="pickup_date"
                type="date"
                value={formData.pickup_date || ""}
                onChange={handleChange}
                className={inputCls}
              />
            </Field>
            <Field label="Jam">
              <input
                name="pickup_time"
                type="time"
                value={formData.pickup_time || ""}
                onChange={handleChange}
                className={inputCls}
              />
            </Field>
            {formData.pickup_method === "DIANTAR" && (
              <Field label="Alamat Pengiriman">
                <input
                  name="pickup_location"
                  value={formData.pickup_location || ""}
                  onChange={handleChange}
                  className={inputCls}
                  placeholder="Alamat lengkap"
                />
              </Field>
            )}
          </div>

          <div className="section-divider" />

          {/* ─ Section: Catatan ─ */}
          <SectionHeader icon={FileText} title="Catatan" tint="slate" />
          <div className="px-4 sm:px-5 pb-4 sm:pb-5">
            <textarea
              name="notes"
              value={formData.notes || ""}
              onChange={handleChange}
              rows={3}
              placeholder="Catatan tambahan..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-400 transition resize-none placeholder:text-gray-300"
            />
          </div>
        </div>

        {/* ── Footer Actions — sticky bar di HP, inline di layar besar ── */}
        <div className="mobile-action-bar">
          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex-1 h-11 bg-white text-gray-500 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition"
            >
              Batal
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!hasChanges || isSaving}
              className="save-btn flex-1 h-11 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Simpan Perubahan
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Confirm Modal ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          />
          <div className="confirm-shell relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[92dvh] flex flex-col">

            {/* Confirm header */}
            <div className="confirm-header px-5 py-4 flex items-center gap-3 flex-shrink-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative z-[1]"
                style={{
                  background: "rgba(251,191,36,0.2)",
                  border: "1px solid rgba(251,191,36,0.3)",
                }}
              >
                <svg
                  className="w-5 h-5 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <div className="min-w-0 relative z-[1]">
                <p className="font-bold text-white text-sm">
                  Konfirmasi Edit Transaksi
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Perubahan akan tersimpan permanen
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              {/* Deal price preview */}
              <div
                className="rounded-2xl p-4 flex justify-between items-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)",
                  border: "1px solid #A7F3D0",
                }}
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    Harga Deal Baru
                  </p>
                  <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-0.5 truncate">
                    {fmt(dealPrice)}
                  </p>
                </div>
                {transaction.deal_price !== dealPrice && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">
                      Sebelumnya
                    </p>
                    <p className="text-sm text-gray-400 line-through mt-0.5">
                      {fmt(transaction.deal_price)}
                    </p>
                  </div>
                )}
              </div>

              {/* Ringkasan split TF + Tunai, kalau relevan */}
              {formData.payment_method === "TF+CASH" && (
                <div
                  className="rounded-2xl px-4 py-3 flex items-center justify-between gap-2"
                  style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
                >
                  <div className="flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                      <Landmark className="w-3.5 h-3.5" /> {fmt(Number(formData.amount_method_1 ?? 0))}
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <Banknote className="w-3.5 h-3.5" /> {fmt(Number(formData.amount_method_2 ?? 0))}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${splitMatches
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                      }`}
                  >
                    {splitMatches ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {splitMatches ? "Sesuai" : "Selisih"}
                  </span>
                </div>
              )}

              {/* Units preview dengan modal info */}
              {activeUnits.length > 0 && (
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2.5 inline-flex items-center gap-1">
                    <Laptop className="w-3 h-3" /> Unit Aktif ({activeUnits.length})
                  </p>
                  <div className="space-y-2">
                    {activeUnits.map((u, i) => {
                      const priceChanged =
                        u.purchase_price > 0 &&
                        u.purchase_price !== transaction.inventory_price;
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-600 truncate max-w-[55%]">
                              <span className="font-bold text-gray-400 mr-1">
                                {i + 1}.
                              </span>
                              {u.laptop_name}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                              {u.serial_number}
                            </span>
                          </div>
                          {u.purchase_price > 0 && (
                            <div className="flex items-center gap-1.5 pl-3">
                              <span className="text-[9px] text-gray-400">
                                Modal:
                              </span>
                              {priceChanged &&
                                activeUnits.length === 1 && (
                                  <span className="text-[9px] font-mono text-gray-300 line-through">
                                    {fmt(transaction.inventory_price)}
                                  </span>
                                )}
                              <span className="text-[9px] font-mono font-bold text-amber-700">
                                {fmt(u.purchase_price)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Total profit preview */}
                  <div className="mt-3 pt-2.5 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-gray-400">
                      Total Modal
                    </span>
                    <span className="text-xs font-bold font-mono text-gray-700">
                      {fmt(effectiveModal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] font-semibold text-gray-400">
                      Estimasi Profit
                    </span>
                    <span
                      className={`text-xs font-extrabold font-mono ${other >= 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                    >
                      {other >= 0 ? "+" : ""}
                      {fmt(other)}
                    </span>
                  </div>
                </div>
              )}

              {/* Alasan Edit — wajib diisi */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Alasan Edit <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  rows={2}
                  placeholder="Contoh: salah input harga deal, customer minta ganti unit, dll."
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition resize-none placeholder:text-gray-300"
                />
              </div>

              {/* Warning note */}
              <div className="warning-banner px-3.5 py-3 flex items-start gap-2.5">
                <svg
                  className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
                <p className="text-xs text-amber-700">
                  Perubahan akan{" "}
                  <span className="font-semibold">
                    dicatat atas nama {userRole}
                  </span>{" "}
                  dan tidak dapat di-undo.
                </p>
              </div>
            </div>

            <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex gap-3 flex-shrink-0 border-t border-gray-100">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={!editReason.trim()}
                className="save-btn flex-1 h-11 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
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

function UnitEditRow({
  unit,
  index,
  allReadyUnits,
  isFetchingUnits,
  canRemove,
  onRemove,
  onReplace,
  onDealPriceChange,
}: {
  unit: ActiveUnit;
  index: number;
  allReadyUnits: ReadyUnit[];
  isFetchingUnits: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onReplace: (newUnit: ReadyUnit) => void;
  onDealPriceChange: (price: number) => void;
}) {
  const [showReplace, setShowReplace] = useState(false);
  const [replaceSearch, setReplaceSearch] = useState("");
  const fmt = (n: number) => "Rp" + (n || 0).toLocaleString("id-ID");

  const filteredForReplace = allReadyUnits.filter((u) => {
    if (!replaceSearch.trim()) return false;
    const q = replaceSearch.toLowerCase();
    return (
      u.serial_number.toLowerCase().includes(q) ||
      (u.laptop?.laptop_name ?? "").toLowerCase().includes(q)
    );
  });

  const gradeColors: Record<string, { bg: string; color: string }> = {
    A: { bg: "#ECFDF5", color: "#059669" },
    B: { bg: "#FFFBEB", color: "#D97706" },
    C: { bg: "#F3EFFE", color: "#6D28D9" },
  };
  const gradeStyle = unit.grade
    ? gradeColors[unit.grade] ?? { bg: "#F1F5F9", color: "#64748B" }
    : null;

  return (
    <div className="unit-row">
      {/* ─ Row header ─ */}
      <div className="flex items-center gap-2.5 px-3 sm:px-3.5 py-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-black"
          style={{ background: "linear-gradient(135deg,#EEF2FF,#E4DBFB)", color: "#6D28D9" }}
        >
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">
            {unit.laptop_name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono text-gray-400 truncate">
              {unit.serial_number}
            </span>
            {unit.grade && gradeStyle && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: gradeStyle.bg, color: gradeStyle.color }}
              >
                Grade {unit.grade}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowReplace(!showReplace);
              setReplaceSearch("");
            }}
            className="p-2.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition"
            title="Ganti unit"
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-2.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
              title="Hapus unit"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ─ Harga Deal per unit ─ */}
      <div
        className="border-t border-gray-100 px-3 sm:px-3.5 py-2.5"
        style={{ background: "#F8FAFC" }}
      >
        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-1">
          <Wallet className="w-2.5 h-2.5" /> Harga Deal
        </label>
        <input
          type="number"
          value={unit.deal_price || ""}
          onChange={(e) => onDealPriceChange(Number(e.target.value))}
          onFocus={(e) => e.target.select()}
          placeholder="Masukkan harga deal..."
          className="w-full border border-gray-200 rounded-lg h-8 px-2.5 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition placeholder:text-gray-300"
        />
      </div>

      {/* ─ Replace panel ─ */}
      {showReplace && (
        <div
          className="border-t border-gray-100 px-3 sm:px-3.5 pb-3.5 pt-3"
          style={{ background: "#FAFBFF" }}
        >
          <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-2 inline-flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5" /> Pilih unit pengganti
          </p>
          <div className="relative">
            <input
              type="text"
              placeholder="Ketik SN atau nama laptop..."
              className="w-full border border-gray-200 rounded-xl h-9 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition placeholder:text-gray-300"
              value={replaceSearch}
              onChange={(e) => setReplaceSearch(e.target.value)}
              autoFocus
            />
            {replaceSearch.trim() && filteredForReplace.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                {filteredForReplace.slice(0, 8).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      onReplace(u);
                      setShowReplace(false);
                      setReplaceSearch("");
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-violet-50 border-b border-gray-50 last:border-0 transition"
                  >
                    <p className="text-xs font-bold text-gray-800 font-mono">
                      {u.serial_number}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {u.laptop?.laptop_name ?? "—"}
                      {u.grade ? ` · Grade ${u.grade}` : ""}
                      {u.selling_price ? ` · ${fmt(u.selling_price)}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {replaceSearch.trim().length >= 2 &&
              filteredForReplace.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Tidak ada unit yang cocok
                </p>
              )}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowReplace(false);
              setReplaceSearch("");
            }}
            className="mt-2 text-[10px] font-medium text-gray-400 hover:text-gray-600 transition inline-flex items-center gap-1"
          >
            <X className="w-2.5 h-2.5" /> Batal
          </button>
        </div>
      )}
    </div>
  );
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
const SECTION_TINTS: Record<string, { bg: string; icon: string }> = {
  violet: { bg: "linear-gradient(135deg,#EEF2FF,#E4DBFB)", icon: "#6D28D9" },
  emerald: { bg: "linear-gradient(135deg,#ECFDF5,#D8F5E8)", icon: "#059669" },
  amber: { bg: "linear-gradient(135deg,#FFFBEB,#FDECC8)", icon: "#D97706" },
  slate: { bg: "linear-gradient(135deg,#F1F5F9,#E7EAF0)", icon: "#475569" },
};

function SectionHeader({
  icon: Icon,
  title,
  tint = "slate",
}: {
  icon: LucideIcon;
  title: string;
  tint?: "violet" | "emerald" | "amber" | "slate";
}) {
  const t = SECTION_TINTS[tint] ?? SECTION_TINTS.slate;
  return (
    <div className="section-header">
      <div
        className="section-header-icon"
        style={{ background: t.bg }}
      >
        <Icon className="w-4 h-4" style={{ color: t.icon }} />
      </div>
      <p className="section-header-title">{title}</p>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}