"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { toast } from "sonner";
import { Search, X, Check, Ban, RotateCcw, Laptop as LaptopIcon, Wrench, Package, HandHelping, Camera, ChevronDown, ChevronUp } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getAuthUser } from "@/hooks/useAuthUser";
import { UserRole, hasAnyRole, ITEM_LOAN_APPROVE_ROLES } from "@/lib/permissions";
import { notifyItemLoanResolved } from "@/hooks/useItemLoanNotify";

interface SnResult {
    item_type: "LAPTOP" | "AKSESORIS";
    item_id: string; unit_id: string | null; serial_number: string | null; item_name: string; status: string;
}
interface LoanRow {
    id: string; batch_id: string | null; item_type: "LAPTOP" | "AKSESORIS"; item_id: string;
    unit_id: string | null; serial_number: string | null; item_name: string;
    borrower_id: string; borrower_name: string; notes: string | null;
    category: "KEBUTUHAN" | "PESANAN" | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "RETURNED" | "SOLD" | "RETURN_PENDING" | "DIPESAN";
    approved_by_name: string | null; approved_at: string | null; returned_at: string | null; created_at: string;
    sold_at: string | null; sold_invoice: string | null;
}

const STATUS_META: Record<LoanRow["status"], { label: string; cls: string }> = {
    PENDING: { label: "Menunggu", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    APPROVED: { label: "Dipinjam", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    REJECTED: { label: "Ditolak", cls: "bg-rose-50 text-rose-600 border-rose-200" },
    RETURNED: { label: "Dikembalikan", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" },
    SOLD: { label: "Terjual", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    RETURN_PENDING: { label: "Menunggu Pengembalian", cls: "bg-orange-50 text-orange-700 border-orange-200" },
    DIPESAN: { label: "Di Pesan", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

// Format tanggal+jam WIB untuk kolom waktu pinjam.
const fmtWaktu = (iso: string | null) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
};

export default function ItemLoansPage() {
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const [userName, setUserName] = useState("");
    const [userId, setUserId] = useState("");
    const canApprove = hasAnyRole(userRoles, ITEM_LOAN_APPROVE_ROLES);

    const [snQuery, setSnQuery] = useState("");
    const [snResults, setSnResults] = useState<SnResult[]>([]);
    const [snOpen, setSnOpen] = useState(false);
    const [cart, setCart] = useState<SnResult[]>([]);
    const [notes, setNotes] = useState("");
    const [category, setCategory] = useState<"KEBUTUHAN" | "PESANAN">("KEBUTUHAN");
    const [submitting, setSubmitting] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);

    // Scanner KAMERA (html5-qrcode)
    const [scanOpen, setScanOpen] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const cameraRef = useRef<Html5Qrcode | null>(null);

    const [loans, setLoans] = useState<LoanRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"PENDING" | "APPROVED" | "DIPESAN" | "HISTORY">("PENDING");
    const [actingId, setActingId] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null); // kelompok yang sedang dibuka detailnya
    const [bulkBusyKey, setBulkBusyKey] = useState<string | null>(null);  // penanda aksi massal sedang berjalan

    // Filter & search khusus tab Riwayat (HISTORY)
    const [historyFilter, setHistoryFilter] = useState<"ALL" | "SOLD" | "RETURNED">("ALL");
    const [historySearch, setHistorySearch] = useState("");

    // Search khusus tab Sedang Dipinjam (APPROVED)
    const [approvedSearch, setApprovedSearch] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const u = await getAuthUser();
                const roles: string[] = Array.isArray((u as any)?.roles) && (u as any).roles.length > 0
                    ? (u as any).roles : u?.role ? [u.role] : [];
                setUserRoles(roles as UserRole[]);
                setUserName((u as any)?.name ?? "");
                setUserId((u as any)?.id ?? "");
            } catch { setUserRoles([]); }
        })();
    }, []);

    const fetchLoans = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/item-loans");
            const json = await res.json();
            if (json.success) setLoans(json.data as LoanRow[]);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, []);
    useEffect(() => { fetchLoans(); }, [fetchLoans]);

    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (snQuery.trim().length < 2) { setSnResults([]); return; }
        searchTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/item-loans/search-sn?q=${encodeURIComponent(snQuery.trim())}`);
                const json = await res.json();
                if (json.success) { setSnResults(json.data as SnResult[]); setSnOpen(true); }
            } catch { /* ignore */ }
        }, 300);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [snQuery]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSnOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    // Kunci unik 1 unit barang — cegah SN/unit yang sama masuk keranjang 2x.
    const cartKey = (x: SnResult) => `${x.item_type}-${x.item_id}-${x.unit_id ?? "parent"}`;

    const pickSn = (r: SnResult) => {
        setCart(prev => prev.some(p => cartKey(p) === cartKey(r)) ? prev : [...prev, r]);
        setSnQuery("");      // kosongkan field → langsung bisa scan/ketik barang berikutnya
        setSnResults([]);
        setSnOpen(false);
    };

    // Dipicu saat tekan Enter — barcode scanner mengetik SN lalu kirim Enter.
    // Barcode kita meng-encode serial_number langsung, jadi scan == ketik SN + Enter.
    // `raw` dibaca dari DOM (e.currentTarget.value) supaya kebal dari lag state React.
    const handleSnEnter = async (raw: string) => {
        const q = raw.trim();
        if (q.length < 2) return;

        // Scanner sering lebih cepat dari debounce 300ms → fetch fresh saat Enter.
        let results = snResults;
        try {
            const res = await fetch(`/api/item-loans/search-sn?q=${encodeURIComponent(q)}`);
            const json = await res.json();
            if (json.success) results = json.data as SnResult[];
        } catch { /* fallback: pakai hasil yang sudah ada */ }

        // 1) SN cocok persis (hasil scan barcode selalu lewat sini).
        const exact = results.find(
            r => (r.serial_number ?? "").trim().toLowerCase() === q.toLowerCase(),
        );
        if (exact) { pickSn(exact); return; }

        // 2) Cuma 1 hasil → langsung pilih.
        if (results.length === 1) { pickSn(results[0]); return; }

        // 3) Tidak ada hasil → SN salah / unit tidak tersedia.
        if (results.length === 0) { toast.error(`"${q}" tidak ditemukan / unit tidak tersedia`); return; }

        // 4) Banyak hasil & bukan SN persis (user mengetik nama) → buka dropdown manual.
        setSnResults(results); setSnOpen(true);
    };

    // ── Scanner KAMERA — buka kamera, decode barcode, lalu isi field SN &
    // auto-pilih lewat handleSnEnter. Library & konfig SAMA PERSIS dgn
    // /scan/camera (BarcodeDetector native + format 1D Code128/39 dst).
    useEffect(() => {
        if (!scanOpen) return;
        let cancelled = false;
        const scanner = new Html5Qrcode("loan-camera-reader", {
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.CODABAR,
            ],
            verbose: false,
        });
        cameraRef.current = scanner;

        scanner.start(
            { facingMode: "environment" },
            {
                videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
                fps: 15,
                qrbox: (w: number, h: number) => {
                    const width = Math.min(w - 32, 400);
                    const height = Math.min(Math.max(110, Math.floor(width * 0.4)), h - 32);
                    return { width, height };
                },
                aspectRatio: 1.777,
            },
            async (decodedText) => {
                if (cancelled) return;
                // Bersihkan: buang karakter kontrol + AIM prefix (]C1, ]A0, ]Q0 dll)
                // yg ditambah BarcodeDetector. Tanpa ini SN jadi "]C1xxx" → 404.
                const sn = decodedText
                    .replace(/[\u0000-\u001F\u007F]/g, "")
                    .replace(/^\][A-Za-z]\d/, "")
                    .trim();
                if (!sn) return;
                cancelled = true;
                try { if (scanner.isScanning) await scanner.stop(); } catch { /* abaikan */ }
                setScanOpen(false);
                setSnQuery(sn);
                handleSnEnter(sn); // auto-cari & auto-pilih, sama seperti scan fisik
            },
            () => { /* per-frame gagal decode — normal, diabaikan */ },
        ).catch((err) => {
            if (!cancelled) setScanError("Gagal membuka kamera: " + String(err));
        });

        return () => {
            cancelled = true;
            const s = cameraRef.current;
            cameraRef.current = null;
            if (s && s.isScanning) { s.stop().catch(() => { }); }
        };
    }, [scanOpen]);

    const resetForm = () => { setCart([]); setSnQuery(""); setNotes(""); setSnResults([]); setCategory("KEBUTUHAN"); };

    const submit = async () => {
        if (cart.length === 0) { toast.error("Pilih barang & SN dulu"); return; }
        setSubmitting(true);
        try {
            // 1 kali submit = 1 batch_id → semua barang di keranjang terikat dalam satu transaksi peminjaman.
            const batchId = crypto.randomUUID();
            // Kirim paralel — tiap barang = 1 baris, tapi berbagi batch_id yang sama.
            const outcomes = await Promise.all(
                cart.map(async (item) => {
                    try {
                        const res = await fetch("/api/item-loans", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                item_type: item.item_type, item_id: item.item_id, unit_id: item.unit_id,
                                serial_number: item.serial_number, item_name: item.item_name, notes, category,
                                batch_id: batchId,
                            }),
                        });
                        const json = await res.json();
                        if (!json.success) throw new Error(json.message || "Gagal");
                        return { item, ok: true as const };
                    } catch (e) {
                        return { item, ok: false as const, msg: e instanceof Error ? e.message : "Gagal" };
                    }
                }),
            );

            const okCount = outcomes.filter(o => o.ok).length;
            const failed = outcomes.filter((o): o is { item: SnResult; ok: false; msg: string } => !o.ok);

            if (okCount > 0) toast.success(`${okCount} pengajuan pinjaman terkirim`);
            failed.forEach(f => toast.error(`${f.item.item_name}: ${f.msg}`));

            if (failed.length === 0) {
                resetForm();                        // semua sukses → bersihkan form
            } else {
                setCart(failed.map(f => f.item));   // sisakan yang gagal supaya bisa diulang
                setSnQuery(""); setSnResults([]);
            }
            fetchLoans();
        } finally { setSubmitting(false); }
    };

    const act = async (id: string, action: "approve" | "reject" | "request-return" | "approve-return" | "reject-return") => {
        setActingId(id);
        try {
            const res = await fetch(`/api/item-loans/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal memproses");
            const msg: Record<string, string> = {
                "approve": "Pinjaman disetujui",
                "reject": "Pinjaman ditolak",
                "request-return": "Pengajuan pengembalian terkirim",
                "approve-return": "Pengembalian disetujui — masuk Riwayat",
                "reject-return": "Pengajuan pengembalian ditolak",
            };
            toast.success(msg[action] ?? "Berhasil diproses");
            notifyItemLoanResolved(id);
            fetchLoans();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal memproses");
        } finally { setActingId(null); }
    };

    // Jalankan 1 action untuk banyak barang sekaligus (aksi massal per kelompok).
    // Memakai endpoint [id] yang sudah ada — backend tidak perlu diubah.
    const actMany = async (ids: string[], action: Parameters<typeof act>[1]) => {
        if (ids.length === 0) return;
        setBulkBusyKey(action + ids.join(","));
        try {
            const results = await Promise.all(ids.map(async (id) => {
                try {
                    const res = await fetch(`/api/item-loans/${id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action }),
                    });
                    const json = await res.json();
                    return json.success === true;
                } catch { return false; }
            }));
            const ok = results.filter(Boolean).length;
            if (ok > 0) toast.success(`${ok} barang diproses`);
            if (ok < ids.length) toast.error(`${ids.length - ok} barang gagal diproses`);
            ids.forEach(id => notifyItemLoanResolved(id));
            fetchLoans();
        } finally { setBulkBusyKey(null); }
    };

    // Status gabungan 1 kelompok: kalau semua barang sama → status itu; kalau campur → "MIXED".
    const groupStatus = (items: LoanRow[]): LoanRow["status"] | "MIXED" => {
        const uniq = Array.from(new Set(items.map(i => i.status)));
        return uniq.length === 1 ? uniq[0] : "MIXED";
    };

    // Tombol aksi untuk SATU barang — dipakai ulang di dalam panel detail.
    const renderItemActions = (l: LoanRow) => {
        if (l.status === "PENDING" && canApprove) {
            return (
                <div className="flex items-center gap-1.5">
                    <button onClick={() => act(l.id, "approve")} disabled={actingId === l.id}
                        className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-40 flex items-center gap-1">
                        <Check size={12} /> Approve
                    </button>
                    <button onClick={() => act(l.id, "reject")} disabled={actingId === l.id}
                        className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition disabled:opacity-40 flex items-center gap-1">
                        <Ban size={12} /> Reject
                    </button>
                </div>
            );
        }
        if (l.status === "APPROVED" && (canApprove || l.borrower_id === userId)) {
            return (
                <button onClick={() => act(l.id, "request-return")} disabled={actingId === l.id}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition disabled:opacity-40 flex items-center gap-1">
                    <RotateCcw size={12} /> Ajukan Pengembalian
                </button>
            );
        }
        if (l.status === "RETURN_PENDING" && canApprove) {
            return (
                <div className="flex items-center gap-1.5">
                    <button onClick={() => act(l.id, "approve-return")} disabled={actingId === l.id}
                        className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-40 flex items-center gap-1">
                        <Check size={12} /> Setujui
                    </button>
                    <button onClick={() => act(l.id, "reject-return")} disabled={actingId === l.id}
                        className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition disabled:opacity-40 flex items-center gap-1">
                        <Ban size={12} /> Tolak
                    </button>
                </div>
            );
        }
        if (l.status === "RETURN_PENDING") {
            return <span className="text-[11px] text-orange-600 font-medium">Menunggu ACC pengembalian</span>;
        }
        if (l.status === "DIPESAN") {
            return <span className="text-[11px] text-indigo-600 font-medium">Dipesan (di Riwayat Pending)</span>;
        }
        return <span className="text-[11px] text-zinc-400">{l.approved_by_name ? `oleh ${l.approved_by_name}` : "-"}</span>;
    };

    const visibleLoans = loans.filter(l => {
        // Tab PENDING — tampil apa adanya.
        if (tab === "PENDING") return l.status === "PENDING";
        // Tab APPROVED (Sedang Dipinjam) — bisa dicari peminjam/barang/SN/keterangan.
        if (tab === "APPROVED") {
            if (l.status !== "APPROVED" && l.status !== "RETURN_PENDING") return false;
            const q = approvedSearch.trim().toLowerCase();
            if (q) {
                const hay = [l.borrower_name, l.item_name, l.serial_number ?? "", l.notes ?? ""]
                    .join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        }
        if (tab === "DIPESAN") return l.status === "DIPESAN";

        // Tab HISTORY (Riwayat): REJECTED / RETURNED / SOLD.
        const isHistory = l.status === "REJECTED" || l.status === "RETURNED" || l.status === "SOLD";
        if (!isHistory) return false;

        // Sub-filter status: Semua / Terjual / Dikembalikan.
        if (historyFilter === "SOLD" && l.status !== "SOLD") return false;
        if (historyFilter === "RETURNED" && l.status !== "RETURNED") return false;

        // Search: peminjam / barang / SN / keterangan (case-insensitive).
        const q = historySearch.trim().toLowerCase();
        if (q) {
            const hay = [l.borrower_name, l.item_name, l.serial_number ?? "", l.notes ?? ""]
                .join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    // Kelompokkan baris yang SUDAH difilter per-tab berdasarkan batch_id.
    // Baris lama (batch_id null) → jadi kelompok sendiri pakai id-nya.
    // 1 user + 1 transaksi = 1 baris; barang-barangnya jadi anak kelompok.
    const groupedLoans = Object.values(
        visibleLoans.reduce<Record<string, {
            key: string; borrower_name: string; borrower_id: string;
            category: LoanRow["category"]; created_at: string; items: LoanRow[];
        }>>((acc, l) => {
            const key = l.batch_id ?? l.id;
            if (!acc[key]) acc[key] = {
                key, borrower_name: l.borrower_name, borrower_id: l.borrower_id,
                category: l.category, created_at: l.created_at, items: [],
            };
            acc[key].items.push(l);
            return acc;
        }, {}),
    ).sort((a, b) => b.created_at.localeCompare(a.created_at));

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-zinc-50 p-3 sm:p-6 lg:p-8">
                <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">

                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3.5 px-4 sm:px-6 py-4 sm:py-5">
                            <div className="w-11 h-11 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-zinc-900/25">
                                <HandHelping className="w-[22px] h-[22px] text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight leading-tight truncate">Peminjaman Barang</h1>
                                <p className="text-[11.5px] text-zinc-400 mt-1 truncate">Ajukan pinjam barang inventaris, lalu disetujui Pengelola Barang</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 sm:p-5 space-y-3.5">
                        <h3 className="text-[13px] font-bold text-zinc-700 pb-3 border-b border-zinc-100">Ajukan Peminjaman Barang</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Nama Peminjam</label>
                                <input disabled value={userName}
                                    className="w-full h-10 border border-zinc-200 rounded-xl px-3 text-sm bg-zinc-100 text-zinc-600 cursor-not-allowed" />
                            </div>
                            <div className="relative" ref={boxRef}>
                                <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Nama Barang — SN</label>
                                <div className="relative">
                                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                                    <input value={snQuery}
                                        onChange={e => setSnQuery(e.target.value)}
                                        onFocus={() => snResults.length > 0 && setSnOpen(true)}
                                        onKeyDown={e => {
                                            // ✅ SCANNER BARCODE: barcode kami meng-encode SN; scanner USB/BT mengetik
                                            // SN lalu menekan Enter. handleSnEnter fetch fresh + cocokkan SN persis,
                                            // jadi tetap jalan walau scanner lebih cepat dari debounce 300ms.
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleSnEnter(e.currentTarget.value);
                                            }
                                        }}
                                        placeholder="Scan barcode / ketik SN / nama barang..."
                                        className="w-full h-10 border border-zinc-200 rounded-xl pl-9 pr-8 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                                    {snQuery && (
                                        <button onClick={() => { setSnQuery(""); setSnResults([]); }} className="absolute right-2.5 top-3 text-zinc-400 hover:text-zinc-600">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <button type="button" onClick={() => { setScanError(null); setScanOpen(true); }}
                                    className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 hover:text-violet-900">
                                    <Camera size={13} /> Scan pakai kamera
                                </button>
                                {snOpen && snResults.length > 0 && (
                                    <div className="absolute z-30 mt-1.5 w-full bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                                        {snResults.map(r => (
                                            <button key={`${r.item_type}-${r.item_id}-${r.unit_id ?? "parent"}`} onClick={() => pickSn(r)}
                                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 text-left">
                                                {r.item_type === "LAPTOP" ? <LaptopIcon size={13} className="text-zinc-500 flex-shrink-0" /> : <Wrench size={13} className="text-zinc-500 flex-shrink-0" />}
                                                <span className="text-xs text-zinc-700 truncate flex-1">{r.item_name}</span>
                                                {r.serial_number
                                                    ? <span className="text-[11px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">{r.serial_number}</span>
                                                    : <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">tanpa SN</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Daftar barang yang mau dipinjam (keranjang) ── */}
                        {cart.length > 0 && (
                            <div className="space-y-2 pt-1">
                                <div className="flex items-center justify-between">
                                    <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Daftar Barang ({cart.length})</label>
                                    <button type="button" onClick={() => setCart([])}
                                        className="text-[11px] font-semibold text-rose-500 hover:text-rose-700">Kosongkan</button>
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {cart.map((c, i) => (
                                        <div key={`${c.item_type}-${c.item_id}-${c.unit_id ?? "parent"}`}
                                            className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
                                            {c.item_type === "LAPTOP"
                                                ? <LaptopIcon size={14} className="text-zinc-500 flex-shrink-0" />
                                                : <Wrench size={14} className="text-zinc-500 flex-shrink-0" />}
                                            <span className="text-xs text-zinc-700 truncate flex-1">{c.item_name}</span>
                                            {c.serial_number
                                                ? <span className="text-[11px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">{c.serial_number}</span>
                                                : <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">tanpa SN</span>}
                                            <button type="button" onClick={() => setCart(prev => prev.filter((_, idx) => idx !== i))}
                                                className="text-zinc-400 hover:text-rose-600 flex-shrink-0">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Kategori</label>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { k: "KEBUTUHAN", l: "Kebutuhan" },
                                    { k: "PESANAN", l: "Pesanan" },
                                ] as const).map(c => (
                                    <button key={c.k} type="button" onClick={() => setCategory(c.k)}
                                        className={`h-10 rounded-xl text-sm font-semibold border transition ${category === c.k ? "bg-zinc-900 text-white border-zinc-900" : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"}`}>
                                        {c.l}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Keterangan</label>
                            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder="Tujuan pinjam, estimasi dikembalikan, dll"
                                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none" />
                        </div>
                        <div className="flex justify-end">
                            <button onClick={submit} disabled={submitting || cart.length === 0}
                                className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-900 hover:to-black transition disabled:opacity-50 flex items-center gap-2">
                                {submitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                Ajukan Pinjaman{cart.length > 0 ? ` (${cart.length})` : ""}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                        <div className="flex gap-1.5 p-2 border-b border-zinc-100">
                            {([
                                { k: "PENDING", l: "Menunggu" },
                                { k: "APPROVED", l: "Sedang Dipinjam" },
                                { k: "DIPESAN", l: "Di Pesan" },
                                { k: "HISTORY", l: "Riwayat" },
                            ] as const).map(t => (
                                <button key={t.k} onClick={() => setTab(t.k)}
                                    className={`px-3 h-9 rounded-xl text-xs font-semibold transition ${tab === t.k ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                                    {t.l}
                                </button>
                            ))}
                        </div>

                        {tab === "APPROVED" && (
                            <div className="px-3 py-3 border-b border-zinc-100">
                                <div className="relative">
                                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                                    <input value={approvedSearch} onChange={e => setApprovedSearch(e.target.value)}
                                        placeholder="Cari peminjam, barang, SN, keterangan..."
                                        className="w-full h-9 border border-zinc-200 rounded-xl pl-9 pr-8 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                                    {approvedSearch && (
                                        <button onClick={() => setApprovedSearch("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {tab === "HISTORY" && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 px-3 py-3 border-b border-zinc-100">
                                <div className="relative flex-1 min-w-0">
                                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                                    <input value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                                        placeholder="Cari peminjam, barang, SN, keterangan..."
                                        className="w-full h-9 border border-zinc-200 rounded-xl pl-9 pr-8 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                                    {historySearch && (
                                        <button onClick={() => setHistorySearch("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-1.5 flex-shrink-0">
                                    {([
                                        { k: "ALL", l: "Semua" },
                                        { k: "SOLD", l: "Terjual" },
                                        { k: "RETURNED", l: "Dikembalikan" },
                                    ] as const).map(f => (
                                        <button key={f.k} onClick={() => setHistoryFilter(f.k)}
                                            className={`px-3 h-9 rounded-xl text-xs font-semibold transition ${historyFilter === f.k ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                                            {f.l}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="py-14 flex flex-col items-center justify-center gap-3 text-zinc-400">
                                <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
                                <p className="text-sm">Memuat data...</p>
                            </div>
                        ) : visibleLoans.length === 0 ? (
                            <div className="py-14 px-4 text-center">
                                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center">
                                    <Package size={26} className="text-zinc-300" />
                                </div>
                                <p className="text-sm font-medium text-zinc-400">Belum ada data</p>
                                <p className="text-xs text-zinc-300 mt-1">Data peminjaman akan muncul di sini</p>
                            </div>
                        ) : (
                            <div className="overflow-auto max-h-[70vh]">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-zinc-50 border-b border-zinc-100">
                                            {["Peminjam", "Barang", "Kategori", "Waktu", "Status", "Aksi"].map(h => (
                                                <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap bg-zinc-50">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedLoans.map(g => {
                                            const gs = groupStatus(g.items);
                                            const meta = gs === "MIXED" ? null : STATUS_META[gs];
                                            const isOpen = expandedKey === g.key;
                                            // id barang per status → untuk aksi massal
                                            const pendingIds = g.items.filter(i => i.status === "PENDING").map(i => i.id);
                                            const approvedIds = g.items.filter(i => i.status === "APPROVED").map(i => i.id);
                                            const returnPendingIds = g.items.filter(i => i.status === "RETURN_PENDING").map(i => i.id);
                                            const busy = bulkBusyKey !== null;
                                            return (
                                                <Fragment key={g.key}>
                                                    <tr className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                                                        <td className="px-3 py-3 font-semibold text-zinc-800 whitespace-nowrap align-top">{g.borrower_name}</td>
                                                        <td className="px-3 py-3 align-top">
                                                            <div className="flex flex-col gap-1">
                                                                {g.items.map(it => (
                                                                    <div key={it.id} className="flex items-center gap-1.5">
                                                                        {it.item_type === "LAPTOP"
                                                                            ? <LaptopIcon size={13} className="text-zinc-400 flex-shrink-0" />
                                                                            : <Wrench size={13} className="text-zinc-400 flex-shrink-0" />}
                                                                        <span className="text-[13px] text-zinc-700">{it.item_name}</span>
                                                                        {it.serial_number && <span className="font-mono text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">{it.serial_number}</span>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 align-top">
                                                            {g.category ? (
                                                                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${g.category === "PESANAN" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                                                                    {g.category === "PESANAN" ? "Pesanan" : "Kebutuhan"}
                                                                </span>
                                                            ) : <span className="text-zinc-300">-</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-[11px] text-zinc-500 whitespace-nowrap tabular-nums align-top">{fmtWaktu(g.created_at)}</td>
                                                        <td className="px-3 py-3 align-top whitespace-nowrap">
                                                            {meta
                                                                ? <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold border ${meta.cls}`}>{meta.label}</span>
                                                                : <span className="inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold border bg-zinc-100 text-zinc-600 border-zinc-200">Campuran</span>}
                                                            <span className="ml-1.5 text-[10px] text-zinc-400">{g.items.length} barang</span>
                                                        </td>
                                                        <td className="px-3 py-3 align-top">
                                                            <button onClick={() => setExpandedKey(isOpen ? null : g.key)}
                                                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition flex items-center gap-1">
                                                                {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Detail
                                                            </button>
                                                        </td>
                                                    </tr>

                                                    {isOpen && (
                                                        <tr className="bg-zinc-50/60 border-b border-zinc-100">
                                                            <td colSpan={6} className="px-3 py-3">
                                                                {/* ── Aksi massal (per status yang relevan) ── */}
                                                                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                                                                    {canApprove && pendingIds.length > 0 && (
                                                                        <>
                                                                            <button onClick={() => actMany(pendingIds, "approve")} disabled={busy}
                                                                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-40 flex items-center gap-1">
                                                                                <Check size={12} /> Approve Semua
                                                                            </button>
                                                                            <button onClick={() => actMany(pendingIds, "reject")} disabled={busy}
                                                                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition disabled:opacity-40 flex items-center gap-1">
                                                                                <Ban size={12} /> Reject Semua
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    {(canApprove || g.borrower_id === userId) && approvedIds.length > 0 && (
                                                                        <button onClick={() => actMany(approvedIds, "request-return")} disabled={busy}
                                                                            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition disabled:opacity-40 flex items-center gap-1">
                                                                            <RotateCcw size={12} /> Ajukan Pengembalian Semua
                                                                        </button>
                                                                    )}
                                                                    {canApprove && returnPendingIds.length > 0 && (
                                                                        <>
                                                                            <button onClick={() => actMany(returnPendingIds, "approve-return")} disabled={busy}
                                                                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-40 flex items-center gap-1">
                                                                                <Check size={12} /> Setujui Semua
                                                                            </button>
                                                                            <button onClick={() => actMany(returnPendingIds, "reject-return")} disabled={busy}
                                                                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition disabled:opacity-40 flex items-center gap-1">
                                                                                <Ban size={12} /> Tolak Semua
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>

                                                                {/* ── Detail per barang (aksi tetap per-barang) ── */}
                                                                <div className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
                                                                    {g.items.map((it, idx) => {
                                                                        const im = STATUS_META[it.status];
                                                                        return (
                                                                            <div key={it.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${idx > 0 ? "border-t border-zinc-100" : ""}`}>
                                                                                {it.item_type === "LAPTOP"
                                                                                    ? <LaptopIcon size={14} className="text-zinc-500 flex-shrink-0" />
                                                                                    : <Wrench size={14} className="text-zinc-500 flex-shrink-0" />}
                                                                                <span className="text-xs text-zinc-700 flex-1 min-w-[120px]">{it.item_name}</span>
                                                                                {it.serial_number
                                                                                    ? <span className="font-mono text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">{it.serial_number}</span>
                                                                                    : <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">tanpa SN</span>}
                                                                                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${im.cls}`}>{im.label}</span>
                                                                                {(it.returned_at || it.sold_at) && (
                                                                                    <span className="text-[10px] text-zinc-400 tabular-nums">{fmtWaktu(it.returned_at ?? it.sold_at)}</span>
                                                                                )}
                                                                                {it.notes && <span className="text-[11px] text-zinc-400 italic truncate max-w-[160px]" title={it.notes}>{it.notes}</span>}
                                                                                <div className="ml-auto">{renderItemActions(it)}</div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Modal Scan Kamera ── */}
                {scanOpen && (
                    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                            <div>
                                <p className="text-sm font-bold text-white">Scan Barcode Unit</p>
                                <p className="text-[11px] text-white/50">Arahkan kamera ke barcode / QR pada SN</p>
                            </div>
                            <button onClick={() => setScanOpen(false)}
                                className="h-9 px-3 rounded-lg bg-white/10 border border-white/15 text-xs font-semibold text-white hover:bg-white/20">
                                Tutup
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <div id="loan-camera-reader" className="w-full max-w-md mx-auto overflow-hidden rounded-2xl" />
                            {scanError && (
                                <p className="mt-3 max-w-md mx-auto text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">{scanError}</p>
                            )}
                            <p className="mt-3 text-center text-[11px] text-white/40">Hasil scan otomatis mengisi & memilih barang.</p>
                        </div>
                    </div>
                )}
            </main>
        </DashboardLayout>
    );
}