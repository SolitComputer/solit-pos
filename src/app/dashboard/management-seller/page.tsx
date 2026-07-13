"use client";
// src/app/dashboard/management-seller/page.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasAnyRole } from "@/lib/permissions";

// ── Types ─────────────────────────────────────────────────────────────────────
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
  closed_by: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;

  // dari DB (migration baru)
  pic_user_id: string | null;
  last_followup_proof_url: string | null;

  // flag hasil kalkulasi server — SATU-SATUNYA sumber kebenaran untuk gating UI
  is_due: boolean;
  is_owner: boolean;
  can_followup: boolean;
  lock_reason: string | null;
}

interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  roles: UserRole[];
}

interface PicCandidate {
  user_id: string;
  name: string;
  role: string;
  roles: string[];
  is_active: boolean;
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

const PhoneIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.02 6.02l1.51-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M19 12H5M12 5l-7 7 7 7" />
  </svg>
);

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" aria-hidden="true"
    className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const Spinner = ({ dark = false }: { dark?: boolean }) => (
  <span
    className={`w-3.5 h-3.5 border-2 rounded-full animate-spin inline-block flex-shrink-0 ${dark ? "border-gray-300 border-t-gray-600" : "border-white/30 border-t-white"
      }`}
  />
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
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xs font-bold text-gray-800 leading-snug">{value}</p>
      {sub && <p className="text-[9px] text-gray-400 mt-0.5 font-mono truncate">{sub}</p>}
    </div>
  );
}

// ── Dropdown Checklist Akses PIC (Admin only) ────────────────────────────────
function PicAccessDropdown({
  pics,
  loading,
  error,
  savingId,
  onToggle,
  onRetry,
}: {
  pics: PicCandidate[];
  loading: boolean;
  error: string | null;
  savingId: string | null;
  onToggle: (userId: string, next: boolean) => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const groups = useMemo(
    () => [
      {
        label: "Kepala Marketing",
        items: pics.filter((p) => p.roles.includes("KEPALA_MARKETING")),
      },
      {
        label: "Crew Sales",
        items: pics.filter(
          (p) => p.roles.includes("CREW_SALES") && !p.roles.includes("KEPALA_MARKETING")
        ),
      },
    ],
    [pics]
  );

  const activeCount = pics.filter((p) => p.is_active).length;

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Atur siapa yang boleh follow-up"
        className={`h-9 px-3 inline-flex items-center gap-2 rounded-xl border text-xs font-bold transition-all active:scale-[0.98] ${error
          ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
      >
        <span>{error ? "⚠️" : "🔐"}</span>
        <span className="hidden sm:inline">Akses PIC</span>
        {!error && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gray-900 text-white text-[10px] font-black">
            {activeCount}
          </span>
        )}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-gray-200 shadow-2xl z-40 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-black text-gray-900">Izin Follow-up</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
              Centang siapa yang boleh melakukan follow-up. Hanya Admin yang bisa mengubah.
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto py-2">
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">Memuat…</div>
            ) : error ? (
              /* ✅ Error tampil eksplisit — tidak lagi "diam" */
              <div className="px-4 py-5 text-center">
                <p className="text-xs font-bold text-red-600 mb-1">Gagal memuat</p>
                <p className="text-[10px] text-gray-400 leading-relaxed mb-3">{error}</p>
                <button
                  onClick={onRetry}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
                >
                  Coba lagi
                </button>
              </div>
            ) : pics.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                Belum ada Crew Sales / Kepala Marketing
              </div>
            ) : (
              groups.map((g) =>
                g.items.length === 0 ? null : (
                  <div key={g.label} className="mb-1">
                    <p className="px-4 py-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                      {g.label}
                    </p>
                    {g.items.map((p) => {
                      const saving = savingId === p.user_id;
                      return (
                        <button
                          key={p.user_id}
                          onClick={() => onToggle(p.user_id, !p.is_active)}
                          disabled={saving}
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors disabled:opacity-50 text-left"
                        >
                          <span
                            className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${p.is_active
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white border-gray-300"
                              }`}
                          >
                            {saving ? (
                              <Spinner dark={!p.is_active} />
                            ) : p.is_active ? (
                              <CheckIcon />
                            ) : null}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-bold text-gray-800 truncate">
                              {p.name}
                            </span>
                            <span
                              className={`block text-[10px] ${p.is_active ? "text-emerald-600 font-semibold" : "text-gray-400"
                                }`}
                            >
                              {p.is_active ? "Boleh follow-up" : "Nonaktif"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tombol Chat WA — hanya PIC pemilik ───────────────────────────────────────
function WaChatButton({ f, fullWidth = false }: { f: Followup; fullWidth?: boolean }) {
  if (!f.is_owner) {
    return (
      <div
        title={f.lock_reason ?? `Hanya ${f.closed_by ?? "PIC"} yang bisa chat customer ini`}
        className={`h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed select-none flex-shrink-0 ${fullWidth ? "flex-1 text-xs font-semibold" : "w-9"
          }`}
      >
        <LockIcon />
        {fullWidth && <span>Chat WA (Terkunci)</span>}
      </div>
    );
  }

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

// ── Tombol Tandai Follow-up ───────────────────────────────────────────────────
function TandaiFuButton({
  f,
  processing,
  onFollowup,
}: {
  f: Followup;
  processing: boolean;
  onFollowup: (id: string) => void;
}) {
  const isUnowned = !f.pic_user_id;

  return (
    <button
      onClick={() => onFollowup(f.id)}
      disabled={processing}
      title={
        isUnowned
          ? "FU sekaligus klaim customer ini sebagai milikmu"
          : "Tandai sudah follow-up"
      }
      className={`flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-xl text-white text-xs font-bold transition-all duration-150 ${processing
        ? "bg-blue-400 opacity-70 cursor-not-allowed"
        : isUnowned
          ? "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]"
          : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
        }`}
    >
      {processing ? <Spinner /> : isUnowned ? <span>🙋</span> : <PhoneIcon />}
      {isUnowned ? "Klaim & FU" : "Follow-up"}
    </button>
  );
}

// ── Upload Bukti FU ───────────────────────────────────────────────────────────
function BuktiFuUploader({
  value,
  onChange,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Hanya file gambar (JPG, PNG, WEBP) yang diperbolehkan.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran file maksimal 5 MB.");
      return;
    }
    onChange(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        Bukti Follow-Up <span className="text-red-500">*</span>
      </p>

      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-blue-200 bg-blue-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Bukti FU" className="w-full max-h-48 object-contain" />
          <button
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-md"
            title="Hapus gambar"
          >
            <TrashIcon />
          </button>
          <div className="px-3 py-2 bg-white/80 backdrop-blur-sm border-t border-blue-100">
            <p className="text-[10px] font-bold text-blue-600 truncate">🖼️ {value?.name}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">
              {value ? (value.size / 1024).toFixed(0) + " KB" : ""}
            </p>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 group"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mx-auto mb-2.5 transition-colors text-gray-500">
            <UploadIcon />
          </div>
          <p className="text-xs font-bold text-gray-700 group-hover:text-blue-700 transition-colors">
            Upload Screenshot Bukti FU
          </p>
          <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
            Klik atau drag &amp; drop gambar ke sini
            <br />
            JPG, PNG, WEBP · Maks. 5 MB
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

// ── Confirm Followup Modal (2-step + bukti upload) ───────────────────────────
function ConfirmFollowupModal({
  followup,
  onConfirm,
  onCancel,
  processing,
}: {
  followup: Followup | null;
  onConfirm: (buktiFu: File) => void;
  onCancel: () => void;
  processing: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [buktiFu, setBuktiFu] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (followup) {
      setStep(1);
      setBuktiFu(null);
    }
  }, [followup]);

  // ✅ Object URL dibuat di effect (bukan di render) supaya tidak leak memory
  useEffect(() => {
    if (!buktiFu) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(buktiFu);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [buktiFu]);

  if (!followup) return null;

  const firstName = (followup.customer_name || "").split(" ")[0] || "Customer";
  const intervalDays = followup.seller_type === "PEDAGANG" ? "3" : "7";
  const canProceedStep1 = buktiFu !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-fu-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!processing ? onCancel : undefined}
      />

      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex h-1 bg-gray-100">
          <div
            className={`h-full bg-blue-600 transition-all duration-300 ${step === 1 ? "w-1/2" : "w-full"
              }`}
          />
        </div>

        <div className="px-5 pt-5 pb-5 max-h-[90vh] overflow-y-auto">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-4">
            Langkah {step} dari 2
          </p>

          {step === 1 ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-base flex-shrink-0">
                  {followup.customer_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2
                    id="confirm-fu-title"
                    className="text-sm font-black text-gray-900 leading-tight truncate"
                  >
                    {followup.customer_name}
                  </h2>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    {followup.customer_phone}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 mb-4">
                <p className="text-xs font-semibold text-blue-700 leading-relaxed">
                  Apakah kamu sudah melakukan follow-up ke{" "}
                  <span className="font-black">{firstName}</span>?
                </p>
                <p className="text-[11px] text-blue-500 mt-1.5 leading-relaxed">
                  Upload screenshot percakapan WA sebagai bukti bahwa FU sudah benar-benar
                  dilakukan.
                </p>
              </div>

              <div className="mb-5">
                <BuktiFuUploader value={buktiFu} onChange={setBuktiFu} />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  disabled={processing}
                  className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  Batal
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!canProceedStep1}
                  title={!canProceedStep1 ? "Upload bukti FU terlebih dahulu" : ""}
                  className={`flex-1 h-10 rounded-xl text-white text-sm font-bold transition-all inline-flex items-center justify-center gap-1.5 ${canProceedStep1
                    ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
                    : "bg-blue-200 cursor-not-allowed"
                    }`}
                >
                  Lanjut
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <h2 id="confirm-fu-title" className="text-sm font-black text-gray-900 mb-1">
                  Konfirmasi Final
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Pastikan semua info berikut sudah benar sebelum disimpan ke sistem.
                </p>
              </div>

              {buktiFu && previewUrl && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-emerald-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Bukti FU" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider leading-none mb-0.5">
                      Bukti FU
                    </p>
                    <p className="text-xs font-bold text-emerald-800 truncate">{buktiFu.name}</p>
                    <p className="text-[9px] text-emerald-500 mt-0.5">
                      {(buktiFu.size / 1024).toFixed(0)} KB · Siap diupload
                    </p>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                    <CheckIcon />
                  </div>
                </div>
              )}

              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-2.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Customer
                  </span>
                  <span className="text-xs font-black text-gray-800 truncate max-w-[160px]">
                    {followup.customer_name}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-2.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Tipe
                  </span>
                  <span className="text-xs font-black text-gray-800">
                    {followup.seller_type === "PEDAGANG" ? "🏷️ Pedagang" : "🙋 User"}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-2.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Jadwal baru
                  </span>
                  <span className="text-xs font-black text-blue-600">
                    +{intervalDays} hari dari sekarang
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-2.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Total FU
                  </span>
                  <span className="text-xs font-black text-gray-800">
                    {followup.followup_count + 1}× (setelah ini)
                  </span>
                </div>

                {followup.invoice_number && (
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-2.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Invoice
                    </span>
                    <span className="text-xs font-mono font-bold text-gray-700">
                      {followup.invoice_number}
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-5">
                <p className="text-xs font-black text-amber-800 leading-relaxed">
                  ⚠️ Apakah Anda yakin sudah Follow-Up (FU) ke customer ini?
                </p>
                <p className="text-[11px] text-amber-600 mt-1 leading-relaxed">
                  Data ini akan tersimpan permanen dan tidak bisa dibatalkan. Jadwal follow-up
                  berikutnya akan digeser <span className="font-bold">{intervalDays} hari</span> ke
                  depan.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  disabled={processing}
                  title="Kembali — ganti bukti FU"
                  className="h-10 w-10 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 active:scale-[0.98] transition-all flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                >
                  <BackIcon />
                </button>

                <button
                  onClick={() => buktiFu && onConfirm(buktiFu)}
                  disabled={processing || !buktiFu}
                  className={`flex-1 h-10 rounded-xl text-white text-sm font-bold transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2 ${processing ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                    }`}
                >
                  {processing ? <Spinner /> : <CheckIcon />}
                  {processing ? "Menyimpan..." : "Ya, Sudah FU — Simpan"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FollowupCard ──────────────────────────────────────────────────────────────
function FollowupCard({
  f,
  scope,
  processing,
  canManage,
  onFollowup,
  onArchive,
  onReactivate,
}: {
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
  const isDue = f.is_due && scope === "ACTIVE";

  return (
    <div
      className={`relative bg-white rounded-2xl border overflow-hidden flex flex-col transition-all duration-200 hover:shadow-md ${isDue ? "border-red-200 shadow-sm shadow-red-50" : "border-gray-200 shadow-sm"
        }`}
    >
      {isDue && <div className="absolute top-0 left-0 right-0 h-[3px] bg-red-400 rounded-t-2xl" />}

      {/* ── Card Header ── */}
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
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
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

      {/* ── Card Body ── */}
      <div className="px-4 py-3.5 flex-1 space-y-3">
        {/* PIC Follow-up */}
        {f.pic_user_id ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-violet-50 border border-violet-200 px-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center text-xs font-black flex-shrink-0">
              {(f.closed_by ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest leading-none mb-0.5">
                PIC Follow-up
              </p>
              <p className="text-xs font-black text-violet-800 leading-tight truncate">
                {f.closed_by}
              </p>
            </div>
            {f.is_owner && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-600 text-white flex-shrink-0">
                Kamu
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 border-dashed px-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-base flex-shrink-0">
              🙋
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest leading-none mb-0.5">
                PIC Follow-up
              </p>
              <p className="text-xs font-bold text-emerald-700 leading-tight">
                Belum ada — kamu bisa klaim!
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <InfoCell
            label="Beli terakhir"
            value={fmtDate(f.last_purchase_at)}
            sub={f.invoice_number ?? undefined}
          />
          <InfoCell label="Jadwal berikutnya" value={fmtDate(f.next_followup_at)} />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <StatPill>🛒 {f.purchase_count}× beli</StatPill>
          <StatPill>📞 {f.followup_count}× FU</StatPill>
          {f.last_followup_by && <StatPill>👤 FU terakhir: {f.last_followup_by}</StatPill>}
          {f.last_followup_proof_url && (
            <a
              href={f.last_followup_proof_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 hover:bg-blue-100 transition"
            >
              🖼️ Lihat bukti
            </a>
          )}
        </div>
      </div>

      {/* ── Card Actions ── */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center gap-2">
        {scope === "ACTIVE" ? (
          <>
            <WaChatButton f={f} />

            {f.can_followup ? (
              f.is_due ? (
                <TandaiFuButton f={f} processing={processing} onFollowup={onFollowup} />
              ) : (
                <button
                  disabled
                  title={`Sudah FU oleh ${f.last_followup_by ?? f.closed_by ?? "PIC"}. Jadwal berikutnya ${fmtDate(f.next_followup_at)}`}
                  className="flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-white text-gray-400 text-xs font-semibold border border-gray-200 cursor-not-allowed select-none"
                >
                  <CheckIcon />
                  <span className="truncate">
                    Sudah FU · {f.last_followup_by ?? f.closed_by ?? "—"} · {diff <= 0 ? "hari ini" : `${diff}h lagi`}
                  </span>
                </button>
              )
            ) : (
              <div
                title={f.lock_reason ?? "Kamu tidak berwenang follow-up customer ini"}
                className="flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 text-gray-400 text-xs font-semibold border border-gray-200 cursor-not-allowed select-none"
              >
                <LockIcon />
                FU Terkunci
              </div>
            )}

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
    </div >
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
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("USER");
  const [scope, setScope] = useState<Scope>("ACTIVE");
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmFu, setConfirmFu] = useState<Followup | null>(null);

  // ── PIC checklist state ──
  const [pics, setPics] = useState<PicCandidate[]>([]);
  const [picsLoading, setPicsLoading] = useState(false);
  const [picsError, setPicsError] = useState<string | null>(null);
  const [savingPicId, setSavingPicId] = useState<string | null>(null);

  // ── Auth ──
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((r) => {
        if (!r.user) return;
        const roles: UserRole[] =
          Array.isArray(r.user.roles) && r.user.roles.length > 0 ? r.user.roles : [r.user.role];
        setAuthUser({
          id: r.user.id,
          name: r.user.name ?? r.user.username ?? "",
          role: r.user.role,
          roles,
        });
      })
      .catch(() => setAuthUser(null));
  }, []);

  const userRoles = useMemo<UserRole[]>(() => authUser?.roles ?? [], [authUser]);

  const canView = hasAnyRole(userRoles, PERMISSIONS.VIEW_SELLER_FOLLOWUP);
  const canManage = hasAnyRole(userRoles, PERMISSIONS.MANAGE_SELLER_FOLLOWUP);

  // ✅ Visibilitas tombol checklist ditentukan dari ROLE user (client-side),
  //    bukan dari hasil API. Enforcement asli tetap di server (PUT /api/seller-pics).
  const canManagePic = hasAnyRole(userRoles, PERMISSIONS.MANAGE_SELLER_PIC);

  // ── Load followups ──
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
    if (authUser) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, authUser]);

  // ── Load PIC candidates (untuk checklist & dropdown assign) ──
  const loadPics = async () => {
    setPicsLoading(true);
    setPicsError(null);
    try {
      const res = await fetch("/api/seller-pics");
      const result = await res.json();
      if (!result.success) {
        setPics([]);
        setPicsError(result.message ?? "Gagal memuat daftar PIC");
        return;
      }
      setPics(result.data as PicCandidate[]);
    } catch {
      setPics([]);
      setPicsError("Gagal terhubung ke server");
    } finally {
      setPicsLoading(false);
    }
  };

  // Load untuk Admin (checklist) maupun manager (dropdown assign)
  useEffect(() => {
    if (canManage || canManagePic) loadPics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, canManagePic]);

  const activePics = useMemo(() => pics.filter((p) => p.is_active), [pics]);

  // ── Toggle checklist akses PIC (Admin) — optimistic ──
  const togglePic = async (userId: string, next: boolean) => {
    setSavingPicId(userId);
    setPics((prev) => prev.map((p) => (p.user_id === userId ? { ...p, is_active: next } : p)));
    try {
      const res = await fetch("/api/seller-pics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, is_active: next }),
      });
      const result = await res.json();
      if (!result.success) {
        alert(result.message ?? "Gagal mengubah akses PIC");
        setPics((prev) =>
          prev.map((p) => (p.user_id === userId ? { ...p, is_active: !next } : p))
        );
        return;
      }
      await loadData(true); // refresh flag can_followup di kartu
    } catch {
      setPics((prev) => prev.map((p) => (p.user_id === userId ? { ...p, is_active: !next } : p)));
      alert("Terjadi kesalahan koneksi");
    } finally {
      setSavingPicId(null);
    }
  };

  // ── PATCH runner ──
  const runAction = async (id: string, body: Record<string, unknown>, buktiFuFile?: File) => {
    setProcessingId(id);
    try {
      let res: Response;

      if (buktiFuFile) {
        const fd = new FormData();
        Object.entries(body).forEach(([k, v]) => fd.append(k, String(v)));
        fd.append("bukti_fu", buktiFuFile, buktiFuFile.name);
        res = await fetch(`/api/seller-followups/${id}`, { method: "PATCH", body: fd });
      } else {
        res = await fetch(`/api/seller-followups/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

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

  const onFollowup = (id: string) => {
    const target = items.find((i) => i.id === id) ?? null;
    setConfirmFu(target);
  };

  const handleConfirmFollowup = async (buktiFu: File) => {
    if (!confirmFu) return;
    await runAction(confirmFu.id, { action: "followup" }, buktiFu);
    setConfirmFu(null);
  };

  const onArchive = (id: string) => runAction(id, { action: "archive" });
  const onReactivate = (id: string) => runAction(id, { action: "reactivate" });

  // ── Derived ──
  const userItems = useMemo(() => items.filter((i) => i.seller_type === "USER"), [items]);
  const pedagangItems = useMemo(() => items.filter((i) => i.seller_type === "PEDAGANG"), [items]);
  const userDue = useMemo(() => userItems.filter((i) => i.is_due).length, [userItems]);
  const pedagangDue = useMemo(() => pedagangItems.filter((i) => i.is_due).length, [pedagangItems]);

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

  const dueCount = visible.filter((i) => i.is_due).length;

  // ── Akses ditolak ──
  if (authUser && !canView) {
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
            <span className="font-semibold text-gray-600">Admin, Kepala Marketing, Kepala Sales</span>{" "}
            &amp; Crew Sales.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ── Header ── */}
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

          <div className="flex items-center gap-2 flex-shrink-0">
            {canManagePic && (
              <PicAccessDropdown
                pics={pics}
                loading={picsLoading}
                error={picsError}
                savingId={savingPicId}
                onToggle={togglePic}
                onRetry={loadPics}
              />
            )}

            <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
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
        </div>

        {/* ── Summary Bar ── */}
        {!loading && <SummaryBar items={items} scope={scope} />}

        {/* ── Tabs ── */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: "USER" as Tab, label: "User", icon: "🙋", count: userItems.length, due: userDue },
              {
                key: "PEDAGANG" as Tab,
                label: "Pedagang",
                icon: "🏷️",
                count: pedagangItems.length,
                due: pedagangDue,
              },
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
                    <p
                      className={`text-sm font-bold leading-tight ${isActive ? "text-white" : "text-gray-900"
                        }`}
                    >
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

        {/* ── Search ── */}
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" aria-hidden="true"
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

        {/* ── Content ── */}
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
                  onFollowup={onFollowup}
                  onArchive={onArchive}
                  onReactivate={onReactivate}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmFollowupModal
        followup={confirmFu}
        onConfirm={handleConfirmFollowup}
        onCancel={() => setConfirmFu(null)}
        processing={processingId === confirmFu?.id}
      />
    </DashboardLayout>
  );
}