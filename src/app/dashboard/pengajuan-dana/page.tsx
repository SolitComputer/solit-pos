"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { EXPENSE_CATEGORIES } from "@/lib/cashflow";
import {
  FileText, Wallet, CheckCircle2, Landmark, Pin,
  Plus, Trash2, X, CheckCheck, RotateCcw, Banknote,
  ClipboardList, Clock, CircleDollarSign, Camera, Image as ImageIcon,
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
  realisasi_cashflow_id: string | null;
  realisasi_nominal: number | null;
  realisasi_by_id: string | null;
  realisasi_by_name: string | null;
  realisasi_at: string | null;
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
    slate: "bg-slate-100 text-slate-500",
    indigo: "bg-indigo-100 text-indigo-600",
    emerald: "bg-emerald-100 text-emerald-600",
    blue: "bg-blue-100 text-blue-600",
  };
  const valueColor = {
    slate: "text-slate-900",
    indigo: "text-indigo-700",
    emerald: "text-emerald-700",
    blue: "text-blue-700",
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

// ── Kompresi foto sebelum upload (sama seperti di halaman Cashflow) ──────────
async function compressImageFile(file: File, maxDimension = 1600, quality = 0.75): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName || "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PHOTO PICKER (sama seperti di halaman Cashflow)
 * ════════════════════════════════════════════════════════════════════════════ */
function PhotoPicker({ value, onChange }: { value: File | null; onChange: (f: File | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (f: File | null) => { onChange(f); setPreview(f ? URL.createObjectURL(f) : null); };
  const remove = () => {
    handleFile(null);
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-2">Foto Bukti <span className="text-slate-400 font-normal">(opsional)</span></label>
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          <img src={preview} alt="Preview" className="w-full max-h-48 object-cover" />
          <button type="button" onClick={remove} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[{ ref: cameraRef, icon: <Camera size={20} />, label: "Kamera" }, { ref: fileRef, icon: <ImageIcon size={20} />, label: "Galeri" }].map(({ ref, icon, label }) => (
            <button key={label} type="button" onClick={() => (ref as React.RefObject<HTMLInputElement>).current?.click()} className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600 transition">
              {icon}
              <span className="text-[11px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(ev) => handleFile(ev.target.files?.[0] ?? null)} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(ev) => handleFile(ev.target.files?.[0] ?? null)} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  REALISASI MODAL — isi realisasi setelah pengajuan dieksekusi, otomatis
 *  sinkron ke Cashflow (Uang Keluar) lewat /api/pengajuan-dana/[id]/realisasi
 * ════════════════════════════════════════════════════════════════════════════ */
function RealisasiModal({
  fundRequest, onClose, onSaved,
}: {
  fundRequest: FundRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const categories = Object.entries(EXPENSE_CATEGORIES);
  const [category, setCategory] = useState(categories[0]?.[0] ?? "");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState(fundRequest.purpose);
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "SALDO">("CASH");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<"idle" | "uploading" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const submit = async () => {
    const num = Number(nominal);
    if (!nominal || !Number.isFinite(num) || num <= 0) { setError("Nominal harus lebih dari 0"); return; }
    setSaving(true); setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        setUploadProgress("uploading");
        const compressed = await compressImageFile(photoFile);
        const fd = new FormData();
        fd.append("file", compressed);
        const upRes = await fetch("/api/cashflow/upload", { method: "POST", body: fd });
        const upJson = await upRes.json();
        if (!upJson.success) { setError(upJson.message || "Gagal upload foto"); setSaving(false); setUploadProgress("idle"); return; }
        photoUrl = upJson.url;
        setUploadProgress("done");
      }
      const res = await fetch(`/api/pengajuan-dana/${fundRequest.id}/realisasi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          nominal: num,
          keterangan: keterangan.trim() || fundRequest.purpose,
          tanggal,
          payment_method: paymentMethod,
          photo_url: photoUrl,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.message || "Gagal menyimpan realisasi"); return; }
      toast.success("Realisasi tersimpan & tersinkron ke Cashflow");
      onSaved();
      onClose();
    } catch { setError("Terjadi kesalahan koneksi"); }
    finally { setSaving(false); setUploadProgress("idle"); }
  };

  const inputCls = "w-full h-10 border border-slate-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition";
  const savingLabel = uploadProgress === "uploading" ? "Mengupload foto..." : saving ? "Menyimpan..." : "Simpan Realisasi";

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
        <div className="h-1 bg-gradient-to-r from-teal-400 to-emerald-500" />
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center"><Banknote size={16} /></div>
            <div>
              <p className="text-sm font-bold text-slate-900">Realisasi Pengajuan Dana</p>
              <p className="text-[11px] text-slate-400 line-clamp-1 max-w-[220px]">{fundRequest.purpose}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Metode Pembayaran <span className="text-red-500">*</span></label>
            <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
              {(["CASH", "SALDO"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setPaymentMethod(m)} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${paymentMethod === m ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"}`}>
                  {m === "CASH" ? <Banknote size={16} /> : <Landmark className="w-4 h-4" />} {m === "CASH" ? "Cash" : "Saldo"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {categories.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">Nominal <span className="text-red-500">*</span></label>
              <input type="number" min={0} value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} autoFocus />
              {nominal && Number(nominal) > 0 && <p className="text-[11px] text-teal-600 mt-1 font-mono font-semibold">{formatRupiah(Number(nominal))}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">Tanggal</label>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Keterangan</label>
            <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} className={`${inputCls.replace("h-10", "")} py-2 resize-none`} />
            <p className="text-[10px] text-slate-400 mt-1">Otomatis terisi dari Kebutuhan — boleh diubah.</p>
          </div>
          <PhotoPicker value={photoFile} onChange={setPhotoFile} />
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 bg-slate-50/60">
          <button onClick={onClose} disabled={saving} className="flex-1 h-10 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50">Batal</button>
          <button onClick={submit} disabled={saving} className="flex-1 h-10 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition disabled:opacity-60">{savingLabel}</button>
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
  const [realisasiTarget, setRealisasiTarget] = useState<FundRequest | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.user) {
          setUserId(d.user.id);
          setUserRoles(d.user.roles ?? [d.user.role].filter(Boolean));
        }
      })
      .catch(() => { });
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
  const canExecute = userId ? (meta.executorIds.includes(userId) || userRoles.includes("ADMIN")) : false;

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
      <style dangerouslySetInnerHTML={{
        __html: `
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
                    <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Realisasi</th>
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
                          <span className="font-extrabold text-slate-900 tabular-nums text-sm">{formatRupiah(row.amount)}</span>
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
                                className={`w-8 h-8 rounded-2xl flex items-center justify-center transition-all ${canApprove && !row.is_executed
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
                                onClick={() => canExecute && !row.realisasi_cashflow_id ? handleAction(row.id, "unexecute") : undefined}
                                disabled={busy || !canExecute || !!row.realisasi_cashflow_id}
                                title={row.realisasi_cashflow_id ? "Sudah direalisasi — tidak bisa dibatalkan" : canExecute ? "Batalkan eksekusi" : `Oleh ${row.executed_by_name}`}
                                className={`w-8 h-8 rounded-2xl flex items-center justify-center transition-all ${canExecute && !row.realisasi_cashflow_id
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
                              className={`w-8 h-8 rounded-2xl border-2 border-dashed flex items-center justify-center mx-auto transition-all disabled:opacity-30 disabled:cursor-not-allowed ${row.is_approved
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

                        {/* Realisasi */}
                        <td className="px-4 py-4 text-center">
                          {row.realisasi_cashflow_id ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <span
                                title={`Direalisasi oleh ${row.realisasi_by_name ?? "-"}${row.realisasi_at ? ` · ${formatDate(row.realisasi_at)}` : ""}`}
                                className="w-8 h-8 rounded-2xl bg-teal-100 text-teal-600 flex items-center justify-center"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </span>
                              <span className="text-[10px] text-slate-500 font-semibold max-w-[80px] truncate">{formatRupiah(row.realisasi_nominal ?? 0)}</span>
                              <span className="text-[9px] text-slate-400 max-w-[80px] truncate">{row.realisasi_by_name}</span>
                            </div>
                          ) : row.is_executed ? (
                            canExecute ? (
                              <button
                                onClick={() => setRealisasiTarget(row)}
                                title="Isi realisasi pengeluaran"
                                className="w-8 h-8 rounded-2xl border-2 border-dashed border-slate-200 hover:border-teal-400 hover:bg-teal-50 flex items-center justify-center mx-auto transition-all hover:scale-110 active:scale-90"
                              >
                                <Banknote className="w-4 h-4 text-slate-300 group-hover:text-teal-500" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-amber-500 font-semibold">Menunggu</span>
                            )
                          ) : (
                            <div className="w-8 h-8 rounded-2xl border-2 border-slate-100 bg-slate-50 mx-auto" title="Harus dieksekusi dulu" />
                          )}
                        </td>

                        <td className="px-4 py-4 text-center">
                          <span className="text-xs text-slate-500 font-medium whitespace-nowrap tabular-nums">{formatDate(row.created_at)}</span>
                        </td>

                        <td className="px-3 py-4">
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(row)}
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ animation: "pdBackdropIn 0.15s ease-out both" }}
        >
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100"
            style={{ animation: "pdModalIn 0.25s cubic-bezier(0.16,1,0.3,1) both" }}
          >
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Hapus Pengajuan?</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  Pengajuan <span className="font-bold text-slate-700">"{deleteTarget.purpose}"</span> sebesar{" "}
                  <span className="font-bold text-slate-700">{formatRupiah(deleteTarget.amount)}</span> akan dihapus permanen.
                </p>
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  const id = deleteTarget.id;
                  setDeleteTarget(null);
                  await handleDelete(id);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 active:bg-rose-700 rounded-full shadow-md shadow-rose-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <FormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      {realisasiTarget && (
        <RealisasiModal
          fundRequest={realisasiTarget}
          onClose={() => setRealisasiTarget(null)}
          onSaved={fetchData}
        />
      )}
    </DashboardLayout>
  );
}