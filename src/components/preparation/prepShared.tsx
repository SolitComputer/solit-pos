"use client";

import Link from "next/link";
import { type LucideIcon, User, Bike, Package } from "lucide-react";

export interface PrepItem { id: string; serial_number: string; laptop_name: string | null; is_checked: boolean }
export interface PrepOrder {
  id: string; order_number: string; customer_name: string; customer_phone: string | null;
  status: string; delivery_method: string | null;
  created_by: string | null;                
  created_by_name: string | null; created_by_role?: string | null;
  received_by_name: string | null; done_by_name: string | null;
  delivery_address: string | null; created_at: string;
  preparation_items: PrepItem[];
}
export const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  MENUNGGU: { label: "Menunggu", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
  DIPROSES: { label: "Diproses", badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  DIKIRIM: { label: "Dikirim", badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  SELESAI: { label: "Selesai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  DIBATALKAN: { label: "Batal", badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400" },
};

export const DELIVERY_META: Record<string, { label: string; icon: LucideIcon }> = {
  DIAMBIL_CUSTOMER: { label: "Diambil Customer", icon: User },
  PENGANTARAN: { label: "Pengantaran", icon: Bike },
  KURIR: { label: "Kurir", icon: Package },
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const d = Math.floor(hr / 24);
  return `${d} hr lalu`;
}

interface OrderCardProps {
  o: PrepOrder;
  canReceive?: boolean;
  receivingId?: string | null;
  onReceive?: (id: string) => void;
  isNew?: boolean;
}

export function OrderCard({ o, canReceive = false, receivingId = null, onReceive, isNew = false }: OrderCardProps) {
  const sm = STATUS_META[o.status] ?? STATUS_META.MENUNGGU;
  const dm = o.delivery_method ? DELIVERY_META[o.delivery_method] : null;
  const checked = o.preparation_items.filter((it) => it.is_checked).length;
  const total = o.preparation_items.length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  const showReceive = canReceive && o.status === "MENUNGGU" && !!onReceive;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 transition hover:shadow-md ${isNew ? "border-emerald-300 ring-2 ring-emerald-100" : "border-gray-100"}`}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-mono text-xs font-bold text-gray-700">{o.order_number}</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${sm.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{sm.label}
            </span>
            {dm && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200"><dm.icon size={11} /> {dm.label}</span>}
            {isNew && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white animate-pulse">BARU</span>}
          </div>
          <p className="text-base font-black text-gray-900 leading-tight">{o.customer_name}</p>
          {o.customer_phone && <p className="text-xs text-gray-500 mt-0.5"> {o.customer_phone}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] font-bold text-gray-700">{fmtTime(o.created_at)}</p>
          <p className="text-[10px] text-gray-400">{fmtDate(o.created_at)}</p>
          <p className="text-[9px] text-gray-300 mt-0.5">{timeAgo(o.created_at)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs mb-2.5">
        <span className="bg-gray-100 px-2 py-1 rounded-lg font-bold text-gray-700">{total} unit</span>
        {o.status === "DIPROSES" && (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-bold border border-blue-100">
            {checked}/{total} dicek · {pct}%
          </span>
        )}
        {o.created_by_name && <span className="text-gray-400">oleh <span className="font-semibold text-gray-600">{o.created_by_name}</span></span>}
      </div>

      {o.status === "DIPROSES" && total > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2.5">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {o.preparation_items.slice(0, 6).map((it) => (
          <span key={it.id} className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${it.is_checked ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-600"}`}>{it.serial_number}</span>
        ))}
        {total > 6 && <span className="text-[10px] text-gray-400 px-1 self-center">+{total - 6} lagi</span>}
      </div>

      {o.delivery_address && <p className="text-[11px] text-gray-400 mb-3 truncate"> {o.delivery_address}</p>}

      <div className="flex gap-2">
        {showReceive && (
          <button onClick={() => onReceive!(o.id)} disabled={receivingId === o.id}
            className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50">
            {receivingId === o.id ? "Memproses..." : " Terima & Cek"}
          </button>
        )}
        <Link href={`/dashboard/preparation/${o.id}`}
          className="flex-1 h-9 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition flex items-center justify-center">
          Lihat Detail →
        </Link>
      </div>
    </div>
  );
}