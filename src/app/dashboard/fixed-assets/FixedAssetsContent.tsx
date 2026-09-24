"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";

interface FixedAsset {
  id: string;
  nama_aset: string;
  nominal: number;
  keterangan: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface FormState {
  nama_aset: string;
  nominal: string;
  keterangan: string;
}

const EMPTY_FORM: FormState = { nama_aset: "", nominal: "", keterangan: "" };

function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

// Versi ringkas untuk legend: 1.250.000.000 -> "Rp 1,25 M"
function formatIDRShort(value: number): string {
  const v = value || 0;
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (v >= 1_000) return `Rp ${(v / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return formatIDR(v);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Tampilan input nominal: "15000000" -> "15.000.000" (state tetap angka mentah)
function formatThousand(raw: string): string {
  if (!raw.trim()) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}



// ═════════════════════════════════════════════════════════════════════════════
// Ikon per jenis aset
// ═════════════════════════════════════════════════════════════════════════════
type IconProps = { className?: string; size?: number };

function Svg({ children, className, size = 18 }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function AssetIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 11h.01M15 11h.01" />
    </Svg>
  );
}

function PhoneIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="2" width="11" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </Svg>
  );
}

function CarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </Svg>
  );
}

function MotorIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5.5" cy="17" r="3" />
      <circle cx="18.5" cy="17" r="3" />
      <path d="M5.5 17 9 11h6l3.5 6" />
      <path d="M15 11l1.5-4H19" />
      <path d="M8 11 7 8H4.5" />
    </Svg>
  );
}

function TableIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 7h18v3H3z" />
      <path d="M5 10v10M19 10v10" />
      <path d="M5 15h14" />
    </Svg>
  );
}

function AcIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2" y="4" width="20" height="9" rx="2" />
      <path d="M6 9.5h12" />
      <path d="M7 16.5c0 1.5-1 2-1 3.5M12 16.5v4.5M17 16.5c0 1.5 1 2 1 3.5" />
    </Svg>
  );
}

function LaptopIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4.5" width="16" height="11" rx="1.5" />
      <path d="M2 19.5h20" />
    </Svg>
  );
}

function ChairIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 12V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V12" />
      <path d="M5 12h14v3H5z" />
      <path d="M7 15v6M17 15v6" />
    </Svg>
  );
}

function PrinterIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </Svg>
  );
}

// ── Deteksi jenis aset dari nama ────────────────────────────────────────────
// Urutan penting: "laptop" dicek SEBELUM "hp", supaya "Laptop HP 14s"
// terdeteksi sebagai laptop, bukan handphone.
interface AssetType {
  key: string;
  label: string;
  pattern: RegExp;
  Icon: (p: IconProps) => ReactNode;
  tile: string; // warna kotak ikon
  bar: string; // warna segmen bar komposisi & dot legend
}

const ASSET_TYPES: AssetType[] = [
  {
    key: "laptop",
    label: "Laptop / PC",
    pattern: /\b(laptop|notebook|macbook|thinkpad|komputer|computer|pc|monitor)\b/,
    Icon: LaptopIcon,
    tile: "bg-slate-100 text-slate-700",
    bar: "bg-slate-300",
  },
  {
    key: "hp",
    label: "HP",
    pattern: /\b(hp|handphone|ponsel|smartphone|iphone|android|samsung|xiaomi|redmi|oppo|vivo|realme|infinix|tablet|ipad)\b/,
    Icon: PhoneIcon,
    tile: "bg-sky-50 text-sky-700",
    bar: "bg-sky-400",
  },
  {
    key: "mobil",
    label: "Mobil",
    pattern: /\b(mobil|car|avanza|xenia|innova|brio|ayla|agya|sigra|calya|ertiga|pajero|fortuner|pick ?up|grand ?max|l300|truk|truck|karimun|wagon ?r|apv|carry|luxio|gran ?max|xpander|livina|terios|rush|jazz|mobilio|sirion|expander|hiace|elf|colt)\b/,
    Icon: CarIcon,
    tile: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-400",
  },
  {
    key: "motor",
    label: "Motor",
    pattern: /\b(motor|sepeda motor|beat|vario|scoopy|nmax|aerox|pcx|mio|supra|revo|genio|fino|lexi|xmax)\b/,
    Icon: MotorIcon,
    tile: "bg-orange-50 text-orange-700",
    bar: "bg-orange-400",
  },
  {
    key: "meja",
    label: "Meja",
    pattern: /\b(meja|desk|table|etalase|counter)\b/,
    Icon: TableIcon,
    tile: "bg-amber-50 text-amber-700",
    bar: "bg-amber-300",
  },
  {
    key: "ac",
    label: "AC",
    pattern: /\b(ac|air conditioner|pendingin ruangan)\b/,
    Icon: AcIcon,
    tile: "bg-cyan-50 text-cyan-700",
    bar: "bg-cyan-400",
  },
  {
    key: "kursi",
    label: "Kursi",
    pattern: /\b(kursi|chair|sofa|bangku)\b/,
    Icon: ChairIcon,
    tile: "bg-rose-50 text-rose-700",
    bar: "bg-rose-400",
  },
  {
    key: "printer",
    label: "Printer",
    pattern: /\b(printer|scanner|fotocopy|mesin cetak)\b/,
    Icon: PrinterIcon,
    tile: "bg-violet-50 text-violet-700",
    bar: "bg-violet-400",
  },
];

const DEFAULT_ASSET_TYPE: AssetType = {
  key: "lainnya",
  label: "Lainnya",
  pattern: /$^/,
  Icon: AssetIcon,
  tile: "bg-[#1a1a2e]/5 text-[#1a1a2e]/70",
  bar: "bg-white/40",
};

function detectAssetType(nama: string): AssetType {
  const normalized = nama.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  return ASSET_TYPES.find((t) => t.pattern.test(normalized)) ?? DEFAULT_ASSET_TYPE;
}

// ═════════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════════
export default function FixedAssetsContent() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Filter jenis aset (UI-only, di atas hasil search)
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FixedAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fixed-assets", { cache: "no-store" });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal memuat data aset");
      setAssets(d.data || []);
    } catch (err: any) {
      setError(err.message || "Gagal memuat data aset");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const totalNominal = useMemo(
    () => assets.reduce((sum, a) => sum + (Number(a.nominal) || 0), 0),
    [assets]
  );

  const maxNominal = useMemo(
    () => assets.reduce((m, a) => Math.max(m, Number(a.nominal) || 0), 0),
    [assets]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.nama_aset.toLowerCase().includes(q) ||
        (a.keterangan || "").toLowerCase().includes(q)
    );
  }, [assets, query]);

  // Hasil akhir yang ditampilkan: search → filter jenis
  const visibleAssets = useMemo(() => {
    if (typeFilter === "all") return filtered;
    return filtered.filter((a) => detectAssetType(a.nama_aset).key === typeFilter);
  }, [filtered, typeFilter]);

  // ── Display-only: komposisi aset per jenis ────────────────────────────────
  const typeBreakdown = useMemo(() => {
    const map = new Map<string, { type: AssetType; count: number; total: number }>();
    assets.forEach((a) => {
      const type = detectAssetType(a.nama_aset);
      const cur = map.get(type.key) ?? { type, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(a.nominal) || 0;
      map.set(type.key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [assets]);

  // Kalau jenis yang dipilih sudah tidak ada (mis. aset terakhirnya dihapus), balik ke "all"
  useEffect(() => {
    if (typeFilter !== "all" && !typeBreakdown.some((t) => t.type.key === typeFilter)) {
      setTypeFilter("all");
    }
  }, [typeBreakdown, typeFilter]);

  function openCreateModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEditModal(asset: FixedAsset) {
    setEditingId(asset.id);
    setForm({
      nama_aset: asset.nama_aset,
      nominal: String(asset.nominal),
      keterangan: asset.keterangan || "",
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nama_aset.trim()) {
      setError("Nama aset wajib diisi");
      return;
    }
    const nominalNumber = Number(form.nominal);
    if (!Number.isFinite(nominalNumber) || nominalNumber < 0) {
      setError("Nominal tidak valid");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        nama_aset: form.nama_aset.trim(),
        nominal: nominalNumber,
        keterangan: form.keterangan.trim() || null,
      };
      const res = await fetch(
        editingId ? `/api/fixed-assets/${editingId}` : "/api/fixed-assets",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menyimpan aset");
      setModalOpen(false);
      await fetchAssets();
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan aset");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/fixed-assets/${deleteTarget.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menghapus aset");
      setDeleteTarget(null);
      await fetchAssets();
    } catch (err: any) {
      setError(err.message || "Gagal menghapus aset");
    } finally {
      setDeleting(false);
    }
  }

  const formType = detectAssetType(form.nama_aset);
  const FormTypeIcon = formType.Icon;
  const isFiltering = query.trim() !== "" || typeFilter !== "all";

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-28 sm:pb-10 max-w-6xl mx-auto">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-[#1a1a2e] tracking-tight">Data Aset Tetap</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Catatan aset tetap perusahaan, input manual dan tidak terhubung ke modul lain
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="hidden sm:inline-flex items-center gap-2 rounded-full bg-[#1a1a2e] text-white text-sm font-semibold pl-4 pr-5 py-2.5 hover:bg-[#2d2d4a] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1a1a2e]/20 transition-all shadow-lg shadow-[#1a1a2e]/25 flex-shrink-0"
          >
            <PlusIcon className="text-amber-300" />
            Tambah Aset
          </button>
        </header>

        {/* ── Panel ringkasan + komposisi nilai ──────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl bg-[#1a1a2e] text-white shadow-xl shadow-[#1a1a2e]/20 mb-5">
          <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl" aria-hidden="true" />
          <div className="relative grid grid-cols-1 lg:grid-cols-5">
            {/* Kiri: total & jumlah */}
            <div className="lg:col-span-2 p-5 sm:p-7 lg:border-r border-white/10">
              <p className="text-xs font-semibold text-white/50">Total nilai aset</p>
              {loading ? (
                <div className="h-10 w-56 rounded-lg bg-white/10 animate-pulse mt-2" />
              ) : (
                <p className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight mt-1.5 break-all">
                  {formatIDR(totalNominal)}
                </p>
              )}
              <div className="flex items-center gap-4 mt-5">
                <div>
                  <p className="text-[11px] text-white/40">Jumlah aset</p>
                  <p className="text-lg font-bold tabular-nums">
                    {loading ? "—" : assets.length}
                    <span className="text-xs font-medium text-white/40 ml-1">unit</span>
                  </p>
                </div>
                <div className="w-px h-9 bg-white/10" />
                <div>
                  <p className="text-[11px] text-white/40">Jenis aset</p>
                  <p className="text-lg font-bold tabular-nums">
                    {loading ? "—" : typeBreakdown.length}
                    <span className="text-xs font-medium text-white/40 ml-1">kategori</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Kanan: bar komposisi */}
            <div className="lg:col-span-3 px-5 pb-5 sm:px-7 sm:pb-7 lg:pt-7 border-t lg:border-t-0 border-white/10">
              <div className="flex items-center justify-between mb-3 pt-5 lg:pt-0">
                <p className="text-xs font-semibold text-white/50">Komposisi nilai per jenis</p>
                {typeFilter !== "all" && (
                  <button
                    onClick={() => setTypeFilter("all")}
                    className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 transition"
                  >
                    Reset filter
                  </button>
                )}
              </div>

              {loading ? (
                <div className="h-3 w-full rounded-full bg-white/10 animate-pulse" />
              ) : totalNominal > 0 ? (
                <div className="flex h-3 w-full rounded-full overflow-hidden bg-white/5 gap-0.5">
                  {typeBreakdown.map(({ type, total }) => (
                    <div
                      key={type.key}
                      className={`${type.bar} h-full transition-opacity ${typeFilter !== "all" && typeFilter !== type.key ? "opacity-25" : ""}`}
                      style={{ width: `${(total / totalNominal) * 100}%` }}
                      title={`${type.label}: ${formatIDR(total)}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="h-3 w-full rounded-full bg-white/5" />
              )}

              {/* Legend = sekaligus filter jenis */}
              {!loading && typeBreakdown.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-4">
                  {typeBreakdown.map(({ type, count, total }) => {
                    const active = typeFilter === type.key;
                    const pct = totalNominal > 0 ? Math.round((total / totalNominal) * 100) : 0;
                    return (
                      <button
                        key={type.key}
                        onClick={() => setTypeFilter(active ? "all" : type.key)}
                        aria-pressed={active}
                        className={`text-left rounded-xl px-2.5 py-2 transition border ${active
                          ? "bg-white/15 border-white/25"
                          : "bg-white/[0.03] border-transparent hover:bg-white/10"
                          }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${type.bar}`} />
                          <span className="text-xs font-semibold truncate">{type.label}</span>
                          <span className="ml-auto text-[10px] text-white/40 tabular-nums">{count}</span>
                        </div>
                        <p className="text-[11px] text-white/50 tabular-nums mt-0.5 pl-3.5">
                          {formatIDRShort(total)}
                          <span className="text-white/30"> ({pct}%)</span>
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Error halaman (saat modal tertutup) */}
        {error && !modalOpen && (
          <div role="alert" className="mb-4 rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 border border-red-100">
            {error}
          </div>
        )}

        {/* ── Toolbar: search + info ─────────────────────────────────────────── */}
        {assets.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 mb-4">
            <div className="relative flex-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama aset atau keterangan..."
                className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-9 py-2.5 text-sm outline-none focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Hapus pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 sm:flex-shrink-0">
              Menampilkan <span className="font-semibold text-gray-800 tabular-nums">{visibleAssets.length}</span> dari{" "}
              <span className="tabular-nums">{assets.length}</span> aset
              {typeFilter !== "all" && (
                <>
                  {" "}jenis{" "}
                  <span className="font-semibold text-gray-800">
                    {typeBreakdown.find((t) => t.type.key === typeFilter)?.type.label}
                  </span>
                </>
              )}
            </p>
          </div>
        )}

        {/* ── Daftar aset (kartu tag inventaris) ─────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-gray-100 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 bg-gray-100 rounded animate-pulse" />
                    <div className="h-2.5 w-1/3 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="border-t border-dashed border-gray-200 pt-3">
                  <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleAssets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
              <AssetIcon className="text-amber-500" size={22} />
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {assets.length === 0 ? "Belum ada data aset" : "Tidak ditemukan"}
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              {assets.length === 0
                ? 'Klik "Tambah Aset" untuk mulai mencatat.'
                : query.trim()
                  ? `Tidak ada aset yang cocok dengan "${query}"`
                  : "Tidak ada aset di jenis ini."}
            </p>
            {assets.length === 0 ? (
              <button
                onClick={openCreateModal}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-[#1a1a2e] bg-amber-100 hover:bg-amber-200 transition"
              >
                <PlusIcon />
                Tambah Aset
              </button>
            ) : isFiltering ? (
              <button
                onClick={() => {
                  setQuery("");
                  setTypeFilter("all");
                }}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
              >
                Tampilkan semua aset
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {visibleAssets.map((asset) => (
              <AssetTagCard
                key={asset.id}
                asset={asset}
                maxNominal={maxNominal}
                totalNominal={totalNominal}
                onEdit={() => openEditModal(asset)}
                onDelete={() => setDeleteTarget(asset)}
              />
            ))}
          </ul>
        )}

        {/* ── FAB Tambah Aset (khusus HP) ───────────────────────────────────── */}
        {!modalOpen && (
          <button
            onClick={openCreateModal}
            aria-label="Tambah Aset"
            className="sm:hidden fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 inline-flex items-center gap-2 pl-4 pr-5 h-12 rounded-full bg-[#1a1a2e] text-white text-sm font-bold shadow-xl shadow-[#1a1a2e]/30 active:scale-95 transition"
          >
            <PlusIcon className="text-amber-300" />
            Tambah Aset
          </button>
        )}

        {/* ── Add/Edit modal ─────────────────────────────────────────────────── */}
        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
            onClick={closeModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="asset-modal-title"
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[92dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Preview jenis aset di header modal */}
              <div className="bg-[#1a1a2e] px-5 sm:px-6 pt-4 pb-5 rounded-t-3xl">
                <div className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-white/20 mb-4" />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${formType.tile}`}>
                      <FormTypeIcon size={22} />
                    </div>
                    <div className="min-w-0">
                      <h2 id="asset-modal-title" className="text-base font-bold text-white">
                        {editingId ? "Edit Aset" : "Tambah Aset"}
                      </h2>
                      <p className="text-xs text-white/50 truncate">
                        Jenis terdeteksi: <span className="font-semibold text-amber-300">{formType.label}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                    aria-label="Tutup"
                    className="p-2 -m-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition disabled:opacity-50"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4">
                <div>
                  <label htmlFor="asset-name" className="block text-xs font-semibold text-gray-600 mb-1.5">Nama Aset</label>
                  <input
                    id="asset-name"
                    type="text"
                    value={form.nama_aset}
                    onChange={(e) => setForm((f) => ({ ...f, nama_aset: e.target.value }))}
                    placeholder="Contoh: Motor Honda Beat 2022"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition"
                    required
                    autoFocus
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Ikon otomatis mengikuti nama, contoh: motor, mobil, AC, meja, HP.
                  </p>
                </div>

                <div>
                  <label htmlFor="asset-nominal" className="block text-xs font-semibold text-gray-600 mb-1.5">Nominal</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">Rp</span>
                    <input
                      id="asset-nominal"
                      type="text"
                      inputMode="numeric"
                      value={formatThousand(form.nominal)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, nominal: e.target.value.replace(/\D/g, "") }))
                      }
                      placeholder="0"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/60 pl-10 pr-3.5 py-3 text-base font-bold text-[#1a1a2e] tabular-nums outline-none focus:bg-white focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="asset-note" className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Keterangan <span className="font-normal text-gray-400">(opsional)</span>
                  </label>
                  <textarea
                    id="asset-note"
                    value={form.keterangan}
                    onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                    placeholder="Contoh: Plat B 1234 XYZ, dipakai tim kurir"
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition resize-none"
                  />
                </div>

                {/* Error di dalam modal supaya kelihatan */}
                {error && (
                  <div role="alert" className="rounded-xl bg-red-50 text-red-600 text-sm px-3.5 py-2.5 border border-red-100">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                    className="flex-1 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1a1a2e] hover:bg-[#2d2d4a] transition disabled:opacity-50"
                  >
                    {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {saving ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Delete confirm modal ───────────────────────────────────────────── */}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="asset-delete-title"
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-gray-200 mb-5" />
              <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
                <TrashIcon className="text-red-500" size={18} />
              </div>
              <h2 id="asset-delete-title" className="text-base font-bold text-gray-800 mb-1.5">Hapus Aset?</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                <span className="font-semibold text-gray-700">{deleteTarget.nama_aset}</span> akan dihapus
                permanen dan tidak bisa dikembalikan.
              </p>
              <div className="mt-3 mb-5 flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-2.5">
                <span className="text-xs text-gray-500">Nilai aset</span>
                <span className="text-sm font-bold text-red-600 tabular-nums">{formatIDR(deleteTarget.nominal)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
                >
                  {deleting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {deleting ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-component: Kartu tag inventaris
// ═════════════════════════════════════════════════════════════════════════════
function AssetTagCard({
  asset,
  maxNominal,
  totalNominal,
  onEdit,
  onDelete,
}: {
  asset: FixedAsset;
  maxNominal: number;
  totalNominal: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const type = detectAssetType(asset.nama_aset);
  const TypeIcon = type.Icon;
  const nominal = Number(asset.nominal) || 0;
  const barPct = maxNominal > 0 ? Math.max(4, (nominal / maxNominal) * 100) : 0;
  const sharePct = totalNominal > 0 ? (nominal / totalNominal) * 100 : 0;

  return (
    <li className="group relative flex flex-col rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition">
      {/* Bagian atas: identitas aset */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${type.tile}`}>
          <TypeIcon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-semibold text-gray-500">{type.label}</span>
          </div>
          <p className="text-sm font-bold text-gray-900 leading-snug break-words line-clamp-2">
            {asset.nama_aset}
          </p>
        </div>
        <div className="flex items-center -mr-1.5 -mt-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-gray-400 hover:text-[#1a1a2e] hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 transition"
            aria-label={`Edit ${asset.nama_aset}`}
          >
            <EditIcon />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 transition"
            aria-label={`Hapus ${asset.nama_aset}`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {asset.keterangan && (
        <p className="px-4 -mt-1 mb-3 text-xs text-gray-500 leading-relaxed line-clamp-2 break-words">
          {asset.keterangan}
        </p>
      )}

      {/* Garis sobek ala label inventaris */}
      <div className="mt-auto mx-4 border-t border-dashed border-gray-200" aria-hidden="true" />

      {/* Bagian bawah: nilai */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-lg font-black text-[#1a1a2e] tabular-nums tracking-tight">
            {formatIDR(nominal)}
          </p>
          <p className="text-[11px] font-semibold text-amber-600 tabular-nums flex-shrink-0 pb-0.5">
            {sharePct > 0 && sharePct < 1 ? "<1" : Math.round(sharePct)}% total
          </p>
        </div>
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden mt-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
            style={{ width: `${barPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 mt-3 text-[11px] text-gray-400">
          <span className="truncate">
            {asset.created_by_name ? `Dicatat ${asset.created_by_name}` : "Dicatat"}
          </span>
          <span className="flex-shrink-0 tabular-nums">{formatDate(asset.created_at)}</span>
        </div>
      </div>
    </li>
  );
}

// ── Small action icons ───────────────────────────────────────────────────────
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function TrashIcon({ className, size = 15 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}