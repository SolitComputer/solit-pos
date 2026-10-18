"use client";
// src/app/dashboard/data-barang/ArsipContent.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAuthUser } from "@/hooks/useAuthUser";
import { UserRole, hasAnyRole, BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";

type ItemType = "LAPTOP" | "AKSESORIS";

interface ArchivedRow {
    id: string;
    tipe: ItemType;
    nama: string;
    kategori: string | null;
    brand: string | null;
    harga_jual: number;
    archived_at: string;
    archived_by: string | null;
    archive_reason: string | null;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

// Badge alasan arsip: TRANSAKSI (otomatis dari penjualan) vs MANUAL (klik tombol).
function ReasonBadge({ reason }: { reason: string | null }) {
    if (reason === "TRANSAKSI") {
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-zinc-900 text-white">Transaksi</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200">Manual</span>;
}

export default function ArsipContent() {
    const [rows, setRows] = useState<ArchivedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);

    const canManage = hasAnyRole(userRoles, BARANG_FULL_ACCESS_ROLES);

    useEffect(() => {
        (async () => {
            try {
                const u = await getAuthUser();
                const roles: string[] = Array.isArray((u as any)?.roles) && (u as any).roles.length > 0
                    ? (u as any).roles : u?.role ? [u.role] : [];
                setUserRoles(roles as UserRole[]);
            } catch { setUserRoles([]); }
        })();
    }, []);

    // Ambil dua endpoint yang SAMA dengan Data Barang, lalu saring HANYA yang
    // archived_at terisi. limit=9999 di aksesoris meniru UnifiedBarangContent
    // supaya tidak kepotong paginasi default (20).
    const loadArchived = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [lapRes, accRes] = await Promise.all([
                fetch("/api/laptops"),
                fetch("/api/accessories?page=1&limit=9999"),
            ]);
            const lapJson = await lapRes.json();
            const accJson = await accRes.json();

            const laptopRows: ArchivedRow[] = (lapJson.success ? lapJson.data : [])
                .filter((l: any) => l.archived_at)
                .map((l: any) => ({
                    id: l.id, tipe: "LAPTOP" as const, nama: l.laptop_name,
                    kategori: l.category_name ?? null, brand: l.brand || null,
                    harga_jual: l.selling_price || 0,
                    archived_at: l.archived_at, archived_by: l.archived_by ?? null,
                    archive_reason: l.archive_reason ?? null,
                }));

            const accRows: ArchivedRow[] = (accJson.success ? accJson.data : [])
                .filter((a: any) => a.archived_at)
                .map((a: any) => ({
                    id: a.id, tipe: "AKSESORIS" as const, nama: a.name,
                    kategori: a.category ?? null, brand: a.brand || null,
                    harga_jual: a.sell_price || 0,
                    archived_at: a.archived_at, archived_by: a.archived_by ?? null,
                    archive_reason: a.archive_reason ?? null,
                }));

            const merged = [...laptopRows, ...accRows].sort(
                (a, b) => new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
            );
            setRows(merged);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat arsip");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadArchived(); }, [loadArchived]);

    // Restore — balik ke Data Barang (archived_at = null di backend).
    const restore = async (row: ArchivedRow) => {
        setRestoringId(row.id);
        try {
            const url = row.tipe === "LAPTOP" ? `/api/laptops/${row.id}/archive` : `/api/accessories/${row.id}/archive`;
            const res = await fetch(url, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived: false }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal mengembalikan barang");
            setRows(prev => prev.filter(r => !(r.id === row.id && r.tipe === row.tipe)));
            toast.success("Barang dikembalikan ke Data Barang");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal mengembalikan barang");
        } finally {
            setRestoringId(null);
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r =>
            r.nama.toLowerCase().includes(q) ||
            (r.brand || "").toLowerCase().includes(q) ||
            (r.kategori || "").toLowerCase().includes(q)
        );
    }, [rows, search]);

    return (
        <div>
            {/* Sub-header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-xl flex items-center justify-center shadow-md shadow-zinc-900/25 flex-shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="4" rx="1" />
                            <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                            <line x1="9" y1="12" x2="15" y2="12" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 leading-tight">Arsip Barang</h2>
                        <p className="text-[12px] text-gray-400">Barang yang stoknya habis karena transaksi atau diarsipkan manual</p>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Cari nama, brand, kategori..."
                        className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    />
                </div>
                <p className="mt-2.5 text-[12px] text-gray-400">{filtered.length} dari {rows.length} barang terarsip</p>
            </div>

            {/* Konten */}
            {loading ? (
                <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
                    <p className="text-sm text-red-600 font-medium mb-3">{error}</p>
                    <button onClick={loadArchived} className="text-sm font-semibold text-red-700 underline underline-offset-2">Coba lagi</button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
                    <p className="text-sm text-gray-500 font-medium">
                        {rows.length === 0 ? "Belum ada barang di arsip." : "Tidak ada barang yang cocok dengan pencarian."}
                    </p>
                </div>
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                    <div className="overflow-x-auto max-h-[calc(100dvh-240px)] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">No</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Nama Barang</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Kategori</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Merk</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-right font-semibold px-4 py-3">Harga Jual</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-center font-semibold px-4 py-3">Alasan</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Diarsipkan</th>
                                    {canManage && <th className="sticky top-0 z-20 bg-gray-50 text-center font-semibold px-4 py-3">Aksi</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((row, i) => (
                                    <tr key={`${row.tipe}-${row.id}`} className="hover:bg-gray-50/60 transition">
                                        <td className="px-4 py-3 text-gray-400 tabular-nums">{String(i + 1).padStart(2, "0")}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ${row.tipe === "LAPTOP" ? "bg-zinc-900 text-white border-zinc-900" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                                                    {row.tipe === "LAPTOP" ? "Laptop" : "Aksesoris"}
                                                </span>
                                                <span className="font-medium text-gray-800">{row.nama}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{row.kategori || <span className="text-gray-300">—</span>}</td>
                                        <td className="px-4 py-3 text-gray-600">{row.brand || <span className="text-gray-300">—</span>}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium">{fmt(row.harga_jual)}</td>
                                        <td className="px-4 py-3 text-center"><ReasonBadge reason={row.archive_reason} /></td>
                                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap tabular-nums">
                                            {formatDate(row.archived_at)}
                                            {row.archived_by && <span className="text-gray-300"> · {row.archived_by}</span>}
                                        </td>
                                        {canManage && (
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => restore(row)}
                                                    disabled={restoringId === row.id}
                                                    title="Kembalikan ke Data Barang"
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition
                                                        bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100
                                                        ${restoringId === row.id ? "opacity-50 cursor-wait" : "cursor-pointer active:scale-95"}`}
                                                >
                                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <polyline points="1 4 1 10 7 10" />
                                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                                    </svg>
                                                    {restoringId === row.id ? "..." : "Kembalikan"}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}