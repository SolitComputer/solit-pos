"use client";

import {
  createContext, useContext, useCallback, useEffect, useRef, useState,
} from "react";
import { supabase } from "@/services/supabase";
import { ICE_SERVERS } from "@/lib/htIce";
import { DELIVERY_VOICE_ROLES } from "@/lib/permissions";

export interface LobbyUser { userId: string; name: string; role: string; }
type CallState = "idle" | "outgoing" | "incoming" | "connecting" | "in-call";
interface ActivePeer { callId: string; peerId: string; peerName: string; peerRole: string; order?: string | null; }

interface HTCtx {
  ready: boolean;
  me: LobbyUser | null;
  online: LobbyUser[];
  state: CallState;
  peer: ActivePeer | null;
  muted: boolean;
  connState: string;
  callUser: (t: LobbyUser, order?: string | null) => void;
  accept: () => void;
  reject: () => void;
  hangUp: () => void;
  toggleMute: () => void;
}

const Ctx = createContext<HTCtx | null>(null);
export const useHTCall = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHTCall harus dipakai di dalam HTCallProvider");
  return c;
};

const RING_TIMEOUT = 30000;
const ELIGIBLE = new Set<string>(DELIVERY_VOICE_ROLES as readonly string[]);
const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── Ringtone sederhana (WebAudio + getar) ──
function makeRinger() {
  let ctx: AudioContext | null = null;
  let iv: ReturnType<typeof setInterval> | null = null;
  const beep = () => {
    try {
      if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.07;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.25);
    } catch { /* noop */ }
  };
  return {
    start() { if (iv) return; beep(); iv = setInterval(beep, 1200); navigator.vibrate?.([300, 200, 300]); },
    stop() { if (iv) { clearInterval(iv); iv = null; } },
  };
}

export function HTCallProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<LobbyUser | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState<LobbyUser[]>([]);
  const [state, setState] = useState<CallState>("idle");
  const [peer, setPeer] = useState<ActivePeer | null>(null);
  const [muted, setMuted] = useState(false);
  const [connState, setConnState] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const meRef = useRef<LobbyUser | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<{ id: string; peerId: string; isCaller: boolean } | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringerRef = useRef<ReturnType<typeof makeRinger> | null>(null);
  const stateRef = useRef<CallState>("idle");

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { meRef.current = me; }, [me]);

  const flashNote = useCallback((s: string) => { setNote(s); setTimeout(() => setNote(null), 3500); }, []);

  // current user
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me").then(r => r.json()).then(r => {
      if (!alive) return;
      const u = r?.user;
      if (u && ELIGIBLE.has(u.role)) setMe({ userId: u.id, name: u.name, role: u.role });
    }).catch(() => { });
    return () => { alive = false; };
  }, []);

  const send = useCallback((payload: any) => {
    channelRef.current?.send({ type: "broadcast", event: "ht", payload });
  }, []);

  const signal = useCallback((to: string, kind: string, extra: any = {}) => {
    const m = meRef.current; if (!m) return;
    send({ kind, to, from: m.userId, fromName: m.name, fromRole: m.role, ...extra });
  }, [send]);

  const teardown = useCallback((notifyBye: boolean) => {
    ringerRef.current?.stop();
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    const call = callRef.current;
    if (notifyBye && call) signal(call.peerId, "bye", { callId: call.id });
    try { pcRef.current?.getSenders().forEach(s => s.track?.stop()); } catch { }
    try { pcRef.current?.close(); } catch { }
    pcRef.current = null;
    localRef.current?.getTracks().forEach(t => t.stop());
    localRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    pendingIceRef.current = [];
    callRef.current = null;
    setPeer(null); setMuted(false); setConnState(""); setAudioBlocked(false); setState("idle");
  }, [signal]);

  const restartIce = useCallback(async () => {
    const pc = pcRef.current, call = callRef.current;
    if (!pc || !call) return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      signal(call.peerId, "sdp", { callId: call.id, sdp: offer });
    } catch { /* noop */ }
  }, [signal]);

  const getMic = useCallback(async () => {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    localRef.current = s;
    return s;
  }, []);

  const buildPc = useCallback((peerId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = e => {
      if (e.candidate) signal(peerId, "ice", { callId: callRef.current?.id, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = e => {
      const [stream] = e.streams;
      if (remoteAudioRef.current && stream) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(() => setAudioBlocked(true));
      }
    };
    pc.onconnectionstatechange = () => {
      setConnState(pc.connectionState);
      if (pc.connectionState === "connected") { ringerRef.current?.stop(); setState("in-call"); }
      if (pc.connectionState === "failed" && callRef.current?.isCaller) restartIce();
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected") {
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" && callRef.current?.isCaller) restartIce();
        }, 4000);
      }
    };
    pcRef.current = pc;
    return pc;
  }, [signal, restartIce]);

  // ── Outgoing ──
  const callUser = useCallback(async (target: LobbyUser, order: string | null = null) => {
    if (stateRef.current !== "idle") return;
    const m = meRef.current; if (!m) return;
    const callId = genId();
    callRef.current = { id: callId, peerId: target.userId, isCaller: true };
    setPeer({ callId, peerId: target.userId, peerName: target.name, peerRole: target.role, order });
    setState("outgoing");
    signal(target.userId, "invite", { callId, order });
    ringTimerRef.current = setTimeout(() => {
      if (stateRef.current === "outgoing") {
        signal(target.userId, "cancel", { callId });
        flashNote("Tidak ada jawaban");
        teardown(false);
      }
    }, RING_TIMEOUT);
  }, [signal, teardown, flashNote]);

  // ── Callee terima ──
  const accept = useCallback(async () => {
    const call = callRef.current; if (!call || call.isCaller) return;
    ringerRef.current?.stop();
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    setState("connecting");
    try {
      const stream = await getMic();
      const pc = buildPc(call.peerId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      signal(call.peerId, "accept", { callId: call.id }); // pemanggil yg akan kirim offer
    } catch {
      signal(call.peerId, "reject", { callId: call.id, reason: "mic" });
      teardown(false);
    }
  }, [getMic, buildPc, signal, teardown]);

  const reject = useCallback(() => {
    const call = callRef.current;
    if (call && !call.isCaller) signal(call.peerId, "reject", { callId: call.id, reason: "declined" });
    teardown(false);
  }, [signal, teardown]);

  const hangUp = useCallback(() => teardown(true), [teardown]);

  const toggleMute = useCallback(() => {
    const s = localRef.current; if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach(t => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  // ── Handler pesan signaling ──
  const onMsg = useCallback(async (msg: any) => {
    const m = meRef.current; if (!m || !msg || msg.to !== m.userId || msg.from === m.userId) return;

    switch (msg.kind) {
      case "invite": {
        if (stateRef.current !== "idle") { signal(msg.from, "reject", { callId: msg.callId, reason: "busy" }); return; }
        callRef.current = { id: msg.callId, peerId: msg.from, isCaller: false };
        setPeer({ callId: msg.callId, peerId: msg.from, peerName: msg.fromName, peerRole: msg.fromRole, order: msg.order ?? null });
        setState("incoming");
        ringerRef.current?.start();
        ringTimerRef.current = setTimeout(() => {
          if (stateRef.current === "incoming") { signal(msg.from, "reject", { callId: msg.callId, reason: "timeout" }); teardown(false); }
        }, RING_TIMEOUT);
        break;
      }
      case "cancel": if (callRef.current?.id === msg.callId) { flashNote("Panggilan dibatalkan"); teardown(false); } break;
      case "reject": {
        if (callRef.current?.id === msg.callId && callRef.current?.isCaller) {
          flashNote(msg.reason === "busy" ? "Sedang sibuk" : msg.reason === "timeout" ? "Tidak ada jawaban" : msg.reason === "mic" ? "Lawan tak punya mikrofon" : "Panggilan ditolak");
          teardown(false);
        }
        break;
      }
      case "accept": {
        const call = callRef.current;
        if (!call || !call.isCaller || call.id !== msg.callId) return;
        if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
        setState("connecting");
        try {
          const stream = await getMic();
          const pc = buildPc(call.peerId);
          stream.getTracks().forEach(t => pc.addTrack(t, stream));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signal(call.peerId, "sdp", { callId: call.id, sdp: offer });
        } catch { teardown(true); }
        break;
      }
      case "sdp": {
        const call = callRef.current, pc = pcRef.current;
        if (!call || call.id !== msg.callId || !pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(c); } catch { } }
          pendingIceRef.current = [];
          if (msg.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signal(call.peerId, "sdp", { callId: call.id, sdp: answer });
          }
        } catch (e) { console.error("[ht] sdp", e); }
        break;
      }
      case "ice": {
        const call = callRef.current, pc = pcRef.current;
        if (!call || call.id !== msg.callId || !msg.candidate) return;
        if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(msg.candidate); } catch { } }
        else pendingIceRef.current.push(msg.candidate);
        break;
      }
      case "bye": if (callRef.current?.id === msg.callId) { flashNote("Panggilan diakhiri"); teardown(false); } break;
    }
  }, [signal, getMic, buildPc, teardown, flashNote]);

  // ── Watchdog: connecting kelamaan → batal ──
  useEffect(() => {
    if (state !== "connecting") return;
    const t = setTimeout(() => { if (stateRef.current === "connecting") { flashNote("Gagal menyambung"); teardown(true); } }, 25000);
    return () => clearTimeout(t);
  }, [state, teardown, flashNote]);

  // ── Lobby: presence + signaling ──
  useEffect(() => {
    if (!me) return;
    ringerRef.current = makeRinger();
    const channel = supabase.channel("ht-lobby", {
      config: { presence: { key: me.userId }, broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "ht" }, p => onMsg(p.payload));
    channel.on("presence", { event: "sync" }, () => {
      const st = channel.presenceState();
      const seen = new Set<string>();
      const list: LobbyUser[] = [];
      Object.values(st).forEach((arr: any) => {
        const meta = arr?.[0];
        if (meta?.userId && meta.userId !== me.userId && !seen.has(meta.userId)) {
          seen.add(meta.userId);
          list.push({ userId: meta.userId, name: meta.name, role: meta.role });
        }
      });
      setOnline(list);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ userId: me.userId, name: me.name, role: me.role });
        setReady(true);
      }
    });
    channelRef.current = channel;
    return () => {
      teardown(false);
      supabase.removeChannel(channel);
      channelRef.current = null;
      setReady(false);
    };
  }, [me, onMsg, teardown]);

  const enableAudio = () => { remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => { }); };

  return (
    <Ctx.Provider value={{ ready, me, online, state, peer, muted, connState, callUser, accept, reject, hangUp, toggleMute }}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {note && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] bg-[#1a1a2e] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-2xl">
          {note}
        </div>
      )}

      {state !== "idle" && peer && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-[#1a1a2e] rounded-3xl p-6 text-white shadow-2xl text-center">
            <div className="text-5xl mb-3 animate-bounce">📻</div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">
              {state === "incoming" ? "Panggilan HT masuk" : state === "outgoing" ? "Memanggil…" : state === "connecting" ? "Menyambungkan…" : "Tersambung"}
            </p>
            <p className="text-2xl font-black mt-1">{peer.peerName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{peer.peerRole}{peer.order ? ` · order ${peer.order}` : ""}</p>

            {(state === "outgoing" || state === "connecting") && (
              <div className="flex justify-center gap-1.5 mt-4">
                {[0, 1, 2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}
              </div>
            )}
            {state === "in-call" && <p className="text-emerald-300 text-xs font-bold mt-3">🔊 {connState === "connected" ? "Tersambung — silakan bicara" : connState}</p>}

            {audioBlocked && (
              <button onClick={enableAudio} className="mt-3 w-full h-9 rounded-xl bg-amber-400 text-amber-950 text-xs font-bold">🔊 Tap untuk aktifkan suara</button>
            )}

            <div className="mt-6 flex items-center justify-center gap-4">
              {state === "incoming" && (
                <>
                  <button onClick={reject} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-2xl shadow-lg active:scale-95 transition">📵</button>
                  <button onClick={accept} className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-2xl shadow-lg active:scale-95 transition animate-pulse">📞</button>
                </>
              )}
              {(state === "outgoing" || state === "connecting") && (
                <button onClick={hangUp} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-2xl shadow-lg active:scale-95 transition">📵</button>
              )}
              {state === "in-call" && (
                <>
                  <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg active:scale-95 transition ${muted ? "bg-amber-500" : "bg-white/15 hover:bg-white/25"}`}>{muted ? "🔇" : "🎙️"}</button>
                  <button onClick={hangUp} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-2xl shadow-lg active:scale-95 transition">📵</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}