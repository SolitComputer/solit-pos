"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  PATCH_NOTES_PUBLISH_ROLES,
  VALID_PATCH_NOTE_CATEGORIES,
  PATCH_NOTE_CATEGORY_META,
  type PatchNoteCategory,
} from "@/lib/patchNotes";
import { ALL_STATIC_ROLES, DIVISION_MAP, hasAnyRole, humanizeRoleKey } from "@/lib/permissions";
import {
  Megaphone,
  Send,
  Edit3,
  Trash2,
  X,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  Calendar,
} from "lucide-react";

interface PatchNoteReader {
  read_at: string;
  user: {
    id: string;
    name: string;
    role: string;
  } | null;
}

interface PatchNoteRow {
  id: string;
  title: string;
  description: string;
  category: PatchNoteCategory;
  target_roles: string[];
  created_at: string;
  author?: { id: string; name: string } | null;
  reads?: PatchNoteReader[];
}

export default function PatchNotesAdminPage() {
  const { user, loading } = useAuthUser();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PatchNoteCategory>("FITUR_BARU");
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [list, setList] = useState<PatchNoteRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // Modal pembaca patch note
  const [selectedReadersNote, setSelectedReadersNote] = useState<PatchNoteRow | null>(null);
  const [readerSearchQuery, setReaderSearchQuery] = useState("");

  const canPublish = hasAnyRole(user?.roles ?? [], PATCH_NOTES_PUBLISH_ROLES);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/patch-notes");
      if (res.status === 403) { setForbidden(true); return; }
      const json = await res.json();
      if (json.success) setList(json.data ?? []);
    } catch {
      /* keep last */
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && canPublish) void fetchList();
  }, [loading, canPublish, fetchList]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setCategory("FITUR_BARU");
    setTargetRoles([]);
  };

  const toggleRole = (role: string) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const startEdit = (note: PatchNoteRow) => {
    setEditingId(note.id);
    setTitle(note.title);
    setDescription(note.description);
    setCategory(note.category);
    setTargetRoles(note.target_roles ?? []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      alert("Judul & deskripsi wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId ? `/api/patch-notes/${editingId}` : "/api/patch-notes";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, target_roles: targetRoles }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.message || "Gagal menyimpan patch note");
        return;
      }
      resetForm();
      void fetchList();
    } catch {
      alert("Terjadi kesalahan koneksi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus Patch Note ini? Pengguna tidak akan melihatnya lagi.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/patch-notes/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        alert(json.message || "Gagal menghapus patch note");
        return;
      }
      if (editingId === id) resetForm();
      void fetchList();
    } catch {
      alert("Terjadi kesalahan koneksi");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return null;

  if (!canPublish || forbidden) {
    return (
      <DashboardLayout>
        <main className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-6">
          <div className="max-w-sm mx-auto text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Megaphone className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-gray-500 text-sm font-medium">Kamu tidak punya akses ke halaman ini.</p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  const covered = new Set<string>();
  const grouped: Record<string, string[]> = {};
  for (const [head, subs] of Object.entries(DIVISION_MAP)) {
    grouped[head] = subs;
    subs.forEach((r) => covered.add(r));
  }
  grouped["Lainnya"] = ALL_STATIC_ROLES.filter((r) => !covered.has(r));

  const filteredList = list.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout>
      <main className="relative min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8 overflow-hidden">
        {/* Soft ambient glow — the one bold accent on an otherwise quiet page */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-indigo-100/60 via-indigo-50/10 to-transparent"
        />

        <div className="max-w-4xl mx-auto space-y-6 relative">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-12 h-12 flex-shrink-0">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-800 to-indigo-900 blur-lg opacity-30" />
                <div className="relative w-12 h-12 bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/25 ring-1 ring-white/10">
                  <Megaphone className="w-5 h-5 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight leading-none">Patch Notes</h1>
                <p className="text-xs text-gray-400 mt-1.5 font-medium">
                  Kelola update aplikasi — publish, edit, hapus, & cek pembaca
                </p>
              </div>
            </div>
            {editingId && (
              <button
                onClick={resetForm}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-900/5 text-gray-700 text-xs font-bold hover:bg-gray-900/10 active:scale-95 transition-all"
              >
                <Plus size={14} /> Buat Baru
              </button>
            )}
          </div>

          {/* ── Form ── */}
          <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-900/[0.03] p-4 sm:p-6 space-y-5 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-slate-800 via-indigo-600 to-violet-500" />

            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-sm font-extrabold text-gray-800">
                {editingId ? "Edit Patch Note" : "Publish Update Baru"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 font-semibold transition-colors"
                >
                  <X size={14} /> Batal Edit
                </button>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Judul</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-11 border border-gray-200 rounded-xl px-3.5 text-sm bg-gray-50/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all"
                placeholder="Misal: Fitur Cashflow Baru & Fix Transaksi"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Deskripsi Update</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-gray-50/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all resize-none"
                placeholder="Jelaskan perubahan atau fitur baru secara detail..."
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Kategori</label>
              <div className="grid grid-cols-3 gap-2">
                {VALID_PATCH_NOTE_CATEGORIES.map((cat) => {
                  const meta = PATCH_NOTE_CATEGORY_META[cat];
                  const active = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`h-11 rounded-xl border-2 text-xs font-bold transition-all duration-200 ${
                        active ? "shadow-sm scale-[1.02]" : "hover:border-gray-300"
                      }`}
                      style={
                        active
                          ? { background: meta.bg, color: meta.text, borderColor: meta.border }
                          : { background: "white", color: "#6b7280", borderColor: "#e5e7eb" }
                      }
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: active ? meta.text : meta.border }}
                        />
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                Target Role (kosongkan = semua role)
              </label>
              <div className="space-y-3.5 max-h-60 overflow-y-auto border border-gray-100 rounded-xl p-3.5 bg-gray-50/40">
                {Object.entries(grouped).map(([head, subs]) =>
                  subs.length === 0 ? null : (
                    <div key={head}>
                      <p className="text-[11px] font-bold text-gray-500 mb-1.5">{humanizeRoleKey(head)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {subs.map((role) => {
                          const active = targetRoles.includes(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => toggleRole(role)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all duration-150 ${
                                active
                                  ? "bg-gradient-to-r from-slate-800 to-indigo-900 text-white border-slate-800 shadow-sm"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {humanizeRoleKey(role)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
              </div>
              {targetRoles.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-1.5">{targetRoles.length} role dipilih</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 h-11 px-6 bg-gradient-to-r from-slate-800 to-indigo-900 text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-indigo-900/25 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none shadow-md"
              >
                <Send size={14} />
                {submitting ? "Menyimpan..." : editingId ? "Update Patch Note" : "Publish Patch Note"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-11 px-4 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 active:scale-[0.98] transition-all"
                >
                  Batal
                </button>
              )}
            </div>
          </div>

          {/* ── List Section ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold text-gray-900 tracking-wide">
                Daftar Patch Notes <span className="text-gray-400 font-bold">({filteredList.length})</span>
              </h2>
              <div className="relative w-48 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari patch note..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all shadow-sm"
                />
              </div>
            </div>

            {listLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 overflow-hidden relative">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-gray-100/80 to-transparent" />
                  </div>
                ))}
                <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
              </div>
            ) : filteredList.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 py-14 text-center">
                <div className="w-11 h-11 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                  <Search className="w-4.5 h-4.5 text-gray-300" />
                </div>
                <p className="text-gray-400 text-xs font-medium">Tidak ada patch note ditemukan.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredList.map((note) => {
                  const meta = PATCH_NOTE_CATEGORY_META[note.category];
                  const isEditing = editingId === note.id;
                  const isDeleting = deletingId === note.id;
                  const readerCount = note.reads?.length ?? 0;

                  return (
                    <div
                      key={note.id}
                      className={`group bg-white rounded-2xl border p-4 sm:p-5 transition-all shadow-sm hover:shadow-md ${
                        isEditing ? "border-indigo-300 ring-2 ring-indigo-500/10" : "border-gray-100 hover:border-gray-200"
                      }`}
                      style={{ borderLeftWidth: 3, borderLeftColor: isEditing ? undefined : meta.border }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0"
                            style={{ background: meta.bg, color: meta.text, borderColor: meta.border }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                            <Calendar size={11} className="text-gray-300" />
                            {new Date(note.created_at).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5">
                          {/* Reader Button Badge */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReadersNote(note);
                              setReaderSearchQuery("");
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-100"
                            title="Lihat Siapa Saja Yang Sudah Membaca"
                          >
                            <Eye size={14} />
                            <span>{readerCount} Membaca</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit Patch Note"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Hapus Patch Note"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-sm font-extrabold text-gray-900">{note.title}</h3>
                      <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-line leading-relaxed">
                        {note.description}
                      </p>

                      <div className="mt-3 pt-2.5 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400 flex-wrap gap-2">
                        <span>
                          Target:{" "}
                          <strong className="text-gray-600">
                            {note.target_roles.length === 0
                              ? "Semua Role"
                              : note.target_roles.map(humanizeRoleKey).join(", ")}
                          </strong>
                        </span>
                        {note.author?.name && <span>Oleh: {note.author.name}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── MODAL: Daftar Pengguna Yang Sudah Membaca ── */}
      {selectedReadersNote && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 flex flex-col max-h-[80dvh] overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-indigo-950 flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-300" />
                  <h3 className="font-extrabold text-sm text-white tracking-tight">Daftar Pembaca</h3>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/10 text-indigo-100">
                    {selectedReadersNote.reads?.length ?? 0} Pengguna
                  </span>
                </div>
                <p className="text-xs text-indigo-200/70 font-medium truncate mt-0.5">
                  {selectedReadersNote.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReadersNote(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-indigo-200 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Filter */}
            <div className="p-3 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari nama atau role pengguna..."
                  value={readerSearchQuery}
                  onChange={(e) => setReaderSearchQuery(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Readers List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {(() => {
                const allReads = selectedReadersNote.reads ?? [];
                const filtered = allReads.filter((r) => {
                  if (!readerSearchQuery.trim()) return true;
                  const q = readerSearchQuery.toLowerCase();
                  const name = (r.user?.name ?? "").toLowerCase();
                  const role = (r.user?.role ?? "").toLowerCase();
                  const humanRole = humanizeRoleKey(r.user?.role ?? "").toLowerCase();
                  return name.includes(q) || role.includes(q) || humanRole.includes(q);
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-10 text-center text-gray-400 text-xs">
                      {allReads.length === 0
                        ? "Belum ada pengguna yang membaca patch note ini."
                        : "Tidak ada pengguna yang cocok dengan pencarian."}
                    </div>
                  );
                }

                return filtered.map((r, idx) => {
                  const uName = r.user?.name || "Pengguna";
                  const uRole = r.user?.role ? humanizeRoleKey(r.user.role) : "Role Kosong";
                  const readTime = new Date(r.read_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={r.user?.id || idx}
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 hover:border-gray-200 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                          {uName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{uName}</p>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 inline-block mt-0.5">
                            {uRole}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          {readTime}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}