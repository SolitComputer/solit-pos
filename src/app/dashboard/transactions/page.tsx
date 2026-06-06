"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

// ─── Enhanced Photo Modal ────────────────────────────────────────────────────
function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white transition flex items-center gap-1.5 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Tutup (Esc)
        </button>
        <img src={url} alt="Bukti pembayaran" className="w-full rounded-2xl shadow-2xl" />
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs transition"
          onClick={(e) => e.stopPropagation()}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Buka di tab baru
        </a>
      </div>
    </div>
  );
}

function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-600 text-sm font-medium mb-5">{message}</p>
        <button onClick={onClose} className="w-full h-10 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900 transition">OK</button>
      </div>
    </div>
  );
}

// Badge customer type dengan warna modern
function CustomerTypeBadge({ type }: { type?: string }) {
  if (!type || type === "UMUM") return null;
  const styles: Record<string, string> = {
    RESELLER: "bg-amber-50 text-amber-700 border-amber-200",
    MITRA: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  const icons: Record<string, string> = { RESELLER: "🔄", MITRA: "🤝" };
  const labels: Record<string, string> = { RESELLER: "Reseller", MITRA: "Mitra" };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${styles[type] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
      <span className="text-xs">{icons[type] ?? ""}</span>
      <span>{labels[type] ?? type}</span>
    </span>
  );
}

// Badge untuk karyawan dengan warna berbeda berdasarkan role
function EmployeeBadge({ name, role }: { name: string; role?: string }) {
  // Mapping role ke warna yang berbeda
  const getRoleStyle = (role?: string) => {
    const roleLower = (role || "").toLowerCase();
    if (roleLower.includes("admin") || roleLower === "admin") {
      return "bg-red-50 text-red-700 border-red-200";
    }
    if (roleLower.includes("manager") || roleLower === "manager") {
      return "bg-purple-50 text-purple-700 border-purple-200";
    }
    if (roleLower.includes("supervisor") || roleLower === "supervisor") {
      return "bg-blue-50 text-blue-700 border-blue-200";
    }
    if (roleLower.includes("sales") || roleLower === "sales") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (roleLower.includes("marketing") || roleLower === "marketing") {
      return "bg-pink-50 text-pink-700 border-pink-200";
    }
    if (roleLower.includes("support") || roleLower === "support") {
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    }
    // Default untuk role lain
    return "bg-gray-100 text-gray-600 border-gray-200";
  };

  // Icon berdasarkan role
  const getRoleIcon = (role?: string) => {
    const roleLower = (role || "").toLowerCase();
    if (roleLower.includes("admin")) return "👑";
    if (roleLower.includes("manager")) return "📊";
    if (roleLower.includes("supervisor")) return "⭐";
    if (roleLower.includes("sales")) return "💰";
    if (roleLower.includes("marketing")) return "📢";
    if (roleLower.includes("support")) return "🛠️";
    return "👤";
  };

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${getRoleStyle(role)}`}>
      <span className="text-xs">{getRoleIcon(role)}</span>
      <span>{name}</span>
    </span>
  );
}

export default function Page() {
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [sourcePlatform, setSourcePlatform] = useState("ALL");
  const [customerType, setCustomerType] = useState("ALL");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(r => setUserRole(r.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const canEditTransaction = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_TRANSACTION) : false;
  const canSeeFinancials = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_FINANCIALS) : false;
  const canRestoreTransaction = userRole ? hasPermission(userRole, PERMISSIONS.RESTORE_TRANSACTION) : false;

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/transaction?search=&status=ALL`);
      const result = await response.json();
      setAllTransactions(result.data || []);
    } catch {
      setAllTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    let filtered = [...allTransactions];
    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter((item) =>
        item.invoice_number?.toLowerCase().includes(term) ||
        item.customer_name?.toLowerCase().includes(term) ||
        item.customer_phone?.toLowerCase().includes(term) ||
        item.laptop_name?.toLowerCase().includes(term)
      );
    }
    if (status !== "ALL") filtered = filtered.filter((item) => item.status === status);
    if (customerType !== "ALL") filtered = filtered.filter((item) => (item.customer_type ?? "UMUM") === customerType);
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
      filtered = filtered.filter((item) => new Date(item.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((item) => new Date(item.created_at) <= to);
    }
    if (paymentMethod !== "ALL") filtered = filtered.filter((item) => item.payment_method === paymentMethod);
    if (sourcePlatform !== "ALL") filtered = filtered.filter((item) => item.source_platform === sourcePlatform);
    filtered.sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortOrder === "newest" ? diff : -diff;
    });
    return filtered;
  }, [allTransactions, search, status, customerType, dateFrom, dateTo, paymentMethod, sourcePlatform, sortOrder]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [search, status, customerType, dateFrom, dateTo, paymentMethod, sourcePlatform, sortOrder]);

  const uniquePaymentMethods = useMemo(() => {
    const methods = new Set(allTransactions.map((t) => t.payment_method).filter(Boolean));
    return ["ALL", ...Array.from(methods)];
  }, [allTransactions]);

  const uniqueSourcePlatforms = useMemo(() => {
    const sources = new Set(allTransactions.map((t) => t.source_platform).filter(Boolean));
    return ["ALL", ...Array.from(sources)];
  }, [allTransactions]);

  const hasActiveFilter = status !== "ALL" || customerType !== "ALL" || dateFrom || dateTo || paymentMethod !== "ALL" || sourcePlatform !== "ALL";

  const resetFilters = () => {
    setSearch(""); setStatus("ALL"); setCustomerType("ALL"); setDateFrom(""); setDateTo("");
    setPaymentMethod("ALL"); setSourcePlatform("ALL");
  };

  const inputCls = "w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition";
  const selectCls = "w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition";

  return (
    <DashboardLayout>
      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Header Modern */}
        <div className="flex items-center justify-between animate-fadeIn">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-gray-400 rounded-full" />
              <div className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-800">
                Riwayat Transaksi
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-10">Kelola dan pantau semua transaksi penjualan</p>
          </div>
          {!isLoading && (
            <div className="bg-gray-100 px-3 py-1.5 rounded-full">
              <span className="text-xs font-medium text-gray-600">
                {filteredTransactions.length} transaksi
              </span>
            </div>
          )}
        </div>

        {/* Search + Filter Card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Cari nota, customer, WA, laptop..."
                className="w-full border border-gray-200 rounded-lg h-10 pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-300 transition"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              title={sortOrder === "newest" ? "Urutkan: Terlama dulu" : "Urutkan: Terbaru dulu"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {sortOrder === "newest"
                  ? <><line x1="12" y1="20" x2="12" y2="4" /><polyline points="6 10 12 4 18 10" /><line x1="4" y1="20" x2="20" y2="20" /></>
                  : <><line x1="12" y1="4" x2="12" y2="20" /><polyline points="18 14 12 20 6 14" /><line x1="4" y1="4" x2="20" y2="4" /></>
                }
              </svg>
              <span className="hidden sm:inline text-xs">{sortOrder === "newest" ? "Terbaru" : "Terlama"}</span>
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                hasActiveFilter 
                  ? "bg-gray-800 text-white border-gray-800 shadow-sm" 
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter
              {hasActiveFilter && (
                <span className="bg-white/20 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                  {[status !== "ALL", customerType !== "ALL", dateFrom, dateTo, paymentMethod !== "ALL", sourcePlatform !== "ALL"].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="pt-3 border-t border-gray-100 space-y-3">
              {/* Status Buttons */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Status</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {["ALL", "PAID", "PACKING", "RESERVED", "HELD", "PENDING", "CANCELLED", "FAILED"].map((s) => (
                    <button key={s} onClick={() => setStatus(s)}
                      className={`h-8 rounded-lg text-xs font-medium border transition ${status === s ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                      {s === "ALL" ? "Semua"
                        : s === "RESERVED" ? "DP"
                          : s === "HELD" ? "Ambil Dulu"
                            : s === "CANCELLED" ? "Batal"
                              : s === "PACKING" ? "📦 Packing"
                                : s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer Type */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Tipe Customer</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { val: "ALL", label: "Semua", icon: "", color: "gray" },
                    { val: "UMUM", label: "Umum", icon: "👤", color: "gray" },
                    { val: "RESELLER", label: "Reseller", icon: "🔄", color: "amber" },
                    { val: "MITRA", label: "Mitra", icon: "🤝", color: "indigo" },
                  ].map((ct) => (
                    <button key={ct.val} onClick={() => setCustomerType(ct.val)}
                      className={`h-8 rounded-lg text-xs font-medium border transition flex items-center justify-center gap-1 ${
                        customerType === ct.val 
                          ? ct.color === "amber" 
                            ? "bg-amber-500 text-white border-amber-500 shadow-sm" 
                            : ct.color === "indigo"
                            ? "bg-indigo-500 text-white border-indigo-500 shadow-sm"
                            : "bg-gray-800 text-white border-gray-800 shadow-sm"
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}>
                      {ct.icon && <span>{ct.icon}</span>}
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Dari Tanggal</label>
                  <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Sampai Tanggal</label>
                  <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              {/* Method & Source */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Metode bayar</label>
                  <select className={selectCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {uniquePaymentMethods.map((m) => <option key={m} value={m}>{m === "ALL" ? "Semua Metode" : m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Sumber</label>
                  <select className={selectCls} value={sourcePlatform} onChange={(e) => setSourcePlatform(e.target.value)}>
                    {uniqueSourcePlatforms.map((s) => <option key={s} value={s}>{s === "ALL" ? "Semua Source" : s}</option>)}
                  </select>
                </div>
              </div>

              {hasActiveFilter && (
                <button onClick={resetFilters} className="w-full h-9 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition font-medium">
                  Reset semua filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* List Transaksi */}
        <div className="space-y-3">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse space-y-3">
                <div className="flex justify-between">
                  <div className="space-y-1.5 flex-1"><div className="h-4 bg-gray-100 rounded w-36" /><div className="h-3 bg-gray-100 rounded w-24" /></div>
                  <div className="h-5 bg-gray-100 rounded-full w-14" />
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
                <div className="mt-3 flex gap-2">
                  <div className="h-6 bg-gray-200 rounded-full w-16" />
                  <div className="h-6 bg-gray-200 rounded-full w-20" />
                </div>
              </div>
            ))
          ) : paginatedTransactions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-16 text-center shadow-sm">
              <div className="text-7xl mb-4">🔍</div>
              <p className="text-gray-500 text-base font-medium">Tidak ada transaksi</p>
              <p className="text-gray-400 text-sm mt-2">Coba ubah filter atau kata pencarian</p>
              {hasActiveFilter && (
                <button
                  onClick={resetFilters}
                  className="mt-4 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            paginatedTransactions.map((item) => (
              <TransactionCard
                key={item.id}
                item={item}
                onPhotoClick={setPhotoModal}
                canEditTransaction={canEditTransaction}
                canSeeFinancials={canSeeFinancials}
                canRestoreTransaction={canRestoreTransaction}
                onRestored={() => fetchTransactions()}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {!isLoading && filteredTransactions.length > itemsPerPage && (
          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Sebelumnya
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">{currentPage}</span>
              <span className="text-sm text-gray-400">/</span>
              <span className="text-sm text-gray-500">{totalPages}</span>
            </div>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition font-medium">
              Selanjutnya
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
      `}</style>
    </DashboardLayout>
  );
}

function TransactionCard({ item, onPhotoClick, canEditTransaction, canRestoreTransaction, canSeeFinancials, onRestored }: {
  item: any; onPhotoClick: (url: string) => void;
  canEditTransaction: boolean; canRestoreTransaction: boolean;
  canSeeFinancials: boolean; onRestored: (invoice: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmSN, setConfirmSN] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const isPending = item.status === "RESERVED" || item.status === "HELD" || item.status === "PACKING";

  const handleConfirmPayment = async () => {
    if (item.status === "RESERVED" && !confirmSN.trim()) { setConfirmError("Serial number wajib diisi"); return; }
    setConfirming(true); setConfirmError("");
    try {
      const res = await fetch("/api/units/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: item.invoice_number, serial_number: confirmSN.trim() || item.serial_number }),
      });
      const result = await res.json();
      if (!result.success) { setConfirmError(result.message || "Gagal"); return; }
      setShowConfirmModal(false);
      onRestored(item.invoice_number);
    } catch { setConfirmError("Terjadi kesalahan koneksi"); }
    finally { setConfirming(false); }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await fetch(`/api/transaction/${item.invoice_number}/restore`, { method: "POST" });
      const result = await res.json();
      if (!result.success) { setAlertModal("Gagal restore: " + result.message); return; }
      setShowRestoreModal(false);
      onRestored(item.invoice_number);
    } catch { setAlertModal("Terjadi kesalahan saat restore"); }
    finally { setRestoring(false); }
  };

  const STATUS_LABEL: Record<string, string> = {
    PAID: "LUNAS",
    PENDING: "PENDING",
    CANCELLED: "BATAL",
    FAILED: "GAGAL",
    RESERVED: "DP",
    HELD: "DIAMBIL",
    PACKING: "PACKING",
  };
  
  const statusMap: Record<string, string> = {
    PAID: "bg-green-50 text-green-700 border-green-200",
    PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
    FAILED: "bg-red-50 text-red-600 border-red-200",
    CANCELLED: "bg-gray-50 text-gray-500 border-gray-200",
    RESERVED: "bg-blue-50 text-blue-700 border-blue-200",
    HELD: "bg-orange-50 text-orange-700 border-orange-200",
    PACKING: "bg-purple-50 text-purple-700 border-purple-200",
  };

  // Employee badge component untuk digunakan di dalam card
  const EmployeeBadgeInline = ({ name }: { name: string }) => {
    // Simulasi role berdasarkan nama atau bisa dari data item.employee_role
    // Anda bisa mengganti ini dengan data role yang sebenarnya dari API
    const getRoleFromName = (employeeName: string) => {
      // Contoh mapping nama ke role - sesuaikan dengan data Anda
      const nameLower = employeeName.toLowerCase();
      if (nameLower.includes("admin")) return "admin";
      if (nameLower.includes("manager")) return "manager";
      if (nameLower.includes("super")) return "supervisor";
      if (nameLower.includes("sales")) return "sales";
      if (nameLower.includes("marketing")) return "marketing";
      if (nameLower.includes("support")) return "support";
      return "staff";
    };

    const role = item.employee_role || getRoleFromName(name);
    
    const getRoleStyle = () => {
      const roleLower = role.toLowerCase();
      if (roleLower.includes("admin")) return "bg-red-50 text-red-700 border-red-200";
      if (roleLower.includes("manager")) return "bg-purple-50 text-purple-700 border-purple-200";
      if (roleLower.includes("supervisor")) return "bg-blue-50 text-blue-700 border-blue-200";
      if (roleLower.includes("sales")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
      if (roleLower.includes("marketing")) return "bg-pink-50 text-pink-700 border-pink-200";
      if (roleLower.includes("support")) return "bg-cyan-50 text-cyan-700 border-cyan-200";
      return "bg-gray-100 text-gray-600 border-gray-200";
    };

    const getRoleIcon = () => {
      const roleLower = role.toLowerCase();
      if (roleLower.includes("admin")) return "👑";
      if (roleLower.includes("manager")) return "📊";
      if (roleLower.includes("supervisor")) return "⭐";
      if (roleLower.includes("sales")) return "💰";
      if (roleLower.includes("marketing")) return "📢";
      if (roleLower.includes("support")) return "🛠️";
      return "👤";
    };

    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${getRoleStyle()}`}>
        <span className="text-xs">{getRoleIcon()}</span>
        <span>{name}</span>
      </span>
    );
  };

  // Payment styles with distinct colors for Cash and Transfer
  type PaymentStyle = { bg: string; text: string; border: string; icon: React.ReactNode };
  function getPaymentStyle(method: string): PaymentStyle {
    const m = (method ?? "").toUpperCase();
    if (m.includes("TUNAI") || m.includes("CASH")) return { 
      bg: "bg-emerald-50", 
      text: "text-emerald-700", 
      border: "border-emerald-200", 
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg> 
    };
    if (m.includes("TRANSFER") || m.includes("BCA") || m.includes("BRI") || m.includes("MANDIRI") || m.includes("BNI")) return { 
      bg: "bg-blue-50", 
      text: "text-blue-700", 
      border: "border-blue-200", 
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg> 
    };
    if (m.includes("QRIS") || m.includes("QR")) return { 
      bg: "bg-purple-50", 
      text: "text-purple-700", 
      border: "border-purple-200", 
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h.01M14 17h.01M17 14h.01M17 17h3M20 14h.01M17 20h3" /></svg> 
    };
    return { 
      bg: "bg-gray-100", 
      text: "text-gray-600", 
      border: "border-gray-200", 
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg> 
    };
  }

  const payStyle = getPaymentStyle(item.payment_method ?? "");
  const customerTypeLabel: Record<string, string> = { UMUM: "Umum", RESELLER: "Reseller", MITRA: "Mitra" };
  const customerTypeIcon: Record<string, string> = { UMUM: "👤", RESELLER: "🔄", MITRA: "🤝" };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      <div className="p-4">
        {/* Row 1: nama + status + harga */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-800 text-base">{item.customer_name}</h2>
              <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium flex-shrink-0 ${statusMap[item.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              <CustomerTypeBadge type={item.customer_type} />
              {item.sales_name && (
                <EmployeeBadgeInline name={item.sales_name} />
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1 font-mono">{item.invoice_number}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base font-bold text-gray-800">Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}</p>
            {canSeeFinancials && (
              <p className="text-xs text-gray-500">+Rp{(item.other || 0).toLocaleString("id-ID")}</p>
            )}
          </div>
        </div>

        {/* Row 2: laptop + spek */}
        <div className="mb-2.5">
          <p className="text-xs font-medium text-gray-700 leading-snug truncate">{item.laptop_name || "—"}</p>
          {(item.cpu || item.ram || item.storage || item.display) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {item.cpu && <span className="inline-flex text-[10px] text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-md">{item.cpu}</span>}
              {item.ram && <span className="inline-flex text-[10px] text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-md">{item.ram}</span>}
              {item.storage && <span className="inline-flex text-[10px] text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-md">{item.storage}</span>}
              {item.display && <span className="inline-flex text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-md">{item.display}</span>}
            </div>
          )}
          {item.serial_number && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-medium text-gray-400 uppercase">SN</span>
              <code className="text-[11px] font-mono text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded-md">{item.serial_number}</code>
            </div>
          )}
        </div>

        {/* Row 3: meta info */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {item.customer_phone && <span className="text-[11px] text-gray-500">{item.customer_phone}</span>}
          {item.payment_method && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${payStyle.bg} ${payStyle.text} ${payStyle.border}`}>
              {payStyle.icon}{item.payment_method}
            </span>
          )}
          {item.source_platform && item.source_platform !== "-" && (
            <span className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">{item.source_platform}</span>
          )}
          <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0">
            {new Date(item.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {item.payment_photo && (
            <button onClick={() => onPhotoClick(item.payment_photo)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              Bukti
            </button>
          )}
          {item.latitude && item.longitude && (
            <a href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" />
              </svg>
              Maps
            </a>
          )}
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition">
            {expanded ? "Tutup" : "Detail"}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          {canEditTransaction && (
            <a href={`/payment/${item.invoice_number}`} className="text-xs font-medium text-gray-600 hover:text-gray-900 transition flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </a>
          )}
          {canRestoreTransaction && item.status === "PAID" && (
            <button onClick={() => setShowRestoreModal(true)} className="text-xs font-medium text-red-500 hover:text-red-700 transition flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Restore
            </button>
          )}
          {canEditTransaction && isPending && (
            <button onClick={() => { setConfirmSN(item.serial_number || ""); setShowConfirmModal(true); }} className="text-xs font-medium text-gray-600 hover:text-gray-900 transition flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Lunas
            </button>
          )}
          <a href={`/receipt/${item.invoice_number}`} className="text-xs font-medium text-gray-600 hover:text-gray-900 transition flex items-center gap-1">
            Receipt
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </a>
        </div>
      </div>

      {item.status === "PACKING" && item.ecommerce_platform && (
        <div className="mx-4 mb-3 flex justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-gray-700 font-medium">
            📦 Pesanan {item.ecommerce_platform}
          </span>
          {item.ecommerce_order_id && (
            <span className="font-mono text-gray-600 text-[10px]">
              #{item.ecommerce_order_id}
            </span>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-gray-400">Tipe Customer</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span>{customerTypeIcon[item.customer_type] ?? "👤"}</span>
                <span className="text-gray-700 font-medium">{customerTypeLabel[item.customer_type] ?? "Umum"}</span>
              </div>
            </div>
            <div>
              <span className="text-gray-400">Pickup</span>
              <p className="text-gray-700 font-medium mt-0.5">{item.pickup_method || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400">Software</span>
              <p className="text-gray-700 font-medium mt-0.5">{item.software_request || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400">Jadwal</span>
              <p className="text-gray-700 font-medium mt-0.5">{item.pickup_date || "—"} {item.pickup_time || ""}</p>
            </div>
            {canSeeFinancials && item.inventory_price > 0 && (
              <div>
                <span className="text-gray-400">Modal</span>
                <p className="text-gray-700 font-medium mt-0.5">Rp{item.inventory_price.toLocaleString("id-ID")}</p>
              </div>
            )}
            {item.pickup_location && (
              <div className="col-span-2">
                <span className="text-gray-400 text-[10px] uppercase tracking-wide">Alamat</span>
                <p className="text-gray-700 font-medium mt-1">{item.pickup_location}</p>
              </div>
            )}
          </div>
          {item.notes && (
            <div className="mt-3 bg-white rounded-lg px-3 py-2 text-xs text-gray-600 border border-gray-200">
              <span className="font-medium text-gray-500">Catatan: </span>{item.notes}
            </div>
          )}
        </div>
      )}

      {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}

      {/* Restore Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRestoreModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden sm:mx-4 animate-slideUp">
            <div className="bg-gray-800 px-5 py-4">
              <p className="font-semibold text-white text-sm">Restore Transaksi</p>
              <p className="text-xs text-gray-300 mt-0.5">Batalkan & kembalikan stok unit</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100 space-y-2">
                {[["Nota", item.invoice_number], ["Customer", item.customer_name], ["Laptop", item.laptop_name], ["SN", item.serial_number || "—"]].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-mono font-medium text-gray-700 text-right max-w-[60%] truncate">{val}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs border-t border-gray-200 pt-2">
                  <span className="text-gray-400">Harga</span>
                  <span className="font-semibold text-gray-800">Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-xs text-amber-700">Aksi ini <span className="font-semibold">tidak dapat diurungkan</span>.</p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowRestoreModal(false)} disabled={restoring} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">Batal</button>
              <button onClick={handleRestore} disabled={restoring} className="flex-1 h-10 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {restoring ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</> : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                  Ya, Restore
                </>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Lunas Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden sm:mx-4 animate-slideUp">
            <div className="bg-gray-800 px-5 py-4">
              <p className="font-semibold text-white text-sm">Konfirmasi Pelunasan</p>
              <p className="text-xs text-gray-300 mt-0.5">
                {item.status === "RESERVED" ? "DP → LUNAS" : item.status === "PACKING" ? "📦 Dana Cair → LUNAS" : "Diambil → LUNAS"}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100 space-y-2">
                {[["Nota", item.invoice_number], ["Customer", item.customer_name], ["Laptop", item.laptop_name]].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-medium text-gray-700 text-right max-w-[60%] truncate">{val}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs border-t border-gray-200 pt-2">
                  <span className="text-gray-400">Harga Deal</span>
                  <span className="font-semibold text-gray-800">Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}</span>
                </div>
              </div>
              {item.status === "RESERVED" ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Serial Number Unit <span className="text-red-400">*</span></label>
                  <input type="text" value={confirmSN} onChange={(e) => { setConfirmSN(e.target.value); setConfirmError(""); }}
                    placeholder="Masukkan serial number..."
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-300 transition"
                    autoFocus />
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-yellow-700">
                    Barang sudah diambil oleh <span className="font-semibold">{item.customer_name}</span>.
                    Konfirmasi ini akan menandai transaksi sebagai <span className="font-semibold">LUNAS</span>.
                  </p>
                </div>
              )}
              {confirmError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 animate-shake">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-xs text-red-700">{confirmError}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => { setShowConfirmModal(false); setConfirmError(""); }} disabled={confirming}
                className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">Batal</button>
              <button onClick={handleConfirmPayment} disabled={confirming || (item.status === "RESERVED" && !confirmSN.trim())}
                className="flex-1 h-10 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition disabled:opacity-40 flex items-center justify-center gap-2">
                {confirming ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</> : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Konfirmasi Lunas
                </>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .animate-shake { animation: shake 0.3s ease-in-out; }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}
