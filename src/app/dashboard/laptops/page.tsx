"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import ExcelJS from "exceljs";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Laptop {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    gpu: string;
    display: string;
    serial_number: string;
    condition_note: string;
    purchase_price: number;
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
    serial_number: "",
    purchase_price: "",
    selling_price: "",
    qty: "1",
    status: "SIAP_JUAL",
    condition_note: "",
    notes: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
    const [laptops, setLaptops] = useState<Laptop[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterBrand, setFilterBrand] = useState("ALL");

    // Modal state
    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [selectedLaptop, setSelectedLaptop] = useState<Laptop | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
    const [formLoading, setFormLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => { fetchLaptops(); }, []);

    // Lock body scroll when modal open
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
                x.storage?.toLowerCase().includes(t) ||
                x.serial_number?.toLowerCase().includes(t)
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

    // ── Modal openers ─────────────────────────────────────────────────────────
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
            serial_number: laptop.serial_number || "",
            purchase_price: String(laptop.purchase_price || ""),
            selling_price: String(laptop.selling_price || ""),
            qty: String(laptop.qty ?? 1),
            status: laptop.status || "SIAP_JUAL",
            condition_note: laptop.condition_note || "",
            notes: laptop.notes || "",
        });
        setModalMode("edit");
    };

    const closeModal = () => {
        setModalMode(null);
        setSelectedLaptop(null);
    };

    // ── Form handlers ─────────────────────────────────────────────────────────
    const handleFormChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);

        try {
            const res = await fetch("/api/laptops/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    purchase_price: Number(formData.purchase_price),
                    selling_price: Number(formData.selling_price),
                    qty: Number(formData.qty),
                }),
            });

            const result = await res.json();

            if (!result.success) {
                alert(result.message || "Gagal menambahkan laptop");
                return;
            }

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
                    purchase_price: Number(formData.purchase_price),
                    selling_price: Number(formData.selling_price),
                    qty: Number(formData.qty),
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
        if (!confirm("Yakin ingin menghapus laptop ini?")) return;
        try {
            await fetch(`/api/laptops/${id}`, { method: "DELETE" });
            if (modalMode === "detail") closeModal();
            fetchLaptops();
        } catch { console.error("Delete failed"); }
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const exportToExcel = async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Data Laptop");
        ws.columns = [
            { header: "Nama Laptop", key: "nama", width: 25 },
            { header: "Brand", key: "brand", width: 15 },
            { header: "CPU", key: "cpu", width: 20 },
            { header: "RAM", key: "ram", width: 10 },
            { header: "Storage", key: "storage", width: 15 },
            { header: "GPU", key: "gpu", width: 15 },
            { header: "Display", key: "display", width: 20 },
            { header: "Serial Number", key: "serial", width: 20 },
            { header: "Harga Modal", key: "harga_modal", width: 15 },
            { header: "Harga Jual", key: "harga_jual", width: 15 },
            { header: "Stok", key: "stok", width: 8 },
            { header: "Status", key: "status", width: 12 },
            { header: "Notes", key: "notes", width: 30 },
            { header: "Created At", key: "created", width: 20 },
        ];
        const headerRow = ws.getRow(1);
        headerRow.eachCell(cell => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
            cell.font = { bold: true, size: 11 };
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });
        filteredLaptops.forEach(item => {
            const row = ws.addRow({
                nama: item.laptop_name, brand: item.brand || "", cpu: item.cpu || "",
                ram: item.ram || "", storage: item.storage || "", gpu: item.gpu || "",
                display: item.display || "", serial: item.serial_number || "",
                harga_modal: item.purchase_price || 0, harga_jual: item.selling_price,
                stok: item.qty, status: STATUS_STYLE[item.status]?.label || item.status,
                notes: item.notes || "",
                created: new Date(item.created_at).toLocaleString("id-ID"),
            });
            row.eachCell((cell, colNum) => {
                cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
                const key = ws.getColumn(colNum).key;
                if (key === "harga_modal" || key === "harga_jual" || key === "stok") {
                    cell.numFmt = "#,##0"; cell.alignment = { horizontal: "right" };
                } else if (key === "status") {
                    cell.alignment = { horizontal: "center" };
                } else {
                    cell.alignment = { horizontal: "left", vertical: "middle" };
                }
            });
        });
        ws.views = [{ state: "frozen", ySplit: 1 }];
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `data_laptop_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <>
            <main className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-5">

                    {/* ── Header ── */}
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-semibold text-gray-800 tracking-tight">Data Laptop</h1>
                            <p className="text-xs text-gray-400 mt-0.5">Kelola inventaris laptop Anda</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={exportToExcel}
                                className="inline-flex items-center gap-1.5 bg-white text-gray-600 border border-gray-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition shadow-sm"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export Excel
                            </button>
                            <button
                                onClick={openCreate}
                                className="inline-flex items-center gap-1.5 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition shadow-sm"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Tambah Laptop
                            </button>
                        </div>
                    </div>

                    {/* ── Filter Bar ── */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            <div className="relative sm:col-span-2 xl:col-span-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Cari nama, brand, CPU, serial..."
                                    className="w-full pl-9 pr-3 h-10 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                            <select
                                className="h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                            >
                                <option value="ALL">Semua Status</option>
                                <option value="SIAP_JUAL">Siap Jual</option>
                                <option value="BELUM_SIAP">Belum Siap</option>
                                <option value="SERVICE">Service</option>
                            </select>
                            <select
                                className="h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
                                value={filterBrand}
                                onChange={e => setFilterBrand(e.target.value)}
                            >
                                {uniqueBrands.map(b => (
                                    <option key={b} value={b}>{b === "ALL" ? "Semua Brand" : b}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => { setSearch(""); setFilterStatus("ALL"); setFilterBrand("ALL"); }}
                                className="h-10 bg-gray-100 text-gray-600 rounded-lg px-3 text-sm font-medium hover:bg-gray-200 transition"
                            >
                                Reset Filter
                            </button>
                        </div>
                    </div>

                    {/* ── Table ── */}
                    {isLoading ? (
                        <SkeletonTable />
                    ) : filteredLaptops.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-20 text-center">
                            <div className="text-3xl mb-3">💻</div>
                            <p className="text-gray-500 text-sm font-medium">Tidak ada laptop ditemukan</p>
                            <p className="text-gray-400 text-xs mt-1">Coba ubah filter atau tambah laptop baru</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50/80 border-b border-gray-100">
                                            <Th>Nama Laptop</Th>
                                            <Th>Brand</Th>
                                            <Th>Spesifikasi</Th>
                                            <Th>Serial</Th>
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
                                                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                                                    onClick={() => openDetail(item)}
                                                >
                                                    <td className="px-4 py-3.5 max-w-[200px]">
                                                        <span className="block font-medium text-gray-800 truncate group-hover:text-blue-700 transition-colors" title={item.laptop_name}>
                                                            {item.laptop_name}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                                                        {item.brand || <span className="text-gray-300">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3.5 min-w-[220px]">
                                                        <div className="flex flex-wrap gap-1">
                                                            {item.cpu && <Chip>{item.cpu}</Chip>}
                                                            {item.ram && <Chip>{item.ram}</Chip>}
                                                            {item.storage && <Chip>{item.storage}</Chip>}
                                                            {item.gpu && <Chip>{item.gpu}</Chip>}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5 font-mono text-xs text-gray-400 whitespace-nowrap">
                                                        {item.serial_number || <span className="text-gray-300">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                                                        {fmt(item.selling_price)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <span className={`font-medium ${item.qty === 0 ? "text-red-500" : "text-gray-700"}`}>
                                                            {item.qty}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        {s ? (
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.badge}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
                                                                {s.label}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs">{item.status}</span>
                                                        )}
                                                    </td>
                                                    {/* Stop propagation so row click doesn't open detail when clicking action buttons */}
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => openEdit(item)}
                                                                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(item.id)}
                                                                className="px-3 py-1.5 text-xs font-medium text-red-500 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition"
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
                                <span className="text-xs text-gray-400">
                                    Menampilkan{" "}
                                    <span className="font-medium text-gray-600">{filteredLaptops.length}</span> dari{" "}
                                    <span className="font-medium text-gray-600">{laptops.length}</span> laptop
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ────────────────────────────────────────────────────────── MODALS ── */}

            {/* Detail Modal */}
            <Modal open={modalMode === "detail"} onClose={closeModal} title="Detail Laptop" size="lg">
                {detailLoading ? (
                    <ModalSkeleton />
                ) : selectedLaptop ? (
                    <div className="space-y-5">
                        {/* Hero card */}
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-2xl flex-shrink-0">
                                💻
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 text-base leading-snug">{selectedLaptop.laptop_name}</h3>
                                <p className="text-sm text-gray-500 mt-0.5">{selectedLaptop.brand || "—"}</p>
                                <div className="flex flex-wrap gap-1.5 mt-2">
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
                            <div className="sm:text-right flex-shrink-0 pt-0.5">
                                <p className="text-xs text-gray-400">Harga Jual</p>
                                <p className="text-xl font-bold text-gray-900 mt-0.5">{fmt(selectedLaptop.selling_price)}</p>
                                <p className="text-xs text-gray-400 mt-1.5">
                                    Stok:{" "}
                                    <span className={`font-semibold ${selectedLaptop.qty === 0 ? "text-red-500" : "text-gray-700"}`}>
                                        {selectedLaptop.qty}
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Specs grid */}
                        <div>
                            <SectionLabel>Spesifikasi</SectionLabel>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {[
                                    { label: "CPU", value: selectedLaptop.cpu },
                                    { label: "RAM", value: selectedLaptop.ram },
                                    { label: "Storage", value: selectedLaptop.storage },
                                    { label: "GPU", value: selectedLaptop.gpu },
                                    { label: "Display", value: selectedLaptop.display },
                                    { label: "Serial Number", value: selectedLaptop.serial_number },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                                        <p className="text-sm font-medium text-gray-700 break-all">
                                            {value || <span className="text-gray-300 font-normal">—</span>}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Financial */}
                        <div>
                            <SectionLabel>Keuangan</SectionLabel>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                    <p className="text-xs text-gray-400 mb-0.5">Harga Modal</p>
                                    <p className="text-sm font-semibold text-gray-700">{fmt(selectedLaptop.purchase_price)}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                    <p className="text-xs text-gray-400 mb-0.5">Margin</p>
                                    <p className="text-sm font-semibold text-emerald-600">
                                        {fmt(selectedLaptop.selling_price - selectedLaptop.purchase_price)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        {(selectedLaptop.condition_note || selectedLaptop.notes) && (
                            <div>
                                <SectionLabel>Catatan</SectionLabel>
                                <div className="space-y-2">
                                    {selectedLaptop.condition_note && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                                            <p className="text-xs text-amber-600 font-semibold mb-1">Kondisi</p>
                                            <p className="text-sm text-amber-900">{selectedLaptop.condition_note}</p>
                                        </div>
                                    )}
                                    {selectedLaptop.notes && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                                            <p className="text-xs text-gray-400 font-semibold mb-1">Notes</p>
                                            <p className="text-sm text-gray-700">{selectedLaptop.notes}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-400">
                                {new Date(selectedLaptop.created_at).toLocaleDateString("id-ID", {
                                    day: "2-digit", month: "long", year: "numeric",
                                })}
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { closeModal(); setTimeout(() => openEdit(selectedLaptop), 60); }}
                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(selectedLaptop.id)}
                                    className="px-3 py-1.5 text-xs font-medium text-red-500 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition"
                                >
                                    Hapus
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </Modal>

            {/* Create Modal */}
            <Modal open={modalMode === "create"} onClose={closeModal} title="Tambah Laptop" size="md">
                <form onSubmit={handleCreate} className="space-y-4">
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
                        <FormField label="Serial Number">
                            <Input name="serial_number" placeholder="SN12345678" value={formData.serial_number} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Harga Modal">
                            <Input name="purchase_price" type="number" placeholder="0" value={formData.purchase_price} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Harga Jual" required>
                            <Input name="selling_price" type="number" placeholder="0" value={formData.selling_price} onChange={handleFormChange} required />
                        </FormField>
                        <FormField label="Stok">
                            <Input name="qty" type="number" placeholder="1" value={formData.qty} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Status">
                            <select name="status" value={formData.status} onChange={handleFormChange}
                                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition">
                                <option value="SIAP_JUAL">Siap Jual</option>
                                <option value="BELUM_SIAP">Belum Siap</option>
                                <option value="SERVICE">Service</option>
                            </select>
                        </FormField>
                    </FormGrid>
                    <FormField label="Kondisi">
                        <Input name="condition_note" placeholder="Mulus, normal pemakaian..." value={formData.condition_note} onChange={handleFormChange} />
                    </FormField>
                    <FormField label="Catatan">
                        <textarea name="notes" placeholder="Catatan tambahan..." value={formData.notes} onChange={handleFormChange} rows={2}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition resize-none" />
                    </FormField>
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={closeModal}
                            className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                            Batal
                        </button>
                        <button type="submit" disabled={formLoading}
                            className="flex-1 h-10 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                            {formLoading ? "Menyimpan..." : "Tambah Laptop"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Edit Modal */}
            <Modal open={modalMode === "edit"} onClose={closeModal} title={`Edit — ${selectedLaptop?.laptop_name || ""}`} size="md">
                <form onSubmit={handleEdit} className="space-y-4">
                    <FormGrid>
                        <FormField label="Nama Laptop" required>
                            <Input name="laptop_name" placeholder="Nama Laptop" value={formData.laptop_name} onChange={handleFormChange} required />
                        </FormField>
                        <FormField label="Brand">
                            <Input name="brand" placeholder="Brand" value={formData.brand} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="CPU">
                            <Input name="cpu" placeholder="CPU" value={formData.cpu} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="RAM">
                            <Input name="ram" placeholder="RAM" value={formData.ram} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Storage">
                            <Input name="storage" placeholder="Storage" value={formData.storage} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="GPU">
                            <Input name="gpu" placeholder="GPU" value={formData.gpu} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Display">
                            <Input name="display" placeholder="Display" value={formData.display} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Serial Number">
                            <Input name="serial_number" placeholder="Serial Number" value={formData.serial_number} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Harga Modal">
                            <Input name="purchase_price" type="number" placeholder="0" value={formData.purchase_price} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Harga Jual" required>
                            <Input name="selling_price" type="number" placeholder="0" value={formData.selling_price} onChange={handleFormChange} required />
                        </FormField>
                        <FormField label="Stok">
                            <Input name="qty" type="number" placeholder="0" value={formData.qty} onChange={handleFormChange} />
                        </FormField>
                        <FormField label="Status">
                            <select name="status" value={formData.status} onChange={handleFormChange}
                                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition">
                                <option value="SIAP_JUAL">Siap Jual</option>
                                <option value="BELUM_SIAP">Belum Siap</option>
                                <option value="SERVICE">Service</option>
                            </select>
                        </FormField>
                    </FormGrid>
                    <FormField label="Kondisi">
                        <Input name="condition_note" placeholder="Kondisi laptop" value={formData.condition_note} onChange={handleFormChange} />
                    </FormField>
                    <FormField label="Catatan">
                        <textarea name="notes" placeholder="Catatan tambahan..." value={formData.notes} onChange={handleFormChange} rows={2}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition resize-none" />
                    </FormField>
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={closeModal}
                            className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                            Batal
                        </button>
                        <button type="submit" disabled={formLoading}
                            className="flex-1 h-10 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                            {formLoading ? "Menyimpan..." : "Simpan Perubahan"}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Component
// ─────────────────────────────────────────────────────────────────────────────
function Modal({
    open, onClose, title, children, size = "md",
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    size?: "md" | "lg";
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
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={e => { if (e.target === overlayRef.current) onClose(); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

            {/* Panel */}
            <div
                className={`
          relative bg-white w-full shadow-2xl flex flex-col
          rounded-t-2xl sm:rounded-2xl
          ${size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"}
          max-h-[92dvh] sm:max-h-[88vh]
        `}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <h2 className="font-semibold text-gray-800 text-base truncate pr-4">{title}</h2>
                    <button
                        onClick={onClose}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                        aria-label="Tutup"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-5 py-5">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable helpers
// ─────────────────────────────────────────────────────────────────────────────
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={`px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
            {children}
        </th>
    );
}

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-block bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
            {children}
        </span>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{children}</p>;
}

function FormGrid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {label}
                {required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={`w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition ${className}`}
        />
    );
}

function SkeletonTable() {
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            {Array(8).fill(0).map((_, i) => (
                                <th key={i} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-16" /></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {Array(5).fill(0).map((_, r) => (
                            <tr key={r}>
                                {Array(8).fill(0).map((_, c) => (
                                    <td key={c} className="px-4 py-3.5"><div className="h-4 bg-gray-100 rounded" /></td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ModalSkeleton() {
    return (
        <div className="animate-pulse space-y-5">
            <div className="flex gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-12 h-12 bg-gray-200 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-5 bg-gray-100 rounded-full w-20 mt-2" />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {Array(6).fill(0).map((_, i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded-lg" />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
                {Array(2).fill(0).map((_, i) => (
                    <div key={i} className="h-14 bg-gray-100 rounded-lg" />
                ))}
            </div>
        </div>
    );
}