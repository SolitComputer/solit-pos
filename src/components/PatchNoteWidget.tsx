"use client";

import { useEffect, useState, useCallback } from "react";
import { Megaphone, X, CheckCircle2 } from "lucide-react";
import DraggableFab from "@/components/ui/DraggableFab";
import { useAuthUser } from "@/hooks/useAuthUser";
import { PATCH_NOTE_CATEGORY_META, type PatchNoteCategory } from "@/lib/patchNotes";

interface PatchNoteRow {
  id: string;
  title: string;
  description: string;
  category: PatchNoteCategory;
  created_at: string;
}

export default function PatchNoteWidget() {
  const { user, loading } = useAuthUser();
  const [notes, setNotes] = useState<PatchNoteRow[]>([]);
  const [fetched, setFetched] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (loading || !user || fetched) return;
    (async () => {
      try {
        const res = await fetch("/api/patch-notes/my");
        const json = await res.json();
        if (json.success) setNotes(json.data ?? []);
      } catch {
        /* gagal fetch → widget nggak muncul, aman diabaikan */
      } finally {
        setFetched(true);
      }
    })();
  }, [loading, user, fetched]);

  const activeNote = notes[0] ?? null;

  const handleTutupClick = useCallback(() => {
    setConfirmClose(true);
  }, []);

  const handleBatalConfirm = useCallback(() => {
    setConfirmClose(false);
  }, []);

  const handleConfirmClose = useCallback(async () => {
    if (!activeNote) return;
    setClosing(true);
    try {
      await fetch(`/api/patch-notes/${activeNote.id}/read`, { method: "POST" });
      setNotes((prev) => prev.filter((n) => n.id !== activeNote.id));
      setConfirmClose(false);
      // Kalau masih ada note lain yang belum dibaca, modal tetap kebuka nampilin yang berikutnya.
      // Kalau ini yang terakhir, tutup modalnya.
      setModalOpen((prevOpen) => (notes.length > 1 ? prevOpen : false));
    } catch {
      alert("Gagal menutup patch note, coba lagi.");
    } finally {
      setClosing(false);
    }
  }, [activeNote, notes.length]);

  // Nggak ada patch note baru → widget nggak usah dirender sama sekali
  if (!fetched || notes.length === 0) return null;

  const meta = activeNote ? PATCH_NOTE_CATEGORY_META[activeNote.category] : null;

  return (
    <>
      <DraggableFab storageKey="patch-note-fab-pos" initialBottom={160}>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-[#0f0c29] to-[#1a1545] shadow-lg shadow-black/30 flex items-center justify-center"
        >
          <Megaphone className="w-6 h-6 text-white" />
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center border-2 border-white">
            {notes.length}
          </span>
        </button>
      </DraggableFab>

      {modalOpen && activeNote && meta && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-gray-700" />
                <h3 className="font-extrabold text-sm text-gray-900">Update Baru</h3>
              </div>
              {!confirmClose && (
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition"
                  title="Tutup sementara (masih akan muncul lagi nanti)"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="p-5 space-y-3">
              <span
                className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full border"
                style={{ background: meta.bg, color: meta.text, borderColor: meta.border }}
              >
                {meta.label}
              </span>
              <h4 className="text-base font-black text-gray-900">{activeNote.title}</h4>
              <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                {activeNote.description}
              </p>
            </div>

            <div className="p-4 border-t border-gray-100">
              {!confirmClose ? (
                <button
                  type="button"
                  onClick={handleTutupClick}
                  className="w-full h-10 rounded-xl bg-[#1a1a2e] text-white text-xs font-bold hover:bg-[#16213e] transition"
                >
                  Tutup
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 text-center font-medium">
                    Yakin sudah dibaca? Update ini nggak akan muncul lagi setelah ditutup.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleBatalConfirm}
                      disabled={closing}
                      className="flex-1 h-10 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200 transition disabled:opacity-40"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmClose}
                      disabled={closing}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-40"
                    >
                      <CheckCircle2 size={14} />
                      {closing ? "Menyimpan..." : "Ya, Tutup"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}