"use client";

import { useState } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { CameraCapture } from "@/components/attendance/CameraCapture";
import { OVERTIME_CATEGORIES, OVERTIME_CATEGORY_LABELS, type OvertimeCategory, formatOvertimeMinutes } from "@/lib/overtimeEngine";

export function OvertimeFillDetailModal({
  overtimeId, minutes, direction, onClose, onSaved,
}: {
  overtimeId: string;
  minutes: number;
  direction: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<OvertimeCategory | "">("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // ✅ CHANGED: `processing` + `handleFileSelected` (upload dari file/galeri)
  // dihapus — foto sekarang diambil realtime lewat <CameraCapture>, yang
  // sudah nanganin watermark+compress sendiri sebelum onCapture dipanggil.
  const [photoStep, setPhotoStep] = useState<"idle" | "camera" | "preview">("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const directionLabel =
    direction === "BEFORE_IN" ? "sebelum jam masuk" :
    direction === "AFTER_OUT" ? "sesudah jam pulang" :
    direction === "HOLIDAY" ? "lembur hari libur" : "lembur";

  const save = async () => {
    if (!category) { setError("Pilih kategori lembur — wajib salah satu dari 3 pilihan SOP."); return; }
    if (!description.trim()) { setError("Keterangan wajib diisi."); return; }
    if (!file) { setError("Bukti foto lembur wajib dilampirkan."); return; }

    setSaving(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const upRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd });
      const upData = await upRes.json();
      if (!upData.success) { setError(upData.message || "Upload foto gagal"); setSaving(false); return; }

      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtimeId, action: "SUBMIT_DETAIL", category, work_description: description.trim(), proof_photo_url: upData.url }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan — periksa koneksi internet.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-5 bg-gradient-to-r from-violet-600 to-purple-700">
          <p className="text-white font-bold text-sm">Lemburmu Terdeteksi</p>
          <p className="text-white/70 text-xs mt-1">
            {formatOvertimeMinutes(minutes)} — {directionLabel}. Isi keterangan supaya kepala divisimu bisa meng-ACC.
          </p>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">{error}</div>}
          
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Bukti Foto Lembur (wajib) *</label>
            {/* ✅ CHANGED: opsi "Galeri" dihapus total — cuma kamera
                realtime (live preview) lewat <CameraCapture>. */}
            {photoStep === "camera" ? (
              <CameraCapture
                onCapture={(f, url) => { setFile(f); setPreview(url); setPhotoStep("preview"); setError(""); }}
                onCancel={() => setPhotoStep("idle")}
              />
            ) : photoStep === "preview" && preview ? (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-black aspect-video max-h-40 flex items-center justify-center">
                  <img src={preview} alt="preview bukti" className="w-full h-full object-contain" />
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoStep("camera")}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-700 py-1"
                >
                  <RefreshCw size={13} />
                  <span>Ambil Ulang Foto</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPhotoStep("camera")}
                className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-violet-400 hover:bg-violet-50/30 transition-all text-center group"
              >
                <div className="w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Camera size={16} />
                </div>
                <span className="text-[11px] font-bold text-gray-700">Buka Kamera</span>
              </button>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Kategori Lembur (wajib) *</label>
            <div className="grid grid-cols-1 gap-2">
              {OVERTIME_CATEGORIES.map((cat) => (
                <button key={cat} type="button" onClick={() => setCategory(cat)}
                  className={`text-left px-3.5 py-3 rounded-xl border text-xs font-semibold transition-all ${category === cat ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-violet-300"}`}>
                  {OVERTIME_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Keterangan Pekerjaan *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Jelaskan pekerjaan yang dilakukan selama lembur..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none" />
          </div>
        </div>
        {photoStep !== "camera" && (
          <div className="px-5 py-4 border-t border-gray-100 flex gap-2.5">
            <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold">Nanti Saja</button>
            <button onClick={save} disabled={saving} className="flex-1 h-10 bg-violet-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
              {saving ? "Menyimpan..." : "Kirim ke Kepala Divisi"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}