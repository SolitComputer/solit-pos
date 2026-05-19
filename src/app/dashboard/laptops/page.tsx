"use client";

import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

// Interface lengkap sesuai struktur database
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
    status: string; // "SIAP_JUAL", "BELUM_SIAP", "SERVICE"
    ready_to_sell: boolean;
    notes: string;
    created_at: string;
}

export default function Page() {
    const [laptops, setLaptops] = useState<Laptop[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filter states
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterBrand, setFilterBrand] = useState("ALL");

    useEffect(() => {
        fetchLaptops();
    }, []);

    const fetchLaptops = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/laptops");
            const result = await response.json();
            setLaptops(result.data || []);
        } catch (error) {
            console.error("Failed to fetch laptops:", error);
            setLaptops([]);
        } finally {
            setIsLoading(false);
        }
    };

    // Filter logic
    const filteredLaptops = useMemo(() => {
        let filtered = [...laptops];
        if (search.trim() !== "") {
            const term = search.toLowerCase();
            filtered = filtered.filter(
                (item) =>
                    item.laptop_name?.toLowerCase().includes(term) ||
                    item.brand?.toLowerCase().includes(term) ||
                    item.cpu?.toLowerCase().includes(term) ||
                    item.ram?.toLowerCase().includes(term) ||
                    item.storage?.toLowerCase().includes(term) ||
                    item.serial_number?.toLowerCase().includes(term)
            );
        }
        if (filterStatus !== "ALL") {
            filtered = filtered.filter((item) => item.status === filterStatus);
        }
        if (filterBrand !== "ALL") {
            filtered = filtered.filter((item) => item.brand === filterBrand);
        }
        return filtered;
    }, [laptops, search, filterStatus, filterBrand]);

    const uniqueBrands = useMemo(() => {
        const brands = new Set(laptops.map((item) => item.brand).filter(Boolean));
        return ["ALL", ...Array.from(brands)];
    }, [laptops]);

    const exportToExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Data Laptop");

        // Definisikan kolom
        worksheet.columns = [
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
            { header: "Ready to Sell", key: "ready", width: 12 },
            { header: "Notes", key: "notes", width: 30 },
            { header: "Created At", key: "created", width: 20 },
        ];

        // --- Styling header (baris 1) ---
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFE0E0E0" }, // abu-abu muda
            };
            cell.font = { bold: true, size: 11 };
            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
            };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        // --- Isi data ---
        filteredLaptops.forEach((item) => {
            const row = worksheet.addRow({
                nama: item.laptop_name,
                brand: item.brand || "",
                cpu: item.cpu || "",
                ram: item.ram || "",
                storage: item.storage || "",
                gpu: item.gpu || "",
                display: item.display || "",
                serial: item.serial_number || "",
                harga_modal: item.purchase_price || 0,
                harga_jual: item.selling_price,
                stok: item.qty,
                status: item.status,
                ready: item.ready_to_sell ? "Ya" : "Tidak",
                notes: item.notes || "",
                created: new Date(item.created_at).toLocaleString("id-ID"),
            });

            row.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: "thin" },
                    left: { style: "thin" },
                    bottom: { style: "thin" },
                    right: { style: "thin" },
                };

                const columnKey = worksheet.getColumn(colNumber).key;
                if (columnKey === "harga_modal" || columnKey === "harga_jual" || columnKey === "stok") {
                    cell.numFmt = "#,##0";
                    cell.alignment = { horizontal: "right" };
                } else if (columnKey === "status" || columnKey === "ready") {
                    cell.alignment = { horizontal: "center" };
                } else {
                    cell.alignment = { horizontal: "left", vertical: "middle" };
                }
            });
        });

        // Freeze header baris pertama
        worksheet.views = [{ state: "frozen", ySplit: 1 }];

        // Export file
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute("download", `data_laptop_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.xlsx`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDelete = async (id: string) => {
        const ok = confirm("Yakin ingin menghapus laptop?");
        if (!ok) return;
        try {
            await fetch(`/api/laptops/${id}`, { method: "DELETE" });
            fetchLaptops();
        } catch (error) {
            console.error("Delete failed:", error);
        }
    };

    // Skeleton tabel
    const TableSkeleton = () => (
        <div className="animate-pulse">
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            {Array(15).fill(0).map((_, i) => (
                                <th key={i} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-20"></div></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array(5).fill(0).map((_, rowIdx) => (
                            <tr key={rowIdx} className="border-b border-gray-100">
                                {Array(15).fill(0).map((_, colIdx) => (
                                    <td key={colIdx} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-full"></div></td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <main className="min-h-screen bg-gray-50 p-4 md:p-6">
            <div className="max-w-full mx-auto">
                {/* Header */}
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                    <h1 className="text-xl md:text-2xl font-semibold text-gray-800 tracking-tight">Data Laptop</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={exportToExcel}
                            className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1"
                        >
                            📎 Export Excel
                        </button>
                        <a
                            href="/dashboard/laptops/create"
                            className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1"
                        >
                            + Tambah Laptop
                        </a>
                    </div>
                </div>

                {/* Filter Bar (sama seperti sebelumnya) */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm mb-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <input
                            type="text"
                            placeholder="Cari nama, brand, CPU, RAM, storage, serial..."
                            className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select
                            className="border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="ALL">Semua Status</option>
                            <option value="SIAP_JUAL">Siap Jual</option>
                            <option value="BELUM_SIAP">Belum Siap</option>
                            <option value="SERVICE">Service</option>
                        </select>
                        <select
                            className="border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50"
                            value={filterBrand}
                            onChange={(e) => setFilterBrand(e.target.value)}
                        >
                            {uniqueBrands.map((brand) => (
                                <option key={brand} value={brand}>
                                    {brand === "ALL" ? "Semua Brand" : brand}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => {
                                setSearch("");
                                setFilterStatus("ALL");
                                setFilterBrand("ALL");
                            }}
                            className="bg-gray-100 text-gray-700 rounded-lg h-10 px-3 text-sm hover:bg-gray-200 transition"
                        >
                            Reset Filter
                        </button>
                    </div>
                </div>

                {/* Tabel Data Laptop */}
                {isLoading ? (
                    <TableSkeleton />
                ) : filteredLaptops.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-sm">
                        <p className="text-gray-500 text-sm">Tidak ada data laptop yang sesuai filter</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brand</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPU</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RAM</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Storage</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GPU</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Display</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Serial</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harga Jual</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stok</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ready</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredLaptops.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50 transition">
                                            <td className="px-4 py-3 font-medium text-gray-800">{item.laptop_name}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.brand || "-"}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.cpu || "-"}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.ram || "-"}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.storage || "-"}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.gpu || "-"}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.display || "-"}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs font-mono">{item.serial_number || "-"}</td>
                                            <td className="px-4 py-3 text-right font-medium text-gray-800">
                                                Rp {item.selling_price?.toLocaleString("id-ID")}
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-700">{item.qty}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${item.status === "SIAP_JUAL" ? "bg-gray-100 text-gray-700" :
                                                    item.status === "BELUM_SIAP" ? "bg-gray-100 text-gray-500" :
                                                        "bg-gray-100 text-gray-600"
                                                    }`}>
                                                    {item.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {item.ready_to_sell ? (
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Ya</span>
                                                ) : (
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Tidak</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={item.notes || ""}>
                                                {item.notes ? (item.notes.length > 40 ? item.notes.slice(0, 40) + "..." : item.notes) : "-"}
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                                {new Date(item.created_at).toLocaleDateString("id-ID")}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <div className="flex gap-2 justify-end">
                                                    <a href={`/dashboard/laptops/edit/${item.id}`} className="bg-white text-gray-600 border border-gray-200 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-gray-50 transition">Edit</a>
                                                    <button onClick={() => handleDelete(item.id)} className="bg-white text-red-500 border border-red-200 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-red-50 transition">Hapus</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500 bg-gray-50/30">
                            Menampilkan {filteredLaptops.length} dari {laptops.length} laptop
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}