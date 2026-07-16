"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";

export interface PickableLaptop {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    selling_price: number;
}

interface RawLaptop {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    selling_price: number | string;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

export default function LaptopPickerModal({
    title = "Pilih Laptop",
    onClose,
    onSelect,
}: {
    title?: string;
    onClose: () => void;
    onSelect: (laptop: PickableLaptop) => void;
}) {
    const [laptops, setLaptops] = useState<PickableLaptop[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetch("/api/laptops")
            .then(r => r.json())
            .then(r => {
                const normalized: PickableLaptop[] = (r.data || []).map((l: RawLaptop) => ({
                    id: l.id,
                    laptop_name: l.laptop_name,
                    brand: l.brand,
                    cpu: l.cpu,
                    ram: l.ram,
                    storage: l.storage,
                    selling_price: Math.round(Number(l.selling_price) || 0),
                }));
                setLaptops(normalized);
            })
            .catch(() => setLaptops([]))
            .finally(() => setIsLoading(false));
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return laptops;
        const t = search.toLowerCase();
        return laptops.filter(l =>
            l.laptop_name?.toLowerCase().includes(t) ||
            l.brand?.toLowerCase().includes(t) ||
            l.cpu?.toLowerCase().includes(t)
        );
    }, [laptops, search]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85dvh] sm:max-h-[80vh] sm:mx-4 overflow-hidden">

                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-gray-800 text-base">{title}</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Cari dan pilih laptop terlebih dahulu</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-5 pt-4 flex-shrink-0">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            autoFocus
                            placeholder="Cari nama, brand, atau CPU laptop..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                        />
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2 overscroll-contain">
                    {isLoading ? (
                        [...Array(4)].map((_, i) => (
                            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                        ))
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="flex justify-center mb-2 opacity-50"><Inbox className="w-8 h-8" /></div>
                            <p className="text-gray-500 text-sm font-medium">Laptop tidak ditemukan</p>
                            <p className="text-gray-400 text-xs mt-1">Coba kata kunci lain</p>
                        </div>
                    ) : (
                        filtered.map(l => (
                            <button
                                key={l.id}
                                onClick={() => onSelect(l)}
                                className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-[#1a1a2e]/30 hover:bg-gray-50 transition flex items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{l.laptop_name}</p>
                                    <p className="text-xs text-gray-400 truncate">
                                        {[l.brand, l.cpu, l.ram, l.storage].filter(Boolean).join(" · ") || "—"}
                                    </p>
                                </div>
                                <span className="text-xs font-semibold text-gray-600 whitespace-nowrap tabular-nums">
                                    {fmt(l.selling_price)}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
