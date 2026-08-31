"use client";

import { useEffect, useState } from "react";
import { X, FileText, Loader2 } from "lucide-react";
import { ContractBadge } from "./ContractBadge";
import { CareerLevelBadge } from "./CareerLevelBadge";
import { useRegisterOverlay } from "@/contexts/OverlayContext";

interface ContractRow {
  id: string;
  contract_type: string;
  title: string;
  content: string;
  status: string;
  sent_at: string;
  responded_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  user_signature_url: string | null;
  user_signed_at: string | null;
  admin_signature_url: string | null;
  admin_signed_at: string | null;
  admin?: { name: string } | null;
  response_note: string | null;
  career_level: string | null;
}

export default function ContractDetailModal({ userId, userName, onClose }: {
  userId: string; userName: string; onClose: () => void;
}) {
  useRegisterOverlay();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractRow[]>([]);

  useEffect(() => {
    fetch(`/api/contracts?user_id=${userId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setContracts(d.data || []); })
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="px-6 py-5 flex items-start justify-between flex-shrink-0" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-white" />
            <div>
              <p className="font-bold text-white text-sm">Riwayat Kontrak</p>
              <p className="text-xs text-white/60 mt-0.5">{userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : contracts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Belum ada kontrak yang dikirim</p>
          ) : (
            contracts.map((c) => (
              <div key={c.id} className="border border-gray-100 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-800">{c.title}</p>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <ContractBadge status={c.status} validUntil={c.valid_until} />
                    {c.career_level && <CareerLevelBadge level={c.career_level} />}
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Dikirim {new Date(c.sent_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  {c.responded_at && ` · Direspon ${new Date(c.responded_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`}
                </p>
                {(c.valid_from || c.valid_until) && (
                  <p className="text-[11px] text-gray-400">Masa berlaku: {c.valid_from ?? "—"} s/d {c.valid_until ?? "tanpa batas"}</p>
                )}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-600 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {c.content}
                </div>
                {(c.user_signature_url || c.admin_signature_url) && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="border border-gray-100 rounded-xl p-2 text-center">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Ttd Karyawan</p>
                      {c.user_signature_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.user_signature_url} alt="Tanda tangan karyawan" className="h-10 mx-auto" />
                      ) : (
                        <p className="text-[10px] text-gray-300 py-2">—</p>
                      )}
                    </div>
                    <div className="border border-gray-100 rounded-xl p-2 text-center">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                        Ttd Admin{c.admin?.name ? ` · ${c.admin.name}` : ""}
                      </p>
                      {c.admin_signature_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.admin_signature_url} alt="Tanda tangan admin" className="h-10 mx-auto" />
                      ) : (
                        <p className="text-[10px] text-gray-300 py-2">—</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
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