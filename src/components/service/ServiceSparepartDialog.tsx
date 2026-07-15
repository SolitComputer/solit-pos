"use client";

import { useState, useEffect } from "react";

interface Accessory {
  id: string;
  name: string;
  sell_price: number;
  stock: number;
  category: string;
}

interface AccessoryUnit {
  id: string;
  serial_number: string;
}

interface ServiceSparepartDialogProps {
  open: boolean;
  orderId: string;
  orderName: string;
  orderType: string;
  defaultPrice?: number;
  onCancel: () => void;
  onConfirm: (payload: {
    price: number;
    reason?: string;
    accessory_id?: string;
    unit_id?: string;
  }) => Promise<void>;
}

function fmtRupiah(n: number) {
  if (!n) return "";
  return new Intl.NumberFormat("id-ID").format(n);
}

function parseRupiah(s: string) {
  return parseInt(s.replace(/\D/g, ""), 10) || 0;
}

export default function ServiceSparepartDialog({
  open,
  orderName,
  orderType,
  defaultPrice = 0,
  onCancel,
  onConfirm,
}: ServiceSparepartDialogProps) {
  const [mode, setMode] = useState<"manual" | "stock">("stock");
  
  // States untuk Mode Manual / Global
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  
  // States untuk Mode Stok
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [search, setSearch] = useState("");
  const [selectedAccessoryId, setSelectedAccessoryId] = useState("");
  const [units, setUnits] = useState<AccessoryUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [loadingAccessories, setLoadingAccessories] = useState(false);
  const [error, setError] = useState("");

  // Reset & load accessories
  useEffect(() => {
    if (open) {
      setAmount(defaultPrice > 0 ? fmtRupiah(defaultPrice) : "");
      setReason("");
      setError("");
      setMode("stock");
      setSearch("");
      setSelectedAccessoryId("");
      setSelectedUnitId("");
      setUnits([]);
      fetchAccessories();
    }
  }, [open, defaultPrice]);

  const fetchAccessories = async (q = "") => {
    setLoadingAccessories(true);
    try {
      const params = new URLSearchParams({ search: q, limit: "50" });
      const res = await fetch(`/api/accessories?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setAccessories(json.data.filter((a: any) => a.stock > 0));
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingAccessories(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetchAccessories(search), 500);
    return () => clearTimeout(timer);
  }, [search, open]);

  // Handle accessory selection
  useEffect(() => {
    if (selectedAccessoryId) {
      const acc = accessories.find(a => a.id === selectedAccessoryId);
      if (acc) {
        setAmount(fmtRupiah(acc.sell_price));
        setReason(acc.name);
        fetchUnits(acc.id);
      }
    } else {
      setUnits([]);
      setSelectedUnitId("");
    }
  }, [selectedAccessoryId, accessories]);

  const fetchUnits = async (accId: string) => {
    try {
      const res = await fetch(`/api/accessories/${accId}`);
      const json = await res.json();
      if (json.success && json.data.units) {
        setUnits(json.data.units.filter((u: any) => u.status === "TERSEDIA"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!open) return null;
  const amountNum = parseRupiah(amount);
  const selectedAcc = accessories.find(a => a.id === selectedAccessoryId);

  const handleAmountChange = (v: string) => {
    const digits = v.replace(/\D/g, "");
    setAmount(digits ? fmtRupiah(parseInt(digits, 10)) : "");
    setError("");
  };

  const handleConfirm = async () => {
    if (amountNum <= 0) {
      setError("Biaya sparepart wajib diisi dan lebih dari 0.");
      return;
    }
    if (!reason.trim()) {
      setError("Keterangan sparepart wajib diisi.");
      return;
    }
    
    let payload_acc_id = undefined;
    let payload_unit_id = undefined;
    
    if (mode === "stock") {
      if (!selectedAccessoryId) {
        setError("Pilih aksesoris dari stok terlebih dahulu, atau gunakan mode Manual.");
        return;
      }
      if (units.length > 0 && !selectedUnitId) {
        setError("Pilih Unit (Serial Number) terlebih dahulu.");
        return;
      }
      payload_acc_id = selectedAccessoryId;
      payload_unit_id = selectedUnitId || undefined;
    }

    setLoading(true);
    setError("");
    try {
      await onConfirm({
        price: amountNum,
        reason: reason.trim(),
        accessory_id: payload_acc_id,
        unit_id: payload_unit_id,
      });
    } catch (e: any) {
      setError(e.message || "Terjadi kesalahan, coba lagi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !loading && onCancel()} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-orange-600">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-gray-900">Sparepart Servis</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Pilih atau masukkan sparepart untuk <span className="font-semibold text-gray-700">{orderName}</span> ({orderType}).
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Mode Toggle */}
          <div className="flex p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => { setMode("stock"); setError(""); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${mode === "stock" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Dari Stok Aksesoris
            </button>
            <button
              onClick={() => { setMode("manual"); setError(""); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${mode === "manual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Input Manual
            </button>
          </div>

          {mode === "stock" && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Cari Aksesoris</label>
                <input
                  type="text"
                  placeholder="Ketik nama aksesoris..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 transition"
                />
              </div>
              
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Pilih Barang</label>
                <select
                  value={selectedAccessoryId}
                  onChange={(e) => setSelectedAccessoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 transition bg-white"
                >
                  <option value="">-- Pilih Aksesoris --</option>
                  {accessories.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Stok: {a.stock})
                    </option>
                  ))}
                </select>
                {loadingAccessories && <p className="text-[10px] text-gray-400 mt-1">Memuat data...</p>}
              </div>

              {units.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Pilih Unit (Serial Number) <span className="text-red-500">*</span></label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 transition bg-white"
                  >
                    <option value="">-- Pilih S/N --</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.serial_number}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Form Biaya & Keterangan (Selalu muncul tapi bisa di-edit) */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Biaya Sparepart <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={e => handleAmountChange(e.target.value)}
                  placeholder="0"
                  disabled={loading}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 transition font-mono disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Keterangan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => { setReason(e.target.value); setError(""); }}
                placeholder="Contoh: Butuh baterai 14.8V 4400mAh..."
                rows={2}
                disabled={loading}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 transition resize-none placeholder:text-gray-300 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 shrink-0 border-t border-gray-100 bg-gray-50 flex gap-2">
          <button
            onClick={() => !loading && onCancel()}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition disabled:opacity-60"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700`}
          >
            {loading ? "Memproses..." : "Simpan Sparepart"}
          </button>
        </div>
      </div>
    </div>
  );
}
