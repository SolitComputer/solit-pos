"use client";

import { useMemo, useState } from "react";
import { Radio, Phone } from "lucide-react";
import { useHTCall } from "@/contexts/HTCallContext";

interface Props {
  orderId: string;
  userId: string;
  userName: string;
  userRole: string;
  canTalk: boolean;
  canTarget?: boolean;
}

export default function DeliveryVoiceHT({ orderId }: Props) {
  const { ready, online, state, callUser } = useHTCall();
  const [q, setQ] = useState("");
  const busy = state !== "idle";

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return online
      .filter(u => !t || u.name.toLowerCase().includes(t) || u.role.toLowerCase().includes(t))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [online, q]);

  return (
    <div className="mt-3 bg-[#1a1a2e] rounded-2xl p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio size={16} />
          <div>
            <p className="text-sm font-black leading-none">HT Pengantaran <span className="text-emerald-300">· Realtime</span></p>
            <p className="text-[10px] text-gray-400 mt-0.5">Pilih tim belakang yang online untuk dipanggil</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{online.length} online
        </span>
      </div>

      {!ready ? (
        <div className="bg-white/5 rounded-xl px-3 py-3 text-center text-xs text-gray-400">Menyiapkan saluran HT…</div>
      ) : (
        <>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama / role…"
            className="w-full h-9 rounded-xl bg-white/10 border border-white/10 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 mb-2" />
          {list.length === 0 ? (
            <div className="bg-white/5 rounded-xl px-3 py-3 text-center text-xs text-gray-400">Belum ada tim belakang yang online.</div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {list.map(u => (
                <button key={u.userId} type="button" disabled={busy} onClick={() => callUser(u, orderId)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left transition disabled:opacity-40">
                  <span className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-sm font-bold flex-shrink-0">{u.name.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{u.name}</p>
                    <p className="text-[10px] text-gray-400">{u.role}</p>
                  </div>
                  <Phone size={18} className="flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
          {busy && <p className="text-[11px] text-amber-300 mt-2 text-center">Sedang dalam panggilan…</p>}
        </>
      )}
    </div>
  );
}