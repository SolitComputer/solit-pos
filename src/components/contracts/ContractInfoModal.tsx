"use client";

import { FileText, X, CheckCircle2, Clock, XCircle, ShieldAlert } from "lucide-react";
import { CareerLevelBadge } from "./CareerLevelBadge";

interface ContractInfoData {
  id: string;
  title: string;
  content: string;
  status: string;
  valid_from: string | null;
  valid_until: string | null;
  career_level: string | null;
  user_signature_url: string | null;
  user_signed_at: string | null;
  admin_signature_url: string | null;
  admin_signed_at: string | null;
  admin?: { name: string } | null;
}

const STATUS_META: Record<string, { icon: React.ReactNode; color: string; title: string }> = {
  APPROVED: { icon: <CheckCircle2 className="w-10 h-10" />, color: "#059669", title: "Kontrak sudah disetujui" },
  PENDING: { icon: <Clock className="w-10 h-10" />, color: "#d97706", title: "Menunggu persetujuan karyawan" },
  PENDING_ADMIN_SIGNATURE: { icon: <Clock className="w-10 h-10" />, color: "#2563eb", title: "Menunggu tanda tangan admin" },
  REJECTED: { icon: <XCircle className="w-10 h-10" />, color: "#dc2626", title: "Kontrak ditolak" },
  EXPIRED: { icon: <ShieldAlert className="w-10 h-10" />, color: "#dc2626", title: "Kontrak sudah kadaluarsa" },
};

export default function ContractInfoModal({
  contract, userName, onClose,
}: {
  contract: ContractInfoData;
  userName: string;
  onClose: () => void;
}) {
  const meta = STATUS_META[contract.status] ?? { icon: <FileText className="w-10 h-10" />, color: "#64748b", title: "Belum ada kontrak" };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="px-6 py-5 flex items-start justify-between flex-shrink-0" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.1)" }}>
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-sm truncate">Perjanjian Kontrak Kerja</p>
              <p className="text-xs text-white/50 mt-0.5 truncate">{userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="text-center py-2">
            <div className="mx-auto mb-2" style={{ color: meta.color }}>{meta.icon}</div>
            <p className="text-sm font-bold" style={{ color: meta.color }}>{meta.title}</p>
            {contract.status === "APPROVED" && contract.valid_until && (
              <p className="text-xs text-slate-400 mt-1">Berlaku sampai {contract.valid_until}</p>
            )}
            {contract.career_level && (
              <div className="mt-2.5 flex justify-center"><CareerLevelBadge level={contract.career_level} /></div>
            )}
          </div>

          {contract.content && (
            <div className="border border-slate-200 rounded-2xl p-4 max-h-64 overflow-y-auto bg-slate-50 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {contract.content}
            </div>
          )}

          {contract.content && (
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-2xl p-3 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Tanda Tangan Karyawan</p>
                {contract.user_signature_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={contract.user_signature_url} alt="Tanda tangan karyawan" className="h-14 mx-auto" />
                ) : (
                  <p className="text-xs text-slate-300 py-3">—</p>
                )}
              </div>
              <div className="border border-slate-200 rounded-2xl p-3 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  Tanda Tangan Admin{contract.admin?.name ? ` (${contract.admin.name})` : ""}
                </p>
                {contract.admin_signature_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={contract.admin_signature_url} alt="Tanda tangan admin" className="h-14 mx-auto" />
                ) : (
                  <p className="text-xs text-slate-300 py-3">—</p>
                )}
              </div>
            </div>
          )}

          {!contract.content && (
            <p className="text-sm text-slate-400 text-center py-6">Belum ada kontrak yang dikirim untuk karyawan ini.</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}