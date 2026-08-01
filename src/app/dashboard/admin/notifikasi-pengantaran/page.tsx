"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { NOTIF_SOUND_OPTIONS, playSoundByKey } from "@/lib/preparationSound";
import {
  Volume2,
  Save,
  PlayCircle,
  PauseCircle,
  UploadCloud,
  Trash2,
  ArrowUp,
  CheckCircle2,
  Music2,
} from "lucide-react";

interface Row {
  id: string;
  name: string;
  role: string;
  sound_key: string;
  repeat_enabled: boolean;
  repeat_interval_ms: number;
  custom_sound_url: string | null;
}

interface LibrarySound {
  id: string;
  name: string;
  file_url: string;
  created_at: string;
}

/** Tombol segmented 2-opsi yang dipakai ulang untuk "Sumber Suara" & "Mode Notifikasi" */
function SegmentedToggle<T extends string | boolean>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; activeClass: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`min-h-[44px] sm:h-10 rounded-xl border-2 px-2 text-[11px] sm:text-xs font-bold leading-tight transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
              active
                ? opt.activeClass
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function NotificationSoundSettingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [library, setLibrary] = useState<LibrarySound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [dirty, setDirty] = useState<Record<string, Partial<Row>>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rowsRes, libRes] = await Promise.all([
        fetch("/api/notification-settings"),
        fetch("/api/notification-settings/library"),
      ]);
      if (rowsRes.status === 403) { setForbidden(true); return; }
      const rowsResult = await rowsRes.json();
      if (rowsResult.success) setRows(rowsResult.data);
      const libResult = await libRes.json();
      if (libResult.success) setLibrary(libResult.data);
    } catch {
      /* keep last */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Tombol "kembali ke atas" muncul setelah scroll agak jauh (berguna di HP saat daftar akun panjang)
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const patchLocal = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const save = async (id: string) => {
    const patch = dirty[id];
    if (!patch) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/notification-settings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await res.json();
      if (!result.success) {
        alert(result.message || "Gagal menyimpan");
      } else {
        setDirty((prev) => { const n = { ...prev }; delete n[id]; return n; });
        setSavedId(id);
        setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1800);
      }
    } catch {
      alert("Terjadi kesalahan koneksi");
    } finally {
      setSavingId(null);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", file.name);
      const res = await fetch("/api/notification-settings/upload-sound", { method: "POST", body: form });
      const result = await res.json();
      if (!result.success) { setUploadError(result.message || "Gagal upload"); return; }
      setLibrary((prev) => [result.data, ...prev]);
    } catch {
      setUploadError("Terjadi kesalahan koneksi saat upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) return;
    const f = e.dataTransfer.files?.[0];
    if (f) handleUpload(f);
  };

  const deleteLibrarySound = async (id: string) => {
    if (!confirm("Hapus suara ini dari library? Akun yang masih memakainya akan otomatis balik ke suara default.")) return;
    try {
      await fetch(`/api/notification-settings/library?id=${id}`, { method: "DELETE" });
      setLibrary((prev) => prev.filter((s) => s.id !== id));
      if (playingId === id) { audioRef.current?.pause(); setPlayingId(null); }
    } catch {
      alert("Gagal menghapus suara");
    }
  };

  const toggleLibraryPlay = (s: LibrarySound) => {
    if (playingId === s.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(s.file_url);
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(s.id);
  };

  if (forbidden) {
    return (
      <DashboardLayout>
        <main className="min-h-screen bg-[#F7F7F8] p-6 flex items-center justify-center">
          <div className="max-w-sm w-full text-center bg-white border border-gray-100 rounded-2xl shadow-sm py-12 px-6">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <Volume2 className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">Kamu tidak punya akses ke halaman ini.</p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8]">
        {/* ── Header, sticky biar tetap kelihatan saat scroll di daftar akun yang panjang ── */}
        <div className="sticky top-0 z-20 bg-[#F7F7F8]/95 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-5 flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
              <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight leading-tight truncate">
                Suara Notifikasi Pengantaran
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 font-medium truncate">
                Atur suara &amp; mode notifikasi berulang untuk tiap akun pengantaran
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6 pb-16">
          {/* ── Library upload ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-gray-900">Library Suara Custom</p>
              <span className="text-[11px] font-bold text-gray-400 flex-shrink-0">{library.length} suara</span>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); if (!uploading) setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed transition-colors duration-150 px-4 py-5 sm:py-6 text-center ${
                isDragging ? "border-[#1a1a2e] bg-gray-50" : "border-gray-200"
              }`}
            >
              <label className="inline-flex items-center gap-1.5 h-10 px-4 bg-[#1a1a2e] text-white rounded-xl text-xs font-bold hover:bg-[#16213e] transition cursor-pointer active:scale-[0.97] focus-within:ring-2 focus-within:ring-violet-500/40">
                <UploadCloud size={14} />
                {uploading ? "Mengunggah..." : "Upload Suara"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                />
              </label>
              <p className="text-[11px] text-gray-400 mt-2">
                Atau tarik-lepas file di sini &middot; mp3/aac/wav/ogg/m4a, maksimal 3MB
              </p>
            </div>

            {uploadError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{uploadError}</div>
            )}

            {library.length === 0 ? (
              <div className="text-center py-6">
                <Music2 className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-400">Belum ada suara yang diupload.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {library.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 hover:bg-gray-100/70 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleLibraryPlay(s)}
                      className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                    >
                      {playingId === s.id ? (
                        <PauseCircle size={16} className="text-[#1a1a2e]" />
                      ) : (
                        <PlayCircle size={16} className="text-gray-500" />
                      )}
                    </button>
                    <p className="text-xs font-semibold text-gray-700 truncate flex-1">{s.name}</p>
                    <button
                      type="button"
                      onClick={() => deleteLibrarySound(s.id)}
                      className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Per-akun ── */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-36 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <p className="text-gray-500 text-sm">Belum ada akun dengan role pengantaran.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => {
                const hasChange = !!dirty[r.id];
                const isCustom = r.sound_key === "custom";
                return (
                  <div
                    key={r.id}
                    className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow duration-200 p-4 sm:p-5 ${
                      isCustom ? "border-orange-100" : "border-gray-100"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-gray-800 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {r.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-gray-900 truncate">{r.name}</p>
                            {hasChange && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Belum disimpan
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate">{r.role}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => save(r.id)}
                        disabled={!hasChange || savingId === r.id}
                        className={`inline-flex items-center gap-1.5 h-10 sm:h-9 px-4 rounded-xl text-xs font-bold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
                          savedId === r.id
                            ? "bg-emerald-600 text-white"
                            : "bg-[#1a1a2e] text-white hover:bg-[#16213e] disabled:opacity-40"
                        }`}
                      >
                        {savedId === r.id ? <CheckCircle2 size={14} /> : <Save size={14} />}
                        {savingId === r.id ? "Menyimpan..." : savedId === r.id ? "Tersimpan" : "Simpan"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Sumber Suara</label>
                        <SegmentedToggle
                          value={isCustom ? "custom" : "default"}
                          onChange={(v) => patchLocal(r.id, { sound_key: v })}
                          options={[
                            { value: "default", label: "Suara Preset", activeClass: "border-[#1a1a2e] bg-gray-100 text-gray-800 shadow-sm" },
                            { value: "custom", label: "Suara Upload", activeClass: "border-orange-500 bg-orange-50 text-orange-700 shadow-sm" },
                          ]}
                        />
                      </div>

                      {!isCustom ? (
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Pilih Preset</label>
                          <div className="flex gap-2">
                            <select
                              value={r.sound_key}
                              onChange={(e) => patchLocal(r.id, { sound_key: e.target.value })}
                              className="flex-1 h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-[#1a1a2e] focus:bg-white transition"
                            >
                              {NOTIF_SOUND_OPTIONS.map((opt) => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => playSoundByKey(r.sound_key)}
                              title="Coba dengarkan"
                              className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                            >
                              <PlayCircle size={18} className="text-gray-500" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Pilih Suara dari Library</label>
                          <div className="flex gap-2">
                            <select
                              value={r.custom_sound_url ?? ""}
                              onChange={(e) => patchLocal(r.id, { custom_sound_url: e.target.value })}
                              className="flex-1 h-10 border border-orange-200 rounded-xl px-3 text-sm bg-orange-50/40 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition"
                            >
                              <option value="">— Pilih suara —</option>
                              {library.map((s) => (
                                <option key={s.id} value={s.file_url}>{s.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => r.custom_sound_url && new Audio(r.custom_sound_url).play().catch(() => {})}
                              disabled={!r.custom_sound_url}
                              title="Coba dengarkan"
                              className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex-shrink-0 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                            >
                              <PlayCircle size={18} className="text-gray-500" />
                            </button>
                          </div>
                          {library.length === 0 && (
                            <p className="text-[11px] text-orange-600 mt-1.5">Belum ada suara di library — upload dulu di atas.</p>
                          )}
                        </div>
                      )}

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Mode Notifikasi Tugas Baru</label>
                        <SegmentedToggle
                          value={r.repeat_enabled}
                          onChange={(v) => patchLocal(r.id, { repeat_enabled: v })}
                          options={[
                            { value: false, label: "Sekali Bunyi", activeClass: "border-[#1a1a2e] bg-gray-100 text-gray-800 shadow-sm" },
                            { value: true, label: "Berulang Sampai Dibuka", activeClass: "border-orange-500 bg-orange-50 text-orange-700 shadow-sm" },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Kembali ke atas (mobile-friendly) ── */}
        {showScrollTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Kembali ke atas"
            className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-30 w-11 h-11 rounded-full bg-[#1a1a2e] text-white shadow-lg shadow-gray-900/25 flex items-center justify-center hover:bg-[#16213e] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </main>
    </DashboardLayout>
  );
}