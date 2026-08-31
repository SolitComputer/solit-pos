"use client";

import { useState } from "react";
import { X, FileSignature, Loader2, Clock } from "lucide-react";
import SignaturePad from "./SignaturePad";
import { CareerLevelBadge } from "./CareerLevelBadge";

interface PendingContract {
  id: string;
  title: string;
  content: string;
  contract_type: string;
  career_level: string | null;
  valid_from: string | null;
  valid_until: string | null;
  user_signature_url: string | null;
  users: { name: string } | null;
}

export default function CountersignModal({
  contract, onClose, onDone,
}: {
  contract: PendingContract;
  onClose: () => void;
  onDone: () => void;
}) {
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (decision: "SIGN" | "REJECT") => {
    if (decision === "SIGN" && !signatureData) {
      setError("Tanda tangan wajib diisi");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/contracts/countersign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_id: contract.id,
          decision,
          signature_data: decision === "SIGN" ? signatureData : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Gagal memproses tanda tangan");
        return;
      }
      onDone();
      onClose();
    } catch {
      setError("Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="px-6 py-5 flex items-start justify-between flex-shrink-0" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.1)" }}>
              <FileSignature className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-sm truncate">Tanda Tangani Kontrak</p>
              <p className="text-xs text-white/50 mt-0.5 truncate">{contract.users?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">{error}</div>}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">{contract.title}</p>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
            >
              <Clock className="w-2.5 h-2.5" /> Menunggu TTD Kamu
            </span>
          </div>
          {contract.career_level && <CareerLevelBadge level={contract.career_level} />}
          {(contract.valid_from || contract.valid_until) && (
            <p className="text-[11px] text-gray-400">Masa berlaku: {contract.valid_from ?? "—"} s/d {contract.valid_until ?? "tanpa batas"}</p>
          )}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {contract.content}
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Tanda Tangan Karyawan</p>
            {contract.user_signature_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contract.user_signature_url} alt="Tanda tangan karyawan" className="h-16 border border-gray-200 rounded-xl bg-white px-3" />
            ) : (
              <p className="text-xs text-gray-300">—</p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Tanda Tangan Kamu</label>
            <SignaturePad onChange={setSignatureData} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button
            onClick={() => submit("REJECT")}
            disabled={submitting}
            className="flex-1 h-11 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 transition disabled:opacity-50"
          >
            Tolak
          </button>
          <button
            onClick={() => submit("SIGN")}
            disabled={submitting || !signatureData}
            className="flex-1 h-11 text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Tanda Tangani"}
          </button>
        </div>
      </div>
    </div>
  );
}