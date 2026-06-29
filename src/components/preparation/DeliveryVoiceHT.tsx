"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

interface Props {
  orderId: string;
  userId: string;
  userName: string;
  userRole: string;
  canTalk: boolean;
  canTarget?: boolean; // NEW: boleh memilih tujuan HT (directed talk)
}

interface SignalMsg {
  type: "hello" | "offer" | "answer" | "ice" | "leave" | "talk";
  from: string;
  fromName: string;
  fromRole: string;
  to?: string;
  data?: any;
}

interface PeerConn {
  pc: RTCPeerConnection;
  name: string;
  role: string;
  stream: MediaStream;
  audioEl: HTMLAudioElement | null;
  pendingIce: RTCIceCandidateInit[];
  haveRemote: boolean;
}

// STUN gratis dari Google. Cukup untuk koneksi WiFi↔WiFi / NAT yang ramah.
// 🔴 PRODUCTION: kalau pengantar pakai DATA SELULER, sering butuh TURN biar
// koneksi nyambung. Daftar TURN gratis (Metered ~50GB/bln) / Cloudflare / coturn,
// lalu tambah barisnya di bawah:
// { urls: "turn:HOST:3478", username: "USER", credential: "PASS" },
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export default function DeliveryVoiceHT({ orderId, userId, userName, userRole, canTalk, canTarget = false }: Props) {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [talking, setTalking] = useState(false);
  const [listenOnly, setListenOnly] = useState(false);
  const [micError, setMicError] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [peerList, setPeerList] = useState<{ id: string; name: string; role: string; state: string }[]>([]);
  const [speakers, setSpeakers] = useState<Record<string, string>>({}); // id -> nama yang lagi bicara
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set()); // NEW: tujuan HT terpilih (kosong = semua)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConn>>(new Map());
  const joinedRef = useRef(false);
  const targetIdsRef = useRef<Set<string>>(new Set()); // NEW: mirror buat dibaca di callback PTT
  useEffect(() => { targetIdsRef.current = targetIds; }, [targetIds]);

  const syncPeers = useCallback(() => {
    setPeerList(
      [...peersRef.current.entries()].map(([id, p]) => ({
        id, name: p.name, role: p.role, state: p.pc.connectionState,
      }))
    );
  }, []);

  // NEW: buang id dari daftar tujuan kalau peernya keluar/gagal
  const dropTarget = useCallback((id: string) => {
    setTargetIds((prev) => {
      if (!prev.has(id)) return prev;
      const n = new Set(prev); n.delete(id); return n;
    });
  }, []);

  const send = useCallback(
    (msg: Omit<SignalMsg, "from" | "fromName" | "fromRole">) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "signal",
        payload: { ...msg, from: userId, fromName: userName, fromRole: userRole } as SignalMsg,
      });
    },
    [userId, userName, userRole]
  );

  const createPeer = useCallback(
    (remoteId: string, name: string, role: string): PeerConn => {
      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const remoteStream = new MediaStream();
      const audioEl = typeof Audio !== "undefined" ? new Audio() : null;
      if (audioEl) { audioEl.autoplay = true; (audioEl as any).playsInline = true; }

      const local = localStreamRef.current;
      if (local && local.getAudioTracks().length) {
        local.getAudioTracks().forEach((t) => pc.addTrack(t, local));
      } else {
        pc.addTransceiver("audio", { direction: "recvonly" });
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: "ice", to: remoteId, data: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
        if (audioEl) {
          audioEl.srcObject = remoteStream;
          audioEl.play().catch(() => setAudioBlocked(true));
        }
      };
      pc.onconnectionstatechange = () => {
        syncPeers();
        if (["failed", "closed"].includes(pc.connectionState)) {
          const p = peersRef.current.get(remoteId);
          if (p && pc.connectionState === "failed") {
            try { p.pc.close(); } catch {}
            peersRef.current.delete(remoteId);
            syncPeers();
            dropTarget(remoteId); // NEW
          }
        }
      };

      const peer: PeerConn = { pc, name, role, stream: remoteStream, audioEl, pendingIce: [], haveRemote: false };
      peersRef.current.set(remoteId, peer);
      syncPeers();
      return peer;
    },
    [send, syncPeers, dropTarget]
  );

  const makeOffer = useCallback(
    async (remoteId: string) => {
      const peer = peersRef.current.get(remoteId);
      if (!peer) return;
      try {
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        send({ type: "offer", to: remoteId, data: offer });
      } catch (e) { console.error("[voice] offer", e); }
    },
    [send]
  );

  const flushIce = async (peer: PeerConn) => {
    for (const c of peer.pendingIce) {
      try { await peer.pc.addIceCandidate(c); } catch (e) { console.error("[voice] ice add", e); }
    }
    peer.pendingIce = [];
  };

  const handleSignal = useCallback(
    async (msg: SignalMsg) => {
      if (!msg || msg.from === userId) return;
      if (msg.to && msg.to !== userId) return;

      if (msg.type === "hello") {
        const isNew = !peersRef.current.has(msg.from);
        createPeer(msg.from, msg.fromName, msg.fromRole);
        if (isNew) {
          send({ type: "hello", to: msg.from }); // balas biar dia kenal aku juga
          if (userId < msg.from) makeOffer(msg.from); // penentu offer deterministik (hindari glare)
        }
        return;
      }

      if (msg.type === "offer") {
        const peer = createPeer(msg.from, msg.fromName, msg.fromRole);
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          peer.haveRemote = true;
          await flushIce(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          send({ type: "answer", to: msg.from, data: answer });
        } catch (e) { console.error("[voice] handle offer", e); }
        return;
      }

      if (msg.type === "answer") {
        const peer = peersRef.current.get(msg.from);
        if (!peer) return;
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          peer.haveRemote = true;
          await flushIce(peer);
        } catch (e) { console.error("[voice] handle answer", e); }
        return;
      }

      if (msg.type === "ice") {
        const peer = peersRef.current.get(msg.from);
        if (!peer) return;
        if (peer.haveRemote) {
          try { await peer.pc.addIceCandidate(msg.data); } catch (e) { console.error("[voice] ice", e); }
        } else {
          peer.pendingIce.push(msg.data);
        }
        return;
      }

      if (msg.type === "leave") {
        const peer = peersRef.current.get(msg.from);
        if (peer) { try { peer.pc.close(); } catch {} peer.audioEl?.pause(); peersRef.current.delete(msg.from); syncPeers(); }
        setSpeakers((s) => { const n = { ...s }; delete n[msg.from]; return n; });
        dropTarget(msg.from); // NEW
        return;
      }

      if (msg.type === "talk") {
        // NEW: directed talk. `targets` kosong = broadcast ke semua (perilaku lama).
        // Penerima yang TIDAK termasuk target → mute audio si pengirim (lokal).
        // Catatan: audio tetap mengalir P2P ke semua peer, hanya di-mute di sisi
        // penerima yang bukan tujuan — cukup untuk HT internal, bukan privasi jaringan.
        const targets: string[] = Array.isArray(msg.data?.targets) ? msg.data.targets : [];
        const forMe = targets.length === 0 || targets.includes(userId);
        const peer = peersRef.current.get(msg.from);
        if (peer?.audioEl) peer.audioEl.muted = msg.data?.on ? !forMe : false;
        setSpeakers((s) => {
          const n = { ...s };
          if (msg.data?.on && forMe) n[msg.from] = msg.fromName;
          else delete n[msg.from];
          return n;
        });
        return;
      }
    },
    [userId, createPeer, makeOffer, send, syncPeers, dropTarget]
  );

  const join = useCallback(async () => {
    if (joinedRef.current || connecting) return;
    setConnecting(true);
    setMicError("");

    if (canTalk) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        stream.getAudioTracks().forEach((t) => (t.enabled = false)); // PTT: mute sampai ditahan
        localStreamRef.current = stream;
        setListenOnly(false);
      } catch {
        localStreamRef.current = null;
        setListenOnly(true);
        setMicError("Mikrofon ditolak — kamu hanya bisa mendengar");
      }
    } else {
      setListenOnly(true);
    }

    const channel = supabase.channel(`voice-rtc-${orderId}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "signal" }, (p) => handleSignal(p.payload as SignalMsg));
    channelRef.current = channel;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        joinedRef.current = true;
        setJoined(true);
        setConnecting(false);
        send({ type: "hello" }); // umumkan kehadiran ke yang lain
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnecting(false);
        setMicError("Gagal menyambung saluran HT");
      }
    });
  }, [connecting, canTalk, orderId, handleSignal, send]);

  const leave = useCallback(() => {
    if (joinedRef.current) send({ type: "leave" });
    peersRef.current.forEach((p) => { try { p.pc.close(); } catch {} p.audioEl?.pause(); });
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    joinedRef.current = false;
    setJoined(false);
    setTalking(false);
    setSpeakers({});
    setPeerList([]);
    setTargetIds(new Set()); // NEW: reset tujuan
  }, [send]);

  useEffect(() => () => { if (joinedRef.current) leave(); }, [leave]);

  const startTalk = useCallback(() => {
    if (!joinedRef.current) return;
    if (listenOnly) { setMicError("Mikrofon tidak tersedia"); return; }
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = true));
    setTalking(true);
    // NEW: sertakan daftar tujuan (hanya peer yang masih ada)
    const targets = [...targetIdsRef.current].filter((id) => peersRef.current.has(id));
    send({ type: "talk", data: { on: true, targets } });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(40);
  }, [listenOnly, send]);

  const endTalk = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
    if (talking) send({ type: "talk", data: { on: false } });
    setTalking(false);
  }, [talking, send]);

  const enableSound = useCallback(() => {
    peersRef.current.forEach((p) => p.audioEl?.play().catch(() => {}));
    setAudioBlocked(false);
  }, []);

  // NEW: toggle / clear tujuan
  const toggleTarget = useCallback((id: string) => {
    setTargetIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);
  const clearTargets = useCallback(() => setTargetIds(new Set()), []);

  const otherSpeakers = Object.entries(speakers).filter(([id]) => id !== userId);
  const connectedCount = peerList.filter((p) => p.state === "connected").length;
  const targetNames = [...targetIds] // NEW
    .map((id) => peerList.find((p) => p.id === id)?.name)
    .filter(Boolean) as string[];
  const targetLabel = targetNames.length === 0 // NEW
    ? "" : targetNames.length === 1 ? targetNames[0] : `${targetNames.length} orang`;

  return (
    <div className="mt-3 bg-[#1a1a2e] rounded-2xl p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📻</span>
          <div>
            <p className="text-sm font-black leading-none">HT Pengantaran <span className="text-emerald-300">· Realtime</span></p>
            <p className="text-[10px] text-gray-400 mt-0.5">Bicara langsung (live) ke pengantar & tim — tahan tombol untuk bicara</p>
          </div>
        </div>
        {joined && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {connectedCount > 0 ? `${connectedCount} tersambung` : "menunggu…"}
          </span>
        )}
      </div>

      {!joined ? (
        <>
          <button
            type="button"
            onClick={join}
            disabled={connecting}
            className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-900/30 transition disabled:opacity-50"
          >
            {connecting ? "Menyambungkan…" : "🎙️ Sambungkan HT"}
          </button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Tap untuk gabung saluran suara. Begitu pengantar & tim gabung, suara langsung kedengeran realtime.
          </p>
        </>
      ) : (
        <>
          {/* Banner siapa yang lagi bicara */}
          {otherSpeakers.length > 0 && (
            <div className="mb-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="flex gap-0.5 items-end h-4">
                <span className="w-1 bg-emerald-300 rounded-full animate-pulse" style={{ height: "60%" }} />
                <span className="w-1 bg-emerald-300 rounded-full animate-pulse" style={{ height: "100%", animationDelay: "120ms" }} />
                <span className="w-1 bg-emerald-300 rounded-full animate-pulse" style={{ height: "75%", animationDelay: "240ms" }} />
              </span>
              <p className="text-xs font-bold text-emerald-200 truncate">
                🔊 {otherSpeakers.map(([, n]) => n).join(", ")} sedang bicara…
              </p>
            </div>
          )}

          {/* NEW: pemilih tujuan HT — hanya role tertentu & kalau punya mic */}
          {canTarget && !listenOnly && peerList.length > 0 && (
            <div className="mb-3 bg-white/5 rounded-xl p-2.5">
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1.5">Tujukan HT ke</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={clearTargets}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${targetIds.size === 0 ? "bg-emerald-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}
                >
                  📢 Semua
                </button>
                {peerList.map((p) => {
                  const sel = targetIds.has(p.id);
                  const ok = p.state === "connected";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleTarget(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1 ${sel ? "bg-emerald-500 text-white" : ok ? "bg-white/10 text-gray-200 hover:bg-white/15" : "bg-white/5 text-gray-400"}`}
                    >
                      {sel && <span>✓</span>}{p.name}{!ok && " (…)"}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {targetIds.size === 0
                  ? "Suara kedengeran ke semua peserta."
                  : `Hanya ${targetNames.join(", ") || "—"} yang dengar.`}
              </p>
            </div>
          )}

          {/* Tombol Push-to-Talk */}
          {canTalk && !listenOnly && (
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); startTalk(); }}
              onPointerUp={(e) => { e.preventDefault(); endTalk(); }}
              onPointerLeave={() => endTalk()}
              onPointerCancel={() => endTalk()}
              onContextMenu={(e) => e.preventDefault()}
              style={{ touchAction: "none", userSelect: "none" }}
              className={`w-full h-16 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition select-none
                ${talking ? "bg-red-500 scale-[0.98] shadow-lg shadow-red-900/40" : "bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-900/30"}`}
            >
              {talking ? (
                <><span className="w-3 h-3 rounded-full bg-white animate-pulse" /> {targetLabel ? `BICARA KE ${targetLabel.toUpperCase()} — lepas` : "SEDANG BICARA — lepas untuk berhenti"}</>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v3m0-3a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" /></svg>
                  {targetLabel ? `TAHAN — KE ${targetLabel.toUpperCase()}` : "TAHAN UNTUK BICARA"}
                </>
              )}
            </button>
          )}

          {listenOnly && (
            <div className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
              <p className="text-xs font-bold text-gray-300">👂 Mode dengar saja</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{micError || "Mikrofon tidak aktif"}</p>
            </div>
          )}

          {micError && !listenOnly && <p className="text-[11px] text-red-300 mt-2">{micError}</p>}

          {audioBlocked && (
            <button onClick={enableSound} className="mt-2 w-full h-8 rounded-lg bg-amber-400 text-amber-950 text-xs font-bold">
              🔊 Ketuk untuk aktifkan suara
            </button>
          )}

          {/* Peserta */}
          <div className="mt-3">
            <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1.5">Peserta ({peerList.length + 1})</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-200 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Kamu
              </span>
              {peerList.map((p) => {
                const isSpeaking = !!speakers[p.id];
                const ok = p.state === "connected";
                return (
                  <span key={p.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold ${isSpeaking ? "bg-emerald-500/25 text-emerald-200" : ok ? "bg-white/10 text-gray-200" : "bg-white/5 text-gray-400"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? "bg-emerald-400 animate-pulse" : ok ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                    {p.name}{!ok && " (menyambung…)"}
                  </span>
                );
              })}
            </div>
          </div>

          <button onClick={leave} className="mt-3 w-full h-9 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-gray-300 transition">
            Putus HT
          </button>
        </>
      )}
    </div>
  );
}