"use client";

import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { UserRole, hasAnyRole } from "@/lib/permissions";
import {
  PRICELIST_PEDAGANG_ROLES,
  PRICELIST_MODAL_VIEW_ROLES,
} from "@/lib/pricelistPedagang";
import { Tags, Package, Wallet, Download, RefreshCw } from "lucide-react";

interface PedagangUnit {
  unit_id: string;
  serial_number: string;
  grade: "A" | "B" | "C";
  condition_note: string;
  status: string;
  laptop: {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    gpu: string;
    display: string;
  } | null;
  modal_price: number;
  tier_label: string;
  tier_percent: number;
  pedagang_price: number;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_BADGE: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-700 border-emerald-200",
  B: "bg-amber-50 text-amber-700 border-amber-200",
  C: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
  SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
  BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
  SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
  RESERVED: { badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", label: "Dipesan" },
  HELD: { badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500", label: "Diambil Dulu" },
  PACKING: { badge: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500", label: "Packing" },
};

function PriceListPedagangContent() {
  const [units, setUnits] = useState<PedagangUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterGrade, setFilterGrade] = useState("ALL");    
  const [filterBrand, setFilterBrand] = useState("ALL");

  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const canSeeModal = hasAnyRole(userRoles, PRICELIST_MODAL_VIEW_ROLES);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((r) => {
        const roles: string[] =
          Array.isArray(r.user?.roles) && r.user.roles.length > 0
            ? r.user.roles
            : r.user?.role
              ? [r.user.role]
              : [];
        setUserRoles(roles as UserRole[]);
      })
      .catch(() => setUserRoles([]));
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setAccessError(null);
    try {
      const res = await fetch("/api/price-list-pedagang");
      const result = await res.json();
      if (!result.success) {
        setAccessError(result.message || "Anda tidak memiliki akses ke halaman ini");
        setUnits([]);
        return;
      }
      setUnits(result.data || []);
    } catch {
      setAccessError("Gagal memuat data. Periksa koneksi Anda.");
      setUnits([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const uniqueBrands = useMemo(() => {
    const b = new Set(units.map((u) => u.laptop?.brand).filter(Boolean) as string[]);
    return ["ALL", ...Array.from(b)];
  }, [units]);

  const filtered = useMemo(() => {
    let list = [...units];
    if (filterStatus !== "ALL") list = list.filter((u) => u.status === filterStatus);
    if (filterGrade !== "ALL") list = list.filter((u) => u.grade === filterGrade);
    if (filterBrand !== "ALL") list = list.filter((u) => u.laptop?.brand === filterBrand);
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.laptop?.laptop_name?.toLowerCase().includes(t) ||
          u.laptop?.brand?.toLowerCase().includes(t) ||
          u.laptop?.cpu?.toLowerCase().includes(t) ||
          u.serial_number?.toLowerCase().includes(t)
      );
    }
    return list.sort((a, b) =>
      (a.laptop?.laptop_name ?? "").localeCompare(b.laptop?.laptop_name ?? "", "id")
    );
  }, [units, filterStatus, filterGrade, filterBrand, search]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      value: filtered.reduce((s, u) => s + (u.pedagang_price || 0), 0),
      siapJual: filtered.filter((u) => u.status === "SIAP_JUAL").length,
    }),
    [filtered]
  );

  const hasActiveFilter = search || filterStatus !== "ALL" || filterGrade !== "ALL" || filterBrand !== "ALL";
  const resetFilters = () => {
    setSearch(""); setFilterStatus("ALL"); setFilterGrade("ALL"); setFilterBrand("ALL");
  };

  // ─── Export Excel ─────────────────────────────────────────────────────────
  // PENTING: file ini akan dipegang pedagang — HARGA MODAL & persen markup
  // TIDAK PERNAH dimasukkan ke sini, apapun role yang export.
  const exportToExcel = async () => {
    if (filtered.length === 0) return;
    setIsExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Solit 03";
      wb.created = new Date();

      const ws = wb.addWorksheet("Price List Pedagang", {
        views: [{ state: "frozen", ySplit: 4 }],
        pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
      });

      const COLS = [
        { key: "no", width: 6 },
        { key: "product", width: 34 },
        { key: "brand", width: 14 },
        { key: "cpu", width: 26 },
        { key: "ram", width: 10 },
        { key: "storage", width: 14 },
        { key: "grade", width: 10 },
        { key: "sn", width: 20 },
        { key: "condition", width: 26 },
        { key: "price", width: 18 },
      ];
      ws.columns = COLS;

      // Judul
      ws.mergeCells(1, 1, 1, COLS.length);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = "PRICE LIST PEDAGANG — SOLIT 03";
      titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
      ws.getRow(1).height = 28;

      ws.mergeCells(2, 1, 2, COLS.length);
      const subtitleCell = ws.getCell(2, 1);
      subtitleCell.value = `Diperbarui: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })} — Harga dapat berubah sewaktu-waktu tanpa pemberitahuan.`;
      subtitleCell.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
      subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(2).height = 18;

      // Header (row 4, row 3 dikosongkan sebagai spacer)
      const headerRowNum = 4;
      const headers = ["No", "Nama Laptop", "Brand", "CPU", "RAM", "Storage", "Grade", "Serial Number", "Kondisi", "Harga"];
      headers.forEach((h, i) => {
        const cell = ws.getCell(headerRowNum, i + 1);
        cell.value = h;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B5563" } };
        cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "medium", color: { argb: "FF94A3B8" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
      ws.getRow(headerRowNum).height = 30;

      filtered.forEach((u, idx) => {
        const rowNum = headerRowNum + 1 + idx;
        const rowBg = idx % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
        const rowValues: (string | number)[] = [
          idx + 1,
          u.laptop?.laptop_name || "-",
          u.laptop?.brand || "-",
          u.laptop?.cpu || "-",
          u.laptop?.ram || "-",
          u.laptop?.storage || "-",
          `Grade ${u.grade}`,
          u.serial_number,
          u.condition_note || "-",
          u.pedagang_price,
        ];
        rowValues.forEach((val, colIdx) => {
          const cell = ws.getCell(rowNum, colIdx + 1);
          cell.value = val;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          cell.font = { size: 10, name: "Arial" };
          cell.border = {
            top: { style: "hair", color: { argb: "FFE2E8F0" } },
            left: { style: "hair", color: { argb: "FFE2E8F0" } },
            bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
            right: { style: "hair", color: { argb: "FFE2E8F0" } },
          };
          if (colIdx === 0) cell.alignment = { horizontal: "center" };
          if (colIdx === 9) {
            cell.numFmt = '"Rp "#,##0';
            cell.font = { size: 10, bold: true, color: { argb: "FF065F46" } };
            cell.alignment = { horizontal: "right" };
          }
        });
        ws.getRow(rowNum).height = 22;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `pricelist_pedagang_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export pricelist pedagang gagal:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
      <div className="max-w-full mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
              <Tags size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Price List Pedagang</h1>
              <p className="text-xs text-gray-400 mt-0.5 font-medium">
                Harga referensi untuk pedagang — tidak memengaruhi transaksi/payment
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 transition">
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={exportToExcel} disabled={isExporting || filtered.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-gray-800 rounded-xl text-sm font-semibold text-white hover:bg-gray-900 active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-gray-800/25">
              <Download className="w-3.5 h-3.5" />
              {isExporting ? "Mengexport..." : "Export Excel"}
            </button>
          </div>
        </div>

        {accessError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            {accessError}
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total Unit (difilter)" value={`${totals.count} unit`} icon={<Package size={16} className="text-gray-600" />} />
          <StatCard label="Siap Jual" value={`${totals.siapJual} unit`} icon={<Tags size={16} className="text-emerald-600" />} />
          <StatCard label="Total Nilai Pricelist" value={fmt(totals.value)} icon={<Wallet size={16} className="text-gray-600" />} />
        </div>

        {/* Filter */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative sm:col-span-2">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input type="text" placeholder="Cari nama, brand, CPU, SN..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 text-gray-700 focus:outline-none focus:border-gray-400 transition cursor-pointer">
              <option value="ALL">Semua Status</option>
              <option value="SIAP_JUAL">Siap Jual</option>
              <option value="BELUM_SIAP">Belum Siap</option>
              <option value="SERVICE">Service</option>
              <option value="RESERVED">Dipesan</option>
              <option value="HELD">Diambil Dulu</option>
              <option value="PACKING">Packing</option>
            </select>
            <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}
              className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 text-gray-700 focus:outline-none focus:border-gray-400 transition cursor-pointer">
              <option value="ALL">Semua Grade</option>
              <option value="A">Grade A</option>
              <option value="B">Grade B</option>
              <option value="C">Grade C</option>
            </select>
            <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
              className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 text-gray-700 focus:outline-none focus:border-gray-400 transition cursor-pointer">
              {uniqueBrands.map((b) => <option key={b} value={b}>{b === "ALL" ? "Semua Brand" : b}</option>)}
            </select>
          </div>
          {hasActiveFilter && (
            <button onClick={resetFilters}
              className="h-8 px-3 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition">
              Reset Filter
            </button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">
            Memuat data...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
            <p className="text-gray-700 font-bold text-base">Tidak ada unit ditemukan</p>
            <p className="text-gray-400 text-sm mt-1.5">Coba ubah filter di atas</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-100">
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest w-10">No</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Laptop</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Serial Number</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grade</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                    {canSeeModal && (
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Harga Modal</th>
                    )}
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Harga Pedagang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((u, idx) => (
                    <tr key={u.unit_id} className="hover:bg-gray-50/60 transition">
                      <td className="px-4 py-3.5 text-center text-xs font-semibold text-gray-300">{idx + 1}</td>
                      <td className="px-4 py-3.5 max-w-[220px]">
                        <p className="font-semibold text-gray-800 text-[13px] truncate">{u.laptop?.laptop_name || "—"}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {[u.laptop?.brand, u.laptop?.cpu, u.laptop?.ram, u.laptop?.storage].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <code className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-lg">{u.serial_number}</code>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${GRADE_BADGE[u.grade] || ""}`}>
                          Grade {u.grade}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {STATUS_STYLE[u.status] && (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[u.status].badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[u.status].dot}`} />
                            {STATUS_STYLE[u.status].label}
                          </span>
                        )}
                      </td>
                      {canSeeModal && (
                        <td className="px-4 py-3.5 text-right">
                          <p className="text-xs text-gray-500 tabular-nums">{fmt(u.modal_price)}</p>
                          <p className="text-[10px] text-gray-300">{u.tier_label}</p>
                        </td>
                      )}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-bold text-gray-800 tabular-nums">{fmt(u.pedagang_price)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 text-xs text-gray-400">
              <span className="text-gray-700 font-bold">{filtered.length}</span> unit
              {units.length !== filtered.length && <span className="ml-1">dari {units.length}</span>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{label}</p>
        <p className="text-sm font-black text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}

export default function PriceListPedagangTab() {
  return <PriceListPedagangContent />;
}