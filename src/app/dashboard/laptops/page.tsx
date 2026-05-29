"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import ExcelJS from "exceljs";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";
import BarcodeModal from "@/components/ui/BarcodeModal";

interface Laptop {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    gpu: string;
    display: string;
    condition_note: string;
    selling_price: number;
    qty: number;
    status: string;
    ready_to_sell: boolean;
    notes: string;
    created_at: string;
}

type ModalMode = "detail" | "create" | "edit" | null;

const EMPTY_FORM = {
    laptop_name: "",
    brand: "",
    cpu: "",
    ram: "",
    storage: "",
    gpu: "",
    display: "",
    selling_price: "",
    condition_note: "",
    notes: "",
};

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Sold" },
};

const Shimmer = ({
    w,
    h,
    r = "8px",
    style = {},
    className = "",
}: {
    w?: string | number;
    h: string | number;
    r?: string;
    style?: React.CSSProperties;
    className?: string;
}) => (
    <div
        className={className}
        style={{
            width: w ?? "100%",
            height: h,
            borderRadius: r,
            background:
                "linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)",
            backgroundSize: "600px 100%",
            animation: "sk-shimmer 1.4s infinite linear",
            flexShrink: 0,
            ...style,
        }}
    />
);

export default function Page() {
    const [laptops, setLaptops] = useState<Laptop[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterBrand, setFilterBrand] = useState("ALL");

    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [selectedLaptop, setSelectedLaptop] = useState<Laptop | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
    const [formLoading, setFormLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [barcodeTarget, setBarcodeTarget] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => { fetchLaptops(); }, []);

    useEffect(() => {
        document.body.style.overflow = modalMode ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [modalMode]);

    const fetchLaptops = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/laptops");
            const result = await res.json();
            setLaptops(result.data || []);
        } catch {
            setLaptops([]);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredLaptops = useMemo(() => {
        let list = [...laptops];
        if (search.trim()) {
            const t = search.toLowerCase();
            list = list.filter(x =>
                x.laptop_name?.toLowerCase().includes(t) ||
                x.brand?.toLowerCase().includes(t) ||
                x.cpu?.toLowerCase().includes(t) ||
                x.ram?.toLowerCase().includes(t) ||
                x.storage?.toLowerCase().includes(t)
            );
        }
        if (filterStatus !== "ALL") list = list.filter(x => x.status === filterStatus);
        if (filterBrand !== "ALL") list = list.filter(x => x.brand === filterBrand);
        return list;
    }, [laptops, search, filterStatus, filterBrand]);

    const uniqueBrands = useMemo(() => {
        const b = new Set(laptops.map(x => x.brand).filter(Boolean));
        return ["ALL", ...Array.from(b)];
    }, [laptops]);

    const openCreate = () => {
        setFormData({ ...EMPTY_FORM });
        setModalMode("create");
    };

    const openDetail = async (laptop: Laptop) => {
        setSelectedLaptop(laptop);
        setModalMode("detail");
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/laptops/${laptop.id}`);
            const result = await res.json();
            if (result.data) setSelectedLaptop(result.data);
        } catch { /* use cached */ } finally {
            setDetailLoading(false);
        }
    };

    const openEdit = (laptop: Laptop) => {
        setSelectedLaptop(laptop);
        setFormData({
            laptop_name: laptop.laptop_name || "",
            brand: laptop.brand || "",
            cpu: laptop.cpu || "",
            ram: laptop.ram || "",
            storage: laptop.storage || "",
            gpu: laptop.gpu || "",
            display: laptop.display || "",
            selling_price: String(laptop.selling_price || ""),
            condition_note: laptop.condition_note || "",
            notes: laptop.notes || "",
        });
        setModalMode("edit");
    };

    const closeModal = () => { setModalMode(null); setSelectedLaptop(null); };

    const handleFormChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const res = await fetch("/api/laptops/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    selling_price: Number(formData.selling_price),
                }),
            });
            const result = await res.json();
            if (!result.success) { alert(result.message || "Gagal menambahkan laptop"); return; }
            closeModal();
            fetchLaptops();
            alert("Laptop berhasil ditambahkan ✅");
        } catch {
            alert("Terjadi kesalahan saat menyimpan");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLaptop) return;
        setFormLoading(true);
        try {
            const res = await fetch(`/api/laptops/${selectedLaptop.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    selling_price: Number(formData.selling_price),
                }),
            });
            const result = await res.json();
            if (!result.success) { alert(result.message); return; }
            closeModal();
            fetchLaptops();
        } catch { alert("Terjadi kesalahan"); } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Yakin ingin menghapus laptop ini? Semua unit terkait juga akan terhapus.")) return;
        try {
            await fetch(`/api/laptops/${id}`, { method: "DELETE" });
            if (modalMode === "detail") closeModal();
            fetchLaptops();
        } catch { console.error("Delete failed"); }
    };

    const exportToExcel = async () => {
        const wb = new ExcelJS.Workbook();
        wb.creator = "Solit Inventory";
        wb.created = new Date();

        const ws = wb.addWorksheet("Data Laptop", {
            views: [{ state: "frozen", ySplit: 1 }],
            pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
        });

        const COLOR = {
            headerBg: "FF1E293B", headerFg: "FFFFFFFF",
            siapBg: "FFD1FAE5", siapFg: "FF065F46",
            belumBg: "FFFEF3C7", belumFg: "FF78350F",
            serviceBg: "FFDBEAFE", serviceFg: "FF1E3A5F",
            rowEven: "FFF8FAFC", rowOdd: "FFFFFFFF",
            totalBg: "FFEFF6FF", totalFg: "FF1E40AF",
            borderColor: "FFE2E8F0", profitFg: "FF065F46",
            lossFg: "FF991B1B", subTextFg: "FF64748B",
        };

        ws.columns = [
            { header: "No", key: "no" },
            { header: "Nama Laptop", key: "nama" },
            { header: "Brand", key: "brand" },
            { header: "CPU", key: "cpu" },
            { header: "RAM", key: "ram" },
            { header: "Storage", key: "storage" },
            { header: "GPU", key: "gpu" },
            { header: "Display", key: "display" },
            { header: "Kondisi", key: "kondisi" },
            { header: "Harga Jual", key: "harga_jual" },
            { header: "Stok", key: "stok" },
            { header: "Status", key: "status" },
            { header: "Notes", key: "notes" },
            { header: "Tgl Masuk", key: "created" },
        ];

        const headerRow = ws.getRow(1);
        headerRow.height = 30;
        headerRow.eachCell(cell => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
            cell.font = { bold: true, size: 10, color: { argb: COLOR.headerFg }, name: "Arial" };
            cell.border = {
                top: { style: "thin", color: { argb: COLOR.borderColor } },
                left: { style: "thin", color: { argb: COLOR.borderColor } },
                bottom: { style: "medium", color: { argb: "FF94A3B8" } },
                right: { style: "thin", color: { argb: COLOR.borderColor } },
            };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        filteredLaptops.forEach((item, idx) => {
            const isEven = idx % 2 === 0;
            const rowBg = isEven ? COLOR.rowEven : COLOR.rowOdd;
            const statusMap: Record<string, string> = {
                SIAP_JUAL: "Siap Jual", BELUM_SIAP: "Belum Siap", SERVICE: "Service", SOLD: "Sold",
            };
            const row = ws.addRow({
                no: idx + 1,
                nama: item.laptop_name || "",
                brand: item.brand || "",
                cpu: item.cpu || "",
                ram: item.ram || "",
                storage: item.storage || "",
                gpu: item.gpu || "",
                display: item.display || "",
                kondisi: item.condition_note || "",
                harga_jual: item.selling_price || 0,
                stok: item.qty ?? 0,
                status: statusMap[item.status] || item.status,
                notes: item.notes || "",
                created: new Date(item.created_at).toLocaleDateString("id-ID", {
                    day: "2-digit", month: "short", year: "numeric",
                }),
            });

            row.height = 22;
            row.eachCell((cell, colNum) => {
                const key = ws.getColumn(colNum).key as string;
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
                cell.border = {
                    top: { style: "hair", color: { argb: COLOR.borderColor } },
                    left: { style: "hair", color: { argb: COLOR.borderColor } },
                    bottom: { style: "hair", color: { argb: COLOR.borderColor } },
                    right: { style: "hair", color: { argb: COLOR.borderColor } },
                };
                cell.font = { size: 10, name: "Arial" };

                if (key === "no") { cell.alignment = { horizontal: "center", vertical: "middle" }; cell.font = { size: 10, name: "Arial", color: { argb: COLOR.subTextFg } }; }
                else if (key === "harga_jual") { cell.numFmt = '"Rp "#,##0'; cell.alignment = { horizontal: "right", vertical: "middle" }; }
                else if (key === "stok") { cell.alignment = { horizontal: "center", vertical: "middle" }; if ((item.qty ?? 0) === 0) cell.font = { size: 10, name: "Arial", bold: true, color: { argb: "FF991B1B" } }; }
                else if (key === "status") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    const s = item.status;
                    if (s === "SIAP_JUAL") { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.siapBg } }; cell.font = { size: 10, name: "Arial", bold: true, color: { argb: COLOR.siapFg } }; }
                    else if (s === "BELUM_SIAP") { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.belumBg } }; cell.font = { size: 10, name: "Arial", bold: true, color: { argb: COLOR.belumFg } }; }
                    else if (s === "SERVICE") { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.serviceBg } }; cell.font = { size: 10, name: "Arial", bold: true, color: { argb: COLOR.serviceFg } }; }
                }
                else if (key === "nama") { cell.alignment = { horizontal: "left", vertical: "middle" }; cell.font = { size: 10, name: "Arial", bold: true }; }
                else if (key === "created") { cell.alignment = { horizontal: "center", vertical: "middle" }; cell.font = { size: 9, name: "Arial", color: { argb: COLOR.subTextFg } }; }
                else { cell.alignment = { horizontal: "left", vertical: "middle" }; }
            });
        });

        const dataStart = 2;
        const dataEnd = filteredLaptops.length + 1;
        const totalRow = ws.addRow({
            no: "", nama: `TOTAL  (${filteredLaptops.length} unit)`,
            harga_jual: { formula: `SUM(J${dataStart}:J${dataEnd})` },
            stok: { formula: `SUM(K${dataStart}:K${dataEnd})` },
        });
        totalRow.height = 26;
        totalRow.eachCell(cell => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalBg } };
            cell.font = { bold: true, size: 10, name: "Arial", color: { argb: COLOR.totalFg } };
            cell.border = {
                top: { style: "medium", color: { argb: "FF93C5FD" } },
                left: { style: "hair", color: { argb: COLOR.borderColor } },
                bottom: { style: "medium", color: { argb: "FF93C5FD" } },
                right: { style: "hair", color: { argb: COLOR.borderColor } },
            };
        });

        ws.columns.forEach((col, colIndex) => {
            let maxLen = col.header ? String(col.header).length : 0;
            filteredLaptops.forEach((item) => {
                const rowNum = filteredLaptops.indexOf(item) + 2;
                const cell = ws.getCell(rowNum, colIndex + 1);
                if (cell.value !== null && cell.value !== undefined) {
                    const cellText = typeof cell.value === "object" && "formula" in (cell.value as object)
                        ? String(col.header ?? "")
                        : String(cell.value);
                    if (cellText.length > maxLen) maxLen = cellText.length;
                }
            });
            col.width = Math.min(45, Math.max(8, maxLen + 2));
        });

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `data_laptop_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
            <style>{`
                @keyframes sk-shimmer {
                    0%   { background-position: -600px 0; }
                    100% { background-position:  600px 0; }
                }
            `}</style>

            <DashboardLayout>
                <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                    <div className="max-w-full mx-auto space-y-6">

                        {/* ── Header yang lebih premium ── */}
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-7 h-7 bg-[#1a1a2e] rounded-lg flex items-center justify-center">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                            <rect x="2" y="3" width="20" height="14" rx="2" />
                                            <line x1="8" y1="21" x2="16" y2="21" />
                                            <line x1="12" y1="17" x2="12" y2="21" />
                                        </svg>
                                    </div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-[#1a1a2e] tracking-tight">Data Laptop</h1>
                                </div>
                                <p className="text-gray-500 text-sm ml-9">Kelola inventaris laptop Anda dengan mudah</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={exportToExcel}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Export Excel
                                </button>
                                <button
                                    onClick={openCreate}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] rounded-xl text-sm font-medium text-white hover:bg-[#16213e] transition-all shadow-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Tambah Laptop
                                </button>
                            </div>
                        </div>

                        {/* ── Filter Bar yang lebih segar ── */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="relative lg:col-span-1">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Cari nama, brand, CPU..."
                                        className="w-full pl-9 pr-3 h-10 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                                <select
                                    className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                >
                                    <option value="ALL">Semua Status</option>
                                    <option value="SIAP_JUAL">Siap Jual</option>
                                    <option value="BELUM_SIAP">Belum Siap</option>
                                    <option value="SERVICE">Service</option>
                                    <option value="SOLD">Sold</option>
                                </select>
                                <select
                                    className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                                    value={filterBrand}
                                    onChange={e => setFilterBrand(e.target.value)}
                                >
                                    {uniqueBrands.map(b => (
                                        <option key={b} value={b}>{b === "ALL" ? "Semua Brand" : b}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => { setSearch(""); setFilterStatus("ALL"); setFilterBrand("ALL"); }}
                                    className="h-10 bg-gray-100 text-gray-600 rounded-xl px-3 text-sm font-medium hover:bg-gray-200 transition"
                                >
                                    Reset Filter
                                </button>
                            </div>
                        </div>

                        {/* ── Table dengan desain modern ── */}
                        {isLoading ? (
                            <SkeletonTable />
                        ) : filteredLaptops.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                                <div className="text-4xl mb-3">💻</div>
                                <p className="text-gray-500 font-medium">Tidak ada laptop ditemukan</p>
                                <p className="text-gray-400 text-sm mt-1">Coba ubah filter atau tambah laptop baru</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50/80 border-b border-gray-100">
                                                <Th>Nama Laptop</Th>
                                                <Th>Brand</Th>
                                                <Th>Spesifikasi</Th>
                                                <Th right>Harga Jual</Th>
                                                <Th right>Stok</Th>
                                                <Th>Status</Th>
                                                <Th right>Aksi</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {filteredLaptops.map(item => {
                                                const s = STATUS_STYLE[item.status];
                                                return (
                                                    <tr
                                                        key={item.id}
                                                        className="group hover:bg-gray-50/80 transition-colors cursor-pointer"
                                                        onClick={() => openDetail(item)}
                                                    >
                                                        <td className="px-4 py-3.5 max-w-[200px]">
                                                            <span className="block font-semibold text-gray-800 truncate group-hover:text-[#1a1a2e] transition-colors" title={item.laptop_name}>
                                                                {item.laptop_name}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                                                            {item.brand || <span className="text-gray-300">—</span>}
                                                        </td>
                                                        <td className="px-4 py-3.5 min-w-[220px]">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {item.cpu && <Chip>{item.cpu}</Chip>}
                                                                {item.ram && <Chip>{item.ram}</Chip>}
                                                                {item.storage && <Chip>{item.storage}</Chip>}
                                                                {item.gpu && <Chip>{item.gpu}</Chip>}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                                                            {fmt(item.selling_price)}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            <span
                                                                className={`font-medium ${(item.qty ?? 0) === 0
                                                                        ? "text-red-500"
                                                                        : "text-gray-700"
                                                                    }`}
                                                            >
                                                                {item.qty ?? 0}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                                            {s ? (
                                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.badge}`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                                                    {s.label}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">{item.status}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => setBarcodeTarget({ id: item.id, name: item.laptop_name })}
                                                                    className="px-2 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                                                                    title="Lihat Barcode"
                                                                >
                                                                    {/* Icon barcode */}
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                                                            d="M3 9V6a1 1 0 011-1h2M3 15v3a1 1 0 001 1h2m13-13h2a1 1 0 011 1v3m0 6v3a1 1 0 01-1 1h-2M9 5v14M12 5v14M15 5v14" />
                                                                    </svg>
                                                                </button>
                                                                <Link
                                                                    href={`/dashboard/laptops/${item.id}/units`}
                                                                    onClick={e => e.stopPropagation()}
                                                                    className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                                                                >
                                                                    Units
                                                                </Link>
                                                                <button
                                                                    onClick={() => openEdit(item)}
                                                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(item.id)}
                                                                    className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition"
                                                                >
                                                                    Hapus
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
                                    <p className="text-xs text-gray-500">
                                        Menampilkan <span className="font-semibold text-gray-700">{filteredLaptops.length}</span> dari <span className="font-semibold text-gray-700">{laptops.length}</span> laptop
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                {/* ── Modal Detail ── */}
                <Modal open={modalMode === "detail"} onClose={closeModal} title="Detail Laptop" size="lg">
                    {detailLoading ? (
                        <ModalDetailSkeleton />
                    ) : selectedLaptop ? (
                        <div className="space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-start gap-5 p-5 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-100">
                                <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-3xl">
                                    💻
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-900 text-lg">{selectedLaptop.laptop_name}</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">{selectedLaptop.brand || "—"}</p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {(() => {
                                            const s = STATUS_STYLE[selectedLaptop.status];
                                            return s ? (
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.badge}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                                    {s.label}
                                                </span>
                                            ) : null;
                                        })()}
                                        {selectedLaptop.ready_to_sell && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                ✓ Ready to Sell
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="sm:text-right flex-shrink-0">
                                    <p className="text-xs text-gray-400">Harga Jual</p>
                                    <p className="text-xl font-bold text-gray-900 mt-0.5">{fmt(selectedLaptop.selling_price)}</p>
                                    <p className="text-xs text-gray-400 mt-1.5">
                                        Stok:{" "}
                                        <span className={`font-semibold ${(selectedLaptop.qty ?? 0) === 0 ? "text-red-500" : "text-gray-700"}`}>
                                            {selectedLaptop.qty ?? 0}
                                        </span>
                                        <span className="text-gray-300 ml-1">(dari units)</span>
                                    </p>
                                </div>
                            </div>

                            <div>
                                <SectionLabel>Spesifikasi Teknis</SectionLabel>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {[
                                        { label: "CPU", value: selectedLaptop.cpu },
                                        { label: "RAM", value: selectedLaptop.ram },
                                        { label: "Storage", value: selectedLaptop.storage },
                                        { label: "GPU", value: selectedLaptop.gpu },
                                        { label: "Display", value: selectedLaptop.display },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                            <p className="text-xs text-gray-400 mb-1">{label}</p>
                                            <p className="text-sm font-medium text-gray-800 break-all">
                                                {value || <span className="text-gray-300 font-normal">—</span>}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-start gap-3 bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                                <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div>
                                    <p className="text-sm font-semibold text-blue-700">Stok & harga modal dikelola per-unit</p>
                                    <p className="text-xs text-blue-600 mt-0.5">
                                        Setiap unit punya SN, grade, dan harga modal sendiri. Klik <span className="font-semibold">Lihat Units</span> untuk mengelolanya.
                                    </p>
                                </div>
                            </div>

                            {(selectedLaptop.condition_note || selectedLaptop.notes) && (
                                <div>
                                    <SectionLabel>Catatan</SectionLabel>
                                    <div className="space-y-3">
                                        {selectedLaptop.condition_note && (
                                            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                                                <p className="text-xs font-semibold text-amber-600 mb-1">Kondisi Umum</p>
                                                <p className="text-sm text-amber-900">{selectedLaptop.condition_note}</p>
                                            </div>
                                        )}
                                        {selectedLaptop.notes && (
                                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                                                <p className="text-xs font-semibold text-gray-400 mb-1">Catatan Tambahan</p>
                                                <p className="text-sm text-gray-700">{selectedLaptop.notes}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                <p className="text-xs text-gray-400">
                                    Ditambahkan {new Date(selectedLaptop.created_at).toLocaleDateString("id-ID", {
                                        day: "2-digit", month: "long", year: "numeric",
                                    })}
                                </p>
                                <div className="flex gap-2">
                                    <Link
                                        href={`/dashboard/laptops/${selectedLaptop.id}/units`}
                                        className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition"
                                    >
                                        Lihat Units
                                    </Link>
                                    <button
                                        onClick={() => { closeModal(); setTimeout(() => openEdit(selectedLaptop!), 60); }}
                                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(selectedLaptop.id)}
                                        className="px-4 py-2 text-sm font-medium text-red-500 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition"
                                    >
                                        Hapus
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </Modal>

                {/* ── Modal Create ── */}
                <Modal open={modalMode === "create"} onClose={closeModal} title="Tambah Laptop Baru" size="md">
                    <form onSubmit={handleCreate} className="space-y-5">
                        <div className="flex items-start gap-3 bg-blue-50/50 border border-blue-100 rounded-xl p-3.5">
                            <svg className="w-4 h-4 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-xs text-blue-700">
                                SN, grade, harga modal, dan stok dikelola per-unit setelah laptop dibuat.
                            </p>
                        </div>

                        <FormGrid>
                            <FormField label="Nama Laptop" required>
                                <Input name="laptop_name" placeholder="Contoh: MacBook Air M2" value={formData.laptop_name} onChange={handleFormChange} required />
                            </FormField>
                            <FormField label="Brand">
                                <Input name="brand" placeholder="Apple, Lenovo, Dell..." value={formData.brand} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="CPU">
                                <Input name="cpu" placeholder="Intel Core i7, Apple M2..." value={formData.cpu} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="RAM">
                                <Input name="ram" placeholder="8GB, 16GB..." value={formData.ram} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="Storage">
                                <Input name="storage" placeholder="256GB SSD, 512GB..." value={formData.storage} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="GPU">
                                <Input name="gpu" placeholder="NVIDIA RTX 4060..." value={formData.gpu} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="Display">
                                <Input name="display" placeholder='14" FHD IPS 144Hz' value={formData.display} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="Harga Jual (default)" required>
                                <Input name="selling_price" type="number" placeholder="0" value={formData.selling_price} onChange={handleFormChange} required />
                            </FormField>
                        </FormGrid>
                        <FormField label="Kondisi Umum">
                            <Input name="condition_note" placeholder="Mulus, normal pemakaian..." value={formData.condition_note} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Catatan">
                            <textarea name="notes" placeholder="Catatan tambahan..." value={formData.notes} onChange={handleFormChange} rows={2}
                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition resize-none" />
                        </FormField>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={closeModal}
                                className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                                Batal
                            </button>
                            <button type="submit" disabled={formLoading}
                                className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition disabled:opacity-50">
                                {formLoading ? "Menyimpan..." : "Buat Laptop"}
                            </button>
                        </div>
                    </form>
                </Modal>

                {/* ── Modal Edit ── */}
                <Modal open={modalMode === "edit"} onClose={closeModal} title={`Edit Laptop`} size="md">
                    <form onSubmit={handleEdit} className="space-y-5">
                        <FormGrid>
                            <FormField label="Nama Laptop" required>
                                <Input name="laptop_name" value={formData.laptop_name} onChange={handleFormChange} required />
                            </FormField>
                            <FormField label="Brand">
                                <Input name="brand" value={formData.brand} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="CPU">
                                <Input name="cpu" value={formData.cpu} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="RAM">
                                <Input name="ram" value={formData.ram} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="Storage">
                                <Input name="storage" value={formData.storage} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="GPU">
                                <Input name="gpu" value={formData.gpu} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="Display">
                                <Input name="display" value={formData.display} onChange={handleFormChange} />
                            </FormField>
                            <FormField label="Harga Jual (default)" required>
                                <Input name="selling_price" type="number" value={formData.selling_price} onChange={handleFormChange} required />
                            </FormField>
                        </FormGrid>
                        <FormField label="Kondisi Umum">
                            <Input name="condition_note" value={formData.condition_note} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Catatan">
                            <textarea name="notes" value={formData.notes} onChange={handleFormChange} rows={2}
                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition resize-none" />
                        </FormField>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={closeModal}
                                className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                                Batal
                            </button>
                            <button type="submit" disabled={formLoading}
                                className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition disabled:opacity-50">
                                {formLoading ? "Menyimpan..." : "Simpan Perubahan"}
                            </button>
                        </div>
                    </form>
                </Modal>
                {barcodeTarget && (
                    <BarcodeModal
                        laptopId={barcodeTarget.id}
                        laptopName={barcodeTarget.name}
                        onClose={() => setBarcodeTarget(null)}
                    />
                )}
            </DashboardLayout>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton & UI Helpers (tidak berubah logika, hanya perbaikan visual)
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonTable() {
    const rowVariants = [130, 155, 120, 140, 165, 125];
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                            {["Nama Laptop", "Brand", "Spesifikasi", "Harga Jual", "Stok", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <Shimmer w={80} h={11} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {rowVariants.map((w, r) => (
                            <tr key={r}>
                                <td className="px-4 py-3.5"><Shimmer w={w} h={14} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={55} h={13} /></td>
                                <td className="px-4 py-3.5"><div className="flex gap-2"><Shimmer w={52} h={20} r="6px" /><Shimmer w={36} h={20} r="6px" /><Shimmer w={44} h={20} r="6px" /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={90} h={14} /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={20} h={14} /></div></td>
                                <td className="px-4 py-3.5"><Shimmer w={70} h={24} r="99px" /></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end gap-2"><Shimmer w={44} h={28} r="8px" /><Shimmer w={36} h={28} r="8px" /></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
                <Shimmer w={160} h={11} />
            </div>
        </div>
    );
}

function ModalDetailSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex gap-5 p-5 bg-gray-50 rounded-xl border border-gray-100">
                <Shimmer w={56} h={56} r="12px" />
                <div className="flex-1 space-y-2"><Shimmer w="70%" h={18} /><Shimmer w="40%" h={14} /><div className="flex gap-2 mt-2"><Shimmer w={80} h={24} r="99px" /><Shimmer w={90} h={24} r="99px" /></div></div>
                <div className="text-right space-y-1"><Shimmer w={60} h={10} /><Shimmer w={100} h={24} /></div>
            </div>
            <div><Shimmer w={120} h={11} className="mb-2" /><div className="grid grid-cols-3 gap-3"><div className="bg-gray-50 p-3 rounded-xl border"><Shimmer w={40} h={10} className="mb-1" /><Shimmer w="80%" h={14} /></div><div className="bg-gray-50 p-3 rounded-xl border"><Shimmer w={40} h={10} className="mb-1" /><Shimmer w="70%" h={14} /></div><div className="bg-gray-50 p-3 rounded-xl border"><Shimmer w={50} h={10} className="mb-1" /><Shimmer w="90%" h={14} /></div></div></div>
            <div className="flex justify-between pt-3 border-t"><Shimmer w={100} h={11} /><div className="flex gap-2"><Shimmer w={80} h={32} r="10px" /><Shimmer w={60} h={32} r="10px" /></div></div>
        </div>
    );
}

function Modal({ open, onClose, title, children, size = "md" }: {
    open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "md" | "lg";
}) {
    const overlayRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-all" />
            <div className={`relative bg-white w-full shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl ${size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[92dvh] sm:max-h-[88vh] overflow-hidden`}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0 bg-white/95 backdrop-blur-sm">
                    <h2 className="font-semibold text-gray-800 text-base truncate">{title}</h2>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-6">{children}</div>
            </div>
        </div>
    );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={`px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
            {children}
        </th>
    );
}

function Chip({ children }: { children: React.ReactNode }) {
    return <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-md font-mono">{children}</span>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{children}</p>;
}

function FormGrid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
            {children}
        </div>
    );
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input {...props}
            className={`w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition ${className}`}
        />
    );
}