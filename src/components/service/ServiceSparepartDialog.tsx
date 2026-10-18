"use client";

import { useState, useEffect } from "react";

interface SnResult {
  unit_id: string;
  serial_number: string;
  accessory_id: string;
  accessory_name: string;
  buy_price: number;
}

interface ServiceSparepartDialogProps {
  open: boolean;
  orderId: string;
  orderName: string;
  orderType: string;
  defaultPrice?: number;
  onCancel: () => void;
  onConfirm: (payload: {
    mode: "stock" | "manual";
    reason: string;
    price?: number;          // manual saja (modal yang diketik)
    accessory_id?: string;   // stok
    unit_id?: string;        // stok
    serial_number?: string;  // stok
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
  onCancel,
  onConfirm,
}: ServiceSparepartDialogProps) {
  const [mode, setMode] = useState<"manual" | "stock">("stock");

  // ── Mode Stok (search SN) ──
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SnResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SnResult | null>(null);

  // ── Keterangan (dipakai dua mode — jadi keterangan jurnal) ──
  const [reason, setReason] = useState("");
  // ── Mode Manual (biaya = modal) ──
  const [amount, setAmount] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset tiap dibuka
  useEffect(() => {
    if (open) {
      setMode("stock");
      setSearch("");
      setResults([]);
      setSelected(null);
      setReason("");
      setAmount("");
      setError("");
    }
  }, [open]);

  // Debounced search SN (mode stok, belum memilih unit)
  useEffect(() => {
    if (!open || mode !== "stock" || selected) return;
    const q = search.trim();
    if (q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/accessory-units/search-sn?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (json.success) {
          setResults(
            (json.data as any[]).map((d) => ({
              unit_id: d.id,
              serial_number: d.serial_number,
              accessory_id: d.accessory_id,
              accessory_name: d.accessory_name ?? "Aksesoris",
              buy_price: Math.round(Number(d.buy_price ?? 0)),
            }))
          );
        }
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, open, mode, selected]);

  if (!open) return null;
  const amountNum = parseRupiah(amount);

  const selectUnit = (u: SnResult) => {
    setSelected(u);
    setSearch(`${u.accessory_name} - ${u.serial_number}`);
    setResults([]);
    if (!reason.trim()) setReason(u.accessory_name); // prefill, tetap bisa diedit
    setError("");
  };

  const clearUnit = () => {
    setSelected(null);
    setSearch("");
    setResults([]);
  };

  const handleAmountChange = (v: string) => {
    const digits = v.replace(/\D/g, "");
    setAmount(digits ? fmtRupiah(parseInt(digits, 10)) : "");
    setError("");
  };

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError("Keterangan sparepart wajib diisi.");
      return;
    }

    if (mode === "stock") {
      if (!selected) {
        setError("Cari & pilih SN aksesoris dari stok terlebih dahulu.");
        return;
      }
    } else {
      if (amountNum <= 0) {
        setError("Biaya sparepart (modal) wajib diisi dan lebih dari 0.");
        return;
      }
    }

    setLoading(true);
    setError("");
    try {
      if (mode === "stock" && selected) {
        await onConfirm({
          mode: "stock",
          reason: reason.trim(),
          accessory_id: selected.accessory_id,
          unit_id: selected.unit_id,
          serial_number: selected.serial_number,
        });
      } else {
        await onConfirm({
          mode: "manual",
          reason: reason.trim(),
          price: amountNum,
        });
      }
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
              <div className="relative">
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Cari Serial Number (SN) Aksesoris <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik SN aksesoris..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 transition pr-8"
                  />
                  {selected && (
                    <button
                      onClick={clearUnit}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm"
                      title="Hapus pilihan"
                    >✕</button>
                  )}
                </div>

                {/* Dropdown hasil */}
                                {!selected && search.trim().length >= 2 && (
                  <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {searching ? (
                      <div className="px-3 py-2.5 text-xs text-gray-400">Mencari...</div>
                    ) : results.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-gray-400">SN tidak ditemukan / stok habis</div>
                    ) : results.map((u) => (
                      <button
                        key={u.unit_id}
                        onClick={() => selectUnit(u)}
                        className="w-full text-left px-3 py-2 hover:bg-orange-50 transition"
                      >
                        <span className="block text-sm text-gray-800">{u.serial_number}</span>
                        <span className="block text-[11px] text-gray-400">{u.accessory_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selected && (
                <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2">
                  Terpilih: <b>{selected.accessory_name}</b> — SN {selected.serial_number}
                  <span className="block text-emerald-600/70 mt-0.5">Modal diambil otomatis dari SN ini.</span>
                </div>
              )}
            </div>
          )}

          {/* Biaya Sparepart — HANYA mode manual */}
          {mode === "manual" && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Biaya Sparepart (Modal) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0"
                  disabled={loading}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 transition font-mono disabled:opacity-60"
                />
              </div>
            </div>
          )}

          {/* Keterangan — dua mode */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Keterangan <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(""); }}
              placeholder="Contoh: Butuh baterai 14.8V 4400mAh..."
              rows={2}
              disabled={loading}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 transition resize-none placeholder:text-gray-300 disabled:opacity-60"
            />
          </div>

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
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700"
          >
            {loading ? "Memproses..." : "Simpan Sparepart"}
          </button>
        </div>
      </div>
    </div>
  );
}