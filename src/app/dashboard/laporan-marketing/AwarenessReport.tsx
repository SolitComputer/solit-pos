"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Calendar, Eye, Heart, Target, ShoppingCart,
  Plus, RefreshCw, Trash2, Image as ImageIcon, Settings,
} from "lucide-react";
import { todayWibDate } from "@/lib/marketing-report";
import { hasAnyRole, MARKETING_PLATFORM_MANAGE_ROLES } from "@/lib/permissions";
import AwarenessFormModal from "./AwarenessFormModal";
import TambahTokoModal from "./TambahTokoModal";
import TambahPlatformModal from "./TambahPlatformModal";
import TambahAkunModal from "./TambahAkunModal";
import KelolaPlatform from "./KelolaPlatform";

interface AwarenessRow {
  id: string;
  jangkauan: number;
  foto_bukti_url: string | null;
  tanggal: string;
  created_at: string;
  account: {
    id: string;
    name: string;
    platform: {
      id: string;
      name: string;
      brand: { id: string; name: string } | null;
    } | null;
  } | null;
}

function fmtTanggalShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}
function getPeriodLabel(from: string, to: string): string {
  if (!from && !to) return "Semua Waktu";
  return `${from ? fmtTanggalShort(from) : "..."} — ${to ? fmtTanggalShort(to) : "..."}`;
}

// Role user — diambil dari /api/auth/me pattern. Pakai hook useAuthUser kalau ada,
// atau baca dari dokumen (sidebar biasanya udah fetch ini). Di sini kita fetch
// ringan ke /api/me/permissions buat tau role (sama polanya dgn hook existing).
function useUserRoles(): string[] {
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const r = j?.data?.roles ?? j?.user?.roles ?? (j?.user?.role ? [j.user.role] : []);
        setRoles(Array.isArray(r) ? r : []);
      })
      .catch(() => setRoles([]));
  }, []);
  return roles;
}

export default function AwarenessReport() {
  // Tab preset periode — 3 pilihan tetap: hari ini, mingguan (7 hari terakhir
  // termasuk hari ini), bulanan (awal bulan ini → hari ini). Default: bulanan
  // (sama seperti perilaku sebelum ganti dari InlineDateRange).
  // customFrom/customTo di-derive via useMemo — tidak lagi state tersendiri —
  // supaya hanya recompute waktu `period` berubah (bukan tiap render), dan
  // fetchData useCallback di bawah otomatis dapet reference yang stabil.
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const { customFrom, customTo } = useMemo(() => {
    const today = todayWibDate();
    if (period === "today") return { customFrom: today, customTo: today };
    if (period === "week") {
      // Parse manual (bukan new Date("YYYY-MM-DD")) biar tidak geser hari
      // karena UTC — same pola dgn fmtTanggalShort di atas.
      const [y, m, d] = today.split("-").map(Number);
      const dt = new Date(y, m - 1, d - 6); // 7 hari terakhir INCLUDING hari ini
      const pad = (n: number) => String(n).padStart(2, "0");
      const weekAgo = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      return { customFrom: weekAgo, customTo: today };
    }
    // "month" — awal bulan ini sampai hari ini
    return { customFrom: today.slice(0, 8) + "01", customTo: today };
  }, [period]);
  const [rows, setRows] = useState<AwarenessRow[]>([]);
  // platforms sekarang di-fetch di dalam AwarenessFormModal (hierarkis)
  const [summary, setSummary] = useState({ totalJangkauan: 0, totalReports: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFormModal, setShowFormModal] = useState(false);
  // State untuk 3 modal tambah terpisah (toko/platform/akun) + context-nya
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [platformModalCtx, setPlatformModalCtx] = useState<{ brandId: string; brandName: string } | null>(null);
  const [accountModalCtx, setAccountModalCtx] = useState<{ brandPlatformId: string; platformName: string; brandName: string } | null>(null);
  // refreshKey dinaikin tiap kali ada perubahan di hierarki — trigger refetch di form
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);
  // Sub-tab di dalam Awareness: "laporan" (default) vs "platform" (kelola registry).
  // Dipisah di sini (bukan di parent LaporanMarketingPage) karena tab utama sudah
  // menampung tab-level drag, jadi "platform" dibungkus di dalam Awareness tanpa
  // nambah tab level-1 yang bisa di-reorder.
  const [view, setView] = useState<"laporan" | "platform">("laporan");

  const userRoles = useUserRoles();
  const canManagePlatform = hasAnyRole(userRoles, MARKETING_PLATFORM_MANAGE_ROLES);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
      const res = await fetch(`/api/marketing-awareness?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat laporan");
      setRows(json.data as AwarenessRow[]);
      setSummary(json.summary ?? { totalJangkauan: 0, totalReports: 0 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deleteRow = async (id: string) => {
    if (!window.confirm("Hapus laporan ini?")) return;
    try {
      const res = await fetch(`/api/marketing-awareness/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menghapus");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Funnel metrics: Awareness dari data kita, 3 sisanya placeholder yg nanti
  // bisa di-hook ke tabel lain (cc_reports utk Interest, sales_online_reports
  // utk Decision, transactions utk Action). Sementara tampilkan 0 dgn label.
  const funnel = useMemo(
    () => ({
      awareness: summary.totalJangkauan,
      interest: 0,
      decision: 0,
      action: 0,
    }),
    [summary]
  );

  const periodLabel = getPeriodLabel(customFrom, customTo);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Sub-tab switcher — Laporan Awareness vs Kelola Platform */}
      <div className="flex items-center gap-1 bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 rounded-full p-1 w-fit max-w-full overflow-x-auto">
        {([
          { key: "laporan" as const, label: "Laporan Awareness", icon: Eye },
          { key: "platform" as const, label: "Kelola Platform", icon: Settings },
        ]).map((t) => {
          const Icon = t.icon;
          const isActive = view === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 h-9 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap focus:outline-none ${
                isActive
                  ? "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {view === "platform" ? (
        <KelolaPlatform
          canManagePlatform={canManagePlatform}
          refreshKey={refreshKey}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          onRequestAddBrand={() => setShowBrandModal(true)}
          onRequestAddPlatform={(brandId, brandName) => setPlatformModalCtx({ brandId, brandName })}
          onRequestAddAccount={(brandPlatformId, platformName, brandName) => setAccountModalCtx({ brandPlatformId, platformName, brandName })}
        />
      ) : (
      <>
      {/* Header actions */}
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col-reverse lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
              <Calendar className="w-3 h-3" />
              {periodLabel}
            </span>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full hover:bg-gray-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
              {summary.totalReports} laporan
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Tab preset periode — 3 pilihan cepat, ganti kalender InlineDateRange
                sesuai keputusan 2026-11-28. Pakai pill style selaras dgn tab filter
                toko di tabs lain (Range Harga, Laporan Barang). */}
            <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full p-1">
              {([
                { key: "today" as const, label: "Hari Ini" },
                { key: "week" as const, label: "Mingguan" },
                { key: "month" as const, label: "Bulanan" },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setPeriod(t.key)}
                  className={`px-3 h-8 rounded-full text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 ${
                    period === t.key
                      ? "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40"
                      : "text-gray-500 hover:text-gray-800 hover:bg-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowFormModal(true)}
              className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-sm font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm hover:opacity-95"
            >
              <Plus className="w-4 h-4" /> Tambah Laporan
            </button>
          </div>
        </div>
      </div>

      {/* Funnel cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FunnelCard
          icon={Eye} color="from-violet-500 to-fuchsia-500"
          label="Awareness" value={funnel.awareness}
          caption="Orang yang tahu Solit"
        />
        <FunnelCard
          icon={Heart} color="from-pink-500 to-rose-500"
          label="Interest" value={funnel.interest}
          caption="Like/comment/share/follow"
          placeholder
        />
        <FunnelCard
          icon={Target} color="from-amber-500 to-orange-500"
          label="Decision" value={funnel.decision}
          caption="Berminat membeli"
          placeholder
        />
        <FunnelCard
          icon={ShoppingCart} color="from-emerald-500 to-teal-500"
          label="Action" value={funnel.action}
          caption="Transaksi aktual"
          placeholder
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-gray-50 overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Riwayat Laporan Awareness</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Total jangkauan dari semua platform pada periode ini</p>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-4 sm:px-5 py-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}

        {loading && rows.length === 0 ? (
          <div className="p-4 sm:p-5 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 rounded-md bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 flex items-center justify-center mb-3 ring-1 ring-violet-100/60">
              <Eye className="w-6 h-6 text-violet-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">Belum ada laporan pada periode ini</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
              Klik "Tambah Laporan" untuk input jangkauan konten per platform.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-violet-600 text-white">
                  <th className="border border-violet-700 px-3 py-2 w-12">No</th>
                  <th className="border border-violet-700 px-3 py-2 text-left whitespace-nowrap">Tanggal</th>
                  <th className="border border-violet-700 px-3 py-2 text-left">Platform</th>
                  <th className="border border-violet-700 px-3 py-2 text-left">Brand Toko</th>
                  <th className="border border-violet-700 px-3 py-2 text-left">Daftar Akun</th>
                  <th className="border border-violet-700 px-3 py-2 text-right">Jangkauan</th>
                  <th className="border border-violet-700 px-3 py-2 text-center w-16">Foto</th>
                  <th className="border border-violet-700 px-3 py-2 text-center w-12">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-violet-50/40">
                    <td className="border border-gray-200 px-3 py-1.5 text-center text-gray-400 font-semibold">{idx + 1}</td>
                    <td className="border border-gray-200 px-3 py-1.5 whitespace-nowrap text-gray-700">
                      {fmtTanggalShort(row.tanggal)}
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 font-semibold text-gray-800">
                      {row.account?.platform?.name ?? "—"}
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 text-gray-700">
                      {row.account?.platform?.brand?.name ?? "—"}
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 text-gray-700">
                      {row.account?.name ?? "—"}
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums font-semibold text-violet-700">
                      {Number(row.jangkauan).toLocaleString("id-ID")}
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 text-center">
                      {row.foto_bukti_url ? (
                        <button
                          onClick={() => setPreviewFoto(row.foto_bukti_url)}
                          className="inline-flex items-center justify-center"
                        >
                          <img
                            src={row.foto_bukti_url}
                            alt="bukti"
                            className="w-10 h-10 object-cover rounded border border-gray-200 cursor-pointer hover:scale-110 transition-transform"
                          />
                        </button>
                      ) : (
                        <ImageIcon className="w-4 h-4 text-gray-300 inline" />
                      )}
                    </td>
                    <td className="border border-gray-200 text-center">
                      <button
                        onClick={() => deleteRow(row.id)}
                        className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-violet-50 font-bold text-violet-800">
                  <td colSpan={5} className="border border-violet-200 px-3 py-2 text-right">TOTAL JANGKAUAN</td>
                  <td className="border border-violet-200 px-3 py-2 text-right tabular-nums">
                    {summary.totalJangkauan.toLocaleString("id-ID")}
                  </td>
                  <td colSpan={2} className="border border-violet-200"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* Modals — form utama + 3 modal tambah (toko/platform/akun) */}
      {showFormModal && (
        <AwarenessFormModal
          canManagePlatform={canManagePlatform}
          refreshKey={refreshKey}
          onClose={() => setShowFormModal(false)}
          onSuccess={fetchData}
          onRequestAddBrand={() => { setShowFormModal(false); setShowBrandModal(true); }}
          onRequestAddPlatform={(brandId, brandName) => {
            setShowFormModal(false);
            setPlatformModalCtx({ brandId, brandName });
          }}
          onRequestAddAccount={(brandPlatformId, platformName, brandName) => {
            setShowFormModal(false);
            setAccountModalCtx({ brandPlatformId, platformName, brandName });
          }}
        />
      )}
      {showBrandModal && (
        <TambahTokoModal
          onClose={() => setShowBrandModal(false)}
          onSuccess={() => {
            setShowBrandModal(false);
            setRefreshKey((k) => k + 1);
            setShowFormModal(true); // balik ke form awareness
          }}
        />
      )}
      {platformModalCtx && (
        <TambahPlatformModal
          brandId={platformModalCtx.brandId}
          brandName={platformModalCtx.brandName}
          onClose={() => setPlatformModalCtx(null)}
          onSuccess={() => {
            setPlatformModalCtx(null);
            setRefreshKey((k) => k + 1);
            setShowFormModal(true);
          }}
        />
      )}
      {accountModalCtx && (
        <TambahAkunModal
          brandPlatformId={accountModalCtx.brandPlatformId}
          platformName={accountModalCtx.platformName}
          brandName={accountModalCtx.brandName}
          onClose={() => setAccountModalCtx(null)}
          onSuccess={() => {
            setAccountModalCtx(null);
            setRefreshKey((k) => k + 1);
            setShowFormModal(true);
          }}
        />
      )}

      {/* Preview foto */}
      {previewFoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70"
          onClick={() => setPreviewFoto(null)}
        >
          <img src={previewFoto} alt="preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

function FunnelCard({
  icon: Icon, color, label, value, caption, placeholder,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: number;
  caption: string;
  placeholder?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 sm:px-4 sm:py-3.5 ${placeholder ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase truncate">{label}</p>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br ${color} text-white shadow-sm`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 tabular-nums">
        {value.toLocaleString("id-ID")}
      </p>
      <p className="text-[11px] text-gray-400 mt-1 truncate">
        {placeholder ? "Coming soon" : caption}
      </p>
    </div>
  );
}