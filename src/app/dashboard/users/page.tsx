"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { OnlineUsersPanel } from "@/components/layout/OnlineUsersPanel";
import { getCurrentUserClient } from "@/lib/auth-client";
import { useChatContext } from "@/contexts/ChatContext";
import { NotificationToggle } from "@/components/ui/NotificationToggle";
import RoleAccessManager from "@/components/users/RoleAccessManager";
import {
  Crown, Code2, Handshake, BarChart3, Target, Wrench, Briefcase, DollarSign,
  Package, Truck, Smartphone, Sparkles, Factory, Building2, FileText, MapPin,
  Settings, GraduationCap, Headset, ShoppingCart, Zap, User, AlertTriangle,
  Sunrise, Sunset, CheckCircle2, DoorOpen, Trash2, KeyRound, Lightbulb, Check,
  ChevronUp, Save, ScanFace, Inbox, Cake, PartyPopper, Users, Lock, Fingerprint,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  phone_number: string | null;
  email: string | null;
  role: string;
  roles: string[];
  shift: "PAGI" | "SORE";
  password_set: boolean;
  face_enrolled_at: string | null;
  face_embedding: boolean;
  force_logout_at: string | null;
  biometric_enabled: boolean;
  biometric_enrolled: boolean;
  birth_date: string | null;
  profile_photo_url: string | null;
  bio: string | null;
  status_note: string | null;
  song_title: string | null;
  song_artist: string | null;
  song_artwork_url: string | null;
}

interface CustomRoleRow {
  key: string;
  label: string;
  icon: string;
  badge_bg: string;
  badge_text: string;
  badge_border: string;
  is_pkl: boolean;
}

const ALL_ROLES = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_ZENITH",
  "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "CREW_SALES", "SOTECH", "ACCOUNTING", "PURCHASING",
  "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
  "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
  "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE",
  "PKL_PENGELOLA_BARANG",
  "CUSTOMER_SERVICE",
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
  KEPALA_SALES: "Kepala Sales", KEPALA_ZENITH: "Kepala Zenith",
  KEPALA_MARKETING: "Kepala Marketing", KEPALA_TEKNISI: "Kepala Teknisi",
  CREW_SALES: "Crew Sales", SOTECH: "Sotech", ACCOUNTING: "Accounting",
  PENGELOLA_BARANG: "Pengelola Barang", KEPALA_PENGELOLA_BARANG: "Kepala Pengelola Barang",
  TEKNISI: "Teknisi", PENGANTARAN: "Pengantaran",
  MARKETING: "Marketing", KEBERSIHAN: "Kebersihan",
  PENYEDIA_BARANG: "Penyedia Barang", KEPALA_PENYEDIA_BARANG: "Kepala Penyedia Barang",
  KONTEN: "Konten", KEPALA_ONPOINT: "Kepala Onpoint", ONPOINT: "Onpoint",
  KEPALA_SOTECH: "Kepala Sotech",
  PKL: "PKL", PKL_MARKETING: "PKL Marketing", PKL_SALES: "PKL Sales",
  PKL_PENYEDIA_BARANG: "PKL Penyedia Barang", PKL_SOTECH: "PKL Sotech",
  PKL_ONPOINT: "PKL Onpoint", PKL_TEKNISI: "PKL Teknisi", PKL_KONTEN: "PKL Content Creator",
  PKL_PENGANTARAN: "PKL Pengantaran",
  CUSTOMER_SERVICE: "Customer Service", PKL_CUSTOMER_SERVICE: "PKL Customer Service",
  PKL_PENGELOLA_BARANG: "PKL Pengelola Barang",
  PURCHASING: "Purchasing",
};

const RI = "w-3.5 h-3.5";
const ROLE_ICON: Record<string, React.ReactNode> = {
  ADMIN: <Crown className={RI} />, PROGRAMMER: <Code2 className={RI} />, ASISTEN_CEO: <Handshake className={RI} />,
  KEPALA_SALES: <BarChart3 className={RI} />, KEPALA_MARKETING: <Target className={RI} />, KEPALA_TEKNISI: <Wrench className={RI} />,
  CREW_SALES: <Briefcase className={RI} />, SOTECH: <Wrench className={RI} />, ACCOUNTING: <DollarSign className={RI} />,
  PENGELOLA_BARANG: <Package className={RI} />, KEPALA_PENGELOLA_BARANG: <Package className={RI} />, TEKNISI: <Wrench className={RI} />, PENGANTARAN: <Truck className={RI} />,
  MARKETING: <Smartphone className={RI} />, KEBERSIHAN: <Sparkles className={RI} />,
  PENYEDIA_BARANG: <Factory className={RI} />, KEPALA_PENYEDIA_BARANG: <Building2 className={RI} />, KONTEN: <FileText className={RI} />,
  KEPALA_ONPOINT: <Target className={RI} />, ONPOINT: <MapPin className={RI} />, KEPALA_SOTECH: <Settings className={RI} />,
  PKL: <GraduationCap className={RI} />, PKL_MARKETING: <GraduationCap className={RI} />, PKL_SALES: <GraduationCap className={RI} />,
  PKL_PENYEDIA_BARANG: <GraduationCap className={RI} />, PKL_SOTECH: <GraduationCap className={RI} />,
  PKL_ONPOINT: <GraduationCap className={RI} />, PKL_TEKNISI: <GraduationCap className={RI} />, PKL_KONTEN: <GraduationCap className={RI} />, PKL_PENGANTARAN: <GraduationCap className={RI} />,
  CUSTOMER_SERVICE: <Headset className={RI} />, PKL_CUSTOMER_SERVICE: <GraduationCap className={RI} />,
  PKL_PENGELOLA_BARANG: <GraduationCap className={RI} />, PURCHASING: <ShoppingCart className={RI} />, KEPALA_ZENITH: <Zap className={RI} />,
};

const PKL_BADGE = { bg: "#fefce8", text: "#854d0e", border: "#fde68a" };

const ROLE_BADGE_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  ADMIN: { bg: "#f3f0ff", text: "#6d28d9", border: "#ddd6fe" },
  PROGRAMMER: { bg: "#eef2ff", text: "#4338ca", border: "#c7d2fe" },
  ASISTEN_CEO: { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
  KEPALA_SALES: { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0" },
  KEPALA_MARKETING: { bg: "#fff1f2", text: "#be123c", border: "#fecdd3" },
  KEPALA_TEKNISI: { bg: "#fff1f2", text: "#b91c1c", border: "#fecaca" },
  CREW_SALES: { bg: "#f0f9ff", text: "#0369a1", border: "#bae6fd" },
  SOTECH: { bg: "#f7fee7", text: "#3f6212", border: "#d9f99d" },
  ACCOUNTING: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  PENGELOLA_BARANG: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  TEKNISI: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  PENGANTARAN: { bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4" },
  MARKETING: { bg: "#fdf2f8", text: "#9d174d", border: "#fbcfe8" },
  KEBERSIHAN: { bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc" },
  PENYEDIA_BARANG: { bg: "#fefce8", text: "#854d0e", border: "#fef08a" },
  KEPALA_PENYEDIA_BARANG: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  KONTEN: { bg: "#fdf4ff", text: "#86198f", border: "#f0abfc" },
  KEPALA_ONPOINT: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  ONPOINT: { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0" },
  KEPALA_SOTECH: { bg: "#f7fee7", text: "#3f6212", border: "#d9f99d" },
  PKL: { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
  PKL_MARKETING: PKL_BADGE, PKL_SALES: PKL_BADGE,
  PKL_PENYEDIA_BARANG: PKL_BADGE, PKL_SOTECH: PKL_BADGE,
  PKL_ONPOINT: PKL_BADGE, PKL_TEKNISI: PKL_BADGE, PKL_KONTEN: PKL_BADGE, PKL_PENGANTARAN: PKL_BADGE,
  CUSTOMER_SERVICE: { bg: "#f0f9ff", text: "#0369a1", border: "#bae6fd" },
  KEPALA_PENGELOLA_BARANG: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  PKL_CUSTOMER_SERVICE: PKL_BADGE,
  PKL_PENGELOLA_BARANG: PKL_BADGE,
  PURCHASING: { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
  KEPALA_ZENITH: { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
};

const FULL_ACCESS_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"]);
const ROLE_MANAGER_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);
const USER_ACTION_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);

const KEPALA_ROLES = new Set([
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI", "KEPALA_ZENITH",
  "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  "KEPALA_PENGELOLA_BARANG",
]);
const PKL_ROLE_SET = new Set([
  "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  "PKL_PENGANTARAN",
  "PKL_CUSTOMER_SERVICE",
  "PKL_PENGELOLA_BARANG",
]);
function isPKLRole(role: string) { return PKL_ROLE_SET.has(role); }

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

const ROLE_AVATAR_COLOR: Record<string, string> = {
  ADMIN: "#7c3aed", PROGRAMMER: "#4f46e5", ASISTEN_CEO: "#9333ea",
  KEPALA_SALES: "#059669", KEPALA_MARKETING: "#e11d48", KEPALA_TEKNISI: "#dc2626",
  CREW_SALES: "#0284c7", SOTECH: "#65a30d", ACCOUNTING: "#d97706",
  PENGELOLA_BARANG: "#2563eb", KEPALA_PENGELOLA_BARANG: "#1d4ed8", TEKNISI: "#ea580c",
  PENGANTARAN: "#0d9488", KEPALA_ZENITH: "#7c3aed",
  MARKETING: "#db2777", KEBERSIHAN: "#0891b2",
  PENYEDIA_BARANG: "#ca8a04", KEPALA_PENYEDIA_BARANG: "#c2410c",
  KONTEN: "#a21caf", KEPALA_ONPOINT: "#16a34a", ONPOINT: "#15803d",
  KEPALA_SOTECH: "#4d7c0f",
  PKL: "#475569", PKL_MARKETING: "#b45309", PKL_SALES: "#b45309",
  PKL_PENYEDIA_BARANG: "#b45309", PKL_SOTECH: "#b45309",
  PKL_ONPOINT: "#b45309", PKL_TEKNISI: "#b45309", PKL_KONTEN: "#b45309", PKL_PENGANTARAN: "#b45309",
  CUSTOMER_SERVICE: "#0369a1", PKL_CUSTOMER_SERVICE: "#b45309",
  PKL_PENGELOLA_BARANG: "#b45309", PURCHASING: "#9333ea",
};
function getAvatarColor(role: string) {
  return ROLE_AVATAR_COLOR[role] ?? "#6b7280";
}

function isBirthdayToday(birthDate: string | null): boolean {
  if (!birthDate) return false;
  const today = new Date();
  const bd = new Date(birthDate + "T00:00:00");
  return bd.getDate() === today.getDate() && bd.getMonth() === today.getMonth();
}

function formatBirthDate(birthDate: string | null): string {
  if (!birthDate) return "-";
  const d = new Date(birthDate + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function getAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const bd = new Date(birthDate + "T00:00:00");
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
  return (
    <div
      className={`fixed top-4 right-4 left-4 sm:left-auto sm:top-5 sm:right-5 z-[9999] px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold flex items-center gap-3 animate-slideIn ${type === "ok" ? "bg-white text-slate-700 border border-slate-100" : "bg-white text-red-600 border border-red-100"
        }`}
      style={{ boxShadow: type === "ok" ? "0 8px 32px rgba(0,0,0,0.10)" : "0 8px 32px rgba(220,38,38,0.12)" }}
    >
      {type === "ok"
        ? <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        : <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </div>
      }
      <span className="truncate">{msg}</span>
    </div>
  );
}

// ── Modal Shell ───────────────────────────────────────────────────────────────
function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn max-h-[92vh] sm:max-h-[90vh] flex flex-col"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.18)" }}>
        <div className="flex justify-center pt-3 pb-0 sm:hidden flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, icon, onClose }: {
  title: string; subtitle: string; icon: React.ReactNode; onClose: () => void;
}) {
  return (
    <div className="relative px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between overflow-hidden flex-shrink-0"
      style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(ellipse at 80% 50%, rgba(99,102,241,0.18) 0%, transparent 60%)" }} />
      <div className="flex items-center gap-3 z-10 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)" }}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white text-sm tracking-tight truncate">{title}</p>
          <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.45)" }}>{subtitle}</p>
        </div>
      </div>
      <button onClick={onClose}
        className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:scale-110 z-10 flex-shrink-0 ml-2"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6 40%, #ec4899 80%, transparent)" }} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10.5px] font-bold mb-1.5 block uppercase tracking-widest" style={{ color: "#94a3b8" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full h-11 sm:h-10 border rounded-xl px-3.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-violet-400/30"
      style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#1e293b" }}
    />
  );
}

// ── CreateUserModal ───────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [roles, setRoles] = useState<string[]>(["CREW_SALES"]);
  const [shift, setShift] = useState<"PAGI" | "SORE">("PAGI");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    if (!name.trim() || !phone.trim()) { setError("Nama dan nomor WA wajib diisi"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone_number: phone.trim(), roles, shift, birth_date: birthDate || null }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onCreated(); onClose();
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        title="Tambah User Baru"
        subtitle="Admin membuat akun, user set password sendiri"
        onClose={onClose}
        icon={
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        }
      />
      <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
        {error && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-xs font-semibold"
            style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </div>
        )}
        <Field label="Nama Lengkap">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="contoh: Budi Santoso" />
        </Field>
        <Field label="Tanggal Lahir">
          <Input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
        </Field>
        <Field label="Nomor WhatsApp">
          <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08123456789" />
          <p className="text-[10px] mt-1.5" style={{ color: "#94a3b8" }}>Digunakan sebagai username login</p>
        </Field>
        <Field label="Role (bisa pilih lebih dari 1)">
          <MultiRoleSelect values={roles} onChange={setRoles} />
        </Field>
        <Field label="Shift Kerja">
          <div className="flex gap-2">
            {(["PAGI", "SORE"] as const).map(s => (
              <button key={s} type="button" onClick={() => setShift(s)}
                className="flex-1 h-11 sm:h-10 rounded-xl text-xs font-bold border transition-all active:scale-95"
                style={shift === s
                  ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff", border: "1px solid transparent", boxShadow: "0 4px 12px rgba(15,12,41,0.25)" }
                  : { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
                {s === "PAGI"
                  ? <span className="inline-flex items-center gap-1.5"><Sunrise className="w-3.5 h-3.5" /> Pagi</span>
                  : <span className="inline-flex items-center gap-1.5"><Sunset className="w-3.5 h-3.5" /> Sore</span>}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-4 flex gap-2.5 flex-shrink-0" style={{ borderTop: "1px solid #f1f5f9" }}>
        <button onClick={onClose}
          className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-semibold transition-all hover:bg-slate-100 active:scale-95"
          style={{ background: "#f1f5f9", color: "#64748b" }}>
          Batal
        </button>
        <button onClick={save} disabled={saving}
          className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.3)" }}>
          {saving
            ? <><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />Membuat...</>
            : <><CheckCircle2 className="w-4 h-4" /> Buat Akun</>}
        </button>
      </div>
    </ModalShell>
  );
}

// ── MultiRoleSelect ───────────────────────────────────────────────────────────
// FIX: fetch role custom dari /api/admin/roles supaya muncul di dropdown.
function MultiRoleSelect({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [customRoles, setCustomRoles] = useState<CustomRoleRow[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/roles")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        if (data.success) setCustomRoles(data.roles ?? []);
      })
      .catch(() => { })
      .finally(() => {
        if (alive) setLoadingCustom(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const customLookup = useMemo(() => {
    const map = new Map<string, CustomRoleRow>();
    for (const r of customRoles) map.set(r.key, r);
    return map;
  }, [customRoles]);

  const getLabel = (role: string) => customLookup.get(role)?.label ?? ROLE_LABEL[role] ?? role;
  const getIcon = (role: string) => customLookup.get(role)?.icon ?? ROLE_ICON[role] ?? <User className={RI} />;
  const getBadge = (role: string) => {
    const custom = customLookup.get(role);
    if (custom) return { bg: custom.badge_bg, text: custom.badge_text, border: custom.badge_border };
    return ROLE_BADGE_STYLE[role] ?? { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };
  };

  const ALL_ROLE_GROUPS = useMemo(() => {
    const groups = [
      { label: "Akses Penuh", roles: ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] },
      { label: "Management", roles: ["KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING", "KEPALA_TEKNISI", "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH", "KEPALA_PENGELOLA_BARANG"] },
      {
        label: "Operasional",
        roles: [
          "CREW_SALES", "SOTECH", "ACCOUNTING", "PURCHASING",
          "PENGELOLA_BARANG", "TEKNISI", "PENGANTARAN",
          "MARKETING", "KEBERSIHAN", "CUSTOMER_SERVICE"
        ]
      },
      { label: "Penyedia & Konten", roles: ["PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN"] },
      { label: "Onpoint & Sotech", roles: ["KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH"] },
      {
        label: "Magang (PKL)", roles: [
          "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
          "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
          "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
        ]
      },
    ];
    if (customRoles.length > 0) {
      groups.push({ label: "Role Custom", roles: customRoles.map((r) => r.key) });
    }
    return groups;
  }, [customRoles]);

  const toggle = (role: string) => {
    if (values.includes(role)) {
      if (values.length === 1) return;
      onChange(values.filter(r => r !== role));
    } else {
      onChange([...values, role]);
    }
  };

  const setPrimary = (role: string) => {
    if (!values.includes(role)) return;
    onChange([role, ...values.filter(r => r !== role)]);
  };

  return (
    <div className="space-y-3">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl min-h-[40px]"
          style={{ background: "#f5f7ff", border: "1px solid #e8ecf5" }}>
          {values.map((role, idx) => {
            const badge = getBadge(role);
            const isPrimary = idx === 0;
            return (
              <div key={role}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}>
                {isPrimary && (
                  <span className="text-[8px] font-black px-1 py-0.5 rounded mr-0.5"
                    style={{ background: badge.text, color: badge.bg }}>
                    UTAMA
                  </span>
                )}
                <span>{getIcon(role)} {getLabel(role)}</span>
                {!isPrimary && (
                  <button
                    type="button"
                    onClick={() => setPrimary(role)}
                    title="Jadikan role utama"
                    className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity text-[9px] font-black"
                  >
                    <ChevronUp className="w-2.5 h-2.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggle(role)}
                  className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="max-h-48 overflow-y-auto space-y-2 pr-0.5">
        {ALL_ROLE_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1"
              style={{ color: "#94a3b8" }}>
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1">
              {group.roles.map(role => {
                const isSelected = values.includes(role);
                const badge = getBadge(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggle(role)}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 border"
                    style={isSelected
                      ? { background: badge.bg, color: badge.text, borderColor: badge.border, boxShadow: `0 0 0 1.5px ${badge.border}` }
                      : { background: "#f8fafc", color: "#94a3b8", borderColor: "#e2e8f0" }
                    }
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 inline mr-0.5" />}
                    {getIcon(role)} {getLabel(role)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {loadingCustom && (
          <p className="text-[9px] text-slate-300 italic">Memuat role custom...</p>
        )}
      </div>

      {values.some(r => FULL_ACCESS_ROLES.has(r)) && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10.5px] font-semibold"
          style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#6d28d9" }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Salah satu role memiliki akses penuh ke semua fitur
        </div>
      )}
    </div>
  );
}

// ── EditUserModal ─────────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone_number ?? "");
  const [birthDate, setBirthDate] = useState(user.birth_date ?? "");
  const [roles, setRoles] = useState<string[]>(
    Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : [user.role]
  );
  const [shift, setShift] = useState<"PAGI" | "SORE">(user.shift ?? "PAGI");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, name, phone_number: phone, roles, shift, birth_date: birthDate || null }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onSaved(); onClose();
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        title="Edit User"
        subtitle={user.name}
        onClose={onClose}
        icon={
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
            style={{ background: `${getAvatarColor(user.role)}cc` }}>
            {getInitials(user.name)}
          </div>
        }
      />
      <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
        {error && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-xs font-semibold"
            style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </div>
        )}
        <Field label="Nama"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Tanggal Lahir">
          <Input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
        </Field>
        <Field label="Nomor WhatsApp"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        <Field label="Role (bisa pilih lebih dari 1)">
          <MultiRoleSelect values={roles} onChange={setRoles} />
        </Field>
        <Field label="Shift">
          <div className="flex gap-2">
            {(["PAGI", "SORE"] as const).map(s => (
              <button key={s} type="button" onClick={() => setShift(s)}
                className="flex-1 h-11 sm:h-10 rounded-xl text-xs font-bold border transition-all active:scale-95"
                style={shift === s
                  ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff", border: "1px solid transparent", boxShadow: "0 4px 12px rgba(15,12,41,0.25)" }
                  : { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
                {s === "PAGI" ? <Sunrise className="w-3.5 h-3.5 inline" /> : <Sunset className="w-3.5 h-3.5 inline" />} {s}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-4 flex gap-2.5 flex-shrink-0" style={{ borderTop: "1px solid #f1f5f9" }}>
        <button onClick={onClose}
          className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-semibold transition-all hover:bg-slate-100 active:scale-95"
          style={{ background: "#f1f5f9", color: "#64748b" }}>
          Batal
        </button>
        <button onClick={save} disabled={saving}
          className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.3)" }}>
          {saving
            ? <><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />Menyimpan...</>
            : <><Save className="w-4 h-4" /> Simpan</>}
        </button>
      </div>
    </ModalShell>
  );
}

// ── ConfirmLogoutModal ────────────────────────────────────────────────────────
function ConfirmLogoutModal({ user, onClose, onConfirm, loading }: {
  user: User; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-7 animate-scaleIn"
        style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.15)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}><DoorOpen className="w-8 h-8" style={{ color: "#ea580c" }} /></div>
        <h3 className="font-black text-slate-800 text-center text-base mb-1">Paksa Logout {user.name}?</h3>
        <p className="text-sm text-slate-400 text-center mb-6 leading-relaxed">Session aktif user ini akan diakhiri segera.</p>
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:bg-slate-100"
            style={{ background: "#f1f5f9", color: "#64748b" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #ea580c, #dc2626)", boxShadow: "0 4px 14px rgba(234,88,12,0.3)" }}>
            {loading
              ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
              : <><DoorOpen className="w-4 h-4" /> Ya, Logout</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ConfirmDeleteModal ────────────────────────────────────────────────────────
function ConfirmDeleteModal({ user, onClose, onConfirm, loading }: {
  user: User; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-7 animate-scaleIn"
        style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.15)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "#fff1f2", border: "1px solid #fecaca" }}><Trash2 className="w-8 h-8" style={{ color: "#dc2626" }} /></div>
        <h3 className="font-black text-slate-800 text-center text-base mb-1">Hapus Akun {user.name}?</h3>
        <p className="text-sm text-slate-400 text-center mb-2 leading-relaxed">
          Akun ini akan dihapus permanen dari sistem.
        </p>
        <div className="px-3 py-2 rounded-xl mb-5 text-center text-xs font-semibold flex items-center justify-center gap-1.5"
          style={{ background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Tindakan ini tidak bisa dibatalkan!
        </div>
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:bg-slate-100"
            style={{ background: "#f1f5f9", color: "#64748b" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", boxShadow: "0 4px 14px rgba(220,38,38,0.3)" }}>
            {loading
              ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
              : <><Trash2 className="w-4 h-4" /> Ya, Hapus</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ConfirmResetPasswordModal ─────────────────────────────────────────────────
function ConfirmResetPasswordModal({ user, onClose, onConfirm, loading }: {
  user: User; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-7 animate-scaleIn"
        style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.15)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "#fffbeb", border: "1px solid #fde68a" }}><KeyRound className="w-8 h-8" style={{ color: "#d97706" }} /></div>
        <h3 className="font-black text-slate-800 text-center text-base mb-1">Reset Password {user.name}?</h3>
        <p className="text-sm text-slate-400 text-center mb-2 leading-relaxed">
          Password akan direset. User harus membuat password baru saat login berikutnya.
        </p>
        <div className="px-3 py-2 rounded-xl mb-5 text-center text-xs font-semibold flex items-center justify-center gap-1.5"
          style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
          <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" /> Status "Belum PW" akan aktif kembali
        </div>
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:bg-slate-100"
            style={{ background: "#f1f5f9", color: "#64748b" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #d97706, #b45309)", boxShadow: "0 4px 14px rgba(217,119,6,0.3)" }}>
            {loading
              ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
              : <><KeyRound className="w-4 h-4" /> Ya, Reset</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ConfirmResetBiometricModal ────────────────────────────────────────────────
function ConfirmResetBiometricModal({ user, onClose, onConfirm, loading }: {
  user: User; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-7 animate-scaleIn"
        style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.15)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "#fff1f2", border: "1px solid #fecaca" }}><Fingerprint className="w-8 h-8" style={{ color: "#dc2626" }} /></div>
        <h3 className="font-black text-slate-800 text-center text-base mb-1">Reset Sidik Jari {user.name}?</h3>
        <p className="text-sm text-slate-400 text-center mb-6 leading-relaxed">
          Kredensial di device lama akan dihapus. User perlu daftar ulang di HP-nya untuk pakai absen biometrik lagi.
        </p>
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:bg-slate-100"
            style={{ background: "#f1f5f9", color: "#64748b" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", boxShadow: "0 4px 14px rgba(220,38,38,0.3)" }}>
            {loading
              ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
              : <><Fingerprint className="w-4 h-4" /> Ya, Reset</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ActionBtn ─────────────────────────────────────────────────────────────────
function ActionBtn({ onClick, title, bg, color, children }: {
  onClick: () => void; title: string; bg: string; color: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title}
      className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:scale-110 active:scale-95 flex-shrink-0"
      style={{ background: bg, color }}>
      {children}
    </button>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, sub, accent }: {
  icon: React.ReactNode; value: number; label: string; sub: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3 sm:p-4 relative overflow-hidden group transition-all hover:shadow-md"
      style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: accent }} />
      <div className="pl-2.5 sm:pl-3">
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          <span className="text-slate-700">{icon}</span>
          <span className="text-2xl sm:text-3xl font-black tabular-nums" style={{ color: "#0f172a" }}>{value}</span>
        </div>
        <p className="text-[10.5px] sm:text-[11px] font-bold truncate" style={{ color: "#64748b" }}>{label}</p>
        <p className="text-[9.5px] sm:text-[10px] mt-0.5 truncate" style={{ color: "#94a3b8" }}>{sub}</p>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("Semua");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [confirmLogoutUser, setConfirmLogoutUser] = useState<User | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmResetPwUser, setConfirmResetPwUser] = useState<User | null>(null);
  const [resettingPw, setResettingPw] = useState(false);
  const [togglingBiometric, setTogglingBiometric] = useState<string | null>(null);
  const [confirmResetBiometricUser, setConfirmResetBiometricUser] = useState<User | null>(null);
  const [resettingBiometric, setResettingBiometric] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRoleManager, setIsRoleManager] = useState(false);
  const [mainTab, setMainTab] = useState<"users" | "roles">("users");
  const [isKepala, setIsKepala] = useState(false);
  const [currentUserInfo, setCurrentUserInfo] = useState<{ id: string; name: string; role: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"karyawan" | "pkl">("karyawan");

  const [customRoles, setCustomRoles] = useState<CustomRoleRow[]>([]);

  const { openChat, setOpenGroupChat } = useChatContext();
  const showToast = (msg: string, type: "ok" | "err") => setToast({ msg, type });

  useEffect(() => {
    getCurrentUserClient().then(u => {
      if (!u) return;

      const userRoles: string[] =
        Array.isArray(u.roles) && u.roles.length > 0
          ? u.roles
          : [u.role];

      const admin = userRoles.some(r => USER_ACTION_ROLES.has(r));
      const kepala = !admin && userRoles.some(r => KEPALA_ROLES.has(r));

      setIsAdmin(admin);
      setIsKepala(kepala);
      setCurrentUserInfo({ id: u.id, name: u.name, role: u.role });
      setIsRoleManager(userRoles.some((r) => ROLE_MANAGER_ROLES.has(r)));
    });
  }, []);

  const fetchCustomRoles = async () => {
    try {
      const res = await fetch("/api/admin/roles");
      const data = await res.json();
      if (data.success) setCustomRoles(data.roles ?? []);
    } catch { /* diam-diam gagal, fallback ke label default */ }
  };

  useEffect(() => { fetchCustomRoles(); }, []);

  const customRoleLookup = useMemo(() => {
    const map = new Map<string, CustomRoleRow>();
    for (const r of customRoles) map.set(r.key, r);
    return map;
  }, [customRoles]);

  const getRoleLabel = (role: string) => customRoleLookup.get(role)?.label ?? ROLE_LABEL[role] ?? role;
  const getRoleIcon = (role: string) => customRoleLookup.get(role)?.icon ?? ROLE_ICON[role] ?? <User className={RI} />;
  const getRoleBadge = (role: string) => {
    const custom = customRoleLookup.get(role);
    if (custom) return { bg: custom.badge_bg, text: custom.badge_text, border: custom.badge_border };
    return ROLE_BADGE_STYLE[role] ?? { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch { showToast("Gagal memuat data user", "err"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleReset = async (user: User) => {
    setResetting(user.id);
    try {
      const res = await fetch("/api/auth/face-enroll", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.success) { showToast(`Wajah ${user.name} berhasil direset`, "ok"); fetchUsers(); }
      else showToast(data.message ?? "Gagal reset", "err");
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setResetting(null); setConfirmReset(null); }
  };

  const handleForceLogout = async () => {
    if (!confirmLogoutUser) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirmLogoutUser.id, _forceLogout: true }),
      });
      const data = await res.json();
      if (data.success) { showToast(`${confirmLogoutUser.name} berhasil di-logout`, "ok"); fetchUsers(); }
      else showToast(data.message ?? "Gagal logout user", "err");
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setLoggingOut(false); setConfirmLogoutUser(null); }
  };

  const handleDeleteUser = async () => {
    if (!confirmDeleteUser) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users?id=${confirmDeleteUser.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Akun ${confirmDeleteUser.name} berhasil dihapus`, "ok");
        fetchUsers();
      } else {
        showToast(data.message ?? "Gagal menghapus user", "err");
      }
    } catch {
      showToast("Terjadi kesalahan", "err");
    } finally {
      setDeleting(false);
      setConfirmDeleteUser(null);
    }
  };

  const handleResetPassword = async () => {
    if (!confirmResetPwUser) return;
    setResettingPw(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirmResetPwUser.id, _resetPassword: true }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Password ${confirmResetPwUser.name} berhasil direset`, "ok");
        fetchUsers();
      } else {
        showToast(data.message ?? "Gagal reset password", "err");
      }
    } catch {
      showToast("Terjadi kesalahan", "err");
    } finally {
      setResettingPw(false);
      setConfirmResetPwUser(null);
    }
  };

  const handleToggleBiometric = async (user: User) => {
    setTogglingBiometric(user.id);
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, _toggleBiometric: !user.biometric_enabled }),
      });
      const data = await res.json();
      if (data.success) { showToast(data.message ?? "Berhasil diperbarui", "ok"); fetchUsers(); }
      else showToast(data.message ?? "Gagal memperbarui", "err");
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setTogglingBiometric(null); }
  };

  const handleResetBiometric = async () => {
    if (!confirmResetBiometricUser) return;
    setResettingBiometric(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirmResetBiometricUser.id, _resetBiometric: true }),
      });
      const data = await res.json();
      if (data.success) { showToast(`Sidik jari ${confirmResetBiometricUser.name} berhasil direset`, "ok"); fetchUsers(); }
      else showToast(data.message ?? "Gagal reset sidik jari", "err");
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setResettingBiometric(false); setConfirmResetBiometricUser(null); }
  };

  const filtered = useMemo(() => {
    let result = users.filter(u => {
      const matchSearch = !search
        || u.name.toLowerCase().includes(search.toLowerCase())
        || (u.phone_number ?? "").includes(search);
      const matchRole = filterRole === "Semua" || u.role === filterRole;
      const matchTab = activeTab === "pkl" ? isPKLRole(u.role) : !isPKLRole(u.role);
      return matchSearch && matchRole && matchTab;
    });
    result.sort((a, b) => {
      const c = a.name.localeCompare(b.name);
      return sortOrder === "asc" ? c : -c;
    });
    return result;
  }, [users, search, filterRole, sortOrder, activeTab]);

  const tabRoles = useMemo(() => {
    const customKeys = customRoles.filter((r) => !r.is_pkl).map((r) => r.key);
    const customPklKeys = customRoles.filter((r) => r.is_pkl).map((r) => r.key);
    return activeTab === "pkl"
      ? [...ALL_ROLES.filter(r => isPKLRole(r)), ...customPklKeys]
      : [...ALL_ROLES.filter(r => !isPKLRole(r)), ...customKeys];
  }, [activeTab, customRoles]);

  const totalInTab = useMemo(
    () => users.filter(u => activeTab === "pkl" ? isPKLRole(u.role) : !isPKLRole(u.role)).length,
    [users, activeTab]
  );

  const birthdayUsers = useMemo(
    () => users.filter(u => isBirthdayToday(u.birth_date)),
    [users]
  );
  const enrolled = users.filter(u => u.face_embedding).length;
  const pwNotSet = users.filter(u => !u.password_set).length;
  const fullAccess = users.filter(u => FULL_ACCESS_ROLES.has(u.role)).length;
  const totalKaryawan = users.filter(u => !isPKLRole(u.role)).length;
  const totalPKL = users.filter(u => isPKLRole(u.role)).length;
  const showOnlinePanel = isAdmin || isKepala;

  return (
    <DashboardLayout>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {isAdmin && confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={() => setConfirmReset(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-7 animate-scaleIn"
            style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.15)" }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "#fff1f2", border: "1px solid #fecaca" }}><ScanFace className="w-8 h-8" style={{ color: "#dc2626" }} /></div>
            <h3 className="font-black text-slate-800 text-center text-base mb-1">Reset Wajah {confirmReset.name}?</h3>
            <p className="text-sm text-slate-400 text-center mb-6 leading-relaxed">User harus scan ulang wajah saat login berikutnya.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmReset(null)}
                className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all"
                style={{ background: "#f1f5f9", color: "#64748b" }}>
                Batal
              </button>
              <button onClick={() => handleReset(confirmReset)} disabled={resetting === confirmReset.id}
                className="flex-1 h-11 sm:h-10 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", boxShadow: "0 4px 14px rgba(220,38,38,0.3)" }}>
                {resetting === confirmReset.id
                  ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                  : <><ScanFace className="w-4 h-4" /> Ya, Reset</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {isAdmin && confirmLogoutUser && (
        <ConfirmLogoutModal user={confirmLogoutUser} onClose={() => setConfirmLogoutUser(null)} onConfirm={handleForceLogout} loading={loggingOut} />
      )}
      {isAdmin && confirmDeleteUser && (
        <ConfirmDeleteModal user={confirmDeleteUser} onClose={() => setConfirmDeleteUser(null)} onConfirm={handleDeleteUser} loading={deleting} />
      )}
      {isAdmin && confirmResetPwUser && (
        <ConfirmResetPasswordModal user={confirmResetPwUser} onClose={() => setConfirmResetPwUser(null)} onConfirm={handleResetPassword} loading={resettingPw} />
      )}
      {isAdmin && confirmResetBiometricUser && (
        <ConfirmResetBiometricModal user={confirmResetBiometricUser} onClose={() => setConfirmResetBiometricUser(null)} onConfirm={handleResetBiometric} loading={resettingBiometric} />
      )}
      {isAdmin && showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { fetchUsers(); showToast("User berhasil dibuat", "ok"); }} />
      )}
      {isAdmin && editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { fetchUsers(); showToast("User berhasil diupdate", "ok"); }} />
      )}

      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-5">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.35)" }}>
                <svg style={{ width: 18, height: 18 }} fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">Manajemen Aktifitas</h1>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "#94a3b8" }}>
                  {isAdmin
                    ? "Kelola akun, role, shift, dan wajah karyawan"
                    : isKepala
                      ? "Lihat detail dan chat dengan anggota tim"
                      : "Lihat dan chat dengan rekan kerja"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <NotificationToggle />
              <button
                onClick={() => setOpenGroupChat(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 sm:px-4 h-10 sm:h-auto sm:py-2.5 text-white rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-95 whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #059669, #047857)", boxShadow: "0 4px 14px rgba(5,150,105,0.35)" }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
                <span>Grup Chat</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 sm:px-4 h-10 sm:h-auto sm:py-2.5 text-white rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-95 whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.3)" }}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Tambah User</span>
                </button>
              )}
            </div>
          </div>

          {/* ── Stat cards ─────────────────────────────────────────────── */}
          {!loading && isAdmin && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              <StatCard icon={<Users className="w-5 h-5" />} value={users.length} label="Total User" sub="terdaftar" accent="linear-gradient(180deg, #94a3b8, #64748b)" />
              <StatCard icon={<Crown className="w-5 h-5" />} value={fullAccess} label="Akses Penuh" sub="admin & programmer" accent="linear-gradient(180deg, #a78bfa, #7c3aed)" />
              <StatCard icon={<ScanFace className="w-5 h-5" />} value={enrolled} label="Wajah Terdaftar" sub={`dari ${users.length} user`} accent="linear-gradient(180deg, #34d399, #059669)" />
              <StatCard icon={<AlertTriangle className="w-5 h-5" />} value={pwNotSet} label="Belum Set PW" sub={pwNotSet > 0 ? "perlu perhatian" : "semua aman"}
                accent={pwNotSet > 0 ? "linear-gradient(180deg, #fbbf24, #d97706)" : "linear-gradient(180deg, #e2e8f0, #cbd5e1)"} />
            </div>
          )}

          {/* ── Main tab switch (Users / Roles) ───────────────────────── */}
          {isRoleManager && (
            <div className="bg-white rounded-2xl p-1.5 border border-slate-100">
              <div className="flex gap-1.5">
                {([
                  { key: "users", label: "Daftar User", icon: <Users className="w-3.5 h-3.5" /> },
                  { key: "roles", label: "Role & Hak Akses", icon: <Lock className="w-3.5 h-3.5" /> },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setMainTab(t.key);
                      if (t.key === "users") fetchCustomRoles();
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all"
                    style={
                      mainTab === t.key
                        ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff" }
                        : { background: "#f5f7ff", color: "#64748b" }
                    }
                  >
                    <span>{t.icon}</span>
                    <span className="truncate">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mainTab === "roles" && isRoleManager ? (
            <RoleAccessManager />
          ) : (
            <>
              {isAdmin && (
                <div className="bg-white rounded-2xl p-1.5"
                  style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                  <div className="flex gap-1.5">
                    {([
                      { key: "karyawan", label: "Karyawan", icon: <Users className="w-3.5 h-3.5" />, count: totalKaryawan },
                      { key: "pkl", label: "PKL", icon: <GraduationCap className="w-3.5 h-3.5" />, count: totalPKL },
                    ] as const).map(t => (
                      <button key={t.key}
                        onClick={() => { setActiveTab(t.key); setFilterRole("Semua"); }}
                        className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all"
                        style={activeTab === t.key
                          ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff", boxShadow: "0 4px 12px rgba(15,12,41,0.25)" }
                          : { background: "#f5f7ff", color: "#64748b" }}>
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black"
                          style={activeTab === t.key
                            ? { background: "rgba(255,255,255,0.15)", color: "#fff" }
                            : { background: "#e8ecf5", color: "#64748b" }}>
                          {t.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start">

                <div className="flex-1 min-w-0 w-full space-y-3">

                  {/* ── Search / sort / filter panel ─────────────────── */}
                  <div className="bg-white rounded-2xl overflow-hidden"
                    style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                    <div className="px-3.5 sm:px-4 pt-3.5 sm:pt-4 pb-3.5 space-y-3">
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1 min-w-0">
                          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#94a3b8" }}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <input type="text" placeholder="Cari nama atau nomor..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full h-10 sm:h-9 rounded-xl pl-9 pr-8 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition"
                            style={{ border: "1px solid #e8ecf5", background: "#f5f7ff", color: "#334155" }} />
                          {search && (
                            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 hover:scale-110 transition-transform">
                              <svg className="w-3 h-3" style={{ color: "#94a3b8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <button onClick={() => setSortOrder(s => s === "asc" ? "desc" : "asc")}
                          className="h-10 sm:h-9 px-3 sm:px-3.5 rounded-xl text-[10.5px] font-black text-white flex-shrink-0 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95"
                          style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 2px 8px rgba(15,12,41,0.25)" }}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d={sortOrder === "asc"
                                ? "M3 4h13M3 8h9M3 12h5m11 0l-4-4m4 4l-4 4"
                                : "M3 4h13M3 8h9M3 12h9m-2 4l4-4m-4 4l4 4"} />
                          </svg>
                          {sortOrder === "asc" ? "A–Z" : "Z–A"}
                        </button>
                      </div>

                      <div className="flex gap-1.5 flex-wrap max-h-[5.5rem] sm:max-h-[4.5rem] overflow-y-auto pb-0.5 scrollbar-hide">
                        {["Semua", ...tabRoles].map(r => (
                          <button key={r} onClick={() => setFilterRole(r)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex-shrink-0 active:scale-95"
                            style={filterRole === r
                              ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff" }
                              : { background: "#f5f7ff", color: "#64748b", border: "1px solid #e8ecf5" }}>
                            {r === "Semua" ? `Semua (${totalInTab})` : <>{getRoleIcon(r)} {getRoleLabel(r)}</>}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── User list ─────────────────────────────────────── */}
                  <div className="bg-white rounded-2xl overflow-hidden"
                    style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>

                    <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between flex-wrap gap-2"
                      style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: "linear-gradient(180deg, #6366f1, #8b5cf6)" }} />
                        <p className="text-[11px] font-bold truncate" style={{ color: "#64748b" }}>
                          {filtered.length === totalInTab
                            ? `${totalInTab} ${activeTab === "pkl" ? "Pkl" : "Karyawan"}`
                            : `${filtered.length} dari ${totalInTab} ${activeTab === "pkl" ? "magang" : "karyawan"}`}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="hidden sm:flex items-center gap-3 text-[10px] flex-shrink-0" style={{ color: "#94a3b8" }}>
                          <span className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />Wajah OK
                          </span>
                          <span className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-violet-400" />Akses penuh
                          </span>
                        </div>
                      )}
                    </div>

                    {loading ? (
                      <div>
                        {Array(6).fill(0).map((_, i) => (
                          <div key={i} className="px-3.5 sm:px-5 py-4 flex items-center gap-3 sm:gap-3.5 animate-pulse"
                            style={{ borderBottom: "1px solid #f8f8fc" }}>
                            <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: "#f1f5f9" }} />
                            <div className="flex-1 space-y-2 min-w-0">
                              <div className="h-3 rounded-full w-32 max-w-full" style={{ background: "#e2e8f0" }} />
                              <div className="h-2.5 rounded-full w-20" style={{ background: "#f1f5f9" }} />
                            </div>
                            <div className="w-16 h-7 rounded-lg flex-shrink-0 hidden sm:block" style={{ background: "#f1f5f9" }} />
                          </div>
                        ))}
                      </div>

                    ) : filtered.length === 0 ? (
                      <div className="text-center py-16 sm:py-20 px-4">
                        <div className="flex justify-center mb-3"><Inbox className="w-9 h-9" style={{ color: "#cbd5e1" }} /></div>
                        <p className="text-sm font-bold" style={{ color: "#475569" }}>Tidak ada user ditemukan</p>
                        <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>Coba ubah filter atau kata kunci pencarian</p>
                        {(search || filterRole !== "Semua") && (
                          <button onClick={() => { setSearch(""); setFilterRole("Semua"); }}
                            className="mt-4 text-xs font-bold px-4 py-2 rounded-xl transition-all hover:scale-105"
                            style={{ color: "#6366f1", background: "#eff3ff" }}>
                            Reset filter
                          </button>
                        )}
                      </div>

                    ) : (
                      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
                        {filtered.map((user, idx) => {
                          const avatarColor = getAvatarColor(user.role);
                          const isFullAccess = FULL_ACCESS_ROLES.has(user.role);
                          const canChat = currentUserInfo && user.id !== currentUserInfo.id;

                          return (
                            <div key={user.id}
                              className="px-3.5 sm:px-5 py-3 sm:py-3.5 hover:bg-slate-50/70 transition-colors group"
                              style={{ borderBottom: idx < filtered.length - 1 ? "1px solid #f5f5fb" : "none" }}>
                              <div className="flex items-start sm:items-center gap-3 sm:gap-3.5">

                                <div
                                  className="relative flex-shrink-0 cursor-pointer"
                                  onClick={() => router.push(`/dashboard/profile/${user.id}`)}
                                  title={`Lihat profil ${user.name}`}
                                >
                                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black overflow-hidden"
                                    style={{
                                      background: isFullAccess
                                        ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                                        : `linear-gradient(135deg, ${avatarColor}dd, ${avatarColor})`,
                                      boxShadow: `0 2px 8px ${avatarColor}30`,
                                    }}>
                                    {user.profile_photo_url
                                      ? <img src={user.profile_photo_url} alt={user.name} className="w-full h-full object-cover" />
                                      : getInitials(user.name)}
                                  </div>
                                  {isAdmin && user.face_embedding && (
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center"
                                      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
                                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    </div>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/dashboard/profile/${user.id}`)} title={`Lihat profil ${user.name}`}>
                                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                    <span className="text-sm font-bold truncate max-w-full hover:underline" style={{ color: "#0f172a" }}>
                                      {user.name}
                                    </span>
                                    {(user.roles?.length > 0 ? user.roles : [user.role]).map((r, i) => {
                                      const bs = getRoleBadge(r);
                                      return (
                                        <span key={r}
                                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                                          style={{ background: bs.bg, color: bs.text, border: `1px solid ${bs.border}` }}>
                                          {i === 0 && user.roles?.length > 1 && (
                                            <span className="text-[8px] font-black opacity-60">★</span>
                                          )}
                                          {getRoleIcon(r)} {getRoleLabel(r)}
                                        </span>
                                      );
                                    })}
                                    {isAdmin && !user.password_set && (
                                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                                        style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }}>
                                        <KeyRound className="w-2.5 h-2.5" /> Belum PW
                                      </span>
                                    )}
                                    {isAdmin && user.biometric_enabled && (
                                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                                        style={user.biometric_enrolled
                                          ? { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }
                                          : { background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}>
                                        <Fingerprint className="w-2.5 h-2.5" /> {user.biometric_enrolled ? "Sidik Jari Aktif" : "Menunggu Didaftarkan"}
                                      </span>
                                    )}
                                    {isAdmin && user.force_logout_at && (
                                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                                        style={{ background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }}>
                                        <DoorOpen className="w-2.5 h-2.5" /> Forced Out
                                      </span>
                                    )}
                                    {isBirthdayToday(user.birth_date) && (
                                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 animate-pulse"
                                        style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                                        <Cake className="w-2.5 h-2.5" /> Ultah!
                                      </span>
                                    )}
                                  </div>
                                  {user.status_note && (
                                    <p className="text-[11px] mt-0.5 truncate font-semibold" style={{ color: "#7c3aed" }}>
                                      {user.status_note}
                                    </p>
                                  )}
                                  {user.song_title && (
                                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                      {user.song_artwork_url && (
                                        <img src={user.song_artwork_url} alt={user.song_title} className="w-4 h-4 rounded flex-shrink-0 object-cover" />
                                      )}
                                      <p className="text-[11px] truncate" style={{ color: "#16a34a" }}>
                                        {user.song_title} · {user.song_artist}
                                      </p>
                                    </div>
                                  )}
                                  {user.bio && (
                                    <p className="text-[11px] text-gray-400 mt-0.5 truncate italic">"{user.bio}"</p>
                                  )}
                                  {(isAdmin || isKepala) && user.phone_number && (
                                    <p className="text-[11px] text-gray-400 font-medium mt-0.5 truncate">{user.phone_number}</p>
                                  )}
                                  {user.birth_date && (
                                    <p className="text-[10px] text-gray-400 mt-0.5 inline-flex items-center gap-1 flex-wrap">
                                      <Cake className="w-3 h-3 flex-shrink-0" /> {formatBirthDate(user.birth_date)}
                                      {isBirthdayToday(user.birth_date) && (
                                        <span className="ml-1 text-amber-600 font-bold inline-flex items-center gap-1">— Hari ini! <PartyPopper className="w-3 h-3" /></span>
                                      )}
                                    </p>
                                  )}
                                </div>

                                <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                                  {canChat && (
                                    <ActionBtn
                                      onClick={() => openChat({ id: user.id, name: user.name, role: user.role, profile_photo_url: user.profile_photo_url })}
                                      title={`Chat dengan ${user.name}`}
                                      bg="#eff6ff" color="#3b82f6">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && (
                                    <ActionBtn onClick={() => setEditUser(user)} title="Edit user" bg="#f0f9ff" color="#0369a1">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && user.face_embedding && (
                                    <ActionBtn onClick={() => setConfirmReset(user)} title="Reset wajah" bg="#fff1f2" color="#dc2626">
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && user.biometric_enrolled && (
                                    <ActionBtn onClick={() => setConfirmResetBiometricUser(user)} title="Reset sidik jari" bg="#fff1f2" color="#dc2626">
                                      <Fingerprint className="w-3.5 h-3.5" />
                                    </ActionBtn>
                                  )}
                                  {isAdmin && !user.biometric_enrolled && (
                                    <ActionBtn
                                      onClick={() => handleToggleBiometric(user)}
                                      title={user.biometric_enabled ? "Nonaktifkan sidik jari" : "Aktifkan sidik jari (Daftar Sidik Jari)"}
                                      bg={user.biometric_enabled ? "#fffbeb" : "#f8fafc"}
                                      color={user.biometric_enabled ? "#d97706" : "#94a3b8"}>
                                      {togglingBiometric === user.id
                                        ? <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,0.1)", borderTopColor: "currentColor" }} />
                                        : <Fingerprint className="w-3.5 h-3.5" />}
                                    </ActionBtn>
                                  )}
                                  {isAdmin && (
                                    <ActionBtn onClick={() => setConfirmLogoutUser(user)} title={`Paksa logout ${user.name}`} bg="#fff7ed" color="#ea580c">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && (
                                    <ActionBtn onClick={() => setConfirmResetPwUser(user)} title={`Reset password ${user.name}`} bg="#fffbeb" color="#d97706">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && currentUserInfo && user.id !== currentUserInfo.id && (
                                    <ActionBtn onClick={() => setConfirmDeleteUser(user)} title={`Hapus akun ${user.name}`} bg="#fff1f2" color="#dc2626">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                </div>
                              </div>

                              {(canChat || isAdmin) && (
                                <div className="flex sm:hidden items-center gap-1.5 mt-2.5 pl-[52px] flex-wrap">
                                  {canChat && (
                                    <ActionBtn
                                      onClick={() => openChat({ id: user.id, name: user.name, role: user.role, profile_photo_url: user.profile_photo_url })}
                                      title={`Chat dengan ${user.name}`}
                                      bg="#eff6ff" color="#3b82f6">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && (
                                    <ActionBtn onClick={() => setEditUser(user)} title="Edit user" bg="#f0f9ff" color="#0369a1">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && user.face_embedding && (
                                    <ActionBtn onClick={() => setConfirmReset(user)} title="Reset wajah" bg="#fff1f2" color="#dc2626">
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && (
                                    <ActionBtn onClick={() => setConfirmLogoutUser(user)} title={`Paksa logout ${user.name}`} bg="#fff7ed" color="#ea580c">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && (
                                    <ActionBtn onClick={() => setConfirmResetPwUser(user)} title={`Reset password ${user.name}`} bg="#fffbeb" color="#d97706">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                  {isAdmin && currentUserInfo && user.id !== currentUserInfo.id && (
                                    <ActionBtn onClick={() => setConfirmDeleteUser(user)} title={`Hapus akun ${user.name}`} bg="#fff1f2" color="#dc2626">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </ActionBtn>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {showOnlinePanel && (
                  <div className="hidden lg:flex flex-col gap-3 w-72 flex-shrink-0 sticky top-6 self-start">
                    {isAdmin && (
                      <div className="px-4 py-3.5 rounded-2xl flex items-start gap-3"
                        style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: "#dbeafe" }}>
                          <svg className="w-4 h-4" style={{ color: "#1d4ed8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs font-bold" style={{ color: "#1d4ed8" }}>Auto-logout 03:00 WIB</p>
                          <p className="text-[10.5px] mt-0.5 leading-relaxed" style={{ color: "#3b82f6" }}>
                            Session diakhiri otomatis. Gunakan <DoorOpen className="w-2.5 h-2.5 inline" /> untuk paksa logout manual.
                          </p>
                        </div>
                      </div>
                    )}
                    <OnlineUsersPanel />
                  </div>
                )}
              </div>

              {showOnlinePanel && (
                <div className="lg:hidden space-y-3">
                  <OnlineUsersPanel />
                </div>
              )}
            </>
          )}

        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn  { from { opacity: 0; transform: translateX(60px); }  to { opacity: 1; transform: translateX(0); } }
        @keyframes scaleIn  { from { opacity: 0; transform: scale(0.94);      }  to { opacity: 1; transform: scale(1);    } }
        .animate-slideIn { animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-scaleIn { animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </DashboardLayout>
  );
}