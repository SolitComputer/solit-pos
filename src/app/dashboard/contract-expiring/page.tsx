"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, AlertCircle, CheckCircle2, Users } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { CareerLevelBadge } from "@/components/contracts/CareerLevelBadge";

interface ExpiringRow {
  id: string;
  name: string;
  career_level: string | null;
  contract_valid_until: string;
  days_left: number;
}

function formatTanggal(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

function labelSisaHari(days: number): string {
  if (days <= 0) return "Habis hari ini";
  if (days === 1) return "Besok habis";
  return `${days} hari lagi`;
}

function badgeClass(days: number): string {
  if (days <= 2) return "bg-red-50 text-red-600 border border-red-200";
  if (days <= 4) return "bg-orange-50 text-orange-600 border border-orange-200";
  return "bg-amber-50 text-amber-600 border border-amber-200";
}

export default function ContractExpiringPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ExpiringRow[]>([]);
  const [windowDays, setWindowDays] = useState(7);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/contracts/expiring", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (!data.success) {
          setError(data.message || "Gagal memuat data kontrak");
          return;
        }
        setRows(data.data ?? []);
        setWindowDays(data.window_days ?? 7);
      } catch {
        if (active) setError("Terjadi kesalahan saat memuat data");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <CalendarClock className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Daftar Kontrak</h1>
          <p className="text-xs text-slate-500">
            Karyawan yang masa kontraknya berakhir dalam {windowDays} hari ke depan (H-{windowDays}).
          </p>
        </div>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-3 py-1.5 rounded-lg">
          <Users className="w-4 h-4" />
          {rows.length} karyawan perlu perpanjangan kontrak
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-slate-300" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">Tidak ada kontrak yang akan habis</p>
            <p className="text-xs text-slate-400 mt-1">
              Belum ada karyawan dengan kontrak berakhir dalam {windowDays} hari ke depan.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{row.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {row.career_level && <CareerLevelBadge level={row.career_level} />}
                    <span className="text-xs text-slate-400">
                      Berakhir {formatTanggal(row.contract_valid_until)}
                    </span>
                  </div>
                </div>
                <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg ${badgeClass(row.days_left)}`}>
                  {labelSisaHari(row.days_left)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </DashboardLayout>
  );
}