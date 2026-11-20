"use client";
import { useState, useEffect } from "react";
import { X, FolderPlus } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  type: "LAPTOP" | "AKSESORIS";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddFolderOnlyModal({ open, onClose, onCreated }: Props) {
  const [type, setType] = useState<"LAPTOP" | "AKSESORIS">("LAPTOP");
  const [categoryId, setCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingCats(true);
    setCategoryId("");
    fetch(`/api/data-barang/categories?type=${type}`)
      .then(r => r.json())
      .then(j => { if (j.success) setCategories(j.data ?? []); })
      .catch(() => {})
      .finally(() => setLoadingCats(false));
  }, [open, type]);

  const handleSubmit = async () => {
    if (!categoryId) { toast.error("Pilih kategori dulu"); return; }
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/data-barang/folder/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, category: cat.name }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal bikin folder"); return; }
      toast.success(`Folder ${type === "LAPTOP" ? "Laptop" : "Aksesoris"} · ${cat.name} tercipta`);
      onCreated();
      onClose();
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-gray-800">Buat Folder Baru</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
            <p className="text-[11px] text-indigo-700 leading-relaxed">
              Folder dibuat <span className="font-bold">kosong</span>. Identitas detail
              (nama, spek, harga, grade) akan lahir dari <span className="font-bold">SN pertama</span> yang dimasukkan.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={e => setType(e.target.value as "LAPTOP" | "AKSESORIS")}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400"
            >
              <option value="LAPTOP">Laptop</option>
              <option value="AKSESORIS">Aksesoris</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
              Kategori <span className="text-red-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              disabled={loadingCats || categories.length === 0}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 disabled:opacity-50"
            >
              <option value="">{loadingCats ? "Memuat..." : "Pilih kategori"}</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!loadingCats && categories.length === 0 && (
              <p className="text-[10px] text-gray-400 mt-1">
                Belum ada kategori untuk type {type}. Buat kategori baru di tab <span className="font-bold">Kategori</span>.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200">
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !categoryId}
            className="flex-1 h-10 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-bold hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}