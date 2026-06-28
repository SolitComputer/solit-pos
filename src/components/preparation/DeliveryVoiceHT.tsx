"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

interface VoiceNote {
  id: string; sender_id: string | null; sender_name: string | null;
  sender_role: string | null; audio_url: string; duration_ms: number | null; created_at: string;
}
interface Props {
  orderId: string; userId: string; userName: string; userRole: string; canTalk: boolean;
}

const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export default function DeliveryVoiceHT({ orderId, userId, userName, userRole, canTalk }: Props) {
  const [messages, setMessages] = useState<VoiceNote[]>([]);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const [micError, setMicError] = useState("");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recStartRef = useRef(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  // init audio element
  useEffect(() => { audioElRef.current = new Audio(); audioElRef.current.preload = "auto"; }, []);

  // unlock autoplay di gesture pertama (buat pemantau yg cuma denger)
  useEffect(() => {
    const unlock = () => {
      const a = audioElRef.current;
      if (a) a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // load riwayat (jangan auto-play yg lama)
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/preparation/${orderId}/voice`);
      const r = await res.json();
      if (r.success) {
        setMessages(r.data);
        (r.data as VoiceNote[]).forEach((m) => seenRef.current.add(m.id));
      }
    } catch { /* ignore */ }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  // antrian playback (clip masuk diputar berurutan)
  const enqueue = useCallback((url: string) => {
    queueRef.current.push(url);
    if (playingRef.current) return;
    const next = () => {
      const u = queueRef.current.shift();
      if (!u) { playingRef.current = false; return; }
      playingRef.current = true;
      const a = audioElRef.current!;
      a.src = u; a.onended = next; a.onerror = next;
      a.play().catch(() => { setAutoplayBlocked(true); playingRef.current = false; });
    };
    next();
  }, []);

  // realtime clip masuk
  useEffect(() => {
    const ch = supabase
      .channel(`voice-${orderId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "delivery_voice_notes", filter: `preparation_id=eq.${orderId}` },
        (payload) => {
          const m = payload.new as VoiceNote;
          if (seenRef.current.has(m.id)) return;
          seenRef.current.add(m.id);
          setMessages((prev) => [...prev, m]);
          if (m.sender_id !== userId) {
            enqueue(m.audio_url);
            if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(90);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, userId, enqueue]);

  const upload = useCallback(async (blob: Blob, durMs: number) => {
    setSending(true);
    try {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `voice.${ext}`);
      fd.append("duration_ms", String(Math.round(durMs)));
      const res = await fetch(`/api/preparation/${orderId}/voice`, { method: "POST", body: fd });
      const r = await res.json();
      if (!r.success) setMicError(r.message || "Gagal kirim suara");
    } catch { setMicError("Gagal kirim suara"); } finally { setSending(false); }
  }, [orderId]);

  const startRec = useCallback(async () => {
    if (!canTalk || recording || sending) return;
    setMicError(""); cancelRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
        const dur = Date.now() - recStartRef.current;
        setRecording(false); setRecMs(0);
        if (cancelRef.current || dur < 350 || chunksRef.current.length === 0) return;
        await upload(new Blob(chunksRef.current, { type: mime || "audio/webm" }), dur);
      };
      recStartRef.current = Date.now();
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      recTimerRef.current = setInterval(() => setRecMs(Date.now() - recStartRef.current), 200);
    } catch {
      setMicError("Mikrofon ditolak / tidak tersedia");
      setRecording(false);
    }
  }, [canTalk, recording, sending, upload]);

  const stopRec = useCallback((cancel = false) => {
    cancelRef.current = cancel;
    if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
  }, []);

  const playOne = (url: string) => {
    const a = audioElRef.current!;
    a.src = url; a.play().catch(() => setAutoplayBlocked(true));
  };

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }, []);

  const recSec = (recMs / 1000).toFixed(1);

  return (
    <div className="mt-3 bg-[#1a1a2e] rounded-2xl p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📻</span>
          <div>
            <p className="text-sm font-black leading-none">HT Pengantaran</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Tersambung ke Base (Admin · Programmer · Kepala Sales) & Pengantar</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE
        </span>
      </div>

      {/* Tombol Push-to-Talk */}
      <button
        type="button"
        disabled={!canTalk || sending}
        onPointerDown={(e) => { e.preventDefault(); startRec(); }}
        onPointerUp={(e) => { e.preventDefault(); stopRec(false); }}
        onPointerLeave={() => stopRec(false)}
        onPointerCancel={() => stopRec(true)}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "none", userSelect: "none" }}
        className={`w-full h-16 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition select-none
          ${recording ? "bg-red-500 scale-[0.98] shadow-lg shadow-red-900/40"
            : sending ? "bg-gray-600"
            : "bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-900/30"}
          disabled:opacity-50`}
      >
        {recording ? (
          <>
            <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
            Merekam… {recSec}s — lepas untuk kirim
          </>
        ) : sending ? (
          <>Mengirim…</>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v3m0-3a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" /></svg>
            TAHAN UNTUK BICARA
          </>
        )}
      </button>

      {micError && <p className="text-[11px] text-red-300 mt-2">{micError}</p>}
      {autoplayBlocked && (
        <button onClick={() => { setAutoplayBlocked(false); audioElRef.current?.play().catch(() => {}); }}
          className="mt-2 w-full h-8 rounded-lg bg-amber-400 text-amber-950 text-xs font-bold">
          🔊 Ketuk untuk aktifkan suara masuk
        </button>
      )}

      {/* Riwayat clip */}
      {messages.length > 0 && (
        <div className="mt-3 space-y-1.5 max-h-44 overflow-y-auto">
          {messages.slice(-12).map((m) => {
            const mine = m.sender_id === userId;
            return (
              <button key={m.id} onClick={() => playOne(m.audio_url)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition ${mine ? "bg-emerald-500/15 hover:bg-emerald-500/25" : "bg-white/5 hover:bg-white/10"}`}>
                <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">▶️</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{mine ? "Kamu" : (m.sender_name || "—")}</p>
                  <p className="text-[10px] text-gray-400">{(m.sender_role || "").replace(/_/g, " ")} · {fmtClock(m.created_at)}{m.duration_ms ? ` · ${(m.duration_ms / 1000).toFixed(1)}s` : ""}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}