"use client";
// src/components/service/ServiceFormModal.tsx

import { useState } from "react";
import { useRegisterOverlay } from "@/contexts/OverlayContext";

interface ServiceFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EMPTY_FORM = {
  nama: "",
  no_hp: "",
  alamat: "",
  type_laptop: "",
  cpu: "",
  ram: "",
  storage: "",
  kelengkapan: "",
  keluhan: "",
  hasil_analisa: "",
};

type FormData = typeof EMPTY_FORM;
type FieldKey = keyof FormData;

const FIELDS: Array<{
  key: FieldKey;
  label: string;
  required?: boolean;
  placeholder?: string;
  type?: "text" | "textarea";
  cols?: number;
}> = [
  // Row 1: pelanggan
  { key: "nama",        label: "Nama Pelanggan",  required: true,  placeholder: "Nama lengkap", cols: 1 },
  { key: "no_hp",       label: "No HP",           required: true,  placeholder: "08xx-xxxx-xxxx", cols: 1 },
  { key: "alamat",      label: "Alamat",           placeholder: "Alamat pelanggan", cols: 2 },
  // Row 2: laptop
  { key: "type_laptop", label: "Type Laptop",      required: true,  placeholder: "cth: Lenovo ThinkPad X1", cols: 1 },
  { key: "cpu",         label: "CPU / Processor",  placeholder: "cth: Intel Core i5-1135G7", cols: 1 },
  { key: "ram",         label: "RAM",              placeholder: "cth: 8GB DDR4", cols: 1 },
  { key: "storage",     label: "Storage",          placeholder: "cth: 256GB SSD", cols: 1 },
  { key: "kelengkapan", label: "Kelengkapan",      placeholder: "cth: Charger, tas, mouse", cols: 2 },
  // Row 3: keluhan
  { key: "keluhan",      label: "Keluhan",          required: true, type: "textarea", placeholder: "Deskripsikan keluhan pelanggan secara detail", cols: 2 },
  { key: "hasil_analisa", label: "Diagnosa Sementara",  type: "textarea", placeholder: "Opsional — bisa diisi teknisi nanti", cols: 2 },
];

export default function ServiceFormModal({ open, onClose, onSuccess }: ServiceFormModalProps) {
  useRegisterOverlay(open);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: preview / konfirmasi
  const [step, setStep] = useState<"form" | "confirm">("form");

  if (!open) return null;

  const handleChange = (key: FieldKey, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError("");
  };

  const handleNext = () => {
    // Validasi
    if (!form.nama.trim() || !form.no_hp.trim() || !form.type_laptop.trim() || !form.keluhan.trim()) {
      setError("Nama, No HP, Type Laptop, dan Keluhan wajib diisi.");
      return;
    }
    setStep("confirm");
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setForm(EMPTY_FORM);
      setStep("form");
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan formulir");
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setForm(EMPTY_FORM);
    setStep("form");
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-[#1a1a2e]">
              {step === "form" ? "Buat Formulir Servis" : "Konfirmasi Formulir"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === "form"
                ? "Isi data pelanggan dan laptop yang akan diservis"
                : "Periksa kembali data sebelum menyimpan"}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-3 flex items-center gap-2">
          <div className={`h-1.5 w-16 rounded-full transition-colors ${step === "form" ? "bg-[#1a1a2e]" : "bg-[#1a1a2e]"}`} />
          <div className={`h-1.5 w-16 rounded-full transition-colors ${step === "confirm" ? "bg-[#1a1a2e]" : "bg-gray-200"}`} />
          <span className="text-xs text-gray-400 ml-1">
            {step === "form" ? "Langkah 1: Isi data" : "Langkah 2: Konfirmasi"}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "form" ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Sections */}
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Data Pelanggan
                </p>
              </div>
              {FIELDS.filter(f => ["nama","no_hp","alamat"].includes(f.key)).map(f => (
                <div key={f.key} className={f.cols === 2 ? "col-span-2" : "col-span-1"}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {f.label}
                    {f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="text"
                    value={form[f.key]}
                    onChange={e => handleChange(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition placeholder:text-gray-300"
                  />
                </div>
              ))}

              <div className="col-span-2 pt-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Data Laptop
                </p>
              </div>
              {FIELDS.filter(f => ["type_laptop","cpu","ram","storage","kelengkapan"].includes(f.key)).map(f => (
                <div key={f.key} className={f.cols === 2 ? "col-span-2" : "col-span-1"}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {f.label}
                    {f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="text"
                    value={form[f.key]}
                    onChange={e => handleChange(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition placeholder:text-gray-300"
                  />
                </div>
              ))}

              <div className="col-span-2 pt-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Keluhan & Analisa
                </p>
              </div>
              {FIELDS.filter(f => ["keluhan","hasil_analisa"].includes(f.key)).map(f => (
                <div key={f.key} className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {f.label}
                    {f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <textarea
                    value={form[f.key]}
                    onChange={e => handleChange(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition placeholder:text-gray-300 resize-none"
                  />
                </div>
              ))}
            </div>
          ) : (
            /* STEP 2: Konfirmasi */
            <div className="space-y-5">
              <ConfirmSection title="Data Pelanggan" rows={[
                { label: "Nama", value: form.nama },
                { label: "No HP", value: form.no_hp },
                { label: "Alamat", value: form.alamat || "—" },
              ]} />
              <ConfirmSection title="Data Laptop" rows={[
                { label: "Type Laptop", value: form.type_laptop },
                { label: "CPU", value: form.cpu || "—" },
                { label: "RAM", value: form.ram || "—" },
                { label: "Storage", value: form.storage || "—" },
                { label: "Kelengkapan", value: form.kelengkapan || "—" },
              ]} />
              <ConfirmSection title="Keluhan & Analisa" rows={[
                { label: "Keluhan", value: form.keluhan },
                { label: "Diagnosa Sementara", value: form.hasil_analisa || "—" },
              ]} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            onClick={step === "form" ? handleClose : () => setStep("form")}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-xl transition"
          >
            {step === "form" ? "Batal" : "← Kembali Edit"}
          </button>

          {step === "form" ? (
            <button
              onClick={handleNext}
              className="px-5 py-2 bg-[#1a1a2e] text-white text-sm font-semibold rounded-xl hover:bg-[#2d2d4a] transition"
            >
              Lanjut Konfirmasi →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition disabled:opacity-60 flex items-center gap-2"
            >
              {loading && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              )}
              {loading ? "Menyimpan..." : " Simpan Formulir"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ConfirmSection helper ─────────────────────────────────────────────────────
function ConfirmSection({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
        {title}
      </p>
      <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`flex gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}
          >
            <span className="text-xs text-gray-500 w-32 flex-shrink-0 font-medium pt-0.5">
              {r.label}
            </span>
            <span className="text-sm text-gray-800 whitespace-pre-wrap break-words min-w-0">
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}