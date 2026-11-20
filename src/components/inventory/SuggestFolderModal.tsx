// src/components/inventory/SuggestFolderModal.tsx
//
// ⬅️ Step 4 Q3 A — Modal yang muncul setelah SN Lepas lulus QC.
// Tampilkan daftar folder yang 5 field pengunci-nya match dengan unit.
// User bisa pilih "masukin ke folder" atau "tetap SN Lepas".

"use client";
import { useState } from "react";
import { X, FolderOpen, Package } from "lucide-react";
import { toast } from "sonner";

interface SuggestFolder {
  id: string;
  laptop_name: string | null;
  brand: string | null;
  cpu: string | null;
  ram: string | null;
  storage: string | null;
  selling_price: number | null;
  grade: string | null;
  category: string | null;
}

interface Props {
  unitId: string;
  unitName: string;
  folders: SuggestFolder[];
  onClose: () => void;
  onMoved: () => void;
}

const fmt = (n: number | null) => n == null ? "—" : "Rp " + n.toLocaleString("id-ID");

export default function SuggestFolderModal({ unitId, unitName, folders, onClose, onMoved }: Props) {
  const [selected, setSelected] = useState<string>("");
  const [moving, setMoving] = useState(false);

  const handleMove = async () => {
    if (!selected) {
      toast.error("Pilih folder dulu atau klik 'Tetap SN Lepas'");
      return;
    }
    setMoving(true);
    try {
      const res = await fetch(`/api/data-barang/unit/${unitId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_folder_id: selected }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Gagal pindah folder");
        return;
      }
      toast.success("Unit berhasil masuk folder");
      onMoved();
      onClose();
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => !moving && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col animate-popIn">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-800" />
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4">
          <p className="font-bold text-white text-sm">✅ Lulus QC — Folder Match Ditemukan</p>
          <p className="text-xs text-white/70 mt-0.5 truncate">{unitName}</p>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          <p className="text-xs text-gray-500 mb-3">
            Ada <b>{folders.length} folder</b> yang spek-nya cocok 100%. Pilih mau masukin ke folder mana, atau tetap SN Lepas.
          </p>

          {folders.map(f => (
            <label key={f.id} className="block cursor-pointer">
              <div className={`border rounded-xl p-3 transition ${selected === f.id ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                <div className="flex items-start gap-2">
                  <input type="radio" name="folder" checked={selected === f.id} onChange={() => setSelected(f.id)} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                      <p className="text-xs font-bold text-gray-800 truncate">{f.laptop_name}</p>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {[f.brand, f.cpu, f.ram, f.storage].filter(Boolean).join(" · ")} · Grade {f.grade} · {fmt(f.selling_price)}
                    </p>
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button onClick={onClose} disabled={moving}
            className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center gap-1.5">
            <Package size={14} /> Tetap SN Lepas
          </button>
          <button onClick={handleMove} disabled={moving || !selected}
            className="flex-1 h-10 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-xs font-bold hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-40 flex items-center justify-center gap-2">
            {moving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Masukin ke Folder
          </button>
        </div>
      </div>
    </div>
  );
}