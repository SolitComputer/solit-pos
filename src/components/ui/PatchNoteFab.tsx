"use client";

// Future enhancement (not implemented): realtime push of new patch notes via
// a dedicated anon Supabase client (NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false,
// autoRefreshToken: false } }), subscribing with
// .channel("patch-notes").on("postgres_changes", { event: "INSERT", schema:
// "public", table: "patch_notes" }, cb).subscribe(), matching the pattern in
// src/components/missions/MissionsWorkspace.tsx. Skipped for now — fetch-on-
// mount + focus/visibilitychange refetch is sufficient.

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, X } from "lucide-react";
import DraggableFab from "@/components/ui/DraggableFab";
import { useAuthUser } from "@/hooks/useAuthUser";
import { PATCH_NOTE_CATEGORY_META, type PatchNoteCategory } from "@/lib/patchNotes";

interface UnreadPatchNote {
  id: string;
  title: string;
  description: string;
  category: PatchNoteCategory;
  target_roles: string[];
  created_at: string;
}

export default function PatchNoteFab() {
  const { user } = useAuthUser();
  const [unread, setUnread] = useState<UnreadPatchNote[]>([]);
  const [openNote, setOpenNote] = useState<UnreadPatchNote | null>(null);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/patch-notes/unread");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setUnread(json.data ?? []);
    } catch {
      /* silent — keep last known state */
    }
  }, [user]);

  useEffect(() => {
    void fetchUnread();
  }, [fetchUnread]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchUnread();
    };
    window.addEventListener("focus", fetchUnread);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", fetchUnread);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchUnread]);

  const handleOpen = () => {
    const next = unread[0];
    if (!next) return;
    setOpenNote(next);
    setUnread((prev) => prev.filter((n) => n.id !== next.id));

    fetch("/api/patch-notes/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch_note_id: next.id }),
    }).catch(() => {
      /* ignore — worst case note reappears on next fetch */
    });
  };

  if (unread.length === 0 && !openNote) return null;

  return (
    <>
      {unread.length > 0 && (
        <DraggableFab storageKey="patchNoteFabPos">
          <button
            type="button"
            onClick={handleOpen}
            className="relative w-14 h-14 rounded-full bg-[#1a1a2e] text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Update terbaru"
          >
            <AlertCircle size={26} />
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
              {unread.length > 99 ? "99+" : unread.length}
            </span>
          </button>
        </DraggableFab>
      )}

      {openNote && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <span
                className="text-xs font-semibold px-2 py-1 rounded-full border"
                style={{
                  background: PATCH_NOTE_CATEGORY_META[openNote.category].bg,
                  color: PATCH_NOTE_CATEGORY_META[openNote.category].text,
                  borderColor: PATCH_NOTE_CATEGORY_META[openNote.category].border,
                }}
              >
                {PATCH_NOTE_CATEGORY_META[openNote.category].label}
              </span>
              <button onClick={() => setOpenNote(null)} aria-label="Tutup">
                <X size={20} />
              </button>
            </div>
            <h3 className="mt-3 text-lg font-bold text-[#1a1a2e]">{openNote.title}</h3>
            <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{openNote.description}</p>
          </div>
        </div>
      )}
    </>
  );
}
