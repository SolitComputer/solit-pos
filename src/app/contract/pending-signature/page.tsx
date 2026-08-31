"use client";

import { useEffect, useState } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import CountersignModal from "@/components/contracts/CountersignModal";

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
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2.5 mb-5">
        <FileSignature className="w-5 h-5 text-[#1a1545]" />
        <h1 className="text-lg font-bold text-gray-800">Kontrak Menunggu Tanda Tangan Saya</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">Tidak ada kontrak yang menunggu tanda tangan kamu saat ini</p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="w-full text-left border border-gray-100 rounded-2xl p-4 hover:border-gray-200 hover:bg-gray-50 transition flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-bold text-gray-800">{c.users?.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.title}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                Menunggu TTD
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <CountersignModal
          contract={selected}
          onClose={() => setSelected(null)}
          onDone={load}
        />
      )}
    </div>
  );
}