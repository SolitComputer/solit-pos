"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
type OvertimeRequest = {
  id: string;
  user_id: string;
  request_date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  work_description: string | null;
  proof_photo_url: string | null;
  status: "PENDING" | "APPROVED" | "ONGOING" | "COMPLETED" | "REJECTED";
  rate_per_hour: number | null;
  total_pay: number | null;
  auto_completed: boolean;
  created_at: string;
  users?: { id: string; name: string; role: string };
};

type User = { id: string; name: string; role: string };

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;

function isAdminRole(role?: string): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function getWIBToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ─── StartModal ────────────────────────────────────────────────────────────────
function StartModal({
  overtime,
  onClose,
  onSaved,
}: {
  overtime: OvertimeRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!description.trim()) {
      setError("Deskripsi pekerjaan wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "START",
          work_description: description,
        }),
      });
      const d = await res.json();
      if (!d.success) {
        setError(d.message || "Gagal dimulai");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Gagal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-gradient-to-r from-orange-600 to-amber-700 px-6 py-5 flex items-start justify-between">
          <div>
            <p className="font-bold text-white text-base">🟢 Mulai Lemburan</p>
            <p className="text-xs text-white/70 mt-1">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">
              ⚠️ {error}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">
              Deskripsi Pekerjaan *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Maintenance sistem database, backup data, update server..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400/20 transition-all resize-none"
            />
            <p className="text-[10px] text-gray-400 mt-1.5">
              Jelaskan apa yang akan dikerjakan selama lemburan
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-orange-700">
            <p className="font-semibold mb-1">⏱️ Waktu Lemburan</p>
            <div className="space-y-1 text-orange-600 text-[11px]">
              <p>
                Mulai: <span className="font-bold">{formatTime(overtime.scheduled_start)}</span>
              </p>
              <p>
                Selesai: <span className="font-bold">{formatTime(overtime.scheduled_end)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving || !description.trim()}
            className="flex-1 h-11 bg-gradient-to-r from-orange-600 to-amber-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Menyimpan...
              </>
            ) : (
              "✅ Mulai"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SetPayModal ────────────────────────────────────────────────────────────────
function SetPayModal({
  overtime,
  onClose,
  onSaved,
}: {
  overtime: OvertimeRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const calcDurationHours = (): number => {
    if (!overtime.scheduled_start || !overtime.actual_end) return 0;
    const start = new Date(overtime.scheduled_start).getTime();
    const end = new Date(overtime.actual_end).getTime();
    return Math.max(1, Math.ceil((end - start) / (60 * 60 * 1000)));
  };

  const hours = calcDurationHours();
  const defaultRate = 100000;
  const [rate, setRate] = useState(overtime.rate_per_hour || defaultRate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalPay = rate * hours;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "SET_PAY",
          rate_per_hour: Math.round(rate),
          total_pay: Math.round(totalPay),
        }),
      });
      const d = await res.json();
      if (!d.success) {
        setError(d.message || "Gagal");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Gagal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-gradient-to-r from-emerald-600 to-green-700 px-6 py-5 flex items-start justify-between">
          <div>
            <p className="font-bold text-white text-base">💰 Atur Bayaran</p>
            <p className="text-xs text-white/70 mt-1">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">
              ⚠️ {error}
            </div>
          )}

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-700">
            <p className="font-semibold mb-2">⏱️ Durasi Lemburan</p>
            <p className="text-emerald-600">
              {hours} jam × {formatRupiah(Math.round(rate))}/jam ={" "}
              <span className="font-bold text-lg text-emerald-700">
                {formatRupiah(Math.round(totalPay))}
              </span>
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">
              Tarif Per Jam (Rp)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                Rp
              </span>
              <input
                type="number"
                min={0}
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 font-mono"
              />
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">
              Total Bayaran
            </p>
            <p className="text-3xl font-black text-emerald-700">
              {formatRupiah(Math.round(totalPay))}
            </p>
            <p className="text-[10px] text-emerald-600 mt-2">
              {hours} jam × {formatRupiah(Math.round(rate))}/jam
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Menyimpan...
              </>
            ) : (
              "✅ Simpan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CompleteModal ────────────────────────────────────────────────────────────────
function CompleteModal({
  overtime,
  onClose,
  onSaved,
  isAutoCompleted,
}: {
  overtime: OvertimeRequest;
  onClose: () => void;
  onSaved: () => void;
  isAutoCompleted?: boolean;
}) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Hanya file gambar yang diterima");
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    setError("");
  };

  const upload = async () => {
    if (!photoFile) {
      setError("Pilih foto terlebih dahulu");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", photoFile);

      // Upload ke Supabase Storage
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload gagal");

      const uploadData = await uploadRes.json();
      const photoUrl = uploadData.url;

      // Update overtime record
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "COMPLETE",
          proof_photo_url: photoUrl,
        }),
      });

      const d = await res.json();
      if (!d.success) {
        setError(d.message || "Gagal menyimpan");
        return;
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 flex items-start justify-between">
          <div>
            <p className="font-bold text-white text-base">🏁 Selesaikan Lemburan</p>
            <p className="text-xs text-white/70 mt-1">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {isAutoCompleted && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
              <p className="font-semibold mb-1">⚡ Auto-Complete</p>
              <p className="text-amber-600">
                Lemburan ini di-auto complete karena sudah melewati waktu yang dijadwalkan.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">
              ⚠️ {error}
            </div>
          )}

          {photoPreview ? (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Foto Bukti
              </p>
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full h-48 object-cover rounded-xl border border-gray-200"
              />
              <button
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                className="mt-2 text-xs font-bold text-red-600 hover:text-red-700 underline"
              >
                Ganti Foto
              </button>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">
                Upload Foto Bukti
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:bg-gray-50 transition">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="photoInput"
                />
                <label
                  htmlFor="photoInput"
                  className="block cursor-pointer"
                >
                  <div className="text-3xl mb-2">📸</div>
                  <p className="text-sm font-bold text-gray-700">Klik untuk upload foto</p>
                  <p className="text-xs text-gray-400 mt-1">atau drag file ke sini</p>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all"
          >
            Batal
          </button>
          <button
            onClick={upload}
            disabled={uploading || !photoFile}
            className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Mengunggah...
              </>
            ) : (
              "✅ Selesai"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function OvertimePage() {
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [filterUser, setFilterUser] = useState<string>("Semua");

  // ✅ Calendar state
  const [calendarMonth, setCalendarMonth] = useState<{
    year: number;
    month: number;
  }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Modal state
  const [startData, setStartData] = useState<OvertimeRequest | null>(null);
  const [setPayData, setSetPayData] = useState<OvertimeRequest | null>(null);
  const [completeData, setCompleteData] = useState<OvertimeRequest | null>(null);

  // Fetchers
  const fetchOvertimes = useCallback(async () => {
    const r = await fetch("/api/attendance/overtime");
    const d = await r.json();
    if (d.success) setOvertimes(d.data || []);
  }, []);

  const fetchAllUsers = useCallback(async () => {
    const r = await fetch("/api/attendance/users");
    const d = await r.json();
    if (d.success) setAllUsers(d.data || []);
  }, []);

  useEffect(() => {
    getCurrentUserClient().then((u) => setCurrentUser(u));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOvertimes(), fetchAllUsers()]).finally(() =>
      setLoading(false)
    );
  }, []);

  // ✅ Auto-complete useEffect
  useEffect(() => {
    const checkAutoComplete = setInterval(() => {
      const now = Date.now();

      overtimes.forEach((o) => {
        // Auto-complete jika:
        // - Status ONGOING
        // - scheduled_end sudah lewat
        // - Belum ada actual_end (belum complete)
        if (
          o.status === "ONGOING" &&
          o.scheduled_end &&
          new Date(o.scheduled_end).getTime() <= now &&
          !o.actual_end
        ) {
          console.log(
            `[AUTO-COMPLETE] Overtime ${o.id} scheduled_end reached, auto-triggering complete`
          );

          handleAutoComplete(o);
        }
      });
    }, 30000); // Check setiap 30 detik

    return () => clearInterval(checkAutoComplete);
  }, [overtimes]);

  // ✅ Auto-complete handler
  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "COMPLETE",
          proof_photo_url: null,
          auto_completed: true,
        }),
      });

      const d = await res.json();
      if (d.success) {
        console.log("[AUTO-COMPLETE] Success");
        fetchOvertimes();
        // Buka modal untuk user upload foto
        setCompleteData(overtime);
      }
    } catch (err) {
      console.error("[AUTO-COMPLETE] Error:", err);
    }
  };

  // Derived
  const filtered = useMemo(() => {
    let result = overtimes;

    if (filterStatus !== "Semua") {
      result = result.filter((o) => o.status === filterStatus);
    }

    if (filterUser !== "Semua") {
      result = result.filter((o) => o.users?.name === filterUser);
    }

    return result;
  }, [overtimes, filterStatus, filterUser]);

  const uniqueUsers = useMemo(
    () =>
      [
        ...new Set(
          allUsers.length > 0
            ? allUsers.map((u) => u.name)
            : overtimes.map((o) => o.users?.name || "Unknown")
        ),
      ].sort(),
    [allUsers, overtimes]
  );

  const statuses = useMemo(
    () => [...new Set(overtimes.map((o) => o.status))],
    [overtimes]
  );

  // ✅ Calendar & filter
  const thisMonthOvertimes = overtimes.filter((o) => {
    const dateKey = toWIBDateKey(o.request_date);
    return dateKey.startsWith(
      `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}`
    );
  });

  const byDate = useMemo(() => {
    const m: Record<string, OvertimeRequest[]> = {};
    thisMonthOvertimes.forEach((o) => {
      const k = toWIBDateKey(o.request_date);
      if (!m[k]) m[k] = [];
      m[k].push(o);
    });
    return m;
  }, [thisMonthOvertimes]);

  const calDays = useMemo(() => {
    const fd = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
    const dim = new Date(
      calendarMonth.year,
      calendarMonth.month + 1,
      0
    ).getDate();
    const c: (number | null)[] = [];
    for (let i = 0; i < fd; i++) c.push(null);
    for (let d = 1; d <= dim; d++) c.push(d);
    return c;
  }, [calendarMonth.year, calendarMonth.month]);

  const todayKey = getWIBToday();

  const selectedOvertimes = selectedDate
    ? (byDate[selectedDate] || []).sort((a, b) =>
        (a.users?.name || "").localeCompare(b.users?.name || "", "id-ID")
      )
    : [];

  const statCards = [
    {
      label: "Total",
      value: overtimes.length,
      icon: "📋",
      gradient: "from-gray-50 to-gray-100",
      iconBg: "bg-gray-100",
    },
    {
      label: "Pending",
      value: overtimes.filter((o) => o.status === "PENDING").length,
      icon: "⏳",
      gradient: "from-amber-50 to-orange-100",
      iconBg: "bg-amber-100",
    },
    {
      label: "Ongoing",
      value: overtimes.filter((o) => o.status === "ONGOING").length,
      icon: "🟢",
      gradient: "from-green-50 to-emerald-100",
      iconBg: "bg-green-100",
    },
    {
      label: "Completed",
      value: overtimes.filter((o) => o.status === "COMPLETED").length,
      icon: "✅",
      gradient: "from-blue-50 to-indigo-100",
      iconBg: "bg-blue-100",
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 animate-fadeIn">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
              <span className="bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                Lemburan Karyawan
              </span>
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              {overtimes.length} total lemburan
            </p>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statCards.map((c) => (
            <div
              key={c.label}
              className={`bg-gradient-to-br ${c.gradient} rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 p-5 hover:scale-[1.02]`}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  {c.label}
                </p>
                <div className={`w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center shadow-sm`}>
                  <span className="text-base">{c.icon}</span>
                </div>
              </div>
              <p className="text-3xl font-black tracking-tight text-gray-800">
                {loading ? (
                  <span className="inline-block w-10 h-8 bg-white/50 rounded-lg animate-pulse" />
                ) : (
                  c.value
                )}
              </p>
            </div>
          ))}
        </div>

        {/* ════ CALENDAR VIEW ════ */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-gray-800 tracking-tight">
                📅 {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setCalendarMonth((m) => ({
                    ...m,
                    month: m.month === 0 ? 11 : m.month - 1,
                    year: m.month === 0 ? m.year - 1 : m.year,
                  }))
                }
                className="w-8 h-8 rounded-lg hover:bg-gray-100 transition"
              >
                ◀
              </button>
              <button
                onClick={() =>
                  setCalendarMonth((m) => ({
                    ...m,
                    month: m.month === 11 ? 0 : m.month + 1,
                    year: m.month === 11 ? m.year + 1 : m.year,
                  }))
                }
                className="w-8 h-8 rounded-lg hover:bg-gray-100 transition"
              >
                ▶
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Day names */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {DAY_NAMES.map((d) => (
                <div
                  key={d}
                  className="text-center text-[10px] font-black text-gray-400 py-2"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-2">
              {calDays.map((day, idx) => {
                if (!day)
                  return <div key={`empty-${idx}`} />;

                const dk = `${calendarMonth.year}-${pad2(
                  calendarMonth.month + 1
                )}-${pad2(day)}`;
                const dayOvertimes = byDate[dk] || [];
                const pending = dayOvertimes.filter(
                  (o) => o.status === "PENDING"
                ).length;
                const approved = dayOvertimes.filter(
                  (o) => o.status === "APPROVED"
                ).length;
                const ongoing = dayOvertimes.filter(
                  (o) => o.status === "ONGOING"
                ).length;
                const completed = dayOvertimes.filter(
                  (o) => o.status === "COMPLETED"
                ).length;
                const total = dayOvertimes.length;
                const isSel = dk === selectedDate;

                return (
                  <button
                    key={day}
                    onClick={() =>
                      setSelectedDate(selectedDate === dk ? null : dk)
                    }
                    className={`flex flex-col items-start justify-start p-2 rounded-lg min-h-[80px] border-2 transition-all ${
                      isSel
                        ? "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-300 ring-2 ring-orange-200 shadow-md"
                        : total > 0
                        ? "bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                        : "bg-white border-gray-100 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`text-base font-black mb-2 ${
                        isSel ? "text-orange-600" : "text-gray-800"
                      }`}
                    >
                      {day}
                    </span>

                    {total > 0 && (
                      <div className="space-y-1 w-full">
                        {pending > 0 && (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded block">
                            ⏳ {pending}
                          </span>
                        )}
                        {approved > 0 && (
                          <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded block">
                            ✅ {approved}
                          </span>
                        )}
                        {ongoing > 0 && (
                          <span className="text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded block">
                            🟢 {ongoing}
                          </span>
                        )}
                        {completed > 0 && (
                          <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded block">
                            🏁 {completed}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Filter ── */}
        {selectedDate && (
          <div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white flex-wrap gap-3">
                <div>
                  <p className="text-lg font-bold text-gray-800">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString(
                      "id-ID",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {selectedOvertimes.filter((o) => o.status === "PENDING")
                      .length > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full">
                        ⏳{" "}
                        {
                          selectedOvertimes.filter((o) => o.status === "PENDING")
                            .length
                        }{" "}
                        pending
                      </span>
                    )}
                    {selectedOvertimes.filter((o) => o.status === "ONGOING")
                      .length > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 px-3 py-1 rounded-full">
                        🟢{" "}
                        {
                          selectedOvertimes.filter((o) => o.status === "ONGOING")
                            .length
                        }{" "}
                        jalan
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {selectedOvertimes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-sm text-gray-400">
                    Tidak ada lemburan di hari ini
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Karyawan
                        </th>
                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Waktu
                        </th>
                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Status
                        </th>
                        <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Bayaran
                        </th>
                        <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedOvertimes.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-gray-50/60 transition-colors duration-200"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-md">
                                {initials(o.users?.name || "??")}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 text-sm">
                                  {o.users?.name}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono font-bold text-gray-800 text-xs">
                                {formatTime(o.scheduled_start)} -{" "}
                                {formatTime(o.scheduled_end)}
                              </span>
                              {o.actual_end && (
                                <span className="text-[10px] text-gray-400">
                                  Selesai: {formatTime(o.actual_end)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border ${
                                o.status === "PENDING"
                                  ? "bg-amber-100 text-amber-700 border-amber-200"
                                  : o.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : o.status === "ONGOING"
                                  ? "bg-green-100 text-green-700 border-green-200"
                                  : o.status === "COMPLETED"
                                  ? "bg-blue-100 text-blue-700 border-blue-200"
                                  : "bg-red-100 text-red-700 border-red-200"
                              }`}
                            >
                              {o.status === "PENDING"
                                ? "⏳ Pending"
                                : o.status === "APPROVED"
                                ? "✅ Disetujui"
                                : o.status === "ONGOING"
                                ? "🟢 Berjalan"
                                : o.status === "COMPLETED"
                                ? "🏁 Selesai"
                                : "❌ Ditolak"}
                              {o.auto_completed && (
                                <span className="text-[8px] ml-1">
                                  (auto)
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            {o.total_pay ? (
                              <span className="font-black text-gray-800 text-sm">
                                {formatRupiah(o.total_pay)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-300 font-bold">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {o.status === "APPROVED" && !o.actual_start && (
                              <button
                                onClick={() => setStartData(o)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200 transition-all"
                              >
                                🟢 Mulai
                              </button>
                            )}
                            {o.status === "ONGOING" &&
                              !o.actual_end &&
                              !o.rate_per_hour && (
                                <button
                                  onClick={() => setSetPayData(o)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-600 border border-emerald-200 hover:bg-emerald-200 transition-all"
                                >
                                  💰 Bayar
                                </button>
                              )}
                            {o.status === "ONGOING" &&
                              !o.actual_end &&
                              o.rate_per_hour && (
                                <button
                                  onClick={() => setCompleteData(o)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 border border-blue-200 hover:bg-blue-200 transition-all"
                                >
                                  🏁 Selesai
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── All Overtimes Table ── */}
        {!selectedDate && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <p className="text-base font-bold text-gray-800 mb-3">
                Daftar Lemburan
              </p>
              <div className="flex flex-wrap gap-2">
                {["Semua", ...statuses].map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      filterStatus === s
                        ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md scale-105"
                        : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {s === "PENDING"
                      ? "⏳ Pending"
                      : s === "APPROVED"
                      ? "✅ Disetujui"
                      : s === "ONGOING"
                      ? "🟢 Berjalan"
                      : s === "COMPLETED"
                      ? "🏁 Selesai"
                      : s === "REJECTED"
                      ? "❌ Ditolak"
                      : "Semua"}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="h-16 bg-gray-50 rounded-2xl animate-pulse"
                    />
                  ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm text-gray-400">Tidak ada lemburan</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Karyawan
                      </th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Tanggal
                      </th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Waktu
                      </th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Status
                      </th>
                      <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Bayaran
                      </th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((o) => (
                      <tr
                        key={o.id}
                        className="hover:bg-gray-50/60 transition-colors duration-200"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-md">
                              {initials(o.users?.name || "??")}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800 text-sm">
                                {o.users?.name}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono font-bold text-gray-800 text-xs">
                            {new Date(o.request_date).toLocaleDateString(
                              "id-ID",
                              { day: "numeric", month: "short", year: "numeric" }
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs text-gray-600">
                            {formatTime(o.scheduled_start)} -{" "}
                            {formatTime(o.scheduled_end)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border ${
                              o.status === "PENDING"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : o.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : o.status === "ONGOING"
                                ? "bg-green-100 text-green-700 border-green-200"
                                : o.status === "COMPLETED"
                                ? "bg-blue-100 text-blue-700 border-blue-200"
                                : "bg-red-100 text-red-700 border-red-200"
                            }`}
                          >
                            {o.status === "PENDING"
                              ? "⏳ Pending"
                              : o.status === "APPROVED"
                              ? "✅ Disetujui"
                              : o.status === "ONGOING"
                              ? "🟢 Berjalan"
                              : o.status === "COMPLETED"
                              ? "🏁 Selesai"
                              : "❌ Ditolak"}
                            {o.auto_completed && (
                              <span className="text-[8px] ml-1">(auto)</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {o.total_pay ? (
                            <span className="font-black text-gray-800 text-sm">
                              {formatRupiah(o.total_pay)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-300 font-bold">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {o.status === "APPROVED" && !o.actual_start && (
                            <button
                              onClick={() => setStartData(o)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200 transition-all"
                            >
                              🟢 Mulai
                            </button>
                          )}
                          {o.status === "ONGOING" &&
                            !o.actual_end &&
                            !o.rate_per_hour && (
                              <button
                                onClick={() => setSetPayData(o)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-600 border border-emerald-200 hover:bg-emerald-200 transition-all"
                              >
                                💰 Bayar
                              </button>
                            )}
                          {o.status === "ONGOING" &&
                            !o.actual_end &&
                            o.rate_per_hour && (
                              <button
                                onClick={() => setCompleteData(o)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 border border-blue-200 hover:bg-blue-200 transition-all"
                              >
                                🏁 Selesai
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {startData && (
        <StartModal
          overtime={startData}
          onClose={() => setStartData(null)}
          onSaved={() => {
            fetchOvertimes();
            setStartData(null);
          }}
        />
      )}
      {setPayData && (
        <SetPayModal
          overtime={setPayData}
          onClose={() => setSetPayData(null)}
          onSaved={() => {
            fetchOvertimes();
            setSetPayData(null);
          }}
        />
      )}
      {completeData && (
        <CompleteModal
          overtime={completeData}
          onClose={() => setCompleteData(null)}
          onSaved={() => {
            fetchOvertimes();
            setCompleteData(null);
          }}
          isAutoCompleted={completeData.auto_completed}
        />
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </DashboardLayout>
  );
}