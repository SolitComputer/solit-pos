"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { NOTIF_SOUND_OPTIONS, playSoundByKey } from "@/lib/preparationSound";
import { Volume2, Save, PlayCircle, Upload, Trash2 } from "lucide-react";

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

export default function NotificationSoundSettingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [library, setLibrary] = useState<LibrarySound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [dirty, setDirty] = useState<Record<string, Partial<Row>>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (!result.success) alert(result.message || "Gagal menyimpan");
      else setDirty((prev) => { const n = { ...prev }; delete n[id]; return n; });
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

  const deleteLibrarySound = async (id: string) => {
    if (!confirm("Hapus suara ini dari library? Akun yang masih memakainya akan otomatis balik ke suara default.")) return;
    try {
      await fetch(`/api/notification-settings/library?id=${id}`, { method: "DELETE" });
      setLibrary((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert("Gagal menghapus suara");
    }
  };

  if (forbidden) {
    return (
      <DashboardLayout>
        <main className="min-h-screen bg-[#F7F7F8] p-6">
          <div className="max-w-2xl mx-auto text-center py-20">
            <p className="text-gray-500 text-sm">Kamu tidak punya akses ke halaman ini.</p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
              <Volume2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Suara Notifikasi Pengantaran</h1>
              <p className="text-xs text-gray-400 mt-1 font-medium">
                Atur suara &amp; mode notifikasi berulang untuk tiap akun pengantaran
              </p>
            </div>
          </div>

          {/* ── Library upload ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-gray-900">Library Suara Custom</p>
              <label className="inline-flex items-center gap-1.5 h-9 px-4 bg-[#1a1a2e] text-white rounded-xl text-xs font-bold hover:bg-[#16213e] transition cursor-pointer">
                <Upload size={14} />
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
            </div>
            <p className="text-[11px] text-gray-400">Format mp3/aac/wav/ogg/m4a, maksimal 3MB. Contoh: rekaman voice note WhatsApp.</p>
            {uploadError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{uploadError}</div>}

            {library.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Belum ada suara yang diupload.</p>
            ) : (
              <div className="space-y-1.5">
                {library.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                    <button type="button" onClick={() => new Audio(s.file_url).play().catch(() => {})}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition flex-shrink-0">
                      <PlayCircle size={16} className="text-gray-500" />
                    </button>
                    <p className="text-xs font-semibold text-gray-700 truncate flex-1">{s.name}</p>
                    <button type="button" onClick={() => deleteLibrarySound(s.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition flex-shrink-0">
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
              {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
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
                  <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-full bg-gray-800 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {r.name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p className="text-sm font-black text-gray-900">{r.name}</p>
                          <p className="text-[11px] text-gray-400">{r.role}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => save(r.id)}
                        disabled={!hasChange || savingId === r.id}
                        className="inline-flex items-center gap-1.5 h-9 px-4 bg-[#1a1a2e] text-white rounded-xl text-xs font-bold hover:bg-[#16213e] transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Save size={14} />
                        {savingId === r.id ? "Menyimpan..." : "Simpan"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Sumber Suara</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => patchLocal(r.id, { sound_key: "default" })}
                            className={`h-10 rounded-xl border-2 text-xs font-bold transition ${!isCustom ? "border-[#1a1a2e] bg-gray-100 text-gray-800" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                            Suara Preset
                          </button>
                          <button type="button" onClick={() => patchLocal(r.id, { sound_key: "custom" })}
                            className={`h-10 rounded-xl border-2 text-xs font-bold transition ${isCustom ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                            Suara Upload
                          </button>
                        </div>
                      </div>

                      {!isCustom ? (
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Pilih Preset</label>
                          <div className="flex gap-2">
                            <select
                              value={r.sound_key}
                              onChange={(e) => patchLocal(r.id, { sound_key: e.target.value })}
                              className="flex-1 h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                            >
                              {NOTIF_SOUND_OPTIONS.map((opt) => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => playSoundByKey(r.sound_key)} title="Coba dengarkan"
                              className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex-shrink-0">
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
                            <button type="button"
                              onClick={() => r.custom_sound_url && new Audio(r.custom_sound_url).play().catch(() => {})}
                              disabled={!r.custom_sound_url} title="Coba dengarkan"
                              className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex-shrink-0 disabled:opacity-40">
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
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => patchLocal(r.id, { repeat_enabled: false })}
                            className={`h-10 rounded-xl border-2 text-xs font-bold transition ${!r.repeat_enabled ? "border-[#1a1a2e] bg-gray-100 text-gray-800" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                            Sekali Bunyi
                          </button>
                          <button type="button" onClick={() => patchLocal(r.id, { repeat_enabled: true })}
                            className={`h-10 rounded-xl border-2 text-xs font-bold transition ${r.repeat_enabled ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                            Berulang Sampai Dibuka
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}