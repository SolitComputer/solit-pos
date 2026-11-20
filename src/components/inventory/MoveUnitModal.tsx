"use client";
import { useState, useEffect } from "react";
import { X, Move, Package, FolderOpen, FolderPlus } from "lucide-react";
import { toast } from "sonner";

interface FolderOption {
  id: string;
  device_type: string;
  category: string;
  laptop_name?: string | null;
  name?: string | null;
  brand?: string | null;
  cpu?: string | null;
  ram?: string | null;
  storage?: string | null;
  spec?: string | null;
  selling_price?: number | null;
  sell_price?: number | null;
  grade?: string | null;
}

interface UnitInfo {
  id: string;
  serial_number: string;
  type: "LAPTOP" | "ACCESSORY";
  current_folder_label?: string; // Label folder asal (buat tampilan)
}

interface Props {
  unit: UnitInfo;
  open: boolean;
  onClose: () => void;
  onMoved: () => void;
}

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : "Rp " + n.toLocaleString("id-ID");

export default function MoveUnitModal({ unit, open, onClose, onMoved }: Props) {
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [emptyFolders, setEmptyFolders] = useState<FolderOption[]>([]);
  const [matchingFolders, setMatchingFolders] = useState<FolderOption[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | "ETALASE" | "">("");

  useEffect(() => {
    if (!open) return;
    setSelectedTarget("");
    setLoading(true);
    fetch(`/api/data-barang/unit/${unit.id}/compatible-folders`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setEmptyFolders(j.empty_folders ?? []);
          setMatchingFolders(j.matching_folders ?? []);
        } else {
          toast.error(j.message || "Gagal memuat folder tujuan");
        }
      })
      .catch(() => toast.error("Terjadi kesalahan koneksi"))
      .finally(() => setLoading(false));
  }, [open, unit.id]);

  const handleMove = async () => {
    if (!selectedTarget) {
      toast.error("Pilih tujuan dulu");
      return;
    }
    setMoving(true);
    try {
      const res = await fetch(`/api/data-barang/unit/${unit.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_folder_id: selectedTarget === "ETALASE" ? null : selectedTarget,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Gagal memindahkan unit");
        return;
      }
      toast.success(json.message);
      onMoved();
      onClose();
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setMoving(false);
    }
  };

  if (!open) return null;

  const labelFolder = (f: FolderOption) => {
    const name = f.laptop_name ?? f.name ?? "(belum ada identitas)";
    const parts = [f.category, name, f.grade, fmt(f.selling_price ?? f.sell_price)];
    return parts.filter(Boolean).join(" · ");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => !moving && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col animate-popIn">
        {/* Header */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-400 via-violet-600 to-violet-800 flex-shrink-0" />
        <div className="px-5 py-4 bg-violet-600 flex-shrink-0">
          <div className="flex items-center gap-2 text-white">
            <Move className="w-4 h-4" />
            <p className="font-bold text-sm">Pindahkan Unit</p>
          </div>
          <p className="text-xs text-white/70 mt-0.5">
            SN: <span className="font-mono">{unit.serial_number}</span>
            {unit.current_folder_label && <> · dari <span className="font-semibold">{unit.current_folder_label}</span></>}
          </p>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loading ? (
            <div className="py-10 text-center">
              <div className="w-8 h-8 border-2 border-zinc-200 border-t-violet-500 rounded-full animate-spin mx-auto" />
              <p className="text-xs text-zinc-400 mt-2">Memuat folder tujuan...</p>
            </div>
          ) : (
            <>
              {/* Pilihan: Etalase */}
              <label className="block cursor-pointer">
                <div className={`border rounded-xl p-3 transition ${selectedTarget === "ETALASE" ? "border-violet-500 bg-violet-50" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}>
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="target"
                      value="ETALASE"
                      checked={selectedTarget === "ETALASE"}
                      onChange={() => setSelectedTarget("ETALASE")}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-zinc-500" />
                        <p className="text-sm font-bold text-zinc-800">Etalase (tanpa folder)</p>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Unit berdiri sendiri sebagai SN Lepas</p>
                    </div>
                  </div>
                </div>
              </label>

              {/* Pilihan: Folder isi yang match */}
              {matchingFolders.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Folder yang Cocok ({matchingFolders.length})</p>
                  <div className="space-y-1.5">
                    {matchingFolders.map(f => (
                      <label key={f.id} className="block cursor-pointer">
                        <div className={`border rounded-xl p-3 transition ${selectedTarget === f.id ? "border-violet-500 bg-violet-50" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}>
                          <div className="flex items-start gap-2">
                            <input
                              type="radio"
                              name="target"
                              value={f.id}
                              checked={selectedTarget === f.id}
                              onChange={() => setSelectedTarget(f.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                                <p className="text-xs font-bold text-zinc-800 truncate">{labelFolder(f)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Pilihan: Folder kosong yang kategori match */}
              {emptyFolders.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Folder Kosong ({emptyFolders.length})</p>
                  <p className="text-[10px] text-zinc-400 mb-1.5">Folder akan adopt identitas dari unit ini.</p>
                  <div className="space-y-1.5">
                    {emptyFolders.map(f => (
                      <label key={f.id} className="block cursor-pointer">
                        <div className={`border rounded-xl p-3 transition ${selectedTarget === f.id ? "border-violet-500 bg-violet-50" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}>
                          <div className="flex items-start gap-2">
                            <input
                              type="radio"
                              name="target"
                              value={f.id}
                              checked={selectedTarget === f.id}
                              onChange={() => setSelectedTarget(f.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
                                <p className="text-xs font-bold text-zinc-800 truncate">
                                  Folder {f.device_type} · {f.category} <span className="text-zinc-400 font-normal">(kosong)</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {matchingFolders.length === 0 && emptyFolders.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Tidak ada folder lain yang cocok untuk unit ini. Pindahin ke Etalase, atau bikin folder baru dulu di tab Data Barang → <span className="font-bold">+ Folder</span>.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-100 flex gap-2 flex-shrink-0">
          <button onClick={onClose} disabled={moving}
            className="flex-1 h-10 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-semibold hover:bg-zinc-200 disabled:opacity-40">
            Batal
          </button>
          <button onClick={handleMove} disabled={moving || !selectedTarget || loading}
            className="flex-1 h-10 bg-gradient-to-r from-violet-600 to-violet-700 text-white rounded-xl text-sm font-bold hover:from-violet-700 hover:to-violet-800 disabled:opacity-40 flex items-center justify-center gap-2">
            {moving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Pindahkan
          </button>
        </div>
      </div>
    </div>
  );
}