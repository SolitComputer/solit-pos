"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/70 hover:text-white transition flex items-center gap-1.5 text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Tutup (Esc)
        </button>
        <img src={url} alt="Bukti pembayaran" className="w-full rounded-2xl shadow-2xl" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs transition"
          onClick={(e) => e.stopPropagation()}
        >
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

  const inputCls = "w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition";
  const selectCls = "w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition";

  return (
    <DashboardLayout>
      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Riwayat Transaksi</h1>
          <div className="flex items-center gap-2">
            {!isLoading && (
              <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2.5 py-1 rounded-full">
                {filteredTransactions.length} transaksi
              </span>
            )}
          </div>
        </div>

        {/* Search + Filter toggle */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Cari nota, customer, WA, laptop..."
                className="w-full border border-gray-200 rounded-xl h-10 pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm font-medium transition flex-shrink-0 ${hasActiveFilter
                ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter
              {hasActiveFilter && (
                <span className="bg-white/30 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                  {[status !== "ALL", dateFrom, dateTo, paymentMethod !== "ALL", sourcePlatform !== "ALL"].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {/* Expandable filters */}
          {showFilters && (
            <div className="pt-3 border-t border-gray-100 space-y-3">
              {/* Status */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["ALL", "PAID", "PENDING", "FAILED"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`h-9 rounded-xl text-xs font-semibold border transition ${status === s
                      ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}
                  >
                    {s === "ALL" ? "Semua" : s}
                  </button>
                ))}
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Dari tanggal</label>
                  <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Sampai tanggal</label>
                  <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              {/* Method & Source */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Metode bayar</label>
                  <select className={selectCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {uniquePaymentMethods.map((m) => (
                      <option key={m} value={m}>{m === "ALL" ? "Semua Metode" : m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Sumber</label>
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
                  className="w-full h-9 text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium"
                >
                  Reset semua filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div className="space-y-2.5">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse space-y-3">
                <div className="flex justify-between">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 bg-gray-100 rounded w-36" />
                    <div className="h-3 bg-gray-100 rounded w-24" />
                  </div>
                  <div className="h-5 bg-gray-100 rounded-full w-14" />
                </div>
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
              </div>
            ))
          ) : paginatedTransactions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-gray-500 text-sm font-medium">Tidak ada transaksi</p>
              <p className="text-gray-400 text-xs mt-1">Coba ubah filter atau kata pencarian</p>
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
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition font-medium"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Sebelumnya
            </button>
            <span className="text-sm text-gray-500 font-medium">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition font-medium"
            >
              Selanjutnya
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// Tambah AlertModal component di atas Page() — sama persis dengan yang di laptops/page.tsx
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
        <button
          onClick={onClose}
          className="w-full h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition"
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
  canRestoreTransaction, // ← prop baru, pisah dari canEdit
  canSeeFinancials,
  onRestored,
}: {
  item: any;
  onPhotoClick: (url: string) => void;
  canEditTransaction: boolean;
  canRestoreTransaction: boolean; // ← baru
  canSeeFinancials: boolean;
  onRestored: (invoice: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [alertModal, setAlertModal] = useState<string | null>(null);

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

  const statusMap: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    FAILED: "bg-red-50 text-red-600 border-red-200",
    CANCELLED: "bg-red-50 text-red-600 border-red-200",
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Main row */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-gray-800 text-sm">{item.customer_name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${statusMap[item.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {item.status}
              </span>
              {item.sales_name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium flex-shrink-0">
                  👤 {item.sales_name}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{item.invoice_number}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{item.laptop_name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold text-gray-800">
              Rp{(item.deal_price || item.amount).toLocaleString("id-ID")}
            </p>
            {/* Profit hanya untuk ADMIN & ACCOUNTING */}
            {canSeeFinancials && (
              <p className="text-xs text-emerald-600 font-medium">
                +Rp{(item.other || 0).toLocaleString("id-ID")}
              </p>
            )}
          </div>
        </div>

        {/* Compact info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-gray-500">
          <span>{item.customer_phone}</span>
          <span className="text-gray-200">·</span>
          <span>{item.payment_method}</span>
          <span className="text-gray-200">·</span>
          <span>{item.source_platform}</span>
          <span className="text-gray-200">·</span>
          <span>{new Date(item.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      </div>

      {/* Footer actions */}
      {/* Footer actions */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        {/* Kiri: Bukti, Maps, Detail */}
        <div className="flex items-center gap-2">
          {item.payment_photo && (
            <button
              onClick={() => onPhotoClick(item.payment_photo)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition font-medium"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 transition font-medium"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              Maps
            </a>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
          >
            {expanded ? "Sembunyikan" : "Detail"}
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Kanan: Edit + Restore + Receipt */}
        <div className="flex items-center gap-2">
          {canEditTransaction && (
            <a
              href={`/payment/${item.invoice_number}`}
              className="text-xs font-semibold text-amber-600 hover:text-amber-800 transition flex items-center gap-1"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </a>
          )}

          {canRestoreTransaction && item.status === "PAID" && (
            <button
              onClick={() => setShowRestoreModal(true)}
              className="text-xs font-semibold text-red-500 hover:text-red-700 transition flex items-center gap-1"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Restore
            </button>
          )}

          <a
            href={`/receipt/${item.invoice_number}`}
            className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition flex items-center gap-1"
          >
            Receipt
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>

        {/* Modal konfirmasi restore */}
        {showRestoreModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowRestoreModal(false)}
            />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-white text-sm">Restore Transaksi</p>
                  <p className="text-xs text-red-100 mt-0.5">Batalkan & kembalikan stok unit</p>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">

                {/* Info transaksi */}
                <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Nota</span>
                    <span className="font-mono font-semibold text-gray-700">{item.invoice_number}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Customer</span>
                    <span className="font-semibold text-gray-700">{item.customer_name}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Laptop</span>
                    <span className="text-gray-700 text-right max-w-[55%] truncate">{item.laptop_name}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">SN</span>
                    <span className="font-mono text-gray-700">{item.serial_number || "-"}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-gray-200 pt-2">
                    <span className="text-gray-400">Harga</span>
                    <span className="font-bold text-gray-800">
                      Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>

                {/* Efek restore */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Yang akan terjadi:</p>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</span>
                    Status transaksi berubah dari <span className="font-semibold text-emerald-600 mx-1">PAID</span> → <span className="font-semibold text-red-500 ml-1">CANCELLED</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</span>
                    Stok unit SN <span className="font-mono font-semibold mx-1">{item.serial_number}</span> dikembalikan ke <span className="font-semibold text-emerald-600 ml-1">SIAP_JUAL</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</span>
                    Qty laptop otomatis diperbarui
                  </div>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p className="text-xs text-amber-700">
                    Aksi ini <span className="font-semibold">tidak dapat diurungkan</span>. Pastikan sudah berkoordinasi dengan tim terkait.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 pb-6 flex gap-3">
                <button
                  onClick={() => setShowRestoreModal(false)}
                  disabled={restoring}
                  className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >
                  Batal
                </button>

                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className="flex-1 h-11 bg-emerald-600 text-black rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                >
                  {restoring ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                        />
                      </svg>
                      Ya, Restore Transaksi
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div >


      {
        expanded && (
          <div className="px-4 py-3 border-t border-gray-100 bg-white space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div><span className="text-gray-400">SN:</span> <span className="text-gray-700 font-medium">{item.serial_number || "-"}</span></div>
              <div><span className="text-gray-400">Software:</span> <span className="text-gray-700">{item.software_request || "-"}</span></div>
              <div><span className="text-gray-400">Pickup:</span> <span className="text-gray-700">{item.pickup_method}</span></div>
              <div><span className="text-gray-400">Jadwal:</span> <span className="text-gray-700">{item.pickup_date || "-"} {item.pickup_time || ""}</span></div>
              {canSeeFinancials && item.inventory_price > 0 && (
                <div>
                  <span className="text-gray-400">Modal:</span>{" "}
                  <span className="text-gray-700">Rp{item.inventory_price.toLocaleString("id-ID")}</span>
                </div>
              )}
              {item.pickup_location && (
                <div className="col-span-2"><span className="text-gray-400">Alamat:</span> <span className="text-gray-700">{item.pickup_location}</span></div>
              )}
            </div>
            {item.notes && (
              <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600">
                <span className="font-semibold text-gray-500">Catatan: </span>{item.notes}
              </div>
            )}
          </div>
        )
      }
    </div >
  );
}