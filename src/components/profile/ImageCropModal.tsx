"use client";

import { useCallback, useState } from "react";
import Cropper, { Area, Point } from "react-easy-crop";
import { Check, Loader2, X, ZoomIn } from "lucide-react";

interface ImageCropModalProps {
    src: string;
    aspect: number;
    shape?: "round" | "rect";
    title: string;
    saving: boolean;
    onCancel: () => void;
    onConfirm: (blob: Blob) => void;
}

function getCroppedBlob(imageSrc: string, cropPixels: Area): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = cropPixels.width;
            canvas.height = cropPixels.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) { reject(new Error("Canvas context tidak tersedia")); return; }

            ctx.drawImage(
                img,
                cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
                0, 0, cropPixels.width, cropPixels.height
            );

            canvas.toBlob((blob) => {
                if (blob) resolve(blob); else reject(new Error("Gagal membuat blob dari canvas"));
            }, "image/jpeg", 0.92);
        };
        img.onerror = () => reject(new Error("Gagal memuat gambar"));
        img.src = imageSrc;
    });
}

export default function ImageCropModal({ src, aspect, shape = "rect", title, saving, onCancel, onConfirm }: ImageCropModalProps) {
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [processing, setProcessing] = useState(false);

    const aspectLabel = aspect === 1 ? "1:1" : `${aspect}:1`;

    const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixelsValue: Area) => {
        setCroppedAreaPixels(croppedAreaPixelsValue);
    }, []);

    const handleConfirm = async () => {
        if (!croppedAreaPixels) return;
        setProcessing(true);
        try {
            const blob = await getCroppedBlob(src, croppedAreaPixels);
            onConfirm(blob);
        } catch {
            setProcessing(false);
        }
    };

    const busy = saving || processing;

    return (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: "blur(6px)" }} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="h-1" style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6, #1db954)" }} />

                <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-3">
                    <div className="min-w-0">
                        <h3 className="font-black text-slate-800 text-sm sm:text-base truncate">{title}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Geser & perbesar untuk atur posisi terbaik</p>
                    </div>
                    <button onClick={onCancel} disabled={busy}
                        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 flex-shrink-0 ml-2">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>

                <div className="relative w-full" style={{
                    height: 320,
                    background: "radial-gradient(140% 100% at 12% -20%, rgba(139,92,246,0.30), transparent 60%), radial-gradient(120% 100% at 100% 0%, rgba(29,185,84,0.16), transparent 55%), linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)",
                }}>
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        aspect={aspect}
                        cropShape={shape}
                        showGrid={shape !== "round"}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                    />
                </div>

                <div className="px-5 sm:px-6 pt-4 pb-1 flex items-center gap-3">
                    <ZoomIn className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-full accent-violet-600"
                    />
                    <span className="text-[10.5px] font-semibold text-slate-400 flex-shrink-0 w-10 text-right">{aspectLabel}</span>
                </div>

                <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-3 flex gap-2.5">
                    <button onClick={onCancel} disabled={busy}
                        className="flex-1 h-10 rounded-xl text-sm font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        style={{ background: "#f1f5f9", color: "#64748b" }}>
                        Batal
                    </button>
                    <button onClick={handleConfirm} disabled={busy || !croppedAreaPixels}
                        className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                        style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Simpan</>}
                    </button>
                </div>
            </div>
        </div>
    );
}