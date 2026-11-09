// src/app/dashboard/laptops/minus/QcDecisionModal.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Wrench, Package, Trash2, Plus, AlertTriangle } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// QcDecisionModal
// Modal keputusan Pengelola Barang untuk unit yang ditandai MINUS oleh Team QC
// (qc_status = 'FROM_QC'). 3 opsi:
//   1. BISA DIPERBAIKI → expand form sparepart (multi) → POST decision=PERBAIKI
//   2. MINUS SIAP JUAL → konfirmasi → POST decision=MINUS_SIAP_JUAL
//   3. ASET MATOT      → input keterangan → POST decision=ASET_MATOT
// Semua opsi hit endpoint: POST /api/laptops/pengelola/decision
// ═══════════════════════════════════════════════════════════════════════

interface UnitFromQc {
  id: string;
  serial_number: string;
  condition_note?: string | null;
  analisa?: string | null;
  laptop?: {
    laptop_name: string;
    brand?: string;
    cpu?: string;
    ram?: string;
    storage?: string;
  };
}

interface SparepartRow {
  sparepart_name: string;
  estimasi_harga: string; // string karena input, dikonversi ke number saat submit
  catatan: string;
}

type ViewMode = "MAIN" | "PERBAIKI" | "MSJ_CONFIRM" | "MATOT_FORM";

export default function QcDecisionModal({
  unit,
  onClose,
  onSuccess,
}: {
  unit: UnitFromQc;
  onClose: () => void;
  onSuccess: (decisionLabel: string) => void;
}) {
  const [view, setView] = useState<ViewMode>("MAIN");
  const [submitting, setSubmitting] = useState(false);

  // State untuk PERBAIKI (multi-item sparepart)
  const [spareparts, setSpareparts] = useState<SparepartRow[]>([
    { sparepart_name: "", estimasi_harga: "", catatan: "" },
  ]);

  // State untuk MATOT
  const [matotKeterangan, setMatotKeterangan] = useState("");

  // ESC untuk close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, submitting]);

  // ── Submit Helper ────────────────────────────────────────────────────
  const submitDecision = async (body: Record<string, any>, successMsg: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/laptops/pengelola/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Gagal memproses keputusan");
        return;
      }
      toast.success(successMsg);
      onSuccess(successMsg);
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Handler: PERBAIKI ────────────────────────────────────────────────
  const handlePerbaiki = async () => {
    // Validasi minimal 1 sparepart dgn nama terisi
    const valid = spareparts.filter(s => s.sparepart_name.trim() !== "");
    if (valid.length === 0) {
      toast.error("Minimal 1 nama sparepart wajib diisi");
      return;
    }
    const payload = valid.map(s => ({
      sparepart_name: s.sparepart_name.trim(),
      estimasi_harga: s.estimasi_harga.trim() === "" ? null : Number(s.estimasi_harga),
      catatan: s.catatan.trim() || null,
    }));
    await submitDecision(
      { unit_id: unit.id, decision: "PERBAIKI", spareparts: payload },
      `${valid.length} sparepart masuk antrian — unit pindah ke SERVICE`
    );
  };

  // ── Handler: MINUS SIAP JUAL ─────────────────────────────────────────
  const handleMsj = async () => {
    await submitDecision(
      { unit_id: unit.id, decision: "MINUS_SIAP_JUAL" },
      "Unit dipindahkan ke Minus Siap Jual"
    );
  };

  // ── Handler: ASET MATOT ──────────────────────────────────────────────
  const handleMatot = async () => {
    await submitDecision(
      { unit_id: unit.id, decision: "ASET_MATOT", keterangan: matotKeterangan.trim() || null },
      "Unit dipindahkan ke Aset Matot"
    );
  };

  // ── UI ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
      <div className="relative bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Keputusan Pengelola Barang</p>
            <h2 className="text-white font-bold text-base mt-0.5 truncate">{unit.laptop?.laptop_name || "Laptop"}</h2>
            <p className="text-xs text-white/60 mt-0.5">
              <span className="font-mono">{unit.serial_number}</span>
              {unit.laptop?.brand && ` · ${unit.laptop.brand}`}
            </p>
          </div>
          <button onClick={onClose} disabled={submitting}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:bg-white/15 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
          {/* Alasan dari Team QC (kalau ada) */}
          {(unit.analisa || unit.condition_note) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1">
                Alasan dari Team QC / Kondisi
              </p>
              <p className="text-xs text-amber-900 leading-relaxed">
                {unit.analisa || unit.condition_note}
              </p>
            </div>
          )}

          {/* ─── VIEW: MAIN ─── 3 Pilihan Utama */}
          {view === "MAIN" && (
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Pilih Tindakan</p>

              {/* Opsi 1: BISA DIPERBAIKI */}
              <button
                onClick={() => setView("PERBAIKI")}
                className="w-full text-left bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl p-4 transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/30">
                    <Wrench className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-emerald-700 text-sm">Bisa Diperbaiki</p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">Masuk antrian sparepart → setelah selesai cek kelengkapan QC</p>
                  </div>
                </div>
              </button>

              {/* Opsi 2: MINUS SIAP JUAL */}
              <button
                onClick={() => setView("MSJ_CONFIRM")}
                className="w-full text-left bg-gradient-to-br from-amber-50 to-white border-2 border-amber-200 hover:border-amber-400 rounded-2xl p-4 transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/30">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-amber-700 text-sm">Tidak Bisa → Minus Siap Jual</p>
                    <p className="text-[11px] text-amber-600 mt-0.5">Masih bisa dijual sebagai unit minus (tanpa input modal/harga)</p>
                  </div>
                </div>
              </button>

              {/* Opsi 3: ASET MATOT */}
              <button
                onClick={() => setView("MATOT_FORM")}
                className="w-full text-left bg-gradient-to-br from-red-50 to-white border-2 border-red-200 hover:border-red-400 rounded-2xl p-4 transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-red-500/30">
                    <Trash2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-red-700 text-sm">Tidak Bisa → Aset Matot</p>
                    <p className="text-[11px] text-red-600 mt-0.5">Unit dihapus dari stok, dicatat sebagai aset mati</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ─── VIEW: PERBAIKI — Form Sparepart ─── */}
          {view === "PERBAIKI" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-bold text-emerald-700">Antrian Sparepart</p>
              </div>
              <p className="text-[11px] text-gray-500">Tambahkan sparepart yang perlu dibeli. Bisa lebih dari satu.</p>

              {spareparts.map((sp, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Sparepart #{idx + 1}</span>
                    {spareparts.length > 1 && (
                      <button
                        onClick={() => setSpareparts(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-700 text-[10px] font-bold"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Nama sparepart (misal: LCD 14 inch)"
                    value={sp.sparepart_name}
                    onChange={e => {
                      const v = e.target.value;
                      setSpareparts(prev => prev.map((s, i) => i === idx ? { ...s, sparepart_name: v } : s));
                    }}
                    className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400"
                  />
                  <input
                    type="number"
                    placeholder="Estimasi harga (opsional)"
                    value={sp.estimasi_harga}
                    onChange={e => {
                      const v = e.target.value;
                      setSpareparts(prev => prev.map((s, i) => i === idx ? { ...s, estimasi_harga: v } : s));
                    }}
                    className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400"
                  />
                  <input
                    type="text"
                    placeholder="Catatan (opsional)"
                    value={sp.catatan}
                    onChange={e => {
                      const v = e.target.value;
                      setSpareparts(prev => prev.map((s, i) => i === idx ? { ...s, catatan: v } : s));
                    }}
                    className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400"
                  />
                </div>
              ))}

              <button
                onClick={() => setSpareparts(prev => [...prev, { sparepart_name: "", estimasi_harga: "", catatan: "" }])}
                className="w-full h-10 bg-emerald-50 text-emerald-700 border-2 border-dashed border-emerald-300 rounded-xl text-xs font-bold hover:bg-emerald-100 transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Sparepart
              </button>
            </div>
          )}

          {/* ─── VIEW: MSJ CONFIRM ─── */}
          {view === "MSJ_CONFIRM" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-600" />
                <p className="font-bold text-amber-800">Pindah ke Minus Siap Jual?</p>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Unit <span className="font-mono font-bold">{unit.serial_number}</span> akan pindah ke halaman <span className="font-bold">Minus Siap Jual</span>. Status unit jadi <span className="font-bold">MINUS_SIAP_JUAL</span>.
                Modal & harga jual nanti bisa diisi di halaman tersebut.
              </p>
            </div>
          )}

          {/* ─── VIEW: MATOT FORM ─── */}
          {view === "MATOT_FORM" && (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <p className="font-bold text-red-800">Pindah ke Aset Matot?</p>
                </div>
                <p className="text-xs text-red-700 leading-relaxed">
                  Unit akan <span className="font-bold">DIHAPUS</span> dari stok dan dicatat sebagai aset mati di halaman <span className="font-bold">/fixed-assets/aset-matot</span>.
                  Aksi ini <span className="font-bold">permanen</span>.
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                  Keterangan (opsional)
                </label>
                <textarea
                  value={matotKeterangan}
                  onChange={e => setMatotKeterangan(e.target.value)}
                  rows={3}
                  placeholder="Alasan dijadikan aset matot..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400/20 focus:border-red-400 focus:bg-white resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 bg-white">
          {view === "MAIN" && (
            <button onClick={onClose} disabled={submitting}
              className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 disabled:opacity-40">
              Batal
            </button>
          )}
          {view !== "MAIN" && (
            <button onClick={() => setView("MAIN")} disabled={submitting}
              className="h-10 px-4 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 disabled:opacity-40">
              ← Kembali
            </button>
          )}

          {view === "PERBAIKI" && (
            <button onClick={handlePerbaiki} disabled={submitting}
              className="flex-1 h-10 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-sm font-bold hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-40 flex items-center justify-center gap-2">
              {submitting && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Submit ke Antrian Sparepart
            </button>
          )}

          {view === "MSJ_CONFIRM" && (
            <button onClick={handleMsj} disabled={submitting}
              className="flex-1 h-10 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-bold hover:from-amber-600 hover:to-amber-700 disabled:opacity-40 flex items-center justify-center gap-2">
              {submitting && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Konfirmasi — Pindah MSJ
            </button>
          )}

          {view === "MATOT_FORM" && (
            <button onClick={handleMatot} disabled={submitting}
              className="flex-1 h-10 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl text-sm font-bold hover:from-red-700 hover:to-red-800 disabled:opacity-40 flex items-center justify-center gap-2">
              {submitting && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Konfirmasi — Hapus & Pindah Matot
            </button>
          )}
        </div>
      </div>
    </div>
  );
}