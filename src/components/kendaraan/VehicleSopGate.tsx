"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FileText, Eye, Pencil, Loader2 } from "lucide-react";
import { getCurrentUserClient } from "@/lib/auth-client";
import {
  lbl, primaryBtn, secondaryBtn, ErrorBanner, Spinner,
  ModalWrapper, ModalHead, ModalFoot,
} from "@/components/kendaraan/ui";
import SopMarkdown from "@/components/kendaraan/SopMarkdown";
import MarkdownEditor from "@/components/kendaraan/MarkdownEditor";

type Sop = { content: string; updated_at: string; updated_by_name: string | null };

const ackKey = (userId: string) => `solit_vehicle_sop_ack_${userId}`;

export default function VehicleSopGate() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [sop, setSop] = useState<Sop | null>(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [forceRead, setForceRead] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const loadSop = useCallback(async () => {
    try {
      const res = await fetch("/api/vehicles/sop", { cache: "no-store" });
      const d = await res.json();
      if (res.ok && d.success) setSop(d.sop);
    } catch {
      // SOP bukan fitur kritis
    }
  }, []);

  // Ambil user + SOP sekali di mount
  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await getCurrentUserClient().catch(() => null);
      if (!alive) return;
      if (u) {
        const roles: string[] = u.roles?.length ? u.roles : u.role ? [u.role] : [];
        setUserId(u.id);
        setIsAdmin(roles.includes("ADMIN"));
      }
      await loadSop();
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [loadSop]);

  // Auto-popup wajib baca: kalau ada SOP & user belum acc versi ini
  useEffect(() => {
    if (!ready || !userId || !sop || !sop.content.trim()) return;
    let acked: string | null = null;
    try {
      acked = localStorage.getItem(ackKey(userId));
    } catch {
      /* ignore */
    }
    if (acked !== sop.updated_at) {
      setForceRead(true);
      setViewOpen(true);
    }
  }, [ready, userId, sop]);

  const ack = useCallback(() => {
    if (userId && sop) {
      try {
        localStorage.setItem(ackKey(userId), sop.updated_at);
      } catch {
        /* ignore */
      }
    }
  }, [userId, sop]);

  const closeView = useCallback(() => {
    ack();
    setViewOpen(false);
    setForceRead(false);
  }, [ack]);

  // Jangan render apa-apa kalau belum siap, atau (non-admin & belum ada SOP)
  if (!ready) return null;
  if (!sop?.content.trim() && !isAdmin) return null;

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-700 flex items-center justify-center shrink-0">
            <FileText size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black text-gray-900 truncate">SOP Peminjaman Kendaraan</p>
            <p className="text-[10px] text-gray-400 truncate">
              {sop?.content.trim() ? "Wajib dibaca sebelum meminjam" : "Belum diatur"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sop?.content.trim() && (
            <button
              onClick={() => {
                setForceRead(false);
                setViewOpen(true);
              }}
               className="h-9 px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition active:scale-95"
            >
              <Eye size={14} /> Lihat SOP
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setEditOpen(true)}
              className="h-9 px-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-[11px] font-semibold hover:bg-gray-50 flex items-center gap-1.5 transition active:scale-95"
            >
              <Pencil size={14} /> {sop?.content.trim() ? "Edit" : "Atur SOP"}
            </button>
          )}
        </div>
      </div>

      {viewOpen && sop && (
        <SopViewModal sop={sop} forceRead={forceRead} onClose={closeView} />
      )}
      {editOpen && (
        <SopEditModal
          initial={sop?.content ?? ""}
          onClose={() => setEditOpen(false)}
          onSaved={async (newSop) => {
            setSop(newSop);
            // admin dianggap sudah baca versi yang baru dia tulis
            if (userId) {
              try {
                localStorage.setItem(ackKey(userId), newSop.updated_at);
              } catch {
                /* ignore */
              }
            }
            setEditOpen(false);
          }}
        />
      )}
    </>
  );
}

// ─── VIEW (wajib gulir ke bawah kalau forceRead) ─────────────────────────────
function SopViewModal({ sop, forceRead, onClose }: { sop: Sop; forceRead: boolean; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(!forceRead);

  const checkEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setReachedEnd(true);
  }, []);

  // Konten pendek (tak perlu scroll) → langsung anggap sudah dibaca
  useEffect(() => {
    const t = setTimeout(checkEnd, 60);
    return () => clearTimeout(t);
  }, [checkEnd]);

  const canClose = !forceRead || reachedEnd;

  return (
    <ModalWrapper onClose={canClose ? onClose : () => {}} preventClose={!canClose} wide>
      <ModalHead
        icon={<FileText size={18} />}
        title="SOP Peminjaman Kendaraan"
        sub={sop.updated_by_name ? `Diperbarui oleh ${sop.updated_by_name}` : undefined}
        onClose={onClose}
        noClose={!canClose}
      />
      <div ref={scrollRef} onScroll={checkEnd} className="px-5 py-4 max-h-[55vh] overflow-y-auto">
        <SopMarkdown content={sop.content} />
      </div>
      <ModalFoot>
        {forceRead && !reachedEnd && (
          <p className="flex-1 text-[10px] text-gray-400 self-center">Gulir sampai bawah untuk melanjutkan…</p>
        )}
        <button onClick={onClose} disabled={!canClose} className={primaryBtn}>
          {canClose ? "Saya Sudah Membaca" : "Baca Dulu"}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── EDIT (ADMIN) ────────────────────────────────────────────────────────────
function SopEditModal({
  initial, onClose, onSaved,
}: {
  initial: string;
  onClose: () => void;
  onSaved: (sop: Sop) => void;
}) {
  const [content, setContent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canSave = content.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/vehicles/sop", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || `Error ${res.status}`);
      onSaved(d.sop);
    } catch (e: any) {
      setErr(e.message || "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose} preventClose={busy} wide>
      <ModalHead icon={<Pencil size={18} />} title="Edit SOP Kendaraan" sub="Hanya admin yang bisa mengubah" onClose={onClose} />
      <div className="px-5 py-4 space-y-3">
        {err && <ErrorBanner msg={err} />}
        <div>
          <label className={lbl}>Isi SOP</label>
          <MarkdownEditor
            value={content}
            onChange={setContent}
            placeholder={"Contoh:\n\n## Aturan Peminjaman\n\n1. Pastikan kendaraan **tersedia** sebelum mengajukan.\n2. Kembalikan kendaraan dalam kondisi *bersih*.\n\n| Kondisi | Tindakan |\n| --- | --- |\n| Baik | Kembali normal |\n| Rusak | Lapor admin |"}
          />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Blok teks lalu klik tombol format (tebal, miring, tabel, dll). Buka tab <b>Preview</b> untuk melihat hasilnya.
          </p>
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} disabled={busy} className={secondaryBtn}>Batal</button>
        <button onClick={save} disabled={busy || !canSave} className={primaryBtn}>
          {busy ? <Spinner /> : "Simpan SOP"}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}
