"use client";

import { useEffect, useState, useCallback } from "react";
import { Sparkles, X, Minus, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Bell } from "lucide-react";
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
  author?: { id: string; name: string } | null;
}

export default function PatchNoteFab() {
  const { user } = useAuthUser();
  const [unread, setUnread] = useState<UnreadPatchNote[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  // 2-Step Verification Confirmation Modal State
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [isDismissedForDay, setIsDismissedForDay] = useState(false);

  const getDismissStorageKey = useCallback(() => {
    return `patch_notes_dismissed_until_${user?.id || "guest"}`;
  }, [user?.id]);

  const checkIsDismissed = useCallback(() => {
    try {
      const key = getDismissStorageKey();
      const value = localStorage.getItem(key);
      if (value) {
        const until = Number(value);
        if (Date.now() < until) {
          return true;
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore storage errors */
    }
    return false;
  }, [getDismissStorageKey]);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    if (checkIsDismissed()) {
      setIsDismissedForDay(true);
      return;
    }
    setIsDismissedForDay(false);

    try {
      const res = await fetch("/api/patch-notes/unread");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setUnread(json.data);
        // Otomatis buka modal pertama kali jika unread > 0 dan belum disembunyikan
        setIsOpen(true);
      } else {
        setUnread([]);
        setIsOpen(false);
      }
    } catch {
      /* silent */
    }
  }, [user, checkIsDismissed]);

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

  const markCurrentRead = async () => {
    const current = unread[currentIndex];
    if (!current) return;

    try {
      await fetch("/api/patch-notes/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch_note_id: current.id }),
      });
    } catch {
      /* ignore */
    }

    const nextUnread = unread.filter((_, i) => i !== currentIndex);
    setUnread(nextUnread);
    if (nextUnread.length === 0) {
      setIsOpen(false);
      setIsMinimized(false);
    } else if (currentIndex >= nextUnread.length) {
      setCurrentIndex(nextUnread.length - 1);
    }
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    setIsOpen(false);
  };

  const handleExpandFromFab = () => {
    setIsMinimized(false);
    setIsOpen(true);
  };

  // ── Verifikasi 2-Langkah saat tekan tombol Silang (✕) ──
  const handleInitiateClose = () => {
    setShowDismissConfirm(true);
  };

  const handleCancelDismiss = () => {
    setShowDismissConfirm(false);
  };

  const handleConfirmDismiss24Hours = () => {
    try {
      const key = getDismissStorageKey();
      const twentyFourHours = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem(key, String(twentyFourHours));
    } catch {
      /* ignore */
    }
    setIsDismissedForDay(true);
    setShowDismissConfirm(false);
    setIsOpen(false);
    setIsMinimized(false);
  };

  if (isDismissedForDay || unread.length === 0) return null;

  const currentNote = unread[currentIndex] || unread[0];
  const meta = currentNote ? PATCH_NOTE_CATEGORY_META[currentNote.category] : null;

  return (
    <>
      {/* ── Floating Mini Widget (saat diperkecil/minimize) ── */}
      {isMinimized && !isOpen && (
        <DraggableFab storageKey="patchNoteFabPos">
          <button
            type="button"
            onClick={handleExpandFromFab}
            className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-gray-900 via-gray-800 to-slate-900 text-white shadow-2xl ring-2 ring-white/20 active:scale-95 transition-all duration-200"
            aria-label="Update Sistem Terbaru"
          >
            <div className="relative">
              <Bell className="w-5 h-5 text-amber-400 animate-bounce" />
              <span className="absolute -top-1 -right-1.5 min-w-[18px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center border border-gray-900">
                {unread.length}
              </span>
            </div>
            <div className="text-left pr-1 hidden sm:block">
              <p className="text-xs font-bold leading-none tracking-tight">Update Aplikasi</p>
              <p className="text-[10px] text-gray-300 font-medium mt-0.5">{unread.length} pesan belum dibaca</p>
            </div>
          </button>
        </DraggableFab>
      )}

      {/* ── Modal Patch Note Utama ── */}
      {isOpen && !isMinimized && currentNote && meta && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 flex flex-col max-h-[85dvh] overflow-hidden ring-1 ring-black/5">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-900 via-slate-900 to-gray-800 text-white flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-sm tracking-tight text-white leading-snug">Patch Notes & Update</h2>
                    {unread.length > 1 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        {currentIndex + 1} / {unread.length}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-300 truncate">Solit POS Information Center</p>
                </div>
              </div>

              {/* Top Controls: Minimize (-) and Silang (X) */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleMinimize}
                  title="Perkecil (Minimize)"
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition"
                >
                  <Minus size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleInitiateClose}
                  title="Sembunyikan 1 Hari (2-Step Verify)"
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-300 hover:bg-red-500/20 active:scale-95 transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Sub-Header Metadata & Navigation */}
            <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span
                  className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border flex-shrink-0"
                  style={{ background: meta.bg, color: meta.text, borderColor: meta.border }}
                >
                  {meta.label}
                </span>
                <span className="text-[11px] text-gray-400 font-medium">
                  {new Date(currentNote.created_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>

              {/* Navigation arrows if multiple notes */}
              {unread.length > 1 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : unread.length - 1))}
                    className="p-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:scale-95 transition text-xs font-bold"
                    title="Sebelumnya"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[11px] font-mono text-gray-500 px-1 font-bold">
                    {currentIndex + 1}/{unread.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => (prev < unread.length - 1 ? prev + 1 : 0))}
                    className="p-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:scale-95 transition text-xs font-bold"
                    title="Selanjutnya"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Modal Body (Scrollable if long text) */}
            <div className="p-5 overflow-y-auto flex-1 max-h-[50vh] space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
              <h3 className="text-base sm:text-lg font-black text-gray-900 leading-snug tracking-tight">
                {currentNote.title}
              </h3>
              <div className="text-xs sm:text-sm text-gray-600 leading-relaxed whitespace-pre-line space-y-2 font-normal">
                {currentNote.description}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={handleMinimize}
                className="text-xs font-bold text-gray-500 hover:text-gray-800 transition flex items-center gap-1"
              >
                <Minus size={14} /> Perkecil Widget
              </button>

              <button
                type="button"
                onClick={markCurrentRead}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-gray-900 to-slate-800 text-white rounded-xl text-xs font-bold hover:from-black hover:to-gray-900 active:scale-95 transition shadow-sm"
              >
                <CheckCircle2 size={15} /> Mengerti / Paham
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VERIFIKASI 2-LANGKAH (Confirmation Modal saat Tombol Silang Ditekan) ── */}
      {showDismissConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-gray-900 tracking-tight">Sembunyikan Patch Notes?</h3>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Pengumuman patch note tidak akan dimunculkan di layar Anda selama <strong className="text-gray-800">24 jam ke depan (1 hari)</strong>.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancelDismiss}
                className="h-10 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 active:scale-95 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDismiss24Hours}
                className="h-10 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 active:scale-95 transition shadow-md shadow-red-600/20"
              >
                Ya, Sembunyikan 1 Hari
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
