// src/components/attendance/ShiftConfigModal.tsx
"use client";

import { useState, useEffect, useRef } from "react";

interface ShiftConfigData {
  user_id: string;
  user_name: string;
  user_role: string;
  shift: "PAGI" | "SORE";
  has_custom: boolean;
  open_hour: number;
  open_minute: number;
  late_hour: number;
  late_minute: number;
  close_hour: number;
  close_minute: number;
  checkout_hour: number; // ✅ NEW — jam pulang
  checkout_minute: number; // ✅ NEW — jam pulang
  config_id: string | null;
}

interface UserInfo { id: string; name: string; role: string }

function pad2(n: number) { return String(n).padStart(2, "0"); }
function fmtTime(h: number, m: number) { return `${pad2(h)}:${pad2(m)}`; }

// ─── ShiftConfigModal ─────────────────────────────────────────────────────────
// initialUserId: jika diisi, modal langsung scroll ke card user tersebut
export function ShiftConfigModal({ users, initialUserId, onClose }: {
  users: UserInfo[];
  initialUserId?: string;
  onClose: () => void;
}) {
  const [configs, setConfigs] = useState<ShiftConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Jika initialUserId diisi → mode single user (fokus ke 1 user)
  // "all" → tampilkan semua
  const [filterToUser, setFilterToUser] = useState<string | "all">(
    initialUserId ?? "all"
  );

  // Ref untuk scroll ke card user tertentu
  const userCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [forms, setForms] = useState<Record<string, {
    shift: "PAGI" | "SORE";
    open_hour: number; open_minute: number;
    late_hour: number; late_minute: number;
    close_hour: number; close_minute: number;
    checkout_hour: number; checkout_minute: number; // ✅ NEW — jam pulang
  }>>({});

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/attendance/shift-config");
      const d = await r.json();
      if (d.success && Array.isArray(d.data)) {
        setConfigs(d.data);
        const initForms: typeof forms = {};
        d.data.forEach((c: ShiftConfigData) => {
          initForms[c.user_id] = {
            shift: c.shift,
            open_hour: c.open_hour,
            open_minute: c.open_minute,
            late_hour: c.late_hour,
            late_minute: c.late_minute,
            close_hour: c.close_hour,
            close_minute: c.close_minute,
            checkout_hour: c.checkout_hour,   // ✅ NEW
            checkout_minute: c.checkout_minute, // ✅ NEW
          };
        });
        setForms(initForms);
      }
    } catch {
      setError("Gagal memuat data jadwal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); }, []);

  // Scroll ke card user setelah data load + hanya jika mode "all"
  // (mode single user sudah otomatis karena hanya 1 card yang tampil)
  useEffect(() => {
    if (!loading && filterToUser === "all" && initialUserId) {
      setTimeout(() => {
        const el = userCardRefs.current[initialUserId];
        const container = scrollContainerRef.current;
        if (el && container) {
          const elTop = el.offsetTop - container.offsetTop;
          container.scrollTo({ top: elTop - 16, behavior: "smooth" });
        }
      }, 150);
    }
  }, [loading, filterToUser, initialUserId]);

  const handleShiftChange = (userId: string, shift: "PAGI" | "SORE") => {
    // ✅ NEW: jam pulang. PAGI = 17:00 (sudah dikonfirmasi). SORE = 21:00 cuma
    // nilai awal — TIDAK seragam per orang, wajib dicek/diubah manual tiap akun.
    const defaults = shift === "PAGI"
      ? { open_hour: 7, open_minute: 30, late_hour: 8, late_minute: 0, close_hour: 12, close_minute: 0, checkout_hour: 17, checkout_minute: 0 }
      : { open_hour: 14, open_minute: 0, late_hour: 16, late_minute: 0, close_hour: 18, close_minute: 0, checkout_hour: 21, checkout_minute: 0 };
    setForms(p => ({ ...p, [userId]: { shift, ...defaults } }));
  };

  const handleSave = async (userId: string) => {
    const f = forms[userId];
    if (!f) return;
    setSaving(userId); setError("");
    try {
      const r = await fetch("/api/attendance/shift-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          shift: f.shift,
          open_hour: f.open_hour, open_minute: f.open_minute,
          late_hour: f.late_hour, late_minute: f.late_minute,
          close_hour: f.close_hour, close_minute: f.close_minute,
          checkout_hour: f.checkout_hour, checkout_minute: f.checkout_minute, // ✅ NEW
        }),
      });
      const d = await r.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      await loadConfigs();
    } catch { setError("Gagal menyimpan"); }
    finally { setSaving(null); }
  };

  const handleReset = async (userId: string) => {
    if (!confirm("Reset jadwal ke default shift?")) return;
    setResetting(userId);
    try {
      await fetch(`/api/attendance/shift-config?user_id=${userId}`, { method: "DELETE" });
      await loadConfigs();
    } catch { }
    finally { setResetting(null); }
  };

  const validateForm = (f: typeof forms[string] | undefined) => {
    if (!f) return null;
    const open = f.open_hour * 60 + f.open_minute;
    const late = f.late_hour * 60 + f.late_minute;
    const close = f.close_hour * 60 + f.close_minute;
    const checkout = f.checkout_hour * 60 + f.checkout_minute; // ✅ NEW
    if (open >= late) return "Jam buka harus sebelum jam telat";
    if (late >= close) return "Jam telat harus sebelum jam tutup";
    if (close >= checkout) return "Jam pulang harus setelah batas absen masuk"; // ✅ NEW
    return null;
  };

  // Daftar yang ditampilkan:
  // - filterToUser = userId → tampilkan hanya card itu
  // - filterToUser = "all" → tampilkan semua + search
  const shown = configs.filter(c => {
    if (filterToUser !== "all") return c.user_id === filterToUser;
    if (search) return c.user_name.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  const targetUser = filterToUser !== "all"
    ? configs.find(c => c.user_id === filterToUser)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-700 px-6 py-5 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-white text-base tracking-tight">
              {targetUser ? ` Jadwal Shift — ${targetUser.user_name}` : " Jadwal Shift Karyawan"}
            </p>
            <p className="text-xs text-white/70 mt-1">
              {targetUser
                ? `Atur jam absen untuk ${targetUser.user_name}`
                : "Atur jam buka, batas tepat waktu, dan jam tutup absen"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search bar — hanya saat mode "all" */}
        {filterToUser === "all" && (
          <div className="px-6 pt-4 pb-3 flex-shrink-0 border-b border-gray-100">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                placeholder="Cari karyawan..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 w-56"
              />
              <div className="flex items-center gap-3 text-[11px] text-gray-400 ml-auto">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />Custom
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />Default
                </span>
              </div>
            </div>
            {error && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Error saat mode single user */}
        {filterToUser !== "all" && error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl flex-shrink-0">
            {error}
          </div>
        )}

        {/* Content */}
        <div ref={scrollContainerRef} className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {Array(filterToUser !== "all" ? 1 : 4).fill(0).map((_, i) => (
                <div key={i} className="h-64 bg-gray-50 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="text-center py-12 text-gray-300 text-sm">Tidak ada data</div>
          ) : (
            <div className="space-y-4">
              {shown.map(c => {
                const f = forms[c.user_id];
                if (!f) return null;
                const valErr = validateForm(f);
                const saved = configs.find(x => x.user_id === c.user_id);
                const isDirty = saved && (
                  f.shift !== saved.shift ||
                  f.open_hour !== saved.open_hour || f.open_minute !== saved.open_minute ||
                  f.late_hour !== saved.late_hour || f.late_minute !== saved.late_minute ||
                  f.close_hour !== saved.close_hour || f.close_minute !== saved.close_minute ||
                  f.checkout_hour !== saved.checkout_hour || f.checkout_minute !== saved.checkout_minute // ✅ NEW
                );

                return (
                  <div
                    key={c.user_id}
                    ref={el => { userCardRefs.current[c.user_id] = el; }}
                    className={`rounded-2xl border p-5 transition-all duration-200 hover:shadow-md ${c.has_custom
                      ? "bg-gradient-to-br from-indigo-50/60 to-white border-indigo-200"
                      : "bg-white border-gray-100"
                      } ${
                      // Highlight ring jika ini user yang dimaksud
                      c.user_id === initialUserId
                        ? "ring-2 ring-indigo-400/50 shadow-lg"
                        : ""
                      }`}
                  >
                    {/* Header card */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[11px] font-black shadow-md flex-shrink-0">
                        {c.user_name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800">{c.user_name}</p>
                        <p className="text-[10px] text-gray-400">{c.user_role.replace(/_/g, " ")}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {c.has_custom && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-full">
                            Custom
                          </span>
                        )}
                        {isDirty && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full animate-pulse">
                            Belum disimpan
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Shift toggle */}
                    <div className="flex items-center gap-3 mb-5">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide w-10 flex-shrink-0">Shift</span>
                      <div className="flex gap-2">
                        {(["PAGI", "SORE"] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleShiftChange(c.user_id, s)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-200 ${f.shift === s
                              ? "bg-[#1a1a2e] text-white border-[#1a1a2e] shadow-md"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                              }`}
                          >
                            {s === "PAGI" ? " Pagi" : " Sore"}
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        Default: {f.shift === "PAGI" ? "07:30 – 12:00" : "14:00 – 18:00"} WIB
                      </span>
                    </div>

                    {/* 4 kolom jam (✅ NEW: tambah Jam Pulang) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {/* Buka */}
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                        <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-2 block">
                          Buka Absen
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={0} max={23} value={f.open_hour}
                            onChange={e => setForms(p => ({
                              ...p,
                              [c.user_id]: { ...p[c.user_id], open_hour: Math.min(23, Math.max(0, Number(e.target.value))) }
                            }))}
                            className="w-12 h-10 border border-emerald-200 rounded-xl text-center text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                          />
                          <span className="text-gray-400 font-bold">:</span>
                          <input
                            type="number" min={0} max={59} value={f.open_minute}
                            onChange={e => setForms(p => ({
                              ...p,
                              [c.user_id]: { ...p[c.user_id], open_minute: Math.min(59, Math.max(0, Number(e.target.value))) }
                            }))}
                            className="w-12 h-10 border border-emerald-200 rounded-xl text-center text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                          />
                        </div>
                        <p className="text-[9px] text-emerald-600 mt-1.5">Halaman absen muncul</p>
                      </div>

                      {/* Batas Tepat */}
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                        <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-2 block">
                          Batas Tepat
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={0} max={23} value={f.late_hour}
                            onChange={e => setForms(p => ({
                              ...p,
                              [c.user_id]: { ...p[c.user_id], late_hour: Math.min(23, Math.max(0, Number(e.target.value))) }
                            }))}
                            className="w-12 h-10 border border-amber-200 rounded-xl text-center text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
                          />
                          <span className="text-gray-400 font-bold">:</span>
                          <input
                            type="number" min={0} max={59} value={f.late_minute}
                            onChange={e => setForms(p => ({
                              ...p,
                              [c.user_id]: { ...p[c.user_id], late_minute: Math.min(59, Math.max(0, Number(e.target.value))) }
                            }))}
                            className="w-12 h-10 border border-amber-200 rounded-xl text-center text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
                          />
                        </div>
                        <p className="text-[9px] text-amber-600 mt-1.5">Setelah ini = terlambat</p>
                      </div>

                      {/* Tutup */}
                      <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                        <label className="text-[10px] font-bold text-red-700 uppercase tracking-wide mb-2 block">
                          Tutup Absen
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={0} max={23} value={f.close_hour}
                            onChange={e => setForms(p => ({
                              ...p,
                              [c.user_id]: { ...p[c.user_id], close_hour: Math.min(23, Math.max(0, Number(e.target.value))) }
                            }))}
                            className="w-12 h-10 border border-red-200 rounded-xl text-center text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-red-400 transition-all"
                          />
                          <span className="text-gray-400 font-bold">:</span>
                          <input
                            type="number" min={0} max={59} value={f.close_minute}
                            onChange={e => setForms(p => ({
                              ...p,
                              [c.user_id]: { ...p[c.user_id], close_minute: Math.min(59, Math.max(0, Number(e.target.value))) }
                            }))}
                            className="w-12 h-10 border border-red-200 rounded-xl text-center text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-red-400 transition-all"
                          />
                        </div>
                        <p className="text-[9px] text-red-600 mt-1.5">Halaman absen tertutup</p>
                      </div>

                      {/* ✅ NEW: Jam Pulang — dasar hitung lembur "sesudah pulang" */}
                      <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                        <label className="text-[10px] font-bold text-violet-700 uppercase tracking-wide mb-2 block">
                          Jam Pulang
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={0} max={23} value={f.checkout_hour}
                            onChange={e => setForms(p => ({
                              ...p,
                              [c.user_id]: { ...p[c.user_id], checkout_hour: Math.min(23, Math.max(0, Number(e.target.value))) }
                            }))}
                            className="w-12 h-10 border border-violet-200 rounded-xl text-center text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all"
                          />
                          <span className="text-gray-400 font-bold">:</span>
                          <input
                            type="number" min={0} max={59} value={f.checkout_minute}
                            onChange={e => setForms(p => ({
                              ...p,
                              [c.user_id]: { ...p[c.user_id], checkout_minute: Math.min(59, Math.max(0, Number(e.target.value))) }
                            }))}
                            className="w-12 h-10 border border-violet-200 rounded-xl text-center text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all"
                          />
                        </div>
                        <p className="text-[9px] text-violet-600 mt-1.5">Absen setelah ini = lembur</p>
                      </div>
                    </div>

                    {/* Preview / Error */}
                    {valErr ? (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3 text-xs text-red-600 flex items-center gap-2">
                        <span></span>{valErr}
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 mb-3">
                        <p className="text-[11px] text-gray-600">
                          <span className="font-semibold text-gray-500">Jadwal: </span>
                          <span className="text-emerald-700 font-bold font-mono">{fmtTime(f.open_hour, f.open_minute)}</span>
                          <span className="text-gray-400 mx-1.5">→ tepat s/d</span>
                          <span className="text-amber-700 font-bold font-mono">{fmtTime(f.late_hour, f.late_minute)}</span>
                          <span className="text-gray-400 mx-1.5">→ terlambat s/d</span>
                          <span className="text-red-700 font-bold font-mono">{fmtTime(f.close_hour, f.close_minute)}</span>
                          <span className="text-gray-400 mx-1.5">→ pulang</span>
                          <span className="text-violet-700 font-bold font-mono">{fmtTime(f.checkout_hour, f.checkout_minute)}</span>
                          <span className="text-gray-400 ml-1">WIB</span>
                        </p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSave(c.user_id)}
                        disabled={!!saving || !!valErr}
                        className="flex-1 h-10 bg-gradient-to-r from-indigo-600 to-violet-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-lg transition-all"
                      >
                        {saving === c.user_id ? (
                          <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                        ) : " Simpan Jadwal"}
                      </button>
                      {c.has_custom && (
                        <button
                          onClick={() => handleReset(c.user_id)}
                          disabled={resetting === c.user_id}
                          className="h-10 px-4 bg-white text-gray-500 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-50"
                        >
                          {resetting === c.user_id
                            ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                            : "↩ Reset Default"
                          }
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white/95">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] text-gray-400">
              Prioritas: Jadwal Tanggal › Jadwal Mingguan ›{" "}
              <span className="text-indigo-600 font-semibold">Pengaturan ini</span> › Default Shift
            </p>
            <div className="flex items-center gap-2">
              {/* Tombol "Lihat Semua" jika sedang fokus ke 1 user */}
              {filterToUser !== "all" && (
                <button
                  onClick={() => { setFilterToUser("all"); setSearch(""); }}
                  className="h-9 px-4 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl text-xs font-semibold hover:bg-indigo-100 transition-all"
                >
                  Lihat Semua
                </button>
              )}
              <button
                onClick={onClose}
                className="h-9 px-6 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}