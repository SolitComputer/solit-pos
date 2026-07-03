// src/components/ui/VoiceNote.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── VoicePlayer (putar VN ala WhatsApp) ──────────────────────────────────────
export function VoicePlayer({ url, isMine }: { url: string; isMine: boolean }): React.JSX.Element {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const animRef = useRef<number | null>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        setPlaying(false); setProgress(0); setCurrentTime(0); setDuration(0);
        setAudioError(null); setIsLoading(false);
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        audio.pause(); audio.load();
    }, [url]);

    useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

    const fmt = (s: number): string => {
        if (!isFinite(s) || isNaN(s) || s <= 0) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const tick = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || audio.paused) return;
        const cur = audio.currentTime;
        const dur = isFinite(audio.duration) ? audio.duration : 0;
        setCurrentTime(cur);
        setProgress(dur > 0 ? (cur / dur) * 100 : 0);
        animRef.current = requestAnimationFrame(tick);
    }, []);

    const togglePlay = async (): Promise<void> => {
        const audio = audioRef.current;
        if (!audio || audioError) return;
        if (playing) {
            audio.pause();
            if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
            setPlaying(false);
            return;
        }
        setIsLoading(true);
        try {
            await audio.play();
            setPlaying(true); setAudioError(null);
            animRef.current = requestAnimationFrame(tick);
        } catch (err: unknown) {
            const errName = err instanceof Error ? err.message : "Unknown error";
            console.error("[VoicePlayer] play() failed:", errName, "| url:", url);
            setAudioError("Gagal memutar audio");
            setPlaying(false);
        } finally { setIsLoading(false); }
    };

    const handleEnded = (): void => {
        setPlaying(false); setProgress(0); setCurrentTime(0);
        if (audioRef.current) audioRef.current.currentTime = 0;
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    };

    // FIX durasi Infinity (bug MediaRecorder webm di Chrome)
    const handleLoadedMetadata = (): void => {
        const audio = audioRef.current;
        if (!audio) return;
        const dur = audio.duration;
        if (dur === Infinity || Number.isNaN(dur)) {
            const fix = () => {
                audio.removeEventListener("timeupdate", fix);
                if (isFinite(audio.duration)) setDuration(audio.duration);
                audio.currentTime = 0;
            };
            audio.addEventListener("timeupdate", fix);
            audio.currentTime = 1e101; // paksa browser hitung durasi
        } else {
            setDuration(isFinite(dur) ? dur : 0);
        }
    };

    const handleError = (e: React.SyntheticEvent<HTMLAudioElement>): void => {
        const err = e.currentTarget.error;
        let msg = "Audio tidak dapat dimuat";
        if (err) {
            switch (err.code) {
                case MediaError.MEDIA_ERR_ABORTED: msg = "Pemutaran dibatalkan"; break;
                case MediaError.MEDIA_ERR_NETWORK: msg = "Error jaringan"; break;
                case MediaError.MEDIA_ERR_DECODE:
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = "Format tidak didukung"; break;
                default: msg = "Audio tidak dapat dimuat";
            }
        }
        console.error("[VoicePlayer] error:", err?.code, msg, "| url:", url);
        setAudioError(msg); setPlaying(false); setIsLoading(false);
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>): void => {
        const audio = audioRef.current;
        if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
        setProgress(ratio * 100); setCurrentTime(audio.currentTime);
    };

    const cycleSpeed = (): void => {
        const speeds = [1, 1.5, 2];
        const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
        setSpeed(next);
        if (audioRef.current) audioRef.current.playbackRate = next;
    };

    const base = isMine ? "rgba(255,255,255,0.2)" : "#e8ecf4";
    const fill = isMine ? "rgba(255,255,255,0.9)" : "#4f46e5";
    const text = isMine ? "rgba(255,255,255,0.75)" : "#64748b";
    const bars = [3, 5, 8, 6, 10, 7, 4, 9, 6, 8, 5, 7, 10, 6, 4, 8, 5, 9, 7, 6, 8, 4, 7, 9, 5, 8, 6, 10, 7, 5];

    if (audioError) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 200, maxWidth: 230 }}>
                <audio ref={audioRef} src={url} onError={handleError} />
                <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: isMine ? "rgba(255,255,255,0.15)" : "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isMine ? "rgba(255,255,255,0.6)" : "#ef4444"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <span style={{ fontSize: 10, color: isMine ? "rgba(255,255,255,0.6)" : "#ef4444", fontStyle: "italic" }}>{audioError}</span>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 200, maxWidth: 230 }}>
            <audio ref={audioRef} src={url} preload="auto" onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded} onError={handleError} />
            <button onClick={togglePlay} disabled={isLoading}
                style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: isMine ? "rgba(255,255,255,0.25)" : "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", cursor: isLoading ? "wait" : "pointer", flexShrink: 0, boxShadow: isMine ? "none" : "0 3px 10px rgba(79,70,229,0.4)", transition: "transform 0.1s, opacity 0.1s", opacity: isLoading ? 0.6 : 1 }}>
                {isLoading ? (
                    <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "vnSpin 0.7s linear infinite" }} />
                ) : playing ? (
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                        <rect x="0.5" y="0.5" width="4" height="13" rx="1.5" fill="white" /><rect x="7.5" y="0.5" width="4" height="13" rx="1.5" fill="white" />
                    </svg>
                ) : (
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                        <path d="M1.5 1.5L10.5 7L1.5 12.5V1.5Z" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round" />
                    </svg>
                )}
            </button>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 2, height: 26, cursor: "pointer" }} onClick={handleSeek}>
                    {bars.map((h, i) => {
                        const barProgress = (i / bars.length) * 100;
                        const isPlayed = barProgress <= progress;
                        return <div key={i} style={{ width: 3, borderRadius: 2, flexShrink: 0, height: `${Math.max(3, Math.min(h * 2.2, 26))}px`, background: isPlayed ? fill : base, transition: "background 0.05s" }} />;
                    })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: text, fontVariantNumeric: "tabular-nums" }}>
                        {playing || currentTime > 0 ? fmt(currentTime) : fmt(duration)}
                    </span>
                    <button onClick={cycleSpeed} style={{ fontSize: 8, fontWeight: 800, color: text, background: isMine ? "rgba(255,255,255,0.15)" : "rgba(79,70,229,0.1)", border: "none", borderRadius: 4, padding: "1px 5px", cursor: "pointer", lineHeight: 1.5 }}>{speed}×</button>
                </div>
            </div>

            <svg width="12" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.4 }} stroke={isMine ? "white" : "#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>

            <style>{`@keyframes vnSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ─── VoiceRecorder (satu instance, overlay — TIDAK unmount saat rekam) ─────────
// PENTING: parent (input row) HARUS position: relative, karena overlay pakai absolute inset-0.
interface VoiceRecorderProps {
    onSend: (blob: Blob, duration: number) => void;
    onCancel?: () => void;
    disabled?: boolean;
}

export function VoiceRecorder({ onSend, onCancel, disabled }: VoiceRecorderProps) {
    const [uiState, setUiState] = useState<"idle" | "recording" | "preview">("idle");
    const [duration, setDuration] = useState(0);
    const [slideX, setSlideX] = useState(0);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

    const uiStateRef = useRef<"idle" | "recording" | "preview">("idle");
    const mediaRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTsRef = useRef(0);
    const durationRef = useRef(0);
    const cancelledRef = useRef(false);
    const startingRef = useRef(false);
    const pendingStopRef = useRef<{ cancel: boolean } | null>(null);
    const gestureStartX = useRef(0);
    const previewUrlRef = useRef<string | null>(null);

    const setUi = useCallback((next: "idle" | "recording" | "preview") => {
        uiStateRef.current = next; setUiState(next);
    }, []);

    const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
    const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

    // stopRecording didefinisikan dulu (dipakai startRecording untuk pending-stop)
    const stopRecording = useCallback((cancel: boolean) => {
        clearTimer();
        cancelledRef.current = cancel;
        const mr = mediaRef.current;
        mediaRef.current = null;
        if (mr && mr.state !== "inactive") mr.stop();
        else { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        if (cancel) {
            setSlideX(0); setDuration(0); durationRef.current = 0;
            setUi("idle"); onCancel?.();
        }
    }, [onCancel, setUi]);

    const startRecording = useCallback(async () => {
        if (disabled || uiStateRef.current !== "idle" || startingRef.current) return;
        startingRef.current = true;
        cancelledRef.current = false;
        pendingStopRef.current = null;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mimeType =
                MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
                    : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
                        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
                            : MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg" : "";
            const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            chunksRef.current = [];
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                streamRef.current?.getTracks().forEach(t => t.stop());
                streamRef.current = null;
                if (cancelledRef.current) { chunksRef.current = []; return; }
                const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
                if (blob.size === 0) { setUi("idle"); onCancel?.(); return; }
                const url = URL.createObjectURL(blob);
                previewUrlRef.current = url;
                setPreviewBlob(blob); setPreviewUrl(url); setUi("preview");
            };
            mr.start(100);
            mediaRef.current = mr;
            startTsRef.current = Date.now();
            durationRef.current = 0; setDuration(0); setSlideX(0);
            setUi("recording");
            timerRef.current = setInterval(() => {
                const s = Math.floor((Date.now() - startTsRef.current) / 1000);
                durationRef.current = s; setDuration(s);
            }, 250);
            startingRef.current = false;
            // user lepas jari SEBELUM rekam benar-benar mulai → eksekusi sekarang
            if (pendingStopRef.current) {
                const { cancel } = pendingStopRef.current;
                pendingStopRef.current = null;
                stopRecording(cancel);
            }
        } catch (err) {
            console.error("[VN] mic error:", err);
            startingRef.current = false; pendingStopRef.current = null;
            setUi("idle"); onCancel?.();
            alert("Tidak bisa akses mikrofon. Pastikan izin diberikan.");
        }
    }, [disabled, onCancel, setUi, stopRecording]);

    const releaseGesture = useCallback((cancel: boolean) => {
        if (uiStateRef.current === "recording") stopRecording(cancel);
        else if (startingRef.current) pendingStopRef.current = { cancel };
    }, [stopRecording]);

    const onGestureStart = (clientX: number) => { gestureStartX.current = clientX; startRecording(); };
    const onGestureMove = (clientX: number) => {
        if (uiStateRef.current !== "recording") return;
        const dx = clientX - gestureStartX.current;
        setSlideX(dx < 0 ? Math.max(dx, -110) : 0);
    };
    const onGestureEnd = (clientX: number) => releaseGesture((clientX - gestureStartX.current) < -75);

    const handleTouchStart = (e: React.TouchEvent) => { e.preventDefault(); onGestureStart(e.touches[0].clientX); };
    const handleTouchMove = (e: React.TouchEvent) => onGestureMove(e.touches[0].clientX);
    const handleTouchEnd = (e: React.TouchEvent) => onGestureEnd(e.changedTouches[0].clientX);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        onGestureStart(e.clientX);
        const move = (ev: MouseEvent) => onGestureMove(ev.clientX);
        const up = (ev: MouseEvent) => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", up);
            onGestureEnd(ev.clientX);
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
    };

    useEffect(() => () => {
        clearTimer();
        streamRef.current?.getTracks().forEach(t => t.stop());
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    }, []);

    const cancelPreview = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrlRef.current = null;
        setPreviewUrl(null); setPreviewBlob(null);
        setDuration(0); durationRef.current = 0;
        setUi("idle"); onCancel?.();
    };

    const confirmSend = () => {
        if (!previewBlob) return;
        onSend(previewBlob, durationRef.current > 0 ? durationRef.current : duration);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrlRef.current = null;
        setPreviewUrl(null); setPreviewBlob(null);
        setDuration(0); durationRef.current = 0;
        setUi("idle");
    };

    const cancelProgress = Math.min(Math.abs(slideX) / 75, 1);

    return (
        <>
            {/* Tombol mic — SELALU ter-mount, jadi target gesture yang stabil */}
            <button
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown} disabled={disabled}
                title="Tahan untuk rekam suara"
                className="w-8 h-8 rounded-full flex items-center justify-center transition hover:scale-110 active:scale-95 disabled:opacity-40 flex-shrink-0"
                style={{ background: "#f0f4ff", color: "#818cf8", border: "none", cursor: "grab", touchAction: "none" }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" strokeWidth={2} />
                    <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" strokeWidth={2} />
                </svg>
            </button>

            {/* Overlay REKAM — nutup input row, gesture tetap ke tombol mic di bawahnya */}
            {uiState === "recording" && (
                <div className="absolute inset-0 z-30 flex items-center gap-2 px-3 bg-white" style={{ userSelect: "none" }}>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: "#ef4444" }}>{fmt(duration)}</span>
                        <div className="flex-1 flex items-center gap-1 overflow-hidden" style={{ opacity: 1 - cancelProgress * 0.6 }}>
                            <svg className="w-3 h-3 text-gray-400 animate-pulse flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-[9px] text-gray-400 truncate">Geser kiri untuk batal</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-center flex-shrink-0"
                        style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#ef4444,#dc2626)", boxShadow: "0 0 0 6px rgba(239,68,68,0.15)", transform: `translateX(${slideX}px)`, transition: "transform 0.05s linear", pointerEvents: "none" }}>
                        <svg className="w-4 h-4" fill="white" viewBox="0 0 24 24">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                            <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
                            <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </div>
                </div>
            )}

            {/* Overlay PREVIEW — dengar dulu sebelum kirim */}
            {uiState === "preview" && previewUrl && (
                <div className="absolute inset-0 z-30 flex items-center gap-2 px-3 bg-white">
                    <button onClick={cancelPreview} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#fef2f2", color: "#ef4444" }}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="flex-1 min-w-0 px-2 py-1.5 rounded-xl" style={{ background: "#f0f4ff", border: "1px solid #e0e7ff" }}>
                        <VoicePlayer url={previewUrl} isMine={false} />
                    </div>
                    <button onClick={confirmSend} className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 2px 8px rgba(79,70,229,0.4)" }}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                </div>
            )}
        </>
    );
}