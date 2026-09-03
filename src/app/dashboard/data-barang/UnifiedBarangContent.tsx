"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Laptop as LaptopIcon, Wrench, History as HistoryIcon, Filter, RotateCcw, SlidersHorizontal, ArrowUpDown, Search, X, ChevronDown, ChevronUp, Tag } from "lucide-react";
import BarcodeModal from "@/components/ui/BarcodeModal";
import AddUnitModal, { CreatedUnit } from "@/components/inventory/AddUnitModal";
import UnitDetailModal, { UnitDetailData } from "@/components/inventory/UnitDetailModal";
import AddUnitModalAccessory from "@/components/inventory/AddUnitModalAccessory";
import AccessoryUnitDetailModal, { AccessoryUnitDetailData } from "@/components/inventory/AccessoryUnitDetailModal";
import { getAuthUser } from "@/hooks/useAuthUser";
import { usePagePermission } from "@/hooks/usePagePermission";
import * as XLSX from "xlsx";
import {
      UserRole, hasAnyRole, PERMISSIONS,
    LAPTOP_DELETE_ROLES, ACCESSORY_CREATE_ROLES, ACCESSORY_EDIT_ROLES, ACCESSORY_DELETE_ROLES,
    BARANG_PRIVATE_VIEW_ROLES, BARANG_FULL_ACCESS_ROLES, SO_ROLES, SO_LIMITED_USER_IDS, canSoLaptop,
} from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
type ItemType = "LAPTOP" | "AKSESORIS";

interface LaptopUnitLite {
    id: string; serial_number: string; status: string;
    purchase_price?: number; sparepart_cost?: number;
    source?: string | null; created_at?: string;
}
interface LaptopRaw {
    id: string; laptop_name: string; category_id?: string | null; category_name?: string | null;
    brand: string; cpu: string; ram: string; storage: string; gpu: string; display: string;
    condition_note: string; selling_price: number; notes: string; created_at: string;
    audited_at?: string | null; audited_by?: string | null;
    so_at?: string | null; so_by?: string | null;
    laptop_units?: LaptopUnitLite[];
}
interface AccessoryUnitLite {
    id: string; serial_number: string; condition: string; status: string;
    buy_price?: number; selling_price?: number; created_at?: string;
}
interface AccessoryRaw {
    id: string; name: string; category: string; brand: string | null; spec: string | null;
    buy_price?: number; sell_price: number; stock: number; notes: string | null; created_at: string;
    audited_at?: string | null; audited_by?: string | null;
    accessory_units?: AccessoryUnitLite[];
}

interface UnifiedRow {
    id: string; tipe: ItemType; nama: string;
    kategori: string | null; kategori_id?: string | null;
    brand: string | null; cpu: string | null; ram: string | null; storage: string | null; spek: string | null;
    harga_modal: number | null; harga_modal_note?: string; modal_sparepart: number | null;
    harga_jual: number; total_jual: number | null; gross_profit: number | null;
    sumber: string | null; tanggal_masuk: string | null;
    sn: string | null; sn_note?: string;
    stok_tersedia: number | null; siap_jual: number | null; minus: number | null; // laptop (ST/SJ/M)
    stok: number | null; // aksesoris
    so_at: string | null; so_by: string | null;
    audited_at: string | null; audited_by: string | null;
    unit_id?: string; unit_count: number;
    raw: LaptopRaw | AccessoryRaw;
}

interface HistoryEntry { id: string; action: string; by: string; at: string; notes?: string | null }

// ═══════════════════════════════════════════════════════════════════════════
// KONSTANTA & HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const Dash = () => <span className="text-zinc-300">-</span>;

// TTL audit BEDA antara laptop (2 hari) & aksesoris (3 hari) — ini business
// rule yang SUDAH ADA masing-masing di komponen asli, disatukan di sini biar
// tabel gabungan tetap konsisten dengan behavior lama, bukan diseragamkan.
const LAPTOP_AUDIT_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const ACCESSORY_AUDIT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
function isAuditActive(row: Pick<UnifiedRow, "tipe" | "audited_at">): boolean {
    if (!row.audited_at) return false;
    const ttl = row.tipe === "LAPTOP" ? LAPTOP_AUDIT_TTL_MS : ACCESSORY_AUDIT_TTL_MS;
    return Date.now() - new Date(row.audited_at).getTime() < ttl;
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const toWibDateStr = (d: Date) => new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
const isSoActive = (soAt?: string | null) => !!soAt && toWibDateStr(new Date(soAt)) === toWibDateStr(new Date());

//  Aksesoris: tentukan aksi Unit berdasarkan row.unit_count — jumlah SN yang
//  BENERAN tercatat di accessory_units, BUKAN row.stok (angka stok manual).
//  Sengaja DIBALIKIN dari versi sebelumnya yang sempat pakai row.stok: itu
//  bikin barang generic bervolume besar (charger/RAM/HDD/mouse dst, yang
//  MEMANG diputuskan tidak perlu SN individual — lihat diskusi migrasi)
//  ikut nampilin "Kelola Unit (90)" padahal isinya kosong beneran, karena
//  90 itu cuma angka stok manual, bukan jumlah SN yang ada. Sekarang:
//  belum ada SN sama sekali → tetap "Tambah Unit" selamanya (gak masalah
//  walau stok manualnya gede), sampe user sengaja mulai isi SN-nya sendiri.
//  "units"  → sudah ada >1 SN tercatat → arahkan ke halaman Units
//  "detail" → sudah ada tepat 1 SN tercatat → buka pop-up detail unit itu
//  "add"    → belum ada SN sama sekali → buka pop-up tambah 1 unit
function getAccessoryUnitAction(row: UnifiedRow): "units" | "add" | "detail" | null {
    if (row.tipe !== "AKSESORIS") return null;
    if (row.unit_count > 1) return "units";
    if (row.unit_count === 1) return "detail";
    return "add";
}

function normalizeLaptop(l: LaptopRaw): UnifiedRow {
    const units = l.laptop_units ?? [];
    const aktif = units.filter(u => u.status !== "SOLD");
    const siapJual = aktif.filter(u => u.status === "SIAP_JUAL").length;
    const stokMinus = aktif.filter(u => u.status === "SERVICE" || u.status === "BELUM_SIAP").length;
    const dalamPenyiapan = aktif.filter(u => u.status === "DALAM_PENYIAPAN").length;
    const stokTersedia = siapJual + stokMinus + dalamPenyiapan;
    const one = aktif.length === 1 ? aktif[0] : null;
    const modals = aktif.map(u => u.purchase_price).filter((n): n is number => n != null && n > 0);
    const min = modals.length ? Math.min(...modals) : 0;
    const max = modals.length ? Math.max(...modals) : 0;
    const jt = (n: number) => (n / 1_000_000).toFixed(1).replace(".", ",");

    return {
        id: l.id, tipe: "LAPTOP", nama: l.laptop_name,
        kategori: l.category_name ?? null, kategori_id: l.category_id ?? null,
        brand: l.brand || null, cpu: l.cpu || null, ram: l.ram || null, storage: l.storage || null, spek: null,
        harga_modal: one ? (one.purchase_price ?? 0) : null,
        harga_modal_note: one ? undefined : (modals.length ? (min === max ? `Rp ${jt(min)} jt` : `Rp ${jt(min)}–${jt(max)} jt`) : undefined),
        modal_sparepart: one ? (one.sparepart_cost ?? 0) : null,
        harga_jual: l.selling_price || 0,
        total_jual: (l.selling_price || 0) * stokTersedia,
        gross_profit: null, // tabel Data Laptop asli tidak menampilkan kolom ini per-baris
        sumber: one ? (one.source ?? null) : null,
        tanggal_masuk: one ? (one.created_at ?? null) : null,
        sn: one ? one.serial_number : null,
        sn_note: one ? undefined : (aktif.length > 1 ? `${aktif.length} SN` : undefined),
        stok_tersedia: stokTersedia, siap_jual: siapJual, minus: stokMinus, stok: null,
        so_at: l.so_at ?? null, so_by: l.so_by ?? null,
        audited_at: l.audited_at ?? null, audited_by: l.audited_by ?? null,
        unit_id: one ? one.id : undefined, unit_count: aktif.length,
        raw: l,
    };
}

function normalizeAccessory(a: AccessoryRaw): UnifiedRow {
    const units = a.accessory_units ?? [];
    const aktif = units.filter(u => u.status !== "TERJUAL");
    const one = aktif.length === 1 ? aktif[0] : null;
    const margin = (a.sell_price || 0) - (a.buy_price || 0);
    return {
        id: a.id, tipe: "AKSESORIS", nama: a.name, kategori: a.category,
        brand: a.brand || null, cpu: null, ram: null, storage: null, spek: a.spec || null,
        harga_modal: one ? (one.buy_price ?? 0) : (a.buy_price ?? null), modal_sparepart: null,
        harga_jual: a.sell_price || 0, total_jual: null,
        gross_profit: a.buy_price != null && a.buy_price > 0 ? margin : null,
        sumber: null,
        tanggal_masuk: one ? (one.created_at ?? null) : null,
        sn: one ? one.serial_number : null,
        sn_note: one ? undefined : (aktif.length > 1 ? `${aktif.length} SN` : undefined),
        stok_tersedia: null, siap_jual: null, minus: null,
        stok: units.length > 0 ? aktif.length : (a.stock ?? 0),
        so_at: null, so_by: null,
        audited_at: a.audited_at ?? null, audited_by: a.audited_by ?? null,
        unit_id: one ? one.id : undefined, unit_count: aktif.length,
        raw: a,
    };
}

// Form default value
const EMPTY_LAPTOP_FORM = {
    laptop_name: "", category_id: "", brand: "", cpu: "", ram: "", storage: "",
    gpu: "", display: "", selling_price: "", condition_note: "", notes: "",
};
const EMPTY_ACC_FORM = {
    name: "", category: "", brand: "", spec: "", buy_price: "", sell_price: "", stock: "", notes: "",
};

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Riwayat (Audit / SO) — generik, dipakai untuk kedua tipe
// ═══════════════════════════════════════════════════════════════════════════
function HistoryModal({ title, subtitle, entries, loading, onClose }: {
    title: string; subtitle: string; entries: HistoryEntry[]; loading: boolean; onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[80vh] flex flex-col animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-zinc-400 via-zinc-700 to-black flex-shrink-0" />
                <div className="px-5 py-4 border-b border-zinc-100 flex-shrink-0">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{title}</p>
                    <h3 className="text-sm font-bold text-zinc-900 truncate">{subtitle}</h3>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4">
                    {loading ? (
                        <p className="text-sm text-zinc-400 text-center py-6">Memuat...</p>
                    ) : entries.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-6">Belum ada riwayat</p>
                    ) : (
                        <ul className="space-y-2">
                            {entries.map(h => (
                                <li key={h.id} className="bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5">
                                    <p className="text-xs font-semibold text-zinc-700">{h.action}</p>
                                    {h.notes && <p className="text-[11px] text-zinc-600 italic mt-1">"{h.notes}"</p>}
                                    <p className="text-[11px] text-zinc-400 mt-0.5">
                                        {h.by} · {new Date(h.at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="px-5 py-4 border-t border-zinc-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-10 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition">Tutup</button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Konfirmasi Hapus (generik)
// ═══════════════════════════════════════════════════════════════════════════
function DeleteConfirm({ row, onClose, onConfirm, loading }: {
    row: UnifiedRow | null; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
    if (!row) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-rose-400 via-rose-600 to-rose-800" />
                <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-5">
                    <p className="font-bold text-white text-sm">Hapus {row.tipe === "LAPTOP" ? "Laptop" : "Aksesori"}</p>
                    <p className="text-xs text-white/60 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                </div>
                <div className="p-6">
                    <p className="text-sm text-zinc-600 text-center mb-2">Yakin hapus <span className="font-bold text-zinc-800">{row.nama}</span>?</p>
                    {row.tipe === "LAPTOP" && row.unit_count > 1 && (
                        <p className="text-xs text-amber-600 text-center mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Model ini punya {row.unit_count} unit terdaftar — semua unit & garansi terkait ikut terhapus.
                        </p>
                    )}
                    <div className="flex gap-3 mt-4">
                        <button onClick={onClose} disabled={loading} className="flex-1 h-11 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50">Batal</button>
                        <button onClick={onConfirm} disabled={loading} className="flex-1 h-11 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition disabled:opacity-50">
                            {loading ? "Menghapus..." : "Hapus"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE (sessionStorage) — supaya buka tab "Data Barang" berikutnya langsung
// muncul instan dari data terakhir, tanpa nunggu network. Data lalu di-refresh
// diam-diam (silent) di belakang layar supaya tetap akurat.
// ═══════════════════════════════════════════════════════════════════════════
const BARANG_CACHE_KEY = "unified-barang-cache-v1";
const BARANG_CACHE_TTL_MS = 5 * 60 * 1000; // cache dianggap basi setelah 5 menit

interface BarangCachePayload {
    rows: UnifiedRow[];
    savedAt: number;
}

function readBarangCache(): BarangCachePayload | null {
    if (typeof window === "undefined") return null; // guard render di server
    try {
        const raw = sessionStorage.getItem(BARANG_CACHE_KEY);
        if (!raw) return null;
        const parsed: BarangCachePayload = JSON.parse(raw);
        if (Date.now() - parsed.savedAt > BARANG_CACHE_TTL_MS) return null; // basi, abaikan
        return parsed;
    } catch {
        return null; // JSON korup / storage diblokir browser — anggap tidak ada cache
    }
}

function writeBarangCache(rows: UnifiedRow[]) {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(BARANG_CACHE_KEY, JSON.stringify({ rows, savedAt: Date.now() }));
    } catch {
        // storage penuh/disabled — tidak fatal, cuma berarti load berikutnya tidak instan
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function UnifiedBarangContent() {
    // Lazy initializer: cache dibaca SEKALI saat komponen pertama kali dibuat.
    // Kalau ada cache yang masih segar, rows langsung terisi & loading langsung
    // false — artinya tabel/kartu langsung tampil di render PERTAMA, tanpa
    // "kedip" loading sama sekali.
    const [rows, setRows] = useState<UnifiedRow[]>(() => readBarangCache()?.rows ?? []);
    const [loading, setLoading] = useState(() => readBarangCache() === null);
    const [categories, setCategories] = useState<{ id: string; name: string; type?: string | null }[]>([]);
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const [userId, setUserId] = useState<string | null>(null);

    const [tipeFilter, setTipeFilter] = useState<"ALL" | ItemType>("ALL");
    const [kategoriFilter, setKategoriFilter] = useState("");
    const [brandFilter, setBrandFilter] = useState("");
    const [stokFilter, setStokFilter] = useState<"ALL" | "READY" | "EMPTY" | "SIAP_JUAL" | "MINUS">("ALL");
    const [minPrice, setMinPrice] = useState("");
    const [maxPrice, setMaxPrice] = useState("");
    const [statusAuditSoFilter, setStatusAuditSoFilter] = useState<"ALL" | "SO_TODAY" | "SO_NEED" | "AUDIT_ACTIVE">("ALL");
    const [sortBy, setSortBy] = useState<"NAMA_ASC" | "NAMA_DESC" | "HARGA_DESC" | "HARGA_ASC" | "STOK_DESC" | "STOK_ASC" | "NEWEST">("NAMA_ASC");
    const [search, setSearch] = useState("");
    const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

    const [formModal, setFormModal] = useState<{ mode: "create" | "edit"; tipe: ItemType; row?: UnifiedRow } | null>(null);
    const [laptopForm, setLaptopForm] = useState(EMPTY_LAPTOP_FORM);
    const [accForm, setAccForm] = useState(EMPTY_ACC_FORM);
    const [saving, setSaving] = useState(false);

    const [deleteRow, setDeleteRow] = useState<UnifiedRow | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [auditingId, setAuditingId] = useState<string | null>(null);
    const [soingId, setSoingId] = useState<string | null>(null);
    const [pedagangSavingId, setPedagangSavingId] = useState<string | null>(null);

    const [historyTarget, setHistoryTarget] = useState<{ row: UnifiedRow; kind: "audit" | "so" } | null>(null);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [barcodeTarget, setBarcodeTarget] = useState<{ id: string; name: string } | null>(null);
    //  Tambah unit pertama untuk laptop stok 0 — dibuka dari tombol "Tambah Unit"
    //  di kolom Aksi (mobile & desktop) ATAU dari klik baris/kartu itu sendiri
    //  (lihat handleRowClick di bawah), saat row.unit_count === 0.
    const [addUnitTarget, setAddUnitTarget] = useState<UnifiedRow | null>(null);
    //  Edit SN + tambah unit untuk laptop stok 1 — dibuka dari klik baris/kartu
    //  (lihat handleRowClick). Unit LENGKAP diambil dulu lewat fetch, karena
    //  data di tabel gabungan ini tidak menyertakan condition_note/notes.
    const [unitDetailTarget, setUnitDetailTarget] = useState<{ unit: UnitDetailData; row: UnifiedRow } | null>(null);
    const [unitDetailLoading, setUnitDetailLoading] = useState(false);
    //  Versi AKSESORIS dari 2 state di atas — struktur data unit beda
    //  (buy_price/condition, bukan purchase_price/grade), dipisah supaya
    //  tidak mencampur shape data laptop & aksesori di satu state.
    const [addUnitAccessoryTarget, setAddUnitAccessoryTarget] = useState<UnifiedRow | null>(null);
    const [unitDetailAccessoryTarget, setUnitDetailAccessoryTarget] = useState<{ unit: AccessoryUnitDetailData; row: UnifiedRow } | null>(null);
    const [unitDetailAccessoryLoading, setUnitDetailAccessoryLoading] = useState(false);

    // Set berisi key row ("TIPE-id") yang kartunya sedang dibuka detailnya — khusus mode mobile.
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const toggleExpand = (key: string) => setExpandedIds(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });

    const { can: matrixCanBarang } = usePagePermission("data-barang");
    const { can: matrixCanLaptop } = usePagePermission("laptops");

    const isAdmin = userRoles.includes("ADMIN" as UserRole);
    const canSeePrivate = hasAnyRole(userRoles, BARANG_PRIVATE_VIEW_ROLES);
    const canCreateLaptop = hasAnyRole(userRoles, PERMISSIONS.CREATE_LAPTOP) || matrixCanLaptop.create;
    const canEditLaptop = hasAnyRole(userRoles, PERMISSIONS.EDIT_LAPTOP) || matrixCanLaptop.edit;
    const canDeleteLaptop = hasAnyRole(userRoles, LAPTOP_DELETE_ROLES) || matrixCanLaptop.delete;
    const canViewUnits = hasAnyRole(userRoles, PERMISSIONS.VIEW_UNITS);
    const canViewBarcode = hasAnyRole(userRoles, PERMISSIONS.VIEW_BARCODE);
    //  Klik baris/kartu untuk buka pop-up "Tambah Unit" (stok 0) ATAU pop-up
    //  "Detail Unit" untuk edit SN + tambah unit (stok 1) — lihat handleRowClick.
    const canAddUnit = hasAnyRole(userRoles, PERMISSIONS.CREATE_UNITS);
    //  Dipakai sebagai prop canEdit UnitDetailModal — menggerbangi tombol
    //  "+ Tambah Unit" & "Edit Data" di dalam pop-up detail unit (stok 1).
    const canFullAccessBarang = hasAnyRole(userRoles, BARANG_FULL_ACCESS_ROLES);
    const canManageSo = hasAnyRole(userRoles, SO_ROLES) || SO_LIMITED_USER_IDS.includes(userId ?? "");
    const canCreateAcc = hasAnyRole(userRoles, ACCESSORY_CREATE_ROLES) || matrixCanBarang.create;
    const canEditAcc = hasAnyRole(userRoles, ACCESSORY_EDIT_ROLES) || matrixCanBarang.edit;
        const canDeleteAcc = hasAnyRole(userRoles, ACCESSORY_DELETE_ROLES) || matrixCanBarang.delete;

    // ── Aturan toggle audit: LAPTOP butuh canSeePrivate, AKSESORIS butuh ADMIN.
    // Ini persis aturan yang sudah ada masing-masing di komponen asli — sengaja
    // TIDAK diseragamkan biar tidak mengubah behavior lama.
    const canToggleAudit = (row: UnifiedRow) => row.tipe === "LAPTOP" ? canSeePrivate : isAdmin;

    // opts.silent = true → refresh di belakang layar: TIDAK menyalakan spinner
    // "Memuat data..." dan TIDAK menampilkan toast kalau gagal (karena data lama
    // dari cache masih tampil di layar, gangguan toast hanya bikin bingung).
    const fetchAll = useCallback(async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoading(true);
        try {
            const [lapRes, accRes] = await Promise.all([
                fetch("/api/laptops"),
                fetch("/api/accessories?page=1&limit=9999"),
            ]);
            const lapJson = await lapRes.json();
            const accJson = await accRes.json();
            const laptopRows = (lapJson.success ? lapJson.data : []).map(normalizeLaptop);
            const accessoryRows = (accJson.success ? accJson.data : []).map(normalizeAccessory);
            const merged = [...laptopRows, ...accessoryRows];
            setRows(merged);
            writeBarangCache(merged);
        } catch {
            if (!opts?.silent) toast.error("Gagal memuat data barang");
        } finally {
            if (!opts?.silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Ada cache segar? → rows sudah terisi dari lazy initializer di atas,
        // di sini cuma refresh DIAM-DIAM di belakang layar biar tetap akurat.
        // Tidak ada cache? → fetch normal dengan spinner "Memuat data...".
        if (readBarangCache()) {
            fetchAll({ silent: true });
        } else {
            fetchAll();
        }
    }, [fetchAll]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/categories");
                const json = await res.json();
                if (json.success) setCategories(json.data);
            } catch { /* dropdown kosong kalau gagal, tidak fatal */ }
        })();
    }, []);

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

    // Reset filter kategori tiap ganti tipe (opsi kategori beda antar tipe)
    useEffect(() => { setKategoriFilter(""); }, [tipeFilter]);

    // Kategori dipisah per tipe supaya dropdown laptop tidak menampilkan kategori
    // aksesoris & sebaliknya. Transition-safe: kategori tanpa `type` (mis. migrasi
    // belum jalan) tetap ikut muncul di kedua tipe — persis perilaku lama.
    const laptopCategories = useMemo(
        () => categories.filter(c => !c.type || c.type === "LAPTOP"),
        [categories],
    );
    const accessoryCategories = useMemo(
        () => categories.filter(c => !c.type || c.type === "AKSESORIS"),
        [categories],
    );
    // Opsi yang tampil di dropdown filter, mengikuti tipe yang sedang dipilih.
    const filterCategories = tipeFilter === "LAPTOP" ? laptopCategories
        : tipeFilter === "AKSESORIS" ? accessoryCategories
        : categories;

    // Daftar Brand unik yang ada di data
    const availableBrands = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(r => {
            if (r.brand && r.brand.trim()) {
                if (tipeFilter === "ALL" || r.tipe === tipeFilter) {
                    set.add(r.brand.trim());
                }
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, "id-ID"));
    }, [rows, tipeFilter]);

    const filteredRows = useMemo(() => {
        let list = rows;

        // 1. Tipe Barang
        if (tipeFilter !== "ALL") list = list.filter(r => r.tipe === tipeFilter);

        // 2. Kategori
        if (kategoriFilter) {
            const selectedName = (categories.find(c => c.id === kategoriFilter)?.name || "").toUpperCase();
            const matchLaptop = (r: UnifiedRow) => r.kategori_id === kategoriFilter;
            const matchAksesoris = (r: UnifiedRow) => (r.kategori || "").toUpperCase() === selectedName;
            list = list.filter(r => {
                if (tipeFilter === "LAPTOP") return matchLaptop(r);
                if (tipeFilter === "AKSESORIS") return matchAksesoris(r);
                return r.tipe === "LAPTOP" ? matchLaptop(r) : matchAksesoris(r);
            });
        }

        // 3. Brand
        if (brandFilter) {
            const b = brandFilter.toLowerCase();
            list = list.filter(r => (r.brand || "").toLowerCase() === b);
        }

        // 4. Status Stok
        if (stokFilter !== "ALL") {
            list = list.filter(r => {
                const stokVal = r.tipe === "LAPTOP" ? (r.stok_tersedia ?? 0) : (r.stok ?? 0);
                if (stokFilter === "READY") return stokVal > 0;
                if (stokFilter === "EMPTY") return stokVal === 0;
                if (stokFilter === "SIAP_JUAL") return r.tipe === "LAPTOP" && (r.siap_jual ?? 0) > 0;
                if (stokFilter === "MINUS") return r.tipe === "LAPTOP" && (r.minus ?? 0) > 0;
                return true;
            });
        }

        // 5. Rentang Harga Jual
        const pMin = minPrice.trim() !== "" ? parseFloat(minPrice) : null;
        const pMax = maxPrice.trim() !== "" ? parseFloat(maxPrice) : null;
        if (pMin !== null && !isNaN(pMin)) {
            list = list.filter(r => (r.harga_jual || 0) >= pMin);
        }
        if (pMax !== null && !isNaN(pMax)) {
            list = list.filter(r => (r.harga_jual || 0) <= pMax);
        }

        // 6. Status Audit & Stock Opname (SO)
        if (statusAuditSoFilter !== "ALL") {
            list = list.filter(r => {
                if (statusAuditSoFilter === "SO_TODAY") return isSoActive(r.so_at);
                if (statusAuditSoFilter === "SO_NEED") return r.tipe === "LAPTOP" && !isSoActive(r.so_at);
                if (statusAuditSoFilter === "AUDIT_ACTIVE") return isAuditActive(r);
                return true;
            });
        }

        // 7. Pencarian Teks
        if (search.trim()) {
            const t = search.toLowerCase();
            list = list.filter(r => {
                const matchString = (
                    r.nama?.toLowerCase().includes(t) ||
                    r.brand?.toLowerCase().includes(t) ||
                    r.cpu?.toLowerCase().includes(t) ||
                    r.ram?.toLowerCase().includes(t) ||
                    r.storage?.toLowerCase().includes(t) ||
                    r.spek?.toLowerCase().includes(t) ||
                    r.sn?.toLowerCase().includes(t)
                );

                if (matchString) return true;

                if (r.tipe === "LAPTOP" && r.raw && "laptop_units" in r.raw) {
                    const units = (r.raw as LaptopRaw).laptop_units;
                    if (units && units.some(u => u.serial_number?.toLowerCase().includes(t))) {
                        return true;
                    }
                }

                return false;
            });
        }

        // 8. Urutkan Data (Sorting)
        return [...list].sort((a, b) => {
            if (sortBy === "NAMA_ASC") return a.nama.localeCompare(b.nama, "id-ID");
            if (sortBy === "NAMA_DESC") return b.nama.localeCompare(a.nama, "id-ID");
            if (sortBy === "HARGA_DESC") return (b.harga_jual || 0) - (a.harga_jual || 0);
            if (sortBy === "HARGA_ASC") return (a.harga_jual || 0) - (b.harga_jual || 0);
            if (sortBy === "STOK_DESC") {
                const stokA = a.tipe === "LAPTOP" ? (a.stok_tersedia ?? 0) : (a.stok ?? 0);
                const stokB = b.tipe === "LAPTOP" ? (b.stok_tersedia ?? 0) : (b.stok ?? 0);
                return stokB - stokA;
            }
            if (sortBy === "STOK_ASC") {
                const stokA = a.tipe === "LAPTOP" ? (a.stok_tersedia ?? 0) : (a.stok ?? 0);
                const stokB = b.tipe === "LAPTOP" ? (b.stok_tersedia ?? 0) : (b.stok ?? 0);
                return stokA - stokB;
            }
            if (sortBy === "NEWEST") {
                const dateA = a.tanggal_masuk ? new Date(a.tanggal_masuk).getTime() : 0;
                const dateB = b.tanggal_masuk ? new Date(b.tanggal_masuk).getTime() : 0;
                return dateB - dateA;
            }
            return 0;
        });
    }, [rows, tipeFilter, kategoriFilter, brandFilter, stokFilter, minPrice, maxPrice, statusAuditSoFilter, search, categories, sortBy]);

        const counts = useMemo(() => ({
        total: rows.length,
        laptop: rows.filter(r => r.tipe === "LAPTOP").length,
        aksesoris: rows.filter(r => r.tipe === "AKSESORIS").length,
    }), [rows]);

    // ── Export Excel ─────────────────────────────────────────────────────
    // Laptop: setiap unit/SN aktif (non-SOLD) jadi 1 baris sendiri, supaya
    // modal, sumber, dan tanggal masuk per-SN kelihatan detail — bukan
    // digabung per model seperti di tabel. Aksesoris tetap 1 baris per item
    // (memang tidak punya SN individual). Yang di-export ikut filter/search
    // yang sedang aktif (pakai filteredRows, bukan rows mentah).
    const handleExportExcel = useCallback(() => {
        try {
            const exportRows: Record<string, string | number>[] = [];
            let no = 1;

            filteredRows.forEach((row) => {
                const auditLabel = isAuditActive(row) ? "Teraudit" : "Belum";
                const soLabel = row.tipe === "LAPTOP" ? (isSoActive(row.so_at) ? "Sudah SO" : "Belum SO") : "-";

                if (row.tipe === "LAPTOP") {
                    const units = ((row.raw as LaptopRaw).laptop_units ?? []).filter(u => u.status !== "SOLD");

                    if (units.length === 0) {
                        // Model belum punya unit sama sekali — tetap 1 baris, SN kosong
                        exportRows.push({
                            No: no++, Tipe: "Laptop", "Nama Barang": row.nama,
                            Kategori: row.kategori ?? "-", Merk: row.brand ?? "-",
                            CPU: row.cpu ?? "-", RAM: row.ram ?? "-", Storage: row.storage ?? "-", Spek: "-",
                            SN: "-", "Status Unit": "-",
                            "Harga Modal": 0, "Modal Sparepart": 0, "Harga Jual": row.harga_jual,
                            Sumber: "-", "Tgl Masuk": "-", Stok: 0,
                            "Status Audit": auditLabel, "Status SO": soLabel,
                        });
                        return;
                    }

                    units.forEach((u) => {
                        exportRows.push({
                            No: no++, Tipe: "Laptop", "Nama Barang": row.nama,
                            Kategori: row.kategori ?? "-", Merk: row.brand ?? "-",
                            CPU: row.cpu ?? "-", RAM: row.ram ?? "-", Storage: row.storage ?? "-", Spek: "-",
                            SN: u.serial_number, "Status Unit": u.status,
                            "Harga Modal": u.purchase_price ?? 0, "Modal Sparepart": u.sparepart_cost ?? 0,
                            "Harga Jual": row.harga_jual,
                            Sumber: u.source ?? "-",
                            "Tgl Masuk": u.created_at ? new Date(u.created_at).toLocaleDateString("id-ID") : "-",
                            Stok: 1,
                            "Status Audit": auditLabel, "Status SO": soLabel,
                        });
                    });
                } else {
                    const acc = row.raw as AccessoryRaw;
                    exportRows.push({
                        No: no++, Tipe: "Aksesoris", "Nama Barang": row.nama,
                        Kategori: row.kategori ?? "-", Merk: row.brand ?? "-",
                        CPU: "-", RAM: "-", Storage: "-", Spek: row.spek ?? "-",
                        SN: "-", "Status Unit": "-",
                        "Harga Modal": acc.buy_price ?? 0, "Modal Sparepart": 0, "Harga Jual": row.harga_jual,
                        Sumber: "-", "Tgl Masuk": "-", Stok: row.stok ?? 0,
                        "Status Audit": auditLabel, "Status SO": soLabel,
                    });
                }
            });

            const ws = XLSX.utils.json_to_sheet(exportRows);
            ws["!cols"] = [
                { wch: 5 }, { wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 12 },
                { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
                { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 },
                { wch: 12 }, { wch: 6 }, { wch: 11 }, { wch: 10 },
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Data Barang");

            const stamp = new Date().toLocaleDateString("id-ID").replace(/\//g, "-");
            XLSX.writeFile(wb, `Data-Barang-${stamp}.xlsx`);

            toast.success(`Export berhasil — ${exportRows.length} baris`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal export Excel");
        }
    }, [filteredRows]);

    // ── Audit toggle ───────────────────────────────────────────────────────
    const toggleAudit = async (row: UnifiedRow) => {
        if (!canToggleAudit(row)) return;
        setAuditingId(row.id);
        try {
            const url = row.tipe === "LAPTOP" ? `/api/laptops/${row.id}/audit` : `/api/accessories/${row.id}/audit`;
            const res = await fetch(url, { method: "PATCH" });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal update audit");
            setRows(prev => {
                const next = prev.map(r => r.id === row.id ? { ...r, audited_at: json.data.audited_at, audited_by: json.data.audited_by } : r);
                writeBarangCache(next); // cache ikut update, biar load berikutnya tidak "kedip balik" ke status lama
                return next;
            });
            toast.success("Status audit diperbarui");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal update audit");
        } finally {
            setAuditingId(null);
        }
    };

    // ── SO toggle (laptop only) ─────────────────────────────────────────────
    const toggleSo = async (row: UnifiedRow) => {
        const note = window.prompt("Catatan SO (opsional):", "") ?? "";
        setSoingId(row.id);
        try {
            const res = await fetch(`/api/laptops/${row.id}/so`, {
                method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: note }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal update SO");
            setRows(prev => {
                const next = prev.map(r => r.id === row.id ? { ...r, so_at: json.data.so_at, so_by: json.data.so_by } : r);
                writeBarangCache(next);
                return next;
            });
            toast.success("Status SO diperbarui");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal update SO");
        } finally {
            setSoingId(null);
        }
    };

    // ── Pedagang toggle (laptop, stok = 1 saja) ────────────────────────────
    const togglePedagang = async (row: UnifiedRow, current: boolean) => {
        if (!row.unit_id) return;
        setPedagangSavingId(row.unit_id);
        try {
            const res = await fetch(`/api/units/${row.unit_id}/pedagang`, {
                method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_pedagang_listed: !current }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal update status pedagang");
            toast.success("Status pedagang diperbarui");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal update status pedagang");
        } finally {
            setPedagangSavingId(null);
        }
    };

    //  Ambil detail unit LENGKAP (condition_note, notes, dst) untuk laptop
    //  stok 1 — data di tabel gabungan ini cuma versi ringkas, jadi harus
    //  fetch ulang lewat endpoint units, sama seperti LaptopsContent.tsx.
    const openUnitDetail = async (row: UnifiedRow) => {
        setUnitDetailLoading(true);
        try {
            const res = await fetch(`/api/laptops/${row.id}/units`);
            const json = await res.json();
            if (!res.ok || json.success === false) throw new Error(json.message || "Gagal memuat detail unit");
            const units = (json.data ?? []) as UnitDetailData[];
            const active = units.find(u => u.status !== "SOLD") ?? units[0];
            if (!active) {
                toast.error("Unit tidak ditemukan untuk laptop ini");
                return;
            }
            setUnitDetailTarget({ unit: active, row });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal memuat detail unit");
        } finally {
            setUnitDetailLoading(false);
        }
    };

        //  Versi AKSESORIS dari openUnitDetail — fetch ke endpoint asli
    //  (GET /api/accessory-units?accessory_id=X), bukan endpoint nested
    //  yang sudah dihapus karena duplikat & tidak konsisten dengan yang asli.
    const openAccessoryUnitDetail = async (row: UnifiedRow) => {
        setUnitDetailAccessoryLoading(true);
        try {
            const res = await fetch(`/api/accessory-units?accessory_id=${row.id}`);
            const json = await res.json();
            if (!res.ok || json.success === false) throw new Error(json.message || "Gagal memuat detail unit");
            const units = (json.data ?? []) as AccessoryUnitDetailData[];
            const active = units.find(u => u.status !== "TERJUAL") ?? units[0];
            if (!active) {
                toast.error("Unit tidak ditemukan untuk aksesori ini");
                return;
            }
            setUnitDetailAccessoryTarget({ unit: active, row });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal memuat detail unit");
        } finally {
            setUnitDetailAccessoryLoading(false);
        }
    };

    // ── Klik baris (desktop) / tap kartu (mobile) ───────────────────────────
    // Stok 0  → buka pop-up "Tambah Unit" (unit pertama belum ada).
    // Stok 1  → buka pop-up "Detail Unit" untuk edit SN yang sudah ada ATAU
    //           tambah unit baru (tombol "+ Tambah Unit" di dalam pop-up itu).
    // Stok >1 → TIDAK diberi aksi klik — edit SN dilakukan di halaman Units
    //           lewat tombol "Kelola Unit" yang sudah ada.
    const handleRowClick = (row: UnifiedRow) => {
        if (row.tipe === "LAPTOP") {
            if (row.unit_count === 0 && canAddUnit) {
                setAddUnitTarget(row);
                return;
            }
            if (row.unit_count === 1 && canViewUnits) {
                openUnitDetail(row);
            }
            return;
        }
        if (row.tipe === "AKSESORIS") {
            const action = getAccessoryUnitAction(row);
            if (action === "add" && canAddUnit) {
                setAddUnitAccessoryTarget(row);
                return;
            }
            if (action === "detail" && canViewUnits) {
                openAccessoryUnitDetail(row);
            }
            // action === "units" → sengaja TIDAK diapa-apakan di sini, sama
            // seperti LAPTOP saat unit_count > 1: klik baris tidak ngapa-ngapain,
            // user wajib klik tombol "Kelola Unit" di kolom Aksi.
        }
    };

    // ── Riwayat ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!historyTarget) return;
        setHistoryLoading(true);
        (async () => {
            try {
                const { row, kind } = historyTarget;
                const url = kind === "so" ? `/api/laptops/${row.id}/so` : row.tipe === "LAPTOP" ? `/api/laptops/${row.id}/audit` : `/api/accessories/${row.id}/audit`;
                const res = await fetch(url);
                const json = await res.json();
                const raw = json.data?.history ?? [];
                const mapped: HistoryEntry[] = raw.map((h: any) => ({
                    id: h.id,
                    action: kind === "so" ? (h.action === "SO" ? "Ditandai sudah SO" : "SO dibatalkan") : (h.action === "AUDIT" ? "Ditandai sudah diaudit" : "Audit dibatalkan"),
                    by: kind === "so" ? h.so_by : h.audited_by,
                    at: kind === "so" ? h.so_at : h.audited_at,
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

    // ── Create / Edit form ───────────────────────────────────────────────────
    const openCreate = (tipe: ItemType) => {
        setLaptopForm(EMPTY_LAPTOP_FORM);
        setAccForm(EMPTY_ACC_FORM);
        setFormModal({ mode: "create", tipe });
    };
    const openEdit = (row: UnifiedRow) => {
        if (row.tipe === "LAPTOP") {
            const l = row.raw as LaptopRaw;
            setLaptopForm({
                laptop_name: l.laptop_name || "", category_id: l.category_id || "", brand: l.brand || "",
                cpu: l.cpu || "", ram: l.ram || "", storage: l.storage || "", gpu: l.gpu || "", display: l.display || "",
                selling_price: String(l.selling_price || ""), condition_note: l.condition_note || "", notes: l.notes || "",
            });
        } else {
            const a = row.raw as AccessoryRaw;
            setAccForm({
                name: a.name || "", category: a.category || "", brand: a.brand || "", spec: a.spec || "",
                buy_price: String(a.buy_price ?? ""), sell_price: String(a.sell_price ?? ""), stock: String(a.stock ?? ""), notes: a.notes || "",
            });
        }
        setFormModal({ mode: "edit", tipe: row.tipe, row });
    };
    const closeForm = () => setFormModal(null);

    const submitForm = async () => {
        if (!formModal) return;
        setSaving(true);
        try {
            if (formModal.tipe === "LAPTOP") {
                if (!laptopForm.laptop_name.trim()) { toast.error("Nama laptop wajib diisi"); return; }
                const body = { ...laptopForm, selling_price: Number(laptopForm.selling_price) || 0 };
                const url = formModal.mode === "edit" ? `/api/laptops/${formModal.row!.id}` : "/api/laptops/create";
                const res = await fetch(url, {
                    method: formModal.mode === "edit" ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.message || "Gagal menyimpan laptop");
            } else {
                if (!accForm.name.trim()) { toast.error("Nama aksesori wajib diisi"); return; }
                if (!accForm.category) { toast.error("Kategori wajib dipilih"); return; }
                const body = {
                    ...accForm,
                    buy_price: Number(accForm.buy_price) || 0,
                    sell_price: Number(accForm.sell_price) || 0,
                    stock: Number(accForm.stock) || 0,
                };
                const url = formModal.mode === "edit" ? `/api/accessories/${formModal.row!.id}` : "/api/accessories";
                const res = await fetch(url, {
                    method: formModal.mode === "edit" ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || "Gagal menyimpan aksesori");
            }
            toast.success(formModal.mode === "edit" ? "Berhasil diperbarui" : "Berhasil ditambahkan");
            closeForm();
            fetchAll();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────
    const confirmDelete = async () => {
        if (!deleteRow) return;
        setDeleting(true);
        try {
            const url = deleteRow.tipe === "LAPTOP" ? `/api/laptops/${deleteRow.id}` : `/api/accessories/${deleteRow.id}`;
            const res = await fetch(url, { method: "DELETE" });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || json.error || "Gagal menghapus");
            toast.success("Berhasil dihapus");
            setDeleteRow(null);
            fetchAll();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal menghapus");
        } finally {
            setDeleting(false);
        }
    };

    const activeFilterCount = [
        tipeFilter !== "ALL",
        !!kategoriFilter,
        !!brandFilter,
        stokFilter !== "ALL",
        !!minPrice.trim(),
        !!maxPrice.trim(),
        statusAuditSoFilter !== "ALL",
        sortBy !== "NAMA_ASC",
        !!search.trim(),
    ].filter(Boolean).length;

    const hasFilter = activeFilterCount > 0;

    const resetFilter = () => {
        setTipeFilter("ALL");
        setKategoriFilter("");
        setBrandFilter("");
        setStokFilter("ALL");
        setMinPrice("");
        setMaxPrice("");
        setStatusAuditSoFilter("ALL");
        setSortBy("NAMA_ASC");
        setSearch("");
    };

    return (
        <>
            <style>{`
                @keyframes fadeIn { from{opacity:0} to{opacity:1} }
                @keyframes popIn  { from{opacity:0;transform:scale(0.94) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
                .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
                .animate-popIn  { animation: popIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
                                .table-scroll { scrollbar-width: thin; scrollbar-color: #d4d4d8 #fafafa; }
                .table-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
                .table-scroll::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 99px; }
                .table-scroll::-webkit-scrollbar-track { background: #fafafa; border-radius: 99px; }
            `}</style>

            <main className="min-h-screen bg-zinc-50 p-4 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-5">

                    {/* ── FILTER TIPE BARANG ─────────────────────────────── */}
                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 flex flex-wrap items-center gap-2">
                        {([["ALL", `Semua (${counts.total})`], ["LAPTOP", `Laptop (${counts.laptop})`], ["AKSESORIS", `Aksesoris (${counts.aksesoris})`]] as const).map(([key, label]) => (
                            <button key={key} onClick={() => setTipeFilter(key)}
                                className={`h-9 px-4 rounded-xl text-sm font-semibold transition-all ${tipeFilter === key ? "bg-zinc-900 text-white shadow-md shadow-zinc-900/25" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                                {label}
                            </button>
                        ))}
                                                <div className="flex-1" />
                        <button onClick={handleExportExcel} disabled={filteredRows.length === 0}
                            className="h-9 px-4 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40 transition">
                            Export Excel
                        </button>
                        {canCreateLaptop && <button onClick={() => openCreate("LAPTOP")} className="h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-900 hover:to-black transition">+ Laptop</button>}
                        {canCreateAcc && <button onClick={() => openCreate("AKSESORIS")} className="h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-zinc-600 to-zinc-700 hover:from-zinc-700 hover:to-zinc-800 transition">+ Aksesori</button>}
                    </div>

                    {/* ── FILTER UTAMA & LANJUTAN (FULL FILTER) ───────────── */}
                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 sm:p-5 space-y-3">
                        {/* Row 1: Search, Kategori, Brand, Toggle Lanjutan, & Reset */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
                            {/* Search Input */}
                            <div className="relative lg:col-span-4">
                                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                                <input
                                    className="w-full h-9 pl-9 pr-8 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition"
                                    placeholder="Cari nama, brand, spek, SN..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                                {search && (
                                    <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Kategori Dropdown */}
                            <div className="lg:col-span-3">
                                <select
                                    className="w-full h-9 px-3 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-700 font-medium"
                                    value={kategoriFilter}
                                    onChange={e => setKategoriFilter(e.target.value)}
                                >
                                    <option value="">Semua Kategori</option>
                                    {filterCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            {/* Brand Dropdown */}
                            <div className="lg:col-span-2">
                                <select
                                    className="w-full h-9 px-3 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-700 font-medium"
                                    value={brandFilter}
                                    onChange={e => setBrandFilter(e.target.value)}
                                >
                                    <option value="">Semua Brand</option>
                                    {availableBrands.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>

                            {/* Action Buttons: Toggle Advanced + Reset */}
                            <div className="lg:col-span-3 flex items-center gap-2">
                                <button
                                    onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
                                    className={`flex-1 h-9 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition border ${
                                        showAdvancedFilter || activeFilterCount > (tipeFilter !== "ALL" || kategoriFilter || brandFilter || search ? 1 : 0)
                                            ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                                            : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                                    }`}
                                >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                    <span>Filter Lanjutan</span>
                                    {activeFilterCount > 0 && (
                                        <span className="w-4 h-4 rounded-full bg-amber-400 text-zinc-900 font-bold text-[10px] flex items-center justify-center ml-0.5">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                    {showAdvancedFilter ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>

                                <button
                                    onClick={resetFilter}
                                    disabled={!hasFilter}
                                    className="h-9 px-3 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-medium hover:bg-zinc-200 disabled:opacity-40 transition flex items-center gap-1.5"
                                    title="Reset Semua Filter"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Reset</span>
                                </button>
                            </div>
                        </div>

                        {/* Collapsible Panel: Filter Lanjutan */}
                        {showAdvancedFilter && (
                            <div className="pt-3 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fadeIn">
                                {/* Status Stok */}
                                <div>
                                    <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Status Stok</label>
                                    <select
                                        className="w-full h-9 px-3 border border-zinc-200 rounded-xl text-xs bg-zinc-50 text-zinc-700"
                                        value={stokFilter}
                                        onChange={e => setStokFilter(e.target.value as any)}
                                    >
                                        <option value="ALL">Semua Stok</option>
                                        <option value="READY">Stok Tersedia (&gt; 0)</option>
                                        <option value="EMPTY">Stok Habis (= 0)</option>
                                        <option value="SIAP_JUAL">Ada Unit Siap Jual</option>
                                        <option value="MINUS">Ada Stock Minus / Service</option>
                                    </select>
                                </div>

                                {/* Status Audit & Stock Opname */}
                                <div>
                                    <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Status Audit / SO</label>
                                    <select
                                        className="w-full h-9 px-3 border border-zinc-200 rounded-xl text-xs bg-zinc-50 text-zinc-700"
                                        value={statusAuditSoFilter}
                                        onChange={e => setStatusAuditSoFilter(e.target.value as any)}
                                    >
                                        <option value="ALL">Semua Status Audit &amp; SO</option>
                                        <option value="SO_TODAY">Sudah SO Hari Ini</option>
                                        <option value="SO_NEED">Belum SO Hari Ini (Laptop)</option>
                                        <option value="AUDIT_ACTIVE">Audit Aktif</option>
                                    </select>
                                </div>

                                {/* Rentang Harga Jual (Min & Max) */}
                                <div>
                                    <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Harga Jual (Rp)</label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            placeholder="Min"
                                            className="w-1/2 h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none"
                                            value={minPrice}
                                            onChange={e => setMinPrice(e.target.value)}
                                        />
                                        <span className="text-zinc-300 text-xs">-</span>
                                        <input
                                            type="number"
                                            placeholder="Max"
                                            className="w-1/2 h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none"
                                            value={maxPrice}
                                            onChange={e => setMaxPrice(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Sorting Dropdown */}
                                <div>
                                    <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Urutkan Berdasarkan</label>
                                    <select
                                        className="w-full h-9 px-3 border border-zinc-200 rounded-xl text-xs bg-zinc-50 text-zinc-700 font-medium"
                                        value={sortBy}
                                        onChange={e => setSortBy(e.target.value as any)}
                                    >
                                        <option value="NAMA_ASC">Nama (A - Z)</option>
                                        <option value="NAMA_DESC">Nama (Z - A)</option>
                                        <option value="HARGA_DESC">Harga Jual (Termahal)</option>
                                        <option value="HARGA_ASC">Harga Jual (Termurah)</option>
                                        <option value="STOK_DESC">Stok (Terbanyak)</option>
                                        <option value="STOK_ASC">Stok (Tersedikit)</option>
                                        <option value="NEWEST">Terbaru Masuk</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Active Filter Badges & Counter */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100/80 text-xs text-zinc-500">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-medium text-zinc-400">Total:</span>
                                <span className="font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded-lg text-[11px]">
                                    {filteredRows.length} dari {rows.length} barang
                                </span>

                                {kategoriFilter && (
                                    <span className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                                        Kategori: {categories.find(c => c.id === kategoriFilter)?.name || kategoriFilter}
                                        <button onClick={() => setKategoriFilter("")} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                                    </span>
                                )}
                                {brandFilter && (
                                    <span className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                                        Brand: {brandFilter}
                                        <button onClick={() => setBrandFilter("")} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                                    </span>
                                )}
                                {stokFilter !== "ALL" && (
                                    <span className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                                        Stok: {stokFilter}
                                        <button onClick={() => setStokFilter("ALL")} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                                    </span>
                                )}
                                {(minPrice || maxPrice) && (
                                    <span className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                                        Harga: {minPrice ? fmt(Number(minPrice)) : "0"} - {maxPrice ? fmt(Number(maxPrice)) : "∞"}
                                        <button onClick={() => { setMinPrice(""); setMaxPrice(""); }} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                                    </span>
                                )}
                                {statusAuditSoFilter !== "ALL" && (
                                    <span className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                                        Audit/SO: {statusAuditSoFilter}
                                        <button onClick={() => setStatusAuditSoFilter("ALL")} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── TABEL / DAFTAR BARANG ────────────────────────────── */}
                    {loading ? (
                        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm py-16 text-center text-sm text-zinc-400">Memuat data...</div>
                    ) : filteredRows.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm py-16 text-center">
                            <p className="text-zinc-700 font-bold text-base">Tidak ada barang ditemukan</p>
                            <p className="text-zinc-400 text-sm mt-1">Coba ubah filter atau tambah barang baru</p>
                        </div>
                    ) : (
                        <>
                            {/* ══ MODE HP/TABLET (< lg) — kartu per barang ══════════ */}
                            <div className="lg:hidden space-y-3">
                                {filteredRows.map((row) => {
                                    const rowKey = `${row.tipe}-${row.id}`;
                                    const auditActive = isAuditActive(row);
                                    const soActive = isSoActive(row.so_at);
                                    const expanded = expandedIds.has(rowKey);
                                    const canEditThis = row.tipe === "LAPTOP" ? canEditLaptop : canEditAcc;
                                    const canDeleteThis = row.tipe === "LAPTOP" ? canDeleteLaptop : canDeleteAcc;
                                    const accAction = getAccessoryUnitAction(row);
                                    const isRowClickable = row.tipe === "LAPTOP"
                                        ? ((row.unit_count === 0 && canAddUnit) || (row.unit_count === 1 && canViewUnits))
                                        : row.tipe === "AKSESORIS"
                                            ? ((accAction === "add" && canAddUnit) || (accAction === "detail" && canViewUnits))
                                            : false;
                                    return (
                                        <div
                                            key={rowKey}
                                            onClick={() => handleRowClick(row)}
                                            className={`bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 space-y-3 ${isRowClickable ? "cursor-pointer" : ""}`}
                                        >
                                            {/* Header: tipe + nama + harga jual */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${row.tipe === "LAPTOP" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}>
                                                        {row.tipe === "LAPTOP" ? <LaptopIcon size={11} /> : <Wrench size={11} />}
                                                        {row.tipe === "LAPTOP" ? "Laptop" : "Aksesoris"}
                                                    </span>
                                                    <h3 className="font-bold text-zinc-900 text-[13.5px] leading-snug mt-1.5 truncate" title={row.nama}>{row.nama}</h3>
                                                    <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                                                        {row.kategori || "Tanpa kategori"}{row.brand ? ` · ${row.brand}` : ""}
                                                    </p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Harga Jual</p>
                                                    <p className="text-sm font-black text-zinc-900 tabular-nums">{fmt(row.harga_jual)}</p>
                                                </div>
                                            </div>

                                            {/* Chip status stok — beda field antara laptop (ST/SJ/M) dan aksesoris (Stok) */}
                                            <div className="flex flex-wrap gap-1.5">
                                                {row.tipe === "LAPTOP" ? (
                                                    <>
                                                        <StatChip label="ST" value={row.stok_tersedia} tone={(row.stok_tersedia ?? 0) === 0 ? "red" : "gray"} />
                                                        <StatChip label="SJ" value={row.siap_jual} tone="green" />
                                                        <StatChip label="M" value={row.minus} tone={(row.minus ?? 0) > 0 ? "red" : "gray"} />
                                                    </>
                                                ) : (
                                                    <StatChip label="Stok" value={row.stok} tone={(row.stok ?? 0) === 0 ? "red" : "emerald"} />
                                                )}
                                            </div>

                                            {/* Toggle detail — CPU/RAM/Spek/Sumber/SN/dll disembunyikan di sini,
                                                BUKAN dihapus, supaya kartu tetap ringkas di layar kecil. */}
                                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpand(rowKey); }}
                                                className="text-[11px] font-semibold text-zinc-700 hover:text-zinc-900 flex items-center gap-1">
                                                {expanded ? "Sembunyikan detail" : "Lihat detail lengkap"}
                                                <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {expanded && (
                                                <div className="grid grid-cols-2 gap-2 pt-1">
                                                    <DetailItem label="CPU" value={row.cpu} />
                                                    <DetailItem label="RAM" value={row.ram} />
                                                    <DetailItem label="Storage" value={row.storage} />
                                                    <DetailItem label="Spek" value={row.spek} />
                                                    <DetailItem label="Harga Modal" value={row.harga_modal != null ? fmt(row.harga_modal) : row.harga_modal_note} />
                                                    <DetailItem label="Modal Sparepart" value={row.modal_sparepart != null ? fmt(row.modal_sparepart) : null} />
                                                    <DetailItem label="Total Jual" value={row.total_jual != null ? fmt(row.total_jual) : null} />
                                                    <DetailItem label="Gross Profit" value={row.gross_profit != null ? `${row.gross_profit >= 0 ? "+" : ""}${fmt(row.gross_profit)}` : null} />
                                                    <DetailItem label="Sumber" value={row.sumber} />
                                                    <DetailItem label="Tgl Masuk" value={row.tanggal_masuk ? new Date(row.tanggal_masuk).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : null} />
                                                    <DetailItem label="SN" value={row.sn || row.sn_note} />
                                                </div>
                                            )}

                                            {/* Aksi — persis fungsi yang sama dengan kolom Aksi di tabel desktop.
                                                stopPropagation supaya tap tombol di sini tidak ikut memicu
                                                handleRowClick pada wrapper kartu di atas. */}
                                            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
                                                <button onClick={() => toggleAudit(row)} disabled={!canToggleAudit(row) || auditingId === row.id}
                                                    title={!canToggleAudit(row) ? (row.tipe === "AKSESORIS" ? "Hanya Admin yang bisa mengubah status audit" : "Tidak punya akses") : ""}
                                                    className={`h-7 px-2 rounded-lg text-[11px] font-semibold border disabled:opacity-40 ${auditActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-50 text-zinc-400 border-zinc-200"}`}>
                                                    {auditActive ? "Teraudit" : "Audit"}
                                                </button>
                                                <button onClick={() => setHistoryTarget({ row, kind: "audit" })} title="Riwayat audit"
                                                    className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition">
                                                    <HistoryIcon size={13} />
                                                </button>
                                                {row.tipe === "LAPTOP" && canManageSo && canSoLaptop(userRoles, userId, row.siap_jual ?? 0) && (
                                                    <button onClick={() => toggleSo(row)} disabled={soingId === row.id}
                                                        className={`h-7 px-2 rounded-lg text-[11px] font-semibold border ${soActive ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-zinc-50 text-zinc-400 border-zinc-200"}`}>
                                                        {soActive ? "SO" : "Tandai SO"}
                                                    </button>
                                                )}
                                                {row.tipe === "LAPTOP" && row.unit_id && (
                                                    <button onClick={() => togglePedagang(row, false)} disabled={pedagangSavingId === row.unit_id}
                                                        className="h-7 px-2 text-[11px] font-semibold text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">Pedagang</button>
                                                )}
                                                {row.tipe === "LAPTOP" && row.unit_count === 0 && canAddUnit && (
                                                    <button onClick={() => setAddUnitTarget(row)}
                                                        className="h-7 px-2 text-[11px] font-semibold text-white bg-zinc-800 rounded-lg hover:bg-zinc-900 transition">
                                                        Tambah Unit
                                                    </button>
                                                )}
                                                {row.tipe === "LAPTOP" && row.unit_count > 1 && canViewUnits && (
                                                    <Link href={`/dashboard/laptops/${row.id}/units`}
                                                        className="h-7 px-2 inline-flex items-center text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">
                                                        Kelola Unit ({row.unit_count})
                                                    </Link>
                                                )}
                                                {row.tipe === "AKSESORIS" && accAction === "add" && canAddUnit && (
                                                    <button onClick={() => setAddUnitAccessoryTarget(row)}
                                                        className="h-7 px-2 text-[11px] font-semibold text-white bg-zinc-800 rounded-lg hover:bg-zinc-900 transition">
                                                        Tambah Unit
                                                    </button>
                                                )}
                                                {row.tipe === "AKSESORIS" && accAction === "units" && canViewUnits && (
                                                    <Link href={`/dashboard/accessories/${row.id}/units`}
                                                        className="h-7 px-2 inline-flex items-center text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">
                                                        Kelola Unit ({row.unit_count})
                                                    </Link>
                                                )}
                                                {row.tipe === "LAPTOP" && canViewBarcode && (
                                                    <button onClick={() => setBarcodeTarget({ id: row.id, name: row.nama })}
                                                        className="h-7 px-2 text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">Barcode</button>
                                                )}
                                                {canEditThis && (
                                                    <button onClick={() => openEdit(row)} className="h-7 px-2 text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">Edit</button>
                                                )}
                                                {canDeleteThis && (
                                                    <button onClick={() => setDeleteRow(row)} className="h-7 px-2 text-[11px] font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition">Hapus</button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                <p className="text-center text-xs text-zinc-400 pt-1">
                                    <span className="text-zinc-700 font-bold">{filteredRows.length}</span> barang ditampilkan
                                </p>
                            </div>

                            {/* ══ MODE LAPTOP (≥ lg) — tabel penuh, sticky header + kolom nama ══ */}
                            <div className="hidden lg:block bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                                <div className="overflow-auto table-scroll max-h-[70vh]">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="whitespace-nowrap">
                                                {["No", "Tipe", "Nama Barang", "Kategori", "Merk", "CPU", "RAM", "Storage", "Spek",
                                                    "Harga Modal", "Modal Sparepart", "Harga Jual", "Total Jual", "Gross Profit",
                                                    "Sumber", "Tgl Masuk", "SN", "ST", "SJ", "M", "Stok", "SO", "Audit", "Aksi"].map((h, hi) => (
                                                        <th key={h}
                                                            className={`px-3 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-left bg-zinc-50 border-b-2 border-zinc-100 sticky top-0 ${hi === 2 ? "left-0 z-20 min-w-[180px]" : "z-10"}`}>
                                                            {h}
                                                        </th>
                                                    ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRows.map((row, idx) => {
                                                const auditActive = isAuditActive(row);
                                                const soActive = isSoActive(row.so_at);
                                                const zebra = idx % 2 === 1;
                                                const rowBg = zebra ? "bg-zinc-50" : "bg-white";
                                                const accAction = getAccessoryUnitAction(row);
                                                const isRowClickable = row.tipe === "LAPTOP"
                                                    ? ((row.unit_count === 0 && canAddUnit) || (row.unit_count === 1 && canViewUnits))
                                                    : row.tipe === "AKSESORIS"
                                                        ? ((accAction === "add" && canAddUnit) || (accAction === "detail" && canViewUnits))
                                                        : false;
                                                return (
                                                    <tr
                                                        key={`${row.tipe}-${row.id}`}
                                                        onClick={() => handleRowClick(row)}
                                                        className={`group border-b border-zinc-50 hover:bg-zinc-100 transition-colors ${rowBg} ${isRowClickable ? "cursor-pointer" : ""}`}
                                                    >
                                                        <td className="px-3 py-3 text-xs text-zinc-400 tabular-nums">{idx + 1}</td>
                                                        <td className="px-3 py-3">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${row.tipe === "LAPTOP" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}>
                                                                {row.tipe === "LAPTOP" ? <LaptopIcon size={11} /> : <Wrench size={11} />}
                                                                {row.tipe === "LAPTOP" ? "Laptop" : "Aksesoris"}
                                                            </span>
                                                        </td>
                                                        <td className={`sticky left-0 z-[1] min-w-[160px] px-3 py-3 font-semibold text-zinc-800 max-w-[200px] truncate border-r border-zinc-100 group-hover:bg-zinc-100 ${rowBg}`} title={row.nama}>{row.nama}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500">{row.kategori || <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500">{row.brand || <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500">{row.cpu || <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500">{row.ram || <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500">{row.storage || <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500 max-w-[140px] truncate">{row.spek || <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">
                                                            {row.harga_modal != null ? fmt(row.harga_modal) : row.harga_modal_note ? <span className="text-zinc-400">{row.harga_modal_note}</span> : <Dash />}
                                                        </td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">{row.modal_sparepart != null ? fmt(row.modal_sparepart) : <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs font-bold text-zinc-800 whitespace-nowrap">{fmt(row.harga_jual)}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">{row.total_jual != null ? fmt(row.total_jual) : <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                                                            {row.gross_profit != null ? <span className={row.gross_profit >= 0 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>{row.gross_profit >= 0 ? "+" : ""}{fmt(row.gross_profit)}</span> : <Dash />}
                                                        </td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500">{row.sumber || <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">{row.tanggal_masuk ? new Date(row.tanggal_masuk).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : <Dash />}</td>
                                                        <td className="px-3 py-3 text-xs text-zinc-500">{row.sn || (row.sn_note ? <span className="text-zinc-400">{row.sn_note}</span> : <Dash />)}</td>
                                                        <td className="px-3 py-3 text-xs text-center tabular-nums">
                                                            <span className={(row.stok_tersedia ?? -1) === 0 ? "text-red-500 font-bold" : ""}>{row.stok_tersedia ?? <Dash />}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-xs text-center tabular-nums">
                                                            <span className={(row.siap_jual ?? 0) > 0 ? "text-emerald-600 font-bold" : ""}>{row.siap_jual ?? <Dash />}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-xs text-center tabular-nums">
                                                            <span className={(row.minus ?? 0) > 0 ? "text-red-500 font-bold" : ""}>{row.minus ?? <Dash />}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-xs text-center tabular-nums">
                                                            <span className={(row.stok ?? -1) === 0 ? "text-red-500 font-bold" : ""}>{row.stok ?? <Dash />}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                            {row.tipe === "LAPTOP" && canManageSo && canSoLaptop(userRoles, userId, row.siap_jual ?? 0) ? (
                                                                <button onClick={() => toggleSo(row)} disabled={soingId === row.id}
                                                                    className={`h-7 px-2 rounded-lg text-[11px] font-semibold border ${soActive ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-zinc-50 text-zinc-400 border-zinc-200"}`}>
                                                                    {soActive ? "SO" : "-"}
                                                                </button>
                                                            ) : <Dash />}
                                                        </td>
                                                        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button onClick={() => toggleAudit(row)} disabled={!canToggleAudit(row) || auditingId === row.id}
                                                                    title={!canToggleAudit(row) ? (row.tipe === "AKSESORIS" ? "Hanya Admin yang bisa mengubah status audit" : "Tidak punya akses") : ""}
                                                                    className={`h-7 px-2 rounded-lg text-[11px] font-semibold border disabled:opacity-40 ${auditActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-50 text-zinc-400 border-zinc-200"}`}>
                                                                    {auditActive ? "Teraudit" : "Audit"}
                                                                </button>
                                                                <button onClick={() => setHistoryTarget({ row, kind: "audit" })} title="Riwayat audit" className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition">
                                                                    <HistoryIcon size={13} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center gap-1 flex-nowrap min-w-max">
                                                                {row.tipe === "LAPTOP" && row.unit_id && (
                                                                    <button onClick={() => togglePedagang(row, false)} disabled={pedagangSavingId === row.unit_id}
                                                                        className="h-7 px-2 text-[11px] font-semibold text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">Pedagang</button>
                                                                )}
                                                                {row.tipe === "LAPTOP" && row.unit_count === 0 && canAddUnit && (
                                                                    <button onClick={() => setAddUnitTarget(row)}
                                                                        className="h-7 px-2 text-[11px] font-semibold text-white bg-zinc-800 rounded-lg hover:bg-zinc-900 transition">
                                                                        Tambah Unit
                                                                    </button>
                                                                )}
                                                                {row.tipe === "LAPTOP" && row.unit_count > 1 && canViewUnits && (
                                                                    <Link href={`/dashboard/laptops/${row.id}/units`} className="h-7 px-2 inline-flex items-center text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">
                                                                        Kelola Unit ({row.unit_count})
                                                                    </Link>
                                                                )}
                                                                {row.tipe === "AKSESORIS" && accAction === "add" && canAddUnit && (
                                                                    <button onClick={() => setAddUnitAccessoryTarget(row)}
                                                                        className="h-7 px-2 text-[11px] font-semibold text-white bg-zinc-800 rounded-lg hover:bg-zinc-900 transition">
                                                                        Tambah Unit
                                                                    </button>
                                                                )}
                                                                {row.tipe === "AKSESORIS" && accAction === "units" && canViewUnits && (
                                                                    <Link href={`/dashboard/accessories/${row.id}/units`} className="h-7 px-2 inline-flex items-center text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">
                                                                        Kelola Unit ({row.unit_count})
                                                                    </Link>
                                                                )}
                                                                {row.tipe === "LAPTOP" && canViewBarcode && (
                                                                    <button onClick={() => setBarcodeTarget({ id: row.id, name: row.nama })} className="h-7 px-2 text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">Barcode</button>
                                                                )}
                                                                {((row.tipe === "LAPTOP" && canEditLaptop) || (row.tipe === "AKSESORIS" && canEditAcc)) && (
                                                                    <button onClick={() => openEdit(row)} className="h-7 px-2 text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">Edit</button>
                                                                )}
                                                                {((row.tipe === "LAPTOP" && canDeleteLaptop) || (row.tipe === "AKSESORIS" && canDeleteAcc)) && (
                                                                    <button onClick={() => setDeleteRow(row)} className="h-7 px-2 text-[11px] font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition">Hapus</button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 text-xs text-zinc-400">
                                    <span className="text-zinc-700 font-bold">{filteredRows.length}</span> barang ditampilkan
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* ── MODAL CREATE / EDIT ─────────────────────────────────── */}
            {formModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={closeForm} />
                    <div className="relative bg-white w-full max-w-lg shadow-2xl rounded-2xl overflow-hidden animate-popIn max-h-[90vh] flex flex-col">
                        <div className="h-0.5 w-full bg-gradient-to-r from-zinc-300 via-zinc-600 to-black" />
                        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                            <h2 className="font-bold text-zinc-900 text-[15px]">
                                {formModal.mode === "edit" ? "Edit" : "Tambah"} {formModal.tipe === "LAPTOP" ? "Laptop" : "Aksesori"}
                            </h2>
                            <button onClick={closeForm} className="text-zinc-400 hover:text-zinc-700">✕</button>
                        </div>

                        {formModal.mode === "create" && (
                            <div className="px-6 pt-4 flex gap-2">
                                <button onClick={() => setFormModal({ mode: "create", tipe: "LAPTOP" })}
                                    className={`flex-1 h-9 rounded-xl text-sm font-semibold ${formModal.tipe === "LAPTOP" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"}`}>Laptop</button>
                                <button onClick={() => setFormModal({ mode: "create", tipe: "AKSESORIS" })}
                                    className={`flex-1 h-9 rounded-xl text-sm font-semibold ${formModal.tipe === "AKSESORIS" ? "bg-zinc-700 text-white" : "bg-zinc-100 text-zinc-500"}`}>Aksesoris</button>
                            </div>
                        )}

                        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
                            {formModal.tipe === "LAPTOP" ? (
                                <>
                                    <Field label="Nama Laptop" required>
                                        <input className={inputCls} value={laptopForm.laptop_name} onChange={e => setLaptopForm(p => ({ ...p, laptop_name: e.target.value }))} />
                                    </Field>
                                    <Field label="Kategori">
                                        <select className={inputCls} value={laptopForm.category_id} onChange={e => setLaptopForm(p => ({ ...p, category_id: e.target.value }))}>
                                            <option value="">Tanpa Kategori</option>
                                            {laptopCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </Field>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Brand"><input className={inputCls} value={laptopForm.brand} onChange={e => setLaptopForm(p => ({ ...p, brand: e.target.value }))} /></Field>
                                        <Field label="CPU"><input className={inputCls} value={laptopForm.cpu} onChange={e => setLaptopForm(p => ({ ...p, cpu: e.target.value }))} /></Field>
                                        <Field label="RAM"><input className={inputCls} value={laptopForm.ram} onChange={e => setLaptopForm(p => ({ ...p, ram: e.target.value }))} /></Field>
                                        <Field label="Storage"><input className={inputCls} value={laptopForm.storage} onChange={e => setLaptopForm(p => ({ ...p, storage: e.target.value }))} /></Field>
                                        <Field label="GPU"><input className={inputCls} value={laptopForm.gpu} onChange={e => setLaptopForm(p => ({ ...p, gpu: e.target.value }))} /></Field>
                                        <Field label="Display"><input className={inputCls} value={laptopForm.display} onChange={e => setLaptopForm(p => ({ ...p, display: e.target.value }))} /></Field>
                                    </div>
                                    <Field label="Harga Store" required><input type="number" className={inputCls} value={laptopForm.selling_price} onChange={e => setLaptopForm(p => ({ ...p, selling_price: e.target.value }))} /></Field>
                                    <Field label="Kondisi Umum"><input className={inputCls} value={laptopForm.condition_note} onChange={e => setLaptopForm(p => ({ ...p, condition_note: e.target.value }))} /></Field>
                                    <Field label="Catatan"><textarea rows={2} className={inputCls} value={laptopForm.notes} onChange={e => setLaptopForm(p => ({ ...p, notes: e.target.value }))} /></Field>
                                </>
                            ) : (
                                <>
                                    <Field label="Nama Aksesori" required><input className={inputCls} value={accForm.name} onChange={e => setAccForm(p => ({ ...p, name: e.target.value }))} /></Field>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Kategori" required>
                                            <select className={inputCls} value={accForm.category} onChange={e => setAccForm(p => ({ ...p, category: e.target.value }))}>
                                                <option value="">-- Pilih --</option>
                                                {accessoryCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                {accForm.category && !accessoryCategories.some(c => c.name.toUpperCase() === accForm.category.toUpperCase()) && (
                                                    <option value={accForm.category}>{accForm.category}</option>
                                                )}
                                            </select>
                                        </Field>
                                        <Field label="Merk"><input className={inputCls} value={accForm.brand} onChange={e => setAccForm(p => ({ ...p, brand: e.target.value }))} /></Field>
                                    </div>
                                    <Field label="Spesifikasi"><input className={inputCls} value={accForm.spec} onChange={e => setAccForm(p => ({ ...p, spec: e.target.value }))} /></Field>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Harga Modal"><input type="number" className={inputCls} value={accForm.buy_price} onChange={e => setAccForm(p => ({ ...p, buy_price: e.target.value }))} /></Field>
                                        <Field label="Harga Jual" required><input type="number" className={inputCls} value={accForm.sell_price} onChange={e => setAccForm(p => ({ ...p, sell_price: e.target.value }))} /></Field>
                                    </div>
                                    <Field label="Stok" required><input type="number" className={inputCls} value={accForm.stock} onChange={e => setAccForm(p => ({ ...p, stock: e.target.value }))} /></Field>
                                    <Field label="Keterangan"><textarea rows={2} className={inputCls} value={accForm.notes} onChange={e => setAccForm(p => ({ ...p, notes: e.target.value }))} /></Field>
                                </>
                            )}
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-zinc-100">
                            <button onClick={closeForm} disabled={saving} className="flex-1 h-11 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition">Batal</button>
                            <button onClick={submitForm} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-zinc-800 to-zinc-900 text-white rounded-xl text-sm font-semibold hover:from-zinc-900 hover:to-black transition disabled:opacity-50">
                                {saving ? "Menyimpan..." : "Simpan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteConfirm row={deleteRow} onClose={() => setDeleteRow(null)} onConfirm={confirmDelete} loading={deleting} />

            {historyTarget && (
                <HistoryModal
                    title={historyTarget.kind === "so" ? "Riwayat SO" : "Riwayat Audit"}
                    subtitle={historyTarget.row.nama}
                    entries={historyEntries}
                    loading={historyLoading}
                    onClose={() => setHistoryTarget(null)}
                />
            )}

            {barcodeTarget && (
                <BarcodeModal laptopId={barcodeTarget.id} laptopName={barcodeTarget.name} onClose={() => setBarcodeTarget(null)} />
            )}

            {addUnitTarget && (
                <AddUnitModal
                    laptopId={addUnitTarget.id}
                    laptopName={addUnitTarget.nama}
                    defaultSellingPrice={addUnitTarget.harga_jual}
                    onClose={() => setAddUnitTarget(null)}
                    onCreated={(unit: CreatedUnit) => {
                        setAddUnitTarget(null);
                        fetchAll();
                        toast.success(`Unit dengan SN "${unit.serial_number}" berhasil ditambahkan`);
                    }}
                />
            )}

            {/*  Loader singkat saat menarik detail unit lengkap (stok = 1) */}
            {unitDetailLoading && (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
                </div>
            )}

            {unitDetailTarget && (
                <UnitDetailModal
                    unit={unitDetailTarget.unit}
                    laptopName={unitDetailTarget.row.nama}
                    laptopMeta={[unitDetailTarget.row.brand, unitDetailTarget.row.cpu, unitDetailTarget.row.ram, unitDetailTarget.row.storage].filter(Boolean).join(" · ")}
                    laptopSpecs={[
                        { label: "Brand", value: unitDetailTarget.row.brand },
                        { label: "CPU", value: unitDetailTarget.row.cpu },
                        { label: "RAM", value: unitDetailTarget.row.ram },
                        { label: "Storage", value: unitDetailTarget.row.storage },
                    ]}
                    canEdit={canFullAccessBarang}
                    //  Tombol "+ Tambah Unit" & "Edit Data" di dalam pop-up ini digerbangi
                    //  CREATE_UNITS/EDIT_UNITS (memuat KEPALA_TEKNISI dkk) — bukan full-access.
                    //  Tanpa prop ini, canManage jatuh ke canEdit=full-access sehingga role
                    //  yang backend-nya SUDAH izinkan (mis. KEPALA_TEKNISI) tidak bisa nambah/
                    //  edit unit dari sini, padahal bisa lewat tombol "Tambah Unit" saat stok 0.
                    canManageUnit={canAddUnit}
                    canSeePrivate={canSeePrivate}
                    defaultSellingPrice={unitDetailTarget.row.harga_jual}
                    onClose={() => setUnitDetailTarget(null)}
                    onSaved={() => {
                        setUnitDetailTarget(null);
                        fetchAll();
                        toast.success("Data unit berhasil diperbarui");
                    }}
                    onCreated={(created: UnitDetailData) => {
                        setUnitDetailTarget(null);
                        fetchAll();
                        toast.success(`Unit dengan SN "${created.serial_number}" berhasil ditambahkan`);
                    }}
                />
            )}

            {/* ✅ FIX: blok render 2 modal AKSESORIS ini sebelumnya HILANG —
                state & logic-nya (addUnitAccessoryTarget, openAccessoryUnitDetail,
                handleRowClick) sudah benar, tapi tanpa render ini popup-nya
                tidak pernah benar-benar muncul di layar. */}
            {addUnitAccessoryTarget && (
                <AddUnitModalAccessory
                    accessoryId={addUnitAccessoryTarget.id}
                    accessoryName={addUnitAccessoryTarget.nama}
                    defaultSellingPrice={addUnitAccessoryTarget.harga_jual}
                    onClose={() => setAddUnitAccessoryTarget(null)}
                    onCreated={(unit) => {
                        setAddUnitAccessoryTarget(null);
                        fetchAll();
                        toast.success(`Unit dengan SN "${unit.serial_number}" berhasil ditambahkan`);
                    }}
                />
            )}

            {unitDetailAccessoryLoading && (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
                </div>
            )}

            {unitDetailAccessoryTarget && (
                <AccessoryUnitDetailModal
                    unit={unitDetailAccessoryTarget.unit}
                    accessoryName={unitDetailAccessoryTarget.row.nama}
                    accessoryMeta={[unitDetailAccessoryTarget.row.brand, unitDetailAccessoryTarget.row.spek].filter(Boolean).join(" · ")}
                    canEdit={canAddUnit}
                    canSeePrivate={canSeePrivate}
                    defaultSellingPrice={unitDetailAccessoryTarget.row.harga_jual}
                    onClose={() => setUnitDetailAccessoryTarget(null)}
                    onSaved={() => {
                        setUnitDetailAccessoryTarget(null);
                        fetchAll();
                        toast.success("Data unit berhasil diperbarui");
                    }}
                    onCreated={(created) => {
                        setUnitDetailAccessoryTarget(null);
                        fetchAll();
                        toast.success(`Unit dengan SN "${created.serial_number}" berhasil ditambahkan`);
                    }}
                />
            )}
        </>
    );
}

const inputCls = "w-full h-10 border border-zinc-200 rounded-xl px-3 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400";

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                {label}{required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

// ── Dipakai di kartu mobile ──────────────────────────────────────────────
// StatChip: null (bukan 0) berarti field ini memang tidak berlaku untuk tipe
// barang ini (mis. "Stok" untuk laptop, atau "ST/SJ/M" untuk aksesoris) →
// chip tidak dirender sama sekali, bukan ditampilkan sebagai "0".
function StatChip({ label, value, tone = "gray" }: { label: string; value: number | null; tone?: "gray" | "green" | "red" | "emerald" }) {
    if (value == null) return null;
    const toneCls: Record<string, string> = {
        gray: "bg-zinc-50 text-zinc-500 border-zinc-200",
        green: "bg-emerald-50 text-emerald-700 border-emerald-200",
        red: "bg-red-50 text-red-600 border-red-200",
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border tabular-nums ${toneCls[tone]}`}>
            {label} <span className="font-black">{value}</span>
        </span>
    );
}

// DetailItem: dipakai di panel "Lihat detail lengkap" pada kartu mobile.
// Cek eksplisit undefined/null/"" (bukan pakai `||`) supaya nilai 0 yang
// valid (mis. Gross Profit = 0) tetap tampil, bukan ikut dianggap kosong.
function DetailItem({ label, value }: { label: string; value?: string | number | null }) {
    const hasValue = value !== undefined && value !== null && value !== "";
    return (
        <div className="bg-zinc-50 rounded-lg px-2.5 py-1.5 border border-zinc-100">
            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{label}</p>
            <p className="text-[11px] font-semibold text-zinc-700 truncate">
                {hasValue ? value : <span className="text-zinc-300 font-normal">-</span>}
            </p>
        </div>
    );
}