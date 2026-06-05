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
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div className="relative max-w-lg w-full animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/70 hover:text-white transition-all duration-200 flex items-center gap-2 text-sm group"
        >
          <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
          <span className="text-sm font-medium">Tutup (Esc)</span>
        </button>
        <img src={url} alt="Bukti pembayaran" className="w-full rounded-2xl shadow-2xl border border-white/10" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs transition-all duration-200 hover:gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Buka di tab baru
        </a>
      </div>
    </div>
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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(r => setUserRole(r.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const canEditTransaction = userRole
    ? hasPermission(userRole, PERMISSIONS.EDIT_TRANSACTION)
    : false;

  const canSeeFinancials = userRole
    ? hasPermission(userRole, PERMISSIONS.VIEW_FINANCIALS)
    : false;

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
    return filtered;
  }, [allTransactions, search, status, dateFrom, dateTo, paymentMethod, sourcePlatform]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [search, status, dateFrom, dateTo, paymentMethod, sourcePlatform]);

  const uniquePaymentMethods = useMemo(() => {
    const methods = new Set(allTransactions.map((t) => t.payment_method).filter(Boolean));
    return ["ALL", ...Array.from(methods)];
  }, [allTransactions]);

  const uniqueSourcePlatforms = useMemo(() => {
    const sources = new Set(allTransactions.map((t) => t.source_platform).filter(Boolean));
    return ["ALL", ...Array.from(sources)];
  }, [allTransactions]);

  const hasActiveFilter = status !== "ALL" || dateFrom || dateTo || paymentMethod !== "ALL" || sourcePlatform !== "ALL";

  const resetFilters = () => {
    setSearch(""); setStatus("ALL"); setDateFrom(""); setDateTo("");
    setPaymentMethod("ALL"); setSourcePlatform("ALL");
  };

  const canRestoreTransaction = userRole
    ? hasPermission(userRole, PERMISSIONS.RESTORE_TRANSACTION)
    : false;

  const inputCls = "w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200";
  const selectCls = "w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200";

  return (
    <DashboardLayout>
      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header dengan animasi */}
        <div className="flex items-center justify-between animate-fadeIn">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
              <div className="w-7 h-7 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-md">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                Riwayat Transaksi
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-10">Kelola dan pantau semua transaksi penjualan</p>
          </div>
          {!isLoading && (
            <div className="flex items-center gap-2">
              <div className="bg-gray-100 px-3 py-1.5 rounded-full">
                <span className="text-xs font-semibold text-gray-700">
                  {filteredTransactions.length} transaksi
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Search + Filter toggle yang ditingkatkan */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 transition-colors duration-200" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Cari berdasarkan nota, customer, WA, atau laptop..."
                  className="w-full border border-gray-200 rounded-xl h-11 pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 flex-shrink-0 hover:scale-105 ${
                  hasActiveFilter
                    ? "bg-gray-700 text-white border-gray-700 shadow-md"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filter
                {hasActiveFilter && (
                  <span className="bg-white/30 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                    {[status !== "ALL", dateFrom, dateTo, paymentMethod !== "ALL", sourcePlatform !== "ALL"].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>

            {/* Expandable filters dengan animasi */}
            <div className={`transition-all duration-300 overflow-hidden ${showFilters ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="pt-4 border-t border-gray-100 space-y-4">
                {/* Status buttons */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Status</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {["ALL", "PAID", "RESERVED", "HELD", "PENDING", "CANCELLED", "FAILED"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={`h-9 rounded-xl text-xs font-semibold border transition-all duration-200 hover:scale-105 ${
                          status === s
                            ? "bg-gray-700 text-white border-gray-700 shadow-md"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                        }`}
                      >
                        {s === "ALL" ? "Semua" :
                          s === "RESERVED" ? "Dipesan (DP)" :
                            s === "HELD" ? "Diambil Dulu" :
                              s === "CANCELLED" ? "Dibatalkan" : s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date range */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Dari Tanggal</label>
                    <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Sampai Tanggal</label>
                    <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                </div>

                {/* Method & Source */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Metode Pembayaran</label>
                    <select className={selectCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      {uniquePaymentMethods.map((m) => (
                        <option key={m} value={m}>{m === "ALL" ? "Semua Metode" : m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Sumber Platform</label>
                    <select className={selectCls} value={sourcePlatform} onChange={(e) => setSourcePlatform(e.target.value)}>
                      {uniqueSourcePlatforms.map((s) => (
                        <option key={s} value={s}>{s === "ALL" ? "Semua Source" : s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {hasActiveFilter && (
                  <button
                    onClick={resetFilters}
                    className="w-full h-10 text-sm text-gray-500 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium hover:scale-[1.01]"
                  >
                    Reset semua filter
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* List Transaksi */}
        <div className="space-y-3">
          {isLoading ? (
            // Enhanced Loading Skeleton
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <div className="h-5 bg-gray-200 rounded-lg w-48" />
                    <div className="h-3 bg-gray-200 rounded w-32" />
                  </div>
                  <div className="h-8 bg-gray-200 rounded-full w-24" />
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
            // Enhanced Empty State
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center shadow-sm">
              <div className="text-7xl mb-4 animate-bounce">🔍</div>
              <p className="text-gray-500 text-base font-semibold">Tidak ada transaksi</p>
              <p className="text-gray-400 text-sm mt-2">Coba ubah filter atau kata pencarian</p>
              {hasActiveFilter && (
                <button
                  onClick={resetFilters}
                  className="mt-4 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200"
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

        {/* Enhanced Pagination */}
        {!isLoading && filteredTransactions.length > itemsPerPage && (
          <div className="flex items-center justify-between pt-4 pb-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 font-medium group"
            >
              <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Sebelumnya
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 font-medium bg-gray-100 px-3 py-1.5 rounded-lg">
                {currentPage}
              </span>
              <span className="text-sm text-gray-400">/</span>
              <span className="text-sm text-gray-500">{totalPages}</span>
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 font-medium group"
            >
              Selanjutnya
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.3s ease-out; }
        .animate-bounce { animation: bounce 1s ease-in-out infinite; }
      `}</style>
    </DashboardLayout>
  );
}

// Enhanced Alert Modal
function AlertModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-scaleIn">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-700 text-sm font-medium mb-6">{message}</p>
        <button
          onClick={onClose}
          className="w-full h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 shadow-md hover:shadow-lg"
        >
          OK
        </button>
      </div>
    </div>
  );
}

function TransactionCard({
  item,
  onPhotoClick,
  canEditTransaction,
  canRestoreTransaction,
  canSeeFinancials,
  onRestored,
}: {
  item: any;
  onPhotoClick: (url: string) => void;
  canEditTransaction: boolean;
  canRestoreTransaction: boolean;
  canSeeFinancials: boolean;
  onRestored: (invoice: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmSN, setConfirmSN] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const isPending = item.status === "RESERVED" || item.status === "HELD";

  const handleConfirmPayment = async () => {
    if (item.status === "RESERVED" && !confirmSN.trim()) {
      setConfirmError("Serial number wajib diisi");
      return;
    }
    setConfirming(true);
    setConfirmError("");
    try {
      const res = await fetch("/api/units/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: item.invoice_number,
          serial_number: confirmSN.trim() || item.serial_number,
        }),
      });
      const result = await res.json();
      if (!result.success) { setConfirmError(result.message || "Gagal"); return; }
      setShowConfirmModal(false);
      onRestored(item.invoice_number);
    } catch {
      setConfirmError("Terjadi kesalahan koneksi");
    } finally {
      setConfirming(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await fetch(`/api/transaction/${item.invoice_number}/restore`, {
        method: "POST",
      });
      const result = await res.json();
      if (!result.success) {
        setAlertModal("Gagal restore: " + result.message);
        return;
      }
      setShowRestoreModal(false);
      onRestored(item.invoice_number);
    } catch {
      setAlertModal("Terjadi kesalahan saat restore");
    } finally {
      setRestoring(false);
    }
  };

  const STATUS_LABEL: Record<string, string> = {
    PAID: "PAID",
    PENDING: "PENDING",
    CANCELLED: "DIBATALKAN",
    FAILED: "GAGAL",
    RESERVED: "DIPESAN (DP)",
    HELD: "DIAMBIL DULU",
  };

  const statusMap: Record<string, string> = {
    PAID: "bg-gray-100 text-gray-700 border-gray-200",
    PENDING: "bg-gray-100 text-gray-700 border-gray-200",
    FAILED: "bg-red-50 text-red-600 border-red-200",
    CANCELLED: "bg-gray-100 text-gray-500 border-gray-200",
    RESERVED: "bg-gray-100 text-gray-700 border-gray-200",
    HELD: "bg-gray-100 text-gray-700 border-gray-200",
  };

  type PaymentStyle = { bg: string; text: string; border: string; icon: React.ReactNode };

  function getPaymentStyle(method: string): PaymentStyle {
    const m = (method ?? "").toUpperCase();
    if (m.includes("TUNAI") || m.includes("CASH")) return {
      bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
          <line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" />
        </svg>
      ),
    };
    if (m.includes("TRANSFER") || m.includes("BCA") || m.includes("BRI") || m.includes("BNI") || m.includes("MANDIRI")) return {
      bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" />
          <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      ),
    };
    return {
      bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
    };
  }

  const payStyle = getPaymentStyle(item.payment_method ?? "");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group">
      {/* Main content */}
      <div className="p-5">
        {/* Row 1: nama + status badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-gray-800 text-base leading-tight">{item.customer_name}</h2>
              <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold flex-shrink-0 ${statusMap[item.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              {item.sales_name && (
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 font-medium flex-shrink-0">
                  {item.sales_name}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1 font-mono tracking-tight">{item.invoice_number}</p>
          </div>

          {/* Harga */}
          <div className="text-right flex-shrink-0">
            <p className="text-base font-bold text-gray-800">
              Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}
            </p>
            {canSeeFinancials && (
              <p className="text-xs text-gray-600 font-medium mt-0.5">
                +Rp{(item.other || 0).toLocaleString("id-ID")}
              </p>
            )}
          </div>
        </div>

        {/* Row 2: Laptop + SN */}
        <div className="mb-3">
          <p className="text-sm font-semibold text-gray-800 leading-snug truncate">
            {item.laptop_name || "—"}
          </p>

          {/* Spek laptop */}
          {(item.cpu || item.ram || item.storage || item.display) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {item.cpu && (
                <span className="inline-flex items-center gap-1 text-[10px] text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md font-medium">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="9" y="9" width="6" height="6" />
                  </svg>
                  {item.cpu}
                </span>
              )}
              {item.ram && (
                <span className="inline-flex items-center gap-1 text-[10px] text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md font-medium">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="10" rx="1" />
                    <line x1="6" y1="7" x2="6" y2="3" />
                  </svg>
                  {item.ram}
                </span>
              )}
              {item.storage && (
                <span className="inline-flex items-center gap-1 text-[10px] text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md font-medium">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  </svg>
                  {item.storage}
                </span>
              )}
              {item.display && (
                <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md font-medium">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                  </svg>
                  {item.display}
                </span>
              )}
            </div>
          )}

          {/* SN */}
          {item.serial_number ? (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">SN</span>
              <code className="text-[11px] font-mono text-gray-600 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                {item.serial_number}
              </code>
            </div>
          ) : item.status === "RESERVED" ? (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">SN</span>
              <span className="text-[11px] text-gray-500 font-medium">Belum ada (DP)</span>
            </div>
          ) : null}
        </div>

        {/* Row 3: Meta info */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {item.customer_phone && (
            <span className="text-[11px] text-gray-500">{item.customer_phone}</span>
          )}
          {item.payment_method && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${payStyle.bg} ${payStyle.text} ${payStyle.border}`}>
              {payStyle.icon}
              {item.payment_method}
            </span>
          )}
          {item.source_platform && item.source_platform !== "-" && (
            <span className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
              {item.source_platform}
            </span>
          )}
          <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0">
            {new Date(item.created_at).toLocaleDateString("id-ID", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {item.payment_photo && (
            <button
              onClick={() => onPhotoClick(item.payment_photo)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-all duration-200 font-medium group/btn"
            >
              <svg className="w-4 h-4 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Bukti
            </button>
          )}
          {item.latitude && item.longitude && (
            <a
              href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-all duration-200 font-medium group/btn"
            >
              <svg className="w-4 h-4 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <circle cx="12" cy="11" r="3" />
              </svg>
              Maps
            </a>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-all duration-200 font-medium group/btn"
          >
            {expanded ? "Tutup" : "Detail"}
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              className={`transition-all duration-300 ${expanded ? "rotate-180" : "group-hover/btn:translate-y-0.5"}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {canEditTransaction && (
            <a
              href={`/payment/${item.invoice_number}`}
              className="text-xs font-semibold text-gray-600 hover:text-gray-800 transition-all duration-200 flex items-center gap-1.5 group/btn"
            >
              <svg className="w-3.5 h-3.5 group-hover/btn:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </a>
          )}
          {canRestoreTransaction && item.status === "PAID" && (
            <button
              onClick={() => setShowRestoreModal(true)}
              className="text-xs font-semibold text-red-500 hover:text-red-700 transition-all duration-200 flex items-center gap-1.5 group/btn"
            >
              <svg className="w-3.5 h-3.5 group-hover/btn:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Restore
            </button>
          )}
          {canEditTransaction && isPending && (
            <button
              onClick={() => { setConfirmSN(item.serial_number || ""); setShowConfirmModal(true); }}
              className="text-xs font-semibold text-gray-600 hover:text-gray-800 transition-all duration-200 flex items-center gap-1.5 group/btn"
            >
              <svg className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Lunas
            </button>
          )}
          <a
            href={`/receipt/${item.invoice_number}`}
            className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-all duration-200 flex items-center gap-1.5 group/btn"
          >
            Receipt
            <svg className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/30">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <span className="text-gray-400 text-[10px] uppercase tracking-wide">Software</span>
              <p className="text-gray-700 font-medium mt-1">{item.software_request || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400 text-[10px] uppercase tracking-wide">Pickup</span>
              <p className="text-gray-700 font-medium mt-1">{item.pickup_method || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400 text-[10px] uppercase tracking-wide">Jadwal</span>
              <p className="text-gray-700 font-medium mt-1">
                {item.pickup_date || "—"} {item.pickup_time || ""}
              </p>
            </div>
            {canSeeFinancials && item.inventory_price > 0 && (
              <div>
                <span className="text-gray-400 text-[10px] uppercase tracking-wide">Modal</span>
                <p className="text-gray-700 font-medium mt-1">
                  Rp{item.inventory_price.toLocaleString("id-ID")}
                </p>
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
            <div className="mt-4 bg-yellow-50 rounded-xl px-4 py-2.5 text-xs text-yellow-800 border border-yellow-100">
              <span className="font-semibold text-yellow-600">📝 Catatan: </span>
              {item.notes}
            </div>
          )}
        </div>
      )}

      {/* Modals - same logic, enhanced styling */}
      {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}

      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRestoreModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden sm:mx-4 animate-slideUp">
            <div className="bg-gray-700 px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-white text-sm">Restore Transaksi</p>
                <p className="text-xs text-gray-300 mt-0.5">Batalkan & kembalikan stok unit</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[60dvh] overflow-y-auto">
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 space-y-2">
                {[
                  ["Nota", item.invoice_number],
                  ["Customer", item.customer_name],
                  ["Laptop", item.laptop_name],
                  ["SN", item.serial_number || "—"],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-mono font-semibold text-gray-700 text-right max-w-[60%] truncate">{val}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs border-t border-gray-200 pt-2">
                  <span className="text-gray-400">Harga</span>
                  <span className="font-bold text-gray-800">Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Yang akan terjadi:</p>
                {[
                  <><span className="font-semibold text-gray-600">PAID</span> → <span className="font-semibold text-red-500">CANCELLED</span></>,
                  <>Stok SN <code className="font-mono">{item.serial_number}</code> kembali ke <span className="font-semibold text-gray-600">SIAP_JUAL</span></>,
                  <>Qty laptop otomatis diperbarui</>,
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[10px]">{i + 1}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-xs text-yellow-700">Aksi ini <span className="font-semibold">tidak dapat diurungkan</span>.</p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowRestoreModal(false)} disabled={restoring}
                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-gray-200 disabled:opacity-50">
                Batal
              </button>
              <button onClick={handleRestore} disabled={restoring}
                className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
                {restoring ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Ya, Restore
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden sm:mx-4 animate-slideUp">
            <div className="bg-gray-700 px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-white text-sm">Konfirmasi Pelunasan</p>
                <p className="text-xs text-gray-300 mt-0.5">
                  {item.status === "RESERVED" ? "DP → PAID" : "Diambil → PAID"}
                </p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 space-y-2">
                {[
                  ["Nota", item.invoice_number],
                  ["Customer", item.customer_name],
                  ["Laptop", item.laptop_name],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-semibold text-gray-700 text-right max-w-[60%] truncate">{val}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs border-t border-gray-200 pt-2">
                  <span className="text-gray-400">Harga Deal</span>
                  <span className="font-bold text-gray-800">Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}</span>
                </div>
              </div>
              {item.status === "RESERVED" ? (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Serial Number Unit <span className="text-red-400">*</span>
                  </label>
                  <p className="text-[10px] text-gray-400 mb-2">Masukkan SN unit yang diserahkan ke customer.</p>
                  <input
                    type="text"
                    value={confirmSN}
                    onChange={(e) => { setConfirmSN(e.target.value); setConfirmError(""); }}
                    placeholder="Masukkan serial number..."
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-yellow-700">
                    Barang sudah diambil oleh <span className="font-semibold">{item.customer_name}</span>.
                    Konfirmasi ini akan menandai transaksi sebagai <span className="font-semibold">LUNAS</span>.
                  </p>
                  {item.serial_number && (
                    <p className="text-xs text-yellow-600 mt-1">
                      SN: <code className="font-mono bg-yellow-100 px-1 rounded">{item.serial_number}</code>
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Yang akan terjadi:</p>
                {[
                  <>Status transaksi → <span className="font-semibold text-gray-600">PAID</span></>,
                  <>Unit SN akan di-set <span className="font-semibold text-gray-700">SOLD</span></>,
                  <>Garansi otomatis dibuat (30 hari)</>,
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-5 h-5 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[10px]">{i + 1}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              {confirmError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 animate-shake">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-xs text-red-700">{confirmError}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setShowConfirmModal(false); setConfirmError(""); }}
                disabled={confirming}
                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={confirming || (item.status === "RESERVED" && !confirmSN.trim())}
                className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
              >
                {confirming ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Konfirmasi Lunas
                  </>
                )}
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