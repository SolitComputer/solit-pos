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

export default function KotakSuratPage() {
  const [list, setList] = useState<Masukan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kotak-surat", { cache: "no-store" });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/kotak-surat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Gagal mengirim masukan");
        return;
      }
      setMessage("");
      setList((prev) => [json.data, ...prev]);
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Kotak Surat</h1>
        <p className="text-sm text-slate-500 mt-1">
          Sampaikan masukan, saran, atau keluhan secara{" "}
          <span className="font-semibold text-indigo-600">anonim</span>. Nama kamu
          tidak akan ditampilkan ke siapa pun.
        </p>
      </div>

      {/* Form kirim */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3"
      >
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Tulis masukan kamu di sini..."
          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500/40 focus:bg-white transition"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{message.length}/2000</span>
          <button
            type="submit"
            disabled={submitting || !message.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Mengirim..." : "Kirim Masukan"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>

      {/* Daftar masukan sendiri */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Masukan Saya
        </h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            Kamu belum mengirim masukan apa pun.
          </p>
        ) : (
          list.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm"
            >
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                {item.message}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                {formatTanggal(item.created_at)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
    </DashboardLayout>
  );
}