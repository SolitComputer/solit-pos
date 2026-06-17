"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { OnlineUsersPanel } from "@/components/layout/OnlineUsersPanel";
import { getCurrentUserClient } from "@/lib/auth-client";
import { ChatManager } from "@/components/ui/ChatBubble";
import { GroupChatPanel } from "@/components/ui/GroupChatPanel";

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
  "PKL", "CUSTOMER_SERVICE",
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
  KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing", KEPALA_TEKNISI: "Kepala Teknisi",
  CREW_SALES: "Crew Sales", SOTECH: "Sotech", ACCOUNTING: "Accounting",
  PENGELOLA_BARANG: "Pengelola Barang", TEKNISI: "Teknisi", PENGANTARAN: "Pengantaran",
  MARKETING: "Marketing", KEBERSIHAN: "Kebersihan",
  PENYEDIA_BARANG: "Penyedia Barang", KEPALA_PENYEDIA_BARANG: "Kepala Penyedia Barang",
  KONTEN: "Konten",
  KEPALA_ONPOINT: "Kepala Onpoint",
  ONPOINT: "Onpoint",
  KEPALA_SOTECH: "Kepala Sotech",
  PKL: "PKL",
  CUSTOMER_SERVICE: "Customer Service",
};

const ROLE_ICON: Record<string, string> = {
  ADMIN: "👑", PROGRAMMER: "💻", ASISTEN_CEO: "🤝",
  KEPALA_SALES: "📊", KEPALA_MARKETING: "🎯", KEPALA_TEKNISI: "🔩",
  CREW_SALES: "💼", SOTECH: "🛠️", ACCOUNTING: "💰",
  PENGELOLA_BARANG: "📦", TEKNISI: "🔧", PENGANTARAN: "🚚",
  MARKETING: "📱", KEBERSIHAN: "🧹",
  PENYEDIA_BARANG: "🏭", KEPALA_PENYEDIA_BARANG: "🏢", KONTEN: "📝",
  KEPALA_ONPOINT: "🎯",
  ONPOINT: "📍",
  KEPALA_SOTECH: "⚙️",
  PKL: "🎓",
  CUSTOMER_SERVICE: "🎧",
};

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-violet-100 text-violet-700 border-violet-200",
  PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
  ASISTEN_CEO: "bg-purple-100 text-purple-700 border-purple-200",
  KEPALA_SALES: "bg-emerald-100 text-emerald-700 border-emerald-200",
  KEPALA_MARKETING: "bg-rose-100 text-rose-700 border-rose-200",
  KEPALA_TEKNISI: "bg-red-100 text-red-700 border-red-200",
  CREW_SALES: "bg-sky-100 text-sky-700 border-sky-200",
  SOTECH: "bg-lime-100 text-lime-700 border-lime-200",
  ACCOUNTING: "bg-amber-100 text-amber-700 border-amber-200",
  PENGELOLA_BARANG: "bg-blue-100 text-blue-700 border-blue-200",
  TEKNISI: "bg-orange-100 text-orange-700 border-orange-200",
  PENGANTARAN: "bg-teal-100 text-teal-700 border-teal-200",
  MARKETING: "bg-pink-100 text-pink-700 border-pink-200",
  KEBERSIHAN: "bg-cyan-100 text-cyan-700 border-cyan-200",
  PENYEDIA_BARANG: "bg-yellow-100 text-yellow-700 border-yellow-200",
  KEPALA_PENYEDIA_BARANG: "bg-orange-100 text-orange-700 border-orange-200",
  KONTEN: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  KEPALA_ONPOINT: "bg-green-100 text-green-700 border-green-200",
  ONPOINT: "bg-emerald-100 text-emerald-700 border-emerald-200",
  KEPALA_SOTECH: "bg-lime-100 text-lime-700 border-lime-200",
  PKL: "bg-slate-100 text-slate-600 border-slate-200",
  CUSTOMER_SERVICE: "bg-sky-100 text-sky-700 border-sky-200",
};

// Accent color for stat cards left border
const STAT_ACCENT: Record<string, string> = {
  "Total User": "border-l-slate-400",
  "Akses Penuh": "border-l-violet-400",
  "Wajah Terdaftar": "border-l-emerald-400",
  "Belum Set PW": "border-l-amber-400",
};

const FULL_ACCESS_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);
const KEPALA_ROLES = new Set([
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
]);

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium flex items-center gap-3 animate-slideIn border ${
      type === "ok"
        ? "bg-white text-gray-700 border-gray-200"
        : "bg-white text-red-600 border-red-200"
    }`}>
      {type === "ok"
        ? <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
        : <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </div>
      }
      {msg}
    </div>
  );
}

// ── RoleSelect ────────────────────────────────────────────────────────────────
function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
    >
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
        {["CREW_SALES", "SOTECH", "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN"].map(r => (
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
      <optgroup label="— Magang —">
        <option value="PKL">🎓 PKL</option>
      </optgroup>
      <optgroup label="— Layanan —">
        <option value="CUSTOMER_SERVICE">🎧 Customer Service</option>
      </optgroup>
    </select>
  );
}

// ── CreateUserModal ────────────────────────────────────────────────────────────
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-white text-sm">Tambah User Baru</p>
              <p className="text-xs text-slate-400 mt-0.5">Admin membuat akun, user set password sendiri</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2.5 rounded-xl flex items-center gap-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nama Lengkap</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="contoh: Budi Santoso"
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e]/30 transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nomor WhatsApp</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08123456789"
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e]/30 transition" />
            <p className="text-[10px] text-gray-400 mt-1.5">Digunakan sebagai username login</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Role</label>
            <RoleSelect value={role} onChange={setRole} />
            {FULL_ACCESS_ROLES.has(role) && (
              <p className="text-[10px] text-violet-600 mt-1.5 flex items-center gap-1 bg-violet-50 px-2.5 py-1.5 rounded-lg border border-violet-100">
                ⚠️ Role ini memiliki akses penuh ke semua fitur
              </p>
            )}
            {role === "PKL" && (
              <p className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                🎓 Akses terbatas: lihat laptop, buat payment, scanner
              </p>
            )}
            {role === "CUSTOMER_SERVICE" && (
              <p className="text-[10px] text-sky-600 mt-1.5 flex items-center gap-1 bg-sky-50 px-2.5 py-1.5 rounded-lg border border-sky-100">
                🎧 Akses layanan pelanggan — konfigurasi lanjut menyusul
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Shift Kerja</label>
            <div className="flex gap-2">
              {(["PAGI", "SORE"] as const).map(s => (
                <button key={s} type="button" onClick={() => setShift(s)}
                  className={`flex-1 h-10 rounded-xl text-xs font-semibold border transition ${shift === s ? "bg-[#1a1a2e] text-white border-[#1a1a2e] shadow-sm" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}>
                  {s === "PAGI" ? "🌅 Pagi" : "🌆 Sore"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">{shift === "PAGI" ? "07.30 – 12.00 WIB" : "14.00 – 18.00 WIB"}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
            <p className="text-[11px] text-amber-700 font-semibold">ℹ️ Cara kerja</p>
            <p className="text-[10px] text-amber-600 mt-1 leading-relaxed">Setelah akun dibuat, user login pertama kali dengan nomor WA ini. Sistem akan meminta mereka membuat password sendiri.</p>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3 border-t border-gray-100 pt-4">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Membuat...</> : "✅ Buat Akun"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EditUserModal ──────────────────────────────────────────────────────────────
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white text-sm font-bold">
              {user.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-white text-sm">Edit User</p>
              <p className="text-xs text-slate-400 mt-0.5">{user.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2.5 rounded-xl flex items-center gap-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nama</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e]/30 transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nomor WhatsApp</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e]/30 transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Role</label>
            <RoleSelect value={role} onChange={setRole} />
            {FULL_ACCESS_ROLES.has(role) && (
              <p className="text-[10px] text-violet-600 mt-1.5 flex items-center gap-1 bg-violet-50 px-2.5 py-1.5 rounded-lg border border-violet-100">
                ⚠️ Role ini memiliki akses penuh ke semua fitur
              </p>
            )}
            {role === "PKL" && (
              <p className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                🎓 Akses terbatas: lihat laptop, buat payment, scanner
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Shift</label>
            <div className="flex gap-2">
              {(["PAGI", "SORE"] as const).map(s => (
                <button key={s} type="button" onClick={() => setShift(s)}
                  className={`flex-1 h-10 rounded-xl text-xs font-semibold border transition ${shift === s ? "bg-[#1a1a2e] text-white border-[#1a1a2e] shadow-sm" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}>
                  {s === "PAGI" ? "🌅" : "🌆"} {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3 border-t border-gray-100 pt-4">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ConfirmLogoutModal ─────────────────────────────────────────────────────────
function ConfirmLogoutModal({ user, onClose, onConfirm, loading }: {
  user: User; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scaleIn">
        <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🚪</span>
        </div>
        <h3 className="font-bold text-gray-800 text-center text-base mb-1">Paksa Logout {user.name}?</h3>
        <p className="text-sm text-gray-500 text-center mb-1">Session aktif user ini akan diakhiri.</p>
        <p className="text-[11px] text-gray-400 text-center mb-5">User akan di-redirect ke halaman login saat membuka/reload halaman.</p>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${FULL_ACCESS_ROLES.has(user.role) ? "bg-violet-600" : "bg-[#1a1a2e]"}`}>
            {user.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{user.name}</p>
            <p className="text-[11px] text-gray-400">{ROLE_LABEL[user.role] ?? user.role} · {user.shift}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">Batal</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 h-10 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Proses...</> : "🚪 Ya, Logout"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ActionButton helper ────────────────────────────────────────────────────────
function ActionBtn({
  onClick, title, colorClass, children,
}: {
  onClick: () => void; title: string; colorClass: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${colorClass}`}
    >
      {children}
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
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
  const [activeChats, setActiveChats] = useState<Array<{ user: { id: string; name: string; role: string } }>>([]);
  const [showGroupChat, setShowGroupChat] = useState(false);

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

  const openChat = (targetUser: User) => {
    if (!currentUserInfo || targetUser.id === currentUserInfo.id) return;
    setActiveChats(prev => {
      if (prev.some(c => c.user.id === targetUser.id)) return prev;
      const limited = prev.length >= 3 ? prev.slice(1) : prev;
      return [...limited, { user: { id: targetUser.id, name: targetUser.name, role: targetUser.role } }];
    });
  };

  const closeChat = (userId: string) => {
    setActiveChats(prev => prev.filter(c => c.user.id !== userId));
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmReset(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scaleIn">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">😶</span>
            </div>
            <h3 className="font-bold text-gray-800 text-center text-base mb-1">Reset Wajah {confirmReset.name}?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">User harus scan ulang wajah saat login berikutnya.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReset(null)} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Batal</button>
              <button onClick={() => handleReset(confirmReset)} disabled={resetting === confirmReset.id}
                className="flex-1 h-10 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {resetting === confirmReset.id ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
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
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#1a1a2e] flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Manajemen User</h1>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 ml-10.5">
              {isAdmin
                ? "Kelola akun, role, shift, dan wajah karyawan"
                : isKepala
                  ? "Lihat detail dan chat dengan anggota tim"
                  : "Lihat dan chat dengan rekan kerja"
              }
            </p>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { if (currentUserInfo) setShowGroupChat(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
              Grup Chat
            </button>
            {isAdmin && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] active:scale-95 transition shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tambah User
              </button>
            )}
          </div>
        </div>

        {/* ── Stat Cards — admin only ── */}
        {!loading && isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total User", value: users.length, icon: "👥", color: "text-gray-800", sub: "terdaftar" },
              { label: "Akses Penuh", value: fullAccess, icon: "🔑", color: "text-violet-700", sub: "admin & programmer" },
              { label: "Wajah Terdaftar", value: enrolled, icon: "😊", color: "text-emerald-700", sub: "dari " + users.length + " user" },
              { label: "Belum Set PW", value: pwNotSet, icon: "⚠️", color: pwNotSet > 0 ? "text-amber-700" : "text-gray-400", sub: pwNotSet > 0 ? "perlu perhatian" : "semua aman" },
            ].map(c => (
              <div key={c.label} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 border-l-4 ${STAT_ACCENT[c.label]}`}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xl">{c.icon}</span>
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                </div>
                <p className="text-[11px] font-semibold text-gray-500">{c.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-5 items-start">

          {/* ── Left Column ── */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 space-y-3">
                {/* Search + Sort */}
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1 min-w-0">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Cari nama atau nomor..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full h-9 border border-gray-200 rounded-xl pl-8 pr-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:bg-white transition"
                    />
                    {search && (
                      <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setSortOrder(s => s === "asc" ? "desc" : "asc")}
                    className="h-9 px-3.5 rounded-xl text-[10px] font-bold bg-[#1a1a2e] text-white hover:bg-[#16213e] transition whitespace-nowrap flex-shrink-0 flex items-center gap-1.5"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortOrder === "asc" ? "M3 4h13M3 8h9M3 12h5m11 0l-4-4m4 4l-4 4" : "M3 4h13M3 8h9M3 12h9m-2 4l4-4m-4 4l4 4"} />
                    </svg>
                    {sortOrder === "asc" ? "A–Z" : "Z–A"}
                  </button>
                </div>

                {/* Role Pills */}
                <div className="flex gap-1.5 flex-wrap max-h-[4.5rem] overflow-y-auto pb-0.5 scrollbar-hide">
                  {["Semua", ...ALL_ROLES].map(r => (
                    <button
                      key={r}
                      onClick={() => setFilterRole(r)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition flex-shrink-0 border ${
                        filterRole === r
                          ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                      }`}
                    >
                      {r === "Semua" ? `Semua (${users.length})` : `${ROLE_ICON[r] || ""} ${ROLE_LABEL[r] ?? r}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* User List */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* List Header */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-[#1a1a2e]" />
                  <p className="text-[11px] font-semibold text-gray-600">
                    {filtered.length === users.length
                      ? `${users.length} karyawan`
                      : `${filtered.length} dari ${users.length} karyawan`}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      Wajah terdaftar
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-violet-400" />
                      Akses penuh
                    </span>
                  </div>
                )}
              </div>

              {/* Loading Skeleton */}
              {loading ? (
                <div className="divide-y divide-gray-100">
                  {Array(6).fill(0).map((_, i) => (
                    <div key={i} className="px-4 py-3.5 flex items-center gap-3 animate-pulse">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="h-3 bg-gray-200 rounded-full w-28" />
                          <div className="h-3 bg-gray-100 rounded-full w-16" />
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full w-32" />
                      </div>
                    </div>
                  ))}
                </div>

              ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Tidak ada user ditemukan</p>
                  <p className="text-gray-400 text-xs mt-1">Coba ubah filter atau kata kunci pencarian</p>
                  {(search || filterRole !== "Semua") && (
                    <button onClick={() => { setSearch(""); setFilterRole("Semua"); }}
                      className="mt-3 text-xs text-[#1a1a2e] font-semibold underline underline-offset-2 hover:opacity-70 transition">
                      Reset filter
                    </button>
                  )}
                </div>

              ) : (
                <div className="divide-y divide-gray-50 overflow-y-auto max-h-[calc(100vh-340px)]">
                  {filtered.map(user => (
                    <div key={user.id} className="px-4 py-3 hover:bg-gray-50/70 transition group">
                      <div className="flex items-center gap-3">

                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm ${
                            FULL_ACCESS_ROLES.has(user.role)
                              ? "bg-gradient-to-br from-violet-500 to-purple-700"
                              : (isAdmin && user.face_embedding)
                                ? "bg-gradient-to-br from-[#1a1a2e] to-[#2d2d5e]"
                                : "bg-gradient-to-br from-gray-400 to-gray-500"
                          }`}>
                            {user.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                          </div>
                          {isAdmin && user.face_embedding && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white flex items-center justify-center shadow-sm">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-gray-800 truncate leading-tight">{user.name}</span>

                            {/* Role badge */}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border flex-shrink-0 ${ROLE_BADGE[user.role] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                              {ROLE_ICON[user.role] || "👤"} {ROLE_LABEL[user.role] ?? user.role}
                            </span>

                            {/* Shift — admin & kepala */}
                            {(isAdmin || isKepala) && user.shift && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border flex-shrink-0 ${
                                user.shift === "PAGI"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-blue-50 text-blue-700 border-blue-200"
                              }`}>
                                {user.shift === "PAGI" ? "🌅" : "🌆"} {user.shift}
                              </span>
                            )}

                            {/* Status badges — admin only */}
                            {isAdmin && !user.password_set && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 font-semibold flex-shrink-0">
                                🔑 Belum PW
                              </span>
                            )}
                            {isAdmin && user.force_logout_at && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 font-semibold flex-shrink-0"
                                title={`Logout paksa: ${new Date(user.force_logout_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`}
                              >
                                🚪 Forced Out
                              </span>
                            )}
                          </div>

                          {/* Phone — admin & kepala */}
                          {(isAdmin || isKepala) && (
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                              {user.phone_number
                                ? <span className="flex items-center gap-1">
                                    <svg className="w-2.5 h-2.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    {user.phone_number}
                                  </span>
                                : isAdmin
                                  ? <span className="text-orange-400 italic">Nomor belum diset</span>
                                  : null
                              }
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">

                          {/* Chat — semua user kecuali diri sendiri */}
                          {currentUserInfo && user.id !== currentUserInfo.id && (
                            <ActionBtn
                              onClick={() => openChat(user)}
                              title={`Chat dengan ${user.name}`}
                              colorClass="text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </ActionBtn>
                          )}

                          {/* Edit — admin only */}
                          {isAdmin && (
                            <ActionBtn
                              onClick={() => setEditUser(user)}
                              title="Edit user"
                              colorClass="text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </ActionBtn>
                          )}

                          {/* Reset wajah — admin only */}
                          {isAdmin && user.face_embedding && (
                            <ActionBtn
                              onClick={() => setConfirmReset(user)}
                              title="Reset wajah"
                              colorClass="text-red-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                              </svg>
                            </ActionBtn>
                          )}

                          {/* Paksa logout — admin only */}
                          {isAdmin && (
                            <ActionBtn
                              onClick={() => setConfirmLogoutUser(user)}
                              title={`Paksa logout ${user.name}`}
                              colorClass="text-orange-400 hover:text-orange-600 hover:bg-orange-50"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                              </svg>
                            </ActionBtn>
                          )}
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column — admin & kepala ── */}
          {showOnlinePanel && (
            <div className="hidden lg:flex flex-col gap-3 w-72 flex-shrink-0 sticky top-6 self-start">
              {isAdmin && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-blue-700">Auto-logout 03:00 WIB</p>
                    <p className="text-[11px] text-blue-600 mt-0.5 leading-relaxed">
                      Session diakhiri otomatis setiap 03:00 WIB. Gunakan tombol 🚪 untuk paksa logout manual.
                    </p>
                  </div>
                </div>
              )}
              <OnlineUsersPanel />
            </div>
          )}
        </div>

        {/* ── Mobile: Online Panel ── */}
        {showOnlinePanel && (
          <div className="lg:hidden space-y-3">
            <OnlineUsersPanel />
            {isAdmin && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-blue-700">Auto-logout 03:00 WIB</p>
                  <p className="text-[11px] text-blue-600 mt-0.5">Session diakhiri otomatis setiap 03:00 WIB. Gunakan 🚪 untuk paksa logout manual.</p>
                </div>
              </div>
            )}
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

      {currentUserInfo && (
        <ChatManager
          currentUser={currentUserInfo}
          activeChats={activeChats}
          onClose={closeChat}
        />
      )}

      {showGroupChat && currentUserInfo && (
        <GroupChatPanel
          currentUser={currentUserInfo}
          onClose={() => setShowGroupChat(false)}
        />
      )}
    </DashboardLayout>
  );
}