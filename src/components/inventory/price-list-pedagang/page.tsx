"use client";

import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { UserRole, hasAnyRole, PERMISSIONS } from "@/lib/permissions";
import { Tags, Package, Wallet, Download, RefreshCw } from "lucide-react";
import EditableLaptopCombinedPriceCell from "@/components/inventory/EditableLaptopCombinedPriceCell";

// Disamakan dengan PRICELIST_MODAL_VIEW_ROLES di pricelistPedagang.ts —
// di-inline di sini supaya tidak import module yang transitif ke server code.
const MODAL_VIEW_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "PENGELOLA_BARANG",
  "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI", "ACCOUNTING",
  "KEPALA_SOTECH", "KEPALA_ONPOINT", "KEPALA_ZENITH",
];

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
  charger_price: number;
  laptop_bag_price: number;
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
  const canSeeModal = hasAnyRole(userRoles, MODAL_VIEW_ROLES);
  const canEditLaptop = hasAnyRole(userRoles, PERMISSIONS.EDIT_LAPTOP);

  // ─── Bulk Edit State ───────────────────────────────────────────────────────
  const [selectedLaptopIds, setSelectedLaptopIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkPriceInput, setBulkPriceInput] = useState("0");
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

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

      const ws = wb.addWorksheet("Laptop Siap Jual", {
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
      });

      const COLOR = {
        headerBg: "FF374151",
        headerFg: "FFFFFFFF",
        rowEven: "FFF8FAFC",
        rowOdd: "FFFFFFFF",
        borderColor: "FFE2E8F0",
        subTextFg: "FF64748B",
      };

      const COLS = [
        { header: "No", key: "no", width: 6 },
        { header: "Product", key: "product", width: 36 },
        { header: "CPU", key: "cpu", width: 22 },
        { header: "RAM", key: "ram", width: 12 },
        { header: "HDD/SSD", key: "storage", width: 16 },
        { header: "Siap Jual", key: "qty", width: 12 },
        { header: "Price Store", key: "price", width: 20 },
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
      ws.getRow(headerRowNum).height = 30;

      // Ambil unit yang SIAP_JUAL (jika filter status ALL), atau ikuti filter status yang aktif
      const unitsToExport = filterStatus === "ALL" 
        ? filtered.filter((u) => u.status === "SIAP_JUAL")
        : filtered;

      // Agregasi unit per model laptop & harga pedagang
      const groupedMap = new Map<string, {
        product: string;
        cpu: string;
        ram: string;
        storage: string;
        qty: number;
        price: number;
      }>();

      unitsToExport.forEach((u) => {
        const product = u.laptop?.laptop_name || "-";
        const cpu = u.laptop?.cpu || "-";
        const ram = u.laptop?.ram || "-";
        const storage = u.laptop?.storage || "-";
        const price = u.pedagang_price || 0;

        const key = `${product}|${cpu}|${ram}|${storage}|${price}`;

        if (groupedMap.has(key)) {
          groupedMap.get(key)!.qty += 1;
        } else {
          groupedMap.set(key, {
            product,
            cpu,
            ram,
            storage,
            qty: 1,
            price,
          });
        }
      });

      const groupedData = Array.from(groupedMap.values()).sort((a, b) =>
        a.product.localeCompare(b.product, "id")
      );

      groupedData.forEach((item, idx) => {
        const rowBg = idx % 2 === 0 ? COLOR.rowOdd : COLOR.rowEven;
        const rowData = {
          no: idx + 1,
          product: item.product,
          cpu: item.cpu,
          ram: item.ram,
          storage: item.storage,
          qty: item.qty,
          price: item.price,
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
          } else if (key === "product") {
            cell.font = { size: 10, name: "Arial", bold: true };
            cell.alignment = { horizontal: "left", vertical: "middle" };
          } else if (["cpu", "ram", "storage"].includes(key)) {
            cell.alignment = { horizontal: "center", vertical: "middle" };
          } else if (key === "qty") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
            cell.font = { size: 10, name: "Arial", bold: true, color: { argb: "FF15803D" } };
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

  const groupedTableData = useMemo(() => {
    const map = new Map<string, {
      laptopId: string;
      product: string;
      brand: string;
      cpu: string;
      ram: string;
      storage: string;
      charger_price: number;
      laptop_bag_price: number;
      modal_price: number;
      tier_label: string;
      pedagang_price: number;
      siapJualCount: number;
      totalCount: number;
    }>();

    filtered.forEach((u) => {
      const laptopId = u.laptop?.id || u.unit_id;
      const product = u.laptop?.laptop_name || "—";
      const brand = u.laptop?.brand || "—";
      const cpu = u.laptop?.cpu || "—";
      const ram = u.laptop?.ram || "—";
      const storage = u.laptop?.storage || "—";
      const charger_price = u.charger_price || 0;
      const laptop_bag_price = u.laptop_bag_price || 0;
      const modal_price = u.modal_price || 0;
      const tier_label = u.tier_label || "";
      const pedagang_price = u.pedagang_price || 0;

      const key = `${laptopId}_${pedagang_price}`;

      if (map.has(key)) {
        const item = map.get(key)!;
        item.totalCount += 1;
        if (u.status === "SIAP_JUAL") item.siapJualCount += 1;
      } else {
        map.set(key, {
          laptopId: u.laptop?.id || "",
          product,
          brand,
          cpu,
          ram,
          storage,
          charger_price,
          laptop_bag_price,
          modal_price,
          tier_label,
          pedagang_price,
          siapJualCount: u.status === "SIAP_JUAL" ? 1 : 0,
          totalCount: 1,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.product.localeCompare(b.product, "id")
    );
  }, [filtered]);

  // Checkbox selection logic
  const allVisibleLaptopIds = useMemo(
    () => groupedTableData.map((d) => d.laptopId).filter(Boolean),
    [groupedTableData]
  );

  const isAllSelected =
    allVisibleLaptopIds.length > 0 &&
    allVisibleLaptopIds.every((id) => selectedLaptopIds.includes(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLaptopIds([]);
    } else {
      setSelectedLaptopIds(allVisibleLaptopIds);
    }
  };

  const toggleSelectLaptop = (id: string) => {
    if (!id) return;
    setSelectedLaptopIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleApplyBulkEdit = async () => {
    const parsedTotal = Math.round(Number(bulkPriceInput.replace(/\./g, "").replace(/,/g, "")));
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      setBulkError("Nominal biaya tidak valid");
      return;
    }

    if (selectedLaptopIds.length === 0) return;

    setIsSubmittingBulk(true);
    setBulkError("");
    try {
      const responses = await Promise.all(
        selectedLaptopIds.map(async (id) => {
          const res = await fetch(`/api/laptops/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              charger_price: parsedTotal,
              laptop_bag_price: 0,
            }),
          });
          return res.json();
        })
      );

      const failed = responses.find((r) => !r.success);
      if (failed) {
        setBulkError(failed.message || "Gagal memperbarui beberapa laptop");
        return;
      }

      setBulkSuccessMsg(`Berhasil memperbarui biaya untuk ${selectedLaptopIds.length} laptop!`);
      setSelectedLaptopIds([]);
      setIsBulkModalOpen(false);
      await fetchData();

      setTimeout(() => setBulkSuccessMsg(null), 4000);
    } catch {
      setBulkError("Koneksi gagal saat memperbarui data");
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  return (
    <div className="space-y-4">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400 font-medium">
            Harga referensi untuk pedagang — tidak memengaruhi transaksi/payment
          </p>
          <div className="flex items-center gap-2">
            {canEditLaptop && selectedLaptopIds.length > 0 && (
              <button
                onClick={() => {
                  setBulkPriceInput("0");
                  setBulkError("");
                  setIsBulkModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 h-9 px-4 bg-violet-600 hover:bg-violet-700 active:scale-[0.97] rounded-xl text-xs font-bold text-white shadow-lg shadow-violet-600/25 transition"
              >
                <span>⚡</span> Set Biaya Massal ({selectedLaptopIds.length})
              </button>
            )}
            <button onClick={fetchData}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 transition">
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={exportToExcel} disabled={isExporting || filtered.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-gray-800 rounded-xl text-xs font-semibold text-white hover:bg-gray-900 active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-gray-800/25">
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

        {bulkSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center justify-between animate-in fade-in">
            <span>✅ {bulkSuccessMsg}</span>
            <button onClick={() => setBulkSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 text-xs font-bold">✕</button>
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
              <input type="text" placeholder="Cari nama, brand, CPU..." value={search} onChange={(e) => setSearch(e.target.value)}
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
        ) : groupedTableData.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
            <p className="text-gray-700 font-bold text-base">Tidak ada unit ditemukan</p>
            <p className="text-gray-400 text-sm mt-1.5">Coba ubah filter di atas</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    {canEditLaptop && (
                      <th className="px-3 py-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-400 cursor-pointer"
                          title="Pilih Semua Laptop"
                        />
                      </th>
                    )}
                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest w-10">No</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">Product</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest">CPU</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest">RAM</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest">HDD/SSD</th>
                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest">Siap Jual</th>
                    {canSeeModal && (
                      <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Biaya Charger & Tas</th>
                    )}
                    {canSeeModal && (
                      <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Harga Modal</th>
                    )}
                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Price Store</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {groupedTableData.map((item, idx) => (
                    <tr key={`${item.laptopId}_${idx}`} className="hover:bg-gray-50/60 transition">
                      {canEditLaptop && (
                        <td className="px-3 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedLaptopIds.includes(item.laptopId)}
                            onChange={() => toggleSelectLaptop(item.laptopId)}
                            className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-400 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3.5 text-center text-xs font-semibold text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3.5 min-w-[180px]">
                        <p className="font-bold text-gray-900 text-[13px]">{item.product}</p>
                        {item.brand && item.brand !== "—" && (
                          <p className="text-[11px] text-gray-400 font-medium">{item.brand}</p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-center text-xs text-gray-700 font-medium whitespace-nowrap">{item.cpu}</td>
                      <td className="px-3 py-3.5 text-center text-xs text-gray-700 font-medium whitespace-nowrap">{item.ram}</td>
                      <td className="px-3 py-3.5 text-center text-xs text-gray-700 font-medium whitespace-nowrap">{item.storage}</td>
                      <td className="px-3 py-3.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {item.siapJualCount}
                        </span>
                      </td>
                      {canSeeModal && (
                        <td className="px-3 py-3.5 text-right whitespace-nowrap">
                          {canEditLaptop && item.laptopId ? (
                            <EditableLaptopCombinedPriceCell
                              laptopId={item.laptopId}
                              chargerPrice={item.charger_price}
                              bagPrice={item.laptop_bag_price}
                              onSaved={fetchData}
                            />
                          ) : (
                            <span className="text-xs text-gray-700 font-semibold tabular-nums">{fmt(item.charger_price + item.laptop_bag_price)}</span>
                          )}
                        </td>
                      )}
                      {canSeeModal && (
                        <td className="px-3 py-3.5 text-right whitespace-nowrap">
                          <p className="text-xs text-gray-500 tabular-nums font-medium">{fmt(item.modal_price)}</p>
                          <p className="text-[10px] text-gray-400">{item.tier_label}</p>
                        </td>
                      )}
                      <td className="px-3 py-3.5 text-right whitespace-nowrap">
                        <span className="font-bold text-gray-900 text-sm tabular-nums">{fmt(item.pedagang_price)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 text-xs text-gray-400">
              <span className="text-gray-700 font-bold">{groupedTableData.length}</span> tipe laptop ({totals.count} unit total)
            </div>
          </div>
        )}

        {/* Modal Bulk Edit */}
        {isBulkModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-8 h-8 bg-violet-50 text-violet-600 rounded-xl flex items-center justify-center font-black">⚡</span>
                  Set Biaya Massal (Bulk Edit)
                </h3>
                <button onClick={() => setIsBulkModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm font-semibold">✕</button>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                Menetapkan total biaya tambahan (charger & tas) sekaligus untuk <strong className="text-violet-600 font-bold">{selectedLaptopIds.length} laptop</strong> yang dipilih.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Total Biaya Charger & Tas (Rp):</label>
                <input
                  type="number"
                  value={bulkPriceInput}
                  onChange={(e) => { setBulkPriceInput(e.target.value); setBulkError(""); }}
                  placeholder="Contoh: 75000"
                  min={0}
                  autoFocus
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition"
                />
              </div>

              {bulkError && <p className="text-xs text-red-500 font-medium">{bulkError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsBulkModalOpen(false)}
                  className="h-9 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  onClick={handleApplyBulkEdit}
                  disabled={isSubmittingBulk}
                  className="h-9 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                >
                  {isSubmittingBulk ? "Memproses..." : `Terapkan ke ${selectedLaptopIds.length} Laptop`}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
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