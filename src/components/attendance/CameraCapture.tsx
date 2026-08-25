"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Camera, RefreshCw, Loader2 } from "lucide-react";
import { addTimestampWatermark } from "@/lib/watermark";

// Token style lokal — disalin dari dashboard/attendance/overtime/page.tsx
// karena CameraCapture dulu didefinisikan di situ dan token-nya tidak di-export.
const primaryBtn = "flex-1 h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-violet-200";
const secondaryBtn = "flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center justify-center";

function Spinner() {
  return <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

type CameraCaptureProps = {
  onCapture: (file: File, url: string) => void;
  onCancel: () => void;
};

export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  const startCamera = useCallback(async (f: "environment" | "user") => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setReady(false); setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: f, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) { setError(err.name === "NotAllowedError" ? "Izin kamera ditolak." : err.name === "NotFoundError" ? "Kamera tidak ditemukan." : `Gagal: ${err.message}`); }
  }, []);

  useEffect(() => { startCamera(facing); return () => { streamRef.current?.getTracks().forEach(t => t.stop()); }; }, [facing, startCamera]);

  const capture = async () => {
    if (!videoRef.current || !ready) return;
    const v = videoRef.current;
    const c = document.createElement("canvas"); c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
    const ctx = c.getContext("2d"); if (!ctx) return;
    if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    if (facing === "user") ctx.setTransform(1, 0, 0, 1, 0, 0);
    setProcessing(true);
    try {
      const res = await addTimestampWatermark(c, { tag: "SOLIT POS • BUKTI LEMBUR" });
      streamRef.current?.getTracks().forEach(t => t.stop());
      onCapture(res.file, res.dataUrl);
    } catch (err: any) {
      console.error("[WatermarkError]", err);
      setError("Gagal memproses watermark pada foto");
    } finally {
      setProcessing(false);
    }
  };

  const handleGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    try {
      const res = await addTimestampWatermark(file, { tag: "SOLIT POS • BUKTI LEMBUR" });
      streamRef.current?.getTracks().forEach(t => t.stop());
      onCapture(res.file, res.dataUrl);
    } catch (err: any) {
      console.error("[WatermarkError]", err);
      setError("Gagal memproses watermark pada gambar galeri");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-5 text-center space-y-3">
          <p className="text-sm font-bold text-red-700">{error}</p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 transition-all shadow-sm">
            <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Pilih dari Galeri / File
            <input type="file" accept="image/*" className="hidden" onChange={handleGalleryFile} />
          </label>
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-gray-100 shadow-sm">
          <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setReady(true)}
            className={`w-full h-full object-cover transition-opacity duration-300 ${facing === "user" ? "scale-x-[-1]" : ""} ${ready ? "opacity-100" : "opacity-0"}`} />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <button
            type="button"
            onClick={() => setFacing(p => p === "environment" ? "user" : "environment")}
            className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm flex items-center gap-1.5 text-white text-[10px] font-semibold hover:bg-black/80 transition-all border border-white/20"
          >
            <RefreshCw size={12} />
            <span>Putar Kamera</span>
          </button>
        </div>
      )}

      {processing && (
        <div className="flex items-center gap-2.5 bg-violet-50 border border-violet-100 rounded-xl px-3.5 py-2.5">
          <Loader2 className="w-4 h-4 text-violet-600 animate-spin flex-shrink-0" />
          <p className="text-xs text-violet-700 font-medium">Mencetak timestamp (hari, tanggal, jam, menit, detik WIB)...</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="flex-1 h-10 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm">
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Pilih Galeri</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleGalleryFile} />
        </label>

        <button onClick={capture} disabled={!ready || processing || !!error} className={primaryBtn}>
          {processing ? <Spinner /> : <><Camera size={16} /><span>Ambil Foto</span></>}
        </button>

        <button onClick={onCancel} className={secondaryBtn} style={{ flex: "0 0 auto", padding: "0 16px" }}>Batal</button>
      </div>
    </div>
  );
}