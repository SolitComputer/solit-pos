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
import { Megaphone, Send } from "lucide-react";

interface PatchNoteRow {
  id: string;
  title: string;
  description: string;
  category: PatchNoteCategory;
  target_roles: string[];
  created_at: string;
  author?: { id: string; name: string } | null;
}

export default function PatchNotesAdminPage() {
  const { user, loading } = useAuthUser();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PatchNoteCategory>("FITUR_BARU");
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [list, setList] = useState<PatchNoteRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [forbidden, setForbidden] = useState(false);

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

  const toggleRole = (role: string) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      alert("Judul & deskripsi wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/patch-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, target_roles: targetRoles }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.message || "Gagal publish");
        return;
      }
      setTitle("");
      setDescription("");
      setCategory("FITUR_BARU");
      setTargetRoles([]);
      void fetchList();
    } catch {
      alert("Terjadi kesalahan koneksi");
    } finally {
      setSubmitting(false);
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

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Patch Notes</h1>
              <p className="text-xs text-gray-400 mt-1 font-medium">
                Publish update terbaru — bisa ditarget ke role/divisi tertentu
              </p>
            </div>
          </div>

          {/* ── Form ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Judul</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                placeholder="Misal: Fitur Cashflow Baru"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Deskripsi</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                placeholder="Jelaskan perubahannya..."
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
              <div className="space-y-3 max-h-72 overflow-y-auto border border-gray-100 rounded-xl p-3">
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

            <button
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 h-10 px-5 bg-[#1a1a2e] text-white rounded-xl text-xs font-bold hover:bg-[#16213e] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={14} />
              {submitting ? "Mempublish..." : "Publish Patch Note"}
            </button>
          </div>

          {/* ── List ── */}
          {listLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
            </div>
          ) : list.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <p className="text-gray-500 text-sm">Belum ada patch note yang dipublish.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {list.map((note) => {
                const meta = PATCH_NOTE_CATEGORY_META[note.category];
                return (
                  <div key={note.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <span
                        className="text-[10px] font-bold px-2 py-1 rounded-full border flex-shrink-0"
                        style={{ background: meta.bg, color: meta.text, borderColor: meta.border }}
                      >
                        {meta.label}
                      </span>
                      <p className="text-[11px] text-gray-400 flex-shrink-0">
                        {new Date(note.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <p className="text-sm font-black text-gray-900">{note.title}</p>
                    <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{note.description}</p>
                    <p className="text-[11px] text-gray-400 mt-2">
                      Target: {note.target_roles.length === 0 ? "Semua role" : note.target_roles.map(humanizeRoleKey).join(", ")}
                    </p>
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
