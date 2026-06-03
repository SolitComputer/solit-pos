"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  face_enrolled_at: string | null;
  face_embedding: boolean; // kita konversi: ada embedding = true
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
  ADMIN: "bg-violet-50 text-violet-700 border-violet-200",
  KEPALA_SALES: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CREW_SALES: "bg-sky-50 text-sky-700 border-sky-200",
  ACCOUNTING: "bg-amber-50 text-amber-700 border-amber-200",
  PENGELOLA_BARANG: "bg-blue-50 text-blue-700 border-blue-200",
  TEKNISI: "bg-orange-50 text-orange-700 border-orange-200",
  PENGANTARAN: "bg-teal-50 text-teal-700 border-teal-200",
  MARKETING: "bg-pink-50 text-pink-700 border-pink-200",
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<User | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
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
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all ${
          toast.type === "ok"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {toast.type === "ok" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
          {toast.msg}
        </div>
      )}

      {/* Confirm modal */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmReset(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            </div>
            <h3 className="text-gray-800 font-bold text-center text-base mb-1">Reset Wajah?</h3>
            <p className="text-gray-500 text-sm text-center mb-1">
              Data wajah <span className="font-semibold text-gray-700">{confirmReset.name}</span> akan dihapus.
            </p>
            <p className="text-gray-400 text-xs text-center mb-5">
              User harus scan ulang wajah saat login berikutnya.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReset(null)}
                className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
              >
                Batal
              </button>
              <button
                onClick={() => handleReset(confirmReset)}
                disabled={resetting === confirmReset.id}
                className="flex-1 h-10 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resetting === confirmReset.id ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Proses...</>
                ) : "Ya, Reset"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Manajemen User</h1>
            <p className="text-xs text-gray-400 mt-0.5">Kelola enrollment wajah semua user</p>
          </div>
          {!loading && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                {enrolled} terdaftar
              </span>
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                {notEnrolled} belum
              </span>
            </div>
          )}
        </div>

        {/* User list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-50">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-100 rounded w-28" />
                    <div className="h-3 bg-gray-100 rounded w-40" />
                  </div>
                  <div className="h-7 bg-gray-100 rounded-lg w-20" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {users.map((user) => (
                <div key={user.id} className="p-4 flex items-center gap-3 hover:bg-gray-50/50 transition">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{user.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-semibold ${ROLE_COLOR[user.role] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{user.email}</p>
                  </div>

                  {/* Face status + action */}
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    {user.face_embedding ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-[11px] text-emerald-600 font-medium hidden sm:block">
                            {user.face_enrolled_at
                              ? new Date(user.face_enrolled_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                              : "Terdaftar"}
                          </span>
                        </div>
                        <button
                          onClick={() => setConfirmReset(user)}
                          className="text-xs font-semibold text-red-400 hover:text-red-600 transition flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-100"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                          </svg>
                          Reset
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span className="text-[11px] text-amber-600 font-medium">Belum daftar</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}