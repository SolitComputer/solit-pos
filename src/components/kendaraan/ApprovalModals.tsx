"use client";

import { useState } from "react";
import { CheckCircle2, Bike, Ban } from "lucide-react";
import {
  inp, lbl, primaryBtn, secondaryBtn, dangerBtn, ErrorBanner, Spinner,
  ModalWrapper, ModalHead, ModalFoot, formatDateTime,
} from "@/components/kendaraan/ui";

// Bentuk minimal request yang dibutuhkan modal (dipakai di halaman utama & dashboard)
export type ApprovalRequest = {
  id: string;
  requested_at: string;
  vehicle?: { name: string } | null;
  borrower?: { name: string; role: string } | null;
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-gray-400 font-semibold">{k}</span>
      <span className="text-gray-800 font-bold text-right truncate">{v}</span>
    </div>
  );
}

// ─── APPROVE (2 langkah confirmStep) ─────────────────────────────────────────
export function ApproveRequestModal({
  request, onClose, onSaved,
}: {
  request: ApprovalRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [confirmStep, setConfirmStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const approve = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/vehicles/borrow/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setErr(d.message || `Error ${res.status}`);
        setConfirmStep(false);
        return;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Gagal");
      setConfirmStep(false);
    } finally {
      setBusy(false);
    }
  };

  if (confirmStep) {
    return (
      <ModalWrapper onClose={onClose} preventClose={busy}>
        <ModalHead icon={<CheckCircle2 size={18} />} title="Konfirmasi ACC" sub="Langkah terakhir — pastikan datanya benar" onClose={onClose} noClose={busy} />
        <div className="px-5 py-4 space-y-2.5">
          {err && <ErrorBanner msg={err} />}
          <Row k="Kendaraan" v={request.vehicle?.name ?? "—"} />
          <Row k="Peminjam" v={request.borrower?.name ?? "—"} />
          <Row k="Diajukan" v={formatDateTime(request.requested_at)} />
        </div>
        <ModalFoot>
          <button onClick={() => setConfirmStep(false)} disabled={busy} className={secondaryBtn}>← Kembali</button>
          <button onClick={approve} disabled={busy} className={primaryBtn}>
            {busy ? <Spinner /> : "Ya, ACC Sekarang"}
          </button>
        </ModalFoot>
      </ModalWrapper>
    );
  }

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon={<Bike size={18} />} title="Setujui Peminjaman" sub={request.vehicle?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-2.5">
        {err && <ErrorBanner msg={err} />}
        <Row k="Kendaraan" v={request.vehicle?.name ?? "—"} />
        <Row k="Peminjam" v={`${request.borrower?.name ?? "—"} · ${request.borrower?.role?.replace(/_/g, " ") ?? ""}`} />
        <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
          Setelah disetujui, kendaraan berstatus <b>Dipakai</b> dan waktu mulai dicatat otomatis.
        </p>
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={() => setConfirmStep(true)} className={primaryBtn}>
          <CheckCircle2 size={14} /> Setujui
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── REJECT (isi alasan -> konfirmasi) ───────────────────────────────────────
export function RejectRequestModal({
  request, onClose, onSaved,
}: {
  request: ApprovalRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reject = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/vehicles/borrow/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", rejection_note: note.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setErr(d.message || `Error ${res.status}`);
        setConfirmStep(false);
        return;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Gagal");
      setConfirmStep(false);
    } finally {
      setBusy(false);
    }
  };

  if (confirmStep) {
    return (
      <ModalWrapper onClose={onClose} preventClose={busy}>
        <ModalHead icon={<Ban size={18} />} title="Konfirmasi Tolak" sub="Pengajuan akan ditolak" onClose={onClose} noClose={busy} />
        <div className="px-5 py-4 space-y-2.5">
          {err && <ErrorBanner msg={err} />}
          <Row k="Kendaraan" v={request.vehicle?.name ?? "—"} />
          <Row k="Peminjam" v={request.borrower?.name ?? "—"} />
          <Row k="Alasan" v={note} />
        </div>
        <ModalFoot>
          <button onClick={() => setConfirmStep(false)} disabled={busy} className={secondaryBtn}>← Kembali</button>
          <button onClick={reject} disabled={busy} className={dangerBtn}>
            {busy ? <Spinner /> : "Ya, Tolak"}
          </button>
        </ModalFoot>
      </ModalWrapper>
    );
  }

  const canNext = note.trim().length > 0;
  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon={<Ban size={18} />} title="Tolak Peminjaman" sub={request.vehicle?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3">
        {err && <ErrorBanner msg={err} />}
        <div>
          <label className={lbl}>Alasan Penolakan *</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="mis. Kendaraan sudah dijadwalkan untuk keperluan lain"
            className={`${inp} h-auto py-2.5 resize-none`}
          />
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={() => setConfirmStep(true)} disabled={!canNext} className={dangerBtn}>
          Lanjut
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}
