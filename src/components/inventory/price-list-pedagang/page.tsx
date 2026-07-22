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
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
      });

      const COLOR = {
          headerBg: "FF4B5563",
          headerFg: "FFFFFFFF",
          rowEven: "FFF8FAFC",
          rowOdd: "FFFFFFFF",
          borderColor: "FFE2E8F0",
          subTextFg: "FF64748B",
      };

      const COLS = [
        { header: "No", key: "no", width: 6 },
        { header: "Nama Laptop", key: "product", width: 34 },
        { header: "Brand", key: "brand", width: 14 },
        { header: "CPU", key: "cpu", width: 26 },
        { header: "RAM", key: "ram", width: 10 },
        { header: "Storage", key: "storage", width: 14 },
        { header: "Grade", key: "grade", width: 10 },
        { header: "Serial Number", key: "sn", width: 20 },
        { header: "Kondisi", key: "condition", width: 26 },
        { header: "Harga Pedagang", key: "price", width: 18 },
      ];
      ws.columns = COLS;

      // Header row styling (row 1)
      const headerRowNum = 1;
      COLS.forEach((col, i) => {
        const cell = ws.getCell(headerRowNum, i + 1);
        cell.value = col.header;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
        cell.font = { bold: true, size: 11, color: { argb: COLOR.headerFg }, name: "Arial" };
        cell.border = {
          top: { style: "thin", color: { argb: COLOR.borderColor } },
          left: { style: "thin", color: { argb: COLOR.borderColor } },
          bottom: { style: "medium", color: { argb: "FF94A3B8" } },
          right: { style: "thin", color: { argb: COLOR.borderColor } },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      ws.getRow(headerRowNum).height = 32;

      filtered.forEach((u, idx) => {
        const rowBg = idx % 2 === 0 ? COLOR.rowEven : COLOR.rowOdd;
        const rowData = {
          no: idx + 1,
          product: u.laptop?.laptop_name || "-",
          brand: u.laptop?.brand || "-",
          cpu: u.laptop?.cpu || "-",
          ram: u.laptop?.ram || "-",
          storage: u.laptop?.storage || "-",
          grade: `Grade ${u.grade}`,
          sn: u.serial_number,
          condition: u.condition_note || "-",
          price: u.pedagang_price,
        };

        const row = ws.addRow(rowData);
        row.height = 22;

        row.eachCell((cell, colNum) => {
          const key = ws.getColumn(colNum).key as string;

          // ── Base styling ──────────────────────────────────────────────
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          cell.border = {
              top: { style: "hair", color: { argb: COLOR.borderColor } },
              left: { style: "hair", color: { argb: COLOR.borderColor } },
              bottom: { style: "hair", color: { argb: COLOR.borderColor } },
              right: { style: "hair", color: { argb: COLOR.borderColor } },
          };
          cell.font = { size: 10, name: "Arial" };
          cell.alignment = { vertical: "middle" };

          // ── Per-column overrides ──────────────────────────────────────
          if (key === "no") {
              cell.alignment = { horizontal: "center", vertical: "middle" };
              cell.font = { size: 10, name: "Arial", color: { argb: COLOR.subTextFg } };
          } else if (key === "product" || key === "condition") {
              cell.font = { size: 10, name: "Arial", bold: key === "product" };
              cell.alignment = { horizontal: "left", vertical: "middle" };
          } else if (["brand", "cpu", "ram", "storage", "grade", "sn"].includes(key)) {
              cell.alignment = { horizontal: "center", vertical: "middle" };
          } else if (key === "price") {
              cell.numFmt = '"Rp "#,##0';
              cell.font = { size: 10, name: "Arial", bold: true };
              cell.alignment = { horizontal: "right", vertical: "middle" };
          }
        });
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