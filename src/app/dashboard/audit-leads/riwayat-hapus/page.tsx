"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  RotateCcw, ShieldAlert, Loader2, AlertTriangle, Inbox, RefreshCw, ArrowLeft, Clock, User, Trash2,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getAuthUser } from "@/hooks/useAuthUser";
import { SALES_REPORT_SOFT_DELETE_ROLES, hasAnyRole } from "@/lib/permissions";

const channelLabels: Record<string, string> = {
  WA: "WhatsApp", FB: "Facebook", IG: "Instagram", TIKTOK: "TikTok", OLX: "OLX",
  CAROUSEL: "Carousell", TOKOPEDIA: "Tokopedia", SHOPEE: "Shopee", MITRA: "Mitra",
  RESELLER: "Reseller", ECOMMERCE: "E-commerce", SOSMED: "Sosmed",
};

interface DeletedRow {
  id: string; channel: string; nama: string; minat: string; keterangan: string | null;
  sumber: string | null; purchased: boolean; filled_by_name: string;
  deleted_at: string; deleted_by_name: string | null; delete_reason: string | null;
  created_at: string;
}

async function parseApiResponse(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`Server merespons kosong (status ${res.status}).`);
  try { return JSON.parse(text); } catch { throw new Error(`Response bukan JSON (status ${res.status}).`); }
}

export default function RiwayatHapusPage() {
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const canRestore = hasAnyRole(userRoles, SALES_REPORT_SOFT_DELETE_ROLES);

  useEffect(() => {
    getAuthUser().then((u) => {
      const roles = Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : u?.role ? [u.role] : [];
      setUserRoles(roles); setRolesLoaded(true);
    });
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/sales-reports/deleted");
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      setRows(json.data as DeletedRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function handleRestore(id: string) {
    setRestoring(true);
    try {
      const res = await fetch("/api/sales-reports/restore", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      await fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal me-restore laporan.");
    } finally { setRestoring(false); setConfirmRestoreId(null); }
  }

  // Gate di client (server tetap penjaga utama lewat route permission).
  if (rolesLoaded && !canRestore) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto mt-16 text-center px-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-base font-semibold text-gray-900">Akses ditolak</h1>
          <p className="text-sm text-gray-500 mt-1">Halaman ini hanya untuk tim Marketing.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5 p-3 sm:p-6 pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 to-red-600 p-5 sm:p-7 text-white shadow-sm shadow-rose-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Riwayat Hapus — Laporan Sales</h1>
                <p className="text-rose-100/90 text-xs sm:text-sm mt-1 max-w-md leading-relaxed">
                  Laporan yang dihapus (akun mati / data invalid). Bisa di-restore kapan saja.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/dashboard/audit-leads/wa" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-medium bg-white/15 hover:bg-white/25 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Audit Marketing
              </Link>
              <button onClick={fetchRows} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-medium bg-white/15 hover:bg-white/25 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 bg-gray-100 rounded-full" />
                    <div className="h-2.5 w-1/4 bg-gray-100 rounded-full" />
                  </div>
                  <div className="h-8 w-20 bg-gray-100 rounded-lg" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-14 flex flex-col items-center text-center px-6">
              <div className="w-11 h-11 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <Inbox className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-700">Belum ada laporan yang dihapus</p>
              <p className="text-xs text-gray-400 mt-1">Laporan yang kamu hapus dari Audit Marketing akan muncul di sini.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {rows.map((row) => (
                <div key={row.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">{row.nama}</p>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">
                        {channelLabels[row.channel] ?? row.channel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{row.minat}</p>
                    {row.keterangan && <p className="text-[11px] text-gray-400 mt-0.5">{row.keterangan}</p>}
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400 flex-wrap">
                      <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {row.filled_by_name}</span>
                      <span className="inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> dihapus {row.deleted_by_name ?? "-"}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(row.deleted_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} {new Date(row.deleted_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {row.delete_reason && <p className="text-[11px] text-rose-500 mt-1">Alasan: {row.delete_reason}</p>}
                  </div>
                  <button
                    onClick={() => setConfirmRestoreId(row.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-600 hover:bg-emerald-50 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmRestoreId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <RotateCcw className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-semibold text-sm text-gray-900">Restore laporan ini?</h3>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Laporan akan muncul lagi di Laporan Harian Sales & Audit Marketing, dan kembali dihitung.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmRestoreId(null)} disabled={restoring}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Batal
              </button>
              <button onClick={() => handleRestore(confirmRestoreId)} disabled={restoring}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50">
                {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {restoring ? "Memulihkan..." : "Ya, Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}