"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  face_enrolled_at: string | null;
  face_embedding: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  KEPALA_SALES: "Kepala Sales",
  CREW_SALES: "Crew Sales",
  ACCOUNTING: "Accounting",
  PENGELOLA_BARANG: "Pengelola Barang",
  TEKNISI: "Teknisi",
  PENGANTARAN: "Pengantaran",
  MARKETING: "Marketing",
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "bg-gray-100 text-gray-700 border-gray-200",
  KEPALA_SALES: "bg-gray-100 text-gray-700 border-gray-200",
  CREW_SALES: "bg-gray-100 text-gray-700 border-gray-200",
  ACCOUNTING: "bg-gray-100 text-gray-700 border-gray-200",
  PENGELOLA_BARANG: "bg-gray-100 text-gray-700 border-gray-200",
  TEKNISI: "bg-gray-100 text-gray-700 border-gray-200",
  PENGANTARAN: "bg-gray-100 text-gray-700 border-gray-200",
  MARKETING: "bg-gray-100 text-gray-700 border-gray-200",
};

const ROLE_ICON: Record<string, string> = {
  ADMIN: "👑",
  KEPALA_SALES: "📊",
  CREW_SALES: "💼",
  ACCOUNTING: "💰",
  PENGELOLA_BARANG: "📦",
  TEKNISI: "🔧",
  PENGANTARAN: "🚚",
  MARKETING: "📱",
};

// Enhanced Toast Component
function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all duration-300 animate-slideIn ${
      type === "ok"
        ? "bg-gray-100 text-gray-700 border border-gray-200"
        : "bg-red-50 text-red-700 border border-red-200"
    }`}>
      {type === "ok" ? (
        <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      )}
      <span>{msg}</span>
    </div>
  );
}

// Loading Skeleton Component
function UserSkeleton() {
  return (
    <div className="p-4 flex items-center gap-3 animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-gray-200 rounded w-28" />
        <div className="h-3 bg-gray-200 rounded w-40" />
      </div>
      <div className="h-7 bg-gray-200 rounded-lg w-24" />
    </div>
  );
}

// Confirm Modal Component
function ConfirmModal({ user, onConfirm, onCancel, isResetting }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scaleIn">
        <div className="bg-gray-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Reset Wajah?</h3>
              <p className="text-gray-300 text-xs mt-0.5">Aksi ini tidak dapat dibatalkan</p>
            </div>
          </div>
        </div>
        
        <div className="p-5">
          <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{user.name}</p>
                <p className="text-[10px] text-gray-400">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-gray-400">Role:</span>
              <span className="font-semibold text-gray-600">{ROLE_LABEL[user.role] || user.role}</span>
            </div>
          </div>
          
          <div className="space-y-2 mb-5">
            <p className="text-xs text-gray-600 flex items-center gap-2">
              <span className="w-4 h-4 bg-red-100 rounded-full flex items-center justify-center text-[10px] text-red-500">!</span>
              Data wajah akan dihapus
            </p>
            <p className="text-xs text-gray-500">
              User harus melakukan <span className="font-semibold text-gray-600">scan ulang wajah</span> saat login berikutnya.
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200"
            >
              Batal
            </button>
            <button
              onClick={onConfirm}
              disabled={isResetting}
              className="flex-1 h-10 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
            >
              {isResetting ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Proses...</>
              ) : "Ya, Reset"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, icon, color, bg }: any) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-4 ${bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
        </div>
        <div className="text-2xl opacity-70">{icon}</div>
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

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch {
      showToast("Gagal memuat data user", "err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleReset = async (user: User) => {
    setResetting(user.id);
    try {
      const res = await fetch("/api/auth/face-enroll", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Wajah ${user.name} berhasil direset`, "ok");
        fetchUsers();
      } else {
        showToast(data.message ?? "Gagal reset", "err");
      }
    } catch {
      showToast("Terjadi kesalahan", "err");
    } finally {
      setResetting(null);
      setConfirmReset(null);
    }
  };

  const enrolled = users.filter((u) => u.face_embedding).length;
  const notEnrolled = users.length - enrolled;

  return (
    <DashboardLayout>
      {/* Toast Notification */}
      {toast && (
        <Toast 
          msg={toast.msg} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Confirm Modal */}
      {confirmReset && (
        <ConfirmModal
          user={confirmReset}
          onConfirm={() => handleReset(confirmReset)}
          onCancel={() => setConfirmReset(null)}
          isResetting={resetting === confirmReset.id}
        />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Header dengan animasi */}
        <div className="animate-fadeIn">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
            <div className="w-7 h-7 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-md">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
              Manajemen User
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-10">
            Kelola enrollment wajah semua user — <span className="text-gray-600 font-medium">Face Recognition System</span>
          </p>
        </div>

        {/* Stat Cards */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard 
              label="Terdaftar Wajah" 
              value={enrolled} 
              icon="😊" 
              color="text-gray-700" 
              bg="bg-gradient-to-r from-gray-50/50 to-white"
            />
            <StatCard 
              label="Belum Terdaftar" 
              value={notEnrolled} 
              icon="😐" 
              color="text-gray-600" 
              bg="bg-gradient-to-r from-gray-50/50 to-white"
            />
          </div>
        )}

        {/* User List dengan desain modern */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header Tabel */}
          <div className="hidden md:grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">User</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Informasi</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Status Wajah</p>
          </div>

          {loading ? (
            <div className="divide-y divide-gray-50">
              {Array(6).fill(0).map((_, i) => (
                <UserSkeleton key={i} />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3 animate-bounce">👥</div>
              <p className="text-gray-500 font-medium text-sm">Belum ada user</p>
              <p className="text-gray-400 text-xs mt-1">User akan muncul setelah registrasi</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((user, idx) => (
                <div 
                  key={user.id} 
                  className={`group p-4 transition-all duration-200 hover:bg-gray-50 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    {/* Avatar dengan status */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="relative">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md ${
                          user.face_embedding 
                            ? "bg-gray-600" 
                            : "bg-gray-400"
                        }`}>
                          {user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                        </div>
                        {user.face_embedding && (
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-white flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          </div>
                        )}
                      </div>

                      {/* User Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition">
                            {user.name}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${ROLE_COLOR[user.role] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            <span>{ROLE_ICON[user.role] || "👤"}</span>
                            {ROLE_LABEL[user.role] ?? user.role}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                        </div>
                      </div>
                    </div>

                    {/* Face Status & Action */}
                    <div className="flex items-center justify-between md:justify-end gap-3 pl-14 md:pl-0">
                      {user.face_embedding ? (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-full border border-gray-200">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-[10px] text-gray-700 font-semibold">
                                Terdaftar
                              </span>
                            </div>
                            {user.face_enrolled_at && (
                              <div className="hidden sm:flex items-center gap-1">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="4" width="18" height="18" rx="2" />
                                  <line x1="16" y1="2" x2="16" y2="6" />
                                  <line x1="8" y1="2" x2="8" y2="6" />
                                  <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                <span className="text-[10px] text-gray-400">
                                  {new Date(user.face_enrolled_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })}
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setConfirmReset(user)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 transition-all duration-200 group/btn"
                          >
                            <svg className="w-3.5 h-3.5 group-hover/btn:rotate-12 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                            </svg>
                            <span>Reset</span>
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-full border border-gray-200">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            <span className="text-[10px] text-gray-600 font-semibold">Belum daftar</span>
                          </div>
                          <div className="w-8" /> {/* Spacer untuk alignment */}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar untuk enrollment (dekoratif) */}
                  {user.face_embedding && (
                    <div className="mt-2 ml-14">
                      <div className="h-0.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-500 rounded-full w-full" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        {!loading && users.length > 0 && (
          <div className="flex items-center justify-between text-[10px] text-gray-400 pt-2">
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 bg-gray-300 rounded-full" />
              <span>Total {users.length} user aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>Terdaftar wajah</span>
              <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              <span>Belum terdaftar</span>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
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
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.3s ease-out; }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-bounce {
          animation: bounce 1s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </DashboardLayout>
  );
}