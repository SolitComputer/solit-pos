"use client";

import { useEffect, useState, useMemo } from "react";

export default function Page() {
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter states
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [sourcePlatform, setSourcePlatform] = useState("ALL");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch all transactions once
  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/transaction?search=&status=ALL`);
      const result = await response.json();
      setAllTransactions(result.data || []);
    } catch (error) {
      console.error(error);
      setAllTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Apply all filters (client-side)
  const filteredTransactions = useMemo(() => {
    let filtered = [...allTransactions];

    // Search filter (invoice, customer, phone, laptop)
    if (search.trim() !== "") {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.invoice_number?.toLowerCase().includes(term) ||
          item.customer_name?.toLowerCase().includes(term) ||
          item.customer_phone?.toLowerCase().includes(term) ||
          item.laptop_name?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (status !== "ALL") {
      filtered = filtered.filter((item) => item.status === status);
    }

    // Date range filter (created_at)
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter((item) => new Date(item.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((item) => new Date(item.created_at) <= to);
    }

    // Payment method filter
    if (paymentMethod !== "ALL") {
      filtered = filtered.filter((item) => item.payment_method === paymentMethod);
    }

    // Source platform filter
    if (sourcePlatform !== "ALL") {
      filtered = filtered.filter((item) => item.source_platform === sourcePlatform);
    }

    return filtered;
  }, [allTransactions, search, status, dateFrom, dateTo, paymentMethod, sourcePlatform]);

  // Pagination logic
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, dateFrom, dateTo, paymentMethod, sourcePlatform]);

  // Get unique values for filter dropdowns
  const uniquePaymentMethods = useMemo(() => {
    const methods = new Set(allTransactions.map((t) => t.payment_method).filter(Boolean));
    return ["ALL", ...Array.from(methods)];
  }, [allTransactions]);

  const uniqueSourcePlatforms = useMemo(() => {
    const sources = new Set(allTransactions.map((t) => t.source_platform).filter(Boolean));
    return ["ALL", ...Array.from(sources)];
  }, [allTransactions]);

  // Skeleton card (compact)
  const TransactionSkeleton = () => (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <div className="h-4 bg-gray-100 rounded w-28"></div>
          <div className="h-3 bg-gray-100 rounded w-36"></div>
          <div className="h-3 bg-gray-100 rounded w-24"></div>
        </div>
        <div className="h-5 bg-gray-100 rounded-full w-16"></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="h-3 bg-gray-100 rounded w-16"></div>
          <div className="h-4 bg-gray-100 rounded w-32"></div>
          <div className="h-3 bg-gray-100 rounded w-40"></div>
        </div>
        <div className="space-y-1">
          <div className="h-3 bg-gray-100 rounded w-16"></div>
          <div className="h-3 bg-gray-100 rounded w-28"></div>
          <div className="h-3 bg-gray-100 rounded w-32"></div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
        <div className="h-3 bg-gray-100 rounded w-24"></div>
        <div className="h-6 bg-gray-100 rounded w-16"></div>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl md:text-2xl font-semibold text-gray-800 tracking-tight">Riwayat Transaksi</h1>
          <a
            href="/dashboard"
            className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition shadow-sm"
          >
            Dashboard
          </a>
        </div>

        {/* Filter Section */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm mb-5">
          {/* Baris 1: search & status */}
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder="Cari invoice / customer / WA / laptop"
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-gray-300"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="ALL">Semua Status</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          {/* Baris 2: filter tambahan (tanggal, payment method, source) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex gap-2">
              <input
                type="date"
                placeholder="Dari tanggal"
                className="border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50 w-full"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <input
                type="date"
                placeholder="Sampai tanggal"
                className="border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50 w-full"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <select
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {uniquePaymentMethods.map((method) => (
                <option key={method} value={method}>
                  {method === "ALL" ? "Semua Metode" : method}
                </option>
              ))}
            </select>
            <select
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50"
              value={sourcePlatform}
              onChange={(e) => setSourcePlatform(e.target.value)}
            >
              {uniqueSourcePlatforms.map((source) => (
                <option key={source} value={source}>
                  {source === "ALL" ? "Semua Source" : source}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setSearch("");
                setStatus("ALL");
                setDateFrom("");
                setDateTo("");
                setPaymentMethod("ALL");
                setSourcePlatform("ALL");
              }}
              className="bg-gray-100 text-gray-700 rounded-lg h-10 px-3 text-sm hover:bg-gray-200 transition"
            >
              Reset Filter
            </button>
          </div>
        </div>

        {/* List Transaksi */}
        <div className="space-y-3">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => <TransactionSkeleton key={i} />)
          ) : paginatedTransactions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-sm">
              <p className="text-gray-500 text-sm">Tidak ada transaksi yang sesuai filter</p>
            </div>
          ) : (
            paginatedTransactions.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all duration-200"
              >
                {/* Baris 1: Customer & Status */}
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <h2 className="font-semibold text-gray-800 text-base">{item.customer_name}</h2>
                    <p className="text-xs text-gray-500">{item.customer_phone}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.invoice_number}</p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      item.status === "PAID"
                        ? "bg-gray-100 text-gray-700"
                        : item.status === "PENDING"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                {/* Baris 2: Laptop & Payment */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Laptop</p>
                    <p className="font-medium text-gray-800">{item.laptop_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0 text-xs text-gray-500 mt-0.5">
                      <span>SN: {item.serial_number}</span>
                      <span>Software: {item.software_request || "-"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Payment</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0 text-xs">
                      <span className="text-gray-600">Method: {item.payment_method}</span>
                      <span className="text-gray-800 font-medium">Deal: Rp {(item.deal_price || item.amount).toLocaleString("id-ID")}</span>
                      <span className="text-gray-600">Profit: + Rp {(item.other || 0).toLocaleString("id-ID")}</span>
                    </div>
                    {item.inventory_price > 0 && (
                      <p className="text-xs text-gray-500">Modal: Rp {item.inventory_price.toLocaleString("id-ID")}</p>
                    )}
                  </div>
                </div>

                {/* Baris 3: Pickup, Jadwal, Source */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span>📦 {item.pickup_method}</span>
                  <span>📅 {item.pickup_date} {item.pickup_time}</span>
                  <span>🔗 {item.source_platform}</span>
                </div>

                {/* Notes */}
                {item.notes && (
                  <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                    <span className="font-medium">Notes:</span> {item.notes}
                  </div>
                )}

                {/* Photo & GPS */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {item.payment_photo && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Bukti:</span>
                      <img src={item.payment_photo} alt="payment" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                    </div>
                  )}
                  {item.latitude && item.longitude && (
                    <a
                      href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-1 rounded-lg text-xs hover:bg-gray-200 transition"
                    >
                      📍 Maps
                    </a>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center text-xs">
                  <span className="text-gray-400">{new Date(item.created_at).toLocaleString("id-ID")}</span>
                  <a
                    href={`/receipt/${item.invoice_number}`}
                    className="bg-white text-gray-700 border border-gray-200 px-3 py-1 rounded-lg text-xs font-medium hover:bg-gray-50 transition shadow-sm"
                  >
                    Receipt
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {!isLoading && filteredTransactions.length > 0 && (
          <div className="flex justify-center items-center gap-2 mt-6 flex-wrap">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Halaman {currentPage} dari {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}