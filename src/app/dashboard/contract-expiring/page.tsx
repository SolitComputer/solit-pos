"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  CalendarClock,
  CalendarDays,
  Clock3,
  Users,
  Inbox,
  AlertTriangle,
  Search,
  X,
  RotateCcw,
  FileSpreadsheet,
} from "lucide-react";
import { exportKenaikanJenjangExcel } from "@/lib/exportKenaikanJenjang";
import {
  buildCustomRoleLookup,
  getAvatarColor,
  getInitials,
  getRoleLabel,
  type CustomRoleRow,
} from "@/lib/roleMeta";
import { MONTH_NAMES_ID, startOfDay } from "@/lib/birthday";
import { CareerLevelBadge } from "@/components/contracts/CareerLevelBadge";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ApiRow {
  id: string;
  name: string;
  role: string | null;
  career_level: string | null;
  contract_valid_until: string;
  days_left: number;
  next_career_level: string | null;
  contract_duration: string | null;
  contract_duration_months: number | null; // durasi kontrak (bulan): TTD → berlaku sampai
  next_contract_duration: string | null;
}

interface ContractEntry extends ApiRow {
  expiry: Date;
  monthIndex: number;
}

// ── Util kecil ────────────────────────────────────────────────────────────────

const fullDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

// Label durasi untuk kolom "Kontrak Sebelumnya": "X bulan" atau "-".
const durationLabel = (months: number | null): string =>
  months && months > 0 ? `${months} bulan` : "-";

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({
  name,
  role,
  size = "md",
  highlight = false,
}: {
  name: string;
  role: string;
  size?: "md" | "lg";
  highlight?: boolean;
}) {
  const color = getAvatarColor(role);
  const box =
    size === "lg" ? "w-12 h-12 sm:w-14 sm:h-14 text-sm sm:text-base" : "w-11 h-11 text-xs";

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${box} rounded-2xl flex items-center justify-center text-white font-black tracking-tight`}
        style={{
          background: `linear-gradient(135deg, ${color}dd, ${color})`,
          boxShadow: `0 4px 14px ${color}33`,
        }}
      >
        {getInitials(name)}
      </div>
      {highlight && (
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.14)" }}
        >
          <Clock3 className="w-3 h-3" style={{ color: "#d97706" }} />
        </div>
      )}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  value,
  label,
  sub,
  accent,
  muted = false,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  sub: string;
  accent: string;
  muted?: boolean;
}) {
  return (
    <div
      className="bg-white rounded-2xl p-3 sm:p-4 relative overflow-hidden transition-all hover:shadow-md"
      style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
    >
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: accent }} />
      <div className="pl-2.5 sm:pl-3">
        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
          <span style={{ color: muted ? "#cbd5e1" : "#334155" }}>{icon}</span>
          <span
            className="text-2xl sm:text-3xl font-black tabular-nums leading-none"
            style={{ color: muted ? "#cbd5e1" : "#0f172a" }}
          >
            {value}
          </span>
        </div>
        <p className="text-[10.5px] sm:text-[11px] font-bold truncate" style={{ color: "#475569" }}>
          {label}
        </p>
        <p className="text-[9.5px] sm:text-[10px] mt-0.5 truncate" style={{ color: "#94a3b8" }}>
          {sub}
        </p>
      </div>
    </div>
  );
}

// ── Banner: ada kontrak yang habis hari ini ───────────────────────────────────
function TodayBanner({
  people,
  lookup,
}: {
  people: ContractEntry[];
  lookup: Map<string, CustomRoleRow>;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl"
      style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 88% 15%, rgba(236,72,153,0.30) 0%, transparent 58%), radial-gradient(ellipse at 5% 95%, rgba(99,102,241,0.26) 0%, transparent 58%)",
        }}
      />

      {/* konfeti halus — otomatis mati kalau user pilih reduced motion */}
      <div className="confetti pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className={`confetti-bit bit-${i}`} />
        ))}
      </div>

      <div className="relative z-10 px-4 sm:px-6 py-5 sm:py-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock3 className="w-4 h-4 flex-shrink-0" style={{ color: "#fbbf24" }} />
          <p
            className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ color: "#fbbf24" }}
          >
            Kontrak habis hari ini
          </p>
        </div>

        <ul className="space-y-2.5">
          {people.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-3.5 sm:py-3"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <Avatar name={p.name} role={p.role ?? ""} size="lg" highlight />
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-black text-white truncate leading-tight">
                  {p.name}
                </p>
                <p
                  className="text-[10.5px] sm:text-[11.5px] mt-1 truncate"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  {p.role ? getRoleLabel(p.role, lookup) : "—"}
                </p>
                {p.career_level && (
                  <div className="mt-1">
                    <CareerLevelBadge level={p.career_level} />
                  </div>
                )}
                <p
                  className="text-[10.5px] sm:text-[11.5px] font-bold mt-1"
                  style={{ color: "#fbbf24" }}
                >
                  Berakhir {fullDate(p.contract_valid_until)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Tabel Kenaikan Jenjang (gaya foto: header kuning + grid) ──────────────────
function JenjangTable({
  rows,
  lookup,
  busy,
}: {
  rows: ContractEntry[];
  lookup: Map<string, CustomRoleRow>;
  busy: boolean;
}) {
  if (busy) {
    return (
      <div className="py-14 text-center text-xs font-semibold" style={{ color: "#94a3b8" }}>
        Memuat data…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-14 px-5">
        <Inbox className="w-9 h-9 mx-auto mb-3" style={{ color: "#cbd5e1" }} />
        <p className="text-sm font-bold" style={{ color: "#475569" }}>
          Tidak ada data
        </p>
      </div>
    );
  }

  const HEAD = ["NO", "NAMA KARYAWAN", "DIVISI", "KONTRAK SEBELUMNYA", "JENJANG KARIR SEBELUMNYA"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px] sm:text-xs whitespace-nowrap">
        <thead>
          <tr style={{ background: "#FDE047" }}>
            {HEAD.map((h) => (
              <th
                key={h}
                className="px-2.5 py-2 font-black text-center"
                style={{ border: "1px solid #eab308", color: "#1f2937" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id} className="transition-colors hover:bg-amber-50/40">
              <td className="px-2.5 py-1.5 text-center" style={{ border: "1px solid #eef2f7", color: "#64748b" }}>
                {i + 1}
              </td>
              <td className="px-2.5 py-1.5 font-semibold" style={{ border: "1px solid #eef2f7", color: "#0f172a" }}>
                {p.name}
              </td>
              <td className="px-2.5 py-1.5 text-center" style={{ border: "1px solid #eef2f7", color: "#475569" }}>
                {p.role ? getRoleLabel(p.role, lookup) : "-"}
              </td>
              <td className="px-2.5 py-1.5 text-center" style={{ border: "1px solid #eef2f7", color: "#64748b" }}>
                {durationLabel(p.contract_duration_months)}
              </td>
              <td className="px-2.5 py-1.5 text-center" style={{ border: "1px solid #eef2f7", color: "#334155" }}>
                {p.career_level ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Halaman ───────────────────────────────────────────────────────────────────
export default function ContractExpiringPage() {
  const [rows, setRows] = useState<ApiRow[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRoleRow[]>([]);
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(0);
  const [exporting, setExporting] = useState(false);

  // `today` di-set setelah mount supaya HTML server (UTC) dan client (WIB) tidak
  // berbeda → tidak ada hydration mismatch (hanya dipakai untuk default bulan).
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    const now = startOfDay();
    setToday(now);
    setMonth(now.getMonth());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, rolesRes] = await Promise.all([
        fetch("/api/contracts/expiring", { cache: "no-store" }),
        fetch("/api/admin/roles"),
      ]);

      const listData = await listRes.json();
      if (!listData.success) {
        setError(listData.message ?? "Gagal memuat data kontrak");
        return;
      }
      setRows(listData.data ?? []);
      setWindowDays(listData.window_days ?? 30);

      // Role custom opsional — kalau gagal, jatuh ke label bawaan.
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        if (rolesData.success) setCustomRoles(rolesData.roles ?? []);
      }
    } catch {
      setError("Tidak bisa terhubung ke server. Coba muat ulang.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const customLookup = useMemo(() => buildCustomRoleLookup(customRoles), [customRoles]);

  const entries = useMemo<ContractEntry[]>(
    () =>
      rows.map((r) => {
        const expiry = new Date(r.contract_valid_until);
        return { ...r, expiry, monthIndex: expiry.getMonth() };
      }),
    [rows]
  );

  const todayList = useMemo(() => entries.filter((e) => e.days_left <= 0), [entries]);
  const weekCount = useMemo(
    () => entries.filter((e) => e.days_left > 0 && e.days_left <= 7).length,
    [entries]
  );
  const monthCount = useMemo(
    () => (today ? entries.filter((e) => e.monthIndex === today.getMonth()).length : 0),
    [entries, today]
  );

  // Daftar Jenjang Karir — difilter per bulan terpilih + pencarian, urut tanggal.
  const jenjangList = useMemo<ContractEntry[]>(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => e.monthIndex === month)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          a.expiry.getDate() - b.expiry.getDate() || a.name.localeCompare(b.name)
      );
  }, [entries, search, month]);

  const handleExport = useCallback(async () => {
    if (jenjangList.length === 0) return;
    setExporting(true);
    try {
      await exportKenaikanJenjangExcel(
        jenjangList.map((p, i) => ({
          no: i + 1,
          name: p.name,
          role: p.role ? getRoleLabel(p.role, customLookup) : "-",
          next_level: p.next_career_level ?? "-",
          prev_level: p.career_level ?? "-",
          kontrak_prev: durationLabel(p.contract_duration_months),
                    kontrak_next: p.next_contract_duration ?? "-",
        }))
      );
    } catch (e) {
      console.error("Export gagal:", e);
    } finally {
      setExporting(false);
    }
  }, [jenjangList, customLookup]);

  const isBusy = loading || !today;
  const monthLabel = MONTH_NAMES_ID[today?.getMonth() ?? 0];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-3.5 sm:space-y-5">

          {/* ── Header ──────────────────────────────────────────────── */}
          <header className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #0f0c29, #1a1545)",
                boxShadow: "0 4px 14px rgba(15,12,41,0.35)",
              }}
            >
              <CalendarClock className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1
                className="text-base sm:text-xl font-black tracking-tight truncate"
                style={{ color: "#0f172a" }}
              >
                Daftar Kontrak
              </h1>
            </div>
          </header>

          {/* ── Error ───────────────────────────────────────────────── */}
          {error && (
            <div
              className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl text-xs font-semibold"
              style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 min-w-0">{error}</span>
              <button
                onClick={load}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0 transition-all active:scale-95"
                style={{ background: "#fecdd3", color: "#9f1239" }}
              >
                <RotateCcw className="w-3 h-3" /> Coba lagi
              </button>
            </div>
          )}

          {/* ── Sorotan atas — hanya banner "habis hari ini" ────────── */}
          {!isBusy && todayList.length > 0 && (
            <TodayBanner people={todayList} lookup={customLookup} />
          )}

          {/* ── Statistik ───────────────────────────────────────────── */}
          {!isBusy && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <StatCard
                icon={<Clock3 className="w-4 h-4 sm:w-5 sm:h-5" />}
                value={todayList.length}
                label="Habis Hari Ini"
                sub={todayList.length > 0 ? "segera tindak lanjuti" : "aman"}
                muted={todayList.length === 0}
                accent={
                  todayList.length > 0
                    ? "linear-gradient(180deg, #fbbf24, #d97706)"
                    : "linear-gradient(180deg, #e2e8f0, #cbd5e1)"
                }
              />
              <StatCard
                icon={<CalendarClock className="w-4 h-4 sm:w-5 sm:h-5" />}
                value={weekCount}
                label="7 Hari ke Depan"
                sub="siapkan perpanjangan"
                accent="linear-gradient(180deg, #f472b6, #db2777)"
              />
              <StatCard
                icon={<CalendarDays className="w-4 h-4 sm:w-5 sm:h-5" />}
                value={monthCount}
                label={`Bulan ${monthLabel}`}
                sub="total di bulan ini"
                accent="linear-gradient(180deg, #a78bfa, #7c3aed)"
              />
              <StatCard
                icon={<Users className="w-4 h-4 sm:w-5 sm:h-5" />}
                value={entries.length}
                label="Total Kontrak"
                sub={`dalam ${windowDays} hari`}
                accent="linear-gradient(180deg, #34d399, #059669)"
              />
            </div>
          )}

          {/* ── Filter ──────────────────────────────────────────────── */}
          <div
            className="bg-white rounded-2xl overflow-hidden"
            style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
          >
            <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                {/* Search */}
                <div className="relative flex-1 min-w-0">
                  <Search
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                    style={{ color: "#94a3b8" }}
                  />
                  <input
                    type="text"
                    inputMode="search"
                    placeholder="Cari nama karyawan..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 sm:h-9 rounded-xl pl-9 pr-9 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                    style={{ border: "1px solid #e8ecf5", background: "#f5f7ff", color: "#334155" }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="Hapus pencarian"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg transition-all hover:bg-slate-100 active:scale-90"
                    >
                      <X className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                    </button>
                  )}
                </div>
              </div>

              {/* Chip bulan — filter periode untuk Jenjang Karir */}
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 pt-0.5">
                {MONTH_NAMES_ID.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => setMonth(i)}
                    title={m}
                    aria-pressed={month === i}
                    className="h-8 rounded-lg text-[10px] font-black transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    style={
                      month === i
                        ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff" }
                        : { background: "#f5f7ff", color: "#64748b", border: "1px solid #e8ecf5" }
                    }
                  >
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Daftar ──────────────────────────────────────────────── */}
          <div
            className="bg-white rounded-2xl overflow-hidden"
            style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
          >
            <div
              className="px-3.5 sm:px-5 py-3 flex items-center gap-2.5"
              style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}
            >
              <span
                className="w-1 h-4 rounded-full flex-shrink-0"
                style={{ background: "linear-gradient(180deg, #6366f1, #8b5cf6)" }}
              />
              <p
                className="text-[10.5px] sm:text-[11px] font-bold truncate"
                style={{ color: "#64748b" }}
              >
                {`${jenjangList.length} karyawan — kontrak habis di ${MONTH_NAMES_ID[month]}`}
              </p>

              <button
                onClick={handleExport}
                disabled={exporting || jenjangList.length === 0}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black text-white flex-shrink-0 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {exporting ? "Menyiapkan…" : "Export Excel"}
              </button>
            </div>

            <JenjangTable rows={jenjangList} lookup={customLookup} busy={isBusy} />
          </div>
        </div>
      </div>

      <style jsx>{`
        .confetti-bit {
          position: absolute;
          top: -14px;
          width: 6px;
          height: 10px;
          border-radius: 2px;
          opacity: 0;
          animation: fall 6s linear infinite;
        }
        .bit-0 { left: 6%;  background: #fbbf24; animation-delay: 0s;   }
        .bit-1 { left: 16%; background: #ec4899; animation-delay: 0.7s; }
        .bit-2 { left: 27%; background: #6366f1; animation-delay: 1.4s; }
        .bit-3 { left: 38%; background: #34d399; animation-delay: 2.1s; }
        .bit-4 { left: 49%; background: #fbbf24; animation-delay: 2.8s; }
        .bit-5 { left: 60%; background: #a78bfa; animation-delay: 0.4s; }
        .bit-6 { left: 70%; background: #ec4899; animation-delay: 1.1s; }
        .bit-7 { left: 80%; background: #34d399; animation-delay: 1.8s; }
        .bit-8 { left: 88%; background: #6366f1; animation-delay: 2.5s; }
        .bit-9 { left: 95%; background: #fbbf24; animation-delay: 3.2s; }

        @keyframes fall {
          0%   { transform: translateY(0) rotate(0deg);       opacity: 0;    }
          12%  {                                              opacity: 0.55; }
          100% { transform: translateY(260px) rotate(320deg); opacity: 0;    }
        }

        @media (prefers-reduced-motion: reduce) {
          .confetti { display: none; }
        }
      `}</style>
    </DashboardLayout>
  );
}