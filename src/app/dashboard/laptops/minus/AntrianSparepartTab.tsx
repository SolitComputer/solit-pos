// src/app/dashboard/laptops/minus/AntrianSparepartTab.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// REVISI 2026-11-19: group per-unit (bukan per-sparepart).
// Per unit card:
//   - Header: nama laptop + SN
//   - List sparepart records (bisa dihapus per item, kecuali yg SELESAI)
//   - Form tambah sparepart baru
//   - Total biaya (sum estimasi_harga)
//   - 2 tombol: "Selesai" (kalau ada ≥1 sparepart) / "Selesai Tanpa Sparepart" (kalau 0)
// ═══════════════════════════════════════════════════════════════════════
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Wrench, CheckCircle2, Package, Clock, Plus, Trash2 } from "lucide-react";
import SuggestFolderModal from "@/components/inventory/SuggestFolderModal";

interface SparepartItem {
  id: string;
  unit_id: string;
  laptop_id: string;
  sparepart_name: string;
  estimasi_harga: number | null;
  catatan: string | null;
  status: "MENUNGGU" | "SELESAI";
  created_at: string;
  serial_number: string | null;
  laptop?: { id: string; laptop_name: string; brand?: string };
}
interface UnitGroup {
  unit_id: string;
  laptop_name: string;
  serial_number: string | null;
  sparepart_items: SparepartItem[];
  total_biaya: number;
}

interface EmptyUnit {
  unit_id: string;
  serial_number: string | null;
  laptop_id: string;
  laptop?: { id: string; laptop_name: string; brand?: string };
}

const fmt = (n: number | null) => n == null || n === 0 ? "—" : "Rp " + n.toLocaleString("id-ID");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AntrianSparepartTab() {
  const [items, setItems] = useState<SparepartItem[]>([]);
  const [emptyUnits, setEmptyUnits] = useState<EmptyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishingUnitId, setFinishingUnitId] = useState<string | null>(null);
  const [deletingSpId, setDeletingSpId] = useState<string | null>(null);

  // Form tambah sparepart per unit — key = unit_id
  const [addForms, setAddForms] = useState<Record<string, { name: string; cost: string; note: string }>>({});
  const [addingUnitId, setAddingUnitId] = useState<string | null>(null);

  // ✅ SN Lepas lulus sparepart + QC → tawarkan folder match (pola Step 4).
  // Null = modal tertutup; object = munculin SuggestFolderModal dengan data.
  // Type match dengan SuggestFolder interface di SuggestFolderModal.tsx —
  // folder match butuh full field 5 pengunci + brand + selling_price buat preview.
  const [suggestFolderData, setSuggestFolderData] = useState<{
    unitId: string;
    unitName: string;
    folders: Array<{
      id: string;
      laptop_name: string | null;
      brand: string | null;
      cpu: string | null;
      ram: string | null;
      storage: string | null;
      selling_price: number | null;
      grade: string | null;
      category: string | null;
    }>;
  } | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch 2 endpoint PARALEL — sparepart records + empty units
      const [resSp, resEmpty] = await Promise.all([
        fetch("/api/laptops/sparepart-queue?status=MENUNGGU"),
        fetch("/api/laptops/sparepart-queue/empty-units"),
      ]);
      const [jsonSp, jsonEmpty] = await Promise.all([resSp.json(), resEmpty.json()]);
      if (jsonSp.success) setItems(jsonSp.data ?? []);
      if (jsonEmpty.success) setEmptyUnits(jsonEmpty.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Group sparepart per unit + merge empty units
  const unitGroups = useMemo<UnitGroup[]>(() => {
    const map = new Map<string, UnitGroup>();

    // 1. Group sparepart records per unit
    for (const it of items) {
      if (!map.has(it.unit_id)) {
        map.set(it.unit_id, {
          unit_id: it.unit_id,
          laptop_name: it.laptop?.laptop_name ?? "Tanpa Nama",
          serial_number: it.serial_number,
          sparepart_items: [],
          total_biaya: 0,
        });
      }
      const g = map.get(it.unit_id)!;
      g.sparepart_items.push(it);
      g.total_biaya += it.estimasi_harga ?? 0;
    }

    // 2. Tambahin empty units (unit IN_SPAREPART yang belum ada sparepart)
    for (const eu of emptyUnits) {
      if (!map.has(eu.unit_id)) {
        map.set(eu.unit_id, {
          unit_id: eu.unit_id,
          laptop_name: eu.laptop?.laptop_name ?? "Tanpa Nama",
          serial_number: eu.serial_number,
          sparepart_items: [],
          total_biaya: 0,
        });
      }
    }

    // 3. Sort: empty units DULU (baru masuk antrian), lalu unit dengan sparepart
    return Array.from(map.values()).sort((a, b) => {
      if (a.sparepart_items.length === 0 && b.sparepart_items.length > 0) return -1;
      if (a.sparepart_items.length > 0 && b.sparepart_items.length === 0) return 1;
      return 0;
    });
  }, [items, emptyUnits]);

  const handleAddSparepart = async (unitId: string) => {
    const form = addForms[unitId];
    if (!form || !form.name.trim()) {
      toast.error("Nama sparepart wajib diisi");
      return;
    }
    setAddingUnitId(unitId);
    try {
      const res = await fetch("/api/laptops/sparepart-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: unitId,
          sparepart_name: form.name.trim(),
          estimasi_harga: form.cost.trim() === "" ? null : Number(form.cost),
          catatan: form.note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal menambah"); return; }
      toast.success("Sparepart ditambahkan");
      setAddForms(prev => ({ ...prev, [unitId]: { name: "", cost: "", note: "" } }));
      fetchItems();
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setAddingUnitId(null);
    }
  };

  const handleDeleteSparepart = async (sp: SparepartItem) => {
    if (!confirm(`Hapus "${sp.sparepart_name}"?`)) return;
    setDeletingSpId(sp.id);
    try {
      const res = await fetch(`/api/laptops/sparepart-queue/${sp.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal hapus"); return; }
      toast.success("Sparepart dihapus");
      fetchItems();
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setDeletingSpId(null);
    }
  };

  const handleFinishUnit = async (group: UnitGroup, skipSparepart: boolean) => {
    const msg = skipSparepart
      ? `Selesai TANPA sparepart untuk unit SN ${group.serial_number}?\n\nUnit akan auto cek QC → kalau lengkap SIAP_JUAL, kalau kurang balik ke Team QC.`
      : `Tandai SEMUA sparepart unit SN ${group.serial_number} sebagai SELESAI?\n\nUnit akan auto cek QC → kalau lengkap SIAP_JUAL, kalau kurang balik ke Team QC.`;
    if (!confirm(msg)) return;
    setFinishingUnitId(group.unit_id);
    try {
      const res = await fetch(`/api/laptops/sparepart-queue/unit/${group.unit_id}/finish`, { method: "POST" });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal"); return; }
      toast.success(json.message);

      // ✅ SN Lepas lulus sparepart + QC complete → tawarkan folder match
      // (konsisten dengan Step 4 QC auto-suggest folder).
      // Backend /finish endpoint harus return { is_sn_lepas, suggest_folders[] }
      // sejajar dengan logic di Patch 5.3 (endpoint /complete).
      if (json.is_sn_lepas && Array.isArray(json.suggest_folders) && json.suggest_folders.length > 0) {
        setSuggestFolderData({
          unitId: group.unit_id,
          unitName: `${group.laptop_name} (SN ${group.serial_number ?? "—"})`,
          folders: json.suggest_folders,
        });
      }

      fetchItems();
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setFinishingUnitId(null);
    }
  };

  const updateForm = (unitId: string, patch: Partial<{ name: string; cost: string; note: string }>) => {
    setAddForms(prev => {
      const current = prev[unitId] ?? { name: "", cost: "", note: "" };
      return {
        ...prev,
        [unitId]: { ...current, ...patch },
      };
    });
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="w-4 h-4 text-emerald-700" />
          <p className="text-sm font-bold text-emerald-700">Antrian Perbaikan</p>
        </div>
        <p className="text-[11px] text-emerald-600 leading-relaxed">
          Unit yang diputuskan <span className="font-bold">BISA DIPERBAIKI</span> oleh Pengelola Barang.
          Tambahkan sparepart (nama, biaya, keterangan) satu per satu — <span className="font-bold">opsional</span>.
          Klik <span className="font-bold">Selesai</span> saat semua sparepart sudah dibeli & dipasang. Sistem auto cek kelengkapan QC.
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : unitGroups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <Package className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-700 font-bold text-base">Tidak ada unit di antrian</p>
          <p className="text-gray-400 text-sm mt-1">
            Antrian kosong — belum ada unit yang diputuskan "Bisa Diperbaiki"
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {unitGroups.map(group => {
            const form = addForms[group.unit_id] ?? { name: "", cost: "", note: "" };
            const sparepartCount = group.sparepart_items.length;
            return (
              <div key={group.unit_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header unit */}
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                    <Wrench className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{group.laptop_name}</p>
                    <p className="text-[11px] text-gray-500">
                      SN: <span className="font-mono bg-gray-100 px-1 rounded">{group.serial_number ?? "—"}</span>
                      {sparepartCount > 0 && (
                        <span className="ml-2">
                          {sparepartCount} sparepart · Total: <span className="font-bold text-emerald-700">{fmt(group.total_biaya)}</span>
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* List sparepart existing */}
                {sparepartCount > 0 && (
                  <div className="divide-y divide-gray-100">
                    {group.sparepart_items.map(sp => (
                      <div key={sp.id} className="px-4 py-2.5 flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-bold text-gray-800">{sp.sparepart_name}</p>
                            {sp.estimasi_harga != null && sp.estimasi_harga > 0 && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                {fmt(sp.estimasi_harga)}
                              </span>
                            )}
                          </div>
                          {sp.catatan && (
                            <p className="text-[10px] text-gray-500 italic mt-0.5">"{sp.catatan}"</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <Clock size={10} /> {fmtDate(sp.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteSparepart(sp)}
                          disabled={deletingSpId === sp.id || finishingUnitId === group.unit_id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40 flex-shrink-0"
                          title="Hapus sparepart"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Form tambah sparepart baru */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">+ Tambah Sparepart</p>
                  <input
                    type="text"
                    placeholder="Nama sparepart (misal: LCD 14 inch)"
                    value={form.name}
                    onChange={e => updateForm(group.unit_id, { name: e.target.value })}
                    className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Biaya (opsional)"
                      value={form.cost}
                      onChange={e => updateForm(group.unit_id, { cost: e.target.value })}
                      className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400"
                    />
                    <input
                      type="text"
                      placeholder="Keterangan (opsional)"
                      value={form.note}
                      onChange={e => updateForm(group.unit_id, { note: e.target.value })}
                      className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400"
                    />
                  </div>
                  <button
                    onClick={() => handleAddSparepart(group.unit_id)}
                    disabled={addingUnitId === group.unit_id || !form.name.trim()}
                    className="w-full h-9 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {addingUnitId === group.unit_id
                      ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Plus size={13} />}
                    Tambah
                  </button>
                </div>

                {/* Footer: tombol Selesai */}
                <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                  {sparepartCount === 0 ? (
                    <button
                      onClick={() => handleFinishUnit(group, true)}
                      disabled={finishingUnitId === group.unit_id}
                      className="flex-1 h-10 bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      {finishingUnitId === group.unit_id
                        ? <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                        : <CheckCircle2 size={14} />}
                      Selesai Tanpa Sparepart
                    </button>
                  ) : (
                    <button
                      onClick={() => handleFinishUnit(group, false)}
                      disabled={finishingUnitId === group.unit_id}
                      className="flex-1 h-10 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-xs font-bold hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      {finishingUnitId === group.unit_id
                        ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <CheckCircle2 size={14} />}
                      Selesai — Tandai Semua Sparepart Terpasang
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ✅ Modal auto-suggest folder untuk SN Lepas lulus sparepart + QC */}
      {suggestFolderData && (
        <SuggestFolderModal
          unitId={suggestFolderData.unitId}
          unitName={suggestFolderData.unitName}
          folders={suggestFolderData.folders}
          onClose={() => setSuggestFolderData(null)}
          onMoved={() => {
            setSuggestFolderData(null);
            fetchItems();
          }}
        />
      )}
    </div>
  );
}