"use client";
// src/components/preparation/DeliveryVoiceHT.tsx
// ─────────────────────────────────────────────────────────────────────────────
// HT Walkie-talkie berbasis WebRTC + Supabase Realtime
//
// PERUBAHAN UTAMA v2:
//  1. TURN server (Metered free tier) — agar koneksi tetap nyambung lintas
//     jaringan seluler / antar kota / antar ISP.
//  2. UI pemilihan TUJUAN HT sebelum Join (bukan setelah), plus bisa ubah
//     sewaktu-waktu saat sudah join.
//  3. "Semua" = broadcast ke semua peserta (default).
//  4. ICE restart otomatis kalau koneksi failed (bukan closed).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

interface Props {
  orderId: string;
  userId: string;
  userName: string;
  userRole: string;
  canTalk: boolean;
  canTarget?: boolean;
}

interface SignalMsg {
  type: "hello" | "offer" | "answer" | "ice" | "leave" | "talk" | "ping";
  from: string;
  fromName: string;
  fromRole: string;
  to?: string;
  data?: any;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  name: string;
  role: string;
  remoteStream: MediaStream;
  audioEl: HTMLAudioElement | null;
  pendingIce: RTCIceCandidateInit[];
  haveRemote: boolean;
  offerSent: boolean;
}

// ── ICE Config: STUN + TURN ──────────────────────────────────────────────────
// Untuk produksi lintas kota / antar ISP / data seluler, TURN wajib.
// Gunakan Metered (50GB/bln gratis) atau coturn sendiri.
// Ganti placeholder di bawah dengan kredensial TURN server kamu.
//
// Cara dapat TURN gratis:
//   1. Daftar di https://dashboard.metered.ca/signup
//   2. Buat App → copy credentialnya
//   3. Ganti nilai TURN_HOST, TURN_USER, TURN_PASS di bawah
//
// Kalau belum punya TURN: koneksi WiFi ↔ WiFi biasanya OK via STUN saja.
// Tapi lintas operator / 4G ↔ 4G SANGAT BUTUH TURN.
const TURN_HOST = process.env.NEXT_PUBLIC_TURN_HOST ?? "";
const TURN_USER = process.env.NEXT_PUBLIC_TURN_USER ?? "";
const TURN_PASS = process.env.NEXT_PUBLIC_TURN_PASS ?? "";

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  if (TURN_HOST && TURN_USER && TURN_PASS) {
    servers.push(
      { urls: `turn:${TURN_HOST}:3478`, username: TURN_USER, credential: TURN_PASS },
      { urls: `turns:${TURN_HOST}:443?transport=tcp`, username: TURN_USER, credential: TURN_PASS },
    );
  }
  return servers;
}

const ICE_SERVERS = buildIceServers();

export default function DeliveryVoiceHT({
  orderId, userId, userName, userRole, canTalk, canTarget = false,
}: Props) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [talking, setTalking] = useState(false);
  const [listenOnly, setListenOnly] = useState(false);
  const [micError, setMicError] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [peerList, setPeerList] = useState<{ id: string; name: string; role: string; state: string }[]>([]);
  const [speakers, setSpeakers] = useState<Record<string, string>>({});

  // Tujuan HT yang dipilih SEBELUM join (bisa diubah setelah join juga)
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());

  // ── Refs ───────────────────────────────────────────────────────────────────
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const joinedRef = useRef(false);
  const targetIdsRef = useRef<Set<string>>(new Set());
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { targetIdsRef.current = targetIds; }, [targetIds]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const syncPeers = useCallback(() => {
    setPeerList([...peersRef.current.entries()].map(([id, p]) => ({
      id, name: p.name, role: p.role, state: p.pc.connectionState,
    })));
  }, []);

  const dropTarget = useCallback((id: string) => {
    setTargetIds(prev => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const send = useCallback((msg: Omit<SignalMsg, "from" | "fromName" | "fromRole">) => {
    channelRef.current?.send({
      type: "broadcast", event: "signal",
      payload: { ...msg, from: userId, fromName: userName, fromRole: userRole } as SignalMsg,
    });
  }, [userId, userName, userRole]);

  // ── ICE restart helper ─────────────────────────────────────────────────────
  const restartIce = useCallback(async (remoteId: string) => {
    const peer = peersRef.current.get(remoteId);
    if (!peer || peer.pc.signalingState === "closed") return;
    try {
      const offer = await peer.pc.createOffer({ iceRestart: true });
      await peer.pc.setLocalDescription(offer);
      send({ type: "offer", to: remoteId, data: offer });
    } catch (e) { console.error("[voice] ICE restart", e); }
  }, [send]);

  // ── createPeer ─────────────────────────────────────────────────────────────
  const createPeer = useCallback((remoteId: string, name: string, role: string): PeerEntry => {
    const existing = peersRef.current.get(remoteId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const remoteStream = new MediaStream();
    const audioEl = typeof Audio !== "undefined" ? new Audio() : null;
    if (audioEl) { audioEl.autoplay = true; (audioEl as any).playsInline = true; }

    const local = localStreamRef.current;
    if (local && local.getAudioTracks().length) {
      local.getAudioTracks().forEach(t => pc.addTrack(t, local));
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    pc.onicecandidate = e => {
      if (e.candidate) send({ type: "ice", to: remoteId, data: e.candidate.toJSON() });
    };

    pc.ontrack = e => {
      e.streams[0]?.getTracks().forEach(t => remoteStream.addTrack(t));
      if (audioEl) {
        audioEl.srcObject = remoteStream;
        audioEl.play().catch(() => setAudioBlocked(true));
      }
    };

    pc.onconnectionstatechange = () => {
      syncPeers();
      const state = pc.connectionState;
      if (state === "failed") {
        // Coba ICE restart dulu sebelum hapus
        restartIce(remoteId);
      } else if (state === "closed") {
        try { pc.close(); } catch {}
        peersRef.current.delete(remoteId);
        syncPeers();
        dropTarget(remoteId);
      }
    };

    // Reconnect kalau ICE disconnect terlalu lama
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected") {
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected") restartIce(remoteId);
        }, 5000);
      }
    };

    const peer: PeerEntry = {
      pc, name, role, remoteStream, audioEl,
      pendingIce: [], haveRemote: false, offerSent: false,
    };
    peersRef.current.set(remoteId, peer);
    syncPeers();
    return peer;
  }, [send, syncPeers, dropTarget, restartIce]);

  const makeOffer = useCallback(async (remoteId: string) => {
    const peer = peersRef.current.get(remoteId);
    if (!peer || peer.offerSent) return;
    peer.offerSent = true;
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      send({ type: "offer", to: remoteId, data: offer });
    } catch (e) { console.error("[voice] offer", e); }
  }, [send]);

  const flushIce = async (peer: PeerEntry) => {
    for (const c of peer.pendingIce) {
      try { await peer.pc.addIceCandidate(c); } catch (e) { console.error("[voice] ice add", e); }
    }
    peer.pendingIce = [];
  };

  // ── Signal handler ─────────────────────────────────────────────────────────
  const handleSignal = useCallback(async (msg: SignalMsg) => {
    if (!msg || msg.from === userId) return;
    if (msg.to && msg.to !== userId) return;

    if (msg.type === "ping") {
      // Balas pong buat keep-alive
      send({ type: "ping", to: msg.from });
      return;
    }

    if (msg.type === "hello") {
      const isNew = !peersRef.current.has(msg.from);
      createPeer(msg.from, msg.fromName, msg.fromRole);
      if (isNew) {
        send({ type: "hello", to: msg.from });
        if (userId < msg.from) makeOffer(msg.from);
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
      setSpeakers(s => { const n = { ...s }; delete n[msg.from]; return n; });
      dropTarget(msg.from);
      return;
    }

    if (msg.type === "talk") {
      const targets: string[] = Array.isArray(msg.data?.targets) ? msg.data.targets : [];
      const forMe = targets.length === 0 || targets.includes(userId);
      const peer = peersRef.current.get(msg.from);
      if (peer?.audioEl) peer.audioEl.muted = msg.data?.on ? !forMe : false;
      setSpeakers(s => {
        const n = { ...s };
        if (msg.data?.on && forMe) n[msg.from] = msg.fromName;
        else delete n[msg.from];
        return n;
      });
      return;
    }
  }, [userId, createPeer, makeOffer, send, syncPeers, dropTarget]);

  // ── Join ───────────────────────────────────────────────────────────────────
  const join = useCallback(async () => {
    if (joinedRef.current || connecting) return;
    setConnecting(true);
    setMicError("");

    if (canTalk) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        stream.getAudioTracks().forEach(t => (t.enabled = false)); // PTT default mute
        localStreamRef.current = stream;
        setListenOnly(false);
      } catch {
        localStreamRef.current = null;
        setListenOnly(true);
        setMicError("Mikrofon ditolak — hanya bisa mendengar");
      }
    } else {
      setListenOnly(true);
    }

    const channel = supabase.channel(`voice-rtc-${orderId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "signal" }, p => handleSignal(p.payload as SignalMsg));
    channelRef.current = channel;

    channel.subscribe(status => {
      if (status === "SUBSCRIBED") {
        joinedRef.current = true;
        setJoined(true);
        setConnecting(false);
        send({ type: "hello" });

        // Ping keep-alive setiap 20 detik agar Supabase channel tidak disconnect
        pingTimerRef.current = setInterval(() => {
          if (joinedRef.current) send({ type: "ping" });
        }, 20_000);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnecting(false);
        setMicError("Gagal menyambung saluran HT — coba lagi");
      }
    });
  }, [connecting, canTalk, orderId, handleSignal, send]);

  // ── Leave ──────────────────────────────────────────────────────────────────
  const leave = useCallback(() => {
    if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
    if (joinedRef.current) send({ type: "leave" });
    peersRef.current.forEach(p => { try { p.pc.close(); } catch {} p.audioEl?.pause(); });
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    joinedRef.current = false;
    setJoined(false);
    setTalking(false);
    setSpeakers({});
    setPeerList([]);
    // Jangan reset targetIds agar pilihan tersimpan kalau user join lagi
  }, [send]);

  useEffect(() => () => { if (joinedRef.current) leave(); }, [leave]);

  // ── PTT ────────────────────────────────────────────────────────────────────
  const startTalk = useCallback(() => {
    if (!joinedRef.current) return;
    if (listenOnly) { setMicError("Mikrofon tidak tersedia"); return; }
    localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = true));
    setTalking(true);
    const targets = [...targetIdsRef.current].filter(id => peersRef.current.has(id));
    send({ type: "talk", data: { on: true, targets } });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(40);
  }, [listenOnly, send]);

  const endTalk = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = false));
    if (talking) send({ type: "talk", data: { on: false } });
    setTalking(false);
  }, [talking, send]);

  const enableSound = useCallback(() => {
    peersRef.current.forEach(p => p.audioEl?.play().catch(() => {}));
    setAudioBlocked(false);
  }, []);

  // ── Target selection ───────────────────────────────────────────────────────
  const toggleTarget = useCallback((id: string) => {
    setTargetIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const clearTargets = useCallback(() => setTargetIds(new Set()), []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const otherSpeakers = Object.entries(speakers).filter(([id]) => id !== userId);
  const connectedCount = peerList.filter(p => p.state === "connected").length;
  const targetNames = [...targetIds].map(id => peerList.find(p => p.id === id)?.name).filter(Boolean) as string[];
  const targetLabel = targetNames.length === 0 ? "" : targetNames.length === 1 ? targetNames[0] : `${targetNames.length} orang`;
  const hasTurn = !!(TURN_HOST && TURN_USER && TURN_PASS);

  return (
    <div className="mt-3 bg-[#1a1a2e] rounded-2xl p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📻</span>
          <div>
            <p className="text-sm font-black leading-none">
              HT Pengantaran <span className="text-emerald-300">· Realtime</span>
              {!hasTurn && <span className="text-amber-300 text-[10px] ml-1">(WiFi only)</span>}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {hasTurn ? "Koneksi TURN aktif — bisa lintas jaringan" : "Tambahkan TURN server untuk lintas operator"}
            </p>
          </div>
        </div>
        {joined && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {connectedCount > 0 ? `${connectedCount} tersambung` : "menunggu…"}
          </span>
        )}
      </div>

      {/* Pilih tujuan SEBELUM join (kalau canTarget) */}
      {!joined && canTarget && (
        <div className="mb-3 bg-white/5 rounded-xl p-2.5">
          <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1.5">
            Tujukan HT ke (opsional, bisa ubah setelah join)
          </p>
          <p className="text-[11px] text-gray-400 mb-2">
            Kosongkan = bicara ke semua. Pilih nama = hanya yang dipilih yang dengar.
          </p>
          {peerList.length === 0 ? (
            <p className="text-[11px] text-gray-500 italic">
              Peserta lain akan muncul setelah kamu join dan mereka juga aktif.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={clearTargets}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${targetIds.size === 0 ? "bg-emerald-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                📢 Semua
              </button>
              {peerList.map(p => (
                <button key={p.id} type="button" onClick={() => toggleTarget(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${targetIds.has(p.id) ? "bg-emerald-500 text-white" : "bg-white/10 text-gray-200 hover:bg-white/15"}`}>
                  {targetIds.has(p.id) && "✓ "}{p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!joined ? (
        <>
          <button type="button" onClick={join} disabled={connecting}
            className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-900/30 transition disabled:opacity-50">
            {connecting ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Menyambungkan…</>
            ) : "🎙️ Sambungkan HT"}
          </button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Tap untuk gabung saluran suara realtime.
            {targetIds.size > 0 && ` Tujuan: ${targetLabel}.`}
          </p>
        </>
      ) : (
        <>
          {/* Banner yang sedang bicara */}
          {otherSpeakers.length > 0 && (
            <div className="mb-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="flex gap-0.5 items-end h-4">
                {[60, 100, 75].map((h, i) => (
                  <span key={i} className="w-1 bg-emerald-300 rounded-full animate-pulse"
                    style={{ height: `${h}%`, animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              <p className="text-xs font-bold text-emerald-200 truncate">
                🔊 {otherSpeakers.map(([, n]) => n).join(", ")} sedang bicara…
              </p>
            </div>
          )}

          {/* Ubah tujuan setelah join (kalau canTarget) */}
          {canTarget && !listenOnly && (
            <div className="mb-3 bg-white/5 rounded-xl p-2.5">
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1.5">Tujuan HT</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={clearTargets}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${targetIds.size === 0 ? "bg-emerald-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                  📢 Semua
                </button>
                {peerList.map(p => {
                  const sel = targetIds.has(p.id);
                  const ok = p.state === "connected";
                  return (
                    <button key={p.id} type="button" onClick={() => toggleTarget(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1 ${sel ? "bg-emerald-500 text-white" : ok ? "bg-white/10 text-gray-200 hover:bg-white/15" : "bg-white/5 text-gray-400"}`}>
                      {sel && "✓ "}{p.name}{!ok && " (…)"}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {targetIds.size === 0 ? "Suara ke semua peserta." : `Hanya ${targetLabel} yang dengar.`}
              </p>
            </div>
          )}

          {/* PTT button */}
          {canTalk && !listenOnly && (
            <button type="button"
              onPointerDown={e => { e.preventDefault(); startTalk(); }}
              onPointerUp={e => { e.preventDefault(); endTalk(); }}
              onPointerLeave={() => endTalk()}
              onPointerCancel={() => endTalk()}
              onContextMenu={e => e.preventDefault()}
              style={{ touchAction: "none", userSelect: "none" }}
              className={`w-full h-16 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition select-none
                ${talking
                  ? "bg-red-500 scale-[0.98] shadow-lg shadow-red-900/40"
                  : "bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-900/30"}`}>
              {talking ? (
                <>
                  <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                  {targetLabel ? `BICARA KE ${targetLabel.toUpperCase()} — lepas` : "SEDANG BICARA — lepas untuk berhenti"}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v3m0-3a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
                  </svg>
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
              🔊 Tap untuk aktifkan suara
            </button>
          )}

          {/* Daftar peserta */}
          <div className="mt-3">
            <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1.5">Peserta ({peerList.length + 1})</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-200 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Kamu
              </span>
              {peerList.map(p => {
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

          {/* Warning kalau tidak ada TURN */}
          {!hasTurn && (
            <div className="mt-2 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
              <p className="text-[10px] text-amber-300 font-semibold">⚠️ TURN server belum dikonfigurasi</p>
              <p className="text-[10px] text-amber-400 mt-0.5">
                Koneksi mungkin gagal jika pengantar pakai data seluler berbeda.
                Set NEXT_PUBLIC_TURN_HOST/USER/PASS di .env untuk fix ini.
              </p>
            </div>
          )}

          <button onClick={leave} className="mt-3 w-full h-9 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-gray-300 transition">
            Putus HT
          </button>
        </>
      )}
    </div>
  );
}