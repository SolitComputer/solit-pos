"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission, hasAnyRole } from "@/lib/permissions";
import DateRangeCalendarPicker from "@/components/ui/DateRangeCalendarPicker";
import { createPortal } from "react-dom";
import {
  ImageIcon, Pencil, CheckCircle2, Receipt, Inbox,
  Store, Building2, User, Landmark, Banknote, QrCode, CreditCard,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

// ─── SORTING TYPES ───────────────────────────────────────────────────
export type SortKey =
  | "invoice" | "date" | "customer" | "sales" | "laptop" | "cpu"
  | "sn" | "price" | "margin" | "method" | "source" | "company";

export type SortDir = "asc" | "desc";

const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  invoice: "asc", date: "desc", customer: "asc", sales: "asc", laptop: "asc",
  cpu: "asc", sn: "asc", price: "desc", margin: "desc", method: "asc",
  source: "asc", company: "asc",
};

const CLIENT_SIDE_SORT_KEYS: SortKey[] = ["margin"];

const DEFAULT_SORT: { by: SortKey; dir: SortDir } = { by: "date", dir: "desc" };

// ─── Photo Modal ────────────────────────────────────────────────────
function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white transition flex items-center gap-1.5 text-sm font-medium">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Tutup (Esc)
        </button>
        <img src={url} alt="Bukti pembayaran" className="w-full rounded-2xl shadow-2xl ring-1 ring-white/10" />
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center ring-1 ring-black/5">
        <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-700 text-sm font-medium mb-5 leading-relaxed">{message}</p>
        <button onClick={onClose} className="w-full h-10 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition">OK</button>
      </div>
    </div>
  );
}

function ExportProgressModal({ progress, label }: { progress: number; label: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 ring-1 ring-black/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">Export Excel</p>
            <p className="text-xs text-gray-400 truncate">{label || "Memproses..."}</p>
          </div>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-gray-400">Jangan tutup halaman ini</span>
          <span className="text-xs font-bold text-emerald-700 tabular-nums">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── STATUS & PAYMENT HELPERS ────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  PAID: "LUNAS", PENDING: "PENDING", CANCELLED: "BATAL", FAILED: "GAGAL",
  RESERVED: "DP", HELD: "DIAMBIL", PACKING: "PACKING",
};

const statusMap: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  PENDING: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  FAILED: "bg-red-100 text-red-800 ring-1 ring-red-200",
  CANCELLED: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",
  RESERVED: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  HELD: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  PACKING: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
};

const statusDot: Record<string, string> = {
  PAID: "bg-emerald-500",
  PENDING: "bg-amber-500",
  FAILED: "bg-red-500",
  CANCELLED: "bg-gray-400",
  RESERVED: "bg-blue-500",
  HELD: "bg-orange-500",
  PACKING: "bg-violet-500",
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });

const formatDateShort = (date: string) => {
  const d = new Date(date);
  const datePart = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });
  const timePart = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
};

const formatDateTime = (date: string) =>
  new Date(date).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

function getPaymentStyle(method: string): { text: string; icon: React.ReactNode; bg: string } {
  const m = (method ?? "").toUpperCase();
  const hasCash = m.includes("TUNAI") || m.includes("CASH");
  const hasTransfer = m.includes("TRANSFER") || m.includes("TF") || m.includes("BCA") || m.includes("BRI");

  if (hasTransfer && hasCash) {
    return {
      text: "TF + Tunai",
      bg: "teal",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 3h5v5" /><path d="M21 3l-6 6" />
          <path d="M8 21H3v-5" /><path d="M3 21l6-6" />
        </svg>
      ),
    };
  }
  if (hasCash) return { text: "Tunai", bg: "emerald", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg> };
  if (hasTransfer) return { text: "Transfer", bg: "blue", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /></svg> };
  if (m.includes("QRIS") || m.includes("QR")) return { text: "QRIS", bg: "purple", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /></svg> };
  return { text: method || "-", bg: "gray", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /></svg> };
}

const paymentBgMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  teal: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  purple: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  gray: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

function getSourcePlatformBadge(platform: string): { text: string; color: string } {
  const p = (platform ?? "").toUpperCase();
  if (p.includes("SHOPEE")) return { text: " Shopee", color: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" };
  if (p.includes("TOKOPEDIA")) return { text: " Toped", color: "bg-green-50 text-green-700 ring-1 ring-green-200" };
  if (p.includes("COD") || p.includes("CASH ON DELIVERY")) return { text: " COD", color: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" };
  if (p.includes("ADS INSTAGRAM")) return { text: " Ads IG", color: "bg-pink-50 text-pink-700 ring-1 ring-pink-200" };
  if (p.includes("ADS FACEBOOK")) return { text: " Ads FB", color: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" };
  if (p === "INSTAGRAM") return { text: " Instagram", color: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200" };
  if (p === "TIKTOK") return { text: " TikTok", color: "bg-slate-50 text-slate-700 ring-1 ring-slate-200" };
  if (p.includes("FACEBOOK") || p.includes("FB")) return { text: " Facebook", color: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" };
  if (p.includes("WHATSAPP") || p.includes("WA")) return { text: " WhatsApp", color: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
  if (p.includes("GOOGLE")) return { text: " Google", color: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200" };
  if (p.includes("TEMAN")) return { text: " Teman", color: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" };
  if (p.includes("LAINNYA")) return { text: " Lainnya", color: "bg-gray-50 text-gray-600 ring-1 ring-gray-200" };
  return { text: platform || "-", color: "bg-gray-50 text-gray-700 ring-1 ring-gray-200" };
}

function getCompanyBadge(company: string): { label: string; color: string } {
  const cn = (company ?? "").toLowerCase();
  if (cn.includes("sotech")) return { label: "Sotech", color: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" };
  if (cn.includes("solit")) return { label: "Solit 03", color: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" };
  if (cn.includes("on point") || cn.includes("onpoint")) return { label: "On Point", color: "bg-purple-50 text-purple-700 ring-1 ring-purple-200" };
  if (cn.includes("zenit.id")) return { label: "Zenit.id", color: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" };
  if (cn.includes("zenit")) return { label: "Zenit", color: "bg-teal-50 text-teal-700 ring-1 ring-teal-200" };
  if (!company || company.trim() === "") return { label: "—", color: "bg-gray-50 text-gray-300" };
  return { label: company.trim(), color: "bg-gray-50 text-gray-600 ring-1 ring-gray-200" };
}

function getItemKindBadge(kind: string | undefined): { label: string; color: string } | null {
  if (kind === "accessory") return { label: " Aksesoris", color: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
  if (kind === "mixed") return { label: " Laptop+Aksesoris", color: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200" };
  return null;
}

function getCustomerTypeBadge(type: string): { text: string; icon: LucideIcon } {
  const t = (type ?? "UMUM").toUpperCase();
  if (t === "RESELLER") return { text: "Reseller", icon: Store };
  if (t === "CORPORATE") return { text: "Korporat", icon: Building2 };
  return { text: "Umum", icon: User };
}

function getPrimaryPriceDisplay(item: any) {
  const dealPrice = Number(item.deal_price || item.amount || 0);
  if (item.status === "RESERVED") {
    const paid = Number(item.dp_amount || 0);
    return {
      label: "Terbayar",
      value: paid,
      isDP: true,
      totalDeal: dealPrice,
      remaining: Math.max(0, dealPrice - paid),
    };
  }
  return { label: "Harga Jual", value: dealPrice, isDP: false, totalDeal: dealPrice, remaining: 0 };
}

// ─── RESTORE MODAL ────────────────────────────────────────────────────
function RestoreModal({ item, isPending, restoring, onConfirm, onClose }: {
  item: any; isPending: boolean; restoring: boolean; onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const statusLabelMap: Record<string, string> = { RESERVED: "DP", HELD: "Ambil Dulu", PACKING: "Packing", PENDING: "Pending", PAID: "Lunas" };
  const currentLabel = statusLabelMap[item.status] ?? item.status;
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col ring-1 ring-black/5">
        <div className={`px-5 py-4 flex-shrink-0 ${isPending ? "bg-red-600" : "bg-gray-900"}`}>
          <p className="font-semibold text-white text-sm">
            {isPending ? `Batalkan Pesanan (${currentLabel})` : "Restore Transaksi"}
          </p>
          <p className="text-xs text-white/60 mt-0.5 font-mono">{item.invoice_number}</p>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800">
            <p className="font-bold mb-1 leading-relaxed text-sm">
              {isPending ? `Batalkan pesanan untuk ${item.customer_name}?` : `Restore transaksi ${item.customer_name}?`}
            </p>
          </div>
          <div className="space-y-1.5 text-xs text-gray-600 bg-gray-50 rounded-xl p-3.5 border border-gray-200">
            <p className="font-semibold text-gray-700 mb-2">Yang akan terjadi:</p>
            <p>• Status → <span className="font-bold text-red-600">BATAL</span></p>
            <p>• Unit kembali ke stok <span className="font-bold text-emerald-700">SIAP JUAL</span></p>
            {item.status === "PAID" && <p>• Garansi (jika ada) → <span className="font-bold text-orange-600">VOID</span></p>}
            {item.status === "RESERVED" && <p className="text-amber-700 font-semibold"> DP yang sudah dibayar diurus manual</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Alasan {isPending ? "Batalkan" : "Restore"} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Contoh: customer batal, salah input transaksi, dll."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition resize-none placeholder:text-gray-300"
            />
          </div>
        </div>
        <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-gray-100 flex gap-3 bg-gray-50 flex-shrink-0">
          <button onClick={onClose} className="flex-1 h-11 sm:h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Batal</button>
          <button onClick={() => onConfirm(reason.trim())} disabled={restoring || !reason.trim()} className="flex-1 h-11 sm:h-10 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60">
            {restoring ? "Memproses..." : isPending ? "Ya, Batalkan" : "Ya, Restore"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIRM PAYMENT MODAL ────────────────────────────────────────────
function ConfirmPaymentModal({ item, confirmSN, setConfirmSN, confirmError, setConfirmError, confirming, payMode, setPayMode, cicilanAmount, setCicilanAmount, onConfirm, onClose }: {
  item: any; confirmSN: string; setConfirmSN: (v: string) => void; confirmError: string;
  setConfirmError: (v: string) => void; confirming: boolean;
  payMode: "LUNAS" | "CICILAN"; setPayMode: (v: "LUNAS" | "CICILAN") => void;
  cicilanAmount: string; setCicilanAmount: (v: string) => void;
  onConfirm: () => void; onClose: () => void;
}) {
  const fmt = (n: number) => "Rp" + (n || 0).toLocaleString("id-ID");
  const dealTotal = Number(item.deal_price || item.amount || 0);
  const paidSoFar = Number(item.dp_amount || 0);
  const remaining = Math.max(0, dealTotal - paidSoFar);
  const isReserved = item.status === "RESERVED";
  const showCicilanForm = isReserved && payMode === "CICILAN";
  const showSNForm = isReserved && payMode === "LUNAS";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5">
        <div className="bg-emerald-700 px-5 py-4">
          <p className="font-semibold text-white text-sm">Pembayaran</p>
          <p className="text-xs text-white/60 mt-0.5 font-mono">{item.invoice_number}</p>
        </div>
        <div className="p-5 space-y-4">
          {isReserved && (
            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase">Sudah Dibayar</p>
                <p className="text-sm font-bold text-blue-700">{fmt(paidSoFar)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase">Sisa Tagihan</p>
                <p className="text-sm font-bold text-red-600">{fmt(remaining)}</p>
              </div>
            </div>
          )}

          {isReserved && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPayMode("CICILAN")}
                className={`h-10 rounded-xl text-sm font-semibold border transition ${payMode === "CICILAN" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                Cicilan
              </button>
              <button type="button" onClick={() => setPayMode("LUNAS")}
                className={`h-10 rounded-xl text-sm font-semibold border transition ${payMode === "LUNAS" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                Lunas Sekarang
              </button>
            </div>
          )}

          {showCicilanForm && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nominal Cicilan</label>
              <input
                type="number" value={cicilanAmount}
                onChange={(e) => { setCicilanAmount(e.target.value); setConfirmError(""); }}
                placeholder={`Kurang dari ${fmt(remaining)}`}
                className="w-full h-11 sm:h-10 border border-gray-300 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                autoFocus
              />
              <p className="text-[11px] text-gray-400">Sisa setelah cicilan ini: {fmt(Math.max(0, remaining - (Number(cicilanAmount) || 0)))}</p>
            </div>
          )}

          {showSNForm && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Serial Number</label>
              <input
                type="text" value={confirmSN}
                onChange={(e) => { setConfirmSN(e.target.value); setConfirmError(""); }}
                placeholder="Masukkan SN..."
                className="w-full h-11 sm:h-10 border border-gray-300 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
          )}

          {confirmError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700 font-medium">{confirmError}</div>}
        </div>
        <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button onClick={() => { onClose(); setConfirmError(""); }} className="flex-1 h-11 sm:h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Batal</button>
          <button onClick={onConfirm} disabled={confirming} className={`flex-1 h-11 sm:h-10 text-white rounded-xl text-sm font-semibold transition disabled:opacity-60 ${showCicilanForm ? "bg-gray-900 hover:bg-gray-800" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            {confirming ? "Memproses..." : showCicilanForm ? "Simpan Cicilan" : "Konfirmasi Lunas"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT BREAKDOWN ────────────────────────────────────────────────
function PaymentBreakdown({ item, size = "sm" }: { item: any; size?: "sm" | "md" }) {
  const method2 = (item.payment_method_2 ?? "").trim();
  const amount1 = Number(item.amount_method_1 ?? 0);
  const amount2 = Number(item.amount_method_2 ?? 0);
  if (!method2 || amount1 <= 0 || amount2 <= 0) return null;

  const fmt = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
  const getMethodMeta = (m: string): { label: string; icon: LucideIcon; color: string } => {
    const upper = m.toUpperCase();
    if (upper.includes("TRANSFER") || upper.includes("TF") || upper.includes("BCA") || upper.includes("BRI")) return { label: "Transfer", icon: Landmark, color: "blue" };
    if (upper.includes("TUNAI") || upper.includes("CASH")) return { label: "Tunai", icon: Banknote, color: "emerald" };
    if (upper.includes("QRIS") || upper.includes("QR")) return { label: "QRIS", icon: QrCode, color: "purple" };
    return { label: m, icon: CreditCard, color: "gray" };
  };

  const colorMap: Record<string, { bg: string; border: string; text: string; label: string }> = {
    blue: { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-800", label: "text-blue-500" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-800", label: "text-emerald-500" },
    purple: { bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-800", label: "text-purple-500" },
    gray: { bg: "bg-gray-50", border: "border-gray-100", text: "text-gray-800", label: "text-gray-500" },
  };

  const m1meta = getMethodMeta(item.payment_method ?? "");
  const m2meta = getMethodMeta(method2);
  const entries = [{ meta: m1meta, amount: amount1 }, { meta: m2meta, amount: amount2 }];

  if (size === "md") {
    return (
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {entries.map(({ meta, amount }, i) => {
          const c = colorMap[meta.color] ?? colorMap.gray;
          const MIcon = meta.icon;
          return (
            <div key={i} className={`${c.bg} border ${c.border} rounded-lg px-2.5 py-1.5`}>
              <p className={`text-[9px] ${c.label} font-semibold uppercase tracking-wide mb-0.5 inline-flex items-center gap-0.5`}><MIcon className="w-2.5 h-2.5" /> {meta.label}</p>
              <p className={`text-xs font-bold ${c.text} font-mono tabular-nums`}>{fmt(amount)}</p>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
      {entries.map(({ meta, amount }, i) => {
        const c = colorMap[meta.color] ?? colorMap.gray;
        const MIcon = meta.icon;
        return (
          <span key={i} className={`inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border} whitespace-nowrap tabular-nums`}>
            <MIcon className="w-2.5 h-2.5" /> {fmt(amount)}
          </span>
        );
      })}
    </div>
  );
}

// ─── SKELETON ────────────────────────────────────────────────────────
function SkeletonPulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded ${className}`} />;
}

function MobileCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 space-y-1.5">
            <SkeletonPulse className="h-4 w-32" />
            <SkeletonPulse className="h-3 w-24" />
          </div>
          <SkeletonPulse className="h-6 w-16 rounded-lg flex-shrink-0" />
        </div>
        <SkeletonPulse className="h-3 w-28" />
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <SkeletonPulse className="h-3 w-20" />
          <SkeletonPulse className="h-5 w-20 rounded-lg" />
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5 space-y-1.5">
          <SkeletonPulse className="h-3 w-40" />
          <div className="flex gap-1.5">
            <SkeletonPulse className="h-4 w-16 rounded-md" />
            <SkeletonPulse className="h-4 w-12 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SkeletonPulse className="h-16 rounded-xl" />
          <SkeletonPulse className="h-16 rounded-xl" />
        </div>
      </div>
      <div className="px-4 py-3 border-t border-gray-50">
        <div className="grid grid-cols-3 gap-2">
          <SkeletonPulse className="h-12 rounded-xl" />
          <SkeletonPulse className="h-12 rounded-xl" />
          <SkeletonPulse className="h-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function TableRowSkeleton({ canSeeModal }: { canSeeModal: boolean }) {
  return (
    <tr className="border-b border-gray-50">
      <td className="px-4 py-3 text-center"><SkeletonPulse className="h-3 w-5 mx-auto" /></td>
      <td className="px-4 py-3"><SkeletonPulse className="h-5 w-14 rounded-lg" /></td>
      <td className="px-4 py-3"><div className="space-y-1"><SkeletonPulse className="h-3 w-28" /><SkeletonPulse className="h-3 w-20" /></div></td>
      <td className="px-4 py-3"><SkeletonPulse className="h-3 w-24" /></td>
      <td className="px-4 py-3"><SkeletonPulse className="h-3 w-20" /></td>
      <td className="px-4 py-3"><SkeletonPulse className="h-3 w-20" /></td>
      <td className="px-4 py-3"><div className="space-y-1"><SkeletonPulse className="h-3 w-32" /><SkeletonPulse className="h-3 w-16" /></div></td>
      <td className="px-4 py-3"><SkeletonPulse className="h-3 w-24" /></td>
      <td className="px-4 py-3"><SkeletonPulse className="h-3 w-16" /></td>
      <td className="px-4 py-3 text-right"><SkeletonPulse className="h-3 w-20 ml-auto" /></td>
      {canSeeModal && (
        <td className="px-4 py-3 text-right"><SkeletonPulse className="h-3 w-20 ml-auto" /></td>
      )}
      <td className="px-4 py-3 text-center"><SkeletonPulse className="h-6 w-20 rounded-lg mx-auto" /></td>
      <td className="px-4 py-3 text-center"><SkeletonPulse className="h-5 w-16 rounded-lg mx-auto" /></td>
      <td className="px-4 py-3 text-center"><SkeletonPulse className="h-5 w-16 rounded-lg mx-auto" /></td>
      <td className="px-4 py-3"><div className="flex items-center justify-center gap-1"><SkeletonPulse className="h-7 w-7 rounded-lg" /><SkeletonPulse className="h-7 w-7 rounded-lg" /><SkeletonPulse className="h-7 w-7 rounded-lg" /></div></td>
    </tr>
  );
}

function MobileSkeletonList() {
  return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <MobileCardSkeleton key={i} />)}</div>;
}

function DesktopSkeletonTable({ canSeeModal }: { canSeeModal: boolean }) {
  const headers = ["No", "Status", "Nota", "Customer", "Kontak", "Sales", "Laptop", "CPU", "SN", "Harga", ...(canSeeModal ? ["Margin"] : []), "Metode", "Sumber", "Toko", "Aksi"];
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: canSeeModal ? "1960px" : "1835px" }}>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {headers.map((h) => (
                <th key={h} className="px-4 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} canSeeModal={canSeeModal} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

function SerialNumberList({ serials, maxVisible = 3, align = "start", size = "sm", emptyDash = true }: {
  serials: string[]; maxVisible?: number; align?: "start" | "end"; size?: "sm" | "md"; emptyDash?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (serials.length === 0) return emptyDash ? <span className="text-[10px] text-gray-300">—</span> : null;

  const visible = expanded ? serials : serials.slice(0, maxVisible);
  const hidden = serials.length - maxVisible;
  const badge = size === "md"
    ? "text-[10px] text-gray-700 font-mono font-bold bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap"
    : "text-[9px] text-gray-700 font-mono font-bold tracking-wider bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap";

  return (
    <div className={`flex flex-row flex-wrap gap-1 ${align === "end" ? "justify-end" : ""}`}>
      {visible.map((sn, i) => <span key={i} className={badge}>{sn}</span>)}
      {!expanded && hidden > 0 && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(true); }}
          className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded hover:bg-blue-100 transition whitespace-nowrap">
          +{hidden} lagi
        </button>
      )}
      {expanded && serials.length > maxVisible && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(false); }}
          className="text-[9px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-200 transition whitespace-nowrap">
          Tutup
        </button>
      )}
    </div>
  );
}

// ─── TRANSACTION CARD (Mobile) ────────────────────────────────────────
function TransactionCard({ item, rowNumber, onPhotoClick, canEditTransaction, canRestoreTransaction, canSeeFinancials, canSeeModal, onRestored, onRowClick }: any) {
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmSN, setConfirmSN] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [payMode, setPayMode] = useState<"LUNAS" | "CICILAN">("LUNAS");
  const [cicilanAmount, setCicilanAmount] = useState("");

  const isPending = item.status === "RESERVED" || item.status === "HELD" || item.status === "PACKING" || item.status === "PENDING";
  const canRestore = canRestoreTransaction && (item.status === "PAID" || isPending);

  const handleConfirmPayment = async () => {
    const isCicilan = item.status === "RESERVED" && payMode === "CICILAN";

    if (isCicilan) {
      const amt = Number(cicilanAmount);
      if (!amt || amt <= 0) { setConfirmError("Nominal cicilan wajib diisi"); return; }
      setConfirming(true); setConfirmError("");
      try {
        const res = await fetch("/api/units/confirm-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_number: item.invoice_number, amount: amt, is_partial: true }) });
        const result = await res.json();
        if (!result.success) { setConfirmError(result.message || "Gagal"); return; }
        setShowConfirmModal(false); onRestored(item.invoice_number);
      } catch { setConfirmError("Terjadi kesalahan koneksi"); } finally { setConfirming(false); }
      return;
    }

    if (item.status === "RESERVED" && !confirmSN.trim()) { setConfirmError("Serial number wajib diisi"); return; }
    setConfirming(true); setConfirmError("");
    try {
      const res = await fetch("/api/units/confirm-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_number: item.invoice_number, serial_number: confirmSN.trim() || item.serial_number }) });
      const result = await res.json();
      if (!result.success) { setConfirmError(result.message || "Gagal"); return; }
      setShowConfirmModal(false); onRestored(item.invoice_number);
    } catch { setConfirmError("Terjadi kesalahan koneksi"); } finally { setConfirming(false); }
  };

  const handleRestore = async (reason: string) => {
    setRestoring(true);
    try {
      const res = await fetch(`/api/transaction/${item.invoice_number}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const result = await res.json();
      if (!result.success) { setAlertModal("Gagal: " + result.message); return; }
      setShowRestoreModal(false); onRestored(item.invoice_number);
    } catch { setAlertModal("Terjadi kesalahan saat restore"); } finally { setRestoring(false); }
  };

  const payStyle = getPaymentStyle(item.payment_method ?? "");
  const platformBadge = getSourcePlatformBadge(item.source_platform ?? "");
  const customerTypeBadge = getCustomerTypeBadge(item.customer_type ?? "");
  const CustomerTypeIcon = customerTypeBadge.icon;
  const timeStr = new Date(item.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const dot = statusDot[item.status] ?? "bg-gray-400";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3.5 pb-3 border-b border-gray-50">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {typeof rowNumber === "number" && (
              <span className="mt-0.5 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold tabular-nums flex-shrink-0">
                {rowNumber}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-900 leading-snug break-words">{item.customer_name}</h3>
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">{item.invoice_number}</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap flex-shrink-0 ${statusMap[item.status] ?? "bg-gray-100 text-gray-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400"> {formatDate(item.created_at)}</span>
          <span className="text-gray-200">·</span>
          <span className="text-[11px] text-gray-500 font-semibold"> {timeStr}</span>
          {item.customer_phone && (
            <><span className="text-gray-200">·</span><span className="text-[11px] text-gray-500"> {item.customer_phone}</span></>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Platform + Type badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.source_platform && (
            <span className={`px-2 py-0.5 rounded-lg font-semibold text-[10px] whitespace-nowrap ${platformBadge.color}`}>{platformBadge.text}</span>
          )}
          {(() => {
            const ik = getItemKindBadge(item.item_kind);
            return ik ? <span className={`px-2 py-0.5 rounded-lg font-semibold text-[10px] whitespace-nowrap ${ik.color}`}>{ik.label}</span> : null;
          })()}
          {item.customer_type && item.customer_type !== "UMUM" && (
            <span className="px-2 py-0.5 rounded-lg font-semibold text-[10px] bg-amber-100 text-amber-800 ring-1 ring-amber-200 whitespace-nowrap inline-flex items-center gap-1">
              <CustomerTypeIcon className="w-3 h-3" /> {customerTypeBadge.text}
            </span>
          )}
          {item.sales_name && (
            <span className="px-2 py-0.5 rounded-lg font-semibold text-[10px] bg-gray-100 text-gray-700 whitespace-nowrap"> {item.sales_name}</span>
          )}
        </div>

        {/* Laptop */}
        {(() => {
          const grouped: any[] = item.grouped_items ?? [];
          if (grouped.length > 1) {
            return (
              <div className="space-y-1.5">
                {grouped.map((g: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                    <div className="flex items-start gap-1.5 mb-1.5">
                      <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5">{g.unit_count}x</span>
                      <p className="text-xs font-bold text-gray-900 leading-snug min-w-0">{g.laptop_name}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {g.cpu && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white border border-gray-200 text-gray-600 font-semibold">{g.cpu}</span>}
                      {g.ram && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white border border-gray-200 text-gray-600 font-semibold">{g.ram}</span>}
                      {g.storage && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-semibold">{g.storage}</span>}
                    </div>
                    {g.serial_numbers?.length > 0 && <div className="mt-1.5"><SerialNumberList serials={g.serial_numbers} maxVisible={3} size="md" emptyDash={false} /></div>}
                    {(() => {
                      const unitCount = Number(g.unit_count ?? 1);
                      const groupTotal = Number(g.allocated_deal_price ?? 0);
                      const perUnit = unitCount > 0 ? Math.round(groupTotal / unitCount) : groupTotal;
                      return (
                        <div className="mt-2 border-t border-gray-100 pt-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-blue-500 font-semibold uppercase tracking-wide">Harga Satuan</span>
                            <span className="text-sm font-bold text-blue-900 font-mono tabular-nums">
                              Rp{perUnit.toLocaleString("id-ID")}
                              <span className="text-[9px] text-blue-400 font-sans font-semibold ml-0.5">/unit</span>
                            </span>
                          </div>
                          {unitCount > 1 && (
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[9px] text-gray-400">{unitCount} unit · subtotal</span>
                              <span className="text-[11px] font-semibold text-gray-500 font-mono tabular-nums">Rp{groupTotal.toLocaleString("id-ID")}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
              <p className="text-xs font-bold text-gray-900 leading-snug mb-1.5">{item.laptop_name || "—"}</p>
              {(item.cpu || item.ram || item.storage) && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {item.cpu && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white border border-gray-200 text-gray-600 font-semibold"> {item.cpu}</span>}
                  {item.ram && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white border border-gray-200 text-gray-600 font-semibold"> {item.ram}</span>}
                  {item.storage && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-semibold"> {item.storage}</span>}
                </div>
              )}
              {(() => {
                const sns: string[] = Array.isArray(item.serial_numbers) && item.serial_numbers.length > 0
                  ? item.serial_numbers : item.serial_number ? [item.serial_number] : [];
                if (sns.length === 0) return null;
                return <SerialNumberList serials={sns} maxVisible={4} size="md" emptyDash={false} />;
              })()}
            </div>
          );
        })()}

        {/* Accessories in Mobile Card */}
        {(() => {
          const accs: any[] = item.accessory_items ?? (Array.isArray(item.transaction_items) ? item.transaction_items.filter((it: any) => it.item_type === "accessory" || it.accessory_id) : []);
          if (accs.length === 0) return null;

          return (
            <div className="bg-emerald-50/60 rounded-xl p-2.5 border border-emerald-100 space-y-1.5">
              <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">Detail Aksesori ({accs.length})</p>
              <div className="space-y-1">
                {accs.map((a: any, idx: number) => {
                  const name = a.name || a.item_name || a.laptop_name || "Aksesori";
                  const qty = Number(a.quantity) || 1;
                  const deal = Number(a.deal_price || 0);
                  const isBonus = Boolean(a.is_bonus || deal === 0);

                  return (
                    <div key={idx} className="flex items-center justify-between text-xs text-gray-800">
                      <span className="truncate pr-2">• {name} <strong className="text-emerald-700">({qty}x)</strong></span>
                      <span className="font-mono font-bold text-[11px] flex-shrink-0">
                        {isBonus ? <span className="text-amber-700 font-bold">BONUS</span> : `Rp${deal.toLocaleString("id-ID")}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── REVISI: Price box selalu 1 kolom jika canSeeModal false, grid-cols-2 jika true ── */}
        <div className={`grid gap-2 ${canSeeModal ? "grid-cols-2" : "grid-cols-1"}`}>
          {(() => {
            const priceDisplay = getPrimaryPriceDisplay(item);
            return (
              <div className="rounded-xl p-2.5 bg-blue-50 ring-1 ring-blue-100">
                <p className="text-[10px] text-blue-500 font-semibold mb-0.5">{priceDisplay.label}</p>
                <p className="text-sm font-bold text-blue-900 tabular-nums truncate">Rp{priceDisplay.value.toLocaleString("id-ID")}</p>
                {priceDisplay.isDP && (
                  <>
                    <p className="text-[9px] text-blue-400 mt-0.5 truncate">dari Rp{priceDisplay.totalDeal.toLocaleString("id-ID")}</p>
                    <p className="text-[9px] text-red-500 font-semibold mt-0.5 truncate">Sisa Rp{priceDisplay.remaining.toLocaleString("id-ID")}</p>
                  </>
                )}
              </div>
            );
          })()}

          {/* ── REVISI: Box margin hanya muncul jika canSeeModal true ── */}
          {canSeeModal && (item.modal_missing ? (
            <div className="rounded-xl p-2.5 ring-1 bg-amber-50 ring-amber-100">
              <p className="text-[10px] font-semibold mb-0.5 text-amber-600"><AlertTriangle className="inline w-3 h-3 mr-1" />Modal</p>
              <p className="text-xs font-bold text-amber-700 leading-snug">Harga modal belum diinput</p>
            </div>
          ) : item.other !== undefined && item.other !== null ? (
            <div className={`rounded-xl p-2.5 ring-1 ${item.other > 0 ? "bg-emerald-50 ring-emerald-100" : item.other < 0 ? "bg-red-50 ring-red-100" : "bg-gray-50 ring-gray-100"}`}>
              <p className={`text-[10px] font-semibold mb-0.5 ${item.other > 0 ? "text-emerald-600" : item.other < 0 ? "text-red-500" : "text-gray-400"}`}>
                {item.other > 0 ? " Profit" : item.other < 0 ? " Loss" : " BEP"}
              </p>
              <p className={`text-sm font-bold tabular-nums truncate ${item.other > 0 ? "text-emerald-900" : item.other < 0 ? "text-red-900" : "text-gray-400"}`}>
                {item.other > 0 ? "+" : ""}Rp{(item.other ?? 0).toLocaleString("id-ID")}
              </p>
            </div>
          ) : null)}
        </div>

        {/* Payment method */}
        <div className={`rounded-xl px-3 py-2 inline-flex items-center gap-1.5 ${paymentBgMap[payStyle.bg] ?? "bg-gray-100 text-gray-700 ring-1 ring-gray-200"}`}>
          {payStyle.icon}
          <span className="text-xs font-bold">{payStyle.text}</span>
        </div>
        <PaymentBreakdown item={item} size="md" />
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-50 space-y-2">
        {showDetails && (
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-2 border border-gray-100">
            <div className="flex justify-between gap-2">
              <span className="text-gray-400">Invoice</span>
              <span className="font-mono font-bold text-gray-800 break-all text-right">{item.invoice_number}</span>
            </div>
            {(() => {
              const sns: string[] = Array.isArray(item.serial_numbers) && item.serial_numbers.length > 0
                ? item.serial_numbers : item.serial_number ? [item.serial_number] : [];
              if (sns.length === 0) return null;
              return (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400 shrink-0">SN</span>
                  <SerialNumberList serials={sns} maxVisible={4} size="md" align="end" emptyDash={false} />
                </div>
              );
            })()}
            <div className="flex justify-between gap-2">
              <span className="text-gray-400">Waktu</span>
              <span className="font-mono font-bold text-gray-800">{formatDateTime(item.created_at)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowDetails(!showDetails)} className="h-9 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition">
            {showDetails ? "Sembunyikan" : "Detail"}
          </button>
          <button onClick={() => onRowClick?.(item)} className="h-9 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition">
            Lihat Laptop
          </button>
        </div>

        <div className="flex gap-2">
          {item.payment_photo && (
            <button onClick={() => onPhotoClick(item.payment_photo)} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition text-[10px] font-semibold">
              <ImageIcon className="w-3.5 h-3.5" />Bukti
            </button>
          )}
          {canEditTransaction && (
            <a href={`/payment/${item.invoice_number}`} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition text-[10px] font-semibold">
              <Pencil className="w-3.5 h-3.5" />Edit
            </a>
          )}
          {isPending && canEditTransaction && (
            <button onClick={() => { setConfirmSN(item.serial_number || ""); setPayMode("LUNAS"); setCicilanAmount(""); setShowConfirmModal(true); }} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition text-[10px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />Bayar
            </button>
          )}
          {canRestore && (
            <button onClick={() => setShowRestoreModal(true)} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition text-[10px] font-semibold">
              <span>↩</span>{isPending ? "Batal" : "Restore"}
            </button>
          )}
          <a href={`/receipt/${item.invoice_number}`} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition text-[10px] font-semibold">
            <Receipt className="w-3.5 h-3.5" />Receipt
          </a>
        </div>
      </div>

      {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
      {showRestoreModal && <RestoreModal item={item} isPending={isPending} restoring={restoring} onConfirm={handleRestore} onClose={() => setShowRestoreModal(false)} />}
      {showConfirmModal && <ConfirmPaymentModal item={item} confirmSN={confirmSN} setConfirmSN={setConfirmSN} confirmError={confirmError} setConfirmError={setConfirmError} confirming={confirming} payMode={payMode} setPayMode={setPayMode} cicilanAmount={cicilanAmount} setCicilanAmount={setCicilanAmount} onConfirm={handleConfirmPayment} onClose={() => setShowConfirmModal(false)} />}
    </div>
  );
}

function getOriginalStatus(item: any): "RESERVED" | "HELD" | null {
  if (item.status !== "PAID") return null;
  if (item.notes?.includes("[ORIG:RESERVED]")) return "RESERVED";
  if (item.notes?.includes("[ORIG:HELD]")) return "HELD";
  if (item.dp_amount && Number(item.dp_amount) > 0) return "RESERVED";
  if (item.paid_at && item.created_at && !item.is_ecommerce) {
    const diffMs = new Date(item.paid_at).getTime() - new Date(item.created_at).getTime();
    if (diffMs / (1000 * 60) > 5) return "HELD";
  }
  return null;
}

function StatusBadge({ item }: { item: any }) {
  const originalStatus = getOriginalStatus(item);
  const dot = statusDot[item.status] ?? "bg-gray-400";

  if (originalStatus) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg font-bold text-[10px] whitespace-nowrap ${originalStatus === "RESERVED" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
          {originalStatus === "RESERVED" ? "DP" : "Ambil Dulu"}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-[10px] whitespace-nowrap bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          Lunas
        </span>
      </div>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[10px] whitespace-nowrap ${statusMap[item.status] ?? "bg-gray-100 text-gray-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {STATUS_LABEL[item.status] ?? item.status}
    </span>
  );
}

// ─── SORT ICON + SORTABLE HEADER ─────────────────────────────────────
function SortIcon({ state }: { state: "none" | "asc" | "desc" }) {
  if (state === "none") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
        className="text-gray-300 opacity-0 group-hover/sort:opacity-100 transition-opacity flex-shrink-0">
        <polyline points="8 9 12 5 16 9" /><polyline points="16 15 12 19 8 15" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
      className="text-gray-900 flex-shrink-0">
      {state === "asc" ? <polyline points="8 14 12 10 16 14" /> : <polyline points="8 10 12 14 16 10" />}
    </svg>
  );
}

function SortableTh({ label, sortKey, sortBy, sortDir, onSort, className = "", align = "left" }: {
  label: string; sortKey: SortKey; sortBy: SortKey; sortDir: SortDir;
  onSort: (key: SortKey) => void; className?: string; align?: "left" | "right" | "center";
}) {
  const active = sortBy === sortKey;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th className={className} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={
          active
            ? sortDir === SORT_DEFAULT_DIR[sortKey]
              ? `${label} — klik lagi untuk balik arah`
              : `${label} — klik lagi untuk reset ke urutan awal`
            : `Urutkan berdasarkan ${label}`
        }
        className={`group/sort w-full inline-flex items-center gap-1 ${justify} text-[10px] font-bold uppercase tracking-widest transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 ${active ? "text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
      >
        <span className="whitespace-nowrap">{label}</span>
        <SortIcon state={active ? sortDir : "none"} />
      </button>
    </th>
  );
}

// ─── TRANSACTION TABLE (Desktop) ─────────────────────────────────────
function TransactionTable({ paginatedTransactions, startIndex = 0, sortBy, sortDir, onSort, canEditTransaction, canRestoreTransaction, canSeeFinancials, canSeeModal, onPhotoClick, onRestored, onRowClick }: any) {
  const HEAD = "px-4 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto" style={{ maxHeight: "calc(100dvh - 200px)", overflowY: "auto" }}>
        <table className="w-full border-collapse" style={{ minWidth: canSeeModal ? "1960px" : "1835px" }}>
          <thead>
            <tr>
              <th className={`${HEAD} text-center w-[60px]`}>No</th>
              <th className={`${HEAD} w-[100px]`}>Status</th>
              <SortableTh label="Nota & Waktu" sortKey="invoice" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className={`${HEAD} w-[155px]`} />
              <SortableTh label="Customer" sortKey="customer" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className={`${HEAD} w-[145px]`} />
              <th className={`${HEAD} w-[125px]`}>Kontak</th>
              <SortableTh label="Sales" sortKey="sales" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className={`${HEAD} w-[125px]`} />
              <SortableTh label="Laptop" sortKey="laptop" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className={`${HEAD} w-[195px]`} />
              <SortableTh label="CPU" sortKey="cpu" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className={`${HEAD} w-[155px]`} />
              <SortableTh label="SN" sortKey="sn" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className={`${HEAD} w-[165px]`} />
              <SortableTh label="Harga Jual" sortKey="price" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" className={`${HEAD} text-right w-[135px]`} />
              {/* ── REVISI: Kolom Margin hanya render jika canSeeModal true ── */}
              {canSeeModal && (
                <SortableTh label="Margin" sortKey="margin" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" className={`${HEAD} text-right w-[125px]`} />
              )}
              <SortableTh label="Metode" sortKey="method" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="center" className={`${HEAD} text-center w-[145px]`} />
              <SortableTh label="Sumber" sortKey="source" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="center" className={`${HEAD} text-center w-[115px]`} />
              <SortableTh label="Toko" sortKey="company" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="center" className={`${HEAD} text-center w-[115px]`} />
              <th className={`${HEAD} text-center w-[130px]`}>Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginatedTransactions.map((item: any, idx: number) => (
              <TransactionTableRow
                key={item.id}
                item={item}
                rowNumber={startIndex + idx + 1}
                onPhotoClick={onPhotoClick}
                canEditTransaction={canEditTransaction}
                canRestoreTransaction={canRestoreTransaction}
                canSeeFinancials={canSeeFinancials}
                canSeeModal={canSeeModal}
                onRestored={onRestored}
                onRowClick={onRowClick}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-center text-[11px] text-gray-300 py-2 border-t border-gray-50 bg-gray-50/50 font-medium tracking-wide">
        ← Geser kanan-kiri untuk kolom lebih →
      </div>
    </div>
  );
}

// ─── TRANSACTION TABLE ROW (Desktop) ─────────────────────────────────
function TransactionTableRow({ item, rowNumber, onPhotoClick, canEditTransaction, canRestoreTransaction, canSeeFinancials, canSeeModal, onRestored, onRowClick }: any) {
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmSN, setConfirmSN] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [payMode, setPayMode] = useState<"LUNAS" | "CICILAN">("LUNAS");
  const [cicilanAmount, setCicilanAmount] = useState("");

  const isPending = item.status === "RESERVED" || item.status === "HELD" || item.status === "PACKING" || item.status === "PENDING";
  const canRestore = canRestoreTransaction && (item.status === "PAID" || isPending);

  const handleConfirmPayment = async () => {
    const isCicilan = item.status === "RESERVED" && payMode === "CICILAN";

    if (isCicilan) {
      const amt = Number(cicilanAmount);
      if (!amt || amt <= 0) { setConfirmError("Nominal cicilan wajib diisi"); return; }
      setConfirming(true); setConfirmError("");
      try {
        const res = await fetch("/api/units/confirm-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_number: item.invoice_number, amount: amt, is_partial: true }) });
        const result = await res.json();
        if (!result.success) { setConfirmError(result.message || "Gagal"); return; }
        setShowConfirmModal(false); onRestored(item.invoice_number);
      } catch { setConfirmError("Terjadi kesalahan koneksi"); } finally { setConfirming(false); }
      return;
    }

    if (item.status === "RESERVED" && !confirmSN.trim()) { setConfirmError("Serial number wajib diisi"); return; }
    setConfirming(true); setConfirmError("");
    try {
      const res = await fetch("/api/units/confirm-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_number: item.invoice_number, serial_number: confirmSN.trim() || item.serial_number }) });
      const result = await res.json();
      if (!result.success) { setConfirmError(result.message || "Gagal"); return; }
      setShowConfirmModal(false); onRestored(item.invoice_number);
    } catch { setConfirmError("Terjadi kesalahan koneksi"); } finally { setConfirming(false); }
  };

  const handleRestore = async (reason: string) => {
    setRestoring(true);
    try {
      const res = await fetch(`/api/transaction/${item.invoice_number}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const result = await res.json();
      if (!result.success) { setAlertModal("Gagal: " + result.message); return; }
      setShowRestoreModal(false); onRestored(item.invoice_number);
    } catch { setAlertModal("Terjadi kesalahan saat restore"); } finally { setRestoring(false); }
  };

  const payStyle = getPaymentStyle(item.payment_method ?? "");
  const platformBadge = getSourcePlatformBadge(item.source_platform ?? "");
  const datePart = formatDate(item.created_at);
  const timePart = new Date(item.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

 const renderLaptopCell = () => {
    const grouped: any[] = item.grouped_items ?? [];
    const accs: any[] = item.accessory_items ?? [];

    // ── REVISI: List nama aksesoris, ditampilkan di bawah nama laptop (kalau ada) ──
    const accessoryList = accs.length > 0 ? (
      <div className={`space-y-0.5 ${(grouped.length > 0 || item.laptop_name) ? "mt-1.5 pt-1.5 border-t border-gray-100" : ""}`}>
        {accs.map((a: any, idx: number) => (
          <div key={idx} className="text-[10px] font-semibold text-emerald-700 leading-snug truncate">
            {a.name} <span className="text-gray-400 font-normal">({a.quantity}x)</span>
          </div>
        ))}
      </div>
    ) : null;

    if (grouped.length > 1) {
      return (
        <div className="space-y-2">
          {grouped.map((g: any, idx: number) => (
            <div key={idx} className="flex items-start gap-1.5">
              <span className="text-[8px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5">{g.unit_count}x</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-900 leading-snug">{g.laptop_name}</div>
                <div className="flex gap-0.5 flex-wrap mt-0.5">
                  {g.ram && <span className="text-[7px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold">{g.ram}</span>}
                  {g.storage && <span className="text-[7px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold border border-blue-100">{g.storage}</span>}
                </div>
              </div>
            </div>
          ))}
          {accessoryList}
        </div>
      );
    }

    // ── REVISI: Transaksi aksesoris-only (tidak ada laptop_name) → tampilkan nama aksesoris, bukan "—" ──
    if (!item.laptop_name && accs.length > 0) {
      return (
        <div className="space-y-0.5">
          {accs.map((a: any, idx: number) => (
            <div key={idx} className="text-xs font-bold text-emerald-700 leading-snug truncate">
              {a.name} <span className="text-[10px] text-gray-400 font-normal">({a.quantity}x)</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div>
        <div className="text-xs font-bold text-gray-900 leading-snug mb-1">{item.laptop_name || "—"}</div>
        {(item.ram || item.storage) && (
          <div className="flex items-center gap-1 flex-wrap">
            {item.ram && <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold whitespace-nowrap">{item.ram}</span>}
            {item.storage && <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold whitespace-nowrap border border-blue-100">{item.storage}</span>}
          </div>
        )}
        {accessoryList}
      </div>
    );
  };

  const renderCpuCell = () => {
    const grouped: any[] = item.grouped_items ?? [];
    if (grouped.length > 1) {
      const hasCpu = grouped.some((g: any) => g.cpu);
      if (!hasCpu) return <span className="text-[10px] text-gray-300">—</span>;
      return (
        <div className="space-y-1.5">
          {grouped.map((g: any, idx: number) => (
            g.cpu
              ? <div key={idx} className="text-[9px] font-semibold text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 leading-snug">{g.cpu}</div>
              : <span key={idx} className="text-[10px] text-gray-300">—</span>
          ))}
        </div>
      );
    }
    if (!item.cpu) return <span className="text-[10px] text-gray-300">—</span>;
    return <div className="text-[9px] font-semibold text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 leading-snug">{item.cpu}</div>;
  };

  return (
    <>
      <tr className="hover:bg-blue-50/30 transition-colors duration-100 cursor-pointer align-top group" onClick={() => onRowClick?.(item)}>
        <td className="px-4 py-3.5 text-center">
          <span className="text-[11px] font-bold text-gray-400 tabular-nums">{rowNumber}</span>
        </td>
        <td className="px-4 py-3.5"><StatusBadge item={item} /></td>
        <td className="px-4 py-3.5">
          <div className="text-xs font-bold text-gray-800 font-mono leading-tight mb-1">{item.invoice_number}</div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">{datePart}</span>
            <span className="text-gray-200">·</span>
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">{timePart}</span>
          </div>
        </td>
        <td className="px-4 py-3.5">
          <div className="text-xs font-bold text-gray-900 leading-snug mb-1">{item.customer_name}</div>
          {item.customer_type && item.customer_type !== "UMUM" && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 whitespace-nowrap">
              {(() => { const ct = getCustomerTypeBadge(item.customer_type); const CtIcon = ct.icon; return <><CtIcon className="w-2.5 h-2.5" /> {ct.text}</>; })()}
            </span>
          )}
        </td>
        <td className="px-4 py-3.5">
          {item.customer_phone ? <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap"> {item.customer_phone}</span> : <span className="text-[10px] text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3.5">
          {item.sales_name ? (
            <div>
              <div className="text-[11px] font-bold text-gray-800 leading-snug mb-0.5">{item.sales_name}</div>
              {item.employee_role && <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] bg-blue-100 text-blue-700 font-bold whitespace-nowrap">{item.employee_role}</span>}
            </div>
          ) : <span className="text-[10px] text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3.5">{renderLaptopCell()}</td>
        <td className="px-4 py-3.5">{renderCpuCell()}</td>
        <td className="px-4 py-3.5">
          {(() => {
            const grouped: any[] = item.grouped_items ?? [];
            if (grouped.length > 1) {
              return (
                <div className="space-y-1.5">
                  {grouped.map((g: any, idx: number) => (
                    <div key={idx}>
                      {g.serial_numbers?.length > 0 ? <SerialNumberList serials={g.serial_numbers} maxVisible={2} size="sm" /> : <span className="text-[9px] text-gray-300">—</span>}
                    </div>
                  ))}
                </div>
              );
            }
            const sns: string[] = Array.isArray(item.serial_numbers) && item.serial_numbers.length > 0 ? item.serial_numbers : item.serial_number ? [item.serial_number] : [];
            return <SerialNumberList serials={sns} maxVisible={3} size="sm" />;
          })()}
        </td>
        <td className="px-4 py-3.5 text-right">
          {(() => {
            const priceDisplay = getPrimaryPriceDisplay(item);
            const grouped: any[] = item.grouped_items ?? [];
            const isMulti = grouped.length > 1;

            if (!isMulti) {
              return (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-sm font-bold text-gray-900 font-mono tabular-nums whitespace-nowrap">
                    Rp{priceDisplay.value.toLocaleString("id-ID")}
                  </span>
                  {priceDisplay.isDP && (
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                      DP dari Rp{priceDisplay.totalDeal.toLocaleString("id-ID")}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <div className="flex flex-col items-stretch gap-1.5">
                {grouped.map((g: any, idx: number) => {
                  const unitCount = Number(g.unit_count ?? 1);
                  const groupTotal = Number(g.allocated_deal_price ?? 0);
                  const perUnit = unitCount > 0 ? Math.round(groupTotal / unitCount) : groupTotal;
                  return (
                    <div key={idx} className="rounded-lg border border-gray-100 bg-gray-50/60 px-2 py-1.5 text-right">
                      <p className="text-[9px] font-semibold text-gray-500 leading-tight truncate text-left mb-0.5" title={g.laptop_name}>
                        {g.laptop_name || "—"}
                      </p>
                      <p className="text-xs font-bold text-gray-900 font-mono tabular-nums whitespace-nowrap">
                        Rp{perUnit.toLocaleString("id-ID")}
                        <span className="text-[8px] text-gray-400 font-sans font-semibold ml-0.5">/unit</span>
                      </p>
                      {unitCount > 1 && (
                        <p className="text-[9px] text-gray-400 mt-0.5 whitespace-nowrap">
                          {unitCount} unit · <span className="font-mono">Rp{groupTotal.toLocaleString("id-ID")}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between gap-1 border-t-2 border-gray-200 pt-1.5 mt-0.5">
                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Total</span>
                  <span className="text-sm font-bold text-gray-900 font-mono tabular-nums whitespace-nowrap">
                    Rp{priceDisplay.totalDeal.toLocaleString("id-ID")}
                  </span>
                </div>
                {priceDisplay.isDP && (
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[8px] font-semibold text-blue-500">DP terbayar</span>
                    <span className="text-[10px] font-bold text-blue-700 font-mono tabular-nums whitespace-nowrap">
                      Rp{priceDisplay.value.toLocaleString("id-ID")}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </td>

        {/* ── REVISI: Cell Margin hanya render jika canSeeModal true ── */}
        {canSeeModal && (
          <td className="px-4 py-3.5 text-right">
            {item.modal_missing ? (
              <span className="inline-flex text-[9px] font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200 whitespace-nowrap">
                <AlertTriangle className="inline w-3.5 h-3.5 mr-1" /> Harga modal belum diinput
              </span>
            ) : item.other !== undefined && item.other !== null ? (
              <span className={`text-sm font-bold font-mono tabular-nums whitespace-nowrap ${item.other > 0 ? "text-emerald-600" : item.other < 0 ? "text-red-500" : "text-gray-300"}`}>
                {item.other > 0 ? "+" : ""}Rp{(item.other ?? 0).toLocaleString("id-ID")}
              </span>
            ) : <span className="text-[10px] text-gray-300">—</span>}
          </td>
        )}

        <td className="px-4 py-3.5 text-center">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold whitespace-nowrap ${paymentBgMap[payStyle.bg] ?? "bg-gray-100 text-gray-600"}`}>
              {payStyle.icon}<span>{payStyle.text}</span>
            </span>
            <PaymentBreakdown item={item} size="sm" />
          </div>
        </td>
        <td className="px-4 py-3.5 text-center">
          <div className="flex flex-col items-center gap-1">
            {item.source_platform ? (
              <span className={`inline-flex text-[9px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${platformBadge.color}`}>{platformBadge.text}</span>
            ) : <span className="text-[10px] text-gray-300">—</span>}
            {(() => {
              const ik = getItemKindBadge(item.item_kind);
              return ik ? <span className={`inline-flex text-[9px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${ik.color}`}>{ik.label}</span> : null;
            })()}
          </div>
        </td>
        <td className="px-4 py-3.5 text-center">
          {(() => {
            const badge = getCompanyBadge(item.company_name ?? "");
            return <span className={`inline-flex text-[9px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${badge.color}`}>{badge.label}</span>;
          })()}
        </td>
        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-0.5">
            {item.payment_photo && (
              <button onClick={() => onPhotoClick(item.payment_photo)} className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition group-hover:text-gray-400" title="Bukti">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              </button>
            )}
            {canEditTransaction && (
              <a href={`/payment/${item.invoice_number}`} className="p-1.5 text-gray-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition group-hover:text-gray-400" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </a>
            )}
            {isPending && canEditTransaction && (
              <button onClick={() => { setConfirmSN(item.serial_number || ""); setPayMode("LUNAS"); setCicilanAmount(""); setShowConfirmModal(true); }} className="p-1.5 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition group-hover:text-gray-400" title="Bayar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
            )}
            {canRestore && (
              <button onClick={() => setShowRestoreModal(true)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition group-hover:text-gray-400" title={isPending ? "Batalkan" : "Restore"}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </button>
            )}
            <a href={`/receipt/${item.invoice_number}`} className="p-1.5 text-gray-300 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition group-hover:text-gray-400" title="Receipt">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </a>
          </div>
        </td>
      </tr>

      {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
      {showRestoreModal && <RestoreModal item={item} isPending={isPending} restoring={restoring} onConfirm={handleRestore} onClose={() => setShowRestoreModal(false)} />}
      {showConfirmModal && <ConfirmPaymentModal item={item} confirmSN={confirmSN} setConfirmSN={setConfirmSN} confirmError={confirmError} setConfirmError={setConfirmError} confirming={confirming} payMode={payMode} setPayMode={setPayMode} cicilanAmount={cicilanAmount} setCicilanAmount={setCicilanAmount} onConfirm={handleConfirmPayment} onClose={() => setShowConfirmModal(false)} />}
    </>
  );
}

// ─── ROLES yang boleh lihat Margin ───────────────────────────────────
// Hanya ADMIN dan KEPALA_PENGELOLA_BARANG yang bisa lihat kolom/box Margin.
// Role lain: kolom hilang total di desktop, box hilang total di mobile.
const MODAL_VISIBLE_ROLES = [
  "ADMIN",
  "KEPALA_PENGELOLA_BARANG",
];

function TransactionDetailModal({ item, onClose, canSeeFinancials, canSeeModal, canViewActivityLog }: { item: any; onClose: () => void; canSeeFinancials: boolean; canSeeModal: boolean; canViewActivityLog: boolean }) {
  const [fullItem, setFullItem] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    if (item?.invoice_number) {
      fetch(`/api/transaction/${item.invoice_number}`)
        .then((res) => res.json())
        .then((res) => {
          if (active && res.success && res.data) {
            setFullItem(res.data);
          }
        })
        .catch(() => { });
    }
    return () => { active = false; };
  }, [item?.invoice_number]);

  const activeItem = fullItem || item;
  const payStyle = getPaymentStyle(activeItem.payment_method ?? "");
  const platformBadge = getSourcePlatformBadge(activeItem.source_platform ?? "");
  const grouped: any[] = activeItem.grouped_items ?? [];
  const isMulti = grouped.length > 1;
  const totalDeal = Number(activeItem.deal_price ?? activeItem.amount ?? 0);
  const totalMargin = Number(activeItem.other ?? 0);
  const totalModal = grouped.reduce((s, g) => s + Number(g.purchase_price_total ?? 0), 0);
  const totalJual = grouped.reduce((s, g) => s + Number(g.selling_price_total ?? 0), 0);

  useEffect(() => {
    if (!showHistory || !activeItem?.id) return;
    let active = true;
    setLoadingLogs(true);
    fetch(`/api/activity-logs?entity=transaction&entity_id=${activeItem.id}&limit=50`)
      .then((res) => res.json())
      .then((res) => { if (active) setActivityLogs(res.logs ?? []); })
      .catch(() => { if (active) setActivityLogs([]); })
      .finally(() => { if (active) setLoadingLogs(false); });
    return () => { active = false; };
  }, [showHistory, activeItem?.id]);

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden ring-1 ring-black/5">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 ${statusMap[activeItem.status] ?? "bg-gray-100 text-gray-600"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot[activeItem.status] ?? "bg-gray-400"}`} />
                {STATUS_LABEL[activeItem.status] ?? activeItem.status}
              </span>
              {isMulti && <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700">{grouped.length} Barang</span>}
            </div>
            <h2 className="font-bold text-gray-900 text-base leading-snug">{activeItem.customer_name}</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{activeItem.invoice_number}</p>
            <p className="text-xs text-gray-400 mt-0.5"> {formatDateShort(activeItem.created_at)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* ── Info edit/restore terakhir + tombol riwayat ── */}
        {(activeItem.last_edited_by || activeItem.restored_by || canViewActivityLog) && (
          <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-gray-50/60 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {activeItem.last_edited_by && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                  <Pencil className="w-2.5 h-2.5" />
                  Diedit oleh {activeItem.last_edited_by}
                  {activeItem.last_edited_at && ` · ${formatDateShort(activeItem.last_edited_at)}`}
                  {activeItem.edit_reason && ` — "${activeItem.edit_reason}"`}
                </span>
              )}
              {activeItem.restored_by && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-700 ring-1 ring-red-200">
                  ↩ Direstore oleh {activeItem.restored_by}
                  {activeItem.restored_at && ` · ${formatDateShort(activeItem.restored_at)}`}
                  {activeItem.restore_reason && ` — "${activeItem.restore_reason}"`}
                </span>
              )}
              {canViewActivityLog && (
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
                >
                  {showHistory ? "Sembunyikan Riwayat" : "Lihat Riwayat"}
                </button>
              )}
            </div>

            {showHistory && (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1">
                {loadingLogs ? (
                  <p className="text-[11px] text-gray-400">Memuat riwayat...</p>
                ) : activityLogs.length === 0 ? (
                  <p className="text-[11px] text-gray-400">Belum ada riwayat perubahan.</p>
                ) : (
                  activityLogs.map((log: any) => (
                    <div key={log.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-700">
                          {log.action === "EDIT" ? "Edit" : log.action === "RESTORE" ? "Restore" : log.action} — {log.user_name}
                        </span>
                        <span className="text-gray-400 flex-shrink-0">{formatDateShort(log.created_at)}</span>
                      </div>
                      {log.reason && <p className="text-gray-500 mt-0.5">"{log.reason}"</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">Customer</p>
              <p className="text-sm font-bold text-gray-800">{activeItem.customer_name}</p>
              {activeItem.customer_phone && <p className="text-xs text-gray-500 mt-0.5"> {activeItem.customer_phone}</p>}
              {activeItem.customer_type && activeItem.customer_type !== "UMUM" && (
                <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                  {(() => { const ct = getCustomerTypeBadge(activeItem.customer_type); const CtIcon = ct.icon; return <><CtIcon className="w-3 h-3" /> {ct.text}</>; })()}
                </span>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">Sales</p>
              {activeItem.sales_name ? (
                <>
                  <p className="text-sm font-bold text-gray-800">{activeItem.sales_name}</p>
                  {activeItem.employee_role && <span className="inline-flex items-center mt-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">{activeItem.employee_role}</span>}
                </>
              ) : <p className="text-sm text-gray-300">—</p>}
            </div>
          </div>

          {/* Goods details */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5"> {isMulti ? `Barang (${grouped.length} item)` : "Detail Barang"}</p>
            <div className="space-y-2">
              {grouped.length > 0 ? grouped.map((g: any, idx: number) => (
                <div key={idx} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-3.5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 leading-snug">{g.laptop_name}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {g.cpu && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-700 font-semibold">{g.cpu}</span>}
                        {g.ram && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-700 font-semibold">{g.ram}</span>}
                        {g.storage && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-100 text-blue-700 font-semibold">{g.storage}</span>}
                        {g.vga && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-purple-50 border border-purple-100 text-purple-700 font-semibold">{g.vga}</span>}
                      </div>
                    </div>
                    {isMulti && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex-shrink-0">{g.unit_count}x</span>}
                  </div>
                  {g.serial_numbers?.length > 0 && (
                    <div className="px-3.5 py-2.5 border-b border-gray-100">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">Serial Number</p>
                      <div className="flex flex-wrap gap-1">
                        {g.serial_numbers.map((sn: string, i: number) => (
                          <span key={i} className="font-mono text-[10px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">{sn}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* ── REVISI: Baris Modal & Margin di detail modal hanya muncul jika canSeeModal ── */}
                  {canSeeFinancials && canSeeModal && (
                    <div className="px-3.5 py-2.5 grid grid-cols-4 gap-2">
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Modal</p>
                        {g.modal_missing ? (
                          <p className="text-[10px] font-bold text-amber-600"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />Harga modal belum diinput</p>
                        ) : (
                          <p className="text-xs font-bold text-gray-700 font-mono tabular-nums">Rp{(g.purchase_price_total ?? 0).toLocaleString("id-ID")}</p>
                        )}
                      </div>
                      <div><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Jual</p><p className="text-xs font-bold text-violet-700 font-mono tabular-nums">Rp{(g.selling_price_total ?? 0).toLocaleString("id-ID")}</p></div>
                      <div><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Deal</p><p className="text-xs font-bold text-blue-700 font-mono tabular-nums">Rp{(g.allocated_deal_price ?? 0).toLocaleString("id-ID")}</p></div>
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Margin</p>
                        {g.modal_missing ? (
                          <p className="text-[10px] font-bold text-amber-600">—</p>
                        ) : (
                          <p className={`text-xs font-bold font-mono tabular-nums ${(g.margin ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{(g.margin ?? 0) >= 0 ? "+" : ""}Rp{Math.abs(g.margin ?? 0).toLocaleString("id-ID")}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )) : (
                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <p className="text-sm font-bold text-gray-800">{activeItem.laptop_name || "—"}</p>
                  {activeItem.serial_number && <span className="font-mono text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded-md mt-1.5 inline-block">{activeItem.serial_number}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Aksesori details */}
          {(() => {
            const accs: any[] = activeItem.accessory_items ?? (
              Array.isArray(activeItem.transaction_items)
                ? activeItem.transaction_items.filter((it: any) => it.item_type === "accessory" || Boolean(it.accessory_id) || (!it.unit_id && !it.laptop_id))
                : []
            );

            const isMixedOrAcc = activeItem.item_kind === "mixed" || activeItem.item_kind === "accessory" || (typeof activeItem.laptop_name === "string" && activeItem.laptop_name.toLowerCase().includes("aksesori"));

            if (accs.length === 0 && !isMixedOrAcc) return null;

            return (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Detail Aksesori {accs.length > 0 ? `(${accs.length} item)` : ""}</p>
                {accs.length > 0 ? (
                  <div className="space-y-2">
                    {accs.map((a: any, idx: number) => {
                      const name = a.name || a.item_name || a.laptop_name || "Aksesori";
                      const qty = Number(a.quantity) || 1;
                      const deal = Number(a.deal_price ?? 0);
                      const modalPrice = Number(a.selling_price ?? 0);
                      const isBonus = Boolean(a.is_bonus || deal === 0);

                      return (
                        <div key={idx} className="bg-white border border-emerald-100 rounded-xl p-3 shadow-sm flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 flex-shrink-0">
                              {qty}x
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-800 truncate">{name}</p>
                              {isBonus ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 inline-block mt-0.5">
                                  BONUS
                                </span>
                              ) : (
                                <p className="text-[10px] text-gray-400 font-mono">
                                  Rp{Math.round(deal / qty).toLocaleString("id-ID")}/unit
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {isBonus ? (
                              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">Bonus (Rp0)</span>
                            ) : (
                              <span className="text-xs font-bold text-gray-900 font-mono tabular-nums">Rp{deal.toLocaleString("id-ID")}</span>
                            )}
                            {canSeeFinancials && canSeeModal && modalPrice > 0 && (
                              <p className="text-[9px] text-gray-400 font-mono mt-0.5">Modal: Rp{(modalPrice * qty).toLocaleString("id-ID")}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-3 text-xs font-medium text-emerald-900">
                    Aksesori disertakan dalam paket transaksi ini.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Payment */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5"> Pembayaran</p>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2.5">
              {/* ── REVISI: Baris Total Modal hanya muncul jika canSeeModal ── */}
              {canSeeFinancials && canSeeModal && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total Harga Modal</span>
                  {activeItem.modal_missing ? (
                    <span className="text-xs font-bold text-amber-600"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />Harga modal belum diinput</span>
                  ) : (
                    <span className="text-sm font-bold text-gray-700 font-mono tabular-nums">Rp{totalModal.toLocaleString("id-ID")}</span>
                  )}
                </div>
              )}
              {canSeeFinancials && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total Harga Jual</span>
                  <span className="text-sm font-bold text-violet-700 font-mono tabular-nums">Rp{totalJual.toLocaleString("id-ID")}</span>
                </div>
              )}
              {activeItem.status === "RESERVED" && Number(activeItem.dp_amount) > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">DP Diterima</span>
                    <span className="text-sm font-bold text-blue-700 font-mono tabular-nums">Rp{Number(activeItem.dp_amount).toLocaleString("id-ID")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Total Harga Deal</span>
                    <span className="text-sm font-bold text-gray-900 font-mono tabular-nums">Rp{totalDeal.toLocaleString("id-ID")}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total Harga Deal</span>
                  <span className="text-sm font-bold text-gray-900 font-mono tabular-nums">Rp{totalDeal.toLocaleString("id-ID")}</span>
                </div>
              )}
              {/* ── REVISI: Baris Total Margin hanya muncul jika canSeeModal ── */}
              {canSeeFinancials && canSeeModal && activeItem.modal_missing && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="text-xs font-semibold text-gray-700">Total Margin</span>
                  <span className="text-xs font-bold text-amber-600"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />Harga modal belum diinput</span>
                </div>
              )}
              {canSeeFinancials && canSeeModal && !activeItem.modal_missing && totalMargin !== 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="text-xs font-semibold text-gray-700">Total Margin</span>
                  <span className={`text-sm font-bold font-mono tabular-nums ${totalMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {totalMargin >= 0 ? "+" : ""}Rp{Math.abs(totalMargin).toLocaleString("id-ID")}
                  </span>
                </div>
              )}
              <div className="pt-0.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Metode</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${paymentBgMap[payStyle.bg] ?? "bg-gray-100 text-gray-700"}`}>{payStyle.icon} {payStyle.text}</span>
                </div>
                <PaymentBreakdown item={activeItem} size="md" />
              </div>
              {activeItem.source_platform && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Platform</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${platformBadge.color}`}>{platformBadge.text}</span>
                </div>
              )}
            </div>
          </div>

          {activeItem.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1.5">Catatan</p>
              <p className="text-xs text-amber-900 leading-relaxed">{activeItem.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-gray-100 flex gap-2.5 flex-shrink-0">
          <a href={`/receipt/${activeItem.invoice_number}`} className="flex-1 h-11 sm:h-10 flex items-center justify-center gap-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition"> Receipt</a>
          <a href={`/payment/${activeItem.invoice_number}`} className="flex-1 h-11 sm:h-10 flex items-center justify-center gap-1.5 text-xs font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition"> Edit</a>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────
export default function Page() {
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportLabel, setExportLabel] = useState("");
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showBulkSN, setShowBulkSN] = useState(false);
  const [bulkSNInput, setBulkSNInput] = useState("");
  const [debouncedBulkSN, setDebouncedBulkSN] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [sourcePlatform, setSourcePlatform] = useState("ALL");
  const [customerType, setCustomerType] = useState("ALL");
  const [sort, setSort] = useState<{ by: SortKey; dir: SortDir }>(DEFAULT_SORT);
  const sortBy = sort.by;
  const sortDir = sort.dir;
  const [companyName, setCompanyName] = useState("ALL");
  const [itemKind, setItemKind] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = isMobile ? 10 : 25;
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<string[]>([]);
  const [sourcePlatformOptions, setSourcePlatformOptions] = useState<string[]>([]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const focusInvoiceParam = searchParams.get("invoice") ?? searchParams.get("highlight");
  const focusInvoice = focusInvoiceParam ? focusInvoiceParam.trim() : null;

  const sortOrder: "newest" | "oldest" =
    sortBy === "date" && sortDir === "asc" ? "oldest" : "newest";

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(r => {
      const role = r.user?.role ?? null;
      const roles: UserRole[] = Array.isArray(r.user?.roles) && r.user.roles.length > 0 ? r.user.roles : role ? [role] : [];
      setUserRole(role); setUserRoles(roles);
    }).catch(() => { setUserRole(null); setUserRoles([]); });
  }, []);

  const canEditTransaction = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_TRANSACTION) : false;
  const canSeeFinancials = hasAnyRole(userRoles, PERMISSIONS.VIEW_FINANCIALS);
  const canRestoreTransaction = userRole ? hasPermission(userRole, PERMISSIONS.RESTORE_TRANSACTION) : false;
  // ── Hanya ADMIN dan KEPALA_PENGELOLA_BARANG yang bisa lihat Margin ──
  const canSeeModal = userRoles.some((r) => MODAL_VISIBLE_ROLES.includes(r));
  // ── Hanya role yang punya akses /api/activity-logs yang boleh lihat Riwayat ──
  const canViewActivityLog = hasAnyRole(userRoles, ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBulkSN(bulkSNInput), 400);
    return () => clearTimeout(t);
  }, [bulkSNInput]);
  const bulkSNList = useMemo(() => Array.from(new Set(
    debouncedBulkSN
      .split(/[\s,;]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
  )), [debouncedBulkSN]);
  useEffect(() => {
    fetch("/api/transaction?meta=1").then(r => r.json()).then(r => {
      if (r.success) {
        setPaymentMethodOptions(r.paymentMethods ?? []);
        setSourcePlatformOptions(r.sourcePlatforms ?? []);
      }
    }).catch(() => { });
  }, []);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.by !== key) return { by: key, dir: SORT_DEFAULT_DIR[key] };
      if (prev.dir === SORT_DEFAULT_DIR[key]) {
        return { by: key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return DEFAULT_SORT;
    });
  };

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("sortOrder", sortOrder);
      if (!CLIENT_SIDE_SORT_KEYS.includes(sortBy)) {
        params.set("sortBy", sortBy);
        params.set("sortDir", sortDir);
      }

      if (focusInvoice) {
        params.set("invoiceExact", focusInvoice);
      } else {
        params.set("page", String(currentPage));
        params.set("limit", String(itemsPerPage));
        if (bulkSNList.length > 0) {
          params.set("snList", bulkSNList.join(","));
        } else if (debouncedSearch.trim()) {
          params.set("search", debouncedSearch.trim());
        }
        if (customerType !== "ALL") params.set("customerType", customerType);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (paymentMethod !== "ALL") params.set("paymentMethod", paymentMethod);
        if (sourcePlatform !== "ALL") params.set("sourcePlatform", sourcePlatform);
        if (companyName !== "ALL") params.set("companyName", companyName);
        if (itemKind !== "ALL") params.set("itemKind", itemKind);
      }

      const response = await fetch(`/api/transaction?${params.toString()}`);
      const result = await response.json();
      if (!result.success) {
        console.error("[fetchTransactions] API error:", result.message ?? result);
      }
      setAllTransactions(result.data || []);
      setTotalCount(result.total ?? (result.data || []).length);
    } catch (err) {
      console.error("[fetchTransactions] fetch failed:", err);
      setAllTransactions([]); setTotalCount(0);
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, bulkSNList, status, customerType, dateFrom, dateTo, paymentMethod, sourcePlatform, sortBy, sortDir, companyName, itemKind, itemsPerPage]);

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, status, sortBy, sortDir, debouncedSearch, bulkSNList, customerType, dateFrom, dateTo, paymentMethod, sourcePlatform, companyName, itemKind, focusInvoice]);

  const paginatedTransactions = useMemo(() => {
    if (!CLIENT_SIDE_SORT_KEYS.includes(sortBy)) return allTransactions;
    const factor = sortDir === "asc" ? 1 : -1;
    return [...allTransactions].sort(
      (a, b) => (Number(a.other ?? 0) - Number(b.other ?? 0)) * factor
    );
  }, [allTransactions, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const startIndex = focusInvoice ? 0 : (currentPage - 1) * itemsPerPage;

  const uniquePaymentMethods = useMemo(() => ["ALL", ...paymentMethodOptions], [paymentMethodOptions]);
  const uniqueSourcePlatforms = useMemo(() => ["ALL", ...sourcePlatformOptions], [sourcePlatformOptions]);

  const hasActiveFilter = status !== "ALL" || customerType !== "ALL" || !!dateFrom || !!dateTo || paymentMethod !== "ALL" || sourcePlatform !== "ALL" || companyName !== "ALL" || itemKind !== "ALL";
  const activeFilterCount = [status !== "ALL", customerType !== "ALL", !!dateFrom, !!dateTo, paymentMethod !== "ALL", sourcePlatform !== "ALL", companyName !== "ALL", itemKind !== "ALL"].filter(Boolean).length;

  const resetFilters = () => {
    setSearch(""); setDebouncedSearch(""); setBulkSNInput(""); setDebouncedBulkSN("");
    setStatus("ALL"); setCustomerType("ALL"); setDateFrom(""); setDateTo("");
    setPaymentMethod("ALL"); setSourcePlatform("ALL"); setCompanyName("ALL"); setItemKind("ALL");
  };

  // ─── EXPORT EXCEL ──────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    setExportLabel("Menyiapkan proses export...");
    try {
      const { default: ExcelJS } = await import("exceljs");
      setExportProgress(5);

      const exportParams = new URLSearchParams({ export: "1", status, sortOrder });
      if (!CLIENT_SIDE_SORT_KEYS.includes(sortBy)) {
        exportParams.set("sortBy", sortBy);
        exportParams.set("sortDir", sortDir);
      }
      if (bulkSNList.length > 0) exportParams.set("snList", bulkSNList.join(","));
      else if (debouncedSearch.trim()) exportParams.set("search", debouncedSearch.trim());
      if (customerType !== "ALL") exportParams.set("customerType", customerType);
      if (dateFrom) exportParams.set("dateFrom", dateFrom);
      if (dateTo) exportParams.set("dateTo", dateTo);
      if (paymentMethod !== "ALL") exportParams.set("paymentMethod", paymentMethod);
      if (sourcePlatform !== "ALL") exportParams.set("sourcePlatform", sourcePlatform);
      if (companyName !== "ALL") exportParams.set("companyName", companyName);
      if (itemKind !== "ALL") exportParams.set("itemKind", itemKind);

      setExportLabel("Mengambil daftar transaksi...");
      const exportRes = await fetch(`/api/transaction?${exportParams.toString()}`);
      const exportResult = await exportRes.json();
      const exportRows: any[] = exportResult.data || [];
      setExportProgress(15);

      const wb = new ExcelJS.Workbook();
      wb.creator = "Solit POS"; wb.created = new Date();
      const ws = wb.addWorksheet("Transaksi", {
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
      });

      const COL_DEFS = [
        { header: "No", key: "no", width: 7 },
        { header: "Tanggal", key: "tanggal", width: 14 }, { header: "Status", key: "status", width: 14 },
        { header: "Jumlah Unit", key: "qty", width: 13 }, { header: "Laptop", key: "laptop", width: 34 },
        { header: "CPU", key: "cpu", width: 22 }, { header: "RAM", key: "ram", width: 10 },
        { header: "Storage", key: "storage", width: 13 }, { header: "Metode Bayar", key: "metode", width: 18 },
        { header: "Harga Modal", key: "modal", width: 22 }, { header: "Harga Jual", key: "jual", width: 22 },
        { header: "Nama Customer", key: "customer", width: 24 }, { header: "No. HP", key: "hp", width: 18 },
        { header: "Toko", key: "toko", width: 15 }, { header: "Serial Number", key: "sn", width: 30 },
        { header: "Catatan", key: "catatan", width: 32 },
      ];
      ws.columns = COL_DEFS;

      type DetailCache = { purchase_price_total: number; grouped_items?: Array<{ laptop_name: string; purchase_price_total: number; margin: number }> };
      const detailCache = new Map<string, DetailCache>();

      if (canSeeFinancials && exportRows.length > 0) {
        let completedDetail = 0;
        const totalDetail = exportRows.length;
        setExportLabel(`Menghitung harga modal (0/${totalDetail})...`);
        await Promise.allSettled(exportRows.map(async (item) => {
          try {
            const res = await fetch(`/api/transaction/${item.invoice_number}`);
            if (!res.ok) return;
            const result = await res.json();
            if (!result.success || !result.data) return;
            const d = result.data;
            detailCache.set(item.invoice_number, {
              purchase_price_total: Number(d.purchase_price_total ?? d.inventory_price ?? 0),
              grouped_items: Array.isArray(d.grouped_items) ? d.grouped_items : undefined,
            });
          } catch { /* skip */ } finally {
            completedDetail += 1;
            setExportProgress(15 + Math.round((completedDetail / totalDetail) * 65));
            setExportLabel(`Menghitung harga modal (${completedDetail}/${totalDetail})...`);
          }
        }));
      } else {
        setExportProgress(80);
      }

      const LEFT_KEYS = new Set(["tanggal"]);
      const CURR_KEYS = new Set(["modal", "jual"]);
      const NUM_KEYS = new Set(["qty", "no"]);
      const tableRows: (string | number)[][] = [];

      setExportLabel("Menyusun baris data...");
      let rowNo = 0;
      for (const item of exportRows) {
        const grouped: any[] = item.grouped_items ?? [];
        const isMulti = grouped.length > 1;
        const cached = detailCache.get(item.invoice_number);
        const tanggal = new Date(item.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });

        if (isMulti) {
          const cachedGroupMap = new Map<string, number>();
          cached?.grouped_items?.forEach((cg) => { if (cg.laptop_name) cachedGroupMap.set(cg.laptop_name, cg.purchase_price_total); });
          for (const g of grouped) {
            const sns: string[] = Array.isArray(g.serial_numbers) ? g.serial_numbers : [];
            const modal = canSeeFinancials ? (cachedGroupMap.get(g.laptop_name ?? "") ?? Number(g.purchase_price_total ?? 0)) : 0;
            rowNo += 1;
            tableRows.push([rowNo, tanggal, STATUS_LABEL[item.status] ?? item.status ?? "", Number(g.unit_count ?? 1), g.laptop_name ?? "", g.cpu ?? "", g.ram ?? "", g.storage ?? "", item.payment_method ?? "", modal, Number(g.allocated_deal_price ?? 0), item.customer_name ?? "", item.customer_phone ?? "", item.company_name ?? "", sns.join(", "), item.notes ?? ""]);
          }
        } else {
          const sns: string[] = Array.isArray(item.serial_numbers) && item.serial_numbers.length > 0 ? item.serial_numbers : item.serial_number ? [item.serial_number] : [];
          const modal = canSeeFinancials ? (cached?.purchase_price_total ?? Number(item.inventory_price ?? 0)) : 0;
          const qty = grouped.length > 0
            ? Number(grouped[0]?.unit_count ?? 1)
            : (sns.length > 0 ? sns.length : 1);
          rowNo += 1;
          tableRows.push([rowNo, tanggal, STATUS_LABEL[item.status] ?? item.status ?? "", qty, item.laptop_name ?? "", item.cpu ?? "", item.ram ?? "", item.storage ?? "", item.payment_method ?? "", modal, Number(item.deal_price ?? item.amount ?? 0), item.customer_name ?? "", item.customer_phone ?? "", item.company_name ?? "", sns.join(", "), item.notes ?? ""]);
        }
      }

      setExportProgress(85);
      setExportLabel("Membuat tabel Excel...");
      if (tableRows.length > 0) {
        ws.addTable({ name: "TabelTransaksi", ref: "A1", headerRow: true, totalsRow: false, style: { theme: "TableStyleMedium7", showRowStripes: true }, columns: COL_DEFS.map((c) => ({ name: c.header, filterButton: true })), rows: tableRows });
      }

      const headerRow = ws.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell, colNum) => {
        const key = COL_DEFS[colNum - 1]?.key ?? "";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
        cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Arial" };
        cell.alignment = { horizontal: LEFT_KEYS.has(key) ? "left" : "center", vertical: "middle" };
        cell.border = { top: { style: "thin", color: { argb: "FFCBD5E1" } }, left: { style: "thin", color: { argb: "FFCBD5E1" } }, bottom: { style: "medium", color: { argb: "FF94A3B8" } }, right: { style: "thin", color: { argb: "FFCBD5E1" } } };
      });

      tableRows.forEach((_, idx) => {
        const row = ws.getRow(idx + 2);
        row.height = 22;
        row.eachCell((cell, colNum) => {
          const key = COL_DEFS[colNum - 1]?.key ?? "";
          cell.font = { size: 10, name: "Arial", color: { argb: "FF111827" } };
          cell.alignment = { horizontal: LEFT_KEYS.has(key) ? "left" : "center", vertical: "middle", wrapText: false };
          cell.border = { top: { style: "hair", color: { argb: "FFCBD5E1" } }, left: { style: "hair", color: { argb: "FFCBD5E1" } }, bottom: { style: "hair", color: { argb: "FFCBD5E1" } }, right: { style: "hair", color: { argb: "FFCBD5E1" } } };
          if (CURR_KEYS.has(key)) cell.numFmt = '"Rp "#,##0';
          if (NUM_KEYS.has(key)) cell.numFmt = "0";
        });
      });

      COL_DEFS.forEach((col, idx) => { ws.getColumn(idx + 1).width = col.width; });

      setExportProgress(95);
      setExportLabel("Menyusun file Excel...");
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const dateStr = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
      link.download = `Transaksi_Solit_${dateStr}.xlsx`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
      setExportProgress(100);
      setExportLabel("Selesai!");
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (err) {
      console.error("Export error:", err);
      alert(`Gagal export Excel: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportLabel("");
    }
  };

  return (
    <DashboardLayout>
      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}
      {detailItem && <TransactionDetailModal item={detailItem} onClose={() => setDetailItem(null)} canSeeFinancials={canSeeFinancials} canSeeModal={canSeeModal} canViewActivityLog={canViewActivityLog} />}
      {isExporting && <ExportProgressModal progress={exportProgress} label={exportLabel} />}

      <div className={`${isMobile ? "px-4 py-4" : "max-w-[1920px] mx-auto px-6 py-4"} space-y-3`}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1 h-6 bg-gray-900 rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-none">Riwayat Transaksi</h1>
              <p className="text-xs text-gray-400 mt-0.5">Kelola dan pantau semua transaksi</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!isLoading && (
              <div className="flex items-center gap-1.5 bg-gray-100 px-3 h-9 rounded-xl">
                <span className="text-xs font-bold text-gray-900 tabular-nums">{totalCount}</span>
                <span className="text-xs text-gray-400">transaksi</span>
              </div>
            )}
            {!isLoading && totalCount > 0 && (
              <button
                onClick={handleExportExcel} disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3 h-9 bg-white border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Export... {exportProgress}%</>) : (
                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="8 13 12 17 16 13" /><line x1="12" y1="17" x2="12" y2="11" /></svg>Export Excel</>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ── Deep-link banner ── */}
        {focusInvoice && (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-800">
              Dari Cashflow · <span className="font-mono text-amber-600">{focusInvoice}</span>
              {allTransactions[0]?.customer_name && <> · <b>{allTransactions[0].customer_name}</b></>}
              {allTransactions.length === 0 && !isLoading && <span className="text-amber-500"> — tidak ditemukan</span>}
            </p>
            <button onClick={() => router.replace("/dashboard/transactions")}
              className="text-[11px] text-amber-600 hover:text-amber-900 font-semibold whitespace-nowrap flex-shrink-0"> Semua</button>
          </div>
        )}

        {/* ── Search + Filter bar ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Cari nota, customer, laptop, CPU, SN..."
                disabled={bulkSNList.length > 0}
                className="w-full border border-gray-200 rounded-xl h-9 pl-9 pr-8 text-sm text-gray-800 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 transition">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>

            <button
              onClick={() => handleSort("date")}
              title="Urutkan berdasarkan waktu transaksi"
              className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-semibold transition whitespace-nowrap ${sortBy === "date" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {sortOrder === "newest"
                  ? <><line x1="12" y1="20" x2="12" y2="4" /><polyline points="6 10 12 4 18 10" /></>
                  : <><line x1="12" y1="4" x2="12" y2="20" /><polyline points="18 14 12 20 6 14" /></>}
              </svg>
              <span className="hidden sm:inline">{sortOrder === "newest" ? "Terbaru" : "Terlama"}</span>
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-semibold transition whitespace-nowrap ${hasActiveFilter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>Filter</span>
              {hasActiveFilter && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold">{activeFilterCount}</span>
              )}
            </button>

            <button
              onClick={() => setShowBulkSN(!showBulkSN)}
              title="Cari banyak Serial Number sekaligus"
              className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-semibold transition whitespace-nowrap ${showBulkSN || bulkSNInput ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="14" y2="18" />
              </svg>
              <span className="hidden sm:inline">Cari Banyak SN</span>
              {bulkSNInput && <span className="inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>
          </div>

          {/* ── Panel Cari Banyak SN ── */}
          {showBulkSN && (
            <div className="pt-3 border-t border-gray-50">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Tempel banyak Serial Number (pisahkan dengan baris baru, koma, atau spasi)
              </label>
              <textarea
                value={bulkSNInput}
                onChange={(e) => setBulkSNInput(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition resize-y"
              />
              {bulkSNList.length > 0 && (
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-gray-400">
                    {isLoading ? "Mencari..." : <><span className="font-bold text-gray-600">{totalCount}</span> transaksi cocok dengan {bulkSNList.length} SN yang dicari</>}
                  </span>
                  <button onClick={() => { setBulkSNInput(""); setDebouncedBulkSN(""); }} className="text-[11px] font-semibold text-red-500 hover:underline">
                    Hapus daftar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Filter Panel ── */}
          {showFilters && (
            <div className="pt-3 border-t border-gray-50 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {["ALL", "PAID", "RESERVED", "HELD", "PACKING", "PENDING", "CANCELLED"].map((s) => (
                    <button key={s} onClick={() => setStatus(s)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold border transition ${status === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                      {s === "ALL" ? "Semua" : STATUS_LABEL[s] ?? s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Rentang Tanggal</p>
                <DateRangeCalendarPicker
                  from={dateFrom}
                  to={dateTo}
                  onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
                />
              </div>

              {uniqueSourcePlatforms.length > 1 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Platform / Sumber</p>
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueSourcePlatforms.map((p) => {
                      const badge = p !== "ALL" ? getSourcePlatformBadge(p as string) : null;
                      return (
                        <button key={p as string} onClick={() => setSourcePlatform(p as string)}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${sourcePlatform === p ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                          {p === "ALL" ? "Semua" : badge?.text ?? (p as string)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {uniquePaymentMethods.length > 1 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Metode Bayar</p>
                  <div className="flex flex-wrap gap-1.5">
                    {uniquePaymentMethods.map((m) => {
                      const style = m !== "ALL" ? getPaymentStyle(m as string) : null;
                      return (
                        <button key={m as string} onClick={() => setPaymentMethod(m as string)}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${paymentMethod === m ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                          {m === "ALL" ? "Semua" : style?.text ?? (m as string)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Toko / Perusahaan</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: "ALL", label: "Semua" },
                    { value: "solit", label: "Solit 03" },
                    { value: "sotech", label: "Sotech" },
                    { value: "onpoint", label: "On Point" },
                    { value: "zenit", label: "Zenit" },
                    { value: "zenit.id", label: "Zenit.id" },
                  ].map((c) => (
                    <button key={c.value} onClick={() => setCompanyName(c.value)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold border transition ${companyName === c.value ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Jenis Barang</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: "ALL", label: "Semua" },
                    { value: "laptop", label: "Laptop" },
                    { value: "accessory", label: "Aksesoris" },
                    { value: "mixed", label: "Campuran" },
                  ].map((c) => (
                    <button key={c.value} onClick={() => setItemKind(c.value)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold border transition ${itemKind === c.value ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {hasActiveFilter && (
                <button onClick={resetFilters} className="w-full h-8 text-xs text-gray-400 border border-gray-200 rounded-xl hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition font-semibold">
                  Reset semua filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          isMobile ? <MobileSkeletonList /> : <DesktopSkeletonTable canSeeModal={canSeeModal} />
        ) : paginatedTransactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 px-4 text-center">
            <div className="text-gray-300 flex justify-center mb-3 opacity-50"><Inbox className="w-12 h-12" /></div>
            <p className="text-gray-400 text-sm font-medium">Tidak ada transaksi ditemukan</p>
            {hasActiveFilter && (
              <button onClick={resetFilters} className="mt-3 text-xs text-blue-500 hover:underline font-medium">Reset filter</button>
            )}
          </div>
        ) : isMobile ? (
          <div className="space-y-3">
            {paginatedTransactions.map((item, idx) => (
              <TransactionCard
                key={item.id} item={item} rowNumber={startIndex + idx + 1} onPhotoClick={setPhotoModal}
                canEditTransaction={canEditTransaction} canSeeFinancials={canSeeFinancials}
                canSeeModal={canSeeModal}
                canRestoreTransaction={canRestoreTransaction}
                onRestored={() => fetchTransactions()} onRowClick={setDetailItem}
              />
            ))}
          </div>
        ) : (
          <TransactionTable
            paginatedTransactions={paginatedTransactions}
            startIndex={startIndex}
            sortBy={sortBy} sortDir={sortDir} onSort={handleSort}
            canEditTransaction={canEditTransaction} canRestoreTransaction={canRestoreTransaction}
            canSeeFinancials={canSeeFinancials} canSeeModal={canSeeModal} onPhotoClick={setPhotoModal}
            onRestored={() => fetchTransactions()} onRowClick={setDetailItem}
          />
        )}

        {/* ── Pagination ── */}
        {!isLoading && totalCount > itemsPerPage && (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1.5 px-3 h-9 rounded-xl border border-gray-200 text-xs bg-white text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition font-semibold"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              <span className="hidden sm:inline">Sebelumnya</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Hal.</span>
              <span className="text-sm font-bold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg tabular-nums">{currentPage}</span>
              <span className="text-xs text-gray-400">dari <b className="text-gray-600">{totalPages}</b></span>
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1.5 px-3 h-9 rounded-xl border border-gray-200 text-xs bg-white text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition font-semibold"
            >
              <span className="hidden sm:inline">selanjutnya</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}