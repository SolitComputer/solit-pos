"use client";

import { useState } from "react";
import { Camera, X, Loader2, RefreshCw } from "lucide-react";
import { addTimestampWatermark } from "@/lib/watermark";
import {
  getOvertimeColor,
  formatOvertimeMinutes,
  OVERTIME_CATEGORY_LABELS,
  OVERTIME_DIRECTION_LABELS,
  OVERTIME_CATEGORIES,
  type OvertimeCategory,
} from "@/lib/overtimeEngine";

export interface OvertimeTableRow {
  id: string;
  user_id: string;
  request_date: string;
  status: string;
  audit_status: string;
  category: string | null;
  direction: string | null;
  work_description: string | null;
  duration_minutes: number | null;
  proof_photo_url: string | null;
  total_pay: number | null;
  actual_start: string | null;
  actual_end: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  is_holiday?: boolean | null;
  is_late?: boolean | null;
  requested_start?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  users?: { id: string; name: string; role: string } | null;
  approver?: { id: string; name: string } | null;
  auditor?: { id: string; name: string } | null;
}

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function formatFullDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
  if (isNaN(d.getTime())) return dateStr;
  return `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function formatOvertimeTimestamp(row: OvertimeTableRow): string {
  const ts = row.completed_at || row.created_at;
  if (ts) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB";
    }
  }
  const s = fmtTime(row.actual_start || row.scheduled_start);
  const e = fmtTime(row.actual_end || row.scheduled_end);
  return `${s} – ${e} WIB`;
}

function detectLateFromTimeStr(timeStr: string | null | undefined): boolean {
  if (!timeStr) return false;
  const LATE_THRESHOLD = 8 * 60;
  let totalMin: number;
  if (timeStr.includes("T")) {
    const w = new Date(new Date(timeStr).getTime() + 7 * 60 * 60 * 1000);
    totalMin = w.getUTCHours() * 60 + w.getUTCMinutes();
  } else {
    const [h, m] = timeStr.split(":").map(Number);
    if (Number.isNaN(h)) return false;
    totalMin = h * 60 + (m || 0);
  }
  return totalMin >= LATE_THRESHOLD;
}

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  BLUE: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", label: "Belum Terhitung Lembur" },
  AMBER: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Sudah di-ACC — Menunggu Audit" },
  GREEN: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Sudah Diaudit" },
};

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

type RowState = {
  style: (typeof COLOR_STYLES)[string];
  canAccThis: boolean;
  canFillDetail: boolean;
  canUploadProof: boolean;
  canAuditThis: boolean;
};

// Menyatukan perhitungan status baris (dipakai versi tabel desktop & kartu mobile
// biar logic hak-aksesnya cuma ada di satu tempat, gak dobel).
function computeRowState(
  o: OvertimeTableRow,
  opts: { currentUserId?: string; canApprove: (targetRole: string) => boolean; canAudit: boolean }
): RowState {
  const color = getOvertimeColor(o);
  const style = COLOR_STYLES[color];
  const isOwner = o.user_id === opts.currentUserId;
  // ✅ FIX: kepala divisi gak boleh nge-ACC lemburannya sendiri (server
  // sudah nolak ini, tapi tombolnya sempat tetap nongol di UI karena
  // fungsi canApprove(targetRole) di sini gak tau siapa target
  // user-nya). Full-access (Admin) tetap boleh self-approve, sesuai server.
  const canAccThis = o.status === "PENDING" && !!o.category && !!o.work_description && opts.canApprove(o.users?.role ?? "") && !(isOwner && !opts.canAudit);
  const canFillDetail = o.status === "PENDING" && isOwner && (!o.category || !o.work_description);
  const canUploadProof = o.status === "NEED_PROOF" && isOwner;
  const canAuditThis = o.status === "COMPLETED" && o.audit_status === "PENDING" && opts.canAudit;
  return { style, canAccThis, canFillDetail, canUploadProof, canAuditThis };
}

// Tombol aksi per baris — dipakai di kolom "Aksi" tabel desktop maupun kartu mobile.
function RowActions({
  align, canFillDetail, canAccThis, canUploadProof, canAuditThis, isBusy,
  onFillDetail, onApprove, onUploadProof, onAudit,
}: {
  align: "center" | "start";
  canFillDetail: boolean;
  canAccThis: boolean;
  canUploadProof: boolean;
  canAuditThis: boolean;
  isBusy: boolean;
  onFillDetail: () => void;
  onApprove: () => void;
  onUploadProof: () => void;
  onAudit: () => void;
}) {
  const hasAction = canFillDetail || canAccThis || canUploadProof || canAuditThis;
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${align === "center" ? "justify-center" : "justify-start"}`}>
      {canFillDetail && <button onClick={onFillDetail} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">Isi Detail</button>}
      {canAccThis && <button disabled={isBusy} onClick={onApprove} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50">{isBusy ? "..." : "ACC"}</button>}
      {canUploadProof && <button onClick={onUploadProof} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100">Upload Bukti</button>}
      {canAuditThis && <button disabled={isBusy} onClick={onAudit} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50">{isBusy ? "..." : "Audit"}</button>}
      {!hasAction && <span className="text-[10px] text-gray-300">—</span>}
    </div>
  );
}

export function OvertimeTable({
  rows, loading, canApprove, canAudit, currentUserId, onRefresh, onOpenDetail,
}: {
  rows: OvertimeTableRow[];
  loading: boolean;
  canApprove: (targetRole: string) => boolean;
  canAudit: boolean;
  currentUserId?: string;
  onRefresh: () => void;
  onOpenDetail?: (row: OvertimeTableRow) => void;
}) {
  const [detailModalRow, setDetailModalRow] = useState<OvertimeTableRow | null>(null);
  const [photoModalRow, setPhotoModalRow] = useState<OvertimeTableRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectModalRow, setRejectModalRow] = useState<OvertimeTableRow | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-2">
        {Array(5).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">Tidak ada data lemburan untuk filter ini.</div>;
  }

  const runAction = async (id: string, body: any) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }),
      });
      const d = await res.json();
      if (!d.success) { alert(d.message); return; }
      if (d.warning) alert(d.warning);
      onRefresh();
    } catch (err: any) {
      alert(`Gagal memproses: ${err?.message ?? "kesalahan jaringan"}`);
    } finally { setBusyId(null); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama</th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Keterangan</th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Kategori</th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu Lembur</th>
              <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Bukti Foto</th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Di ACC Oleh</th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Di Audit Oleh</th>
              <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((o) => {
              const color = getOvertimeColor(o);
              const style = COLOR_STYLES[color];
              const isOwner = o.user_id === currentUserId;
              // ✅ FIX: kepala divisi gak boleh nge-ACC lemburannya sendiri (server
              // sudah nolak ini, tapi tombolnya sempat tetap nongol di UI karena
              // fungsi canApprove(targetRole) di sini gak tau siapa target
              // user-nya). Full-access (Admin) tetap boleh self-approve, sesuai server.
              const canAccThis = o.status === "PENDING" && !!o.category && !!o.work_description && canApprove(o.users?.role ?? "") && !(isOwner && !canAudit);
              const canFillDetail = o.status === "PENDING" && isOwner && (!o.category || !o.work_description);
              const canUploadProof = o.status === "NEED_PROOF" && isOwner;
              const canAuditThis = o.status === "COMPLETED" && o.audit_status === "PENDING" && canAudit;
              const isBusy = busyId === o.id;

              return (
                <tr key={o.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-800">{o.users?.name ?? "Unknown"}</p>
                    <p className="text-[10px] text-gray-400">{new Date(o.request_date + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-xs text-gray-700 whitespace-normal break-words" title={o.work_description ?? ""}>{o.work_description || "— belum diisi —"}</p>
                    {o.direction && <p className="text-[10px] text-gray-400 mt-0.5">{OVERTIME_DIRECTION_LABELS[o.direction as keyof typeof OVERTIME_DIRECTION_LABELS] ?? o.direction}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {o.category
                      ? <span className="text-[11px] font-semibold text-gray-700">{OVERTIME_CATEGORY_LABELS[o.category as OvertimeCategory] ?? o.category}</span>
                      : <span className="text-[11px] text-gray-300">— belum diisi —</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-bold text-gray-700">{fmtTime(o.actual_start)} – {fmtTime(o.actual_end)}</p>
                    <p className="text-[10px] text-gray-400">{formatOvertimeMinutes(o.duration_minutes)}</p>
                    <span className={`inline-flex items-center gap-1 mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${style.bg} ${style.text} ${style.border}`}>{style.label}</span>
                    {o.audit_status === "AUDITED" && o.total_pay != null && (
                      <p className="text-[11px] font-black text-emerald-700 mt-1">{formatRupiah(o.total_pay)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {o.proof_photo_url ? (
                      <button
                        onClick={() => setPhotoModalRow(o)}
                        className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 inline-block hover:border-violet-400 hover:ring-2 hover:ring-violet-300 transition-all cursor-pointer group"
                        title="Klik untuk melihat bukti foto & timestamp"
                      >
                        <img src={o.proof_photo_url} alt="bukti" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </button>
                    ) : <span className="text-gray-300"><Camera size={16} className="inline" /></span>}
                  </td>
                  <td className="px-4 py-3">{o.approver ? <span className="text-xs text-gray-700 font-semibold">{o.approver.name}</span> : <span className="text-[11px] text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">{o.auditor ? <span className="text-xs text-gray-700 font-semibold">{o.auditor.name}</span> : <span className="text-[11px] text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {canFillDetail && <button onClick={() => setDetailModalRow(o)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">Isi Detail</button>}
                      {canAccThis && <button disabled={isBusy} onClick={() => runAction(o.id, { action: "APPROVE" })} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50">{isBusy ? "..." : "ACC"}</button>}
                      {canAccThis && <button disabled={isBusy} onClick={() => setRejectModalRow(o)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50">Tolak</button>}
                      {canUploadProof && <button onClick={() => setDetailModalRow(o)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100">Upload Bukti</button>}
                      {canAuditThis && (
                        <button disabled={isBusy} onClick={() => {
                          if (o.is_holiday) {
                            const isLate = o.is_late === true || (o.is_late == null && detectLateFromTimeStr(o.requested_start ?? o.actual_start));
                            const holidayPay = isLate ? 50000 : 100000;
                            if (confirm(`Audit lemburan hari libur ${o.users?.name}?\n\nStatus: ${isLate ? "Terlambat" : "Tepat Waktu"} — nominal terkunci ${holidayPay === 50000 ? "Rp50.000" : "Rp100.000"} (aturan tetap).`)) {
                              runAction(o.id, { action: "AUDIT", decision: "APPROVE", total_pay: holidayPay, rate_per_hour: null });
                            }
                            return;
                          }
                          if (confirm(`Audit lemburan ${o.users?.name}? Nominal akan dihitung dan dikunci.`)) runAction(o.id, { action: "AUDIT", decision: "APPROVE" });
                        }} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50">{isBusy ? "..." : "Audit"}</button>
                      )}
                      {onOpenDetail && <button onClick={() => onOpenDetail(o)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">Detail</button>}
                      {!canFillDetail && !canAccThis && !canUploadProof && !canAuditThis && !onOpenDetail && <span className="text-[10px] text-gray-300">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {photoModalRow && photoModalRow.proof_photo_url && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5" style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }} onClick={() => setPhotoModalRow(null)}>
          <div className="relative w-full max-w-2xl bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-gray-800 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-900 border-b border-gray-800 text-white">
              <div>
                <span className="text-xs font-bold text-gray-100 block">Bukti Foto Lembur — {photoModalRow.users?.name ?? "Karyawan"}</span>
                <span className="text-[10px] text-gray-400 font-medium">{formatFullDateIndo(photoModalRow.request_date)}</span>
              </div>
              <button onClick={() => setPhotoModalRow(null)} className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            
            <div className="relative p-3 bg-black flex items-center justify-center min-h-[300px] max-h-[65vh] overflow-hidden">
              <img src={photoModalRow.proof_photo_url} alt="Bukti lembur" className="max-w-full max-h-[62vh] object-contain rounded-xl" />
              
              {/* Floating Timestamp Badge Overlay */}
              <div className="absolute bottom-5 left-5 right-5 sm:right-auto bg-slate-950/90 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 text-white shadow-2xl space-y-1 max-w-sm pointer-events-none">
                <div className="flex items-center gap-1.5 text-orange-400 font-bold text-[10px] tracking-wider uppercase">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse inline-block" />
                  SOLIT POS • BUKTI LEMBUR
                </div>
                <p className="font-mono font-bold text-base text-white leading-tight">
                  {formatOvertimeTimestamp(photoModalRow)}
                </p>
                <p className="text-[11px] text-gray-200 font-medium">
                  {formatFullDateIndo(photoModalRow.request_date)}
                </p>
                <div className="pt-1 mt-1 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-400">
                  <span>Karyawan: <strong className="text-white">{photoModalRow.users?.name ?? "Karyawan"}</strong></span>
                  {photoModalRow.duration_minutes ? <span className="font-mono text-orange-300 font-semibold">{formatOvertimeMinutes(photoModalRow.duration_minutes)}</span> : null}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-gray-900 border-t border-gray-800 flex items-center justify-between text-xs text-gray-300">
              <div className="truncate pr-3">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Keterangan:</span>
                <span className="text-gray-200 text-xs truncate">{photoModalRow.work_description || "—"}</span>
              </div>
              <button onClick={() => setPhotoModalRow(null)} className="flex-shrink-0 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {detailModalRow && detailModalRow.status === "PENDING" && <OvertimeQuickDetailForm row={detailModalRow} onClose={() => setDetailModalRow(null)} onSaved={onRefresh} />}
      {detailModalRow && detailModalRow.status === "NEED_PROOF" && <OvertimeProofUploadForm row={detailModalRow} onClose={() => setDetailModalRow(null)} onSaved={onRefresh} />}
      {rejectModalRow && <OvertimeRejectForm row={rejectModalRow} onClose={() => setRejectModalRow(null)} onSaved={onRefresh} />}
    </div>
  );
}

function OvertimeRejectForm({ row, onClose, onSaved }: { row: OvertimeTableRow; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!reason.trim()) { setError("Alasan penolakan wajib diisi."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, action: "REJECT", rejection_note: reason.trim() }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menolak lembur."); return; }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal menolak — periksa koneksi internet.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3.5">
        <p className="font-bold text-sm text-gray-800">Tolak Lembur — {row.users?.name}</p>
        <p className="text-[11px] text-gray-400">Setelah ditolak, lemburan ini tidak dihitung dan langsung hilang dari daftar.</p>
        {error && <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Alasan penolakan..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs resize-none" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 bg-red-600 rounded-xl text-xs font-bold text-white disabled:opacity-50">{saving ? "Menolak..." : "Tolak Lembur"}</button>
        </div>
      </div>
    </div>
  );
}

function OvertimeQuickDetailForm({ row, onClose, onSaved }: { row: OvertimeTableRow; onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<OvertimeCategory | "">((row.category as OvertimeCategory) || "");
  const [desc, setDesc] = useState(row.work_description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    if (rawFile.size > 10 * 1024 * 1024) {
      setError("Ukuran foto terlalu besar (maksimal 10 MB). Silakan pilih foto yang lebih kecil.");
      return;
    }

    setError("");
    setProcessing(true);
    try {
      const watermarked = await addTimestampWatermark(rawFile, {
        tag: "SOLIT POS • BUKTI LEMBUR",
        subTag: row.users?.name ? `Karyawan: ${row.users.name}` : undefined,
      });
      setFile(watermarked.file);
      setPreview(watermarked.dataUrl);
    } catch (err: any) {
      console.error("[WatermarkError]", err);
      setError("Gagal memproses timestamp pada foto. Silakan coba lagi.");
    } finally {
      setProcessing(false);
    }
  };

  const save = async () => {
    if (!category) { setError("Kategori wajib dipilih."); return; }
    if (!desc.trim()) { setError("Keterangan wajib diisi."); return; }
    if (!file) { setError("Bukti foto lembur wajib dilampirkan."); return; }

    setSaving(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const upRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd });
      const upData = await upRes.json();
      if (!upData.success) { setError(upData.message || "Upload foto gagal"); setSaving(false); return; }

      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, action: "SUBMIT_DETAIL", category, work_description: desc.trim(), proof_photo_url: upData.url }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message); return; }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan — periksa koneksi internet.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3.5">
        <p className="font-bold text-sm text-gray-800">Isi Detail Lembur</p>
        {error && <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}
        <div className="space-y-2">
          {OVERTIME_CATEGORIES.map((cat) => (
            <button key={cat} type="button" onClick={() => setCategory(cat)} className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs font-semibold ${category === cat ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-700 border-gray-200"}`}>
              {OVERTIME_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Keterangan pekerjaan..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs resize-none" />

        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Bukti Foto Lembur (wajib) *</label>
          {processing ? (
            <div className="h-32 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
              <p className="text-xs font-semibold text-violet-700">Mencetak timestamp...</p>
            </div>
          ) : preview ? (
            <div className="space-y-2">
              <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-black aspect-video max-h-32 flex items-center justify-center">
                <img src={preview} alt="preview bukti" className="w-full h-full object-contain" />
              </div>
              <label className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-700 cursor-pointer py-1">
                <RefreshCw size={13} />
                <span>Ganti / Ambil Ulang Foto</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl p-3 cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all text-center group">
                <div className="w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Camera size={16} />
                </div>
                <span className="text-[11px] font-bold text-gray-700">Kamera</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelected} />
              </label>
              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl p-3 cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all text-center group">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold text-gray-700">Galeri</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
              </label>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 bg-violet-600 rounded-xl text-xs font-bold text-white disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}

function OvertimeProofUploadForm({ row, onClose, onSaved }: { row: OvertimeTableRow; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    if (rawFile.size > 10 * 1024 * 1024) {
      setError("Ukuran foto terlalu besar (maksimal 10 MB). Silakan pilih foto yang lebih kecil.");
      return;
    }

    setError("");
    setProcessing(true);
    try {
      const watermarked = await addTimestampWatermark(rawFile, {
        tag: "SOLIT POS • BUKTI LEMBUR",
        subTag: row.users?.name ? `Karyawan: ${row.users.name}` : undefined,
      });
      setFile(watermarked.file);
      setPreview(watermarked.dataUrl);
    } catch (err: any) {
      console.error("[WatermarkError]", err);
      setError("Gagal memproses timestamp pada foto. Silakan coba lagi.");
    } finally {
      setProcessing(false);
    }
  };

  const submit = async () => {
    if (!file) { setError("Pilih atau ambil foto dulu."); return; }
    setUploading(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const upRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd });
      const upData = await upRes.json();
      if (!upData.success) { setError(upData.message || "Upload foto gagal"); return; }
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, action: "ATTACH_PROOF", proof_photo_url: upData.url }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message); return; }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal upload — periksa koneksi internet.");
    } finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3.5 shadow-2xl border border-gray-100">
        <div>
          <p className="font-bold text-sm text-gray-800">Upload Bukti Lembur</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Foto otomatis dilengkapi watermark tanggal, hari, jam, menit & detik WIB.
          </p>
        </div>

        {error && <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

        {processing ? (
          <div className="h-44 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
            <p className="text-xs font-semibold text-violet-700">Mencetak timestamp ke foto...</p>
          </div>
        ) : preview ? (
          <div className="space-y-2">
            <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-black aspect-video max-h-48 flex items-center justify-center">
              <img src={preview} alt="preview bukti ber-timestamp" className="w-full h-full object-contain" />
            </div>
            <label className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-700 cursor-pointer py-1">
              <RefreshCw size={13} />
              <span>Ganti / Ambil Ulang Foto</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all text-center group">
              <div className="w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera size={16} />
              </div>
              <span className="text-[11px] font-bold text-gray-700">Kamera</span>
              <span className="text-[9px] text-gray-400">Ambil foto langsung</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelected}
              />
            </label>

            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all text-center group">
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-[11px] font-bold text-gray-700">Galeri / File</span>
              <span className="text-[9px] text-gray-400">Pilih dari HP/PC</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />
            </label>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-9 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
            Batal
          </button>
          <button
            onClick={submit}
            disabled={uploading || processing || !file}
            className="flex-1 h-9 bg-orange-600 hover:bg-orange-700 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-all"
          >
            {uploading ? "Mengupload..." : "Upload & Kirim"}
          </button>
        </div>
      </div>
    </div>
  );
}