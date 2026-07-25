"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Cake,
  PartyPopper,
  Gift,
  CalendarDays,
  Users,
  Inbox,
  AlertTriangle,
  Search,
  X,
  RotateCcw,
  Clock3,
} from "lucide-react";
import {
  buildCustomRoleLookup,
  getAvatarColor,
  getInitials,
  getRoleBadge,
  getRoleLabel,
  isPKLRole,
  type CustomRoleRow,
} from "@/lib/roleMeta";
import {
  MONTH_NAMES_ID,
  daysUntilBirthday,
  formatCountdown,
  getAge,
  getTurningAge,
  parseBirthDate,
  startOfDay,
} from "@/lib/birthday";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ApiUser {
  id: string;
  name: string;
  phone_number: string | null;
  role: string;
  roles: string[];
  birth_date: string | null;
}

interface BirthdayEntry {
  id: string;
  name: string;
  phone_number: string | null;
  role: string;
  birth: Date;
  daysUntil: number;
  age: number;
  turningAge: number;
  monthIndex: number;
}

type ViewMode = "terdekat" | "bulan";

/** Kelompok waktu untuk mode "Terdekat". */
type BucketKey = "minggu" | "bulan" | "nanti";

const BUCKETS: { key: BucketKey; label: string; hint: string }[] = [
  { key: "minggu", label: "7 hari ke depan", hint: "siapkan ucapan" },
  { key: "bulan", label: "30 hari ke depan", hint: "" },
  { key: "nanti", label: "Setelah itu", hint: "" },
];

/** Item hasil flatten: label kelompok atau baris karyawan. */
type ListItem =
  | { kind: "label"; key: string; label: string; count: number; hint: string }
  | { kind: "row"; key: string; person: BirthdayEntry };

// ── Util kecil ────────────────────────────────────────────────────────────────
const shortDate = (d: Date) => `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()].slice(0, 3)}`;

const bucketOf = (days: number): BucketKey =>
  days <= 7 ? "minggu" : days <= 30 ? "bulan" : "nanti";

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
          <Cake className="w-3 h-3" style={{ color: "#d97706" }} />
        </div>
      )}
    </div>
  );
}

// ── Pill countdown ────────────────────────────────────────────────────────────
function CountdownPill({ days }: { days: number }) {
  const tone =
    days === 0
      ? { bg: "#fef3c7", text: "#92400e", border: "#fde68a" }
      : days <= 7
        ? { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" }
        : { bg: "#f8fafc", text: "#64748b", border: "#e8ecf5" };

  return (
    <span
      className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10.5px] font-black whitespace-nowrap tabular-nums ${
        days === 0 ? "animate-pulse" : ""
      }`}
      style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
    >
      {formatCountdown(days)}
    </span>
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

// ── Banner: ada yang ultah hari ini ──────────────────────────────────────────
function TodayBanner({
  people,
  lookup,
}: {
  people: BirthdayEntry[];
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
          <PartyPopper className="w-4 h-4 flex-shrink-0" style={{ color: "#fbbf24" }} />
          <p
            className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ color: "#fbbf24" }}
          >
            Ulang tahun hari ini
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
              <Avatar name={p.name} role={p.role} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-black text-white truncate leading-tight">
                  {p.name}
                </p>
                <p
                  className="text-[10.5px] sm:text-[11.5px] mt-1 truncate"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  {getRoleLabel(p.role, lookup)}
                </p>
                <p
                  className="text-[10.5px] sm:text-[11.5px] font-bold mt-0.5"
                  style={{ color: "#fbbf24" }}
                >
                  Genap {p.turningAge} tahun
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Banner: tidak ada yang ultah hari ini → tampilkan yang paling dekat ──────
function NextUpBanner({
  person,
  lookup,
}: {
  person: BirthdayEntry;
  lookup: Map<string, CustomRoleRow>;
}) {
  return (
    <section
      className="bg-white rounded-2xl sm:rounded-3xl px-4 sm:px-6 py-4 sm:py-5"
      style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center gap-2 mb-3.5">
        <Clock3 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#7c3aed" }} />
        <p
          className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: "#7c3aed" }}
        >
          Berikutnya
        </p>
      </div>

      <div className="flex items-center gap-3 sm:gap-3.5">
        <Avatar name={person.name} role={person.role} size="lg" />
        <div className="min-w-0 flex-1">
          <p
            className="text-sm sm:text-base font-black truncate leading-tight"
            style={{ color: "#0f172a" }}
          >
            {person.name}
          </p>
          <p className="text-[10.5px] sm:text-xs mt-1 truncate" style={{ color: "#94a3b8" }}>
            {getRoleLabel(person.role, lookup)}
          </p>
          <p className="text-[10.5px] sm:text-xs mt-0.5 font-bold" style={{ color: "#64748b" }}>
            {shortDate(person.birth)} &middot; ke-{person.turningAge}
          </p>
        </div>
        <div className="flex-shrink-0">
          <CountdownPill days={person.daysUntil} />
        </div>
      </div>
    </section>
  );
}

// ── Baris karyawan ────────────────────────────────────────────────────────────
function BirthdayRow({
  person,
  lookup,
  isLast,
}: {
  person: BirthdayEntry;
  lookup: Map<string, CustomRoleRow>;
  isLast: boolean;
}) {
  const badge = getRoleBadge(person.role, lookup);
  const isToday = person.daysUntil === 0;

  return (
    <li
      className="relative px-3.5 sm:px-5 py-3 sm:py-3.5 transition-colors hover:bg-slate-50/70"
      style={{
        borderBottom: isLast ? "none" : "1px solid #f5f5fb",
        background: isToday ? "#fffdf5" : undefined,
      }}
    >
      {isToday && (
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: "linear-gradient(180deg, #fbbf24, #d97706)" }}
        />
      )}

      <div className="flex items-center gap-3 sm:gap-3.5">
        <Avatar name={person.name} role={person.role} highlight={isToday} />

        {/* Info utama — aman untuk nama panjang di layar sempit */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[13px] sm:text-sm font-bold truncate max-w-[9.5rem] sm:max-w-none"
              style={{ color: "#0f172a" }}
            >
              {person.name}
            </span>
            <span
              className="inline-flex items-center text-[9.5px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 max-w-[8rem] truncate"
              style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}
            >
              {getRoleLabel(person.role, lookup)}
            </span>
          </div>

          <p
            className="text-[10.5px] sm:text-[11px] font-medium mt-1 truncate"
            style={{ color: "#94a3b8" }}
          >
            <span className="font-bold" style={{ color: "#64748b" }}>
              {shortDate(person.birth)}
            </span>{" "}
            &middot; {person.birth.getFullYear()} &middot; {person.age} th &rarr; ke-{person.turningAge}
          </p>
        </div>

        {/* Aksi */}
        <div className="flex-shrink-0">
          <CountdownPill days={person.daysUntil} />
        </div>
      </div>
    </li>
  );
}

// ── Label kelompok di dalam list ─────────────────────────────────────────────
function GroupLabel({ label, count, hint }: { label: string; count: number; hint: string }) {
  return (
    <li
      className="px-3.5 sm:px-5 py-2 flex items-center gap-2"
      style={{
        background: "#fafbff",
        borderTop: "1px solid #f5f5fb",
        borderBottom: "1px solid #f5f5fb",
      }}
    >
      <span className="text-[9.5px] font-black uppercase tracking-[0.14em]" style={{ color: "#94a3b8" }}>
        {label}
      </span>
      <span
        className="px-1.5 py-0.5 rounded-full text-[9.5px] font-black tabular-nums"
        style={{ background: "#e8ecf5", color: "#64748b" }}
      >
        {count}
      </span>
      {hint && (
        <span className="text-[9.5px] hidden sm:inline" style={{ color: "#cbd5e1" }}>
          {hint}
        </span>
      )}
    </li>
  );
}

// ── Halaman ───────────────────────────────────────────────────────────────────
export default function EmployeeBirthdaysClient() {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("terdekat");
  const [month, setMonth] = useState(0);

  // `today` di-set setelah mount supaya HTML server (UTC) dan client (WIB)
  // tidak pernah berbeda → tidak ada hydration mismatch.
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
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/admin/roles"),
      ]);

      const usersData = await usersRes.json();
      if (!usersData.success) {
        setError(usersData.message ?? "Gagal memuat data karyawan");
        return;
      }
      setUsers(usersData.users ?? []);

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

  /** Karyawan saja — PKL statis maupun role custom `is_pkl` dibuang di sini. */
  const karyawan = useMemo(
    () => users.filter((u) => !isPKLRole(u.role, customLookup)),
    [users, customLookup]
  );

  const entries = useMemo<BirthdayEntry[]>(() => {
    if (!today) return [];
    return karyawan
      .map((u) => {
        const birth = parseBirthDate(u.birth_date);
        if (!birth) return null;
        return {
          id: u.id,
          name: u.name,
          phone_number: u.phone_number,
          role: u.role,
          birth,
          daysUntil: daysUntilBirthday(birth, today),
          age: getAge(birth, today),
          turningAge: getTurningAge(birth, today),
          monthIndex: birth.getMonth(),
        } satisfies BirthdayEntry;
      })
      .filter((e): e is BirthdayEntry => e !== null);
  }, [karyawan, today]);

  const missingBirthDate = karyawan.length - entries.length;

  const todayList = useMemo(() => entries.filter((e) => e.daysUntil === 0), [entries]);
  const weekCount = useMemo(
    () => entries.filter((e) => e.daysUntil > 0 && e.daysUntil <= 7).length,
    [entries]
  );
  const monthCount = useMemo(
    () => (today ? entries.filter((e) => e.monthIndex === today.getMonth()).length : 0),
    [entries, today]
  );
  const nextUp = useMemo(
    () => entries.filter((e) => e.daysUntil > 0).sort((a, b) => a.daysUntil - b.daysUntil)[0] ?? null,
    [entries]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = entries.filter((e) => !q || e.name.toLowerCase().includes(q));

    if (view === "bulan") {
      return base
        .filter((e) => e.monthIndex === month)
        .sort((a, b) => a.birth.getDate() - b.birth.getDate() || a.name.localeCompare(b.name));
    }
    return base.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
  }, [entries, search, view, month]);

  /**
   * Di-flatten jadi satu array supaya `key` bisa dipasang langsung di tiap
   * elemen list (tidak perlu Fragment bersarang yang bikin warning React).
   */
  const listItems = useMemo<ListItem[]>(() => {
    if (view === "bulan") {
      return visible.map((p) => ({ kind: "row", key: p.id, person: p }));
    }

    const map: Record<BucketKey, BirthdayEntry[]> = { minggu: [], bulan: [], nanti: [] };
    for (const e of visible) map[bucketOf(e.daysUntil)].push(e);

    const out: ListItem[] = [];
    for (const b of BUCKETS) {
      const items = map[b.key];
      if (items.length === 0) continue;
      out.push({
        kind: "label",
        key: `label-${b.key}`,
        label: b.label,
        count: items.length,
        hint: b.hint,
      });
      for (const p of items) out.push({ kind: "row", key: p.id, person: p });
    }
    return out;
  }, [visible, view]);

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
              <Cake className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1
                className="text-base sm:text-xl font-black tracking-tight truncate"
                style={{ color: "#0f172a" }}
              >
                Ulang Tahun Karyawan
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

          {/* ── Sorotan atas ────────────────────────────────────────── */}
          {!isBusy && todayList.length > 0 && (
            <TodayBanner people={todayList} lookup={customLookup} />
          )}
          {!isBusy && todayList.length === 0 && nextUp && (
            <NextUpBanner person={nextUp} lookup={customLookup} />
          )}

          {/* ── Statistik ───────────────────────────────────────────── */}
          {!isBusy && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <StatCard
                icon={<PartyPopper className="w-4 h-4 sm:w-5 sm:h-5" />}
                value={todayList.length}
                label="Ultah Hari Ini"
                sub={todayList.length > 0 ? "jangan lupa ucapkan" : "belum ada"}
                muted={todayList.length === 0}
                accent={
                  todayList.length > 0
                    ? "linear-gradient(180deg, #fbbf24, #d97706)"
                    : "linear-gradient(180deg, #e2e8f0, #cbd5e1)"
                }
              />
              <StatCard
                icon={<Gift className="w-4 h-4 sm:w-5 sm:h-5" />}
                value={weekCount}
                label="7 Hari ke Depan"
                sub="siapkan kejutan"
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
                label="Data Lengkap"
                sub={missingBirthDate > 0 ? `${missingBirthDate} belum diisi` : "semua terisi"}
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

                {/* Toggle tampilan — full width di HP, auto di laptop */}
                <div
                  className="flex gap-1 p-1 rounded-xl flex-shrink-0"
                  style={{ background: "#f5f7ff", border: "1px solid #e8ecf5" }}
                >
                  {(
                    [
                      { key: "terdekat", label: "Terdekat" },
                      { key: "bulan", label: "Per Bulan" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setView(t.key)}
                      aria-pressed={view === t.key}
                      className="flex-1 sm:flex-initial h-8 px-3.5 rounded-lg text-[11px] font-black transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      style={
                        view === t.key
                          ? {
                              background: "linear-gradient(135deg, #0f0c29, #1a1545)",
                              color: "#fff",
                              boxShadow: "0 2px 8px rgba(15,12,41,0.22)",
                            }
                          : { background: "transparent", color: "#64748b" }
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chip bulan — grid rapi, tidak berantakan di layar sempit */}
              {view === "bulan" && (
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
              )}
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
                {view === "bulan"
                  ? `${visible.length} karyawan lahir di ${MONTH_NAMES_ID[month]}`
                  : `${visible.length} karyawan, diurutkan dari yang terdekat`}
              </p>
            </div>

            {isBusy ? (
              <ul>
                {Array.from({ length: 6 }).map((_, i) => (
                  <li
                    key={i}
                    className="px-3.5 sm:px-5 py-3.5 flex items-center gap-3 animate-pulse"
                    style={{ borderBottom: "1px solid #f8f8fc" }}
                  >
                    <div className="w-11 h-11 rounded-2xl flex-shrink-0" style={{ background: "#f1f5f9" }} />
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="h-3 rounded-full w-32 max-w-full" style={{ background: "#e2e8f0" }} />
                      <div className="h-2.5 rounded-full w-24" style={{ background: "#f1f5f9" }} />
                    </div>
                    <div className="w-16 h-6 rounded-full flex-shrink-0" style={{ background: "#f1f5f9" }} />
                  </li>
                ))}
              </ul>
            ) : visible.length === 0 ? (
              <div className="text-center py-14 sm:py-20 px-5">
                <div className="flex justify-center mb-3">
                  <Inbox className="w-9 h-9" style={{ color: "#cbd5e1" }} />
                </div>
                <p className="text-sm font-bold" style={{ color: "#475569" }}>
                  Belum ada data ulang tahun di sini
                </p>
                <p
                  className="text-xs mt-1.5 leading-relaxed max-w-xs mx-auto"
                  style={{ color: "#94a3b8" }}
                >
                  {search
                    ? "Coba kata kunci lain."
                    : view === "bulan"
                      ? `Tidak ada karyawan yang lahir di bulan ${MONTH_NAMES_ID[month]}.`
                      : "Isi tanggal lahir karyawan lewat menu Manajemen Aktifitas untuk memunculkannya."}
                </p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="mt-4 text-xs font-bold px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95"
                    style={{ color: "#6366f1", background: "#eff3ff" }}
                  >
                    Reset pencarian
                  </button>
                )}
              </div>
            ) : (
              <ul>
                {listItems.map((item, i) =>
                  item.kind === "label" ? (
                    <GroupLabel
                      key={item.key}
                      label={item.label}
                      count={item.count}
                      hint={item.hint}
                    />
                  ) : (
                    <BirthdayRow
                      key={item.key}
                      person={item.person}
                      lookup={customLookup}
                      isLast={i === listItems.length - 1}
                    />
                  )
                )}
              </ul>
            )}
          </div>

          {!isBusy && missingBirthDate > 0 && (
            <p className="text-[10.5px] text-center px-4 leading-relaxed" style={{ color: "#94a3b8" }}>
              {missingBirthDate} karyawan belum mengisi tanggal lahir dan tidak muncul di daftar.
            </p>
          )}
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