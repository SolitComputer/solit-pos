"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Trash2, Loader2, Plus, ChevronDown, ChevronRight,
  Layers, AlertTriangle, Search, Store, AtSign,
} from "lucide-react";

interface Brand { id: string; name: string; }
interface Platform { id: string; name: string; brand_id: string; brand?: Brand; }
interface Account { id: string; name: string; brand_platform_id: string; }

interface Props {
  canManagePlatform: boolean;
  refreshKey: number;
  onRefresh: () => void;
  onRequestAddBrand: () => void;
  onRequestAddPlatform: (brandId: string, brandName: string) => void;
  onRequestAddAccount: (brandPlatformId: string, platformName: string, brandName: string) => void;
}

export default function KelolaPlatform({
  canManagePlatform, refreshKey, onRefresh,
  onRequestAddBrand, onRequestAddPlatform, onRequestAddAccount,
}: Props) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch 3 tabel sekaligus — tidak terlalu berat karena data sedikit
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [brandsRes, platformsRes, accountsRes] = await Promise.all([
          fetch("/api/marketing-brands"),
          fetch("/api/marketing-brand-platforms"),
          fetch("/api/marketing-platform-accounts"),
        ]);
        const [b, p, a] = await Promise.all([brandsRes.json(), platformsRes.json(), accountsRes.json()]);
        if (b.success) setBrands(b.data);
        if (p.success) setPlatforms(p.data);
        if (a.success) setAccounts(a.data);
      } catch (err: any) { setError(err.message); } finally { setLoading(false); }
    })();
  }, [refreshKey]);

  // Build tree
  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredBrands = q
      ? brands.filter((b) => b.name.toLowerCase().includes(q))
      : brands;
    return filteredBrands.map((brand) => {
      const brandPlatforms = platforms.filter((p) => p.brand_id === brand.id);
      return {
        ...brand,
        platforms: brandPlatforms.map((p) => ({
          ...p,
          accounts: accounts.filter((a) => a.brand_platform_id === p.id),
        })),
      };
    });
  }, [brands, platforms, accounts, search]);

  const toggleBrand = (id: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const togglePlatform = (id: string) => {
    setExpandedPlatforms((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const doDelete = async (url: string, confirmMsg: string, key: string) => {
    if (!confirm(confirmMsg)) return;
    setDeleting(key); setError("");
    try {
      const res = await fetch(url, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal");
      onRefresh();
    } catch (err: any) { setError(err.message); } finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Kelola Toko / Platform / Akun</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {brands.length} toko · {platforms.length} platform · {accounts.length} akun
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari toko..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-full outline-none focus:border-violet-400 focus:bg-white" />
            </div>
            {canManagePlatform && (
              <button onClick={onRequestAddBrand}
                className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-xs font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm hover:opacity-95">
                <Plus className="w-3.5 h-3.5" /> Tambah Toko
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">
            {[1,2,3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : tree.length === 0 ? (
          <div className="py-12 text-center">
            <Store className="w-10 h-10 text-violet-200 mx-auto mb-2" />
            <p className="text-sm text-gray-700 font-medium">
              {search ? `Tidak ketemu "${search}"` : "Belum ada toko"}
            </p>
            {!search && canManagePlatform && (
              <p className="text-xs text-gray-400 mt-1">Klik "Tambah Toko" untuk mulai</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {tree.map((brand) => {
              const brandOpen = expandedBrands.has(brand.id);
              const isDeletingBrand = deleting === `brand:${brand.id}`;
              return (
                <div key={brand.id}>
                  {/* Row toko */}
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-violet-50/30">
                    <button onClick={() => toggleBrand(brand.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      {brandOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <Store className="w-4 h-4 text-violet-600" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{brand.name}</p>
                        <p className="text-[10px] text-gray-500">
                          {brand.platforms.length} platform · {brand.platforms.reduce((s, p) => s + p.accounts.length, 0)} akun
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      {canManagePlatform && (
                        <>
                          <button onClick={() => onRequestAddPlatform(brand.id, brand.name)}
                            title="Tambah platform di toko ini"
                            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 hover:bg-violet-100">
                            <Plus className="w-3 h-3" /> Platform
                          </button>
                          <button onClick={() => doDelete(
                            `/api/marketing-brands/${brand.id}`,
                            `Hapus toko "${brand.name}" beserta SEMUA platform & akun di bawahnya?\n\nLaporan historis tetap aman.`,
                            `brand:${brand.id}`,
                          )} disabled={isDeletingBrand}
                            title="Hapus toko"
                            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 disabled:opacity-50">
                            {isDeletingBrand ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Platforms di bawah toko */}
                  {brandOpen && (
                    <div className="bg-gray-50/50 px-4 py-2 space-y-1.5">
                      {brand.platforms.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic px-3 py-2">Belum ada platform di toko ini</p>
                      ) : brand.platforms.map((platform) => {
                        const platformOpen = expandedPlatforms.has(platform.id);
                        const isDeletingPlatform = deleting === `platform:${platform.id}`;
                        return (
                          <div key={platform.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-fuchsia-50/40 border-b border-gray-100">
                              <button onClick={() => togglePlatform(platform.id)}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                {platformOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                <Layers className="w-3.5 h-3.5 text-fuchsia-600" />
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 truncate">{platform.name}</p>
                                  <p className="text-[10px] text-gray-400">{platform.accounts.length} akun</p>
                                </div>
                              </button>
                              <div className="flex items-center gap-1">
                                {canManagePlatform && (
                                  <>
                                    <button onClick={() => onRequestAddAccount(platform.id, platform.name, brand.name)}
                                      title="Tambah akun di platform ini"
                                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold text-fuchsia-600 hover:bg-fuchsia-50">
                                      <Plus className="w-2.5 h-2.5" /> Akun
                                    </button>
                                    <button onClick={() => doDelete(
                                      `/api/marketing-brand-platforms/${platform.id}`,
                                      `Hapus platform "${platform.name}" beserta semua akun di bawahnya?\n\nLaporan historis tetap aman.`,
                                      `platform:${platform.id}`,
                                    )} disabled={isDeletingPlatform}
                                      className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded text-red-500 hover:bg-red-50 disabled:opacity-50">
                                      {isDeletingPlatform ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Accounts */}
                            {platformOpen && (
                              <ul className="divide-y divide-gray-50">
                                {platform.accounts.length === 0 ? (
                                  <li className="px-3 py-2 text-[11px] text-gray-400 italic">Belum ada akun di platform ini</li>
                                ) : platform.accounts.map((acc) => {
                                  const isDeletingAcc = deleting === `acc:${acc.id}`;
                                  return (
                                    <li key={acc.id} className="flex items-center justify-between px-3 py-2 hover:bg-violet-50/30">
                                      <span className="flex items-center gap-1.5 text-xs text-gray-700 min-w-0">
                                        <AtSign className="w-3 h-3 text-gray-300" />
                                        <span className="truncate">{acc.name}</span>
                                      </span>
                                      {canManagePlatform && (
                                        <button onClick={() => doDelete(
                                          `/api/marketing-platform-accounts/${acc.id}`,
                                          `Hapus akun "${acc.name}"?\n\nLaporan historis tetap aman.`,
                                          `acc:${acc.id}`,
                                        )} disabled={isDeletingAcc}
                                          className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50">
                                          {isDeletingAcc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                        </button>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 text-center italic">
        Hapus pakai soft-delete — laporan awareness historis tetap utuh, cuma kombinasi tidak muncul lagi di dropdown form baru.
      </p>
    </div>
  );
}