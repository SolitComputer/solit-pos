"use client";

import { useState } from "react";
import { useRegisterOverlay } from "@/contexts/OverlayContext";

export interface CreatedLaptop {
    id: string;
    laptop_name: string;
    [key: string]: unknown;
}

export default function AddLaptopModal({
    onClose,
    onSuccess,
}: {
    onClose: () => void;
    onSuccess: (laptop: CreatedLaptop) => void;
}) {
    useRegisterOverlay();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState({
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
        qty: 1,
        status: "SIAP_JUAL",
        condition_note: "",
        notes: "",
    });

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            setLoading(true);
            const response = await fetch("/api/laptops/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    purchase_price: Number(form.purchase_price),
                    selling_price: Number(form.selling_price),
                    qty: Number(form.qty),
                }),
            });
            const result = await response.json();
            if (!result.success) {
                setError(result.message || "Gagal menambahkan laptop");
                return;
            }
            onSuccess(result.data);
            onClose();
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh] sm:mx-4 overflow-hidden">

                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-gray-800 text-base">Tambah Laptop</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Daftarkan model laptop baru</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4">
                    <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-3">
                        <input
                            type="text"
                            name="laptop_name"
                            placeholder="Nama Laptop"
                            value={form.laptop_name}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="brand"
                            placeholder="Brand"
                            value={form.brand}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="cpu"
                            placeholder="CPU"
                            value={form.cpu}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="ram"
                            placeholder="RAM"
                            value={form.ram}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="storage"
                            placeholder="Storage"
                            value={form.storage}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="gpu"
                            placeholder="GPU"
                            value={form.gpu}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="display"
                            placeholder="Display"
                            value={form.display}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="serial_number"
                            placeholder="Serial Number"
                            value={form.serial_number}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="number"
                            name="purchase_price"
                            placeholder="Harga Modal"
                            value={form.purchase_price}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="number"
                            name="selling_price"
                            placeholder="Harga Jual"
                            value={form.selling_price}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="condition_note"
                            placeholder="Kondisi"
                            value={form.condition_note}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />
                        <input
                            type="text"
                            name="notes"
                            placeholder="Catatan"
                            value={form.notes}
                            onChange={handleChange}
                            className="border border-gray-200 rounded-xl h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition bg-gray-50"
                        />

                        {error && (
                            <div className="md:col-span-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                                <p className="text-xs text-red-700">{error}</p>
                            </div>
                        )}

                        <div className="md:col-span-2 flex gap-3 pt-2">
                            <button type="button" onClick={onClose} disabled={loading}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Menyimpan..." : "Tambah Laptop"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
