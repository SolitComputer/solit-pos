"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import * as faceapi from "face-api.js";

type Stage =
  | "loading" | "checking" | "enroll" | "verify"
  | "manual" | "enrolling" | "verifying" | "success" | "error";

const MAX_ATTEMPTS = 7;
const AUTO_CAPTURE_CONFIDENCE = 0.82;
const HOLD_FRAMES = 5;
const DETECTION_INPUT_SIZE = 160;

function ts() {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

type LogType = "info" | "ok" | "warn" | "err";
interface LogEntry { time: string; msg: string; type: LogType }

export default function FaceVerifyPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("from") ?? "/payment/create";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdCountRef = useRef(0);
  const isCapturingRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stage, setStage] = useState<Stage>("loading");
  const [message, setMessage] = useState("Memuat sistem...");
  const [attempts, setAttempts] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [manualAllowed, setManualAllowed] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [clockStr, setClockStr] = useState(ts());
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: ts(), msg: "solit biometric engine v2.5 started", type: "ok" },
  ]);

  const addLog = useCallback((msg: string, type: LogType = "info") => {
    setLogs((p) => [...p.slice(-30), { time: ts(), msg, type }]);
  }, []);

  // Clock tick
  useEffect(() => {
    clockRef.current = setInterval(() => setClockStr(ts()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        addLog("loading models...", "info");

        const [, statusResult] = await Promise.all([
          Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
            faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
            faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
          ]),
          fetch("/api/auth/face-status").then((r) => r.json()).catch(() => null),
        ]);

        if (cancelled) return;

        addLog("models loaded", "ok");
        setModelsLoaded(true);

        if (!statusResult || !statusResult.success) {
          addLog("auth failed — redirect to login", "err");
          window.location.href = "/login";
          return;
        }

        if (statusResult.alreadyVerified) {
          addLog("session verified — granting access", "ok");
          window.location.href = redirectTo;
          return;
        }

        setManualAllowed(statusResult.manualAllowed);

        if (statusResult.needEnroll) {
          addLog("no biometric data — enrollment required", "warn");
          setStage("enroll");
          setMessage("Daftarkan wajah Anda");
        } else {
          addLog("biometric found — verification required", "ok");
          setStage("verify");
          setMessage("Posisikan wajah Anda di oval");
        }

      } catch {
        if (cancelled) return;
        addLog("fatal: model load failed", "err");
        setStage("error");
        setMessage("Gagal memuat model. Refresh halaman.");
      }
    }

    load();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ── Check status ─────────────────────────────────────────────────────────
  const checkStatus = async () => {
    setStage("checking");
    addLog("querying server...", "info");
    try {
      const res = await fetch("/api/auth/face-status");
      const data = await res.json();
      if (!data.success) {
        addLog("auth failed — redirect to login", "err");
        window.location.href = "/login";
        return;
      }
      if (data.alreadyVerified) {
        addLog("session verified — granting access", "ok");
        window.location.href = redirectTo;
        return;
      }
      setManualAllowed(data.manualAllowed);
      if (data.needEnroll) {
        addLog("no biometric data — enrollment required", "warn");
        setStage("enroll");
        setMessage("Daftarkan wajah Anda");
      } else {
        addLog("biometric found — verification required", "ok");
        setStage("verify");
        setMessage("Posisikan wajah Anda di oval");
      }
    } catch {
      addLog("connection error", "err");
      setStage("error");
      setMessage("Koneksi gagal. Periksa jaringan.");
    }
  };

  const startCamera = useCallback(async () => {
    try {
      addLog("initializing camera...", "info");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => { });
      }
      addLog("camera active", "ok");
      return true;
    } catch {
      addLog("camera unavailable", "err");
      return false;
    }
  }, [addLog]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    holdCountRef.current = 0;
    isCapturingRef.current = false;
  }, []);

  const captureEmbedding = useCallback(async (): Promise<number[] | null> => {
    if (!videoRef.current) return null;
    const det = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    return det ? Array.from(det.descriptor) : null;
  }, []);

  const doVerify = useCallback(async (embedding: number[], attempt: number) => {
    const res = await fetch("/api/auth/face-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embedding, attemptCount: attempt }),
    });
    return res.json();
  }, []);

  // ── Detection loop + auto-capture ────────────────────────────────────────
  const startFaceDetectionLoop = useCallback((mode: "enroll" | "verify") => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    holdCountRef.current = 0;

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      if (isCapturingRef.current) return;

      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: DETECTION_INPUT_SIZE, scoreThreshold: 0.5 });
      const detections = await faceapi
        .detectAllFaces(videoRef.current, opts)
        .withFaceLandmarks();

      const dims = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
      faceapi.matchDimensions(canvasRef.current, dims);
      const resized = faceapi.resizeResults(detections, dims);

      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, dims.width, dims.height);
        if (detections.length === 1) {
          // Override default style — white/gray minimal landmarks
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 0.8;
          faceapi.draw.drawFaceLandmarks(canvasRef.current, resized);
        }
      }

      const detected = detections.length === 1;
      setFaceDetected(detected);

      if (!detected) {
        holdCountRef.current = 0;
        setConfidence(0);
        setHoldProgress(0);
        return;
      }

      const score = detections[0].detection.score;
      setConfidence(Math.round(score * 100));

      if (score >= AUTO_CAPTURE_CONFIDENCE) {
        holdCountRef.current += 1;
        setHoldProgress(Math.min(Math.round((holdCountRef.current / HOLD_FRAMES) * 100), 100));

        if (holdCountRef.current >= HOLD_FRAMES) {
          isCapturingRef.current = true;
          holdCountRef.current = 0;
          setHoldProgress(0);

          if (mode === "enroll") {
            setStage("enrolling");
            setMessage("Memproses data wajah...");
            addLog("auto-capture — extracting embedding", "ok");
          } else {
            setStage("verifying");
            setMessage("Mencocokkan biometrik...");
            addLog("auto-capture — running match", "ok");
          }

          const embedding = await captureEmbedding();

          if (!embedding) {
            addLog("embedding extraction failed — retry", "warn");
            isCapturingRef.current = false;
            setStage(mode);
            setMessage(mode === "enroll" ? "Coba lagi" : "Posisikan wajah Anda di oval");
            startCamera().then(() => startFaceDetectionLoop(mode));
            return;
          }

          if (mode === "enroll") {
            const enrollRes = await fetch("/api/auth/face-enroll", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ embedding }),
            });
            const enrollData = await enrollRes.json();

            if (enrollData.success) {
              addLog("enrollment success — running first verify", "ok");
              const vd = await doVerify(embedding, 1);
              if (vd.success) {
                addLog("access granted", "ok");
                setStage("success");
                setMessage("Wajah terdaftar & diverifikasi");
                setTimeout(() => (window.location.href = redirectTo), 1800);
              } else {
                addLog("first verify failed — re-verify", "warn");
                isCapturingRef.current = false;
                setStage("verify");
                setMessage("Posisikan wajah Anda di oval");
                startCamera().then(() => startFaceDetectionLoop("verify"));
              }
            } else {
              addLog(`enrollment failed: ${enrollData.message}`, "err");
              isCapturingRef.current = false;
              setStage("enroll");
              startCamera().then(() => startFaceDetectionLoop("enroll"));
            }
          } else {
            setAttempts((prev) => {
              const newAttempt = prev + 1;
              (async () => {
                const vd = await doVerify(embedding, newAttempt);
                if (vd.success) {
                  addLog("identity confirmed", "ok");
                  setStage("success");
                  setMessage("Akses diberikan");
                  setTimeout(() => (window.location.href = redirectTo), 1800);
                } else {
                  if (newAttempt >= MAX_ATTEMPTS) {
                    addLog("max attempts — fallback manual", "warn");
                    isCapturingRef.current = false;
                    setStage("manual");
                    setMessage("Terlalu banyak percobaan gagal");
                  } else {
                    addLog(`match failed [${newAttempt}/${MAX_ATTEMPTS}]`, "warn");
                    isCapturingRef.current = false;
                    setStage("verify");
                    setMessage(`Gagal (${newAttempt}/${MAX_ATTEMPTS}) — Coba lagi`);
                    startCamera().then(() => startFaceDetectionLoop("verify"));
                  }
                }
              })();
              return newAttempt;
            });
          }
        }
      } else {
        holdCountRef.current = Math.max(0, holdCountRef.current - 1);
        setHoldProgress((p) => Math.max(0, p - 5));
      }
    }, 200);
  }, [addLog, captureEmbedding, doVerify, redirectTo, startCamera]);

  // ── Stage effect ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage === "enroll" || stage === "verify") {
      (async () => {
        const ok = await startCamera();
        if (!ok) {
          setStage("manual");
          setMessage("Kamera tidak tersedia");
          return;
        }
        startFaceDetectionLoop(stage as "enroll" | "verify");
      })();
    }
    if (["loading", "checking", "success", "error", "manual"].includes(stage)) {
      stopCamera();
    }
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual fallback ───────────────────────────────────────────────────────
  const handleManual = useCallback(async () => {
    setStage("verifying");
    addLog("manual auth requested", "warn");
    try {
      const res = await fetch("/api/auth/face-verify", { method: "PUT" });
      const data = await res.json();
      if (data.success) {
        addLog("manual auth granted", "ok");
        setStage("success");
        setMessage("Masuk tanpa verifikasi wajah");
        setTimeout(() => (window.location.href = redirectTo), 1500);
      } else {
        addLog("manual auth failed", "err");
        setStage("manual");
        setMessage("Gagal. Coba lagi.");
      }
    } catch {
      addLog("connection error", "err");
      setStage("manual");
    }
  }, [addLog, redirectTo]);

  const handleLogout = async () => {
    addLog("session terminated", "warn");
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const showCamera = ["enroll", "verify", "enrolling", "verifying"].includes(stage);
  const isProcessing = ["enrolling", "verifying"].includes(stage);

  // Confidence color — putih/abu tapi dengan aksen warna minimal
  const confColor =
    confidence > 82 ? "rgba(255,255,255,0.75)"
      : confidence > 60 ? "#f59e0b"
        : "#f87171";

  // Log color class
  const logColor: Record<LogType, string> = {
    info: "rgba(255,255,255,0.3)",
    ok: "rgba(255,255,255,0.75)",
    warn: "#f59e0b",
    err: "#f87171",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px",
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');

        @keyframes scanY {
          0% { top: -1px; } 100% { top: 100%; }
        }
        @keyframes scanFace {
          0%, 100% { top: 8%; } 50% { top: 90%; }
        }
        @keyframes rot {
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes pulse-green {
          0%, 100% { opacity: 1; } 50% { opacity: 0.35; }
        }
        @keyframes pulse-amber {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes successRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.12); }
          50%       { box-shadow: 0 0 0 12px rgba(255,255,255,0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .fv-card {
          width: 100%;
          max-width: 400px;
          background: #111118;
          border: 0.5px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 22px;
          position: relative;
          overflow: hidden;
        }
        .fv-card::after {
          content: '';
          position: absolute;
          top: -0.5px; left: 15%; right: 15%; height: 0.5px;
          background: rgba(255,255,255,0.12);
        }
        .fv-card::before {
          content: '';
          position: absolute;
          top: -0.5px; left: 0; right: 0; height: 0.5px;
          background: rgba(255,255,255,0.04);
          animation: scanY 4s linear infinite;
        }

        /* Camera */
        .cam-box {
          position: relative;
          background: #08080e;
          border-radius: 10px;
          border: 0.5px solid rgba(255,255,255,0.06);
          aspect-ratio: 4/3;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .cam-box video, .cam-box canvas {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }
        .cam-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 36px 36px;
        }
        .cam-scanline {
          position: absolute; left: 0; right: 0; height: 1px;
          background: rgba(255,255,255,0.06);
          animation: scanFace 3s ease-in-out infinite;
          pointer-events: none;
        }

        /* Face oval */
        .face-oval {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 110px; height: 136px;
          pointer-events: none;
        }
        @media (max-width: 360px) {
          .face-oval { width: 82px; height: 102px; }
        }
        .face-oval-ring {
          position: absolute; inset: 0;
          border-radius: 50%;
          transition: border-color 0.4s, opacity 0.4s;
        }
        .face-oval-ring.on  { border: 1.5px solid rgba(255,255,255,0.7); }
        .face-oval-ring.off { border: 1px dashed rgba(255,255,255,0.18); }
        .face-oval-spin1 {
          position: absolute; inset: -6px;
          border-radius: 50%;
          border: 0.5px dashed rgba(255,255,255,0.1);
          animation: rot 7s linear infinite;
        }
        .face-oval-spin2 {
          position: absolute; inset: -12px;
          border-radius: 50%;
          border: 0.5px dashed rgba(255,255,255,0.05);
          animation: rot 11s linear infinite reverse;
        }

        /* HUD text */
        .hud { position: absolute; font-size: 9px; line-height: 1.65; letter-spacing: 0.3px; }
        .hud-tl { top: 8px; left: 10px; color: rgba(255,255,255,0.25); }
        .hud-tr { top: 8px; right: 10px; text-align: right; color: rgba(255,255,255,0.25); }
        .hud-bl { bottom: 8px; left: 10px; }
        .hud-br { bottom: 8px; right: 10px; text-align: right; color: rgba(255,255,255,0.2); }
        .blink   { animation: blink 1.2s step-end infinite; }

        /* Hold progress at bottom of cam */
        .hold-bar-wrap { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: rgba(255,255,255,0.04); }
        .hold-bar-fill { height: 100%; transition: width 0.18s, background 0.3s; }

        /* Processing overlay */
        .proc-overlay {
          position: absolute; inset: 0;
          background: rgba(8,8,14,0.75);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 10px;
        }
        .spinner {
          width: 28px; height: 28px;
          border: 1px solid rgba(255,255,255,0.1);
          border-top: 1px solid rgba(255,255,255,0.6);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        /* Status chip */
        .status-chip {
          display: flex; align-items: center; gap: 8px;
          background: #0d0d14;
          border: 0.5px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          padding: 8px 12px;
          margin-bottom: 10px;
        }
        .s-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .s-dot-green { background: #4ade80; animation: pulse-green 1.8s ease infinite; }
        .s-dot-amber { background: #f59e0b; animation: pulse-amber 0.5s ease infinite; }
        .s-dot-gray  { background: rgba(255,255,255,0.3); }

        /* Progress bars */
        .pbar-wrap { height: 2px; background: rgba(255,255,255,0.05); overflow: hidden; }
        .pbar-fill  { height: 100%; transition: width 0.2s, background 0.3s; }

        /* Terminal log */
        .t-log {
          background: #0a0a0f;
          border: 0.5px solid rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 8px 10px;
          height: 72px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.08) transparent;
        }
        .t-log-entry {
          display: flex; gap: 8px;
          font-size: 10px;
          line-height: 1.75;
          font-family: 'SF Mono', 'Fira Code', monospace;
          animation: fadeSlide 0.15s ease;
        }
        .t-time { color: rgba(255,255,255,0.2); flex-shrink: 0; white-space: nowrap; }

        /* Buttons */
        .btn-main {
          width: 100%;
          background: rgba(255,255,255,0.06);
          border: 0.5px solid rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.85);
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          font-weight: 500;
          padding: 11px;
          border-radius: 10px;
          cursor: pointer;
          letter-spacing: 0.2px;
          transition: background 0.15s, border-color 0.15s;
        }
        .btn-main:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); }
        .btn-main:active { transform: scale(0.98); }
        .btn-ghost {
          background: none; border: none;
          color: rgba(255,255,255,0.25);
          font-family: inherit; font-size: 11px;
          cursor: pointer; padding: 5px;
          transition: color 0.15s; letter-spacing: 0.2px;
        }
        .btn-ghost:hover { color: rgba(255,255,255,0.6); }

        /* Success icon */
        .success-circle {
          width: 56px; height: 56px;
          border-radius: 50%;
          background: rgba(255,255,255,0.04);
          border: 0.5px solid rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          animation: successRing 2s ease-in-out infinite;
        }

        /* Failed badge — menonjol agar ketahuan */
        .fail-badge {
          display: flex; align-items: center; gap: 8px;
          background: rgba(248,113,113,0.08);
          border: 0.5px solid rgba(248,113,113,0.3);
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 12px;
          animation: fadeSlide 0.2s ease;
        }
        .fail-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #f87171; flex-shrink: 0; }
        .fail-badge-text { font-size: 12px; color: #f87171; flex: 1; letter-spacing: 0.2px; }
        .fail-badge-count { font-size: 11px; color: rgba(248,113,113,0.6); }
      `}</style>

      <div className="fv-card">

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: "#1a1a24", border: "0.5px solid rgba(255,255,255,0.1)", overflow: "hidden" }}>
              <img src="/assets/solit03.jpeg" alt="Solit" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.8)", letterSpacing: 0.2 }}>Solit POS</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", animation: "pulse-green 2s ease infinite" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 0.3 }}>sys online</span>
          </div>
        </div>

        {/* ── Title ── */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.88)", letterSpacing: 0.2, marginBottom: 3 }}>
            {stage === "enroll" || stage === "enrolling" ? "Daftarkan wajah"
              : stage === "manual" ? "Verifikasi manual"
                : "Verifikasi wajah"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 0.3 }}>
            Solit POS — biometric access
          </div>
        </div>

        {/* ── Loading / Checking ── */}
        {(stage === "loading" || stage === "checking") && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "36px 0" }}>
            <div className="spinner" />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 0.3 }}>{message}</div>
          </div>
        )}

        {/* ── Success ── */}
        {stage === "success" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "30px 0" }}>
            <div className="success-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)", textAlign: "center" }}>{message}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Mengalihkan...</div>
          </div>
        )}

        {/* ── Error ── */}
        {stage === "error" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(248,113,113,0.06)", border: "0.5px solid rgba(248,113,113,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: "#f87171", textAlign: "center" }}>{message}</div>
            <button className="btn-main" onClick={() => window.location.reload()} style={{ maxWidth: 180 }}>
              Refresh halaman
            </button>
          </div>
        )}

        {/* ── Camera view ── */}
        {showCamera && (
          <>
            {/* Fail badge — muncul saat ada percobaan gagal */}
            {attempts > 0 && !isProcessing && (
              <div className="fail-badge">
                <div className="fail-badge-dot" />
                <div className="fail-badge-text">Wajah tidak dikenali</div>
                <div className="fail-badge-count">{attempts}/{MAX_ATTEMPTS}</div>
              </div>
            )}

            {/* Status chip */}
            <div className="status-chip">
              <div className={`s-dot ${isProcessing ? "s-dot-amber" : faceDetected ? "s-dot-green" : "s-dot-gray"}`} />
              <div style={{ flex: 1, fontSize: 11, color: isProcessing ? "#f59e0b" : faceDetected ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)", letterSpacing: 0.2 }}>
                {isProcessing ? message : faceDetected ? "Wajah terdeteksi — tahan" : "Arahkan wajah ke oval"}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{attempts}/{MAX_ATTEMPTS}</div>
            </div>

            {/* Camera box */}
            <div className="cam-box">
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} />
              <div className="cam-grid" />
              <div className="cam-scanline" />

              {/* Face oval */}
              <div className="face-oval">
                <div className={`face-oval-ring ${faceDetected ? "on" : "off"}`} />
                <div className="face-oval-spin1" />
                <div className="face-oval-spin2" />
              </div>

              {/* HUD */}
              <div className="hud hud-tl">
                <div>cam·0</div>
                <div className="blink" style={{ color: "rgba(255,255,255,0.45)" }}>● rec</div>
              </div>
              <div className="hud hud-tr">
                <div>640×480</div>
                <div style={{ color: confColor }}>{confidence}%</div>
              </div>
              <div className="hud hud-bl" style={{ color: confColor, fontSize: 9 }}>
                {confidence >= AUTO_CAPTURE_CONFIDENCE * 100 ? "conf: lock" : "conf: scan"}
              </div>
              <div className="hud hud-br">{clockStr}</div>

              {/* Hold progress bar */}
              <div className="hold-bar-wrap">
                <div
                  className="hold-bar-fill"
                  style={{
                    width: `${holdProgress}%`,
                    background: holdProgress > 80 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
                  }}
                />
              </div>

              {/* Processing overlay */}
              {isProcessing && (
                <div className="proc-overlay">
                  <div className="spinner" />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 0.3 }}>{message}</div>
                </div>
              )}
            </div>

            {/* Confidence bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 4, letterSpacing: 0.3 }}>
                <span>confidence</span>
                <span style={{ color: confColor }}>{confidence}%{confidence >= AUTO_CAPTURE_CONFIDENCE * 100 ? " — ready" : ""}</span>
              </div>
              <div className="pbar-wrap">
                <div className="pbar-fill" style={{ width: `${confidence}%`, background: confColor }} />
              </div>
            </div>

            {/* Hold progress */}
            {holdProgress > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 4, letterSpacing: 0.3 }}>
                  <span>auto-capture</span>
                  <span style={{ color: "rgba(255,255,255,0.55)" }}>{holdProgress}%</span>
                </div>
                <div className="pbar-wrap">
                  <div className="pbar-fill" style={{ width: `${holdProgress}%`, background: "rgba(255,255,255,0.45)" }} />
                </div>
              </div>
            )}

            {/* Manual option */}
            {(manualAllowed || attempts >= MAX_ATTEMPTS) && !isProcessing && (
              <button
                className="btn-ghost"
                onClick={() => setStage("manual")}
                style={{ width: "100%", textAlign: "center", marginTop: 2 }}
              >
                Gunakan verifikasi manual →
              </button>
            )}

            {/* Reset & enroll ulang — untuk user yang gagal terus */}
            {attempts >= 3 && !isProcessing && (
              <button
                className="btn-ghost"
                style={{ width: "100%", textAlign: "center", color: "rgba(248,113,113,0.5)", fontSize: 10 }}
                onClick={async () => {
                  addLog("re-enrollment requested", "warn");
                  await fetch("/api/auth/face-enroll", { method: "PUT" });
                  setAttempts(0);
                  setStage("enroll");
                  setMessage("Daftarkan wajah Anda");
                }}
              >
                Wajah tidak dikenali? Daftar ulang →
              </button>
            )}
          </>
        )}

        {/* ── Manual mode ── */}
        {stage === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <div style={{ width: 44, height: 44, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}>
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", letterSpacing: 0.2 }}>{message}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                {attempts >= MAX_ATTEMPTS ? `${MAX_ATTEMPTS} percobaan gagal — akses manual` : "Mode manual tersedia hari ini"}
              </div>
            </div>
            <button className="btn-main" onClick={handleManual}>
              Masuk tanpa verifikasi wajah
            </button>
            {attempts < MAX_ATTEMPTS && (
              <button
                className="btn-ghost"
                style={{ textAlign: "center", width: "100%" }}
                onClick={() => {
                  setStage("verify");
                  startCamera().then(() => startFaceDetectionLoop("verify"));
                }}
              >
                ← Kembali ke scan wajah
              </button>
            )}
          </div>
        )}

        {/* ── Terminal log ── */}
        {!["loading", "checking"].includes(stage) && (
          <div style={{ marginTop: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: 0.5, marginBottom: 5 }}>
              system log
            </div>
            <div className="t-log">
              {logs.map((l, i) => (
                <div key={i} className="t-log-entry">
                  <span className="t-time">[{l.time}]</span>
                  <span style={{ color: logColor[l.type] }}>{l.msg}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        {!["loading", "checking", "success"].includes(stage) && (
          <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button className="btn-ghost" onClick={handleLogout}>
              Bukan Anda? Ganti akun
            </button>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", letterSpacing: 0.4 }}>
              sys:ok · wib
            </div>
          </div>
        )}
      </div>
    </main>
  );
}