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

const ALL_ROLES = [
  // Full access
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  // Management
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  // Operational
  "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGELOLA_BARANG",
  "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN",
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN:            "Admin",
  PROGRAMMER:       "Programmer",
  ASISTEN_CEO:      "Asisten CEO",
  KEPALA_SALES:     "Kepala Sales",
  KEPALA_MARKETING: "Kepala Marketing",
  KEPALA_TEKNISI:   "Kepala Teknisi",
  CREW_SALES:       "Crew Sales",
  SOTECH:           "Sotech",
  ACCOUNTING:       "Accounting",
  PENGELOLA_BARANG: "Pengelola Barang",
  TEKNISI:          "Teknisi",
  PENGANTARAN:      "Pengantaran",
  MARKETING:        "Marketing",
  KEBERSIHAN:       "Kebersihan",
};

const ROLE_ICON: Record<string, string> = {
  ADMIN:            "👑",
  PROGRAMMER:       "💻",
  ASISTEN_CEO:      "🤝",
  KEPALA_SALES:     "📊",
  KEPALA_MARKETING: "🎯",
  KEPALA_TEKNISI:   "🔩",
  CREW_SALES:       "💼",
  SOTECH:           "🛠️",
  ACCOUNTING:       "💰",
  PENGELOLA_BARANG: "📦",
  TEKNISI:          "🔧",
  PENGANTARAN:      "🚚",
  MARKETING:        "📱",
  KEBERSIHAN:       "🧹",
};

// Badge color per role group
const ROLE_BADGE: Record<string, string> = {
  ADMIN:            "bg-violet-100 text-violet-700 border-violet-200",
  PROGRAMMER:       "bg-indigo-100 text-indigo-700 border-indigo-200",
  ASISTEN_CEO:      "bg-purple-100 text-purple-700 border-purple-200",
  KEPALA_SALES:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  KEPALA_MARKETING: "bg-rose-100 text-rose-700 border-rose-200",
  KEPALA_TEKNISI:   "bg-red-100 text-red-700 border-red-200",
  CREW_SALES:       "bg-sky-100 text-sky-700 border-sky-200",
  SOTECH:           "bg-lime-100 text-lime-700 border-lime-200",
  ACCOUNTING:       "bg-amber-100 text-amber-700 border-amber-200",
  PENGELOLA_BARANG: "bg-blue-100 text-blue-700 border-blue-200",
  TEKNISI:          "bg-orange-100 text-orange-700 border-orange-200",
  PENGANTARAN:      "bg-teal-100 text-teal-700 border-teal-200",
  MARKETING:        "bg-pink-100 text-pink-700 border-pink-200",
  KEBERSIHAN:       "bg-cyan-100 text-cyan-700 border-cyan-200",
};

// Full access roles (badge berbeda)
const FULL_ACCESS_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type:"ok"|"err"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-slideIn ${
      type==="ok" ? "bg-gray-100 text-gray-700 border border-gray-200" : "bg-red-50 text-red-700 border border-red-200"
    }`}>
      {type==="ok"
        ? <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        : <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
      }
      {msg}
    </div>
  );
}

// ── CreateUserModal ────────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]     = useState("");
  const [phone, setPhone]   = useState("");
  const [role, setRole]     = useState("CREW_SALES");
  const [shift, setShift]   = useState<"PAGI"|"SORE">("PAGI");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    setError("");
    if (!name.trim() || !phone.trim()) { setError("Nama dan nomor WA wajib diisi"); return; }
    setSaving(true);
    try {
      const res  = await fetch("/api/users", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name:name.trim(), phone_number:phone.trim(), role, shift }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onCreated(); onClose();
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
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
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"/>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nomor WhatsApp</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08123456789"
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"/>
            <p className="text-[10px] text-gray-400 mt-1">Digunakan sebagai username login</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition">
              {/* Group: Full Access */}
              <optgroup label="— Akses Penuh —">
                {["ADMIN","PROGRAMMER","ASISTEN_CEO"].map(r => (
                  <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
                ))}
              </optgroup>
              {/* Group: Management */}
              <optgroup label="— Management —">
                {["KEPALA_SALES","KEPALA_MARKETING","KEPALA_TEKNISI"].map(r => (
                  <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
                ))}
              </optgroup>
              {/* Group: Operasional */}
              <optgroup label="— Operasional —">
                {["CREW_SALES","SOTECH","ACCOUNTING","PENGELOLA_BARANG","TEKNISI","PENGANTARAN","MARKETING","KEBERSIHAN"].map(r => (
                  <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
                ))}
              </optgroup>
            </select>
            {/* Info badge untuk full access */}
            {FULL_ACCESS_ROLES.has(role) && (
              <p className="text-[10px] text-violet-600 mt-1.5 flex items-center gap-1">
                <span>⚠️</span> Role ini memiliki akses penuh ke semua fitur
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Shift Kerja</label>
            <div className="flex gap-2">
              {(["PAGI","SORE"] as const).map(s => (
                <button key={s} type="button" onClick={() => setShift(s)}
                  className={`flex-1 h-10 rounded-xl text-xs font-semibold border transition ${
                    shift===s ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}>
                  {s==="PAGI" ? "🌅 Pagi" : "🌆 Sore"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {shift==="PAGI" ? "07.30 – 12.00 WIB" : "14.00 – 18.00 WIB"}
            </p>
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

// ── EditUserModal ──────────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [name, setName]     = useState(user.name);
  const [phone, setPhone]   = useState(user.phone_number ?? "");
  const [role, setRole]     = useState(user.role);
  const [shift, setShift]   = useState<"PAGI"|"SORE">(user.shift ?? "PAGI");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    setError(""); setSaving(true);
    try {
      const res  = await fetch("/api/users", {
        method:"PUT", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ id:user.id, name, phone_number:phone, role, shift }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onSaved(); onClose();
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
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

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition">
              <optgroup label="— Akses Penuh —">
                {["ADMIN","PROGRAMMER","ASISTEN_CEO"].map(r => (
                  <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
                ))}
              </optgroup>
              <optgroup label="— Management —">
                {["KEPALA_SALES","KEPALA_MARKETING","KEPALA_TEKNISI"].map(r => (
                  <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
                ))}
              </optgroup>
              <optgroup label="— Operasional —">
                {["CREW_SALES","SOTECH","ACCOUNTING","PENGELOLA_BARANG","TEKNISI","PENGANTARAN","MARKETING","KEBERSIHAN"].map(r => (
                  <option key={r} value={r}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</option>
                ))}
              </optgroup>
            </select>
            {FULL_ACCESS_ROLES.has(role) && (
              <p className="text-[10px] text-violet-600 mt-1.5 flex items-center gap-1">
                <span>⚠️</span> Role ini memiliki akses penuh ke semua fitur
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Shift</label>
            <div className="flex gap-2">
              {(["PAGI","SORE"] as const).map(s => (
                <button key={s} type="button" onClick={() => setShift(s)}
                  className={`flex-1 h-10 rounded-xl text-xs font-semibold border transition ${
                    shift===s ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}>
                  {s==="PAGI" ? "🌅" : "🌆"} {s}
                </button>
              ))}
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

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers]               = useState<User[]>([]);
  const [loading, setLoading]           = useState(true);
  const [resetting, setResetting]       = useState<string|null>(null);
  const [confirmReset, setConfirmReset] = useState<User|null>(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [editUser, setEditUser]         = useState<User|null>(null);
  const [toast, setToast]               = useState<{msg:string;type:"ok"|"err"}|null>(null);
  const [search, setSearch]             = useState("");
  const [filterRole, setFilterRole]     = useState("Semua");

  const showToast = (msg: string, type: "ok"|"err") => setToast({ msg, type });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/users");
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch { showToast("Gagal memuat data user", "err"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleReset = async (user: User) => {
    setResetting(user.id);
    try {
      const res  = await fetch("/api/auth/face-enroll", {
        method:"DELETE", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ user_id:user.id }),
      });
      const data = await res.json();
      if (data.success) { showToast(`Wajah ${user.name} berhasil direset`, "ok"); fetchUsers(); }
      else              { showToast(data.message ?? "Gagal reset", "err"); }
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setResetting(null); setConfirmReset(null); }
  };

  const filtered = useMemo(() => {
    return users.filter(u => {
      const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || (u.phone_number ?? "").includes(search);
      const matchRole   = filterRole==="Semua" || u.role===filterRole;
      return matchSearch && matchRole;
    });
  }, [users, search, filterRole]);

  const enrolled    = users.filter(u => u.face_embedding).length;
  const notEnrolled = users.length - enrolled;
  const pwNotSet    = users.filter(u => !u.password_set).length;
  const fullAccess  = users.filter(u => FULL_ACCESS_ROLES.has(u.role)).length;

  return (
    <DashboardLayout>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}

      {/* Confirm Reset Modal */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmReset(null)}/>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-800 mb-2">Reset Wajah {confirmReset.name}?</h3>
            <p className="text-sm text-gray-500 mb-5">User harus scan ulang wajah saat login berikutnya.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReset(null)} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
              <button onClick={() => handleReset(confirmReset)} disabled={resetting===confirmReset.id}
                className="flex-1 h-10 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {resetting===confirmReset.id ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : null}
                Ya, Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { fetchUsers(); showToast("User berhasil dibuat", "ok"); }}/>}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { fetchUsers(); showToast("User berhasil diupdate", "ok"); }}/>}

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
        </div>

        {/* Stat Cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:"Total User",        value:users.length,  icon:"👥", color:"text-gray-800"    },
              { label:"Akses Penuh",        value:fullAccess,    icon:"🔑", color:"text-violet-700"  },
              { label:"Wajah Terdaftar",   value:enrolled,      icon:"😊", color:"text-emerald-700" },
              { label:"Belum Set PW",      value:pwNotSet,      icon:"⚠️", color:pwNotSet>0?"text-amber-700":"text-gray-500" },
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
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition ${
                  filterRole===r ? "bg-[#1a1a2e] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                {r==="Semua" ? "Semua" : `${ROLE_ICON[r]||""} ${ROLE_LABEL[r]??r}`}
              </button>
            ))}
          </div>
        </div>

        {/* User list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-100">
              {Array(6).fill(0).map((_,i) => (
                <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-gray-200"/>
                  <div className="flex-1 space-y-2"><div className="h-3 bg-gray-200 rounded w-28"/><div className="h-3 bg-gray-200 rounded w-40"/></div>
                </div>
              ))}
            </div>
          ) : filtered.length===0 ? (
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
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm ${
                        FULL_ACCESS_ROLES.has(user.role) ? "bg-gradient-to-br from-violet-600 to-purple-700"
                        : user.face_embedding ? "bg-[#1a1a2e]" : "bg-gray-400"
                      }`}>
                        {user.name.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase()}
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
                        {/* Role badge */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${ROLE_BADGE[user.role] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {ROLE_ICON[user.role]||"👤"} {ROLE_LABEL[user.role]??user.role}
                        </span>
                        {/* Full access indicator */}
                        {FULL_ACCESS_ROLES.has(user.role) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-violet-50 text-violet-600 border border-violet-200">
                            🔑 Akses Penuh
                          </span>
                        )}
                        {/* Shift badge */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          user.shift==="PAGI" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {user.shift==="PAGI" ? "🌅 Pagi" : "🌆 Sore"}
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
                      <button onClick={() => setEditUser(user)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition" title="Edit user">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      {user.face_embedding && (
                        <button onClick={() => setConfirmReset(user)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition" title="Reset wajah">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                        </button>
                      )}
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold ml-1 ${
                        user.face_embedding ? "bg-gray-100 text-gray-700 border-gray-200" : "bg-gray-100 text-gray-400 border-gray-200"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${user.face_embedding ? "bg-green-500" : "bg-gray-400"}`}/>
                        {user.face_embedding ? "Wajah ✓" : "Belum"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && users.length>0 && (
          <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1">
            <span>{filtered.length} dari {users.length} user</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500"/>Wajah terdaftar</span>
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-gray-400"/>Belum daftar</span>
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-violet-500"/>Akses penuh</span>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideIn { from { opacity:0; transform:translateX(50px); } to { opacity:1; transform:translateX(0); } }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
      `}</style>
    </DashboardLayout>
  );
}