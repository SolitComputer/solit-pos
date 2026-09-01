"use client";

import { useCallback, useEffect, useState } from "react";
import { Phone, Laptop2, CheckCircle2, XCircle, Send, RefreshCw, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface SalesReportEntry {
  id: string;
  phone_number: string;
  interest: string;
  purchased: boolean;
  filled_by: string;
  filled_by_name: string;
  created_at: string;
}

type Period = "today" | "week" | "month";

const periodLabels: Record<Period, string> = {
  today: "Hari Ini",
  week: "Minggu Ini",
  month: "Bulan Ini",
};

export default function LaporanHarianSalesPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [interest, setInterest] = useState("");
  const [purchased, setPurchased] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [entries, setEntries] = useState<SalesReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [listError, setListError] = useState("");

  const fetchEntries = useCallback(async (p: Period) => {
    try {
      setLoading(true);
      setListError("");
      const res = await fetch(`/api/sales-reports?period=${p}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal mengambil data");
      setEntries(json.data || []);
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(period);
  }, [period, fetchEntries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!phoneNumber.trim() || !interest.trim()) {
      setFormError("Nomor telepon dan minat wajib diisi");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/sales-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phoneNumber.trim(),
          interest: interest.trim(),
          purchased,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menyimpan laporan");

      setPhoneNumber("");
      setInterest("");
      setPurchased(false);
      fetchEntries(period);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/sales-reports?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menghapus");
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      setListError(err.message);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-5 p-3 sm:p-6 pb-16">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">
            Laporan Harian Sales
          </h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Catat setiap chat masuk: nomor telepon, minat, dan status pembelian. Setiap laporan bernilai 1 poin di leaderboard.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200/70 p-4 sm:p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nomor Telepon</label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Minat (Laptop)</label>
            <div className="relative">
              <Laptop2 className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                placeholder="Contoh: Thinkpad T480, RAM 8GB"
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Status</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPurchased(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  purchased ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Beli
              </button>
              <button
                type="button"
                onClick={() => setPurchased(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  !purchased ? "bg-gray-800 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <XCircle className="w-3.5 h-3.5" /> Tidak
              </button>
            </div>
          </div>

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-[#1a1a2e] text-white hover:bg-[#2d2d4a] transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? "Menyimpan..." : "Simpan Laporan"}
          </button>
        </form>

        {/* List */}
        <div className="bg-white rounded-xl border border-gray-200/70 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-[13px] font-semibold text-gray-900">Riwayat Laporan</h2>
            <div className="flex items-center gap-1.5">
              <div className="flex bg-gray-50 rounded-lg border border-gray-200/70 p-0.5">
                {(["today", "week", "month"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      period === p ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => fetchEntries(period)}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {listError && <p className="text-xs text-red-600 px-4 py-3">{listError}</p>}

          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">Belum ada laporan untuk periode ini.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {entries.map((entry) => (
                <div key={entry.id} className="px-4 sm:px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{entry.phone_number}</span>
                      {entry.purchased ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-full px-1.5 py-px">
                          Beli
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 border border-gray-200/60 rounded-full px-1.5 py-px">
                          Belum
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">{entry.interest}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium text-gray-600">{entry.filled_by_name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(entry.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Hapus"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}