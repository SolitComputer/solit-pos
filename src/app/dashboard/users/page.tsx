// src/app/dashboard/users/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

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
}

<<<<<<< HEAD
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  KEPALA_SALES: "Head of Sales",
  CREW_SALES: "Sales Crew",
  ACCOUNTING: "Accounting",
  PENGELOLA_BARANG: "Inventory Manager",
  TEKNISI: "Technician",
  PENGANTARAN: "Delivery",
  MARKETING: "Marketing",
};
=======
const ALL_ROLES = [
  "ADMIN", "KEPALA_SALES", "KEPALA_MARKETING", "CREW_SALES",
  "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "PENGANTARAN",
  "MARKETING", "KEBERSIHAN",
];
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing",
  CREW_SALES: "Crew Sales", ACCOUNTING: "Accounting", PENGELOLA_BARANG: "Pengelola Barang",
  TEKNISI: "Teknisi", PENGANTARAN: "Pengantaran", MARKETING: "Marketing", KEBERSIHAN: "Kebersihan",
};

const ROLE_ICON: Record<string, string> = {
  ADMIN: "👑", KEPALA_SALES: "📊", KEPALA_MARKETING: "🎯", CREW_SALES: "💼",
  ACCOUNTING: "💰", PENGELOLA_BARANG: "📦", TEKNISI: "🔧",
  PENGANTARAN: "🚚", MARKETING: "📱", KEBERSIHAN: "🧹",
};

<<<<<<< HEAD
// Toast Component
=======
// ── Toast ──────────────────────────────────────────────────────────────────
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
<<<<<<< HEAD
    <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-3 transition-all duration-300 animate-slideIn ${
      type === "ok"
        ? "bg-gray-100 text-gray-800 border border-gray-200"
        : "bg-red-50 text-red-800 border border-red-200"
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
        type === "ok" ? "bg-gray-600" : "bg-red-500"
      }`}>
        {type === "ok" ? (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" strokeWidth="3" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" strokeWidth="2.5" />
            <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2.5" />
          </svg>
        )}
      </div>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18" strokeWidth="2" />
          <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2" />
        </svg>
      </button>
=======
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-slideIn ${
      type === "ok" ? "bg-gray-100 text-gray-700 border border-gray-200" : "bg-red-50 text-red-700 border border-red-200"
    }`}>
      {type === "ok"
        ? <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        : <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
      }
      {msg}
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
    </div>
  );
}

<<<<<<< HEAD
// Loading Skeleton Component
function UserSkeleton() {
  return (
    <div className="p-5 flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-32" />
        <div className="h-3 bg-gray-200 rounded w-48" />
      </div>
      <div className="h-8 bg-gray-200 rounded-lg w-28" />
    </div>
  );
}

// Confirm Modal Component
function ConfirmModal({ user, onConfirm, onCancel, isResetting }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="bg-gray-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-700 rounded-2xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Reset Face Data?</h3>
              <p className="text-gray-300 text-xs mt-0.5">This action cannot be undone</p>
            </div>
          </div>
        </div>
        
        {/* Body */}
        <div className="p-6">
          <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gray-600 flex items-center justify-center text-white text-sm font-bold shadow-md">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">{user.name}</p>
                <p className="text-[11px] text-gray-400">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] pt-2 border-t border-gray-100">
              <span className="text-gray-400">Role:</span>
              <span className="font-semibold text-gray-700">{ROLE_LABEL[user.role] || user.role}</span>
            </div>
          </div>
          
          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-red-500 text-xs font-bold">!</span>
              </div>
              <p className="text-xs text-gray-600">Face data will be permanently deleted from the system</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="text-xs text-gray-500">
                User will need to <span className="font-semibold text-gray-700">re-enroll their face</span> on next login
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isResetting}
              className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
            >
              {isResetting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Reset Face
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, icon, subtitle }: any) {
  return (
    <div className="group relative bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-extrabold text-gray-900">{value}</p>
          {subtitle && <p className="text-[11px] text-gray-400 mt-1.5">{subtitle}</p>}
        </div>
        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<User | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
=======
// ── CreateUserModal ────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]     = useState("");
  const [phone, setPhone]   = useState("");
  const [role, setRole]     = useState("CREW_SALES");
  const [shift, setShift]   = useState<"PAGI" | "SORE">("PAGI");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    setError("");
    if (!name.trim() || !phone.trim()) { setError("Nama dan nomor WA wajib diisi"); return; }
    setSaving(true);
    try {
      const res  = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone_number: phone.trim(), role, shift }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onCreated(); onClose();
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#1a1a2e] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-white text-sm">Tambah User Baru</p>
            <p className="text-xs text-slate-400 mt-0.5">Admin membuat akun, user set password sendiri</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl">{error}</div>}

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nama Lengkap</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="contoh: Budi Santoso"
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nomor WhatsApp</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08123456789"
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition" />
            <p className="text-[10px] text-gray-400 mt-1">Digunakan sebagai username login</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition">
                {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Shift Kerja</label>
              <div className="flex gap-2">
                {(["PAGI", "SORE"] as const).map(s => (
                  <button key={s} type="button" onClick={() => setShift(s)}
                    className={`flex-1 h-10 rounded-xl text-xs font-semibold border transition ${
                      shift === s ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}>
                    {s === "PAGI" ? "🌅 Pagi" : "🌆 Sore"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {shift === "PAGI" ? "07.30 – 12.00 WIB" : "14.00 – 18.00 WIB"}
              </p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-amber-700 font-medium">ℹ️ Cara kerja</p>
            <p className="text-[10px] text-amber-600 mt-1">Setelah akun dibuat, user login pertama kali dengan nomor WA ini. Sistem akan meminta mereka membuat password sendiri sebelum bisa masuk.</p>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Membuat...</> : "✅ Buat Akun"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EditUserModal ──────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [name, setName]     = useState(user.name);
  const [phone, setPhone]   = useState(user.phone_number ?? "");
  const [role, setRole]     = useState(user.role);
  const [shift, setShift]   = useState<"PAGI" | "SORE">(user.shift ?? "PAGI");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const res  = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#1a1a2e] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-white text-sm">Edit User</p>
            <p className="text-xs text-slate-400 mt-0.5">{user.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl">{error}</div>}

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nama</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"/>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nomor WhatsApp</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08123456789"
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"/>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition">
                {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Shift</label>
              <div className="flex gap-2">
                {(["PAGI", "SORE"] as const).map(s => (
                  <button key={s} type="button" onClick={() => setShift(s)}
                    className={`flex-1 h-10 rounded-xl text-xs font-semibold border transition ${
                      shift === s ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}>
                    {s === "PAGI" ? "🌅" : "🌆"} {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan...</> : "💾 Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers]             = useState<User[]>([]);
  const [loading, setLoading]         = useState(true);
  const [resetting, setResetting]     = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<User | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [editUser, setEditUser]       = useState<User | null>(null);
  const [toast, setToast]             = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [search, setSearch]           = useState("");
  const [filterRole, setFilterRole]   = useState("Semua");

  const showToast = (msg: string, type: "ok" | "err") => setToast({ msg, type });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/users");
      const data = await res.json();
      if (data.success) setUsers(data.users);
<<<<<<< HEAD
    } catch {
      showToast("Failed to load users", "err");
    } finally {
      setLoading(false);
    }
=======
    } catch { showToast("Gagal memuat data user", "err"); }
    finally   { setLoading(false); }
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleReset = async (user: User) => {
    setResetting(user.id);
    try {
      const res  = await fetch("/api/auth/face-enroll", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
<<<<<<< HEAD
      if (data.success) {
        showToast(`${user.name}'s face data has been reset`, "ok");
        fetchUsers();
      } else {
        showToast(data.message ?? "Reset failed", "err");
      }
    } catch {
      showToast("An error occurred", "err");
    } finally {
      setResetting(null);
      setConfirmReset(null);
    }
=======
      if (data.success) { showToast(`Wajah ${user.name} berhasil direset`, "ok"); fetchUsers(); }
      else              { showToast(data.message ?? "Gagal reset", "err"); }
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setResetting(null); setConfirmReset(null); }
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
  };

  const handleResetPassword = async (user: User) => {
    if (!confirm(`Reset password ${user.name}? Mereka harus set password baru saat login berikutnya.`)) return;
    try {
      const res  = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, _resetPassword: true }),
      });
      const data = await res.json();
      if (data.success) showToast(`Password ${user.name} direset`, "ok");
      else              showToast(data.message ?? "Gagal", "err");
    } catch { showToast("Terjadi kesalahan", "err"); }
  };

  const filtered = useMemo(() => {
    return users.filter(u => {
      const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || (u.phone_number ?? "").includes(search);
      const matchRole   = filterRole === "Semua" || u.role === filterRole;
      return matchSearch && matchRole;
    });
  }, [users, search, filterRole]);

  const enrolled    = users.filter(u => u.face_embedding).length;
  const notEnrolled = users.length - enrolled;
<<<<<<< HEAD
  
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ROLE_LABEL[user.role]?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      {toast && (
        <Toast 
          msg={toast.msg} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

=======
  const pwNotSet    = users.filter(u => !u.password_set).length;

  return (
    <DashboardLayout>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Confirm Reset Modal */}
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmReset(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-800 mb-2">Reset Wajah {confirmReset.name}?</h3>
            <p className="text-sm text-gray-500 mb-5">User harus scan ulang wajah saat login berikutnya.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReset(null)} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
              <button onClick={() => handleReset(confirmReset)} disabled={resetting === confirmReset.id}
                className="flex-1 h-10 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {resetting === confirmReset.id ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : null}
                Ya, Reset
              </button>
            </div>
          </div>
        </div>
      )}

<<<<<<< HEAD
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header Section */}
        <div className="animate-fadeIn">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-8 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
            <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-700 rounded-xl flex items-center justify-center shadow-md">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
              User Management
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-12">
            Manage face enrollment for all users — <span className="text-gray-600 font-medium">Face Recognition System</span>
          </p>
=======
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { fetchUsers(); showToast("User berhasil dibuat", "ok"); }} />
      )}
      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { fetchUsers(); showToast("User berhasil diupdate", "ok"); }} />
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Manajemen User</h1>
            <p className="text-xs text-gray-400 mt-0.5">Kelola akun, role, shift, dan wajah karyawan</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Tambah User
          </button>
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
        </div>

        {/* Stats Cards */}
        {!loading && (
<<<<<<< HEAD
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fadeIn" style={{ animationDelay: "0.1s" }}>
            <StatCard 
              label="Total Users" 
              value={users.length} 
              icon="👥"
              subtitle={`${users.length} registered users`}
            />
            <StatCard 
              label="Face Enrolled" 
              value={enrolled} 
              icon="😊"
              subtitle={`${Math.round((enrolled / users.length) * 100)}% completion rate`}
            />
            <StatCard 
              label="Pending Enrollment" 
              value={notEnrolled} 
              icon="📝"
              subtitle={`${notEnrolled} users need enrollment`}
            />
          </div>
        )}

        {/* User List Section */}
        <div className="animate-fadeIn" style={{ animationDelay: "0.2s" }}>
          {/* Search Bar */}
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" />
              </svg>
              <input
                type="text"
                placeholder="Search users by name, email, or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-500 transition-all duration-200 bg-white"
              />
            </div>
            <button
              onClick={fetchUsers}
              className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-200 group bg-white"
              title="Refresh"
            >
              <svg className="w-4 h-4 text-gray-500 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
=======
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total User",      value: users.length,  icon: "👥", color: "text-gray-800" },
              { label: "Wajah Terdaftar", value: enrolled,      icon: "😊", color: "text-emerald-700" },
              { label: "Belum Daftar",    value: notEnrolled,   icon: "😐", color: "text-gray-500" },
              { label: "Belum Set PW",    value: pwNotSet,      icon: "🔑", color: pwNotSet > 0 ? "text-amber-700" : "text-gray-500" },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{c.label}</p>
                  <span className="text-base opacity-60">{c.icon}</span>
                </div>
                <p className={`text-2xl font-bold mt-1.5 ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <input type="text" placeholder="Cari nama atau nomor WA..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition w-full sm:w-56"/>
          <div className="flex gap-1.5 flex-wrap">
            {["Semua", ...ALL_ROLES].map(r => (
              <button key={r} onClick={() => setFilterRole(r)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition ${filterRole === r ? "bg-[#1a1a2e] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {r === "Semua" ? "Semua" : ROLE_LABEL[r] ?? r}
              </button>
            ))}
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
          </div>
        </div>

<<<<<<< HEAD
          {/* User Cards Grid */}
          {loading ? (
            <div className="space-y-3">
=======
        {/* User list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-100">
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-gray-200"/>
                  <div className="flex-1 space-y-2"><div className="h-3 bg-gray-200 rounded w-28"/><div className="h-3 bg-gray-200 rounded w-40"/></div>
                </div>
              ))}
            </div>
<<<<<<< HEAD
          ) : filteredUsers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-20">
              <div className="text-6xl mb-4 animate-bounce">👥</div>
              <p className="text-gray-500 font-medium text-base">No users found</p>
              <p className="text-gray-400 text-sm mt-1">Try adjusting your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredUsers.map((user, idx) => (
                <div 
                  key={user.id} 
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
                  style={{ animationDelay: `${0.05 * idx}s` }}
                >
                  <div className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Avatar & Info */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="relative">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-base font-bold shadow-lg ${
                            user.face_embedding 
                              ? "bg-gradient-to-br from-gray-600 to-gray-700" 
                              : "bg-gradient-to-br from-gray-400 to-gray-500"
                          }`}>
                            {user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                          </div>
                          {user.face_embedding && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm">
                              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <h3 className="text-base font-bold text-gray-800 group-hover:text-gray-600 transition-colors">
                              {user.name}
                            </h3>
                            <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border font-semibold ${ROLE_COLOR[user.role] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                              <span className="text-xs">{ROLE_ICON[user.role] || "👤"}</span>
                              {ROLE_LABEL[user.role] ?? user.role}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                          </div>
                        </div>
                      </div>

                      {/* Status & Action */}
                      <div className="flex items-center justify-between lg:justify-end gap-4 lg:gap-6">
                        {user.face_embedding ? (
                          <>
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[11px] text-gray-700 font-semibold">
                                  Enrolled
                                </span>
                              </div>
                              {user.face_enrolled_at && (
                                <div className="flex items-center gap-1">
                                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <rect x="3" y="4" width="18" height="18" rx="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  <span className="text-[10px] text-gray-400">
                                    {new Date(user.face_enrolled_at).toLocaleDateString("id-ID", { 
                                      day: "numeric", 
                                      month: "short", 
                                      year: "2-digit" 
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => setConfirmReset(user)}
                              disabled={resetting === user.id}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 transition-all duration-200 disabled:opacity-50"
                            >
                              {resetting === user.id ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                                  Resetting...
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                  </svg>
                                  Reset
                                </>
                              )}
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                            <span className="text-[11px] text-gray-600 font-medium">Not Enrolled</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {user.face_embedding && (
                      <div className="mt-4">
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-gray-600 to-gray-700 rounded-full w-full animate-slideIn" />
                        </div>
                      </div>
                    )}
=======
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-2">👥</div>
              <p className="text-gray-500 text-sm">Tidak ada user ditemukan</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(user => (
                <div key={user.id} className="p-4 hover:bg-gray-50/50 transition">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm ${user.face_embedding ? "bg-[#1a1a2e]" : "bg-gray-400"}`}>
                        {user.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                      </div>
                      {user.face_embedding && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-white flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-green-500"/>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{user.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 font-semibold">
                          {ROLE_ICON[user.role] || "👤"} {ROLE_LABEL[user.role] ?? user.role}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          user.shift === "PAGI" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {user.shift === "PAGI" ? "🌅 Pagi" : "🌆 Sore"}
                        </span>
                        {!user.password_set && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-semibold">
                            🔑 Belum set PW
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.09 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                        </svg>
                        <p className="text-[11px] text-gray-400">
                          {user.phone_number ?? <span className="text-orange-400 italic">Nomor belum diset</span>}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Edit */}
                      <button onClick={() => setEditUser(user)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition" title="Edit user">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>

                      {/* Reset face */}
                      {user.face_embedding && (
                        <button onClick={() => setConfirmReset(user)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition" title="Reset wajah">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                        </button>
                      )}

                      {/* Status badge */}
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold ml-1 ${
                        user.face_embedding ? "bg-gray-100 text-gray-700 border-gray-200" : "bg-gray-100 text-gray-400 border-gray-200"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${user.face_embedding ? "bg-green-500" : "bg-gray-400"}`}/>
                        {user.face_embedding ? "Wajah terdaftar" : "Belum daftar"}
                      </div>
                    </div>
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

<<<<<<< HEAD
        {/* Footer Stats */}
        {!loading && filteredUsers.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-400 pt-2 animate-fadeIn" style={{ animationDelay: "0.3s" }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-gray-600 rounded-full" />
                <span>Enrolled: {enrolled}</span>
              </div>
              <div className="w-px h-3 bg-gray-200" />
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                <span>Pending: {notEnrolled}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Showing {filteredUsers.length} of {users.length} users</span>
=======
        {!loading && users.length > 0 && (
          <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1">
            <span>{filtered.length} dari {users.length} user</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500"/>Wajah terdaftar</span>
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-gray-400"/>Belum daftar</span>
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
<<<<<<< HEAD
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(50px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { width: 0; }
          to { width: 100%; }
        }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.3s ease-out; }
        .animate-slideIn { animation: slideIn 0.4s ease-out; }
        .animate-bounce {
          animation: bounce 1s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
=======
        @keyframes slideIn { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
>>>>>>> e86f43c9bca4e6f620eda1c35b7aa04d5f4052fa
      `}</style>
    </DashboardLayout>
  );
}