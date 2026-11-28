"use client";

import { useState } from "react";
import { X, Loader2, AlertTriangle, Plus } from "lucide-react";

interface Props {
  onClose: () => void;
  onSuccess: (platform: { id: string; platform: string; brand_toko: string; daftar_akun: string }) => void;
}

export default function TambahPlatformModal({ onClose, onSuccess }: Props) {
  const [platform, setPlatform] = useState("");
  const [brandToko, setBrandToko] = useState("");
  const [daftarAkun, setDaftarAkun] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!platform.trim() || !brandToko.trim() || !daftarAkun.trim()) {
      setError("Semua field wajib diisi");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/marketing-platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: platform.trim(),
          brand_toko: brandToko.trim(),
          daftar_akun: daftarAkun.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menambah platform");
      onSuccess(json.data);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" />
            </span>
            <div>
              <h2 className="font-bold text-gray-800 text-base">Tambah Platform</h2>
              <p className="text-xs text-gray-400 mt-0.5">Daftarkan platform + brand + akun baru</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Platform</label>
            <input
              type="text"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="misal: Facebook, TikTok, Instagram"
              className="w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:bg-white"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Brand Toko</label>
            <input
              type="text"
              value={brandToko}
              onChange={(e) => setBrandToko(e.target.value)}
              placeholder="misal: Solit, Sotech, Onpoint, Sultan Laptop"
              className="w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Daftar Akun</label>
            <input
              type="text"
              value={daftarAkun}
              onChange={(e) => setDaftarAkun(e.target.value)}
              placeholder="misal: @solitlaptop, Solit Komputer"
              className="w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:bg-white"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">
              Batal
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-11 bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white rounded-xl text-sm font-semibold hover:opacity-95 transition disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Menyimpan..." : "Simpan Platform"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}