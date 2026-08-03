"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Clock, Check, X, ShieldAlert } from "lucide-react";
import { getCurrentUserClient } from "@/lib/auth-client";

const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: ["CREW_SALES", "SOTECH", "PENGANTARAN", "KEPALA_SALES", "PKL_SALES", "PKL", "PKL_PENGANTARAN"],
  KEPALA_MARKETING: ["MARKETING", "KONTEN", "KEPALA_MARKETING", "PKL_MARKETING", "PKL_KONTEN", "PKL"],
  KEPALA_TEKNISI: ["TEKNISI", "PENGELOLA_BARANG", "CUSTOMER_SERVICE", "KEPALA_TEKNISI", "PKL_TEKNISI", "PKL_CUSTOMER_SERVICE", "PKL"],
  KEPALA_ONPOINT: ["ONPOINT", "KEPALA_ONPOINT", "PKL_ONPOINT", "PKL"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PENGELOLA_BARANG", "KEPALA_PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG", "PKL"],
  KEPALA_SOTECH: ["SOTECH", "KEPALA_SOTECH", "PKL_SOTECH", "PKL"],
  KEPALA_PENGELOLA_BARANG: ["PENGELOLA_BARANG", "TEKNISI", "CUSTOMER_SERVICE", "KEPALA_PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG", "PKL_TEKNISI", "PKL"],
};
function canApproveMulti(userRoles: string[], targetRole: string): boolean {
  return userRoles.some(r => FULL_ACCESS.includes(r) || (DIVISION_HEAD_MAP[r]?.includes(targetRole) ?? false));
}

type EarlyCheckoutRequest = {
  id: string;
  user_id: string;
  request_date: string;
  requested_at: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  created_at: string;
  users?: { id: string; name: string; role: string } | null;
};

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export default function EarlyCheckoutPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<EarlyCheckoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => { getCurrentUserClient().then(setCurrentUser); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === "PENDING" ? "?status=PENDING" : "";
      const r = await fetch(`/api/attendance/early-checkout${qs}`);
      const d = await r.json();
      if (d.success) setRequests(d.data || []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const approve = async (id: string) => {
    setBusyId(id); setError("");
    try {
      const res = await fetch("/api/attendance/early-checkout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "APPROVE" }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyetujui"); return; }
      fetchData();
    } finally { setBusyId(null); }
  };

  const reject = async (id: string) => {
    setBusyId(id); setError("");
    try {
      const res = await fetch("/api/attendance/early-checkout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "REJECT", rejection_note: rejectNote.trim() || null }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menolak"); return; }
      setRejectingId(null); setRejectNote("");
      fetchData();
    } finally { setBusyId(null); }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h1 className="text-xl font-black text-gray-900">Izin Pulang Cepat</h1>
              <p className="text-xs text-gray-400 mt-0.5">Persetujuan absen pulang sebelum jadwal pulang</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setFilter("PENDING")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === "PENDING" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
            >Menunggu</button>
            <button
              onClick={() => setFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === "ALL" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
            >Semua</button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />{error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array(3).fill(0).map((_, i) => <div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse" />)}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400 font-medium">
                {filter === "PENDING" ? "Tidak ada pengajuan menunggu" : "Belum ada pengajuan"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {requests.map(r => (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[11px] font-black flex-shrink-0">
                      {initials(r.users?.name ?? "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-bold text-gray-800 text-sm">{r.users?.name ?? "Unknown"}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          r.status === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200"
                          : r.status === "APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-red-50 text-red-600 border-red-200"
                        }`}>
                          {r.status === "PENDING" ? "Menunggu" : r.status === "APPROVED" ? "Disetujui" : "Ditolak"}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mb-1.5">
                        {new Date(r.request_date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </p>
                      <p className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">{r.reason}</p>
                      {r.status === "REJECTED" && r.rejection_note && (
                        <p className="text-[11px] text-red-500 mt-1.5">Alasan ditolak: {r.rejection_note}</p>
                      )}
                    </div>
                  </div>

                  {r.status === "PENDING" && canApproveMulti(
                    Array.isArray(currentUser?.roles) && currentUser.roles.length > 0 ? currentUser.roles : [currentUser?.role],
                    r.users?.role ?? ""
                  ) && (
                    <div className="mt-3 pl-[52px]">
                      {rejectingId === r.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            placeholder="Alasan penolakan (opsional)"
                            className="w-full h-9 border border-gray-200 rounded-xl px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-400/20"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => reject(r.id)} disabled={busyId === r.id}
                              className="h-8 px-3 bg-red-600 text-white rounded-lg text-[11px] font-bold hover:bg-red-700 disabled:opacity-50">
                              Konfirmasi Tolak
                            </button>
                            <button onClick={() => { setRejectingId(null); setRejectNote(""); }}
                              className="h-8 px-3 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-semibold hover:bg-gray-200">
                              Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => approve(r.id)} disabled={busyId === r.id}
                            className="flex items-center gap-1 h-8 px-3 bg-emerald-600 text-white rounded-lg text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50">
                            <Check className="w-3 h-3" /> Setujui
                          </button>
                          <button onClick={() => setRejectingId(r.id)} disabled={busyId === r.id}
                            className="flex items-center gap-1 h-8 px-3 bg-white border border-red-200 text-red-600 rounded-lg text-[11px] font-bold hover:bg-red-50 disabled:opacity-50">
                            <X className="w-3 h-3" /> Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}