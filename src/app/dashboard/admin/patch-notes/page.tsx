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
import { Megaphone, Send, Edit3, Trash2, X, Plus, Search, Eye, CheckCircle2 } from "lucide-react";

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
        <main className="min-h-screen bg-[#F7F7F8] p-6">
          <div className="max-w-2xl mx-auto text-center py-20">
            <p className="text-gray-500 text-sm">Kamu tidak punya akses ke halaman ini.</p>
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
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
                <Megaphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Patch Notes</h1>
                <p className="text-xs text-gray-400 mt-1 font-medium">
                  Kelola update aplikasi — publish, edit, hapus, & cek pembaca
                </p>
              </div>
            </div>
            {editingId && (
              <button
                onClick={resetForm}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-300 transition"
              >
                <Plus size={14} /> Buat Baru
              </button>
            )}
          </div>

          {/* ── Form ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-sm font-extrabold text-gray-800">
                {editingId ? "Edit Patch Note" : "Publish Update Baru"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 font-semibold"
                >
                  <X size={14} /> Batal Edit
                </button>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Judul</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                placeholder="Misal: Fitur Cashflow Baru & Fix Transaksi"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Deskripsi Update</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                placeholder="Jelaskan perubahan atau fitur baru secara detail..."
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Kategori</label>
              <div className="grid grid-cols-3 gap-2">
                {VALID_PATCH_NOTE_CATEGORIES.map((cat) => {
                  const meta = PATCH_NOTE_CATEGORY_META[cat];
                  const active = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className="h-10 rounded-xl border-2 text-xs font-bold transition"
                      style={
                        active
                          ? { background: meta.bg, color: meta.text, borderColor: meta.border }
                          : { background: "white", color: "#6b7280", borderColor: "#e5e7eb" }
                      }
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                Target Role (kosongkan = semua role)
              </label>
              <div className="space-y-3 max-h-60 overflow-y-auto border border-gray-100 rounded-xl p-3">
                {Object.entries(grouped).map(([head, subs]) =>
                  subs.length === 0 ? null : (
                    <div key={head}>
                      <p className="text-[11px] font-bold text-gray-500 mb-1">{humanizeRoleKey(head)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {subs.map((role) => {
                          const active = targetRoles.includes(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => toggleRole(role)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                                active
                                  ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                                  : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
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
                className="inline-flex items-center gap-1.5 h-10 px-5 bg-[#1a1a2e] text-white rounded-xl text-xs font-bold hover:bg-[#16213e] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                <Send size={14} />
                {submitting ? "Menyimpan..." : editingId ? "Update Patch Note" : "Publish Patch Note"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-10 px-4 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition"
                >
                  Batal
                </button>
              )}
            </div>
          </div>

          {/* ── List Section ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">
                Daftar Patch Notes ({filteredList.length})
              </h2>
              <div className="relative w-48 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari patch note..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#1a1a2e]"
                />
              </div>
            </div>

            {listLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />
                ))}
              </div>
            ) : filteredList.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center">
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
                      className={`bg-white rounded-2xl border p-4 sm:p-5 transition shadow-sm ${
                        isEditing ? "border-[#1a1a2e] ring-2 ring-[#1a1a2e]/10" : "border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0"
                            style={{ background: meta.bg, color: meta.text, borderColor: meta.border }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-gray-400">
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition border border-indigo-100"
                            title="Lihat Siapa Saja Yang Sudah Membaca"
                          >
                            <Eye size={14} />
                            <span>{readerCount} Membaca</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                            title="Edit Patch Note"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
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
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/80 flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-extrabold text-sm text-gray-900 tracking-tight">Daftar Pembaca</h3>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    {selectedReadersNote.reads?.length ?? 0} Pengguna
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
                  {selectedReadersNote.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReadersNote(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition flex-shrink-0"
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
                  className="w-full h-9 pl-8 pr-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition"
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
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                          {uName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{uName}</p>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 inline-block mt-0.5">
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
