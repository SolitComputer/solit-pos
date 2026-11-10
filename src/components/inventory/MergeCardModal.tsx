// src/components/inventory/MergeCardModal.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { X, Search, Merge, AlertTriangle, CheckCircle2, Package } from "lucide-react";
import { isLaptopsIdentical, getDifferingFields, type LaptopForDedup } from "@/lib/dedupHash";

interface Candidate extends LaptopForDedup {
  id: string;
  qty: number;
  dedup_hash: string | null;
}

interface SourceLaptop extends LaptopForDedup {
  id: string;
}

export default function MergeCardModal({
  source, onClose, onMerged,
}: {
  source: SourceLaptop;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // Fetch kandidat dari server (debounced via useEffect)
  const fetchCandidates = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const url = `/api/laptops/dedup/candidates?source_id=${source.id}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setCandidates(json.data ?? []);
    } catch { setCandidates([]); } finally { setLoading(false); }
  }, [source.id]);

  useEffect(() => {
    const t = setTimeout(() => fetchCandidates(search), 300);
    return () => clearTimeout(t);
  }, [search, fetchCandidates]);

  // ESC untuk close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !merging) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, merging]);

  // Classify tiap kandidat: identical / differ
  const classified = useMemo(() => {
    return candidates.map(c => ({
      ...c,
      _identical: isLaptopsIdentical(source, c),
      _diff: getDifferingFields(source, c),
    }));
  }, [candidates, source]);

  const selected = classified.find(c => c.id === selectedId) ?? null;
  const canMerge = selected?._identical === true;

  const handleMerge = async () => {
    if (!selected || !canMerge) return;
    if (!confirm(
      `GABUNGKAN CARD?\n\n` +
      `${source.laptop_name} (${source.id.slice(0, 8)}...)\n→\n${selected.laptop_name} (${selected.id.slice(0, 8)}...)\n\n` +
      `Semua unit dari card source akan pindah ke target. Card source akan DIHAPUS. Aksi tidak bisa di-undo.`
    )) return;

    setMerging(true);
    try {
      const res = await fetch("/api/laptops/dedup/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: source.id, target_id: selected.id }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal merge"); return; }
      toast.success(json.message);
      onMerged();
    } finally { setMerging(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !merging && onClose()} />
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Gabungkan ke Card</p>
            <h2 className="text-white font-bold text-base mt-0.5 truncate">{source.laptop_name || "Laptop"}</h2>
            <p className="text-[11px] text-white/60 mt-0.5 font-mono">ID: {source.id.slice(0, 8)}...</p>
          </div>
          <button onClick={onClose} disabled={merging}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:bg-white/15 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Pilih <span className="font-bold">card target</span> yang datanya <span className="font-bold">SAMA PERSIS</span>.
              Semua 6 field (brand, nama, cpu, ram, storage, gpu) harus identik.
              Kalau 1 field saja beda — tidak bisa merge. Gunakan Edit Laptop untuk samakan dulu.
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama laptop lain untuk dijadikan target..."
              className="w-full h-10 border border-zinc-200 rounded-xl pl-9 pr-8 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-3 text-zinc-400 hover:text-zinc-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Candidates list */}
          {loading ? (
            <div className="py-10 text-center">
              <div className="w-6 h-6 border-2 border-zinc-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : classified.length === 0 ? (
            <div className="py-10 text-center">
              <Package className="w-10 h-10 text-zinc-200 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 font-medium">Tidak ada kandidat</p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {search ? "Coba kata kunci lain" : "Belum ada laptop lain dengan nama/hash mirip"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {classified.map(c => {
                const isSelected = c.id === selectedId;
                return (
                  <button key={c.id} onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${isSelected
                      ? c._identical ? "border-emerald-500 bg-emerald-50" : "border-rose-400 bg-rose-50"
                      : c._identical ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-400" : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c._identical ? "bg-emerald-100" : "bg-amber-100"}`}>
                        {c._identical ? <CheckCircle2 size={14} className="text-emerald-700" /> : <AlertTriangle size={14} className="text-amber-700" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-800 truncate">{c.laptop_name}</p>
                          {c._identical ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded">
                              SAMA PERSIS ✓
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                              {c._diff.length} FIELD BEDA
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                          {[c.brand, c.cpu, c.ram, c.storage, c.gpu].filter(Boolean).join(" · ") || "— tanpa spek —"}
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-1">
                          <span className="font-semibold">{c.qty ?? 0} unit</span> · ID: <span className="font-mono">{c.id.slice(0, 8)}...</span>
                        </p>
                        {!c._identical && c._diff.length > 0 && (
                          <p className="text-[10px] text-amber-700 mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            Beda: <span className="font-bold">{c._diff.join(", ")}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 bg-white">
          <button onClick={onClose} disabled={merging}
            className="flex-1 h-10 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-semibold hover:bg-zinc-200 disabled:opacity-40">
            Batal
          </button>
          <button onClick={handleMerge} disabled={!canMerge || merging}
            className="flex-1 h-10 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-bold hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-40 flex items-center justify-center gap-2">
            {merging && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            <Merge size={14} />
            {selected ? (canMerge ? "Gabungkan Sekarang" : "Tidak Bisa Merge (field beda)") : "Pilih target dulu"}
          </button>
        </div>
      </div>
    </div>
  );
}