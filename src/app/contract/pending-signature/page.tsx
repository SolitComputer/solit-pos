"use client";

import { useEffect, useState } from "react";
import { FileSignature, Loader2, Clock, ChevronRight, Inbox } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import CountersignModal from "@/components/contracts/CountersignModal";
import { CareerLevelBadge } from "@/components/contracts/CareerLevelBadge";

interface PendingContract {
  id: string;
  title: string;
  content: string;
  contract_type: string;
  career_level: string | null;
  valid_from: string | null;
  valid_until: string | null;
  user_signature_url: string | null;
  responded_at: string | null;
  users: { name: string } | null;
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function PendingSignaturePage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingContract[]>([]);
  const [selected, setSelected] = useState<PendingContract | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contracts/pending-signature");
      const data = await res.json();
      if (data.success) setItems(data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.35)" }}
            >
              <FileSignature className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Tanda Tangan Kontrak</h1>
              <p className="text-[11px] text-slate-400 mt-0.5">Kontrak karyawan yang menunggu tanda tangan kamu</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            {loading ? (
              <div>
                {Array(3).fill(0).map((_, i) => (
                  <div key={i} className="px-4 sm:px-5 py-4 flex items-center gap-3 animate-pulse" style={{ borderBottom: "1px solid #f8f8fc" }}>
                    <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: "#f1f5f9" }} />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 rounded-full w-32" style={{ background: "#e2e8f0" }} />
                      <div className="h-2.5 rounded-full w-20" style={{ background: "#f1f5f9" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 sm:py-20 px-4">
                <div className="flex justify-center mb-3"><Inbox className="w-9 h-9" style={{ color: "#cbd5e1" }} /></div>
                <p className="text-sm font-bold" style={{ color: "#475569" }}>Tidak ada kontrak yang menunggu</p>
                <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>Semua kontrak yang perlu kamu tanda tangani sudah diproses</p>
              </div>
            ) : (
              <div>
                {items.map((c, idx) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="w-full text-left px-4 sm:px-5 py-3.5 sm:py-4 flex items-center gap-3 hover:bg-slate-50/70 transition-colors"
                    style={{ borderBottom: idx < items.length - 1 ? "1px solid #f5f5fb" : "none" }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                    >
                      {getInitials(c.users?.name ?? "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.users?.name}</p>
                        {c.career_level && <CareerLevelBadge level={c.career_level} />}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{c.title}</p>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
                    >
                      <Clock className="w-2.5 h-2.5" /> Menunggu TTD
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <CountersignModal
          contract={selected}
          onClose={() => setSelected(null)}
          onDone={load}
        />
      )}
    </DashboardLayout>
  );
}