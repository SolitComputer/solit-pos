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

// Badge customer type - enhanced design
function CustomerTypeBadge({ type }: { type?: string }) {
  if (!type || type === "UMUM") return null;
  const styles: Record<string, string> = {
    RESELLER: "bg-amber-100 text-amber-800 border-amber-300",
    MITRA: "bg-indigo-100 text-indigo-800 border-indigo-300",
  };
  const icons: Record<string, string> = { RESELLER: "🔄", MITRA: "🤝" };
  const labels: Record<string, string> = { RESELLER: "Reseller", MITRA: "Mitra" };
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 shadow-sm ${styles[type] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
      <span className="text-[10px]">{icons[type] ?? ""}</span>
      <span>{labels[type] ?? type}</span>
    </span>
  );
}

// TransactionCard Component - DESIGN ENHANCED
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
    PAID: "bg-green-100 text-green-800 border-green-300 shadow-sm",
    PENDING: "bg-yellow-100 text-yellow-800 border-yellow-300 shadow-sm",
    FAILED: "bg-red-100 text-red-800 border-red-300 shadow-sm",
    CANCELLED: "bg-gray-100 text-gray-600 border-gray-300 shadow-sm",
    RESERVED: "bg-blue-100 text-blue-800 border-blue-300 shadow-sm",
    HELD: "bg-orange-100 text-orange-800 border-orange-300 shadow-sm",
    PACKING: "bg-purple-100 text-purple-800 border-purple-300 shadow-sm",
  };

  const EmployeeBadgeInline = ({ name }: { name: string }) => {
    const getRoleFromName = (employeeName: string) => {
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
      if (roleLower.includes("admin")) return "bg-red-100 text-red-800 border-red-300";
      if (roleLower.includes("manager")) return "bg-purple-100 text-purple-800 border-purple-300";
      if (roleLower.includes("supervisor")) return "bg-blue-100 text-blue-800 border-blue-300";
      if (roleLower.includes("sales")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
      if (roleLower.includes("marketing")) return "bg-pink-100 text-pink-800 border-pink-300";
      if (roleLower.includes("support")) return "bg-cyan-100 text-cyan-800 border-cyan-300";
      return "bg-gray-100 text-gray-600 border-gray-300";
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
      <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 shadow-sm ${getRoleStyle()}`}>
        <span className="text-[10px]">{getRoleIcon()}</span>
        <span>{name}</span>
      </span>
    );
  };

  type PaymentStyle = { bg: string; text: string; border: string; icon: React.ReactNode };
  function getPaymentStyle(method: string): PaymentStyle {
    const m = (method ?? "").toUpperCase();
    if (m.includes("TUNAI") || m.includes("CASH")) return { 
      bg: "bg-emerald-100", 
      text: "text-emerald-800", 
      border: "border-emerald-300", 
      icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg> 
    };
    if (m.includes("TRANSFER") || m.includes("BCA") || m.includes("BRI") || m.includes("MANDIRI") || m.includes("BNI")) return { 
      bg: "bg-blue-100", 
      text: "text-blue-800", 
      border: "border-blue-300", 
      icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg> 
    };
    if (m.includes("QRIS") || m.includes("QR")) return { 
      bg: "bg-purple-100", 
      text: "text-purple-800", 
      border: "border-purple-300", 
      icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h.01M14 17h.01M17 14h.01M17 17h3M20 14h.01M17 20h3" /></svg> 
    };
    return { 
      bg: "bg-gray-100", 
      text: "text-gray-600", 
      border: "border-gray-300", 
      icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg> 
    };
  }

  const payStyle = getPaymentStyle(item.payment_method ?? "");
  const customerTypeIcon: Record<string, string> = { UMUM: "👤", RESELLER: "🔄", MITRA: "🤝" };

  // Helper untuk format tanggal lebih bersih
  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    if (d.toDateString() === now.toDateString()) return "Hari ini";
    if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Compact header */}
      <div className="p-2.5">
        {/* Baris 1: Nama + Status + Harga */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <h2 className="font-semibold text-gray-800 text-xs flex items-center gap-0.5">
                <span className="text-gray-400 text-[10px]">👤</span>
                {item.customer_name}
              </h2>
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${statusMap[item.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              <CustomerTypeBadge type={item.customer_type} />
              {item.sales_name && <EmployeeBadgeInline name={item.sales_name} />}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[8px] text-gray-400">📄</span>
              <p className="text-[8px] text-gray-500 font-mono">{item.invoice_number}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-bold text-gray-800 flex items-center gap-0.5">
              <span className="text-[9px] text-gray-500">💰</span>
              Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}
            </p>
            {canSeeFinancials && item.other > 0 && (
              <p className="text-[8px] text-gray-500">+Rp{(item.other || 0).toLocaleString("id-ID")}</p>
            )}
          </div>
        </div>

        {/* Baris 2: Laptop & Spek */}
        <div className="mb-1">
          <div className="flex items-center gap-0.5">
            <span className="text-[8px] text-gray-400">💻</span>
            <p className="text-[9px] font-medium text-gray-700 leading-tight truncate">{item.laptop_name || "—"}</p>
          </div>
          {(item.cpu || item.ram || item.storage || item.display) && (
            <div className="flex flex-wrap items-center gap-0.5 mt-0.5 ml-3">
              {item.cpu && <span className="text-[7px] text-gray-600 bg-gray-100 border border-gray-200 px-1 py-0.5 rounded-md">{item.cpu}</span>}
              {item.ram && <span className="text-[7px] text-gray-600 bg-gray-100 border border-gray-200 px-1 py-0.5 rounded-md">{item.ram}</span>}
              {item.storage && <span className="text-[7px] text-gray-600 bg-gray-100 border border-gray-200 px-1 py-0.5 rounded-md">{item.storage}</span>}
              {item.display && <span className="text-[7px] text-gray-500 bg-gray-100 border border-gray-100 px-1 py-0.5 rounded-md">{item.display}</span>}
            </div>
          )}
          {item.serial_number && (
            <div className="flex items-center gap-0.5 mt-1 ml-3">
              <span className="text-[7px] font-medium text-gray-400 uppercase">🔢 SN</span>
              <code className="text-[8px] font-mono text-gray-600 bg-gray-100 px-1 py-0.5 rounded-md">{item.serial_number}</code>
            </div>
          )}
        </div>

        {/* Baris 3: Info tambahan */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
          {item.customer_phone && (
            <div className="flex items-center gap-0.5">
              <span className="text-[7px] text-gray-400">📞</span>
              <span className="text-[8px] text-gray-500">{item.customer_phone}</span>
            </div>
          )}
          {item.payment_method && (
            <span className={`inline-flex items-center gap-0.5 text-[8px] font-medium px-1.5 py-0.5 rounded-full border shadow-sm ${payStyle.bg} ${payStyle.text} ${payStyle.border}`}>
              {payStyle.icon}
              <span>{item.payment_method === "TRANSFER" ? "Transfer" : item.payment_method === "CASH" ? "Tunai" : item.payment_method}</span>
            </span>
          )}
          {item.source_platform && item.source_platform !== "-" && (
            <div className="flex items-center gap-0.5">
              <span className="text-[7px] text-gray-400">🌐</span>
              <span className="text-[8px] text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">{item.source_platform}</span>
            </div>
          )}
          <div className="flex items-center gap-0.5 ml-auto">
            <span className="text-[7px] text-gray-400">📅</span>
            <span className="text-[8px] text-gray-500 flex-shrink-0">
              {formatDate(item.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer actions - enhanced */}
      <div className="px-2.5 py-1.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-[9px]">
        <div className="flex items-center gap-2">
          {item.payment_photo && (
            <button onClick={() => onPhotoClick(item.payment_photo)} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition font-medium">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              Bukti
            </button>
          )}
          {item.latitude && item.longitude && (
            <a href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition font-medium">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" />
              </svg>
              Maps
            </a>
          )}
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition font-medium">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {expanded ? "Tutup" : "Detail"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {canEditTransaction && (
            <a href={`/payment/${item.invoice_number}`} className="text-gray-600 hover:text-gray-900 transition flex items-center gap-0.5 font-medium">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </a>
          )}
          {canRestoreTransaction && item.status === "PAID" && (
            <button onClick={() => setShowRestoreModal(true)} className="text-red-500 hover:text-red-700 transition flex items-center gap-0.5 font-medium">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Restore
            </button>
          )}
          {canEditTransaction && isPending && (
            <button onClick={() => { setConfirmSN(item.serial_number || ""); setShowConfirmModal(true); }} className="text-green-600 hover:text-green-800 transition flex items-center gap-0.5 font-medium">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Lunas
            </button>
          )}
          <a href={`/receipt/${item.invoice_number}`} className="text-gray-600 hover:text-gray-900 transition flex items-center gap-0.5 font-medium">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
            Receipt
          </a>
        </div>
      </div>

      {/* Expanded detail - enhanced */}
      {expanded && (
        <div className="px-2.5 py-2 border-t border-gray-200 bg-gray-50 text-[9px]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="flex items-start gap-1"><span className="text-gray-400 min-w-[40px]">👥 Tipe</span><p className="text-gray-700 font-medium">{customerTypeIcon[item.customer_type] ?? "👤"} {item.customer_type || "Umum"}</p></div>
            <div className="flex items-start gap-1"><span className="text-gray-400 min-w-[40px]">📦 Pickup</span><p className="text-gray-700 font-medium">{item.pickup_method || "—"}</p></div>
            <div className="flex items-start gap-1"><span className="text-gray-400 min-w-[40px]">💿 Software</span><p className="text-gray-700 font-medium">{item.software_request || "—"}</p></div>
            <div className="flex items-start gap-1"><span className="text-gray-400 min-w-[40px]">📅 Jadwal</span><p className="text-gray-700 font-medium">{item.pickup_date || "—"} {item.pickup_time || ""}</p></div>
            {canSeeFinancials && item.inventory_price > 0 && (
              <div className="flex items-start gap-1"><span className="text-gray-400 min-w-[40px]">🏷️ Modal</span><p className="text-gray-700 font-medium">Rp{item.inventory_price.toLocaleString("id-ID")}</p></div>
            )}
            {item.pickup_location && (
              <div className="col-span-2 flex items-start gap-1"><span className="text-gray-400 min-w-[40px]">📍 Alamat</span><p className="text-gray-700 font-medium flex-1">{item.pickup_location}</p></div>
            )}
          </div>
          {item.notes && (
            <div className="mt-2 bg-white rounded-lg px-2 py-1.5 text-gray-600 border border-gray-200 text-[8px]">
              <span className="font-medium text-gray-500">📝 Catatan: </span>{item.notes}
            </div>
          )}
        </div>
      )}

      {item.status === "PACKING" && item.ecommerce_platform && (
        <div className="mx-2.5 mb-1.5 flex justify-between text-[8px] bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
          <span className="text-blue-700 font-medium">📦 Pesanan {item.ecommerce_platform}</span>
          {item.ecommerce_order_id && <span className="font-mono text-blue-600">#{item.ecommerce_order_id}</span>}
        </div>
      )}

      {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}

      {/* Restore Modal - enhanced */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRestoreModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                <div>
                  <p className="font-semibold text-white text-sm">Restore Transaksi</p>
                  <p className="text-xs text-gray-300">Batalkan & kembalikan stok unit</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-xs border border-gray-200">
                {[
                  { label: "Nota", value: item.invoice_number, icon: "📄" },
                  { label: "Customer", value: item.customer_name, icon: "👤" },
                  { label: "Laptop", value: item.laptop_name?.slice(0, 40), icon: "💻" },
                  { label: "SN", value: item.serial_number || "—", icon: "🔢" }
                ].map(({ label, value, icon }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1">{icon} {label}</span>
                    <span className="font-medium text-gray-700 text-right max-w-[60%] truncate">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-1">
                  <span className="text-gray-400 flex items-center gap-1">💰 Harga</span>
                  <span className="font-bold text-gray-800">Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                <p>Aksi ini <span className="font-semibold">tidak dapat diurungkan</span>. Stok unit akan dikembalikan.</p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
              <button onClick={() => setShowRestoreModal(false)} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Batal</button>
              <button onClick={handleRestore} disabled={restoring} className="flex-1 h-10 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition flex items-center justify-center gap-2">
                {restoring ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</> : "Ya, Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Lunas Modal - enhanced */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden animate-slideUp">
            <div className="bg-gradient-to-r from-green-700 to-green-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <p className="font-semibold text-white text-sm">Konfirmasi Pelunasan</p>
                  <p className="text-xs text-green-200">{item.status === "RESERVED" ? "DP → LUNAS" : item.status === "PACKING" ? "📦 Dana Cair → LUNAS" : "Diambil → LUNAS"}</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-xs border border-gray-200">
                {[
                  { label: "Nota", value: item.invoice_number, icon: "📄" },
                  { label: "Customer", value: item.customer_name, icon: "👤" },
                  { label: "Laptop", value: item.laptop_name?.slice(0, 40), icon: "💻" }
                ].map(({ label, value, icon }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1">{icon} {label}</span>
                    <span className="font-medium text-gray-700 text-right max-w-[60%] truncate">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-1">
                  <span className="text-gray-400 flex items-center gap-1">💰 Harga Deal</span>
                  <span className="font-bold text-green-700">Rp{(item.deal_price || item.amount || 0).toLocaleString("id-ID")}</span>
                </div>
              </div>
              {item.status === "RESERVED" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">🔢 Serial Number <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={confirmSN} 
                    onChange={(e) => { setConfirmSN(e.target.value); setConfirmError(""); }} 
                    placeholder="Masukkan serial number unit..." 
                    className="w-full h-10 border border-gray-300 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition" 
                    autoFocus 
                  />
                </div>
              )}
              {confirmError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 animate-shake">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <p className="text-xs text-red-700">{confirmError}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
              <button onClick={() => { setShowConfirmModal(false); setConfirmError(""); }} disabled={confirming} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Batal</button>
              <button onClick={handleConfirmPayment} disabled={confirming || (item.status === "RESERVED" && !confirmSN.trim())} className="flex-1 h-10 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition flex items-center justify-center gap-2">
                {confirming ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</> : "Konfirmasi Lunas"}
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
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .animate-shake { animation: shake 0.3s ease-in-out; }
      `}</style>
    </div>
  );
}

// Page component - dengan design enhancements pada header dan filter
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
        {/* Header Modern - enhanced */}
        <div className="flex items-center justify-between animate-fadeIn">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
              <div className="w-8 h-8 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-md">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-800">
                Riwayat Transaksi
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-11">Kelola dan pantau semua transaksi penjualan</p>
          </div>
          {!isLoading && (
            <div className="bg-gradient-to-r from-gray-100 to-gray-200 px-3 py-1.5 rounded-full shadow-inner">
              <span className="text-xs font-semibold text-gray-700">
                📊 {filteredTransactions.length} transaksi
              </span>
            </div>
          )}
        </div>

        {/* Search + Filter Card - enhanced */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Cari nota, customer, WA, laptop..."
                className="w-full border border-gray-200 rounded-xl h-10 pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
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
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition ${
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
            <div className="pt-3 border-t border-gray-200 space-y-3">
              {/* Status Buttons */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Status</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {["ALL", "PAID", "PACKING", "RESERVED", "HELD", "PENDING", "CANCELLED", "FAILED"].map((s) => (
                    <button key={s} onClick={() => setStatus(s)}
                      className={`h-8 rounded-xl text-xs font-medium border transition ${status === s ? "bg-gray-800 text-white border-gray-800 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
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
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tipe Customer</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { val: "ALL", label: "Semua", icon: "", color: "gray" },
                    { val: "UMUM", label: "Umum", icon: "👤", color: "gray" },
                    { val: "RESELLER", label: "Reseller", icon: "🔄", color: "amber" },
                    { val: "MITRA", label: "Mitra", icon: "🤝", color: "indigo" },
                  ].map((ct) => (
                    <button key={ct.val} onClick={() => setCustomerType(ct.val)}
                      className={`h-8 rounded-xl text-xs font-medium border transition flex items-center justify-center gap-1 ${
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
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Dari Tanggal</label>
                  <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Sampai Tanggal</label>
                  <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              {/* Method & Source */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Metode bayar</label>
                  <select className={selectCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {uniquePaymentMethods.map((m) => <option key={m} value={m}>{m === "ALL" ? "Semua Metode" : m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Sumber</label>
                  <select className={selectCls} value={sourcePlatform} onChange={(e) => setSourcePlatform(e.target.value)}>
                    {uniqueSourcePlatforms.map((s) => <option key={s} value={s}>{s === "ALL" ? "Semua Source" : s}</option>)}
                  </select>
                </div>
              </div>

              {hasActiveFilter && (
                <button onClick={resetFilters} className="w-full h-9 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition font-medium">
                  Reset semua filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* List Transaksi */}
        <div className="space-y-2">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 animate-pulse space-y-2">
                <div className="flex justify-between">
                  <div className="space-y-1 flex-1"><div className="h-3 bg-gray-100 rounded w-28" /><div className="h-2 bg-gray-100 rounded w-20" /></div>
                  <div className="h-4 bg-gray-100 rounded-full w-12" />
                </div>
                <div className="mt-2 space-y-1">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-2 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))
          ) : paginatedTransactions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-16 text-center shadow-sm">
              <div className="text-7xl mb-4 opacity-50">🔍</div>
              <p className="text-gray-500 text-base font-medium">Tidak ada transaksi</p>
              <p className="text-gray-400 text-sm mt-2">Coba ubah filter atau kata pencarian</p>
              {hasActiveFilter && (
                <button
                  onClick={resetFilters}
                  className="mt-4 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Sebelumnya
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-xl">{currentPage}</span>
              <span className="text-sm text-gray-400">/</span>
              <span className="text-sm text-gray-500">{totalPages}</span>
            </div>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition font-medium">
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