"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
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
  users?: { id: string; name: string; role: string } | null;
  approver?: { id: string; name: string } | null;
  auditor?: { id: string; name: string } | null;
}

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  BLUE:  { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    label: "Belum Terhitung Lembur" },
  AMBER: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   label: "Sudah di-ACC — Menunggu Audit" },
  GREEN: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Sudah Diaudit" },
};

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

export function OvertimeTable({
  rows, loading, canApprove, canAudit, currentUserId, onRefresh,
}: {
  rows: OvertimeTableRow[];
  loading: boolean;
  canApprove: (targetRole: string) => boolean;
  canAudit: boolean;
  currentUserId?: string;
  onRefresh: () => void;
}) {
  const [detailModalRow, setDetailModalRow] = useState<OvertimeTableRow | null>(null);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
                    <p className="text-xs text-gray-700 truncate" title={o.work_description ?? ""}>{o.work_description || "— belum diisi —"}</p>
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
                      <button onClick={() => setPhotoModalUrl(o.proof_photo_url)} className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 inline-block">
                        <img src={o.proof_photo_url} alt="bukti" className="w-full h-full object-cover" />
                      </button>
                    ) : <span className="text-gray-300"><Camera size={16} className="inline" /></span>}
                  </td>
                  <td className="px-4 py-3">{o.approver ? <span className="text-xs text-gray-700 font-semibold">{o.approver.name}</span> : <span className="text-[11px] text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">{o.auditor ? <span className="text-xs text-gray-700 font-semibold">{o.auditor.name}</span> : <span className="text-[11px] text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {canFillDetail && <button onClick={() => setDetailModalRow(o)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">Isi Detail</button>}
                      {canAccThis && <button disabled={isBusy} onClick={() => runAction(o.id, { action: "APPROVE" })} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50">{isBusy ? "..." : "ACC"}</button>}
                      {canUploadProof && <button onClick={() => setDetailModalRow(o)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100">Upload Bukti</button>}
                      {canAuditThis && (
                        <button disabled={isBusy} onClick={() => { if (confirm(`Audit lemburan ${o.users?.name}? Nominal akan dihitung dan dikunci.`)) runAction(o.id, { action: "AUDIT", decision: "APPROVE" }); }} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50">{isBusy ? "..." : "Audit"}</button>
                      )}
                      {!canFillDetail && !canAccThis && !canUploadProof && !canAuditThis && <span className="text-[10px] text-gray-300">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {photoModalUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setPhotoModalUrl(null)}>
          <img src={photoModalUrl} alt="Bukti lembur" className="max-w-full max-h-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      {detailModalRow && detailModalRow.status === "PENDING" && <OvertimeQuickDetailForm row={detailModalRow} onClose={() => setDetailModalRow(null)} onSaved={onRefresh} />}
      {detailModalRow && detailModalRow.status === "NEED_PROOF" && <OvertimeProofUploadForm row={detailModalRow} onClose={() => setDetailModalRow(null)} onSaved={onRefresh} />}
    </div>
  );
}

function OvertimeQuickDetailForm({ row, onClose, onSaved }: { row: OvertimeTableRow; onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<OvertimeCategory | "">((row.category as OvertimeCategory) || "");
  const [desc, setDesc] = useState(row.work_description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!category) { setError("Kategori wajib dipilih."); return; }
    if (!desc.trim()) { setError("Keterangan wajib diisi."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/attendance/overtime", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, action: "SUBMIT_DETAIL", category, work_description: desc.trim() }),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) { setError(d.message); return; }
    onSaved(); onClose();
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
  const [error, setError] = useState("");

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
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3.5">
        <p className="font-bold text-sm text-gray-800">Upload Bukti Lembur</p>
        <p className="text-[11px] text-gray-400">Wajib sebelum lemburmu bisa diaudit dan mendapat nominal (poin 6).</p>
        {error && <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}
        {preview ? (
          <img src={preview} alt="preview" className="w-full h-40 object-cover rounded-xl border border-gray-100" />
        ) : (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-6 cursor-pointer hover:border-violet-300">
            <Camera size={18} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-600">Pilih Foto</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return;
              setFile(f); setPreview(URL.createObjectURL(f));
            }} />
          </label>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">Batal</button>
          <button onClick={submit} disabled={uploading || !file} className="flex-1 h-9 bg-orange-600 rounded-xl text-xs font-bold text-white disabled:opacity-50">{uploading ? "Mengupload..." : "Upload & Kirim"}</button>
        </div>
      </div>
    </div>
  );
}