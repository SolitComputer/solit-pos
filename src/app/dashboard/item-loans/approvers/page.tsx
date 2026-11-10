// src/app/dashboard/item-loans/approvers/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Shield, Search, X, Check, UserPlus, UserMinus,
  ArrowLeft, AlertTriangle, Users,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Approver {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  added_at: string;
  added_by_name: string;
  note: string | null;
}

interface AppUser {
  id: string;
  name: string;
  role: string;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function ApproversContent() {
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [isStrict, setIsStrict] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actingUserId, setActingUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, uRes] = await Promise.all([
        fetch("/api/item-loans/approvers"),
        fetch("/api/users"),
      ]);
      const aJson = await aRes.json();
      const uJson = await uRes.json();
      if (aJson.success) {
        setApprovers(aJson.data.approvers ?? []);
        setIsStrict(aJson.data.is_strict ?? false);
      }
      if (uJson.success) setAllUsers(uJson.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const approverIds = useMemo(() => new Set(approvers.map(a => a.user_id)), [approvers]);

  // Filter user untuk dropdown pilih (exclude yg sudah jadi approver)
  const availableUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers
      .filter(u => !approverIds.has(u.id))
      .filter(u => !q || u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers, approverIds, search]);

  const handleToggle = async (user_id: string, action: "ADD" | "REMOVE", userName: string) => {
    if (action === "REMOVE") {
      if (!confirm(`Hapus ${userName} dari daftar approver?\n\nSetelah dihapus, mereka TIDAK bisa Approve/Reject peminjaman lagi.`)) return;
    }
    setActingUserId(user_id);
    try {
      const res = await fetch("/api/item-loans/approvers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, user_id }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal"); return; }
      toast.success(action === "ADD" ? `${userName} ditambahkan sebagai approver` : `${userName} dihapus dari approver`);
      fetchData();
    } finally { setActingUserId(null); }
  };

  return (
    <main className="min-h-screen bg-zinc-50 p-3 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-3">
            <Link href="/dashboard/item-loans" className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 transition">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/25">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-bold text-zinc-900 truncate">Pengaturan Approver Peminjaman</h1>
              <p className="text-[11.5px] text-zinc-400 mt-0.5">Atur siapa yang boleh Approve/Reject pengajuan pinjam barang</p>
            </div>
          </div>
        </div>

        {/* Status banner */}
        {!loading && (
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${isStrict
            ? "bg-emerald-50 border-emerald-200"
            : "bg-amber-50 border-amber-200"}`}>
            {isStrict ? <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />}
            <div className="flex-1">
              <p className={`text-xs font-bold ${isStrict ? "text-emerald-800" : "text-amber-800"}`}>
                {isStrict
                  ? `Whitelist AKTIF — ${approvers.length} user terdaftar sebagai approver`
                  : "Whitelist KOSONG — sementara masih pakai role lama"}
              </p>
              <p className={`text-[11px] mt-1 leading-relaxed ${isStrict ? "text-emerald-700" : "text-amber-700"}`}>
                {isStrict
                  ? "Hanya user di daftar bawah yang bisa Approve/Reject pengajuan pinjam barang. User lain (bahkan Kepala) tidak bisa ACC."
                  : "Belum ada user ditetapkan sebagai approver. Sementara ini, role existing (Kepala Admin Barang, dll) masih bisa ACC. Setelah kamu add minimal 1 user, mode STRICT otomatis aktif."}
              </p>
            </div>
          </div>
        )}

        {/* Approver List */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-bold text-zinc-800">Approver Aktif</h3>
            <span className="ml-auto text-xs text-zinc-400 tabular-nums">{approvers.length} orang</span>
          </div>
          {loading ? (
            <div className="py-10 text-center">
              <div className="w-6 h-6 border-2 border-zinc-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : approvers.length === 0 ? (
            <div className="py-10 text-center">
              <Shield className="w-10 h-10 text-zinc-200 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 font-medium">Belum ada approver</p>
              <p className="text-[11px] text-zinc-400 mt-1">Tambahkan user dari daftar di bawah</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {approvers.map(a => (
                <div key={a.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate">{a.user_name}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {a.user_role} · ditambah {fmtDate(a.added_at)} oleh {a.added_by_name}
                    </p>
                  </div>
                  <button onClick={() => handleToggle(a.user_id, "REMOVE", a.user_name)}
                    disabled={actingUserId !== null}
                    className="h-8 px-3 rounded-lg text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0">
                    {actingUserId === a.user_id ? (
                      <div className="w-3 h-3 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
                    ) : (
                      <UserMinus size={12} />
                    )}
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add User Picker */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-bold text-zinc-800">Tambah Approver</h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama user atau role..."
                className="w-full h-9 border border-zinc-200 rounded-xl pl-9 pr-8 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {availableUsers.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                {search ? "Tidak ada user cocok" : "Semua user sudah jadi approver"}
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-1">
                {availableUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 rounded-lg transition">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{u.name}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{u.role}</p>
                    </div>
                    <button onClick={() => handleToggle(u.id, "ADD", u.name)}
                      disabled={actingUserId !== null}
                      className="h-8 px-3 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0">
                      {actingUserId === u.id ? (
                        <div className="w-3 h-3 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
                      ) : (
                        <UserPlus size={12} />
                      )}
                      Jadikan Approver
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ApproversPage() {
  return (
    <DashboardLayout>
      <ApproversContent />
    </DashboardLayout>
  );
}