"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import * as faceapi from "face-api.js";

type Stage =
  | "loading" | "checking" | "location" | "enroll" | "verify"
  | "enrolling" | "verifying" | "success" | "error"
  | "out-of-range" | "out-of-time" | "no-camera";

const MAX_ATTEMPTS = 5;
const AUTO_CAPTURE_CONFIDENCE = 0.75;
const HOLD_FRAMES = 3;
const DETECTION_INPUT_SIZE = 224;

const COMPANY_LAT = -6.402123;
const COMPANY_LNG = 106.787296;
const MAX_DISTANCE_METERS = 80;

const SHIFT_CONFIG_CLIENT = {
  PAGI: { startH: 7, startM: 30, endH: 12, endM: 0 },
  SORE: { startH: 14, startM: 0, endH: 18, endM: 0 },
} as const;

type ShiftType = keyof typeof SHIFT_CONFIG_CLIENT;

function ts() {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

type AttendanceTimeResult =
  | { allowed: true; reason: "OPEN"; openAt: string; closeAt: string }
  | { allowed: false; reason: "TOO_EARLY" | "TOO_LATE"; openAt: string; closeAt: string };

function isAttendanceTimeClient(shift: ShiftType): AttendanceTimeResult {
  const cfg = SHIFT_CONFIG_CLIENT[shift];
  const nowUTC = new Date();
  const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
  const nowWIB = new Date(wibMs);
  const total = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start = cfg.startH * 60 + cfg.startM;
  const end = cfg.endH * 60 + cfg.endM;
  const pad = (n: number) => String(n).padStart(2, "0");
  const openAt = `${pad(cfg.startH)}:${pad(cfg.startM)} WIB`;
  const closeAt = `${pad(cfg.endH)}:${pad(cfg.endM)} WIB`;
  if (total < start) return { allowed: false, reason: "TOO_EARLY", openAt, closeAt };
  if (total > end) return { allowed: false, reason: "TOO_LATE", openAt, closeAt };
  return { allowed: true, reason: "OPEN", openAt, closeAt };
}

type LogType = "info" | "ok" | "warn" | "err";
interface LogEntry { time: string; msg: string; type: LogType }
interface GpsCoords { latitude: number; longitude: number; accuracy: number }

export default function FaceVerifyPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("from") ?? "/dashboard";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdCountRef = useRef(0);
  const isCapturingRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const [stage, setStage] = useState<Stage>("loading");
  const [message, setMessage] = useState("Memuat sistem...");
  const [attempts, setAttempts] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [clockStr, setClockStr] = useState(ts());
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: ts(), msg: "solit biometric engine v3.0 started", type: "ok" },
  ]);
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [gpsCoords, setGpsCoords] = useState<GpsCoords | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [timeInfo, setTimeInfo] = useState<{
    reason: "TOO_EARLY" | "TOO_LATE"; openAt: string; closeAt: string;
  } | null>(null);

  // ✅ FIX: useState di dalam komponen
  const [userShift, setUserShift] = useState<ShiftType>("PAGI");

  const addLog = useCallback((msg: string, type: LogType = "info") => {
    setLogs(p => [...p.slice(-30), { time: ts(), msg, type }]);
  }, []);

  useEffect(() => {
    clockRef.current = setInterval(() => setClockStr(ts()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => { attemptsRef.current = attempts; }, [attempts]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const checkLocation = useCallback(async () => {
    setStage("checking");
    setGpsLoading(true);
    addLog("Mengecek lokasi GPS...", "info");

    if (!navigator.geolocation) {
      addLog("Browser tidak mendukung GPS", "err");
      setStage("error");
      setMessage("Browser Anda tidak mendukung GPS");
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const distance = calculateDistance(latitude, longitude, COMPANY_LAT, COMPANY_LNG);
        const distRound = Math.round(distance);
        setCurrentDistance(distRound);
        setGpsCoords({ latitude, longitude, accuracy });
        setGpsLoading(false);
        addLog(
          `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} | ±${Math.round(accuracy)}m | jarak ${distRound}m`,
          distance <= MAX_DISTANCE_METERS ? "ok" : "warn"
        );
        if (distance > MAX_DISTANCE_METERS) {
          setStage("out-of-range");
          setMessage(`Anda berada di luar radius (${distRound}m)`);
        } else {
          addLog(`Lokasi valid — dalam radius ${MAX_DISTANCE_METERS}m`, "ok");
          setStage("verify");
          setMessage("Lokasi valid. Silakan lakukan verifikasi wajah");
        }
      },
      (err) => {
        setGpsLoading(false);
        addLog(`GPS error: ${err.message}`, "err");
        setStage("error");
        setMessage("Tidak dapat mengakses GPS. Izinkan lokasi di browser.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [addLog]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        addLog("loading models...", "info");

        // ✅ FIX: load model dan face-status DULU, baru cek waktu berdasarkan shift dari server
        // Jangan cek waktu di client sebelum tahu shift user
        const [, statusResult] = await Promise.all([
          Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
            faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
            faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
          ]),
          fetch("/api/auth/face-status").then(r => r.json()).catch(() => null),
        ]);

        if (cancelled) return;
        addLog("models loaded ✓", "ok");

        if (!statusResult?.success) {
          window.location.href = "/login";
          return;
        }

        // ✅ FIX: set shift dari server response
        const shift: ShiftType = (statusResult.shift as ShiftType) ?? "PAGI";
        setUserShift(shift);

        // ✅ FIX: cek waktu di client menggunakan shift yang benar dari server
        // Ini sebagai defense-in-depth; validasi utama sudah di server (face-status)
        const timeCheck = isAttendanceTimeClient(shift);

        if (statusResult.alreadyAttended) {
          window.location.href = redirectTo;
          return;
        }

        // ✅ FIX: gunakan isAttendanceTime dari server (lebih akurat)
        // server sudah hitung berdasarkan shift yang benar
        if (statusResult.isAttendanceTime === false) {
          addLog(`Server: di luar jam absen (shift ${shift})`, "warn");
          // Gunakan timeInfo dari timeCheck client yang sudah pakai shift benar
          setTimeInfo({
            reason: timeCheck.allowed ? "TOO_LATE" : timeCheck.reason,
            openAt: timeCheck.openAt,
            closeAt: timeCheck.closeAt,
          });
          setStage("out-of-time");
          return;
        }

        if (statusResult.needEnroll) {
          setStage("enroll");
          setMessage("Daftarkan wajah Anda terlebih dahulu");
        } else {
          setStage("location");
          setMessage("Klik tombol di bawah untuk cek lokasi");
        }
      } catch (err) {
        console.error(err);
        setStage("error");
        setMessage("Gagal memuat sistem");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [redirectTo, addLog]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    holdCountRef.current = 0;
    isCapturingRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      // Cek apakah device punya kamera sama sekali
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(d => d.kind === "videoinput");
        if (!hasCamera) {
          addLog("no camera device found", "warn");
          return "no-camera"; // ← return string khusus
        }
      }

      addLog("initializing camera...", "info");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => { });
      }
      addLog("camera active ✓", "ok");
      return "ok";
    } catch (err: any) {
      if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        addLog("no camera found", "warn");
        return "no-camera";
      }
      addLog(`camera error: ${err?.name ?? "unavailable"}`, "err");
      return "error";
    }
  }, [addLog]);

  const captureEmbedding = useCallback(async (): Promise<number[] | null> => {
    if (!videoRef.current) return null;
    const det = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks().withFaceDescriptor();
    return det ? Array.from(det.descriptor) : null;
  }, []);

  const doVerify = useCallback(async (embedding: number[], attempt: number, coords: GpsCoords | null) => {
    const res = await fetch("/api/auth/face-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding, attemptCount: attempt,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        accuracy: coords?.accuracy ?? null,
      }),
    });
    return res.json();
  }, []);

  const startFaceDetectionLoop = useCallback((mode: "enroll" | "verify", coords: GpsCoords | null) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    holdCountRef.current = 0;
    isCapturingRef.current = false;

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || isCapturingRef.current) return;
      try {
        const detections = await faceapi
          .detectAllFaces(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions({ inputSize: DETECTION_INPUT_SIZE, scoreThreshold: 0.4 })
          )
          .withFaceLandmarks();

        const dims = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
        faceapi.matchDimensions(canvasRef.current, dims);
        const resized = faceapi.resizeResults(detections, dims);

        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, dims.width, dims.height);
          if (detections.length === 1) {
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

            const embedding = await captureEmbedding();
            if (!embedding) { isCapturingRef.current = false; return; }

            if (mode === "enroll") {
              setStage("enrolling");
              setMessage("Memproses pendaftaran wajah...");
              addLog("auto-capture — enrolling...", "ok");

              const enrollRes = await fetch("/api/auth/face-enroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ embedding }),
              });
              const enrollData = await enrollRes.json();

              if (enrollData.success) {
                addLog("enrollment berhasil ✓", "ok");
                const vd = await doVerify(embedding, 1, coords);
                if (vd.success) {
                  setStage("success");
                  setMessage("Wajah berhasil didaftarkan dan absen tercatat ✓");
                  setTimeout(() => (window.location.href = redirectTo), 1800);
                } else if (vd.outOfTime) {
                  const cfg = SHIFT_CONFIG_CLIENT[userShift];
                  const pad = (n: number) => String(n).padStart(2, "0");
                  setTimeInfo({
                    reason: "TOO_LATE",
                    openAt: `${pad(cfg.startH)}:${pad(cfg.startM)} WIB`,
                    closeAt: `${pad(cfg.endH)}:${pad(cfg.endM)} WIB`,
                  });
                  setStage("out-of-time");
                } else {
                  setStage("verify");
                  setMessage("Posisikan wajah lagi untuk absen");
                }
              } else {
                addLog(`enrollment gagal: ${enrollData.message}`, "err");
                setStage("enroll");
              }
            } else {
              const currentAttempt = attemptsRef.current + 1;
              setAttempts(currentAttempt);
              addLog(`mencoba verifikasi [${currentAttempt}/${MAX_ATTEMPTS}]...`, "info");
              const vd = await doVerify(embedding, currentAttempt, coords);

              if (vd.success) {
                setStage("success");
                setMessage("Absen wajah berhasil ✓ Selamat bekerja");
                setTimeout(() => (window.location.href = redirectTo), 1500);
              } else if (vd.outOfTime) {
                addLog("Waktu absen berakhir", "warn");
                const cfg = SHIFT_CONFIG_CLIENT[userShift];
                const pad = (n: number) => String(n).padStart(2, "0");
                setTimeInfo({
                  reason: "TOO_LATE",
                  openAt: `${pad(cfg.startH)}:${pad(cfg.startM)} WIB`,
                  closeAt: `${pad(cfg.endH)}:${pad(cfg.endM)} WIB`,
                });
                setStage("out-of-time");
              } else if (vd.needEnroll) {
                addLog("wajah belum terdaftar → enroll", "warn");
                setStage("enroll");
                setMessage("Wajah belum terdaftar. Daftarkan sekarang.");
              } else {
                addLog(`match gagal [${currentAttempt}/${MAX_ATTEMPTS}] — dist: ${vd.distance?.toFixed(3) ?? "?"}`, "warn");
                if (currentAttempt >= MAX_ATTEMPTS) {
                  setAttempts(0);
                  attemptsRef.current = 0;
                  setStage("verify");
                  setMessage("Wajah tidak dikenali. Pastikan pencahayaan cukup dan coba lagi.");
                  addLog("reset attempts — silakan coba lagi", "warn");
                } else {
                  setStage("verify");
                  setMessage(`Gagal (${currentAttempt}/${MAX_ATTEMPTS}) — Coba lagi`);
                }
              }
            }
            isCapturingRef.current = false;
          }
        } else {
          holdCountRef.current = Math.max(0, holdCountRef.current - 1);
          setHoldProgress(p => Math.max(0, p - 5));
        }
      } catch (err) {
        console.error("Detection loop error:", err);
      }
    }, 150);
  }, [addLog, captureEmbedding, doVerify, redirectTo, userShift]);

  useEffect(() => {
    if (stage === "enroll" || stage === "verify") {
      startCamera().then(result => {
        if (result === "ok") {
          startFaceDetectionLoop(stage as "enroll" | "verify", gpsCoords);
        } else if (result === "no-camera") {
          setStage("no-camera");
          setMessage("Tidak ada kamera yang terdeteksi");
        } else {
          setStage("error");
          setMessage("Kamera tidak dapat diakses. Izinkan akses kamera di browser.");
        }
      });
    }
    if (["loading", "checking", "success", "error", "location", "out-of-range", "out-of-time", "no-camera"].includes(stage)) {
      stopCamera();
    }
  }, [stage]);

  const handleRejectAttendance = useCallback(async () => {
    if (!confirm("Yakin ingin melewati absen? Kehadiran Anda tidak akan tercatat hari ini.")) return;
    setSkipping(true);
    try {
      await fetch("/api/auth/face-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: gpsCoords?.latitude ?? null,
          longitude: gpsCoords?.longitude ?? null,
          accuracy: gpsCoords?.accuracy ?? null,
        }),
      });
    } catch { /* tetap lanjut */ }
    window.location.href = redirectTo;
  }, [redirectTo, gpsCoords]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const showCamera = ["enroll", "verify", "enrolling", "verifying"].includes(stage);
  const isProcessing = ["enrolling", "verifying"].includes(stage);

  const confColor =
    confidence > 75 ? "rgba(255,255,255,0.75)"
      : confidence > 50 ? "#f59e0b" : "#f87171";

  const logColor: Record<LogType, string> = {
    info: "rgba(255,255,255,0.3)", ok: "rgba(255,255,255,0.75)", warn: "#f59e0b", err: "#f87171",
  };

  // ✅ FIX: openAtStr/closeAtStr dihitung dari userShift state
  const shiftCfg = SHIFT_CONFIG_CLIENT[userShift];
  const openAtStr = `${String(shiftCfg.startH).padStart(2, "0")}:${String(shiftCfg.startM).padStart(2, "0")}`;
  const closeAtStr = `${String(shiftCfg.endH).padStart(2, "0")}:${String(shiftCfg.endM).padStart(2, "0")}`;

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');
        @keyframes scanY { 0% { top: -1px; } 100% { top: 100%; } }
        @keyframes scanFace { 0%, 100% { top: 8%; } 50% { top: 90%; } }
        @keyframes rot { to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes pulse-green { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes pulse-amber { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes successRing { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.12); } 50% { box-shadow: 0 0 0 12px rgba(255,255,255,0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes gps-ping { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes clock-tick { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.4; } }
        .fv-card { width: 100%; max-width: 400px; background: #111118; border: 0.5px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 22px; position: relative; overflow: hidden; }
        .fv-card::after { content: ''; position: absolute; top: -0.5px; left: 15%; right: 15%; height: 0.5px; background: rgba(255,255,255,0.12); }
        .fv-card::before { content: ''; position: absolute; top: -0.5px; left: 0; right: 0; height: 0.5px; background: rgba(255,255,255,0.04); animation: scanY 4s linear infinite; }
        .cam-box { position: relative; background: #08080e; border-radius: 10px; border: 0.5px solid rgba(255,255,255,0.06); aspect-ratio: 4/3; overflow: hidden; margin-bottom: 12px; }
        .cam-box video, .cam-box canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        .cam-grid { position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px); background-size: 36px 36px; }
        .cam-scanline { position: absolute; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.06); animation: scanFace 3s ease-in-out infinite; pointer-events: none; }
        .face-oval { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 110px; height: 136px; pointer-events: none; }
        @media (max-width: 360px) { .face-oval { width: 82px; height: 102px; } }
        .face-oval-ring { position: absolute; inset: 0; border-radius: 50%; transition: border-color 0.4s, opacity 0.4s; }
        .face-oval-ring.on  { border: 1.5px solid rgba(255,255,255,0.7); }
        .face-oval-ring.off { border: 1px dashed rgba(255,255,255,0.18); }
        .face-oval-spin1 { position: absolute; inset: -6px; border-radius: 50%; border: 0.5px dashed rgba(255,255,255,0.1); animation: rot 7s linear infinite; }
        .face-oval-spin2 { position: absolute; inset: -12px; border-radius: 50%; border: 0.5px dashed rgba(255,255,255,0.05); animation: rot 11s linear infinite reverse; }
        .hud { position: absolute; font-size: 9px; line-height: 1.65; letter-spacing: 0.3px; }
        .hud-tl { top: 8px; left: 10px; color: rgba(255,255,255,0.25); }
        .hud-tr { top: 8px; right: 10px; text-align: right; color: rgba(255,255,255,0.25); }
        .hud-bl { bottom: 8px; left: 10px; }
        .hud-br { bottom: 8px; right: 10px; text-align: right; color: rgba(255,255,255,0.2); }
        .blink { animation: blink 1.2s step-end infinite; }
        .hold-bar-wrap { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: rgba(255,255,255,0.04); }
        .hold-bar-fill { height: 100%; transition: width 0.18s, background 0.3s; }
        .proc-overlay { position: absolute; inset: 0; background: rgba(8,8,14,0.75); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
        .spinner { width: 28px; height: 28px; border: 1px solid rgba(255,255,255,0.1); border-top: 1px solid rgba(255,255,255,0.6); border-radius: 50%; animation: spin 0.7s linear infinite; }
        .status-chip { display: flex; align-items: center; gap: 8px; background: #0d0d14; border: 0.5px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
        .s-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .s-dot-green { background: #4ade80; animation: pulse-green 1.8s ease infinite; }
        .s-dot-amber { background: #f59e0b; animation: pulse-amber 0.5s ease infinite; }
        .s-dot-gray  { background: rgba(255,255,255,0.3); }
        .pbar-wrap { height: 2px; background: rgba(255,255,255,0.05); overflow: hidden; }
        .pbar-fill { height: 100%; transition: width 0.2s, background 0.3s; }
        .t-log { background: #0a0a0f; border: 0.5px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 8px 10px; height: 72px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
        .t-log-entry { display: flex; gap: 8px; font-size: 10px; line-height: 1.75; font-family: 'SF Mono','Fira Code',monospace; animation: fadeSlide 0.15s ease; }
        .t-time { color: rgba(255,255,255,0.2); flex-shrink: 0; white-space: nowrap; }
        .btn-main { width: 100%; background: rgba(255,255,255,0.06); border: 0.5px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.85); font-family: 'Inter',sans-serif; font-size: 13px; font-weight: 500; padding: 11px; border-radius: 10px; cursor: pointer; letter-spacing: 0.2px; transition: background 0.15s, border-color 0.15s; }
        .btn-main:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); }
        .btn-main:active { transform: scale(0.98); }
        .btn-ghost { background: none; border: none; color: rgba(255,255,255,0.25); font-family: inherit; font-size: 11px; cursor: pointer; padding: 5px; transition: color 0.15s; letter-spacing: 0.2px; }
        .btn-ghost:hover { color: rgba(255,255,255,0.6); }
        .success-circle { width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; animation: successRing 2s ease-in-out infinite; }
        .fail-badge { display: flex; align-items: center; gap: 8px; background: rgba(248,113,113,0.08); border: 0.5px solid rgba(248,113,113,0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; animation: fadeSlide 0.2s ease; }
        .fail-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #f87171; flex-shrink: 0; }
        .fail-badge-text { font-size: 12px; color: #f87171; flex: 1; letter-spacing: 0.2px; }
        .fail-badge-count { font-size: 11px; color: rgba(248,113,113,0.6); }
        .gps-info-box { background: rgba(74,222,128,0.06); border: 0.5px solid rgba(74,222,128,0.2); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; animation: fadeSlide 0.2s ease; }
        .gps-ping { position: relative; width: 8px; height: 8px; flex-shrink: 0; }
        .gps-ping-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; position: absolute; }
        .gps-ping-ring { width: 8px; height: 8px; border-radius: 50%; background: rgba(74,222,128,0.4); position: absolute; animation: gps-ping 1.5s ease-out infinite; }
        .time-gate-card { width: 100%; background: rgba(251,191,36,0.06); border: 0.5px solid rgba(251,191,36,0.25); border-radius: 14px; padding: 20px; text-align: center; animation: fadeSlide 0.25s ease; }
        .clock-colon { animation: clock-tick 1s step-end infinite; }
        .tip-box { background: rgba(255,255,255,0.03); border: 0.5px solid rgba(255,255,255,0.07); border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
      `}</style>

      <div className="fv-card">

        {/* Header */}
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

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.88)", letterSpacing: 0.2, marginBottom: 3 }}>
            {stage === "enroll" || stage === "enrolling" ? "Daftarkan Wajah" : "Absensi Wajah"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 0.3 }}>
            Solit POS — Absensi Biometrik · Shift {userShift}
          </div>
        </div>

        {/* Loading / Checking */}
        {(stage === "loading" || stage === "checking") && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "36px 0" }}>
            <div className="spinner" />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 0.3 }}>
              {gpsLoading ? "Mendeteksi lokasi GPS..." : message}
            </div>
          </div>
        )}

        {/* Out of time */}
        {stage === "out-of-time" && (
          <div style={{ padding: "8px 0 16px" }}>
            <div className="time-gate-card">
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(251,191,36,0.1)", border: "0.5px solid rgba(251,191,36,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
                {timeInfo?.reason === "TOO_EARLY" ? "Absen Belum Dibuka" : "Waktu Absen Berakhir"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 16 }}>
                {timeInfo?.reason === "TOO_EARLY"
                  ? <span>Absen dibuka pukul <span style={{ color: "#fbbf24", fontWeight: 600 }}>{openAtStr} WIB</span></span>
                  : <span>Batas absen pukul <span style={{ color: "#fbbf24", fontWeight: 600 }}>{closeAtStr} WIB</span></span>
                }
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 16px", display: "inline-flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  Jam absen shift {userShift}:{" "}
                  <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{openAtStr}</span>
                  <span className="clock-colon"> – </span>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{closeAtStr} WIB</span>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                Waktu sekarang: <span style={{ fontFamily: "monospace" }}>{clockStr} WIB</span>
              </div>
            </div>
            <button className="btn-main" style={{ marginTop: 16 }} onClick={() => window.location.href = redirectTo}>
              Lanjut ke Dashboard →
            </button>
          </div>
        )}

        {/* Success */}
        {stage === "success" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "30px 0" }}>
            <div className="success-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)", textAlign: "center" }}>{message}</div>
            {gpsCoords && currentDistance !== null && (
              <div style={{ fontSize: 11, color: "rgba(74,222,128,0.7)", display: "flex", alignItems: "center", gap: 5 }}>
                <div className="gps-ping"><div className="gps-ping-dot" /><div className="gps-ping-ring" /></div>
                {currentDistance}m dari kantor · ±{Math.round(gpsCoords.accuracy)}m
              </div>
            )}
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Mengalihkan ke dashboard...</div>
          </div>
        )}

        {/* Error */}
        {stage === "error" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(248,113,113,0.06)", border: "0.5px solid rgba(248,113,113,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: "#f87171", textAlign: "center" }}>{message}</div>
            <button className="btn-main" onClick={() => window.location.reload()} style={{ maxWidth: 180 }}>Refresh halaman</button>
          </div>
        )}

        {/* No Camera */}
        {stage === "no-camera" && (
          <div style={{ padding: "8px 0 16px" }}>
            {/* Info box */}
            <div style={{
              width: "100%",
              background: "rgba(251,191,36,0.06)",
              border: "0.5px solid rgba(251,191,36,0.25)",
              borderRadius: 14,
              padding: "20px",
              textAlign: "center",
              marginBottom: 16,
            }}>
              {/* Icon */}
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "rgba(251,191,36,0.1)",
                border: "0.5px solid rgba(251,191,36,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  <line x1="3" y1="3" x2="21" y2="21" stroke="#fbbf24" strokeWidth={1.5} strokeLinecap="round" />
                </svg>
              </div>

              <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
                Kamera Tidak Tersedia
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7, marginBottom: 16 }}>
                Perangkat ini tidak memiliki kamera.<br />
                Absensi wajah tidak dapat dilakukan.
              </div>

              {/* Info shift tetap tampil */}
              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "0.5px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "10px 16px",
                display: "inline-flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  Shift {userShift}:{" "}
                  <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{openAtStr}</span>
                  <span className="clock-colon"> – </span>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{closeAtStr} WIB</span>
                </div>
              </div>
            </div>

            <button
              className="btn-main"
              disabled={skipping}
              onClick={async () => {
                setSkipping(true);
                try {
                  await fetch("/api/auth/face-verify", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      latitude: gpsCoords?.latitude ?? null,
                      longitude: gpsCoords?.longitude ?? null,
                      accuracy: gpsCoords?.accuracy ?? null,
                    }),
                  });
                } catch { /* tetap lanjut */ }
                window.location.href = redirectTo;
              }}
            >
              {skipping ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div style={{ width: 14, height: 14, border: "1.5px solid rgba(255,255,255,0.2)", borderTop: "1.5px solid rgba(255,255,255,0.7)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  Mengalihkan...
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  Lanjut ke Dashboard Tanpa Absen
                </span>
              )}
            </button>

            <div style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
              Kehadiran akan tercatat sebagai <span style={{ color: "rgba(251,191,36,0.6)" }}>SKIPPED</span>
            </div>
          </div>
        )}

        {/* Location stage */}
        {stage === "location" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "28px 0" }}>
            <div style={{ position: "relative", width: 64, height: 64, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", width: 64, height: 64, borderRadius: "50%", background: "rgba(74,222,128,0.08)", border: "0.5px solid rgba(74,222,128,0.2)" }} />
              <div style={{ position: "absolute", width: 48, height: 48, borderRadius: "50%", background: "rgba(74,222,128,0.06)", animation: "gps-ping 2s ease-out infinite" }} />
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={1.5} style={{ position: "relative", zIndex: 1 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>Cek Lokasi Absen</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 28, lineHeight: 1.6 }}>
              Pastikan berada dalam radius <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{MAX_DISTANCE_METERS}m</span> dari kantor
            </div>
            <button className="btn-main" style={{ maxWidth: 220 }} onClick={checkLocation}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Cek Lokasi Saya
              </span>
            </button>
            <button className="btn-ghost" style={{ marginTop: 12, color: "rgba(248,113,113,0.5)" }}
              onClick={handleRejectAttendance} disabled={skipping}>
              {skipping ? "Mengalihkan..." : "Lewati absen →"}
            </button>
          </div>
        )}

        {/* Out of range */}
        {stage === "out-of-range" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: "100%", background: "rgba(248,113,113,0.07)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5, marginBottom: 4 }}>JARAK KAMU</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: "#f87171", lineHeight: 1 }}>{currentDistance}<span style={{ fontSize: 14, color: "rgba(248,113,113,0.6)", marginLeft: 4 }}>m</span></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5, marginBottom: 4 }}>BATAS MAKS</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: "rgba(255,255,255,0.3)", lineHeight: 1 }}>{MAX_DISTANCE_METERS}<span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", marginLeft: 4 }}>m</span></div>
                </div>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(((currentDistance ?? 0) / (MAX_DISTANCE_METERS * 2)) * 100, 100)}%`, background: "linear-gradient(90deg,#f87171,#ef4444)", transition: "width 0.5s ease" }} />
              </div>
              <div style={{ fontSize: 10, color: "rgba(248,113,113,0.5)", marginTop: 8 }}>
                Terlalu jauh {currentDistance != null ? `+${currentDistance - MAX_DISTANCE_METERS}m` : ""} dari batas
              </div>
            </div>
            {gpsCoords && (
              <a href={`https://maps.google.com/?q=${gpsCoords.latitude},${gpsCoords.longitude}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: "rgba(96,165,250,0.7)", marginBottom: 20, display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                {gpsCoords.latitude.toFixed(5)}, {gpsCoords.longitude.toFixed(5)}
                <span style={{ color: "rgba(255,255,255,0.2)" }}>±{Math.round(gpsCoords.accuracy)}m</span>
              </a>
            )}
            <button className="btn-ghost" style={{ marginTop: 4 }} onClick={checkLocation}>Coba cek ulang →</button>
            <button className="btn-ghost" style={{ marginTop: 6, color: "rgba(248,113,113,0.5)" }}
              onClick={handleRejectAttendance} disabled={skipping}>
              {skipping ? "Mengalihkan..." : "Lewati absen →"}
            </button>
          </div>
        )}

        {/* Camera view */}
        {showCamera && (
          <>
            {gpsCoords && currentDistance !== null && (
              <div className="gps-info-box">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="gps-ping"><div className="gps-ping-dot" /><div className="gps-ping-ring" /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "rgba(74,222,128,0.9)", fontWeight: 500 }}>{currentDistance}m dari kantor · ±{Math.round(gpsCoords.accuracy)}m</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{gpsCoords.latitude.toFixed(5)}, {gpsCoords.longitude.toFixed(5)}</div>
                  </div>
                  <a href={`https://maps.google.com/?q=${gpsCoords.latitude},${gpsCoords.longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(96,165,250,0.6)", fontSize: 10 }}>maps ↗</a>
                </div>
              </div>
            )}

            {!isProcessing && (
              <div className="tip-box">
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.7 }}>
                  💡 Tips: Pastikan <span style={{ color: "rgba(255,255,255,0.6)" }}>cahaya cukup</span>, wajah <span style={{ color: "rgba(255,255,255,0.6)" }}>menghadap kamera</span>, dan tidak tertutup masker
                </div>
              </div>
            )}

            {attempts > 0 && !isProcessing && (
              <div className="fail-badge">
                <div className="fail-badge-dot" />
                <div className="fail-badge-text">Wajah tidak dikenali — coba lagi</div>
                <div className="fail-badge-count">{attempts}/{MAX_ATTEMPTS}</div>
              </div>
            )}

            <div className="status-chip">
              <div className={`s-dot ${isProcessing ? "s-dot-amber" : faceDetected ? "s-dot-green" : "s-dot-gray"}`} />
              <div style={{ flex: 1, fontSize: 11, color: isProcessing ? "#f59e0b" : faceDetected ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)", letterSpacing: 0.2 }}>
                {isProcessing ? message : faceDetected ? "Wajah terdeteksi — tahan sebentar" : "Arahkan wajah ke oval"}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{attempts}/{MAX_ATTEMPTS}</div>
            </div>

            <div className="cam-box">
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} />
              <div className="cam-grid" /><div className="cam-scanline" />
              <div className="face-oval">
                <div className={`face-oval-ring ${faceDetected ? "on" : "off"}`} />
                <div className="face-oval-spin1" />
                <div className="face-oval-spin2" />
              </div>
              <div className="hud hud-tl"><div>cam·0</div><div className="blink" style={{ color: "rgba(255,255,255,0.45)" }}>● rec</div></div>
              <div className="hud hud-tr"><div>640×480</div><div style={{ color: confColor }}>{confidence}%</div></div>
              <div className="hud hud-bl" style={{ color: confColor, fontSize: 9 }}>{confidence >= AUTO_CAPTURE_CONFIDENCE * 100 ? "conf: lock ✓" : "conf: scan"}</div>
              <div className="hud hud-br">{currentDistance != null ? `📍 ${currentDistance}m` : clockStr}</div>
              <div className="hold-bar-wrap"><div className="hold-bar-fill" style={{ width: `${holdProgress}%`, background: holdProgress > 80 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }} /></div>
              {isProcessing && (<div className="proc-overlay"><div className="spinner" /><div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 0.3 }}>{message}</div></div>)}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 4, letterSpacing: 0.3 }}>
                <span>confidence</span>
                <span style={{ color: confColor }}>{confidence}%{confidence >= AUTO_CAPTURE_CONFIDENCE * 100 ? " — ready ✓" : ""}</span>
              </div>
              <div className="pbar-wrap"><div className="pbar-fill" style={{ width: `${confidence}%`, background: confColor }} /></div>
            </div>

            {holdProgress > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 4, letterSpacing: 0.3 }}>
                  <span>auto-capture</span><span style={{ color: "rgba(255,255,255,0.55)" }}>{holdProgress}%</span>
                </div>
                <div className="pbar-wrap"><div className="pbar-fill" style={{ width: `${holdProgress}%`, background: "rgba(255,255,255,0.45)" }} /></div>
              </div>
            )}

            {attempts >= 3 && !isProcessing && (
              <button className="btn-ghost"
                style={{ width: "100%", textAlign: "center", color: "rgba(248,113,113,0.5)", fontSize: 10 }}
                onClick={async () => {
                  addLog("re-enrollment requested", "warn");
                  await fetch("/api/auth/face-enroll", { method: "PUT" });
                  setAttempts(0);
                  attemptsRef.current = 0;
                  setStage("enroll");
                  setMessage("Daftarkan wajah Anda");
                }}>
                Wajah tidak dikenali? Daftar ulang →
              </button>
            )}
          </>
        )}

        {/* Terminal log */}
        {!["loading", "checking", "out-of-time"].includes(stage) && (
          <div style={{ marginTop: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: 0.5, marginBottom: 5 }}>system log</div>
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

        {/* Footer */}
        {!["loading", "checking", "success", "out-of-time"].includes(stage) && (
          <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button className="btn-ghost" onClick={handleLogout}>Bukan Anda? Ganti akun</button>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", letterSpacing: 0.4 }}>biometric only · wib</div>
          </div>
        )}
      </div>
    </main>
  );
}