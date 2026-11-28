"use client";

import { useState, useMemo, useRef } from "react";
import { X, Loader2, AlertTriangle, Plus, Search, Upload, Image as ImageIcon } from "lucide-react";
import { CurrencyInput } from "@/components/ui/CurrencyInputField";

interface Platform {
  id: string;
  platform: string;
  brand_toko: string;
  daftar_akun: string;
}

interface Props {
  platforms: Platform[];
  canManagePlatform: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onRequestAddPlatform: () => void;
}

// Reusable searchable dropdown
function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  canAdd,
  onAdd,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
  canAdd: boolean;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const uniq = Array.from(new Set(options));
    return q ? uniq.filter((o) => o.toLowerCase().includes(q)) : uniq;
  }, [options, search]);

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full h-10 px-3 text-sm text-left bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            <span className={value ? "text-gray-800" : "text-gray-400"}>
              {value || placeholder}
            </span>
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Cari..."
                      className="w-full pl-8 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400"
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-400">
                      Belum ada data
                    </div>
                  ) : (
                    filtered.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          onChange(opt);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-violet-50 ${
                          value === opt ? "bg-violet-50 text-violet-700 font-semibold" : "text-gray-700"
                        }`}
                      >
                        {opt}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            title="Tambah platform baru"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AwarenessFormModal({
  platforms,
  canManagePlatform,
  onClose,
  onSuccess,
  onRequestAddPlatform,
}: Props) {
  const [platform, setPlatform] = useState("");
  const [brandToko, setBrandToko] = useState("");
  const [daftarAkun, setDaftarAkun] = useState("");
  const [jangkauan, setJangkauan] = useState(0);
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cascade filter: brand opsinya bergantung platform, akun bergantung platform+brand
  const platformOptions = useMemo(
    () => platforms.map((p) => p.platform),
    [platforms]
  );
  const brandOptions = useMemo(
    () => platforms.filter((p) => !platform || p.platform === platform).map((p) => p.brand_toko),
    [platforms, platform]
  );
  const akunOptions = useMemo(
    () =>
      platforms
        .filter((p) => (!platform || p.platform === platform) && (!brandToko || p.brand_toko === brandToko))
        .map((p) => p.daftar_akun),
    [platforms, platform, brandToko]
  );

  // Match ke platform_id (harus ketemu 1 row persis)
  const matchedPlatform = useMemo(
    () =>
      platforms.find(
        (p) => p.platform === platform && p.brand_toko === brandToko && p.daftar_akun === daftarAkun
      ),
    [platforms, platform, brandToko, daftarAkun]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setFotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadFoto = async (): Promise<string | null> => {
    if (!fotoFile) return null;
    const fd = new FormData();
    fd.append("file", fotoFile);
    const res = await fetch("/api/marketing-awareness/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Gagal upload foto");
    return json.url as string;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!matchedPlatform) {
      setError("Kombinasi Platform + Brand + Akun ini belum terdaftar. Tambah dulu lewat tombol +");
      return;
    }
    if (jangkauan <= 0) {
      setError("Jangkauan harus lebih dari 0");
      return;
    }
    if (!tanggal) {
      setError("Tanggal wajib diisi");
      return;
    }

    try {
      setLoading(true);
      const foto_bukti_url = await uploadFoto();
      const res = await fetch("/api/marketing-awareness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: matchedPlatform.id,
          jangkauan,
          foto_bukti_url,
          tanggal,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menyimpan");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-base">Tambah Laporan Awareness</h2>
            <p className="text-xs text-gray-400 mt-0.5">Catat jangkauan konten per platform</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-3.5">
          <SearchableSelect
            label="Platform"
            value={platform}
            options={platformOptions}
            onChange={(v) => {
              setPlatform(v);
              setBrandToko("");
              setDaftarAkun("");
            }}
            placeholder="Pilih platform..."
            canAdd={canManagePlatform}
            onAdd={onRequestAddPlatform}
          />
          <SearchableSelect
            label="Brand Toko"
            value={brandToko}
            options={brandOptions}
            onChange={(v) => {
              setBrandToko(v);
              setDaftarAkun("");
            }}
            placeholder={platform ? "Pilih brand..." : "Pilih platform dulu"}
            canAdd={canManagePlatform}
            onAdd={onRequestAddPlatform}
          />
          <SearchableSelect
            label="Daftar Akun"
            value={daftarAkun}
            options={akunOptions}
            onChange={setDaftarAkun}
            placeholder={brandToko ? "Pilih akun..." : "Pilih brand dulu"}
            canAdd={canManagePlatform}
            onAdd={onRequestAddPlatform}
          />

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Jangkauan</label>
            <CurrencyInput
              value={jangkauan}
              onChange={setJangkauan}
              placeholder="0"
              className="w-full h-10 px-3 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/20 focus:bg-white"
            />
            <p className="mt-1 text-[11px] text-gray-400">Jumlah orang yang melihat konten</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/20 focus:bg-white"
            />
            <p className="mt-1 text-[11px] text-gray-400">Format tampilan: dd/mm/yy</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Foto Bukti (opsional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            {fotoPreview ? (
              <div className="relative inline-block">
                <img src={fotoPreview} alt="preview" className="h-32 rounded-xl border border-gray-200" />
                <button
                  type="button"
                  onClick={() => {
                    setFotoFile(null);
                    setFotoPreview("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-violet-300 hover:bg-violet-50/30"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs">Klik untuk upload foto</span>
              </button>
            )}
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
              {loading ? "Menyimpan..." : "Simpan Laporan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}