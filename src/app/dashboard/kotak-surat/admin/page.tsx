"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Masukan {
  id: string;
  message: string;
  created_at: string;
}

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KotakSuratAdminPage() {
  const [list, setList] = useState<Masukan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kotak-surat/admin", { cache: "no-store" });
      const json = await res.json();
      if (json.success) setList(json.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus masukan ini? Tindakan tidak bisa dibatalkan.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/kotak-surat/admin?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) setList((prev) => prev.filter((it) => it.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout>
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Kotak Surat — Semua Masukan
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Semua masukan karyawan bersifat <span className="font-semibold">anonim</span>.
          Identitas pengirim tidak ditampilkan. Total:{" "}
          <span className="font-semibold text-indigo-600">{list.length}</span> masukan.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">
          Belum ada masukan yang masuk.
        </p>
      ) : (
        <div className="space-y-3">
          {list.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                  {item.message}
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  {formatTanggal(item.created_at)}
                </p>
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                title="Hapus masukan"
                className="flex-shrink-0 self-start p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}