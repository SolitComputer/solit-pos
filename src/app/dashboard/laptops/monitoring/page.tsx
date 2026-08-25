"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Package, PackageCheck, PackageX, Truck, AlertTriangle,
  RefreshCw, Search, ArrowUpDown, Wrench,
  ShieldAlert, DollarSign, TrendingUp, CheckCircle2, XCircle,
  Loader2, Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Metrics {
  siapJual: number;
  sold: number;
  belumSiap: number;
  inTransit: number;
  service: number;
  totalUnit: number;
  totalNilaiModal: number;
  totalNilaiJual: number;
}

interface UnitItem {
  id: string;
  laptop_id: string;
  serial_number: string;
  grade: string;
  status: string;
  purchase_price: number;
  selling_price: number;
  sparepart_cost: number;
  sold_at: string | null;
  sold_price: number | null;
  created_at: string;
  source: string | null;
  laptop_name: string;
  brand: string;
}

interface AnomalyItem {
  type: "QTY_MISMATCH" | "UNPRICED_READY" | "STALE_RESERVED" | "ORPHAN_SOLD";
  unit_id?: string;
  laptop_id: string;
  serial_number?: string;
  laptop_name: string;
  detail: string;
}

interface MonitoringData {
  metrics: Metrics;
  anomalies: AnomalyItem[];
  anomalyCount: number;
  units: {
    siapJual: UnitItem[];
    sold: UnitItem[];
    inTransit: UnitItem[];
  };
}

interface ReconcileResult {
  laptop_id: string;
  laptop_name: string;
  old_qty: number;
  new_qty: number;
  old_status: string;
  new_status: string;
}

type TabKey = "siapJual" | "sold" | "transit" | "anomali";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const fmtDateShort = (iso?: string | null) => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(new Date(iso));
};

const GRADE_BADGE: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-700 border-emerald-200",
  B: "bg-amber-50 text-amber-700 border-amber-200",
  C: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_BADGE: Record<string, { bg: string; dot: string; label: string }> = {
  SIAP_JUAL: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
  SOLD: { bg: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
  RESERVED: { bg: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", label: "Reserved" },
  HELD: { bg: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Held" },
  PACKING: { bg: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500", label: "Packing" },
  BELUM_SIAP: { bg: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
  SERVICE: { bg: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500", label: "Servis" },
};

const ANOMALY_BADGE: Record<string, { bg: string; icon: typeof AlertTriangle; label: string }> = {
  QTY_MISMATCH: { bg: "bg-red-50 text-red-700 border-red-200", icon: ArrowUpDown, label: "Qty Mismatch" },
  UNPRICED_READY: { bg: "bg-amber-50 text-amber-700 border-amber-200", icon: DollarSign, label: "Harga Kosong" },
  STALE_RESERVED: { bg: "bg-violet-50 text-violet-700 border-violet-200", icon: Clock, label: "Reserved Lama" },
  ORPHAN_SOLD: { bg: "bg-gray-100 text-gray-600 border-gray-200", icon: PackageX, label: "Sold Tanpa Data" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// RESPONSIVE FIX: padding, gap, icon, dan font MetricCard di-scale untuk HP
function MetricCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: typeof Package; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5 flex items-start gap-2.5 sm:gap-4 hover:shadow-md transition-shadow">
      <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-[11px] font-medium text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-lg sm:text-xl font-bold text-gray-800 mt-0.5">{value}</p>
        {sub && <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { bg: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  const cls = GRADE_BADGE[grade] ?? "bg-gray-50 text-gray-500 border-gray-200";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${cls}`}>
      {grade}
    </span>
  );
}

function Toast({ message, type = "success", onDone }: { message: string; type?: "success" | "error"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 ${type === "success" ? "bg-emerald-600" : "bg-red-500"} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4`}>
      {type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gray-100 rounded-xl animate-pulse" />
            <div className="space-y-1.5 flex-1">
              <div className="h-2.5 bg-gray-100 rounded w-16 animate-pulse" />
              <div className="h-5 bg-gray-100 rounded w-12 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              {["SN", "Laptop", "Grade", "Status", "Harga Modal", "Harga Jual", "Tanggal"].map(h => (
                <th key={h} className="px-4 py-3 text-left">
                  <div className="h-2.5 bg-gray-200 rounded w-16 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                {[90, 140, 40, 70, 80, 80, 80].map((w, j) => (
                  <td key={j} className="px-4 py-3.5">
                    <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("siapJual");
  const [search, setSearch] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult[] | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // ── 2-Step Verification Modal State ─────────────────────────────────────────
  const [reconcileStep, setReconcileStep] = useState<0 | 1 | 2>(0);
  const [reconcileConfirmInput, setReconcileConfirmInput] = useState("");


  // ── Fetch Data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/laptops/monitoring");
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Gagal memuat data");
      setData(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Reconcile ──────────────────────────────────────────────────────────────
  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/laptops/monitoring/reconcile", { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setReconcileResult(json.data);
      setToast({
        message: json.fixed > 0
          ? `✅ ${json.fixed} laptop berhasil disinkronkan`
          : "Semua stok sudah sinkron!",
        type: "success",
      });
      // Refresh data
      await fetchData();
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : "Gagal rekonsiliasi",
        type: "error",
      });
    } finally {
      setReconciling(false);
    }
  };

  // ── Search Filter ──────────────────────────────────────────────────────────
  const filterUnits = useCallback((items: UnitItem[]) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (u) =>
        (u.serial_number || "").toLowerCase().includes(q) ||
        (u.laptop_name || "").toLowerCase().includes(q) ||
        (u.brand || "").toLowerCase().includes(q)
    );
  }, [search]);

  const filteredSiapJual = useMemo(
    () => filterUnits(data?.units.siapJual ?? []),
    [data, filterUnits]
  );
  const filteredSold = useMemo(
    () => filterUnits(data?.units.sold ?? []),
    [data, filterUnits]
  );
  const filteredTransit = useMemo(
    () => filterUnits(data?.units.inTransit ?? []),
    [data, filterUnits]
  );
  const filteredAnomalies = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.anomalies;
    const q = search.toLowerCase();
    return data.anomalies.filter(
      (a) =>
        a.laptop_name.toLowerCase().includes(q) ||
        (a.serial_number ?? "").toLowerCase().includes(q) ||
        a.detail.toLowerCase().includes(q)
    );
  }, [data, search]);

  // ── Tab Config ─────────────────────────────────────────────────────────────
  const tabs: { key: TabKey; label: string; count: number; icon: typeof Package }[] = [
    { key: "siapJual", label: "Siap Jual", count: data?.metrics.siapJual ?? 0, icon: PackageCheck },
    { key: "sold", label: "Terjual", count: data?.metrics.sold ?? 0, icon: PackageX },
    { key: "transit", label: "Transit / Pending", count: data?.metrics.inTransit ?? 0, icon: Truck },
    { key: "anomali", label: "Anomali", count: data?.anomalyCount ?? 0, icon: ShieldAlert },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">Monitoring Stok</h1>
            <p className="text-xs text-gray-400 mt-0.5">Pantau kondisi barang siap jual vs terjual secara real-time</p>
          </div>
          {/* RESPONSIVE FIX: tombol Refresh & Sinkronkan Stok full-width & sejajar (flex-1) di HP */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={fetchData}
              disabled={loading}
              className="h-9 px-3.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-50 flex-1 sm:flex-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => { setReconcileStep(1); setReconcileConfirmInput(""); }}
              disabled={reconciling || loading}
              className="h-9 px-3.5 bg-amber-600 text-white rounded-xl text-xs font-semibold hover:bg-amber-700 transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm flex-1 sm:flex-none"
            >
              {reconciling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wrench className="w-3.5 h-3.5" />
              )}
              <span className="truncate">Sinkronkan Stok</span>
            </button>
          </div>
        </div>

        {/* ── Error State ─────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Metric Cards — RESPONSIVE FIX: gap di-scale ────────────────────── */}
        {loading && !data ? (
          <SkeletonCards />
        ) : data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <MetricCard
              icon={PackageCheck}
              label="Siap Jual"
              value={data.metrics.siapJual}
              sub={fmt(data.metrics.totalNilaiJual)}
              color="bg-emerald-50 text-emerald-600"
            />
            <MetricCard
              icon={PackageX}
              label="Terjual"
              value={data.metrics.sold}
              color="bg-gray-100 text-gray-600"
            />
            <MetricCard
              icon={Truck}
              label="Transit / Pending"
              value={data.metrics.inTransit}
              sub={`${data.metrics.belumSiap} belum siap, ${data.metrics.service} servis`}
              color="bg-blue-50 text-blue-600"
            />
            <MetricCard
              icon={TrendingUp}
              label="Nilai Modal Stok"
              value={fmt(data.metrics.totalNilaiModal)}
              sub={`${data.metrics.totalUnit} total unit`}
              color="bg-indigo-50 text-indigo-600"
            />
          </div>
        ) : null}

        {/* ── Health Check Banner ──────────────────────────────────────────── */}
        {data && data.anomalyCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-800">
                  Ditemukan {data.anomalyCount} anomali stok
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {data.anomalies.filter(a => a.type === "QTY_MISMATCH").length > 0 && "Qty mismatch • "}
                  {data.anomalies.filter(a => a.type === "UNPRICED_READY").length > 0 && "Harga kosong • "}
                  {data.anomalies.filter(a => a.type === "STALE_RESERVED").length > 0 && "Reserved lama • "}
                  {data.anomalies.filter(a => a.type === "ORPHAN_SOLD").length > 0 && "Sold tanpa data"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Reconcile Success Banner ─────────────────────────────────────── */}
        {data && data.anomalyCount === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-sm font-medium text-emerald-700">
              Semua stok sinkron — tidak ada anomali ditemukan
            </p>
          </div>
        )}

        {/* ── Reconcile Result ─────────────────────────────────────────────── */}
        {reconcileResult && reconcileResult.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Hasil Sinkronisasi ({reconcileResult.length} item diperbaiki)</h3>
              <button onClick={() => setReconcileResult(null)} className="text-xs text-gray-400 hover:text-gray-600 transition">
                Tutup
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">Laptop</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase">Qty Lama</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase">Qty Baru</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase">Status Lama</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase">Status Baru</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reconcileResult.map((r) => (
                    <tr key={r.laptop_id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-700">{r.laptop_name}</td>
                      <td className="px-3 py-2.5 text-xs text-center">
                        <span className="text-red-500 font-semibold">{r.old_qty}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-center">
                        <span className="text-emerald-600 font-semibold">{r.new_qty}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={r.old_status} /></td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={r.new_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tabs + Search ───────────────────────────────────────────────── */}
        {data && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto flex-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      activeTab === tab.key
                        ? "bg-white text-gray-800 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === tab.key
                        ? tab.key === "anomali" && tab.count > 0
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-100 text-gray-500"
                        : tab.key === "anomali" && tab.count > 0
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-200 text-gray-400"
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari SN, nama, brand..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 transition"
                />
              </div>
            </div>

            {/* ── Toast ───────────────────────────────────────────────────────── */}
            {toast && (
              <Toast
                message={toast.message}
                type={toast.type}
                onDone={() => setToast(null)}
              />
            )}

            {/* ── 2-Step Verification Modal ────────────────────────────────────── */}
            {reconcileStep > 0 && (
              <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                {/* RESPONSIVE FIX: p-5 di HP, max-h + overflow-y-auto biar gak kepotong keyboard/viewport pendek */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-4 sm:space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
                  {reconcileStep === 1 && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                          <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-gray-800">Verifikasi Langkah 1 dari 2</h3>
                          <p className="text-xs text-gray-500">Konfirmasi Rekonsiliasi Stok All Unit</p>
                        </div>
                      </div>

                      <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 space-y-2 text-xs text-amber-900">
                        <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                          <AlertTriangle className="w-4 h-4 text-amber-600" /> Perhatian Sebelum Melanjutkan:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-amber-700 pl-1">
                          <li>Sistem akan menghitung fisik riil unit berstatus <strong>SIAP_JUAL</strong>.</li>
                          <li>Jumlah <strong>qty</strong> pada katalog master laptop akan diperbarui secara otomatis.</li>
                          <li>Tindakan ini tidak menghapus unit fisik atau riwayat transaksi.</li>
                        </ul>
                      </div>

                      {/* RESPONSIVE FIX: tombol stack full-width di HP (flex-col-reverse), sejajar di ≥ sm */}
                      <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2">
                        <button
                          onClick={() => setReconcileStep(0)}
                          className="h-9 px-4 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition w-full sm:w-auto"
                        >
                          Batal
                        </button>
                        <button
                          onClick={() => setReconcileStep(2)}
                          className="h-9 px-4 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition w-full sm:w-auto"
                        >
                          Lanjut ke Langkah 2 &rarr;
                        </button>
                      </div>
                    </>
                  )}

                  {reconcileStep === 2 && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                          <Wrench className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-gray-800">Verifikasi Langkah 2 dari 2</h3>
                          <p className="text-xs text-gray-500">Ketik kata konfirmasi untuk mengeksekusi</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs text-gray-600 font-medium">
                          Silakan ketik <strong className="text-red-600 font-bold">SINKRON</strong> di bawah ini untuk mengonfirmasi rekonsiliasi seluruh stok master:
                        </p>
                        <input
                          type="text"
                          autoFocus
                          placeholder='Ketik "SINKRON"'
                          value={reconcileConfirmInput}
                          onChange={(e) => setReconcileConfirmInput(e.target.value)}
                          className="w-full h-10 px-3 border border-gray-300 rounded-xl text-sm font-bold tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                        />
                      </div>

                      {/* RESPONSIVE FIX: tombol stack full-width di HP */}
                      <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2">
                        <button
                          onClick={() => setReconcileStep(1)}
                          className="h-9 px-3.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition w-full sm:w-auto"
                        >
                          &larr; Kembali
                        </button>
                        <button
                          onClick={() => {
                            setReconcileStep(0);
                            handleReconcile();
                          }}
                          disabled={reconcileConfirmInput.trim().toUpperCase() !== "SINKRON" || reconciling}
                          className="h-9 px-4 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm disabled:opacity-40 transition flex items-center justify-center gap-1.5 w-full sm:w-auto"
                        >
                          {reconciling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Jalankan Rekonsiliasi Sekarang
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab Content ─────────────────────────────────────────────── */}
            {loading && !data ? (
              <SkeletonTable />
            ) : (
              <>
                {activeTab === "siapJual" && <UnitTable items={filteredSiapJual} showPrice />}
                {activeTab === "sold" && <UnitTable items={filteredSold} showSoldInfo showPrice />}
                {activeTab === "transit" && <UnitTable items={filteredTransit} showPrice />}
                {activeTab === "anomali" && <AnomalyTable items={filteredAnomalies} />}
              </>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </DashboardLayout>
  );
}

// ─── UnitTable ────────────────────────────────────────────────────────────────

function UnitTable({
  items,
  showSoldInfo,
  showPrice = true,
}: {
  items: UnitItem[];
  showSoldInfo?: boolean;
  showPrice?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-400 font-medium">Tidak ada data ditemukan</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Serial Number</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Laptop</th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Grade</th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                {showPrice && (
                  <>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Harga Modal</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Harga Jual</th>
                  </>
                )}
                {showSoldInfo && (
                  <>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Harga Terjual</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tgl Terjual</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tgl Masuk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((u) => {
                const totalModal = (Number(u.purchase_price) || 0) + (Number(u.sparepart_cost) || 0);
                const hasWarning = u.status === "SIAP_JUAL" && (!(Number(u.purchase_price) > 0) || !(Number(u.selling_price) > 0));
                return (
                  <tr key={u.id} className={`hover:bg-gray-50/50 transition ${hasWarning ? "bg-amber-50/30" : ""}`}>
                    <td className="px-4 py-3 text-xs font-mono font-semibold text-gray-800 whitespace-nowrap">
                      {u.serial_number}
                      {hasWarning && <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1.5" />}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-700 truncate max-w-[200px]">{u.laptop_name}</p>
                      <p className="text-[10px] text-gray-400">{u.brand}</p>
                    </td>
                    <td className="px-4 py-3 text-center"><GradeBadge grade={u.grade} /></td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={u.status} /></td>
                    {showPrice && (
                      <>
                        <td className="px-4 py-3 text-right text-xs font-medium text-gray-600 whitespace-nowrap">
                          {fmt(totalModal)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium text-gray-600 whitespace-nowrap">
                          {fmt(u.selling_price)}
                        </td>
                      </>
                    )}
                    {showSoldInfo && (
                      <>
                        <td className="px-4 py-3 text-right text-xs font-medium text-gray-600 whitespace-nowrap">
                          {u.sold_price ? fmt(u.sold_price) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {fmtDateShort(u.sold_at)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDateShort(u.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Footer Count */}
        <div className="px-4 py-2.5 bg-gray-50/60 border-t border-gray-100 text-[11px] text-gray-400 font-medium">
          {items.length} unit ditampilkan
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-2.5">
        {items.map((u) => {
          const totalModal = (Number(u.purchase_price) || 0) + (Number(u.sparepart_cost) || 0);
          const hasWarning = u.status === "SIAP_JUAL" && (!(Number(u.purchase_price) > 0) || !(Number(u.selling_price) > 0));
          return (
            <div
              key={u.id}
              className={`bg-white rounded-2xl border shadow-sm p-4 space-y-2.5 ${
                hasWarning ? "border-amber-200 bg-amber-50/20" : "border-gray-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-bold text-gray-800 truncate">{u.serial_number}</span>
                  <GradeBadge grade={u.grade} />
                </div>
                <StatusBadge status={u.status} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 truncate">{u.laptop_name}</p>
                <p className="text-[10px] text-gray-400">{u.brand}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
                {showPrice && (
                  <>
                    <div>
                      <p className="text-[10px] text-gray-400">Harga Modal</p>
                      <p className="text-xs font-semibold text-gray-700">{fmt(totalModal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Harga Jual</p>
                      <p className="text-xs font-semibold text-gray-700">{fmt(u.selling_price)}</p>
                    </div>
                  </>
                )}
                {showSoldInfo && (
                  <>
                    <div>
                      <p className="text-[10px] text-gray-400">Harga Terjual</p>
                      <p className="text-xs font-semibold text-gray-700">{u.sold_price ? fmt(u.sold_price) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Tgl Terjual</p>
                      <p className="text-xs font-semibold text-gray-700">{fmtDateShort(u.sold_at)}</p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-[10px] text-gray-400">Tgl Masuk</p>
                  <p className="text-xs font-semibold text-gray-700">{fmtDateShort(u.created_at)}</p>
                </div>
              </div>
              {hasWarning && (
                <div className="flex items-center gap-1.5 text-amber-600 text-[10px] font-medium pt-1">
                  <AlertTriangle className="w-3 h-3" />
                  Harga belum lengkap
                </div>
              )}
            </div>
          );
        })}
        <p className="text-center text-[11px] text-gray-400 pt-2">{items.length} unit ditampilkan</p>
      </div>
    </>
  );
}

// ─── AnomalyTable ─────────────────────────────────────────────────────────────

function AnomalyTable({ items }: { items: AnomalyItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400 font-medium">Tidak ada anomali ditemukan</p>
        <p className="text-xs text-gray-300 mt-1">Stok dalam kondisi sehat 🎉</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tipe Anomali</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Laptop</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Serial Number</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((a, i) => {
                const cfg = ANOMALY_BADGE[a.type];
                const Icon = cfg?.icon ?? AlertTriangle;
                return (
                  <tr key={`${a.type}-${a.laptop_id}-${a.unit_id ?? i}`} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${cfg?.bg ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        <Icon className="w-3 h-3" />
                        {cfg?.label ?? a.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-700">{a.laptop_name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-600">{a.serial_number ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[300px] truncate">{a.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 bg-gray-50/60 border-t border-gray-100 text-[11px] text-gray-400 font-medium">
          {items.length} anomali ditemukan
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden space-y-2.5">
        {items.map((a, i) => {
          const cfg = ANOMALY_BADGE[a.type];
          const Icon = cfg?.icon ?? AlertTriangle;
          return (
            <div key={`${a.type}-${a.laptop_id}-${a.unit_id ?? i}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${cfg?.bg ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                  <Icon className="w-3 h-3" />
                  {cfg?.label ?? a.type}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-700">{a.laptop_name}</p>
              {a.serial_number && (
                <p className="text-[10px] font-mono text-gray-400">SN: {a.serial_number}</p>
              )}
              <p className="text-xs text-gray-500">{a.detail}</p>
            </div>
          );
        })}
        <p className="text-center text-[11px] text-gray-400 pt-2">{items.length} anomali ditemukan</p>
      </div>
    </>
  );
}