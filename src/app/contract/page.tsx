"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, CheckCircle2, XCircle, Loader2, ShieldAlert } from "lucide-react";
import { ContractStatus } from "@/lib/contractTemplates";
import { CareerLevelBadge } from "@/components/contracts/CareerLevelBadge";

interface ContractData {
  id: string;
  contract_type: string;
  title: string;
  content: string;
  status: ContractStatus;
  sent_at: string;
  responded_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  career_level: string | null;
}

export default function ContractPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [status, setStatus] = useState<ContractStatus>("NONE");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contracts/me");
      const data = await res.json();
      if (data.success && data.gate_enabled === false) {
        window.location.href = "/dashboard";
        return;
      }
      if (data.success) {
        setContract(data.contract);
        setStatus(data.contract_status);
      }
    } catch {
      setError("Gagal memuat data kontrak");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const respond = async (decision: "APPROVE" | "REJECT") => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/contracts/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Gagal mengirim respon");
        return;
      }
      if (decision === "APPROVE") {
        window.location.href = "/dashboard";
      } else {
        setStatus("REJECTED");
      }
    } catch {
      setError("Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 sm:px-8 py-6" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)" }}>
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">Perjanjian Kontrak Kerja</p>
              <p className="text-white/50 text-xs mt-0.5">Wajib disetujui sebelum bisa mengakses sistem</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {status === "NONE" || !contract ? (
            <div className="text-center py-10">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-600">Belum ada kontrak yang dikirim</p>
              <p className="text-xs text-slate-400 mt-1">Hubungi admin/HR untuk mendapatkan perjanjian kerja kamu.</p>
            </div>
          ) : status === "REJECTED" ? (
            <div className="text-center py-10">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-red-600">Kamu telah menolak kontrak ini</p>
              <p className="text-xs text-slate-400 mt-1">Hubungi admin/HR untuk membahas ulang perjanjian kerja.</p>
            </div>
          ) : status === "EXPIRED" ? (
            <div className="text-center py-10">
              <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-red-600">Masa berlaku kontrak sudah habis</p>
              <p className="text-xs text-slate-400 mt-1">
                {contract.valid_until ? `Berakhir pada ${contract.valid_until}. ` : ""}
                Hubungi admin/HR untuk memperpanjang perjanjian kerja kamu.
              </p>
            </div>
          ) : status === "APPROVED" ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-emerald-600">Kontrak kamu sudah disetujui</p>
              <p className="text-xs text-slate-400 mt-1">
                {contract.valid_until ? `Berlaku sampai ${contract.valid_until}.` : "Berlaku tanpa batas waktu."}
              </p>
              {contract.career_level && (
                <div className="mt-3 flex justify-center">
                  <CareerLevelBadge level={contract.career_level} />
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-slate-800 mb-1">{contract.title}</p>
              {contract.career_level && (
                <div className="mb-2">
                  <CareerLevelBadge level={contract.career_level} />
                </div>
              )}
              {(contract.valid_from || contract.valid_until) && (
                <p className="text-xs text-slate-400 mb-2">
                  Masa berlaku: {contract.valid_from ?? "—"} s/d {contract.valid_until ?? "tanpa batas"}
                </p>
              )}
              <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 max-h-80 overflow-y-auto bg-slate-50 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {contract.content}
              </div>

              <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300"
                />
                <span className="text-xs text-slate-500">
                  Saya telah membaca, memahami, dan menyetujui seluruh isi perjanjian kerja di atas.
                </span>
              </label>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => respond("REJECT")}
                  disabled={submitting}
                  className="flex-1 h-11 rounded-xl text-sm font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition disabled:opacity-50"
                >
                  Tolak
                </button>
                <button
                  onClick={() => respond("APPROVE")}
                  disabled={submitting || !agreed}
                  className="flex-1 h-11 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition"
                  style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Saya Setuju & Lanjutkan
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}