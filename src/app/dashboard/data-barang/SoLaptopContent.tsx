"use client";

import { useEffect, useState, useMemo, useCallback, useDeferredValue } from "react";
import { toast } from "sonner";
import { Search, X, History as HistoryIcon } from "lucide-react";
import { getAuthUser } from "@/hooks/useAuthUser";
import {
    UserRole, hasAnyRole,
    SO_ROLES, SO_LIMITED_USER_IDS,
} from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — khusus tab SO Laptop (per-unit view)
// ═══════════════════════════════════════════════════════════════════════════
interface SoUnitRow {
    unit_id: string;
    laptop_id: string;
    serial_number: string;
    laptop_name: string;
    brand: string | null;
    status: string;
    so_at: string | null;
    so_by: string | null;
    is_so_active: boolean;
    created_at: string | null; // Dipakai untuk sort unit lama → baru
}

interface LaptopUnitLite {
    id: string;
    serial_number: string;
    status: string;
    so_at?: string | null;
    so_by?: string | null;
    created_at?: string | null;
}

// Tipe entry riwayat SO (per-unit). Shape disamakan dengan yang dipakai
// HistoryModal di UnifiedBarangContent.tsx supaya konsisten antar halaman.
interface HistoryEntry {
    id: string;
    action: string;   // "Ditandai sudah SO" / "SO dibatalkan" / "SO Ulang"
    by: string;       // nama user yang melakukan aksi (so_by)
    at: string;       // ISO datetime (so_at)
    notes?: string | null;
}

interface LaptopRaw {
    id: string;
    laptop_name: string;
    brand: string | null;
    archived_at?: string | null;
    laptop_units?: LaptopUnitLite[];
}

// ═══════════════════════════════════════════════════════════════════════════
// KONSTANTA & HELPERS — disamakan dengan UnifiedBarangContent.tsx supaya
// kalkulasi "unit aktif" & "SO aktif" konsisten antar halaman.
// ═══════════════════════════════════════════════════════════════════════════
const OUT_STATUSES = new Set([
    "SOLD", "TERJUAL", "KELUAR", "RETURNED", "RESERVED", "HELD", "PACKING", "PENDING",
]);

const STATUS_UNIT_LABEL: Record<string, string> = {
    SIAP_JUAL: "Siap Jual",
    TERSEDIA: "Siap Jual",
    READY: "Siap Jual",
    BELUM_SIAP: "Belum Siap Jual",
    MINUS_SIAP_JUAL: "Minus Siap Jual",
    SERVICE: "Service",
    DALAM_PENYIAPAN: "Dalam Penyiapan",
};
const statusUnitLabel = (s: string) => STATUS_UNIT_LABEL[s] ?? s;

// SO aktif = so_at terisi DAN BUKAN sentinel reset (2000-01-01).
// Pola persis sama dengan isUnitSoActive() di UnifiedBarangContent.tsx.
const isUnitSoActive = (soAt?: string | null): boolean => {
    if (!soAt) return false;
    return soAt > "2001-01-01";
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function SoLaptopContent() {
    const [rows, setRows] = useState<SoUnitRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const [userId, setUserId] = useState<string | null>(null);
    const [soingUnitId, setSoingUnitId] = useState<string | null>(null);

    // Filter state
    const [search, setSearch] = useState("");
    const [soStatusFilter, setSoStatusFilter] = useState<"ALL" | "SO" | "BELUM">("ALL");
    const [unitStatusFilter, setUnitStatusFilter] = useState<string>("ALL");

    // State Riwayat SO:
    // historyTarget   = unit yang sedang dibuka modal riwayatnya (null = tertutup)
    // historyEntries  = daftar entry riwayat dari endpoint
    // historyLoading  = indikator fetch
    // historySearch   = search box di dalam modal riwayat (filter by nama user / notes)
    const [historyTarget, setHistoryTarget] = useState<SoUnitRow | null>(null);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historySearch, setHistorySearch] = useState("");

    // Input tetap responsif — proses filter berat pakai nilai yang ditunda.
    const deferredSearch = useDeferredValue(search);

    // Permission GLOBAL: role di SO_ROLES bebas SO apa saja; akun di
    // SO_LIMITED_USER_IDS juga boleh TAPI terbatas per-unit (lihat canSoRow).
    const isFullSoRole = useMemo(
        () => hasAnyRole(userRoles, SO_ROLES),
        [userRoles],
    );
    const isLimitedSoUser = useMemo(
        () => SO_LIMITED_USER_IDS.includes(userId ?? ""),
        [userId],
    );
    const canManageSo = isFullSoRole || isLimitedSoUser;

    // Permission PER-ROW: endpoint /api/units/[id]/so cuma mengizinkan user
    // SO_LIMITED_USER_IDS menandai SO di unit SIAP_JUAL saja. Kita mirror
    // aturan itu di client biar tombol "Tandai SO" di baris non-SIAP_JUAL
    // langsung di-disable — mencegah toast error 403 setelah klik.
    // Catatan: field `is_price_complete` tidak ikut kita fetch di tab ini
    // supaya payload tetap ringan. Kalau di masa depan perlu akurat 100%,
    // tambah `is_price_complete` di SoUnitRow + ikutkan di normalizer.
    const canSoRow = useCallback((row: SoUnitRow) => {
        if (isFullSoRole) return true;
        if (isLimitedSoUser) return row.status === "SIAP_JUAL";
        return false;
    }, [isFullSoRole, isLimitedSoUser]);

    // ── Fetch semua laptop + units, lalu di-flatten jadi per-unit row ──────
    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/laptops");
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal memuat");

            const list: LaptopRaw[] = (json.data ?? []).filter((l: LaptopRaw) => !l.archived_at);
            const flattened: SoUnitRow[] = [];

            list.forEach(l => {
                (l.laptop_units ?? [])
                    .filter(u => !OUT_STATUSES.has(u.status))
                    .forEach(u => {
                        flattened.push({
                            unit_id: u.id,
                            laptop_id: l.id,
                            serial_number: u.serial_number,
                            laptop_name: l.laptop_name,
                            brand: l.brand,
                            status: u.status,
                            so_at: u.so_at ?? null,
                            so_by: u.so_by ?? null,
                            is_so_active: isUnitSoActive(u.so_at),
                            created_at: u.created_at ?? null,
                        });
                    });
            });

            setRows(flattened);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal memuat data unit");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    useEffect(() => {
        (async () => {
            try {
                const u = await getAuthUser();
                const roles: string[] = Array.isArray((u as any)?.roles) && (u as any).roles.length > 0
                    ? (u as any).roles : u?.role ? [u.role] : [];
                setUserRoles(roles as UserRole[]);
                setUserId((u as any)?.id ?? null);
            } catch { setUserRoles([]); }
        })();
    }, []);

    // Fetch riwayat SO per-unit saat modal dibuka.
    // Pola sama persis dengan HistoryModal di UnifiedBarangContent.tsx —
    // endpoint return { data: { history: [...] } }, lalu kita map ke shape
    // HistoryEntry (action, by, at, notes).
    useEffect(() => {
        if (!historyTarget) return;
        setHistoryLoading(true);
        setHistorySearch(""); // reset search tiap kali buka unit baru
        (async () => {
            try {
                const res = await fetch(`/api/units/${historyTarget.unit_id}/so`);
                const json = await res.json();
                const raw = json.data?.history ?? [];
                const mapped: HistoryEntry[] = raw.map((h: any) => ({
                    id: h.id,
                    // Mirror label dari UnifiedBarangContent — konsisten antar halaman.
                    // "SO Ulang" dideteksi dari notes (ditulis oleh endpoint /api/laptops/[id]/so).
                    action: h.action === "SO"
                        ? (typeof h.notes === "string" && h.notes.includes("SO Ulang") ? "SO Ulang" : "Ditandai sudah SO")
                        : "SO dibatalkan",
                    by: h.so_by,
                    at: h.so_at,
                    notes: h.notes ?? null,
                }));
                setHistoryEntries(mapped);
            } catch {
                setHistoryEntries([]);
            } finally {
                setHistoryLoading(false);
            }
        })();
    }, [historyTarget]);

    // Filter entries berdasarkan search di modal.
    // Match terhadap nama user (by), action, dan notes.
    const filteredHistory = useMemo(() => {
        if (!historySearch.trim()) return historyEntries;
        const t = historySearch.toLowerCase();
        return historyEntries.filter(h =>
            h.by.toLowerCase().includes(t) ||
            h.action.toLowerCase().includes(t) ||
            (h.notes?.toLowerCase().includes(t) ?? false)
        );
    }, [historyEntries, historySearch]);

    // Opsi status unit yang MUNCUL di dropdown — hanya status yang beneran ada
    // di data saat ini (bukan hardcoded), biar nggak ada opsi kosong.
    const unitStatusOptions = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(r => set.add(r.status));
        return Array.from(set).sort();
    }, [rows]);

    const filteredRows = useMemo(() => {
        let list = rows;

        if (soStatusFilter !== "ALL") {
            list = list.filter(r => soStatusFilter === "SO" ? r.is_so_active : !r.is_so_active);
        }

        if (unitStatusFilter !== "ALL") {
            list = list.filter(r => r.status === unitStatusFilter);
        }

        if (deferredSearch.trim()) {
            const t = deferredSearch.toLowerCase();
            list = list.filter(r =>
                r.serial_number.toLowerCase().includes(t) ||
                r.laptop_name.toLowerCase().includes(t) ||
                (r.brand?.toLowerCase().includes(t) ?? false)
            );
        }

        // ═══════════════════════════════════════════════════════════════════
        // SORT MURNI: Unit paling LAMA masuk di atas → paling BARU di bawah.
        // Tidak ada prioritas status SO lagi — semua unit (Belum SO & Sudah
        // SO) tercampur sesuai urutan tanggal masuk. Ini sesuai requirement
        // user: "urutan SN lama ke SN baru".
        //
        // Pakai created_at (bukan string SN) karena SN tidak selalu urut
        // sesuai tanggal masuk — kadang SN besar justru barang lama,
        // tergantung pola penomoran per batch. Fallback ke SN numerik hanya
        // kalau created_at kosong / sama persis (edge case bulk insert).
        // ═══════════════════════════════════════════════════════════════════
        return [...list].sort((a, b) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (timeA !== timeB) return timeA - timeB; // lama → baru
            return a.serial_number.localeCompare(b.serial_number, "id-ID", { numeric: true });
        });
    }, [rows, soStatusFilter, unitStatusFilter, deferredSearch]);

    // ── Toggle SO per-unit ───────────────────────────────────────────────────
    const toggleUnitSo = async (row: SoUnitRow) => {
        // Cek per-row, bukan cuma global canManageSo. Alasan: user di
        // SO_LIMITED_USER_IDS cuma boleh SO unit SIAP_JUAL. Kalau masih pakai
        // canManageSo, user limited bisa bypass tombol disabled lewat devtools
        // → kirim PATCH ke unit BELUM_SIAP → server reject 403 → UX jelek.
        // Guard final tetap ada di server (canSoUnit), ini cuma mirror.
        if (!canSoRow(row)) return;
        setSoingUnitId(row.unit_id);
        try {
            const res = await fetch(`/api/units/${row.unit_id}/so`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes: "" }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal update SO");

            // Update lokal supaya UI langsung refresh tanpa refetch full.
            setRows(prev => prev.map(r =>
                r.unit_id === row.unit_id
                    ? {
                        ...r,
                        so_at: json.data.so_at,
                        so_by: json.data.so_by,
                        is_so_active: isUnitSoActive(json.data.so_at),
                    }
                    : r
            ));
            toast.success(row.is_so_active ? "Status SO diperbarui (SO Ulang)" : "Unit ditandai Sudah SO");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal update SO");
        } finally {
            setSoingUnitId(null);
        }
    };

    const stats = useMemo(() => {
        const sudah = rows.filter(r => r.is_so_active).length;
        return { sudah, belum: rows.length - sudah, total: rows.length };
    }, [rows]);

    const resetFilter = () => {
        setSearch("");
        setSoStatusFilter("ALL");
        setUnitStatusFilter("ALL");
    };

    const hasFilter = search.trim() !== "" || soStatusFilter !== "ALL" || unitStatusFilter !== "ALL";

    return (
        <main className="min-h-screen bg-zinc-50 p-3 sm:p-6 lg:p-8">
            <div className="max-w-full mx-auto space-y-4 sm:space-y-5">

                {/* ── HEADER + STATS ── */}
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h2 className="text-base font-bold text-zinc-900">SO Laptop (Per Unit)</h2>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                Daftar seluruh unit laptop aktif beserta status SO-nya. Urut dari unit yang paling lama masuk ke yang terbaru.
                            </p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <StatBox label="Sudah SO" value={stats.sudah} tone="emerald" />
                            <StatBox label="Belum SO" value={stats.belum} tone="red" />
                            <StatBox label="Total" value={stats.total} tone="zinc" />
                        </div>
                    </div>
                </div>

                {/* ── FILTER ── */}
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3 sm:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        <div className="relative sm:col-span-5">
                            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                            <input
                                className="w-full h-9 pl-9 pr-8 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                                placeholder="Cari SN, nama laptop, brand..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {search && (
                                <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        <div className="sm:col-span-3">
                            <select
                                className="w-full h-9 px-3 border border-zinc-200 rounded-xl text-xs bg-zinc-50 text-zinc-700 font-medium"
                                value={soStatusFilter}
                                onChange={e => setSoStatusFilter(e.target.value as "ALL" | "SO" | "BELUM")}
                            >
                                <option value="ALL">Semua Status SO</option>
                                <option value="BELUM">Belum SO</option>
                                <option value="SO">Sudah SO</option>
                            </select>
                        </div>
                        <div className="sm:col-span-3">
                            <select
                                className="w-full h-9 px-3 border border-zinc-200 rounded-xl text-xs bg-zinc-50 text-zinc-700 font-medium"
                                value={unitStatusFilter}
                                onChange={e => setUnitStatusFilter(e.target.value)}
                            >
                                <option value="ALL">Semua Status Unit</option>
                                {unitStatusOptions.map(s => (
                                    <option key={s} value={s}>{statusUnitLabel(s)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sm:col-span-1">
                            <button
                                onClick={resetFilter}
                                disabled={!hasFilter}
                                className="w-full h-9 px-3 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-medium hover:bg-zinc-200 disabled:opacity-40 transition flex items-center justify-center gap-1.5"
                                title="Reset Filter"
                            >
                                <X className="w-3.5 h-3.5" />
                                <span className="sm:hidden">Reset</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── TABEL / DAFTAR UNIT ── */}
                {loading ? (
                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm py-16 text-center text-sm text-zinc-400">
                        Memuat data unit...
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm py-16 text-center px-4">
                        <p className="text-zinc-700 font-bold text-base">Tidak ada unit ditemukan</p>
                        <p className="text-zinc-400 text-sm mt-1">Coba ubah filter atau tambah unit laptop baru</p>
                    </div>
                ) : (
                    <>
                        {/* ── MOBILE / TABLET ── */}
                        <div className="lg:hidden space-y-2.5">
                            {filteredRows.map((row, idx) => (
                                <div key={row.unit_id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3.5 space-y-2.5">
                                    <div className="flex items-start justify-between gap-2.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">#{idx + 1} · SN</p>
                                            <p className="text-sm font-black text-zinc-900 tabular-nums mt-0.5">{row.serial_number}</p>
                                            <p className="text-[12px] text-zinc-700 mt-1 line-clamp-2" title={row.laptop_name}>{row.laptop_name}</p>
                                            {row.brand && <p className="text-[11px] text-zinc-400 mt-0.5">{row.brand}</p>}
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            <SoStatusBadge active={row.is_so_active} />
                                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-zinc-100 text-zinc-600 border border-zinc-200 whitespace-nowrap">
                                                {statusUnitLabel(row.status)}
                                            </span>
                                        </div>
                                    </div>

                                    {row.so_by && (
                                        <div className="text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-1.5">
                                            <span className="font-semibold">{row.so_by}</span>
                                            {row.so_at && (
                                                <span className="text-zinc-400">
                                                    {" · "}
                                                    {new Date(row.so_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Baris tombol aksi — Tandai SO + Riwayat SO side by side */}
                                    <div className="flex items-stretch gap-2">
                                        {canSoRow(row) && (
                                            <button
                                                onClick={() => toggleUnitSo(row)}
                                                disabled={soingUnitId === row.unit_id}
                                                className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition disabled:opacity-40 ${row.is_so_active ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
                                            >
                                                {soingUnitId === row.unit_id ? "Memproses..." : row.is_so_active ? "SO Ulang" : "Tandai Sudah SO"}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setHistoryTarget(row)}
                                            title="Lihat riwayat SO"
                                            className={`${canManageSo ? "w-10" : "w-full"} h-9 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800 transition`}
                                        >
                                            <HistoryIcon size={14} />
                                            {!canManageSo && <span className="ml-1.5 text-xs font-semibold">Riwayat SO</span>}
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <p className="text-center text-xs text-zinc-400 pt-1">
                                <span className="text-zinc-700 font-bold">{filteredRows.length}</span> unit ditampilkan
                            </p>
                        </div>

                        {/* ── DESKTOP ── */}
                        <div className="hidden lg:block bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                            <div className="overflow-auto max-h-[75vh]">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="whitespace-nowrap">
                                            {["No", "SN", "Nama Laptop", "Brand", "Status Unit", "Status SO", "SO oleh", "Aksi"].map(h => (
                                                <th key={h} className="px-3 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-left bg-zinc-50 border-b-2 border-zinc-100 sticky top-0 z-10">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRows.map((row, idx) => {
                                            const zebra = idx % 2 === 1;
                                            return (
                                                <tr key={row.unit_id} className={`border-b border-zinc-50 hover:bg-zinc-100 transition-colors ${zebra ? "bg-zinc-50" : "bg-white"}`}>
                                                    <td className="px-3 py-3 text-xs text-zinc-400 tabular-nums">{idx + 1}</td>
                                                    <td className="px-3 py-3 text-xs font-bold text-zinc-800 whitespace-nowrap tabular-nums">{row.serial_number}</td>
                                                    <td className="px-3 py-3 text-xs text-zinc-700 max-w-[260px] truncate" title={row.laptop_name}>{row.laptop_name}</td>
                                                    <td className="px-3 py-3 text-xs text-zinc-500">{row.brand || <span className="text-zinc-300">-</span>}</td>
                                                    <td className="px-3 py-3">
                                                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-zinc-100 text-zinc-600 border border-zinc-200 whitespace-nowrap">
                                                            {statusUnitLabel(row.status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <SoStatusBadge active={row.is_so_active} />
                                                    </td>
                                                    <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">
                                                        {row.so_by ? (
                                                            <div>
                                                                <p className="font-semibold text-zinc-700">{row.so_by}</p>
                                                                {row.so_at && (
                                                                    <p className="text-[10px] text-zinc-400">
                                                                        {new Date(row.so_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ) : <span className="text-zinc-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex items-center gap-1.5">
                                                            {canSoRow(row) && (
                                                                <button
                                                                    onClick={() => toggleUnitSo(row)}
                                                                    disabled={soingUnitId === row.unit_id}
                                                                    className={`h-7 px-3 rounded-lg text-[11px] font-semibold border transition disabled:opacity-40 ${row.is_so_active ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
                                                                >
                                                                    {soingUnitId === row.unit_id ? "..." : row.is_so_active ? "SO Ulang" : "Tandai SO"}
                                                                </button>
                                                            )}
                                                            {/* Tombol riwayat SO per-unit */}
                                                            <button
                                                                onClick={() => setHistoryTarget(row)}
                                                                title="Lihat riwayat SO unit ini"
                                                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition"
                                                            >
                                                                <HistoryIcon size={13} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 text-xs text-zinc-400 flex items-center justify-between gap-3">
                                <span>
                                    <span className="text-zinc-700 font-bold">{filteredRows.length}</span> unit ditampilkan dari {rows.length} total
                                </span>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Modal Riwayat SO per-unit */}
            {historyTarget && (
                <HistorySoModal
                    unit={historyTarget}
                    entries={filteredHistory}
                    totalEntries={historyEntries.length}
                    loading={historyLoading}
                    search={historySearch}
                    onSearchChange={setHistorySearch}
                    onClose={() => setHistoryTarget(null)}
                />
            )}

            {/* Style modal animations — reuse pattern dari UnifiedBarangContent */}
            <style>{`
                @keyframes fadeIn { from{opacity:0} to{opacity:1} }
                @keyframes popIn  { from{opacity:0;transform:scale(0.94) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
                .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
                .animate-popIn  { animation: popIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
            `}</style>
        </main>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Modal Riwayat SO per-unit — pola sama dengan HistoryModal di
// UnifiedBarangContent.tsx, tapi plus search box di dalam list.
// ═══════════════════════════════════════════════════════════════════════════
function HistorySoModal({
    unit, entries, totalEntries, loading, search, onSearchChange, onClose,
}: {
    unit: SoUnitRow;
    entries: HistoryEntry[];
    totalEntries: number;
    loading: boolean;
    search: string;
    onSearchChange: (v: string) => void;
    onClose: () => void;
}) {
    // ESC → tutup. Pola standar supaya UX konsisten dengan modal lain.
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-zinc-400 via-zinc-700 to-black flex-shrink-0" />
                <div className="px-5 py-4 border-b border-zinc-100 flex-shrink-0">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Riwayat SO</p>
                    <h3 className="text-sm font-bold text-zinc-900 truncate mt-0.5">{unit.laptop_name}</h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                        SN: <span className="font-semibold text-zinc-700">{unit.serial_number}</span>
                    </p>
                </div>

                {/* Search box — filter by nama user / action / notes */}
                <div className="px-5 py-3 border-b border-zinc-100 flex-shrink-0">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                        <input
                            autoFocus
                            value={search}
                            onChange={e => onSearchChange(e.target.value)}
                            placeholder="Cari nama user, aksi, atau catatan..."
                            className="w-full h-9 pl-8 pr-8 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                        />
                        {search && (
                            <button onClick={() => onSearchChange("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {search && (
                        <p className="text-[10px] text-zinc-400 mt-1.5 tabular-nums">
                            {entries.length} dari {totalEntries} entri cocok
                        </p>
                    )}
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4">
                    {loading ? (
                        <p className="text-sm text-zinc-400 text-center py-6">Memuat...</p>
                    ) : entries.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-6">
                            {search ? "Tidak ada entri cocok dengan pencarian" : "Belum ada riwayat SO untuk unit ini"}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {entries.map(h => (
                                <li key={h.id} className="bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5">
                                    <p className="text-xs font-semibold text-zinc-700">{h.action}</p>
                                    {h.notes && <p className="text-[11px] text-zinc-600 italic mt-1">"{h.notes}"</p>}
                                    <p className="text-[11px] text-zinc-400 mt-0.5">
                                        <span className="font-semibold text-zinc-600">{h.by}</span>
                                        {" · "}
                                        {new Date(h.at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-zinc-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-10 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-komponen ringan
// ═══════════════════════════════════════════════════════════════════════════
function StatBox({ label, value, tone }: { label: string; value: number; tone: "emerald" | "red" | "zinc" }) {
    const cls: Record<string, string> = {
        emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
        red: "bg-red-50 border-red-200 text-red-700",
        zinc: "bg-zinc-100 border-zinc-200 text-zinc-800",
    };
    const labelCls: Record<string, string> = {
        emerald: "text-emerald-500",
        red: "text-red-500",
        zinc: "text-zinc-500",
    };
    return (
        <div className={`px-3 py-1.5 border rounded-xl ${cls[tone]}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${labelCls[tone]}`}>{label}</p>
            <p className="text-sm font-black tabular-nums">{value}</p>
        </div>
    );
}

function SoStatusBadge({ active }: { active: boolean }) {
    return (
        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
            {active ? "✓ Sudah SO" : "Belum SO"}
        </span>
    );
}