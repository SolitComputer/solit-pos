
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Laptop as LaptopIcon, Wrench, History as HistoryIcon, Search, RotateCcw, X, Plus, Layers, Filter, Tag, Cpu } from "lucide-react";
import BarcodeModal from "@/components/ui/BarcodeModal";
import AddUnitModal, { CreatedUnit } from "@/components/inventory/AddUnitModal";
import UnitDetailModal, { UnitDetailData } from "@/components/inventory/UnitDetailModal";
import { getAuthUser } from "@/hooks/useAuthUser";
import { usePagePermission } from "@/hooks/usePagePermission";
import {
      UserRole, hasAnyRole, PERMISSIONS,
    LAPTOP_DELETE_ROLES, ACCESSORY_CREATE_ROLES, ACCESSORY_EDIT_ROLES, ACCESSORY_DELETE_ROLES,
    BARANG_PRIVATE_VIEW_ROLES, BARANG_FULL_ACCESS_ROLES, SO_ROLES, SO_LIMITED_USER_IDS, canSoLaptop,
} from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
type ItemType = "LAPTOP" | "AKSESORIS" | "SPAREPART";

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
interface AccessoryRaw {
    id: string; name: string; category: string; brand: string | null; spec: string | null;
    buy_price?: number; sell_price: number; stock: number; notes: string | null; created_at: string;
    audited_at?: string | null; audited_by?: string | null;
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
    const margin = (a.sell_price || 0) - (a.buy_price || 0);
    return {
        id: a.id, tipe: "AKSESORIS", nama: a.name, kategori: a.category,
        brand: a.brand || null, cpu: null, ram: null, storage: null, spek: a.spec || null,
        harga_modal: a.buy_price ?? null, modal_sparepart: null,
        harga_jual: a.sell_price || 0, total_jual: null,
        gross_profit: a.buy_price != null && a.buy_price > 0 ? margin : null,
        sumber: null, tanggal_masuk: null, sn: null,
        stok_tersedia: null, siap_jual: null, minus: null, stok: a.stock ?? 0,
        so_at: null, so_by: null,
        audited_at: a.audited_at ?? null, audited_by: a.audited_by ?? null,
        unit_count: 0, raw: a,
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
    const [search, setSearch] = useState("");
    const [filterSN, setFilterSN] = useState("");
    const [filterBrand, setFilterBrand] = useState("ALL");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterRam, setFilterRam] = useState("ALL");
    const [filterPriceRange, setFilterPriceRange] = useState("ALL");
    const [filterAudit, setFilterAudit] = useState("");
    const [sortBy, setSortBy] = useState("DEFAULT");

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

    const [categoryModalOpen, setCategoryModalOpen] = useState(false);

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch("/api/categories");
            const json = await res.json();
            if (json.success) setCategories(json.data);
        } catch { /* dropdown kosong kalau gagal, tidak fatal */ }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

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

    const isRowSparepart = useCallback((r: UnifiedRow, catList: typeof categories) => {
        const cat = catList.find(c => c.id === r.kategori_id);
        if (cat?.type === "SPAREPART") return true;
        const catName = (cat?.name || r.kategori || "").toUpperCase();
        const keywords = ["RAM", "SSD", "HDD", "SPAREPART", "PROCESSOR", "CPU", "LCD", "FAN", "KEYBOARD", "MOTHERBOARD", "BATERAI", "BATTERY"];
        return keywords.some(kw => catName.includes(kw));
    }, []);

    // Kategori dipisah per tipe dengan opsi SEMUA/UMUM/SPAREPART yang dapat diakses di kedua form
    const laptopCategories = useMemo(
        () => categories.filter(c => !c.type || c.type === "ALL" || c.type === "UMUM" || c.type === "LAPTOP" || c.type === "SPAREPART"),
        [categories],
    );
    const accessoryCategories = useMemo(
        () => categories.filter(c => !c.type || c.type === "ALL" || c.type === "UMUM" || c.type === "AKSESORIS" || c.type === "SPAREPART"),
        [categories],
    );
    // Opsi yang tampil di dropdown filter, mengikuti tipe yang sedang dipilih.
    const filterCategories = tipeFilter === "LAPTOP" ? laptopCategories
        : tipeFilter === "AKSESORIS" ? accessoryCategories
        : categories;

    // Jabarkan SEMUA kategori sebagai pill/tag beserta hitungan jumlah barangnya
    const categoryPills = useMemo(() => {
        const pills: { id: string; name: string; type?: string | null; count: number }[] = [];
        const seenNames = new Set<string>();

        // 1. Dari master categories di database
        categories.forEach(c => {
            const catNameUpper = (c.name || "").trim().toUpperCase();
            if (!catNameUpper) return;
            seenNames.add(catNameUpper);
            const count = rows.filter(r => {
                if (c.type === "LAPTOP") return r.kategori_id === c.id;
                if (c.type === "AKSESORIS") return r.kategori_id === c.id || (r.kategori || "").trim().toUpperCase() === catNameUpper;
                return r.kategori_id === c.id || (r.kategori || "").trim().toUpperCase() === catNameUpper;
            }).length;
            pills.push({ id: c.id, name: c.name.trim(), type: c.type, count });
        });

        // 2. Dari baris barang jika ada kategori unik yang belum terdaftar di master
        rows.forEach(r => {
            if (r.kategori && r.kategori.trim()) {
                const nameUpper = r.kategori.trim().toUpperCase();
                if (!seenNames.has(nameUpper)) {
                    seenNames.add(nameUpper);
                    const count = rows.filter(x => (x.kategori || "").trim().toUpperCase() === nameUpper).length;
                    pills.push({ id: `custom-${nameUpper}`, name: r.kategori.trim(), type: r.tipe, count });
                }
            }
        });

        // Urutkan: Kategori yang memiliki barang (>0) di depan, lalu alfabetis A-Z
        return pills.sort((a, b) => {
            if (a.count > 0 && b.count === 0) return -1;
            if (a.count === 0 && b.count > 0) return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
    }, [categories, rows]);

    // List Brand unik dari data
    const uniqueBrands = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(r => {
            if (r.brand && r.brand.trim()) set.add(r.brand.trim());
        });
        return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
    }, [rows]);

    // List RAM unik dari data
    const uniqueRams = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(r => {
            if (r.ram && r.ram.trim()) set.add(r.ram.trim().toUpperCase());
        });
        return ["ALL", ...Array.from(set).sort((a, b) => {
            const numA = parseInt(a) || 0;
            const numB = parseInt(b) || 0;
            return numA - numB;
        })];
    }, [rows]);

    const filteredRows = useMemo(() => {
        let list = rows;

        // 1. Tipe
        if (tipeFilter === "LAPTOP") list = list.filter(r => r.tipe === "LAPTOP");
        else if (tipeFilter === "AKSESORIS") list = list.filter(r => r.tipe === "AKSESORIS" && !isRowSparepart(r, categories));
        else if (tipeFilter === "SPAREPART") list = list.filter(r => isRowSparepart(r, categories));

        // 2. Kategori
        if (kategoriFilter) {
            const selectedCat = categories.find(c => c.id === kategoriFilter);
            const selectedName = (selectedCat ? selectedCat.name : kategoriFilter.replace(/^custom-/, "")).trim().toUpperCase();
            list = list.filter(r => {
                const matchLaptop = r.kategori_id === kategoriFilter;
                const matchAksesoris = (r.kategori || "").trim().toUpperCase() === selectedName || r.kategori_id === kategoriFilter;
                if (tipeFilter === "LAPTOP") return matchLaptop;
                if (tipeFilter === "AKSESORIS") return matchAksesoris;
                if (tipeFilter === "SPAREPART") return isRowSparepart(r, categories) && (matchLaptop || matchAksesoris);
                return r.tipe === "LAPTOP" ? matchLaptop : matchAksesoris;
            });
        }

        // 3. Search umum (Nama, Brand, CPU, Storage, Spek)
        if (search.trim()) {
            const t = search.toLowerCase();
            list = list.filter(r => (
                r.nama?.toLowerCase().includes(t) ||
                r.brand?.toLowerCase().includes(t) ||
                r.cpu?.toLowerCase().includes(t) ||
                r.ram?.toLowerCase().includes(t) ||
                r.storage?.toLowerCase().includes(t) ||
                r.spek?.toLowerCase().includes(t) ||
                r.sn?.toLowerCase().includes(t)
            ));
        }

        // 4. Search Khusus Serial Number (SN)
        if (filterSN.trim()) {
            const snQ = filterSN.trim().toLowerCase();
            list = list.filter(r => {
                if (r.sn && r.sn.toLowerCase().includes(snQ)) return true;
                if (r.tipe === "LAPTOP" && r.raw && "laptop_units" in r.raw) {
                    const units = (r.raw as LaptopRaw).laptop_units;
                    if (units && units.some(u => u.serial_number?.toLowerCase().includes(snQ))) return true;
                }
                return false;
            });
        }

        // 5. Filter Brand
        if (filterBrand !== "ALL") {
            const bQ = filterBrand.toLowerCase();
            list = list.filter(r => r.brand?.toLowerCase() === bQ);
        }

        // 6. Filter RAM
        if (filterRam !== "ALL") {
            const ramQ = filterRam.toUpperCase();
            list = list.filter(r => r.ram?.toUpperCase().includes(ramQ));
        }

        // 7. Filter Rentang Harga
        if (filterPriceRange !== "ALL") {
            list = list.filter(r => {
                const p = r.harga_jual || 0;
                switch (filterPriceRange) {
                    case "0-2": return p < 2000000;
                    case "2-3": return p >= 2000000 && p <= 3000000;
                    case "3-5": return p > 3000000 && p <= 5000000;
                    case "5-8": return p > 5000000 && p <= 8000000;
                    case "8+": return p > 8000000;
                    default: return true;
                }
            });
        }

        // 8. Filter Status Unit & Stok
        if (filterStatus !== "ALL") {
            list = list.filter(r => {
                if (filterStatus === "SIAP_JUAL") {
                    return (r.siap_jual ?? 0) > 0 || (r.stok ?? 0) > 0;
                }
                if (filterStatus === "BELUM_SIAP" || filterStatus === "SERVICE" || filterStatus === "RESERVED" || filterStatus === "HELD" || filterStatus === "PACKING") {
                    if (r.tipe === "LAPTOP" && r.raw && "laptop_units" in r.raw) {
                        return (r.raw as LaptopRaw).laptop_units?.some(u => u.status === filterStatus);
                    }
                    return false;
                }
                if (filterStatus === "TERSEDIA") {
                    return (r.stok_tersedia ?? r.stok ?? 0) > 0;
                }
                if (filterStatus === "HABIS") {
                    return (r.stok_tersedia ?? r.stok ?? 0) <= 0;
                }
                return true;
            });
        }

        // 9. Status Audit
        if (filterAudit) {
            const AUDIT_TTL = 2 * 24 * 60 * 60 * 1000;
            const isAudited = (r: UnifiedRow) => r.audited_at ? (Date.now() - new Date(r.audited_at).getTime() < AUDIT_TTL) : false;
            list = list.filter(r => filterAudit === "audited" ? isAudited(r) : !isAudited(r));
        }

        // 10. Sorting
        if (sortBy !== "DEFAULT") {
            list = [...list].sort((a, b) => {
                switch (sortBy) {
                    case "AZ": return a.nama.localeCompare(b.nama);
                    case "ZA": return b.nama.localeCompare(a.nama);
                    case "PRICE_ASC": return (a.harga_jual || 0) - (b.harga_jual || 0);
                    case "PRICE_DESC": return (b.harga_jual || 0) - (a.harga_jual || 0);
                    case "MODAL_ASC": return (a.harga_modal || 0) - (b.harga_modal || 0);
                    case "MODAL_DESC": return (b.harga_modal || 0) - (a.harga_modal || 0);
                    case "STOK_DESC": return (b.stok_tersedia ?? b.stok ?? 0) - (a.stok_tersedia ?? a.stok ?? 0);
                    case "STOK_ASC": return (a.stok_tersedia ?? a.stok ?? 0) - (b.stok_tersedia ?? b.stok ?? 0);
                    case "DATE_DESC": return (b.tanggal_masuk ? new Date(b.tanggal_masuk).getTime() : 0) - (a.tanggal_masuk ? new Date(a.tanggal_masuk).getTime() : 0);
                    case "DATE_ASC": return (a.tanggal_masuk ? new Date(a.tanggal_masuk).getTime() : 0) - (b.tanggal_masuk ? new Date(b.tanggal_masuk).getTime() : 0);
                    default: return 0;
                }
            });
        }

        return list;
    }, [rows, tipeFilter, kategoriFilter, search, filterSN, filterBrand, filterStatus, filterRam, filterPriceRange, filterAudit, sortBy, categories, isRowSparepart]);

    const counts = useMemo(() => ({
        total: rows.length,
        laptop: rows.filter(r => r.tipe === "LAPTOP").length,
        aksesoris: rows.filter(r => r.tipe === "AKSESORIS" && !isRowSparepart(r, categories)).length,
        sparepart: rows.filter(r => isRowSparepart(r, categories)).length,
    }), [rows, categories, isRowSparepart]);

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

    // ── Klik baris (desktop) / tap kartu (mobile) ───────────────────────────
    // Stok 0  → buka pop-up "Tambah Unit" (unit pertama belum ada).
    // Stok 1  → buka pop-up "Detail Unit" untuk edit SN yang sudah ada ATAU
    //           tambah unit baru (tombol "+ Tambah Unit" di dalam pop-up itu).
    // Stok >1 → TIDAK diberi aksi klik — edit SN dilakukan di halaman Units
    //           lewat tombol "Kelola Unit" yang sudah ada.
    const handleRowClick = (row: UnifiedRow) => {
        if (row.tipe !== "LAPTOP") return;
        if (row.unit_count === 0 && canAddUnit) {
            setAddUnitTarget(row);
            return;
        }
        if (row.unit_count === 1 && canViewUnits) {
            openUnitDetail(row);
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

    const hasFilter = (
        tipeFilter !== "ALL" ||
        !!kategoriFilter ||
        !!search.trim() ||
        !!filterSN.trim() ||
        filterBrand !== "ALL" ||
        filterStatus !== "ALL" ||
        filterRam !== "ALL" ||
        filterPriceRange !== "ALL" ||
        !!filterAudit ||
        sortBy !== "DEFAULT"
    );

    const resetFilter = () => {
        setTipeFilter("ALL");
        setKategoriFilter("");
        setSearch("");
        setFilterSN("");
        setFilterBrand("ALL");
        setFilterStatus("ALL");
        setFilterRam("ALL");
        setFilterPriceRange("ALL");
        setFilterAudit("");
        setSortBy("DEFAULT");
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
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <main className="min-h-screen bg-zinc-50 p-4 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-5">

                    {/* ── CARD FILTER & AKSI ──────────────────────────────── */}
                    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4 sm:p-5 space-y-3.5">
                        {/* Baris 1: Main Scope Switcher (Kiri) & Action Buttons (Kanan) */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                            {/* Segmented Control Scope */}
                            <div className="inline-flex p-1 bg-zinc-100/90 rounded-2xl border border-zinc-200/60 shadow-xs self-start flex-wrap gap-0.5">
                                {([
                                    ["ALL", `Semua`, counts.total, Layers],
                                    ["LAPTOP", `Laptop`, counts.laptop, LaptopIcon],
                                    ["AKSESORIS", `Aksesoris`, counts.aksesoris, Wrench],
                                    ["SPAREPART", `Sparepart`, counts.sparepart, Cpu],
                                ] as const).map(([key, label, count, Icon]) => {
                                    const isActive = tipeFilter === key && !kategoriFilter;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => {
                                                setTipeFilter(key);
                                                setKategoriFilter("");
                                            }}
                                            className={`inline-flex items-center gap-1.5 h-8 px-3 sm:px-3.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                                                isActive
                                                    ? "bg-white text-zinc-900 shadow-sm border border-zinc-200/80 font-bold"
                                                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50"
                                            }`}
                                        >
                                            <Icon size={13} className={isActive ? "text-zinc-900" : "text-zinc-400"} />
                                            <span>{label}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${isActive ? "bg-zinc-100 text-zinc-800 font-bold" : "text-zinc-400"}`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Tombol Tambah & Kategori Cepat */}
                            <div className="flex items-center gap-2 shrink-0">
                                {canCreateLaptop && (
                                    <button
                                        onClick={() => openCreate("LAPTOP")}
                                        className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-900 hover:to-black active:scale-[0.98] transition-all shadow-sm cursor-pointer"
                                    >
                                        <Plus size={13} />
                                        <span>Laptop</span>
                                    </button>
                                )}
                                {canCreateAcc && (
                                    <button
                                        onClick={() => openCreate("AKSESORIS")}
                                        className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-900 hover:to-black active:scale-[0.98] transition-all shadow-sm cursor-pointer"
                                    >
                                        <Plus size={13} />
                                        <span>Aksesori</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => setCategoryModalOpen(true)}
                                    className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-xl text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200/80 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
                                    title="Buat Kategori Baru"
                                >
                                    <Plus size={13} />
                                    <span>Kategori</span>
                                </button>
                            </div>
                        </div>

                        {/* Baris 2: Kategori Horizontal Scroll Tray (Rapi & Tidak Bleber) */}
                        {categoryPills.length > 0 && (
                            <div className="flex items-center gap-2 pt-0.5 pb-1">
                                <div className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 uppercase tracking-wider shrink-0 mr-0.5 hidden sm:flex">
                                    <Tag size={12} />
                                    <span>Kategori:</span>
                                </div>
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth flex-1">
                                    <button
                                        onClick={() => setKategoriFilter("")}
                                        className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium shrink-0 transition-all cursor-pointer ${
                                            !kategoriFilter
                                                ? "bg-zinc-900 text-white shadow-xs font-semibold"
                                                : "bg-zinc-50 border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                                        }`}
                                    >
                                        <span>Semua Kategori</span>
                                    </button>
                                    {categoryPills.map(cat => {
                                        const isActive = kategoriFilter === cat.id;
                                        return (
                                            <button
                                                key={cat.id}
                                                onClick={() => {
                                                    if (isActive) {
                                                        setKategoriFilter("");
                                                    } else {
                                                        setKategoriFilter(cat.id);
                                                        if (cat.type) setTipeFilter(cat.type as ItemType);
                                                    }
                                                }}
                                                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs shrink-0 transition-all cursor-pointer ${
                                                    isActive
                                                        ? "bg-zinc-900 text-white shadow-xs font-semibold ring-1 ring-zinc-900"
                                                        : "bg-zinc-50 border border-zinc-200/90 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                                                }`}
                                                title={`Filter kategori ${cat.name}`}
                                            >
                                                <span>{cat.name}</span>
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                                    isActive ? "bg-white/20 text-white" : "bg-zinc-200/80 text-zinc-600"
                                                }`}>
                                                    {cat.count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Baris Filter 1: Input Search, Search SN, Status, Brand, & Reset */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
                            {/* Input Pencarian Nama/Spek */}
                            <div className="relative lg:col-span-4">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Cari nama, brand, CPU, spek..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full h-9 pl-8.5 pr-7 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 text-zinc-900 placeholder:text-zinc-400 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 rounded"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Input Pencarian SN */}
                            <div className="relative lg:col-span-3">
                                <input
                                    type="text"
                                    placeholder="Cari Serial Number (SN)..."
                                    value={filterSN}
                                    onChange={(e) => setFilterSN(e.target.value)}
                                    className="w-full h-9 px-3 pr-7 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 text-zinc-900 placeholder:text-zinc-400 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all"
                                />
                                {filterSN && (
                                    <button
                                        type="button"
                                        onClick={() => setFilterSN("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 rounded"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Filter Status */}
                            <div className="lg:col-span-2">
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="w-full h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 hover:bg-white focus:bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all cursor-pointer"
                                >
                                    <option value="ALL">Semua Status</option>
                                    <option value="SIAP_JUAL">Siap Jual</option>
                                    <option value="BELUM_SIAP">Belum Siap</option>
                                    <option value="SERVICE">Service</option>
                                    <option value="RESERVED">Dipesan (DP)</option>
                                    <option value="HELD">Diambil Dulu</option>
                                    <option value="PACKING">Packing</option>
                                    <option value="TERSEDIA">Stok Ada (&gt;0)</option>
                                    <option value="HABIS">Stok Habis (0)</option>
                                </select>
                            </div>

                            {/* Filter Brand */}
                            <div className="lg:col-span-2">
                                <select
                                    value={filterBrand}
                                    onChange={(e) => setFilterBrand(e.target.value)}
                                    className="w-full h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 hover:bg-white focus:bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all cursor-pointer"
                                >
                                    {uniqueBrands.map((b) => (
                                        <option key={b} value={b}>
                                            {b === "ALL" ? "Semua Brand" : b}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Tombol Reset */}
                            <div className="lg:col-span-1 flex items-center">
                                <button
                                    onClick={resetFilter}
                                    disabled={!hasFilter}
                                    className={`w-full inline-flex items-center justify-center gap-1 h-9 px-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                                        hasFilter
                                            ? "bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300 active:scale-95 shadow-xs cursor-pointer"
                                            : "bg-zinc-100/70 border border-zinc-200/50 text-zinc-400 cursor-not-allowed opacity-60"
                                    }`}
                                    title={hasFilter ? "Reset semua filter" : "Tidak ada filter aktif"}
                                >
                                    <RotateCcw size={12} />
                                    <span>Reset</span>
                                </button>
                            </div>
                        </div>

                        {/* Baris Filter 2: Filter Kategori, RAM, Rentang Harga, Urutan, Audit */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                            {/* Filter Kategori */}
                            <div className="relative">
                                <select
                                    value={kategoriFilter}
                                    onChange={(e) => setKategoriFilter(e.target.value)}
                                    className="w-full h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 hover:bg-white focus:bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all cursor-pointer"
                                >
                                    <option value="">Semua Kategori</option>
                                    {filterCategories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Filter RAM */}
                            <div>
                                <select
                                    value={filterRam}
                                    onChange={(e) => setFilterRam(e.target.value)}
                                    className="w-full h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 hover:bg-white focus:bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all cursor-pointer"
                                >
                                    {uniqueRams.map((r) => (
                                        <option key={r} value={r}>
                                            {r === "ALL" ? "Semua RAM" : `RAM ${r}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Filter Rentang Harga */}
                            <div>
                                <select
                                    value={filterPriceRange}
                                    onChange={(e) => setFilterPriceRange(e.target.value)}
                                    className="w-full h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 hover:bg-white focus:bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all cursor-pointer"
                                >
                                    <option value="ALL">Semua Harga</option>
                                    <option value="0-2">&lt; Rp 2 jt</option>
                                    <option value="2-3">Rp 2 jt – 3 jt</option>
                                    <option value="3-5">Rp 3 jt – 5 jt</option>
                                    <option value="5-8">Rp 5 jt – 8 jt</option>
                                    <option value="8+">&ge; Rp 8 jt</option>
                                </select>
                            </div>

                            {/* Urutan / Sort */}
                            <div>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="w-full h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 hover:bg-white focus:bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all cursor-pointer"
                                >
                                    <option value="DEFAULT">Urutan Default</option>
                                    <option value="AZ">Nama: A → Z</option>
                                    <option value="ZA">Nama: Z → A</option>
                                    <option value="PRICE_ASC">Harga Jual: Rendah → Tinggi</option>
                                    <option value="PRICE_DESC">Harga Jual: Tinggi → Rendah</option>
                                    {canSeePrivate && <option value="MODAL_ASC">Modal: Rendah → Tinggi</option>}
                                    {canSeePrivate && <option value="MODAL_DESC">Modal: Tinggi → Rendah</option>}
                                    <option value="STOK_DESC">Stok: Terbanyak</option>
                                    <option value="STOK_ASC">Stok: Tersedikit</option>
                                    <option value="DATE_DESC">Tanggal: Terbaru</option>
                                    <option value="DATE_ASC">Tanggal: Terlama</option>
                                </select>
                            </div>

                            {/* Filter Audit */}
                            <div>
                                <select
                                    value={filterAudit}
                                    onChange={(e) => setFilterAudit(e.target.value)}
                                    className="w-full h-9 px-2.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50/60 hover:bg-white focus:bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all cursor-pointer"
                                >
                                    <option value="">Semua Audit</option>
                                    <option value="audited">Sudah Diaudit</option>
                                    <option value="unaudited">Belum Diaudit</option>
                                </select>
                            </div>
                        </div>

                        {/* Indikator Filter Aktif & Total Hasil */}
                        {hasFilter && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 text-[11px] text-zinc-500 border-t border-zinc-100">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-zinc-700">Filter Aktif:</span>
                                    {tipeFilter !== "ALL" && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            Tipe: {tipeFilter === "LAPTOP" ? "Laptop" : "Aksesoris"}
                                            <button onClick={() => setTipeFilter("ALL")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {search && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            Cari: &ldquo;{search}&rdquo;
                                            <button onClick={() => setSearch("")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {filterSN && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            SN: &ldquo;{filterSN}&rdquo;
                                            <button onClick={() => setFilterSN("")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {filterStatus !== "ALL" && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            Status: {filterStatus}
                                            <button onClick={() => setFilterStatus("ALL")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {filterBrand !== "ALL" && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            Brand: {filterBrand}
                                            <button onClick={() => setFilterBrand("ALL")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {kategoriFilter && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            Kategori: {categories.find(c => c.id === kategoriFilter)?.name || "Kategori"}
                                            <button onClick={() => setKategoriFilter("")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {filterRam !== "ALL" && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            RAM: {filterRam}
                                            <button onClick={() => setFilterRam("ALL")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {filterPriceRange !== "ALL" && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            Harga: {filterPriceRange}
                                            <button onClick={() => setFilterPriceRange("ALL")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {filterAudit && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            Audit: {filterAudit === "audited" ? "Sudah Diaudit" : "Belum Diaudit"}
                                            <button onClick={() => setFilterAudit("")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                    {sortBy !== "DEFAULT" && (
                                        <span className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                            Sort: {sortBy}
                                            <button onClick={() => setSortBy("DEFAULT")} className="hover:text-zinc-900"><X size={11} /></button>
                                        </span>
                                    )}
                                </div>
                                <span className="font-medium text-zinc-400 shrink-0">
                                    Ditemukan <strong className="text-zinc-800">{filteredRows.length}</strong> barang
                                </span>
                            </div>
                        )}
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
                                    const isRowClickable = row.tipe === "LAPTOP" && (
                                        (row.unit_count === 0 && canAddUnit) ||
                                        (row.unit_count === 1 && canViewUnits)
                                    );
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
                                                const isRowClickable = row.tipe === "LAPTOP" && (
                                                    (row.unit_count === 0 && canAddUnit) ||
                                                    (row.unit_count === 1 && canViewUnits)
                                                );
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

            {/* ── Pop-up Buat Kategori Cepat ──────────────────────────── */}
            <CategoryQuickModal
                isOpen={categoryModalOpen}
                onClose={() => setCategoryModalOpen(false)}
                onSuccess={() => {
                    fetchCategories();
                }}
            />
        </>
    );
}

// ── Pop-up Form Tambah Kategori Cepat ───────────────────────────────────────
function CategoryQuickModal({
    isOpen,
    onClose,
    onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [type, setType] = useState<string>("ALL");
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!name.trim()) return toast.error("Nama kategori wajib diisi");

        setSubmitting(true);
        try {
            const res = await fetch("/api/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                    type: type === "ALL" ? null : type,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal menyimpan kategori");
            toast.success(`Kategori "${name.trim()}" berhasil dibuat!`);
            setName("");
            setDescription("");
            setType("ALL");
            onSuccess();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally {
            setSubmitting(false);
        }
    };

    const typeOptions = [
        { value: "ALL", label: "Semua / Umum", desc: "Bisa untuk Laptop, Aksesoris & Sparepart" },
        { value: "LAPTOP", label: "Laptop / Unit", desc: "Khusus untuk unit laptop" },
        { value: "AKSESORIS", label: "Aksesoris", desc: "Charger, Tas, Kabel, Mouse, dll" },
        { value: "SPAREPART", label: "Sparepart / Part", desc: "RAM, SSD, HDD, Fan, LCD, dll" },
    ];

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn"
            onClick={onClose}
        >
            <div
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-popIn"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-white">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
                            <Layers size={16} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-zinc-900">Tambah Kategori Baru</h3>
                            <p className="text-[11px] text-zinc-400">Buat kategori produk langsung tanpa pindah tab</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                            Nama Kategori <span className="text-red-500">*</span>
                        </label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Contoh: RAM PC4, SSD NVMe, Adapter Charger, Fan, dll..."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                            Tipe / Pengelompokan Kategori
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {typeOptions.map(t => (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setType(t.value)}
                                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                        type === t.value
                                            ? "border-zinc-900 bg-zinc-900 text-white shadow-sm ring-1 ring-zinc-900"
                                            : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                                    }`}
                                >
                                    <div className="text-xs font-bold">{t.label}</div>
                                    <div className={`text-[10px] mt-0.5 line-clamp-1 ${type === t.value ? "text-zinc-300" : "text-zinc-400"}`}>
                                        {t.desc}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                            Deskripsi (Opsional)
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={2}
                            placeholder="Keterangan singkat tentang kategori ini…"
                            className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
                        />
                    </div>
                </div>

                <div className="flex gap-2 px-5 py-4 border-t border-zinc-100 bg-zinc-50/50">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
                    >
                        Batal
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-900 hover:to-black text-white text-sm font-semibold transition disabled:opacity-60 active:scale-[0.98] shadow-sm cursor-pointer"
                    >
                        {submitting ? "Menyimpan…" : "Simpan Kategori"}
                    </button>
                </div>
            </div>
        </div>
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