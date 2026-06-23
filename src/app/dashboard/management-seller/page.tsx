"use client";
// src/app/dashboard/management-seller/page.tsx

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

interface Followup {
  id: string;
  transaction_id: string | null;
  invoice_number: string | null;
  customer_name: string;
  customer_phone: string;
  seller_type: "USER" | "PEDAGANG";
  last_purchase_at: string | null;
  last_followup_at: string | null;
  next_followup_at: string;
  followup_count: number;
  purchase_count: number;
  last_followup_by: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  is_due: boolean;
}

type Tab = "USER" | "PEDAGANG";
type Scope = "ACTIVE" | "ARCHIVED";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const daysDiff = (nextISO: string) =>
  Math.floor((new Date(nextISO).getTime() - Date.now()) / 86400000);

function toWaNumber(phone: string): string {
  let p = (phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p;
}

function buildWaMessage(f: Followup): string {
  const nama = (f.customer_name || "").split(" ")[0] || "Kak";
  if (f.seller_type === "PEDAGANG") {
    return `Halo Kak ${nama}, ini dari Solit 03 👋\n\nMau follow-up nih, gimana stok laptopnya? Kalau butuh restock atau ada unit yang lagi dicari, langsung info ke kami ya. Banyak unit ready baru nih 🙏😊`;
  }
  return `Halo Kak ${nama}, ini dari Solit 03 👋\n\nMau follow-up nih, gimana kabar laptopnya? Semua lancar kan? Kalau ada kendala atau lagi nyari unit lain, langsung chat aja ya 🙏😊`;
}

const waLink = (f: Followup) =>
  `https://wa.me/${toWaNumber(f.customer_phone)}?text=${encodeURIComponent(buildWaMessage(f))}`;

// ── Card ──────────────────────────────────────────────────────────────────────
function FollowupCard({ f, scope, processing, canManage, onFollowup, onArchive, onReactivate }: {
  f: Followup;
  scope: Scope;
  processing: boolean;
  canManage: boolean;
  onFollowup: (id: string) => void;
  onArchive: (id: string) => void;
  onReactivate: (id: string) => void;
}) {
  const diff = daysDiff(f.next_followup_at);
  const isPedagang = f.seller_type === "PEDAGANG";

  let statusEl: React.ReactNode;
  if (scope === "ARCHIVED") {
    statusEl = <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">Diarsipkan</span>;
  } else if (f.is_due) {
    statusEl = (
      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
        ● Perlu Follow-up{diff < 0 ? ` · telat ${Math.abs(diff)}h` : ""}
      </span>
    );
  } else {
    statusEl = (
      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 whitespace-nowrap">
        Terjadwal · {diff <= 0 ? "hari ini" : `${diff}h lagi`}
      </span>
    );
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${f.is_due && scope === "ACTIVE" ? "border-red-200" : "border-gray-200"}`}>
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900 truncate">{f.customer_name}</h3>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 border ${isPedagang ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-blue-100 text-blue-700 border-blue-200"}`}>
                {isPedagang ? "🏷️ Pedagang" : "🙋 User"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">📱 {f.customer_phone}</p>
          </div>
          {statusEl}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Beli terakhir</p>
            <p className="text-gray-700 font-semibold mt-0.5">{fmtDate(f.last_purchase_at)}</p>
            {f.invoice_number && <p className="text-[10px] text-gray-400 font-mono truncate">{f.invoice_number}</p>}
          </div>
          <div className="bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Jadwal berikutnya</p>
            <p className="text-gray-700 font-semibold mt-0.5">{fmtDate(f.next_followup_at)}</p>
            <p className="text-[10px] text-gray-400">tiap {isPedagang ? "3" : "7"} hari</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
          <span>🛒 {f.purchase_count}x beli</span>
          <span>📞 {f.followup_count}x follow-up</span>
          {f.last_followup_by && <span className="truncate">terakhir oleh {f.last_followup_by}</span>}
        </div>
      </div>

      {canManage && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
          <a href={waLink(f)} target="_blank" rel="noopener noreferrer"
            className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.477-.255z" /></svg>
            Chat WA
          </a>
          {scope === "ACTIVE" ? (
            <>
              <button onClick={() => onFollowup(f.id)} disabled={processing}
                className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 transition disabled:opacity-60">
                {processing
                  ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>}
                Sudah FU
              </button>
              <button onClick={() => onArchive(f.id)} disabled={processing}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition disabled:opacity-60"
                title="Arsipkan (stop follow-up)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" /><path d="M10 12h4" /></svg>
              </button>
            </>
          ) : (
            <button onClick={() => onReactivate(f.id)} disabled={processing}
              className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 transition disabled:opacity-60">
              {processing
                ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              Aktifkan Lagi
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ManagementSellerPage() {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [items, setItems] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("USER");
  const [scope, setScope] = useState<Scope>("ACTIVE");
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(r => setUserRole(r.user?.role ?? null)).catch(() => setUserRole(null));
  }, []);

  const canView = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_SELLER_FOLLOWUP) : false;
  const canManage = userRole ? hasPermission(userRole, PERMISSIONS.MANAGE_SELLER_FOLLOWUP) : false;

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/seller-followups?type=ALL&scope=${scope}`);
      const result = await res.json();
      setItems(result.success ? (result.data as Followup[]) : []);
    } catch {
      setItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [scope]);

  const runAction = async (id: string, body: object) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/seller-followups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!result.success) { alert(result.message || "Gagal memproses"); return; }
      await loadData(true);
    } catch {
      alert("Terjadi kesalahan koneksi");
    } finally {
      setProcessingId(null);
    }
  };

  const onFollowup = (id: string) => runAction(id, { action: "followup" });
  const onArchive = (id: string) => runAction(id, { action: "archive" });
  const onReactivate = (id: string) => runAction(id, { action: "reactivate" });

  const userItems = useMemo(() => items.filter(i => i.seller_type === "USER"), [items]);
  const pedagangItems = useMemo(() => items.filter(i => i.seller_type === "PEDAGANG"), [items]);
  const userDue = useMemo(() => userItems.filter(i => i.is_due).length, [userItems]);
  const pedagangDue = useMemo(() => pedagangItems.filter(i => i.is_due).length, [pedagangItems]);

  const visible = useMemo(() => {
    const base = tab === "USER" ? userItems : pedagangItems;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(i =>
      i.customer_name?.toLowerCase().includes(q) ||
      i.customer_phone?.toLowerCase().includes(q) ||
      (i.invoice_number ?? "").toLowerCase().includes(q)
    );
  }, [tab, userItems, pedagangItems, search]);

  if (userRole && !canView) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto mt-20 text-center bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          </div>
          <h2 className="font-bold text-gray-800 text-lg">Akses Ditolak</h2>
          <p className="text-gray-400 text-sm mt-2">Halaman ini hanya untuk <span className="font-semibold text-gray-600">Kepala Marketing</span> & Admin.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-1.5 h-7 bg-gradient-to-b from-gray-700 to-gray-900 rounded-full" />
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Management Seller</h1>
            </div>
            <p className="text-sm text-gray-500 ml-5">Follow-up customer otomatis — User tiap 7 hari, Pedagang tiap 3 hari</p>
          </div>
          <div className="flex bg-gray-100 rounded-xl p-1 flex-shrink-0">
            {(["ACTIVE", "ARCHIVED"] as Scope[]).map(s => (
              <button key={s} onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${scope === s ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {s === "ACTIVE" ? "Aktif" : "Arsip"}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: "USER" as Tab, label: "User", icon: "🙋", count: userItems.length, due: userDue },
            { key: "PEDAGANG" as Tab, label: "Pedagang", icon: "🏷️", count: pedagangItems.length, due: pedagangDue },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 ${tab === t.key ? "border-gray-800 bg-gray-800 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{t.icon}</span>
                <div className="text-left">
                  <p className={`text-sm font-bold ${tab === t.key ? "text-white" : "text-gray-800"}`}>{t.label}</p>
                  <p className={`text-[10px] ${tab === t.key ? "text-gray-300" : "text-gray-400"}`}>{t.count} customer</p>
                </div>
              </div>
              {scope === "ACTIVE" && t.due > 0 && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-500 text-white whitespace-nowrap">{t.due} perlu FU</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Cari nama, no. HP, atau invoice..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl h-10 pl-10 pr-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition" />
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 animate-pulse">
                <div className="flex justify-between"><div className="h-4 w-32 bg-gray-100 rounded" /><div className="h-5 w-24 bg-gray-100 rounded-lg" /></div>
                <div className="grid grid-cols-2 gap-2"><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div>
                <div className="h-9 bg-gray-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <div className="text-5xl mb-4 opacity-40">{scope === "ARCHIVED" ? "🗂️" : "✅"}</div>
            <p className="text-gray-500 text-sm font-medium">
              {search.trim()
                ? "Tidak ada hasil pencarian"
                : scope === "ARCHIVED"
                  ? "Belum ada yang diarsipkan"
                  : `Belum ada ${tab === "USER" ? "User" : "Pedagang"} untuk di-follow-up`}
            </p>
          </div>
        ) : (
          <>
            {scope === "ACTIVE" && visible.some(i => i.is_due) && (
              <p className="text-xs text-gray-400">🔴 Yang merah perlu segera di-follow-up · diurut dari yang paling lama</p>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {visible.map(f => (
                <FollowupCard key={f.id} f={f} scope={scope} processing={processingId === f.id} canManage={canManage}
                  onFollowup={onFollowup} onArchive={onArchive} onReactivate={onReactivate} />
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}