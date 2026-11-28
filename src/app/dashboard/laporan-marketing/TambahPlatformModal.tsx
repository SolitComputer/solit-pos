"use client";
import { useState } from "react";
import { X, Loader2, AlertTriangle, Layers, Store } from "lucide-react";

interface Props {
  brandId: string;
  brandName: string;
  onClose: () => void;
  onSuccess: (platform: { id: string; name: string; brand_id: string }) => void;
}

export default function TambahPlatformModal({ brandId, brandName, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Nama platform wajib diisi");
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/marketing-brand-platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal");
      onSuccess(json.data);
      onClose();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </span>
            <div>
              <h2 className="font-bold text-gray-800 text-base">Tambah Platform</h2>
              <p className="text-xs text-gray-400 mt-0.5">Platform media sosial / iklan baru</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {/* Banner context — kasih tau user platform ini akan masuk ke toko mana */}
          <div className="flex items-start gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
            <Store className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-violet-700">
              Platform ini akan masuk ke toko <strong className="font-bold">{brandName}</strong>
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nama Platform</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="misal: Facebook, TikTok, Instagram, Shopee"
              className="w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:bg-white" />
          </div>
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
              Batal
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-11 bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white rounded-xl text-sm font-semibold hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Menyimpan..." : "Simpan Platform"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}