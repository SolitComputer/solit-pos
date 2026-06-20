"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { OnlineUsersPanel } from "@/components/layout/OnlineUsersPanel";
import { getCurrentUserClient } from "@/lib/auth-client";
import { useChatContext } from "@/contexts/ChatContext";
import { NotificationToggle } from "@/components/ui/NotificationToggle";

interface User {
  id: string;
  name: string;
  phone_number: string | null;
  email: string | null;
  role: string;
  shift: "PAGI" | "SORE";
  password_set: boolean;
  face_enrolled_at: string | null;
  face_embedding: boolean;
  force_logout_at: string | null;
}

const ALL_ROLES = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGELOLA_BARANG",
  "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
  "PKL", "CUSTOMER_SERVICE", "KEPALA_PENGELOLA_BARANG",
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
  KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing", KEPALA_TEKNISI: "Kepala Teknisi",
  CREW_SALES: "Crew Sales", SOTECH: "Sotech", ACCOUNTING: "Accounting",
  PENGELOLA_BARANG: "Pengelola Barang", TEKNISI: "Teknisi", PENGANTARAN: "Pengantaran",
  MARKETING: "Marketing", KEBERSIHAN: "Kebersihan",
  PENYEDIA_BARANG: "Penyedia Barang", KEPALA_PENYEDIA_BARANG: "Kepala Penyedia Barang",
  KONTEN: "Konten", KEPALA_ONPOINT: "Kepala Onpoint", ONPOINT: "Onpoint",
  KEPALA_SOTECH: "Kepala Sotech", PKL: "PKL", CUSTOMER_SERVICE: "Customer Service",
  KEPALA_PENGELOLA_BARANG: "Kepala Pengelola Barang",
};

const ROLE_ICON: Record<string, string> = {
  ADMIN: "👑", PROGRAMMER: "💻", ASISTEN_CEO: "🤝",
  KEPALA_SALES: "📊", KEPALA_MARKETING: "🎯", KEPALA_TEKNISI: "🔩",
  CREW_SALES: "💼", SOTECH: "🛠️", ACCOUNTING: "💰",
  PENGELOLA_BARANG: "📦", TEKNISI: "🔧", PENGANTARAN: "🚚",
  MARKETING: "📱", KEBERSIHAN: "🧹",
  PENYEDIA_BARANG: "🏭", KEPALA_PENYEDIA_BARANG: "🏢", KONTEN: "📝",
  KEPALA_ONPOINT: "🎯", ONPOINT: "📍", KEPALA_SOTECH: "⚙️",
  PKL: "🎓", CUSTOMER_SERVICE: "🎧",
  KEPALA_PENGELOLA_BARANG: "📦",
};

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
  CUSTOMER_SERVICE: { bg: "#f0f9ff", text: "#0369a1", border: "#bae6fd" },
  KEPALA_PENGELOLA_BARANG: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
};

const ROLE_AVATAR_COLOR: Record<string, string> = {
  ADMIN: "#7c3aed", PROGRAMMER: "#4f46e5", ASISTEN_CEO: "#9333ea",
  KEPALA_SALES: "#059669", KEPALA_MARKETING: "#e11d48", KEPALA_TEKNISI: "#dc2626",
  CREW_SALES: "#0284c7", SOTECH: "#65a30d", ACCOUNTING: "#d97706",
  PENGELOLA_BARANG: "#2563eb", TEKNISI: "#ea580c", PENGANTARAN: "#0d9488",
  MARKETING: "#db2777", KEBERSIHAN: "#0891b2",
  PENYEDIA_BARANG: "#ca8a04", KEPALA_PENYEDIA_BARANG: "#c2410c",
  KONTEN: "#a21caf", KEPALA_ONPOINT: "#16a34a", ONPOINT: "#15803d",
  KEPALA_SOTECH: "#4d7c0f", PKL: "#475569", CUSTOMER_SERVICE: "#0369a1",
  KEPALA_PENGELOLA_BARANG: "#1d4ed8",
};

const FULL_ACCESS_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);
const KEPALA_ROLES = new Set([
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  "KEPALA_PENGELOLA_BARANG",
]);

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function getAvatarColor(role: string) {
  return ROLE_AVATAR_COLOR[role] ?? "#6b7280";
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[9999] px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold flex items-center gap-3 animate-slideIn ${type === "ok" ? "bg-white text-slate-700 border border-slate-100" : "bg-white text-red-600 border border-red-100"
      }`}
      style={{ boxShadow: type === "ok" ? "0 8px 32px rgba(0,0,0,0.10)" : "0 8px 32px rgba(220,38,38,0.12)" }}>
      {type === "ok"
        ? <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        : <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </div>
      }
      {msg}
    </div>
  );
}

// ── RoleSelect ────────────────────────────────────────────────────────────────
function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full h-10 border rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 transition"
      style={{ borderColor: "#e2e8f0" }}>
      <optgroup label="— Akses Penuh —">
        {["ADMIN", "PROGRAMMER", "ASISTEN_CEO"].map(r => (
          <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
        ))}
      </optgroup>
      <optgroup label="— Management —">
        {["KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI"].map(r => (
          <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
        ))}
      </optgroup>
      <optgroup label="— Operasional —">
        {["CREW_SALES", "SOTECH", "ACCOUNTING", "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN"].map(r => (
          <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
        ))}
      </optgroup>
      <optgroup label="— Penyedia & Konten —">
        {["PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN"].map(r => (
          <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
        ))}
      </optgroup>
      <optgroup label="— Onpoint & Sotech —">
        {["KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH"].map(r => (
          <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
        ))}
      </optgroup>
      <optgroup label="— Magang —"><option value="PKL">🎓 PKL</option></optgroup>
      <optgroup label="— Layanan —"><option value="CUSTOMER_SERVICE">🎧 Customer Service</option></optgroup>
    </select>
  );
}

// ── Modal Shell ───────────────────────────────────────────────────────────────
function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.2)" }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, icon, onClose }: {
  title: string; subtitle: string; icon: React.ReactNode; onClose: () => void;
}) {
  return (
    <div className="relative px-6 py-5 flex items-center justify-between overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(ellipse at 80% 50%, rgba(99,102,241,0.15) 0%, transparent 60%)",
      }} />
      <div className="flex items-center gap-3 z-10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)" }}>
          {icon}
        </div>
        <div>
          <p className="font-bold text-white text-sm tracking-tight">{title}</p>
          <p className="text-[10.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{subtitle}</p>
        </div>
      </div>
      <button onClick={onClose}
        className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:scale-110 z-10"
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
    <input {...props}
      className="w-full h-10 border rounded-xl px-3.5 text-sm font-medium transition focus:outline-none focus:ring-2"
      style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#1e293b" }} />
  );
}

// ── CreateUserModal ───────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("CREW_SALES");
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
        body: JSON.stringify({ name: name.trim(), phone_number: phone.trim(), role, shift }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onCreated(); onClose();
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Tambah User Baru" subtitle="Admin membuat akun, user set password sendiri" onClose={onClose}
        icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>} />
      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl text-xs font-semibold"
            style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
            {error}
          </div>
        )}
        <Field label="Nama Lengkap"><Input value={name} onChange={e => setName(e.target.value)} placeholder="contoh: Budi Santoso" /></Field>
        <Field label="Nomor WhatsApp">
          <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08123456789" />
          <p className="text-[10px] mt-1.5" style={{ color: "#94a3b8" }}>Digunakan sebagai username login</p>
        </Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
          {FULL_ACCESS_ROLES.has(role) && (
            <div className="flex items-center gap-1.5 mt-1.5 px-3 py-2 rounded-xl text-[10.5px] font-semibold"
              style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#6d28d9" }}>
              ⚠️ Role ini memiliki akses penuh ke semua fitur
            </div>
          )}
        </Field>
        <Field label="Shift Kerja">
          <div className="flex gap-2">
            {(["PAGI", "SORE"] as const).map(s => (
              <button key={s} type="button" onClick={() => setShift(s)}
                className="flex-1 h-10 rounded-xl text-xs font-bold border transition-all"
                style={shift === s
                  ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff", border: "1px solid transparent" }
                  : { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
                {s === "PAGI" ? "🌅 Pagi" : "🌆 Sore"}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="px-6 pb-6 flex gap-2.5" style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
        <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold"
          style={{ background: "#f1f5f9", color: "#64748b" }}>Batal</button>
        <button onClick={save} disabled={saving}
          className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
          {saving ? <><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />Membuat...</> : "✅ Buat Akun"}
        </button>
      </div>
    </ModalShell>
  );
}

// ── EditUserModal ─────────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone_number ?? "");
  const [role, setRole] = useState(user.role);
  const [shift, setShift] = useState<"PAGI" | "SORE">(user.shift ?? "PAGI");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, name, phone_number: phone, role, shift }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onSaved(); onClose();
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Edit User" subtitle={user.name} onClose={onClose}
        icon={<div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
          style={{ background: `${getAvatarColor(user.role)}cc` }}>{getInitials(user.name)}</div>} />
      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl text-xs font-semibold"
            style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
            {error}
          </div>
        )}
        <Field label="Nama"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Nomor WhatsApp"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
          {FULL_ACCESS_ROLES.has(role) && (
            <div className="flex items-center gap-1.5 mt-1.5 px-3 py-2 rounded-xl text-[10.5px] font-semibold"
              style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#6d28d9" }}>
              ⚠️ Role ini memiliki akses penuh ke semua fitur
            </div>
          )}
        </Field>
        <Field label="Shift">
          <div className="flex gap-2">
            {(["PAGI", "SORE"] as const).map(s => (
              <button key={s} type="button" onClick={() => setShift(s)}
                className="flex-1 h-10 rounded-xl text-xs font-bold border transition-all"
                style={shift === s
                  ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff", border: "1px solid transparent" }
                  : { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
                {s === "PAGI" ? "🌅" : "🌆"} {s}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="px-6 pb-6 flex gap-2.5" style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
        <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold"
          style={{ background: "#f1f5f9", color: "#64748b" }}>Batal</button>
        <button onClick={save} disabled={saving}
          className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
          {saving ? <><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />Menyimpan...</> : "💾 Simpan"}
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
      <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 animate-scaleIn">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl"
          style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>🚪</div>
        <h3 className="font-black text-slate-800 text-center text-base mb-1.5">Paksa Logout {user.name}?</h3>
        <p className="text-sm text-slate-500 text-center mb-5">Session aktif user ini akan diakhiri.</p>
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-10 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: "#f1f5f9", color: "#64748b" }}>Batal</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #ea580c, #dc2626)" }}>
            {loading ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> : "🚪 Ya, Logout"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ActionBtn — ukuran lebih kecil, selalu tampil ─────────────────────────────
function ActionBtn({ onClick, title, bg, color, children }: {
  onClick: () => void; title: string; bg: string; color: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title}
      className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:scale-110 flex-shrink-0"
      style={{ background: bg, color }}>
      {children}
    </button>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, sub, accent }: {
  icon: string; value: number; label: string; sub: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 relative overflow-hidden"
      style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: accent }} />
      <div className="flex items-start justify-between mb-3 pl-2">
        <span className="text-xl">{icon}</span>
        <span className="text-2xl font-black" style={{ color: "#0f172a" }}>{value}</span>
      </div>
      <p className="text-[11px] font-bold pl-2" style={{ color: "#64748b" }}>{label}</p>
      <p className="text-[10px] mt-0.5 pl-2" style={{ color: "#94a3b8" }}>{sub}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isKepala, setIsKepala] = useState(false);
  const [currentUserInfo, setCurrentUserInfo] = useState<{ id: string; name: string; role: string } | null>(null);

  const { openChat, setOpenGroupChat } = useChatContext();
  const showToast = (msg: string, type: "ok" | "err") => setToast({ msg, type });

  useEffect(() => {
    getCurrentUserClient().then(u => {
      if (u) {
        setIsAdmin(FULL_ACCESS_ROLES.has(u.role));
        setIsKepala(KEPALA_ROLES.has(u.role));
        setCurrentUserInfo({ id: u.id, name: u.name, role: u.role });
      }
    });
  }, []);

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
      if (data.success) { showToast(`✅ ${confirmLogoutUser.name} berhasil di-logout`, "ok"); fetchUsers(); }
      else showToast(data.message ?? "Gagal logout user", "err");
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setLoggingOut(false); setConfirmLogoutUser(null); }
  };

  const filtered = useMemo(() => {
    let result = users.filter(u => {
      const matchSearch = !search
        || u.name.toLowerCase().includes(search.toLowerCase())
        || (u.phone_number ?? "").includes(search);
      return matchSearch && (filterRole === "Semua" || u.role === filterRole);
    });
    result.sort((a, b) => {
      const c = a.name.localeCompare(b.name);
      return sortOrder === "asc" ? c : -c;
    });
    return result;
  }, [users, search, filterRole, sortOrder]);

  const enrolled = users.filter(u => u.face_embedding).length;
  const pwNotSet = users.filter(u => !u.password_set).length;
  const fullAccess = users.filter(u => FULL_ACCESS_ROLES.has(u.role)).length;
  const showOnlinePanel = isAdmin || isKepala;

  return (
    <DashboardLayout>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Modals ── */}
      {isAdmin && confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: "blur(8px)" }} onClick={() => setConfirmReset(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 animate-scaleIn">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl"
              style={{ background: "#fff1f2", border: "1px solid #fecaca" }}>😶</div>
            <h3 className="font-black text-slate-800 text-center text-base mb-1.5">Reset Wajah {confirmReset.name}?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">User harus scan ulang wajah saat login berikutnya.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmReset(null)}
                className="flex-1 h-10 rounded-xl text-sm font-semibold"
                style={{ background: "#f1f5f9", color: "#64748b" }}>Batal</button>
              <button onClick={() => handleReset(confirmReset)} disabled={resetting === confirmReset.id}
                className="flex-1 h-10 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>
                {resetting === confirmReset.id
                  ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                  : null}
                Ya, Reset
              </button>
            </div>
          </div>
        </div>
      )}
      {isAdmin && confirmLogoutUser && (
        <ConfirmLogoutModal user={confirmLogoutUser} onClose={() => setConfirmLogoutUser(null)} onConfirm={handleForceLogout} loading={loggingOut} />
      )}
      {isAdmin && showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { fetchUsers(); showToast("User berhasil dibuat", "ok"); }} />
      )}
      {isAdmin && editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { fetchUsers(); showToast("User berhasil diupdate", "ok"); }} />
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 12px rgba(15,12,41,0.3)" }}>
              <svg style={{ width: 18, height: 18 }} fill="none" stroke="white" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Manajemen User</h1>
              <p className="text-[11px] mt-0.5" style={{ color: "#94a3b8" }}>
                {isAdmin ? "Kelola akun, role, shift, dan wajah karyawan"
                  : isKepala ? "Lihat detail dan chat dengan anggota tim"
                    : "Lihat dan chat dengan rekan kerja"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <NotificationToggle />
            <button onClick={() => setOpenGroupChat(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95"
              style={{ background: "linear-gradient(135deg, #059669, #047857)", boxShadow: "0 4px 14px rgba(5,150,105,0.35)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
              Grup Chat
            </button>
            {isAdmin && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.3)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tambah User
              </button>
            )}
          </div>
        </div>

        {/* ── Stat Cards ── */}
        {!loading && isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon="👥" value={users.length} label="Total User" sub="terdaftar" accent="linear-gradient(180deg, #94a3b8, #64748b)" />
            <StatCard icon="🔑" value={fullAccess} label="Akses Penuh" sub="admin & programmer" accent="linear-gradient(180deg, #a78bfa, #7c3aed)" />
            <StatCard icon="😊" value={enrolled} label="Wajah Terdaftar" sub={`dari ${users.length} user`} accent="linear-gradient(180deg, #34d399, #059669)" />
            <StatCard icon="⚠️" value={pwNotSet} label="Belum Set PW"
              sub={pwNotSet > 0 ? "perlu perhatian" : "semua aman"}
              accent={pwNotSet > 0 ? "linear-gradient(180deg, #fbbf24, #d97706)" : "linear-gradient(180deg, #e2e8f0, #cbd5e1)"} />
          </div>
        )}

        <div className="flex gap-5 items-start">

          {/* ── Left Column ── */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Filter & Search */}
            <div className="bg-white rounded-2xl overflow-hidden"
              style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
              <div className="px-4 pt-4 pb-3.5 space-y-3">
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1 min-w-0">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#94a3b8" }}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input type="text" placeholder="Cari nama atau nomor..."
                      value={search} onChange={e => setSearch(e.target.value)}
                      className="w-full h-9 rounded-xl pl-9 pr-3 text-xs font-medium focus:outline-none focus:ring-2 transition"
                      style={{ border: "1px solid #e8ecf5", background: "#f5f7ff", color: "#334155" }} />
                    {search && (
                      <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-3 h-3" style={{ color: "#94a3b8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <button onClick={() => setSortOrder(s => s === "asc" ? "desc" : "asc")}
                    className="h-9 px-3.5 rounded-xl text-[10.5px] font-black text-white flex-shrink-0 flex items-center gap-1.5"
                    style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d={sortOrder === "asc" ? "M3 4h13M3 8h9M3 12h5m11 0l-4-4m4 4l-4 4" : "M3 4h13M3 8h9M3 12h9m-2 4l4-4m-4 4l4 4"} />
                    </svg>
                    {sortOrder === "asc" ? "A–Z" : "Z–A"}
                  </button>
                </div>
                {/* Role Pills */}
                <div className="flex gap-1.5 flex-wrap max-h-[4.5rem] overflow-y-auto pb-0.5 scrollbar-hide">
                  {["Semua", ...ALL_ROLES].map(r => (
                    <button key={r} onClick={() => setFilterRole(r)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex-shrink-0"
                      style={filterRole === r
                        ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff" }
                        : { background: "#f5f7ff", color: "#64748b", border: "1px solid #e8ecf5" }}>
                      {r === "Semua" ? `Semua (${users.length})` : `${ROLE_ICON[r] || ""} ${ROLE_LABEL[r] ?? r}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* User List */}
            <div className="bg-white rounded-2xl overflow-hidden"
              style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>

              {/* List Header */}
              <div className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-4 rounded-full" style={{ background: "linear-gradient(180deg, #6366f1, #8b5cf6)" }} />
                  <p className="text-[11px] font-bold" style={{ color: "#64748b" }}>
                    {filtered.length === users.length ? `${users.length} karyawan` : `${filtered.length} dari ${users.length} karyawan`}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: "#94a3b8" }}>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" />Wajah terdaftar</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-violet-400" />Akses penuh</span>
                  </div>
                )}
              </div>

              {/* Loading */}
              {loading ? (
                <div>
                  {Array(6).fill(0).map((_, i) => (
                    <div key={i} className="px-5 py-3.5 flex items-center gap-3 animate-pulse"
                      style={{ borderBottom: "1px solid #f8f8fc" }}>
                      <div className="w-11 h-11 rounded-xl flex-shrink-0" style={{ background: "#f1f5f9" }} />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 rounded-full w-28" style={{ background: "#e2e8f0" }} />
                        <div className="h-2.5 rounded-full w-36" style={{ background: "#f1f5f9" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-sm font-bold" style={{ color: "#475569" }}>Tidak ada user ditemukan</p>
                  <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>Coba ubah filter atau kata kunci pencarian</p>
                  {(search || filterRole !== "Semua") && (
                    <button onClick={() => { setSearch(""); setFilterRole("Semua"); }}
                      className="mt-4 text-xs font-bold" style={{ color: "#6366f1" }}>Reset filter</button>
                  )}
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
                  {filtered.map(user => {
                    const avatarColor = getAvatarColor(user.role);
                    const badgeStyle = ROLE_BADGE_STYLE[user.role] ?? { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };
                    const isFullAccess = FULL_ACCESS_ROLES.has(user.role);

                    return (
                      <div key={user.id} className="px-5 py-3 hover:bg-slate-50/60 transition-colors"
                        style={{ borderBottom: "1px solid #f5f5fb" }}>
                        <div className="flex items-center gap-3">

                          {/* Avatar */}
                          <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black"
                              style={{
                                background: isFullAccess
                                  ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                                  : `linear-gradient(135deg, ${avatarColor}dd, ${avatarColor})`,
                                boxShadow: `0 2px 8px ${avatarColor}35`,
                              }}>
                              {getInitials(user.name)}
                            </div>
                            {isAdmin && user.face_embedding && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white flex items-center justify-center"
                                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold truncate" style={{ color: "#0f172a" }}>
                                {user.name}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                                style={{ background: badgeStyle.bg, color: badgeStyle.text, border: `1px solid ${badgeStyle.border}` }}>
                                {ROLE_ICON[user.role] || "👤"} {ROLE_LABEL[user.role] ?? user.role}
                              </span>
                              {(isAdmin || isKepala) && user.shift && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                                  style={user.shift === "PAGI"
                                    ? { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }
                                    : { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                                  {user.shift === "PAGI" ? "🌅" : "🌆"} {user.shift}
                                </span>
                              )}
                              {isAdmin && !user.password_set && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                                  style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }}>
                                  🔑 Belum PW
                                </span>
                              )}
                              {isAdmin && user.force_logout_at && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                                  style={{ background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }}>
                                  🚪 Forced Out
                                </span>
                              )}
                            </div>
                            {(isAdmin || isKepala) && user.phone_number && (
                              <p className="text-[11px] mt-0.5 text-gray-400 font-medium">{user.phone_number}</p>
                            )}
                          </div>

                          {/* ── Actions — selalu tampil, tidak perlu hover ── */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {currentUserInfo && user.id !== currentUserInfo.id && (
                              <ActionBtn
                                onClick={() => openChat({ id: user.id, name: user.name, role: user.role })}
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
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column ── */}
          {showOnlinePanel && (
            <div className="hidden lg:flex flex-col gap-3 w-72 flex-shrink-0 sticky top-6 self-start">
              {isAdmin && (
                <div className="px-4 py-3.5 rounded-2xl flex items-start gap-3"
                  style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "#dbeafe" }}>
                    <svg className="w-4 h-4" style={{ color: "#1d4ed8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold" style={{ color: "#1d4ed8" }}>Auto-logout 03:00 WIB</p>
                    <p className="text-[10.5px] mt-0.5 leading-relaxed" style={{ color: "#3b82f6" }}>
                      Session diakhiri otomatis. Gunakan 🚪 untuk paksa logout manual.
                    </p>
                  </div>
                </div>
              )}
              <OnlineUsersPanel />
            </div>
          )}
        </div>

        {/* ── Mobile Online Panel ── */}
        {showOnlinePanel && (
          <div className="lg:hidden space-y-3">
            <OnlineUsersPanel />
          </div>
        )}

      </div>

      <style jsx>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
        .animate-slideIn { animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-scaleIn { animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </DashboardLayout>
  );
}