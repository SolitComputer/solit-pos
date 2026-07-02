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
  d
    ? new Date(d).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : "—";

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
  `https://wa.me/${toWaNumber(f.customer_phone)}?text=${encodeURIComponent(
    buildWaMessage(f)
  )}`;

// ── Icons ─────────────────────────────────────────────────────────────────────
const WaIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.477-.255z" />
  </svg>
);

const ArchiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" />
    <path d="M10 12h4" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

// Icon untuk tombol Tandai FU (phone/call icon)
const PhoneIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.02 6.02l1.51-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);

const Spinner = () => (
  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block flex-shrink-0" />
);

// ── Avatar initials ───────────────────────────────────────────────────────────
function Avatar({ name, type }: { name: string; type: "USER" | "PEDAGANG" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const isPedagang = type === "PEDAGANG";
  return (
    <div
      className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${isPedagang ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
        }`}
    >
      {initials || "?"}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ f, scope }: { f: Followup; scope: Scope }) {
  const diff = daysDiff(f.next_followup_at);

  if (scope === "ARCHIVED") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
        Diarsipkan
      </span>
    );
  }
  if (f.is_due) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
        Perlu FU{diff < 0 ? ` · ${Math.abs(diff)}h telat` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      {diff <= 0 ? "Hari ini" : `${diff}h lagi`}
    </span>
  );
}

// ── Stat Pill ─────────────────────────────────────────────────────────────────
function StatPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 whitespace-nowrap">
      {children}
    </span>
  );
}

// ── Info Cell ─────────────────────────────────────────────────────────────────
function InfoCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-xs font-bold text-gray-800 leading-snug">{value}</p>
      {sub && (
        <p className="text-[9px] text-gray-400 mt-0.5 font-mono truncate">{sub}</p>
      )}
    </div>
  );
}

// ── Tombol Chat WA — hanya buka WhatsApp, TIDAK record ke API ────────────────
// Dipakai di scope ACTIVE maupun ARCHIVED oleh semua role yang bisa canView
function WaChatButton({ f, fullWidth = false }: { f: Followup; fullWidth?: boolean }) {
  return (
    <a
      href={waLink(f)}
      target="_blank"
      rel="noopener noreferrer"
      title="Buka WhatsApp"
      className={`h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition-all duration-150 flex-shrink-0 ${fullWidth ? "flex-1 text-xs font-bold" : "w-9"
        }`}
    >
      <WaIcon />
      {fullWidth && <span>Chat WA</span>}
    </a>
  );
}

// ── Tombol Tandai Follow-up — hanya record ke API, TIDAK buka WA ─────────────
// Hanya muncul saat canFollowup === true dan f.is_due === true
function TandaiFuButton({
  f,
  processing,
  onFollowup,
}: {
  f: Followup;
  processing: boolean;
  onFollowup: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onFollowup(f.id)}
      disabled={processing}
      title="Tandai sudah follow-up (catat ke sistem)"
      className={`flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-xl text-white text-xs font-bold transition-all duration-150 ${processing
          ? "bg-blue-400 opacity-70 cursor-not-allowed"
          : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
        }`}
    >
      {processing ? <Spinner /> : <PhoneIcon />}
      Tandai FU
    </button>
  );
}

// ── FollowupCard ──────────────────────────────────────────────────────────────
function FollowupCard({
  f,
  scope,
  processing,
  canManage,
  canFollowup,
  onFollowup,
  onArchive,
  onReactivate,
}: {
  f: Followup;
  scope: Scope;
  processing: boolean;
  canManage: boolean;
  canFollowup: boolean;
  onFollowup: (id: string) => void;
  onArchive: (id: string) => void;
  onReactivate: (id: string) => void;
}) {
  const diff = daysDiff(f.next_followup_at);
  const isPedagang = f.seller_type === "PEDAGANG";
  const isDue = f.is_due && scope === "ACTIVE";
  const showActions = canManage || canFollowup;

  return (
    <div
      className={`relative bg-white rounded-2xl border overflow-hidden flex flex-col transition-all duration-200 hover:shadow-md ${isDue ? "border-red-200 shadow-sm shadow-red-50" : "border-gray-200 shadow-sm"
        }`}
    >
      {isDue && (
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-red-400 rounded-t-2xl" />
      )}

      {/* ── Card Header ───────────────────────────────── */}
      <div className={`px-4 pb-3 border-b border-gray-100 ${isDue ? "pt-4" : "pt-3.5"}`}>
        <div className="flex items-center gap-3">
          <Avatar name={f.customer_name} type={f.seller_type} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">
                  {f.customer_name}
                </h3>
                <p className="text-[11px] text-gray-400 font-medium mt-0.5 leading-none">
                  {f.customer_phone}
                </p>
              </div>
              <StatusBadge f={f} scope={scope} />
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${isPedagang
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
              }`}
          >
            {isPedagang ? "🏷️ Pedagang" : "🙋 User"}
          </span>
          <span className="text-[9px] text-gray-300">·</span>
          <span className="text-[9px] text-gray-400 font-medium">
            interval {isPedagang ? "3" : "7"} hari
          </span>
        </div>
      </div>

      {/* ── Card Body ─────────────────────────────────── */}
      <div className="px-4 py-3.5 flex-1 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <InfoCell
            label="Beli terakhir"
            value={fmtDate(f.last_purchase_at)}
            sub={f.invoice_number ?? undefined}
          />
          <InfoCell
            label="Jadwal berikutnya"
            value={fmtDate(f.next_followup_at)}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatPill>🛒 {f.purchase_count}× beli</StatPill>
          <StatPill>📞 {f.followup_count}× FU</StatPill>
          {f.last_followup_by && (
            <StatPill>👤 {f.last_followup_by}</StatPill>
          )}
        </div>
      </div>

      {/* ── Card Actions ──────────────────────────────── */}
      {showActions && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center gap-2">
          {scope === "ACTIVE" ? (
            <>
              {/*
               * Tombol WA: selalu muncul untuk semua role yang punya akses view.
               * Hanya buka WhatsApp, tidak mencatat FU ke sistem.
               */}
              <WaChatButton f={f} />

              {/*
               * Tombol Tandai FU: hanya canFollowup (CREW_SALES & Admin).
               * Saat is_due → tombol biru aktif "Tandai FU".
               * Saat belum due → tombol disabled abu-abu info status.
               */}
              {canFollowup ? (
                f.is_due ? (
                  <TandaiFuButton f={f} processing={processing} onFollowup={onFollowup} />
                ) : (
                  <button
                    disabled
                    title={`Sudah FU. Jadwal berikutnya ${fmtDate(f.next_followup_at)}`}
                    className="flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-white text-gray-400 text-xs font-semibold border border-gray-200 cursor-not-allowed select-none"
                  >
                    <CheckIcon />
                    Sudah FU · {diff <= 0 ? "hari ini" : `${diff}h lagi`}
                  </button>
                )
              ) : (
                /*
                 * Role lain (non-canFollowup): hanya info status, tidak bisa Tandai FU.
                 * Tombol WA di atas tetap tersedia.
                 */
                <div className="flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-50 text-gray-400 text-xs font-semibold border border-gray-100 cursor-default select-none">
                  {f.is_due ? (
                    <span>⏰ Perlu Follow-up</span>
                  ) : (
                    <>
                      <CheckIcon />
                      <span>Sudah FU</span>
                    </>
                  )}
                </div>
              )}

              {/* Tombol Archive: hanya canManage */}
              {canManage && (
                <button
                  onClick={() => onArchive(f.id)}
                  disabled={processing}
                  title="Arsipkan (stop follow-up)"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-all duration-150 disabled:opacity-40 flex-shrink-0"
                >
                  <ArchiveIcon />
                </button>
              )}
            </>
          ) : (
            /* ── Scope ARCHIVED ─────────────────────────────
             * Tombol WA (fullWidth jika tidak ada Aktifkan Lagi)
             * + Aktifkan Lagi (hanya canManage)
             */
            <>
              <WaChatButton f={f} fullWidth={!canManage} />
              {canManage && (
                <button
                  onClick={() => onReactivate(f.id)}
                  disabled={processing}
                  className="flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-800 text-white text-xs font-bold hover:bg-gray-900 transition-all duration-150 disabled:opacity-50"
                >
                  {processing ? <Spinner /> : <RefreshIcon />}
                  Aktifkan Lagi
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Summary Bar ───────────────────────────────────────────────────────────────
function SummaryBar({ items, scope }: { items: Followup[]; scope: Scope }) {
  const totalDue = items.filter((i) => i.is_due).length;
  const total = items.length;
  const totalFU = items.reduce((s, i) => s + i.followup_count, 0);

  const cards =
    scope === "ARCHIVED"
      ? [
        { emoji: "🗂️", label: "Total Arsip", value: total, danger: false },
        { emoji: "📞", label: "Total Follow-up", value: totalFU, danger: false },
      ]
      : [
        { emoji: "👥", label: "Customer", value: total, danger: false },
        { emoji: "🔴", label: "Perlu Follow-up", value: totalDue, danger: totalDue > 0 },
        { emoji: "📞", label: "Total Follow-up", value: totalFU, danger: false },
      ];

  return (
    <div className={`grid gap-2 ${scope === "ARCHIVED" ? "grid-cols-2" : "grid-cols-3"}`}>
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-2xl border px-3 py-3 flex items-center gap-2.5 transition-colors ${c.danger ? "bg-red-50 border-red-200" : "bg-white border-gray-200"
            }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${c.danger ? "bg-red-100" : "bg-gray-100"
              }`}
          >
            {c.emoji}
          </div>
          <div className="min-w-0">
            <p
              className={`text-[9px] font-bold uppercase tracking-widest leading-none mb-1 truncate ${c.danger ? "text-red-400" : "text-gray-400"
                }`}
            >
              {c.label}
            </p>
            <p
              className={`text-lg font-black leading-none ${c.danger ? "text-red-600" : "text-gray-900"
                }`}
            >
              {c.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="px-4 pt-3.5 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-100 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="h-4 w-32 bg-gray-100 rounded-lg" />
              <div className="h-5 w-20 bg-gray-100 rounded-full" />
            </div>
            <div className="h-3 w-24 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="mt-2.5 h-4 w-28 bg-gray-100 rounded-full" />
      </div>
      <div className="px-4 py-3.5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="h-14 bg-gray-100 rounded-xl" />
          <div className="h-14 bg-gray-100 rounded-xl" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-6 w-20 bg-gray-100 rounded-lg" />
          <div className="h-6 w-16 bg-gray-100 rounded-lg" />
        </div>
      </div>
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
        <div className="h-9 bg-gray-100 rounded-xl" />
      </div>
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
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((r) => setUserRole(r.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const canView = userRole
    ? hasPermission(userRole, PERMISSIONS.VIEW_SELLER_FOLLOWUP)
    : false;

  const canManage = userRole
    ? hasPermission(userRole, PERMISSIONS.MANAGE_SELLER_FOLLOWUP)
    : false;

  const canFollowup = userRole
    ? hasPermission(userRole, PERMISSIONS.FOLLOWUP_SELLER)
    : false;

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
  useEffect(() => {
    loadData();
  }, [scope]);

  const runAction = async (id: string, body: object) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/seller-followups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!result.success) {
        alert(result.message || "Gagal memproses");
        return;
      }
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

  const userItems = useMemo(
    () => items.filter((i) => i.seller_type === "USER"),
    [items]
  );
  const pedagangItems = useMemo(
    () => items.filter((i) => i.seller_type === "PEDAGANG"),
    [items]
  );
  const userDue = useMemo(
    () => userItems.filter((i) => i.is_due).length,
    [userItems]
  );
  const pedagangDue = useMemo(
    () => pedagangItems.filter((i) => i.is_due).length,
    [pedagangItems]
  );

  const visible = useMemo(() => {
    const base = tab === "USER" ? userItems : pedagangItems;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (i) =>
        i.customer_name?.toLowerCase().includes(q) ||
        i.customer_phone?.toLowerCase().includes(q) ||
        (i.invoice_number ?? "").toLowerCase().includes(q)
    );
  }, [tab, userItems, pedagangItems, search]);

  if (userRole && !canView) {
    return (
      <DashboardLayout>
        <div className="max-w-sm mx-auto mt-24 text-center px-6">
          <div className="w-14 h-14 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h2 className="text-base font-bold text-gray-800">Akses Ditolak</h2>
          <p className="text-gray-400 text-sm mt-1.5 leading-relaxed">
            Halaman ini hanya untuk{" "}
            <span className="font-semibold text-gray-600">Kepala Marketing</span> &amp; Admin.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const dueCount = visible.filter((i) => i.is_due).length;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-[3px] h-6 bg-gray-900 rounded-full" />
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                Management Seller
              </h1>
            </div>
            <p className="text-xs text-gray-400 ml-[18px] font-medium">
              User tiap 7 hari &nbsp;·&nbsp; Pedagang tiap 3 hari
            </p>
          </div>
          <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5 flex-shrink-0">
            {(["ACTIVE", "ARCHIVED"] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${scope === s
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                {s === "ACTIVE" ? "Aktif" : "Arsip"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Summary Bar ─────────────────────────────────────────────────── */}
        {!loading && <SummaryBar items={items} scope={scope} />}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: "USER" as Tab, label: "User", icon: "🙋", count: userItems.length, due: userDue },
              { key: "PEDAGANG" as Tab, label: "Pedagang", icon: "🏷️", count: pedagangItems.length, due: pedagangDue },
            ] as const
          ).map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all duration-200 text-left overflow-hidden ${isActive
                    ? "bg-gray-900 border-gray-900 shadow-md"
                    : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${isActive ? "bg-white/10" : "bg-gray-100"
                      }`}
                  >
                    {t.icon}
                  </div>
                  <div>
                    <p className={`text-sm font-bold leading-tight ${isActive ? "text-white" : "text-gray-900"}`}>
                      {t.label}
                    </p>
                    <p className="text-[10px] font-medium mt-0.5 text-gray-400">
                      {t.count} customer
                    </p>
                  </div>
                </div>
                {scope === "ACTIVE" && t.due > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500 text-white flex-shrink-0">
                    {t.due} FU
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Search ──────────────────────────────────────────────────────── */}
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Cari nama, nomor HP, atau invoice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl h-10 pl-10 pr-10 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition placeholder:text-gray-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700 transition"
              aria-label="Hapus pencarian"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 py-20 text-center">
            <div className="text-5xl mb-4 opacity-25">
              {scope === "ARCHIVED" ? "🗂️" : search.trim() ? "🔍" : "✅"}
            </div>
            <p className="text-sm font-bold text-gray-700">
              {search.trim()
                ? "Tidak ada hasil pencarian"
                : scope === "ARCHIVED"
                  ? "Belum ada yang diarsipkan"
                  : `Belum ada ${tab === "USER" ? "User" : "Pedagang"} untuk di-follow-up`}
            </p>
            {search.trim() && (
              <button
                onClick={() => setSearch("")}
                className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition"
              >
                Hapus pencarian
              </button>
            )}
          </div>
        ) : (
          <>
            {scope === "ACTIVE" && dueCount > 0 && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <p className="text-xs text-red-600 font-semibold">
                  {dueCount} customer perlu segera di-follow-up
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {visible.map((f) => (
                <FollowupCard
                  key={f.id}
                  f={f}
                  scope={scope}
                  processing={processingId === f.id}
                  canManage={canManage}
                  canFollowup={canFollowup}
                  onFollowup={onFollowup}
                  onArchive={onArchive}
                  onReactivate={onReactivate}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}