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

// STATUS & PAYMENT HELPERS
const STATUS_LABEL: Record<string, string> = {
  PAID: "LUNAS", PENDING: "PENDING", CANCELLED: "BATAL", FAILED: "GAGAL",
  RESERVED: "DP", HELD: "DIAMBIL", PACKING: "PACKING",
};

const statusMap: Record<string, string> = {
  PAID: "bg-green-100 text-green-800", PENDING: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800", CANCELLED: "bg-gray-100 text-gray-600",
  RESERVED: "bg-blue-100 text-blue-800", HELD: "bg-orange-100 text-orange-800",
  PACKING: "bg-purple-100 text-purple-800",
};

const formatDate = (date: string) => new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });

const formatDateTime = (date: string) => new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function getPaymentStyle(method: string): { text: string; icon: React.ReactNode; bg: string } {
  const m = (method ?? "").toUpperCase();
  if (m.includes("TUNAI") || m.includes("CASH")) return { text: "💰 Tunai", bg: "emerald", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg> };
  if (m.includes("TRANSFER") || m.includes("BCA") || m.includes("BRI")) return { text: "🏦 Transfer", bg: "blue", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /></svg> };
  if (m.includes("QRIS") || m.includes("QR")) return { text: "📱 QRIS", bg: "purple", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /></svg> };
  return { text: method || "-", bg: "gray", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /></svg> };
}

function getSourcePlatformBadge(platform: string): { text: string; color: string } {
  const p = (platform ?? "").toUpperCase();
  if (p.includes("SHOPEE")) return { text: "🛒 Shopee", color: "bg-red-50 text-red-700 border-red-200" };
  if (p.includes("TOKOPEDIA")) return { text: "🏪 Tokopedia", color: "bg-green-50 text-green-700 border-green-200" };
  if (p.includes("COD") || p.includes("CASH ON DELIVERY")) return { text: "🚗 COD", color: "bg-blue-50 text-blue-700 border-blue-200" };
  if (p.includes("FACEBOOK") || p.includes("FB")) return { text: "👥 Facebook", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  if (p.includes("WHATSAPP") || p.includes("WA")) return { text: "💬 WhatsApp", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return { text: platform || "-", color: "bg-gray-50 text-gray-700 border-gray-200" };
}

function getCustomerTypeBadge(type: string): { text: string; icon: string } {
  const t = (type ?? "UMUM").toUpperCase();
  if (t === "RESELLER") return { text: "Reseller", icon: "🏪" };
  if (t === "CORPORATE") return { text: "Korporat", icon: "🏢" };
  return { text: "Umum", icon: "👤" };
}

// ─── TRANSACTION CARD (Mobile View) ────────────────────────────────────
function TransactionCard({ item, onPhotoClick, canEditTransaction, canRestoreTransaction, canSeeFinancials, onRestored }: any) {
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmSN, setConfirmSN] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const isPending = item.status === "RESERVED" || item.status === "HELD" || item.status === "PACKING";

  const handleConfirmPayment = async () => {
    if (item.status === "RESERVED" && !confirmSN.trim()) { setConfirmError("Serial number wajib diisi"); return; }
    setConfirming(true); setConfirmError("");
    try {
      const res = await fetch("/api/units/confirm-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_number: item.invoice_number, serial_number: confirmSN.trim() || item.serial_number }) });
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

  const payStyle = getPaymentStyle(item.payment_method ?? "");
  const platformBadge = getSourcePlatformBadge(item.source_platform ?? "");
  const customerTypeBadge = getCustomerTypeBadge(item.customer_type ?? "");


  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Header: Status + Info */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900">{item.customer_name}</h3>
            <p className="text-xs text-gray-500 font-mono mt-1">{item.invoice_number}</p>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0 ${statusMap[item.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </div>
        {item.customer_phone && (
          <p className="text-xs text-gray-600 font-semibold">📱 {item.customer_phone}</p>
        )}
      </div>

      {/* Content Section */}
      <div className="px-4 py-3 space-y-3">
        {/* Date & Source */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-gray-500">📅 {formatDate(item.created_at)}</span>
          {item.source_platform && (
            <span className={`px-2.5 py-1 rounded-lg border font-semibold text-[10px] ${platformBadge.color}`}>
              {platformBadge.text}
            </span>
          )}
        </div>

        {/* Customer Type Badge */}
        {item.customer_type && item.customer_type !== "UMUM" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs font-bold text-amber-900">
              {customerTypeBadge.icon} {customerTypeBadge.text}
            </p>
          </div>
        )}

        {/* Sales Info */}
        {item.sales_name && (
          <div className="flex items-center justify-between gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
            <span className="text-xs font-bold text-gray-900 flex-1">👤 {item.sales_name}</span>
            {item.employee_role && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-200 text-blue-800 font-bold whitespace-nowrap">
                {item.employee_role}
              </span>
            )}
          </div>
        )}

        {/* Laptop Info */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-700">💻 Laptop</p>
          <div className="bg-gray-50 rounded-lg p-2.5 space-y-1.5">
            <p className="text-xs font-bold text-gray-900 line-clamp-1">{item.laptop_name || "—"}</p>
            {(item.cpu || item.ram) && (
              <div className="flex flex-wrap gap-1.5">
                {item.cpu && <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[10px] font-bold">⚙️ {item.cpu}</span>}
                {item.ram && <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[10px] font-bold">💾 {item.ram}</span>}
              </div>
            )}
            {item.serial_number && (
              <p className="text-[10px] text-gray-600 font-mono mt-1.5">SN: {item.serial_number}</p>
            )}
          </div>
        </div>

        {/* Price & Payment */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-2.5 border border-blue-200">
              <p className="text-[10px] text-blue-600 font-semibold mb-1">💰 Harga Jual</p>
              <p className="text-sm font-bold text-blue-900 truncate">Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}</p>
            </div>
            {item.other !== undefined && item.other !== null && (
              <div className={`bg-gradient-to-br 
    ${item.other > 0
                  ? "from-emerald-50 to-emerald-100 border-emerald-200"
                  : item.other < 0
                    ? "from-red-50 to-red-100 border-red-200"
                    : "from-gray-50 to-gray-100 border-gray-200"
                } rounded-lg p-2.5 border`}>
                <p className={`text-[10px] font-semibold mb-1
      ${item.other > 0
                    ? "text-emerald-600"
                    : item.other < 0
                      ? "text-red-600"
                      : "text-gray-600"
                  }`}>
                  {item.other > 0 ? "📈" : item.other < 0 ? "📉" : "➖"}
                  {item.other > 0 ? "Gross Profit" : item.other < 0 ? "Loss" : "Break Even"}
                </p>
                <p className={`text-sm font-bold truncate
      ${item.other > 0
                    ? "text-emerald-900"
                    : item.other < 0
                      ? "text-red-900"
                      : "text-gray-900"
                  }`}>
                  {item.other > 0 ? "+" : ""}{item.other
                    ? `Rp${item.other.toLocaleString("id-ID")}`
                    : "Rp0"}
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Payment Method */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-2.5 border border-purple-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {payStyle.icon}
            <span className="text-xs font-bold text-purple-900">{payStyle.text}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-2">
        {showDetails && (
          <div className="bg-gray-50 rounded-lg p-2.5 text-xs space-y-1.5 mb-2 border border-gray-200">
            <div className="flex justify-between">
              <span className="text-gray-600">Invoice:</span>
              <span className="font-mono font-bold text-gray-900">{item.invoice_number}</span>
            </div>
            {item.serial_number && (
              <div className="flex justify-between">
                <span className="text-gray-600">Serial Number:</span>
                <span className="font-mono font-bold text-gray-900">{item.serial_number}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Waktu:</span>
              <span className="font-mono font-bold text-gray-900">{formatDateTime(item.created_at)}</span>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full h-9 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition"
        >
          {showDetails ? "Sembunyikan" : "Lihat"} Detail
        </button>

        <div className="grid grid-cols-3 gap-2">
          {item.payment_photo && (
            <button
              onClick={() => onPhotoClick(item.payment_photo)}
              className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition duration-150"
              title="Bukti pembayaran"
            >
              <span className="text-lg">📸</span>
              <span className="text-[9px] font-semibold">Bukti</span>
            </button>
          )}
          {canEditTransaction && (
            <a
              href={`/payment/${item.invoice_number}`}
              className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition duration-150"
              title="Edit transaksi"
            >
              <span className="text-lg">✏️</span>
              <span className="text-[9px] font-semibold">Edit</span>
            </a>
          )}
          {isPending && canEditTransaction && (
            <button
              onClick={() => { setConfirmSN(item.serial_number || ""); setShowConfirmModal(true); }}
              className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition duration-150"
              title="Konfirmasi lunas"
            >
              <span className="text-lg">✅</span>
              <span className="text-[9px] font-semibold">Lunas</span>
            </button>
          )}
          {canRestoreTransaction && item.status === "PAID" && (
            <button
              onClick={() => setShowRestoreModal(true)}
              className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition duration-150"
              title="Restore transaksi"
            >
              <span className="text-lg">↩️</span>
              <span className="text-[9px] font-semibold">Restore</span>
            </button>
          )}
          <a
            href={`/receipt/${item.invoice_number}`}
            className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition duration-150"
            title="Lihat receipt"
          >
            <span className="text-lg">📄</span>
            <span className="text-[9px] font-semibold">Receipt</span>
          </a>
        </div>
      </div>

      {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}

      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRestoreModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gray-800 px-5 py-4">
              <p className="font-semibold text-white text-sm">Restore Transaksi</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p><span className="font-semibold">Konfirmasi restore untuk {item.customer_name}?</span></p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
              <button onClick={() => setShowRestoreModal(false)} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Batal</button>
              <button onClick={handleRestore} disabled={restoring} className="flex-1 h-10 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition">
                {restoring ? "Memproses..." : "Ya, Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-green-700 px-5 py-4">
              <p className="font-semibold text-white text-sm">Konfirmasi Pelunasan</p>
            </div>
            <div className="p-5 space-y-4">
              {item.status === "RESERVED" && (
                <input type="text" value={confirmSN} onChange={(e) => { setConfirmSN(e.target.value); setConfirmError(""); }} placeholder="Masukkan SN..." className="w-full h-10 border border-gray-300 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 transition" autoFocus />
              )}
              {confirmError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700"><p>{confirmError}</p></div>}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
              <button onClick={() => { setShowConfirmModal(false); setConfirmError(""); }} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Batal</button>
              <button onClick={handleConfirmPayment} disabled={confirming} className="flex-1 h-10 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition">
                {confirming ? "Memproses..." : "Konfirmasi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TRANSACTION TABLE (Desktop View - OPTIMIZED) ────────────────────────────────────
function TransactionTable({ paginatedTransactions, canEditTransaction, canRestoreTransaction, canSeeFinancials, onPhotoClick, onRestored }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-300 shadow-lg overflow-hidden flex flex-col">
      {/* Scrollable Container */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full border-collapse" style={{ minWidth: '1400px' }}>
          <thead>
            <tr className="border-b border-gray-300 bg-gray-100 sticky top-0 z-10">
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Status</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Nota</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Customer</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Kontak</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Sales</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Laptop</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">SN</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Harga</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Margin</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Metode</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Sumber</th>
              <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransactions.map((item: any) => (
              <TransactionTableRow key={item.id} item={item} onPhotoClick={onPhotoClick} canEditTransaction={canEditTransaction} canRestoreTransaction={canRestoreTransaction} canSeeFinancials={canSeeFinancials} onRestored={onRestored} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Scrollbar Hint */}
      <div className="text-center text-xs text-gray-400 py-2 border-t border-gray-200 bg-gray-50">
        ← Scroll untuk melihat lebih banyak kolom →
      </div>
    </div>
  );
}

// ─── TABLE ROW COMPONENT (OPTIMIZED) ────────────────────────────────────
function TransactionTableRow({ item, onPhotoClick, canEditTransaction, canRestoreTransaction, canSeeFinancials, onRestored }: any) {
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
      const res = await fetch("/api/units/confirm-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_number: item.invoice_number, serial_number: confirmSN.trim() || item.serial_number }) });
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

  const payStyle = getPaymentStyle(item.payment_method ?? "");
  const platformBadge = getSourcePlatformBadge(item.source_platform ?? "");
  const totalAmount = (item.deal_price || item.amount || 0) + (item.other || 0);

  return (
    <>
      <tr className="border-b border-gray-200 hover:bg-blue-50/60 transition-colors duration-150 group">
        {/* Status Badge */}
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg font-semibold text-[11px] whitespace-nowrap shadow-sm ${statusMap[item.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </td>

        {/* Invoice Number + Date */}
        <td className="px-3 py-2.5">
          <div className="space-y-0.5">
            <div className="text-[11px] font-bold text-gray-800 font-mono tracking-wider">{item.invoice_number}</div>
            <div className="text-[10px] text-gray-400">{formatDate(item.created_at)}</div>
          </div>
        </td>

        {/* Customer Name + Type */}
        <td className="px-3 py-2.5">
          <div className="space-y-0.5">
            <div className="text-[11px] font-bold text-gray-900">{item.customer_name}</div>
            {item.customer_type && item.customer_type !== "UMUM" && (
              <span className="inline-flex text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 whitespace-nowrap">
                {getCustomerTypeBadge(item.customer_type).icon} {getCustomerTypeBadge(item.customer_type).text}
              </span>
            )}
          </div>
        </td>

        {/* Phone */}
        <td className="px-3 py-2.5">
          {item.customer_phone ? (
            <p className="text-[10px] font-semibold text-gray-700">
              📱 {item.customer_phone}
            </p>
          ) : (
            <span className="text-[10px] text-gray-400">—</span>
          )}
        </td>

        {/* Sales Name + Role */}
        <td className="px-3 py-2.5">
          {item.sales_name ? (
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold text-gray-900">{item.sales_name}</div>
              {item.employee_role && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] bg-blue-100 text-blue-700 font-bold whitespace-nowrap">
                  {item.employee_role}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-gray-400">—</span>
          )}
        </td>

        {/* Laptop Name + Specs */}
        <td className="px-3 py-2.5">
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold text-gray-900">{item.laptop_name || "—"}</div>
            <div className="flex items-center gap-1 flex-wrap">
              {item.cpu && <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-bold whitespace-nowrap">{item.cpu}</span>}
              {item.ram && <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-bold whitespace-nowrap">{item.ram}</span>}
            </div>
          </div>
        </td>

        {/* Serial Number */}
        <td className="px-3 py-2.5">
          {item.serial_number ? (
            <p className="text-[9px] font-mono font-bold text-gray-800">
              {item.serial_number}
            </p>
          ) : (
            <span className="text-[10px] text-gray-400">—</span>
          )}
        </td>

        {/* Price (Harga Jual) */}
        <td className="px-3 py-2.5 text-right">
          <div className="text-[10px] font-bold text-gray-900 font-mono">
            Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}
          </div>
        </td>

        <td className="px-3 py-2.5 text-right">
          {item.other !== undefined && item.other !== null ? (
            <div className={`text-[10px] font-bold font-mono ${item.other > 0 ? "text-emerald-700" : item.other < 0 ? "text-red-700" : "text-gray-500"
              }`}>
              {item.other > 0 ? "+" : ""}{item.other ? `Rp${item.other.toLocaleString("id-ID")}` : "Rp0"}
            </div>
          ) : (
            <span className="text-[10px] text-gray-400">—</span>
          )}
        </td>

<<<<<<< HEAD
=======



>>>>>>> origin/develop
        {/* Payment Method */}
        <td className="px-3 py-2.5 text-center">
          <div className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
            {payStyle.icon}
            <span className="text-[9px] font-bold text-gray-900 whitespace-nowrap">
              {payStyle.text.split(' ')[1]}
            </span>
          </div>
        </td>

        {/* Source Platform */}
        <td className="px-3 py-2.5 text-center">
          {item.source_platform && (
            <span className={`inline-flex text-[9px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${platformBadge.color}`}>
              {platformBadge.text.split(' ')[1]}
            </span>
          )}
        </td>

        {/* Action Buttons */}
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-center gap-1">
            {item.payment_photo && (
              <button
                onClick={() => onPhotoClick(item.payment_photo)}
                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-all duration-150"
                title="Bukti pembayaran"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
            )}
            {canEditTransaction && (
              <a
                href={`/payment/${item.invoice_number}`}
                className="p-1.5 text-gray-600 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-all duration-150"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </a>
            )}
            {isPending && canEditTransaction && (
              <button
                onClick={() => { setConfirmSN(item.serial_number || ""); setShowConfirmModal(true); }}
                className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-100 rounded-lg transition-all duration-150"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            {canRestoreTransaction && item.status === "PAID" && (
              <button
                onClick={() => setShowRestoreModal(true)}
                className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-all duration-150"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
            <a
              href={`/receipt/${item.invoice_number}`}
              className="p-1.5 text-gray-600 hover:text-purple-600 hover:bg-purple-100 rounded-lg transition-all duration-150"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
          </div>
        </td>
      </tr>

      {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}

      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRestoreModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gray-800 px-5 py-4">
              <p className="font-semibold text-white text-sm">Restore Transaksi</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p><span className="font-semibold">Konfirmasi restore untuk {item.customer_name}?</span></p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
              <button onClick={() => setShowRestoreModal(false)} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Batal</button>
              <button onClick={handleRestore} disabled={restoring} className="flex-1 h-10 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition">
                {restoring ? "Memproses..." : "Ya, Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-green-700 px-5 py-4">
              <p className="font-semibold text-white text-sm">Konfirmasi Pelunasan</p>
            </div>
            <div className="p-5 space-y-4">
              {item.status === "RESERVED" && (
                <input type="text" value={confirmSN} onChange={(e) => { setConfirmSN(e.target.value); setConfirmError(""); }} placeholder="Masukkan SN..." className="w-full h-10 border border-gray-300 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 transition" autoFocus />
              )}
              {confirmError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700"><p>{confirmError}</p></div>}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
              <button onClick={() => { setShowConfirmModal(false); setConfirmError(""); }} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Batal</button>
              <button onClick={handleConfirmPayment} disabled={confirming} className="flex-1 h-10 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition">
                {confirming ? "Memproses..." : "Konfirmasi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── MAIN PAGE COMPONENT ────────────────────────────────────
export default function Page() {
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [sourcePlatform, setSourcePlatform] = useState("ALL");
  const [customerType, setCustomerType] = useState("ALL");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = isMobile ? 10 : 15;
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  // Detect screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
    
    // Apply filters
    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter((item) =>
        item.invoice_number?.toLowerCase().includes(term) ||
        item.customer_name?.toLowerCase().includes(term) ||
        item.customer_phone?.toLowerCase().includes(term) ||
        item.laptop_name?.toLowerCase().includes(term)
      );
    }
    
    if (status !== "ALL") {
      filtered = filtered.filter((item) => item.status === status);
    }
    
    if (customerType !== "ALL") {
      filtered = filtered.filter((item) => (item.customer_type ?? "UMUM") === customerType);
    }
    
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
    
    if (paymentMethod !== "ALL") {
      filtered = filtered.filter((item) => item.payment_method === paymentMethod);
    }
    
    if (sourcePlatform !== "ALL") {
      filtered = filtered.filter((item) => item.source_platform === sourcePlatform);
    }
    
    // Stable sort: always newest first (created_at desc), then by id for same timestamp
    filtered.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      
      if (timeB !== timeA) {
        return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
      }
      // Fallback sort by id if timestamps are equal
      return (b.id || 0) - (a.id || 0);
    });
    
    return filtered;
  }, [allTransactions, search, status, customerType, dateFrom, dateTo, paymentMethod, sourcePlatform, sortOrder]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  
  const paginatedTransactions = useMemo(() => {
    if (filteredTransactions.length === 0) return [];
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = Math.min(start + itemsPerPage, filteredTransactions.length);
    
    // Always slice from the sorted array - don't re-sort here
    return filteredTransactions.slice(start, end);
  }, [filteredTransactions, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [search, status, customerType, dateFrom, dateTo, paymentMethod, sourcePlatform, sortOrder]);

  const uniquePaymentMethods = useMemo(() => {
    const methods = new Set(allTransactions.map((t) => t.payment_method).filter(Boolean));
    return ["ALL", ...Array.from(methods)];
  }, [allTransactions]);

  const hasActiveFilter = status !== "ALL" || customerType !== "ALL" || dateFrom || dateTo || paymentMethod !== "ALL" || sourcePlatform !== "ALL";

  const resetFilters = () => {
    setSearch(""); setStatus("ALL"); setCustomerType("ALL"); setDateFrom(""); setDateTo("");
    setPaymentMethod("ALL"); setSourcePlatform("ALL");
  };

  const inputCls = "w-full border border-gray-200 rounded-xl h-10 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition";

  return (
    <DashboardLayout>
      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className={`${isMobile ? "px-4" : "max-w-7xl mx-auto px-4"} py-6 space-y-5`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-8 bg-gradient-to-b from-gray-700 to-gray-900 rounded-full" />
              <h1 className={`${isMobile ? "text-xl" : "text-2xl"} font-bold text-gray-900`}>Riwayat Transaksi</h1>
            </div>
            <p className="text-sm text-gray-600 ml-5">Kelola dan pantau semua transaksi penjualan</p>
          </div>
          {!isLoading && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-2 rounded-lg border border-blue-200">
              <span className="text-sm font-bold text-gray-900">📊 {filteredTransactions.length}</span>
            </div>
          )}
        </div>

        {/* Search + Filter Card */}
        <div className="bg-white rounded-xl border border-gray-300 shadow-md p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder="Cari nota, customer, WA, laptop..." className="w-full border border-gray-300 rounded-lg h-11 pl-10 pr-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold transition bg-white text-gray-700 hover:bg-gray-50 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{sortOrder === "newest" ? <><line x1="12" y1="20" x2="12" y2="4" /><polyline points="6 10 12 4 18 10" /></> : <><line x1="12" y1="4" x2="12" y2="20" /><polyline points="18 14 12 20 6 14" /></>}</svg>
              <span className="hidden sm:inline text-xs">{sortOrder === "newest" ? "Terbaru" : "Terlama"}</span>
            </button>
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg border text-sm font-semibold transition shadow-sm ${hasActiveFilter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              Filter
              {hasActiveFilter && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold">{[status !== "ALL", customerType !== "ALL", dateFrom, dateTo, paymentMethod !== "ALL", sourcePlatform !== "ALL"].filter(Boolean).length}</span>}
            </button>
          </div>

          {showFilters && (
            <div className="pt-3 border-t border-gray-200 space-y-3">
              {/* Status Filter */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Status</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {["ALL", "PAID", "RESERVED", "PENDING", "CANCELLED"].map((s) => (
                    <button key={s} onClick={() => setStatus(s)} className={`h-8 rounded-xl text-xs font-medium border transition ${status === s ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                      {s === "ALL" ? "Semua" : s === "RESERVED" ? "DP" : s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Rentang Tanggal</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Dari</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Sampai</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              {/* Customer Type Filter */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tipe Customer</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {["ALL", "UMUM", "RESELLER", "CORPORATE"].map((ct) => (
                    <button
                      key={ct}
                      onClick={() => setCustomerType(ct)}
                      className={`h-8 rounded-xl text-xs font-medium border transition ${
                        customerType === ct ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {ct === "ALL" ? "Semua" : ct === "UMUM" ? "Umum" : ct === "RESELLER" ? "Reseller" : "Korporat"}
                    </button>
                  ))}
                </div>
              </div>

              {hasActiveFilter && <button onClick={resetFilters} className="w-full h-9 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition font-medium">Reset Filter</button>}
            </div>
          )}
        </div>

        {/* Content: Cards (Mobile) or Table (Desktop) */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full" />
            <p className="mt-4 text-sm text-gray-500">Memuat data...</p>
          </div>
        ) : paginatedTransactions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <div className="text-6xl mb-4 opacity-50">🔍</div>
            <p className="text-gray-500 text-base font-medium">Tidak ada transaksi</p>
          </div>
        ) : isMobile ? (
          <div className="space-y-2">
            {paginatedTransactions.map((item) => (
              <TransactionCard
                key={item.id}
                item={item}
                onPhotoClick={setPhotoModal}
                canEditTransaction={canEditTransaction}
                canSeeFinancials={canSeeFinancials}
                canRestoreTransaction={canRestoreTransaction}
                onRestored={() => fetchTransactions()}
              />
            ))}
          </div>
        ) : (
          <TransactionTable
            paginatedTransactions={paginatedTransactions}
            canEditTransaction={canEditTransaction}
            canRestoreTransaction={canRestoreTransaction}
            canSeeFinancials={canSeeFinancials}
            onPhotoClick={setPhotoModal}
            onRestored={() => fetchTransactions()}
          />
        )}

        {/* Pagination */}
        {!isLoading && filteredTransactions.length > itemsPerPage && (
          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Sebelumnya
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-xl">{currentPage}</span>
              <span className="text-sm text-gray-400">/</span>
              <span className="text-sm text-gray-500">{totalPages}</span>
            </div>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition font-medium">
              Selanjutnya
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>
    </DashboardLayout>
  );
}