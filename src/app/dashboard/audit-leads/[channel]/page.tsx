"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { notFound } from "next/navigation";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Inbox,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Megaphone,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getAuthUser } from "@/hooks/useAuthUser";
import { AUDIT_LEADS_INPUT_ROLES, AUDIT_LEADS_AUDIT_ROLES, hasAnyRole } from "@/lib/permissions";

type Channel = "WA" | "FB" | "OLX" | "CAROUSEL" | "MITRA" | "RESELLER";

const SLUG_TO_CHANNEL: Record<string, Channel> = {
  wa: "WA", fb: "FB", olx: "OLX", carousell: "CAROUSEL", mitra: "MITRA", reseller: "RESELLER",
};

const channelLabels: Record<Channel, string> = {
  WA: "WhatsApp", FB: "Facebook", OLX: "OLX", CAROUSEL: "Carousell", MITRA: "Mitra", RESELLER: "Reseller",
};

interface LeadRow {
  id: string; channel: Channel; nama: string; minat: string; keterangan: string | null;
  transaksi: boolean; ads: boolean; audited: boolean; audited_by_name: string | null;
  created_by: string; created_by_name: string; created_at: string;
  source: "manual" | "sales_report";
}

const PAGE_SIZE = 10;

// Label & warna badge untuk menandai asal data — dua sumber digabung di
// halaman ini (lihat GET /api/audit-leads): input manual di sini, atau
// leads yang sudah diinput sales lewat Laporan Harian Sales.
const sourceBadge: Record<LeadRow["source"], { label: string; className: string }> = {
  manual: { label: "Input Manual", className: "bg-violet-50 text-violet-600" },
  sales_report: { label: "Laporan Sales", className: "bg-blue-50 text-blue-600" },
};

async function parseApiResponse(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`Server merespons kosong (status ${res.status}).`);
  try { return JSON.parse(text); }
  catch { throw new Error(`Response bukan JSON (status ${res.status}): ${text.slice(0, 200)}`); }
}

export default function AuditLeadsChannelPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelSlug } = use(params);
  const channel = SLUG_TO_CHANNEL[channelSlug.toLowerCase()];
  if (!channel) notFound();

  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRow, setEditingRow] = useState<LeadRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmAuditId, setConfirmAuditId] = useState<string | null>(null);

  const canInput = hasAnyRole(userRoles, AUDIT_LEADS_INPUT_ROLES);
  const canAudit = hasAnyRole(userRoles, AUDIT_LEADS_AUDIT_ROLES);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/audit-leads?channel=${channel}`);
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      setRows(json.data as LeadRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally { setLoading(false); }
  }, [channel]);

  // Ambil user + roles dari hook yang sama dipakai Sidebar (getAuthUser),
  // supaya cache-nya konsisten dan user multi-role tetap kedeteksi lewat
  // .roles (bukan cuma .role tunggal).
  useEffect(() => {
    getAuthUser().then((u) => {
      const roles = Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : u?.role ? [u.role] : [];
      setUserRoles(roles);
    });
  }, []);

  useEffect(() => { fetchRows(); setPage(1); }, [fetchRows]);

  const paginated = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  // Ringkasan kecil di header — murni tampilan, dihitung dari rows yang
  // sudah dimuat (tidak menambah fetch/panggilan API baru).
  const stats = useMemo(() => {
    const total = rows.length;
    const transaksi = rows.filter((r) => r.transaksi).length;
    const audited = rows.filter((r) => r.audited).length;
    const convRate = total > 0 ? Math.round((transaksi / total) * 100) : 0;
    return { total, transaksi, audited, convRate };
  }, [rows]);

    async function handleAudit(id: string) {
    try {
      const target = rows.find((r) => r.id === id);
      const endpoint = target?.source === "sales_report" ? "/api/sales-reports/audit" : "/api/audit-leads/audit";
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      await fetchRows();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal audit data."); }
    finally { setConfirmAuditId(null); }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/audit-leads?id=${id}`, { method: "DELETE" });
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      await fetchRows();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal hapus data."); }
    finally { setConfirmDeleteId(null); }
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5 p-3 sm:p-6 pb-16">
        {/* Animasi dekoratif blob di header — satu momen gerak halus,
            dimatikan otomatis kalau user aktifkan prefers-reduced-motion. */}
        <style>{`
          @keyframes alBlobFloat { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(10px, -14px) scale(1.05); } }
          .al-blob { animation: alBlobFloat 10s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) { .al-blob { animation: none; } }
        `}</style>

        {/* Hero header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-5 sm:p-7 text-white shadow-sm shadow-violet-200">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 al-blob" />
          <div className="pointer-events-none absolute -left-8 -bottom-14 h-40 w-40 rounded-full bg-white/10 al-blob" style={{ animationDelay: "2s" }} />

          <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Audit Marketing — {channelLabels[channel]}</h1>
                <p className="text-violet-100/90 text-xs sm:text-sm mt-1 max-w-md leading-relaxed">
                  Sales input leads dari {channelLabels[channel]}, Marketing audit hasil kerjanya di sini.
                </p>
              </div>
            </div>
            <button
              onClick={() => fetchRows()}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-medium bg-white/15 hover:bg-white/25 backdrop-blur-sm transition-colors self-start shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Ringkasan kaca — angka murni dari data yang sudah dimuat */}
          <div className="relative grid grid-cols-3 gap-2.5 sm:gap-3 mt-5">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-[10px] font-medium text-violet-100/80 uppercase tracking-wide">Total Leads</p>
              <p className="text-lg sm:text-xl font-bold mt-0.5">{stats.total}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-[10px] font-medium text-violet-100/80 uppercase tracking-wide">Transaksi</p>
              <p className="text-lg sm:text-xl font-bold mt-0.5">
                {stats.transaksi} <span className="text-xs font-medium text-violet-100/80">({stats.convRate}%)</span>
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-[10px] font-medium text-violet-100/80 uppercase tracking-wide">Diaudit</p>
              <p className="text-lg sm:text-xl font-bold mt-0.5">
                {stats.audited}<span className="text-xs font-medium text-violet-100/80">/{stats.total}</span>
              </p>
            </div>
          </div>
        </div>

        {canInput && (
          <button
            onClick={() => { setEditingRow(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 active:scale-[0.98] transition-all shadow-sm shadow-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            <Plus className="h-4 w-4" /> Tambah Leads
          </button>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Tabel — laptop/tablet (md ke atas). Keterangan & Ads baru tampil
              mulai lg supaya tidak sesak di layar medium. */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-violet-50/70 border-b border-violet-100">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-violet-700 w-10">No</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-violet-700">Nama</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-violet-700">Minat</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-violet-700 hidden lg:table-cell">Keterangan</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-violet-700">Transaksi</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-violet-700 hidden lg:table-cell">Ads</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-violet-700">Audit</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-violet-700 w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-4 py-3.5">
                        <div className="flex items-center gap-3 animate-pulse">
                          <div className="h-3 w-5 bg-gray-100 rounded-full" />
                          <div className="h-3 flex-1 max-w-[160px] bg-gray-100 rounded-full" />
                          <div className="h-3 flex-1 max-w-[100px] bg-gray-100 rounded-full" />
                          <div className="h-5 w-16 bg-gray-100 rounded-full ml-auto" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12">
                      <div className="flex flex-col items-center text-center">
                        <div className="w-11 h-11 rounded-full bg-violet-50 flex items-center justify-center mb-3">
                          <Inbox className="w-5 h-5 text-violet-300" />
                        </div>
                        <p className="text-sm font-medium text-gray-700">Belum ada data untuk channel {channelLabels[channel]}</p>
                        <p className="text-xs text-gray-400 mt-1">Leads yang masuk akan muncul di sini.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((row, i) => (
                    <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.nama}</p>
                        <span className={`inline-flex mt-1 items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${sourceBadge[row.source].className}`}>
                          {sourceBadge[row.source].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate" title={row.minat}>{row.minat}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate hidden lg:table-cell" title={row.keterangan || undefined}>{row.keterangan || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <TransaksiBadge value={row.transaksi} />
                      </td>
                      <td className="px-4 py-3 text-center hidden lg:table-cell">
                        {row.source === "sales_report" ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <AdsBadge value={row.ads} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.audited ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600"
                            title={row.audited_by_name ?? undefined}
                          >
                            <ShieldCheck className="w-3 h-3" /> {row.audited_by_name}
                          </span>
                        ) : canAudit ? (
                          <button
                            onClick={() => setConfirmAuditId(row.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-600 text-white hover:bg-violet-700 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                          >
                            <ClipboardCheck className="w-3 h-3" /> Audit
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-300 font-medium">Belum</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!row.audited && row.source === "manual" && (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setEditingRow(row); setShowForm(true); }}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(row.id)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Kartu — mobile & tablet kecil (di bawah md) */}
          <div className="md:hidden divide-y divide-gray-50">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-1/3 bg-gray-100 rounded-full" />
                      <div className="h-2.5 w-1/4 bg-gray-100 rounded-full" />
                    </div>
                    <div className="h-5 w-14 bg-gray-100 rounded-full" />
                  </div>
                ))}
              </div>
            ) : paginated.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-center px-6">
                <div className="w-11 h-11 rounded-full bg-violet-50 flex items-center justify-center mb-3">
                  <Inbox className="w-5 h-5 text-violet-300" />
                </div>
                <p className="text-sm font-medium text-gray-700">Belum ada data untuk channel {channelLabels[channel]}</p>
                <p className="text-xs text-gray-400 mt-1 max-w-[220px]">Leads yang masuk akan muncul di sini.</p>
              </div>
            ) : (
              paginated.map((row) => (
                <div key={row.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{row.nama}</p>
                      <span className={`inline-flex mt-1 items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${sourceBadge[row.source].className}`}>
                        {sourceBadge[row.source].label}
                      </span>
                    </div>
                    <TransaksiBadge value={row.transaksi} />
                  </div>
                  <p className="text-xs text-gray-600">{row.minat}</p>
                  {row.keterangan && <p className="text-[11px] text-gray-400">{row.keterangan}</p>}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {row.source !== "sales_report" && <AdsBadge value={row.ads} />}
                    {row.audited ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-600">
                        <ShieldCheck className="w-2.5 h-2.5" /> {row.audited_by_name}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 font-medium">Belum diaudit</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {!row.audited && canAudit && (
                      <button
                        onClick={() => setConfirmAuditId(row.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-violet-200 text-violet-600 hover:bg-violet-50 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                      >
                        <ClipboardCheck className="w-3 h-3" /> Audit
                      </button>
                    )}
                    {!row.audited && row.source === "manual" && (
                      <>
                        <button
                          onClick={() => { setEditingRow(row); setShowForm(true); }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(row.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-red-100 text-red-500 hover:bg-red-50 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30"
                        >
                          <Trash2 className="w-3 h-3" /> Hapus
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-400">
              Halaman <span className="font-medium text-gray-600">{page}</span> dari <span className="font-medium text-gray-600">{totalPages}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] text-gray-500 min-w-[3ch] text-center tabular-nums">{page}/{totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {showForm && (
          <LeadFormModal channel={channel} editingRow={editingRow} onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); fetchRows(); }} />
        )}
        {confirmAuditId && (
          <ConfirmModal title="Audit leads ini?" description="Setelah diaudit, data ini terkunci dan tidak bisa diedit/dihapus tim sales."
            tone="violet" icon={ShieldCheck}
            onCancel={() => setConfirmAuditId(null)} onConfirm={() => handleAudit(confirmAuditId)} />
        )}
        {confirmDeleteId && (
          <ConfirmModal title="Hapus leads ini?" description="Data yang dihapus tidak bisa dikembalikan."
            tone="red" icon={AlertTriangle}
            onCancel={() => setConfirmDeleteId(null)} onConfirm={() => handleDelete(confirmDeleteId)} />
        )}
      </div>
    </DashboardLayout>
  );
}

function TransaksiBadge({ value }: { value: boolean }) {
  if (value) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
        <CheckCircle2 className="w-3 h-3" /> Beli
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200">
      <XCircle className="w-3 h-3" /> Belum
    </span>
  );
}

function AdsBadge({ value }: { value: boolean }) {
  if (value) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-600">
        <Megaphone className="w-3 h-3" /> Ads
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400">
      Organik
    </span>
  );
}

function ConfirmModal({
  title,
  description,
  tone = "violet",
  icon: Icon = AlertTriangle,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  tone?: "violet" | "red";
  icon?: React.ComponentType<{ className?: string }>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const toneClass = tone === "red"
    ? { bg: "bg-red-50", text: "text-red-500", btn: "bg-red-600 hover:bg-red-700 shadow-red-200 focus-visible:ring-red-500/40" }
    : { bg: "bg-violet-50", text: "text-violet-600", btn: "bg-violet-600 hover:bg-violet-700 shadow-violet-200 focus-visible:ring-violet-500/40" };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto">
        <div className={`w-11 h-11 rounded-full ${toneClass.bg} flex items-center justify-center mb-3`}>
          <Icon className={`w-5 h-5 ${toneClass.text}`} />
        </div>
        <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{description}</p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all active:scale-[0.99] shadow-sm focus:outline-none focus-visible:ring-2 ${toneClass.btn}`}
          >
            Ya, lanjutkan
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadFormModal({
  channel,
  editingRow,
  onClose,
  onSaved,
}: {
  channel: Channel;
  editingRow: LeadRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nama, setNama] = useState(editingRow?.nama ?? "");
  const [minat, setMinat] = useState(editingRow?.minat ?? "");
  const [keterangan, setKeterangan] = useState(editingRow?.keterangan ?? "");
  const [transaksi, setTransaksi] = useState(editingRow?.transaksi ?? false);
  const [ads, setAds] = useState(editingRow?.ads ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit() {
    if (!nama.trim() || !minat.trim()) { setErr("Nama dan minat wajib diisi."); return; }
    setSaving(true); setErr(null);
    try {
      const method = editingRow ? "PATCH" : "POST";
      const body = editingRow
        ? { id: editingRow.id, nama, minat, keterangan, transaksi, ads }
        : { channel, nama, minat, keterangan, transaksi, ads };
      const res = await fetch("/api/audit-leads", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan data."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
            {editingRow ? <Pencil className="w-4 h-4 text-violet-600" /> : <Plus className="w-4 h-4 text-violet-600" />}
          </div>
          <h3 className="font-semibold text-sm text-gray-900 flex-1 truncate">
            {editingRow ? "Edit Leads" : "Tambah Leads"} — {channelLabels[channel]}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {err && (
            <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {err}
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nama / Username</label>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama / username"
              className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Minat</label>
            <input
              value={minat}
              onChange={(e) => setMinat(e.target.value)}
              placeholder="Misal: Lenovo x270"
              className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Keterangan (opsional)</label>
            <textarea
              value={keterangan ?? ""}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Catatan tambahan..."
              rows={2}
              className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white transition-colors resize-none"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={transaksi} onChange={(e) => setTransaksi(e.target.checked)} className="w-4 h-4 rounded accent-violet-600" />
              Transaksi (jadi beli)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} className="w-4 h-4 rounded accent-violet-600" />
              Dari Ads (bukan organik)
            </label>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 shadow-sm shadow-violet-200"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}