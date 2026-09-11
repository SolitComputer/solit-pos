"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  FileText, Wallet, CheckCircle2, Landmark, Pin,
  Plus, Trash2, X, CheckCheck, RotateCcw, Banknote,
  ClipboardList, Clock, CircleDollarSign,
} from "lucide-react";

interface FundRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  purpose: string;
  amount: number;
  is_approved: boolean;
  approved_by_id: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  is_executed: boolean;
  executed_by_id: string | null;
  executed_by_name: string | null;
  executed_at: string | null;
  created_at: string;
}

interface Meta {
  approverIds: string[];
  executorIds: string[];
}

const CREATE_ROLES = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH", "KEPALA_PENGELOLA_BARANG",
];

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `Rp ${(abs / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `Rp ${(abs / 1_000).toFixed(0)}Rb`;
  return `Rp ${abs}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 *  STATUS BADGE
 * ════════════════════════════════════════════════════════════════════════════ */
function StatusPill({ approved, executed }: { approved: boolean; executed: boolean }) {
  if (executed) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/80">
        <CheckCircle2 className="w-3 h-3" />
        Selesai
      </span>
    );
  }
  if (approved) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200/80">
        <CheckCheck className="w-3 h-3" />
        Disetujui
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200/80">
      <Clock className="w-3 h-3 animate-pulse" />
      Menunggu
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  SUMMARY CARD (matches dashboard card style)
 * ════════════════════════════════════════════════════════════════════════════ */
function SummaryCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: "slate" | "indigo" | "emerald" | "blue";
}) {
  const iconBg = {
    slate:   "bg-slate-100 text-slate-500",
    indigo:  "bg-indigo-100 text-indigo-600",
    emerald: "bg-emerald-100 text-emerald-600",
    blue:    "bg-blue-100 text-blue-600",
  };
  const valueColor = {
    slate:   "text-slate-900",
    indigo:  "text-indigo-700",
    emerald: "text-emerald-700",
    blue:    "text-blue-700",
  };
  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md flex flex-col justify-between h-full">
      <div>
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">{label}</span>
        <p className={`text-xl sm:text-2xl font-extrabold tabular-nums ${valueColor[color]}`}>{value}</p>
      </div>
      {sub && (
        <div className="mt-3">
          <span className="text-[10px] text-slate-400 font-medium">{sub}</span>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FORM MODAL
 * ════════════════════════════════════════════════════════════════════════════ */
function FormModal({
  open, onClose, onSubmit, submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (purpose: string, amount: number) => Promise<void>;
  submitting: boolean;
}) {
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setPurpose("");
      setAmount("");
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) { setAmount(""); return; }
    setAmount(parseInt(digits, 10).toLocaleString("id-ID"));
  };

  const handleSubmit = async () => {
    if (!purpose.trim()) { toast.error("Kebutuhan wajib diisi"); return; }
    const num = parseInt(amount.replace(/\D/g, ""), 10);
    if (!num || num <= 0) { toast.error("Nominal harus lebih dari 0"); return; }
    await onSubmit(purpose.trim(), num);
  };

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ animation: "pdBackdropIn 0.2s ease-out both" }}
    >
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl shadow-black/10 overflow-hidden border border-slate-100"
        style={{ animation: "pdModalIn 0.3s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-100/90 via-indigo-100/80 to-purple-100/90 px-6 py-5 border-b border-indigo-100/60">
          <div className="absolute inset-0 pointer-events-none opacity-30 overflow-hidden">
            <svg className="absolute -right-6 -bottom-8 w-48 h-32" viewBox="0 0 200 130" fill="none">
              <circle cx="140" cy="80" r="80" fill="url(#mGrad1)" />
              <defs>
                <linearGradient id="mGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/80 flex items-center justify-center shadow-sm">
                <CircleDollarSign className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Ajukan Dana Baru</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">Isi formulir pengajuan dana operasional</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/60 hover:bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all shadow-sm border border-white/50"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Kebutuhan Untuk Apa <span className="text-red-500">*</span>
            </label>
            <textarea
              ref={inputRef}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              placeholder="Contoh: Pembelian alat cleaning untuk divisi Teknisi"
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/15 focus:bg-white transition-all resize-none placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Nominal <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full pl-12 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/15 focus:bg-white transition-all placeholder:text-slate-400 tabular-nums font-bold"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-full shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Mengirim...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Kirim Pengajuan
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  MAIN PAGE
 * ════════════════════════════════════════════════════════════════════════════ */
export default function PengajuanDanaPage() {
  const [data, setData] = useState<FundRequest[]>([]);
  const [meta, setMeta] = useState<Meta>({ approverIds: [], executorIds: [] });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<FundRequest | null>(null);
  
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.user) {
          setUserId(d.user.id);
          setUserRoles(d.user.roles ?? [d.user.role].filter(Boolean));
        }
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/pengajuan-dana");
      const json = await res.json();
      if (json.success) {
        setData(json.data ?? []);
        if (json.meta) setMeta(json.meta);
      }
    } catch { toast.error("Gagal memuat data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canCreate = userRoles.some((r) => CREATE_ROLES.includes(r));
  const canApprove = userId ? meta.approverIds.includes(userId) : false;
  const canExecute = userId ? meta.executorIds.includes(userId) : false;

  const handleSubmit = async (purpose: string, amount: number) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/pengajuan-dana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, amount }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast.success("Pengajuan dana berhasil diajukan");
      setShowModal(false);
      fetchData();
    } catch (err: any) { toast.error(err.message || "Gagal mengajukan dana"); }
    finally { setSubmitting(false); }
  };

  const handleAction = async (id: string, action: string) => {
    setActionLoading((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/pengajuan-dana/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      const msgs: Record<string, string> = {
        approve: "Pengajuan disetujui", unapprove: "Persetujuan dibatalkan",
        execute: "Ditandai sudah dieksekusi", unexecute: "Status eksekusi dibatalkan",
      };
      toast.success(msgs[action] || "Berhasil");
      fetchData();
    } catch (err: any) { toast.error(err.message || "Gagal memproses"); }
    finally { setActionLoading((p) => ({ ...p, [id]: false })); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus pengajuan ini?")) return;
    setActionLoading((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/pengajuan-dana/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast.success("Pengajuan dihapus");
      fetchData();
    } catch (err: any) { toast.error(err.message || "Gagal menghapus"); }
    finally { setActionLoading((p) => ({ ...p, [id]: false })); }
  };

  const totalNominal = data.reduce((s, r) => s + r.amount, 0);
  const totalApproved = data.filter((r) => r.is_approved).length;
  const totalExecuted = data.filter((r) => r.is_executed).length;
  const totalPending = data.filter((r) => !r.is_approved && !r.is_executed).length;

  const CARD_STYLE = "bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_30px_-6px_rgba(99,102,241,0.12)] transition-all duration-300";

  return (
    <DashboardLayout>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pdBackdropIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pdModalIn { from { opacity: 0; transform: scale(0.95) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes pdSlideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pdFadeIn { from { opacity: 0 } to { opacity: 1 } }
        .animate-shimmer { animation: shimmer 1.5s ease-in-out infinite; background-size: 200% 100%; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}} />

      <div className="space-y-6 max-w-[1400px] mx-auto px-2 sm:px-4 py-2">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2"
          style={{ animation: "pdFadeIn 0.3s ease-out both" }}>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Pengajuan Dana</h1>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Dana operasional — disetujui CEO, dieksekusi Purchasing
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-full shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              Ajukan Dana
            </button>
          )}
        </div>

        {/* ── Hero Banner ─────────────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-100/90 via-indigo-100/80 to-purple-100/90 p-5 sm:p-7 border border-indigo-100/60 shadow-sm"
          style={{ animation: "pdSlideUp 0.4s ease-out both" }}
        >
          {/* Decorative blobs */}
          <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden">
            <svg className="absolute -right-10 -bottom-10 w-[500px] h-[300px]" viewBox="0 0 500 300" fill="none">
              <circle cx="350" cy="200" r="180" fill="url(#pdWaveGrad1)" opacity="0.5" />
              <circle cx="200" cy="150" r="120" fill="url(#pdWaveGrad2)" opacity="0.4" />
              <defs>
                <linearGradient id="pdWaveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
                <linearGradient id="pdWaveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="relative z-10 space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Ringkasan Pengajuan</h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Rekap seluruh pengajuan dana operasional
              </p>
            </div>

            {/* Stat Cards inside banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <SummaryCard
                icon={<ClipboardList className="w-5 h-5" />}
                label="Total Pengajuan"
                value={data.length.toString()}
                sub={`${totalPending} menunggu persetujuan`}
                color="slate"
              />
              <SummaryCard
                icon={<Wallet className="w-5 h-5" />}
                label="Total Nominal"
                value={fmtShort(totalNominal)}
                sub={formatRupiah(totalNominal)}
                color="indigo"
              />
              <SummaryCard
                icon={<CheckCircle2 className="w-5 h-5" />}
                label="Disetujui"
                value={`${totalApproved} / ${data.length}`}
                sub={data.length ? `${Math.round((totalApproved / data.length) * 100)}% approval rate` : "–"}
                color="emerald"
              />
              <SummaryCard
                icon={<Landmark className="w-5 h-5" />}
                label="Sudah Eksekusi"
                value={`${totalExecuted} / ${data.length}`}
                sub={data.length ? `${Math.round((totalExecuted / data.length) * 100)}% execution rate` : "–"}
                color="blue"
              />
            </div>
          </div>
        </div>

        {/* ── Kriteria Persetujuan ───────────────────────────────────────────── */}
        <div
          className={`${CARD_STYLE} flex items-start gap-4`}
          style={{ animation: "pdSlideUp 0.45s ease-out both" }}
        >
          <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Pin className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-[12px] font-bold text-amber-700 uppercase tracking-wider mb-2">
              Kriteria Persetujuan CEO
            </p>
            <div className="flex flex-wrap gap-2">
              {["Urgent & Mendesak", "Memberikan Value", "Berdampak Positif", "Benar-benar Diperlukan"].map((item, i) => (
                <span key={item} className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/60">
                  <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-[10px] font-extrabold flex-shrink-0">{i + 1}</span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div
          className={CARD_STYLE}
          style={{ animation: "pdSlideUp 0.5s ease-out both" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                <FileText className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Daftar Pengajuan Dana</h3>
                <p className="text-[11px] text-slate-400 font-medium">{data.length} total pengajuan</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="inline-block w-8 h-8 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Memuat data pengajuan…</p>
            </div>
          ) : data.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-indigo-50 flex items-center justify-center">
                <Banknote className="w-7 h-7 text-indigo-300" />
              </div>
              <p className="text-sm font-bold text-slate-600">Belum ada pengajuan dana</p>
              <p className="text-xs text-slate-400 mt-1">Klik tombol "Ajukan Dana" untuk membuat pengajuan baru</p>
              {canCreate && (
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-full shadow-md shadow-indigo-500/20 transition-all hover:-translate-y-0.5"
                >
                  <Plus className="w-4 h-4" />
                  Ajukan Sekarang
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-10">No</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pengaju</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kebutuhan</th>
                    <th className="text-right px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nominal</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Persetujui</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Eksekusi</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tanggal</th>
                    <th className="px-3 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.map((row, idx) => {
                    const isOwner = row.requester_id === userId;
                    const isAdmin = userRoles.some((r) => ["ADMIN", "PROGRAMMER"].includes(r));
                    const canDelete = (isOwner && !row.is_approved) || isAdmin;
                    const busy = actionLoading[row.id] ?? false;

                    const avatarColors = [
                      "from-indigo-500 to-purple-600",
                      "from-rose-500 to-amber-500",
                      "from-blue-500 to-teal-500",
                      "from-violet-500 to-indigo-600",
                    ];
                    const bgGradient = avatarColors[Math.abs(row.requester_id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % avatarColors.length];
                    const initials = row.requester_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

                    return (
                      <tr
                        key={row.id}
                        className="group hover:bg-slate-50/60 transition-colors"
                        style={{ animation: `pdSlideUp 0.3s ease-out both`, animationDelay: `${idx * 40}ms` }}
                      >
                        <td className="px-4 py-4 text-slate-400 font-semibold tabular-nums text-xs">{idx + 1}</td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-2xl bg-gradient-to-br ${bgGradient} text-white font-bold flex items-center justify-center text-[11px] flex-shrink-0`}>
                              {initials}
                            </div>
                            <p className="font-bold text-slate-800 text-sm truncate max-w-[120px]">{row.requester_name}</p>
                          </div>
                        </td>

                        <td className="px-4 py-4 max-w-[220px]">
                          <p className="text-slate-600 text-sm line-clamp-2 leading-relaxed">{row.purpose}</p>
                        </td>

                        <td className="px-4 py-4 text-right">
                          <span className="font-extrabold text-slate-900 tabular-nums text-sm">{fmtShort(row.amount)}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{formatRupiah(row.amount)}</p>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <StatusPill approved={row.is_approved} executed={row.is_executed} />
                        </td>

                        {/* Persetujui */}
                        <td className="px-4 py-4 text-center">
                          {row.is_approved ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <button
                                onClick={() => canApprove && !row.is_executed ? handleAction(row.id, "unapprove") : undefined}
                                disabled={busy || !canApprove || row.is_executed}
                                title={canApprove && !row.is_executed ? "Batalkan persetujuan" : `Oleh ${row.approved_by_name}`}
                                className={`w-8 h-8 rounded-2xl flex items-center justify-center transition-all ${
                                  canApprove && !row.is_executed
                                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 hover:bg-emerald-600 cursor-pointer active:scale-90"
                                    : "bg-emerald-100 text-emerald-600 cursor-default"
                                }`}
                              >
                                <CheckCheck className="w-4 h-4" />
                              </button>
                              <span className="text-[10px] text-slate-400 max-w-[72px] truncate">{row.approved_by_name}</span>
                            </div>
                          ) : canApprove ? (
                            <button
                              onClick={() => handleAction(row.id, "approve")}
                              disabled={busy}
                              title="Setujui pengajuan"
                              className="w-8 h-8 rounded-2xl border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 flex items-center justify-center mx-auto transition-all hover:scale-110 active:scale-90 disabled:opacity-50"
                            >
                              {busy
                                ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
                                : <CheckCheck className="w-4 h-4 text-slate-300 group-hover:text-emerald-500" />
                              }
                            </button>
                          ) : (
                            <div className="w-8 h-8 rounded-2xl border-2 border-slate-100 bg-slate-50 mx-auto" />
                          )}
                        </td>

                        {/* Eksekusi */}
                        <td className="px-4 py-4 text-center">
                          {row.is_executed ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <button
                                onClick={() => canExecute ? handleAction(row.id, "unexecute") : undefined}
                                disabled={busy || !canExecute}
                                title={canExecute ? "Batalkan eksekusi" : `Oleh ${row.executed_by_name}`}
                                className={`w-8 h-8 rounded-2xl flex items-center justify-center transition-all ${
                                  canExecute
                                    ? "bg-blue-500 text-white shadow-sm shadow-blue-500/30 hover:bg-blue-600 cursor-pointer active:scale-90"
                                    : "bg-blue-100 text-blue-600 cursor-default"
                                }`}
                              >
                                <Banknote className="w-4 h-4" />
                              </button>
                              <span className="text-[10px] text-slate-400 max-w-[72px] truncate">{row.executed_by_name}</span>
                            </div>
                          ) : canExecute ? (
                            <button
                              onClick={() => row.is_approved ? handleAction(row.id, "execute") : toast.error("Harus disetujui dulu")}
                              disabled={busy || !row.is_approved}
                              title={row.is_approved ? "Tandai sudah dieksekusi" : "Harus disetujui dulu"}
                              className={`w-8 h-8 rounded-2xl border-2 border-dashed flex items-center justify-center mx-auto transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                                row.is_approved
                                  ? "border-slate-200 hover:border-blue-400 hover:bg-blue-50 hover:scale-110 active:scale-90"
                                  : "border-slate-100 bg-slate-50"
                              }`}
                            >
                              {busy
                                ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                                : <Banknote className="w-4 h-4 text-slate-300" />
                              }
                            </button>
                          ) : (
                            <div className={`w-8 h-8 rounded-2xl border-2 mx-auto ${row.is_approved ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-50"}`} />
                          )}
                        </td>

                        <td className="px-4 py-4 text-center">
                          <span className="text-xs text-slate-500 font-medium whitespace-nowrap tabular-nums">{formatDate(row.created_at)}</span>
                        </td>

                        <td className="px-3 py-4">
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(row.id)}
                              disabled={busy}
                              title="Hapus pengajuan"
                              className="p-2 rounded-xl text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-50 transition-all disabled:opacity-30"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <FormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </DashboardLayout>
  );
}