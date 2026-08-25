"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { OVERTIME_CATEGORIES, OVERTIME_CATEGORY_LABELS, type OvertimeCategory, formatOvertimeMinutes } from "@/lib/overtimeEngine";
import { CameraCapture } from "@/components/attendance/CameraCapture";

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
  // ✅ NEW — foto bukti sekarang wajib diisi DI SINI (sebelum di-ACC atasan),
  // bukan lagi setelah ACC seperti alur lama.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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
    // ✅ NEW — foto bukti wajib ada sebelum bisa dikirim ke kepala divisi.
    if (!photoFile) { setError("Foto bukti lembur wajib diupload sebelum bisa dikirim ke atasan."); return; }
    setSaving(true); setError("");
    try {
      // ✅ NEW — upload foto dulu ke storage, baru kirim url-nya bareng
      // kategori+keterangan lewat SUBMIT_DETAIL.
      const fd = new FormData();
      fd.append("file", photoFile);
      const uploadRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd });
      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.json().catch(() => ({}));
        throw new Error(uploadErr.message || "Gagal upload foto bukti");
      }
      const { url: proofPhotoUrl } = await uploadRes.json();

      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtimeId,
          action: "SUBMIT_DETAIL",
          category,
          work_description: description.trim(),
          proof_photo_url: proofPhotoUrl,
        }),
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
        <div className="px-5 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">{error}</div>}
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
          {/* ✅ NEW — foto bukti wajib diisi di sini (sebelum ACC atasan) */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Foto Bukti Lemburan *</label>
            {photoStep === "preview" && photoPreview ? (
              <div>
                <img src={photoPreview} alt="Preview bukti lembur" className="w-full h-40 object-cover rounded-xl border border-gray-100 mb-2" />
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoStep("idle"); }} className="text-[10px] font-semibold text-gray-400 hover:text-gray-700 transition-colors">
                  ↺ Ambil Ulang
                </button>
              </div>
            ) : photoStep === "camera" ? (
              <CameraCapture
                onCapture={(f, url) => { setPhotoFile(f); setPhotoPreview(url); setPhotoStep("preview"); setError(""); }}
                onCancel={() => setPhotoStep("idle")}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPhotoStep("camera")}
                className="w-full flex items-center justify-center gap-2.5 border-2 border-dashed border-orange-300 bg-orange-50/40 rounded-xl p-5 hover:border-orange-400 hover:bg-orange-50/70 transition-all"
              >
                <Camera size={20} className="text-orange-500" />
                <span className="text-xs font-semibold text-orange-700">Wajib ambil foto bukti lembur</span>
              </button>
            )}
          </div>
        </div>
        {photoStep !== "camera" && (
          <div className="px-5 py-4 border-t border-gray-100 flex gap-2.5">
            <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold">Nanti Saja</button>
            <button onClick={save} disabled={saving || !photoFile} className="flex-1 h-10 bg-violet-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
              {saving ? "Menyimpan..." : "Kirim ke Kepala Divisi"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}