"use client";

import { useState } from "react";
import { CheckCircle2, Ban } from "lucide-react";
import {
  ErrorBanner, ConfirmModal,
} from "@/components/kendaraan/ui";

// Bentuk minimal request yang dibutuhkan modal (dipakai di halaman utama & dashboard)
export type ApprovalRequest = {
  id: string;
  requested_at: string;
  vehicle?: { name: string } | null;
  borrower?: { name: string; role: string } | null;
};

// ─── APPROVE (Konfirmasi 1-klik tanpa form) ──────────────────────────────────
export function ApproveRequestModal({
  request, onClose, onSaved,
}: {
  request: ApprovalRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
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
        return;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Gagal menyetujui pengajuan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      icon={<CheckCircle2 size={22} />}
      tone="default"
      title="Setujui peminjaman ini?"
      confirmLabel="Ya, Setujui"
      cancelLabel="Batal"
      busy={busy}
      onConfirm={approve}
      onCancel={onClose}
      message={
        <>
          Setujui peminjaman <b className="text-gray-900">{request.vehicle?.name ?? "kendaraan ini"}</b> untuk{" "}
          <b className="text-gray-900">{request.borrower?.name ?? "karyawan ini"}</b>. Status kendaraan akan otomatis menjadi <b>Dipakai</b>.
          {err && (
            <span className="block mt-3 text-left">
              <ErrorBanner msg={err} />
            </span>
          )}
        </>
      }
    />
  );
}

// ─── REJECT (Konfirmasi 1-klik tanpa form & tanpa alasan wajib) ───────────────
export function RejectRequestModal({
  request, onClose, onSaved,
}: {
  request: ApprovalRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reject = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/vehicles/borrow/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", rejection_note: null }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setErr(d.message || `Error ${res.status}`);
        return;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Gagal menolak pengajuan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      icon={<Ban size={22} />}
      tone="danger"
      title="Tolak pengajuan ini?"
      confirmLabel="Ya, Tolak"
      cancelLabel="Batal"
      busy={busy}
      onConfirm={reject}
      onCancel={onClose}
      message={
        <>
          Pengajuan peminjaman <b className="text-gray-900">{request.vehicle?.name ?? "kendaraan ini"}</b> dari{" "}
          <b className="text-gray-900">{request.borrower?.name ?? "karyawan ini"}</b> akan ditolak. Karyawan akan melihat status ditolak di halaman mereka.
          {err && (
            <span className="block mt-3 text-left">
              <ErrorBanner msg={err} />
            </span>
          )}
        </>
      }
    />
  );
}
