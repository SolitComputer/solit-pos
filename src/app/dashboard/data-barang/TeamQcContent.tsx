// app/dashboard/data-barang/TeamQcContent.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Search, X, CheckCircle2, AlertTriangle, Clock, Laptop as LaptopIcon,
  ChevronRight, Ban, ScanLine,
} from "lucide-react";
import MinusReasonModal from "@/components/inventory/MinusReasonModal";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import SuggestFolderModal from "@/components/inventory/SuggestFolderModal";

interface QcUnit {
  id: string;
  laptop_id: string | null; // ⬅️ Step 4: null = SN Lepas
  serial_number: string | null;
  grade: string | null;
  source: string | null;
  condition_note: string | null;
  purchase_price: number | null;
  sparepart_cost: number | null;
  selling_price: number | null;
  official_price: number | null;
  qc_status: string;
  status: string;
  created_at: string;
  missing_fields: string[];
  is_sn_lepas: boolean; // ⬅️ Step 4: convenience flag dari backend
  laptop: {
    id: string | null; // ⬅️ Step 4: null kalau SN Lepas (effective laptop fallback)
    laptop_name: string | null;
    brand: string | null;
    cpu: string | null;
    ram: string | null;
    storage: string | null;
    gpu?: string | null;
    display?: string | null;
    selling_price?: number | null;
  };
}

const fmt = (n: number | null) => n == null ? "—" : "Rp " + n.toLocaleString("id-ID");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

// ✅ Markup tetap: Harga Official = Harga Setor + markup ini. Sama persis
// dengan OFFICIAL_PRICE_MARKUP di Data Barang/InventoryTable biar konsisten.
const OFFICIAL_PRICE_MARKUP = 300_000;

// ─── Reusable Input Field ──────────────────────────────────────────────
// WAJIB di module level (BUKAN di dalam QcEditModal) supaya identity-nya
// stable antar re-render. Dulu di-define inside modal → tiap ketik 1 huruf,
// Input jadi fungsi baru → React unmount & remount → focus hilang → user
// harus klik ulang tiap huruf. Extract ke sini = focus ketahanan 100%.
type FormShape = {
  serial_number: string; grade: string; source: string; condition_note: string;
  purchase_price: string; sparepart_cost: string; selling_price: string; official_price: string;
  brand: string; cpu: string; ram: string; storage: string; laptop_name: string;
};
function QcInputField({
  label, name, type = "text", required = false, form, setForm, readOnly = false, hint,
  autocompleteField,
}: {
  label: string;
  name: keyof FormShape;
  type?: string;
  required?: boolean;
  form: FormShape;
  setForm: React.Dispatch<React.SetStateAction<FormShape>>;
  readOnly?: boolean;   // ⬅️ BARU: field auto, tidak bisa diketik manual
  hint?: string;        // ⬅️ BARU: teks kecil di bawah input
  // ⬅️ BARU: kalau diisi, input pakai AutocompleteInput yang narik saran dari
  // /api/suggestions?field=<autocompleteField>. Dipakai di field teks yang
  // sering berulang (source, brand, cpu, ram, storage, laptop_name,
  // condition_note). Field angka & readOnly tidak pakai autocomplete.
  autocompleteField?: string;
}) {
  const isEmpty = form[name].trim() === "";
  const inputCls = `w-full h-10 border rounded-xl px-3 text-sm transition focus:outline-none ${
    readOnly
      ? "bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed"
      : `bg-gray-50 focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 focus:bg-white ${
          isEmpty && required ? "border-amber-300 bg-amber-50/30" : "border-gray-200"
        }`
  }`;

  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {autocompleteField && !readOnly ? (
        <AutocompleteInput
          field={autocompleteField}
          name={name}
          value={form[name]}
          onChange={(v) => setForm(f => ({ ...f, [name]: v }))}
          className={inputCls}
        />
      ) : (
        <input
          type={type}
          value={form[name]}
          readOnly={readOnly}
          onChange={(e) => { if (!readOnly) setForm(f => ({ ...f, [name]: e.target.value })); }}
          className={inputCls}
        />
      )}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Edit Modal ────────────────────────────────────────────────────────
function QcEditModal({
  unit, onClose, onSaved,
}: {
  unit: QcUnit;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Form state — pre-fill dari unit existing
  const [form, setForm] = useState({
    serial_number: unit.serial_number ?? "",
    grade: unit.grade ?? "",
    source: unit.source ?? "",
    condition_note: unit.condition_note ?? "",
    purchase_price: unit.purchase_price?.toString() ?? "",
    sparepart_cost: unit.sparepart_cost?.toString() ?? "",
    selling_price: unit.selling_price?.toString() ?? "",
    official_price: unit.official_price?.toString() ?? "",
    brand: unit.laptop.brand ?? "",
    cpu: unit.laptop.cpu ?? "",
    ram: unit.laptop.ram ?? "",
    storage: unit.laptop.storage ?? "",
    laptop_name: unit.laptop.laptop_name ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [markingMinus, setMarkingMinus] = useState(false);
  // State untuk buka MinusReasonModal (ganti window.prompt yang jelek UX-nya)
  const [showMinusReason, setShowMinusReason] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const parseNumber = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
  };

  // ✅ Harga Official OTOMATIS = Harga Setor + markup tetap (Rp 300.000).
  //  Begitu Team QC isi/ubah Harga Setor, Harga Official langsung ikut
  //  (field-nya read-only). Jalan juga saat modal dibuka — kalau data lama
  //  official-nya beda, otomatis dinormalkan. Dijaga agar tidak loop:
  //  hanya set-state kalau nilainya memang beda.
  useEffect(() => {
    const setor = parseNumber(form.selling_price);
    const official = setor != null ? String(setor + OFFICIAL_PRICE_MARKUP) : "";
    setForm(f => (f.official_price === official ? f : { ...f, official_price: official }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.selling_price]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates = {
        serial_number: form.serial_number.trim() || null,
        grade: form.grade.trim() || null,
        source: form.source.trim() || null,
        condition_note: form.condition_note.trim() || null,
        purchase_price: parseNumber(form.purchase_price),
        sparepart_cost: parseNumber(form.sparepart_cost),
        selling_price: parseNumber(form.selling_price),
        official_price: parseNumber(form.official_price),
        brand: form.brand.trim() || null,
        cpu: form.cpu.trim() || null,
        ram: form.ram.trim() || null,
        storage: form.storage.trim() || null,
        laptop_name: form.laptop_name.trim() || null,
      };

      const res = await fetch("/api/laptops/qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: unit.id, updates }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal menyimpan"); return; }

      // ⬅️ Step 4: was_ejected = user ubah 5 field pengunci folder → unit keluar
      if (json.was_ejected) {
        toast.warning("⚠️ Unit ter-eject dari folder — jadi SN Lepas karena ada perubahan field pengunci (nama/spek/harga jual/grade).", { duration: 6000 });
      }

      if (json.is_complete) {
        // ⬅️ Step 4: Q3 A — SN Lepas lulus QC + ada folder match → tampilin suggest
        if (json.suggest_folders && json.suggest_folders.length > 0) {
          toast.success(`✅ SIAP JUAL — ditemukan ${json.suggest_folders.length} folder yang cocok, cek modal pilih folder.`, { duration: 7000 });
          // Simpan suggest_folders ke state parent untuk munculin modal
          // (dihandle di TeamQcContent — lihat onSaved callback)
          (window as any).__qcSuggestFolders = {
            unit_id: unit.id,
            unit_name: form.laptop_name || unit.serial_number,
            folders: json.suggest_folders,
          };
        } else {
          toast.success("Semua kriteria lengkap — unit otomatis naik ke SIAP JUAL");
        }
      } else {
        toast.success(`Disimpan — masih ${json.missing_fields.length} field kosong`);
      }
      onSaved();
    } finally { setSaving(false); }
  };

  // Dipanggil oleh MinusReasonModal setelah user isi alasan & klik konfirmasi.
  // Reason WAJIB (modal sudah validasi min 5 char) — jadi tidak perlu re-check di sini.
  // Alasan ini jadi analisa awal di Pengelola Barang (QcDecisionModal).
  const handleMarkMinus = async (reason: string) => {
    setMarkingMinus(true);
    try {
      const res = await fetch("/api/laptops/qc/mark-minus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: unit.id, reason }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Gagal");
        return;
      }
      toast.success("Unit ditandai MINUS — dilempar ke Pengelola Barang");
      setShowMinusReason(false);
      onSaved();
    } finally {
      setMarkingMinus(false);
    }
  };

  // Input helper sudah dipindah ke module level (QcInputField) — lihat atas file.
  // Jangan define component di dalam modal: re-render bikin focus hilang.

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div>
            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">
              QC — {unit.is_sn_lepas ? "🆓 SN Lepas" : "📦 Dalam Folder"}
            </p>
            <h2 className="text-white font-bold text-base mt-0.5 truncate">{unit.laptop.laptop_name || unit.serial_number || "Laptop"}</h2>
            <p className="text-xs text-white/60 mt-0.5">
              <span className="font-mono">{unit.serial_number || "— tanpa SN —"}</span>
              {" · "}{unit.missing_fields.length} field kosong
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:bg-white/15">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
          {/* Info Section — info aturan QC terbaru (2026-11-19) */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-indigo-700 leading-relaxed">
              Isi field dengan tanda <span className="text-red-500 font-bold">*</span> untuk lolos QC. <span className="font-bold">Biaya Sparepart</span> & <span className="font-bold">Kondisi & Catatan</span> OPSIONAL — kosong tetap boleh lolos.
              Nilai <span className="font-mono bg-white px-1.5 py-0.5 rounded">0</span> dianggap terisi.
            </p>
          </div>

          {/* ⬅️ Step 4: Warning khusus folder isi — edit 5 field pengunci = eject */}
          {!unit.is_sn_lepas && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <b>⚠️ Unit ini dalam folder isi.</b> Kalau kamu ubah <b>Nama, CPU, RAM, Storage, GPU, Display, Harga Setor, atau Grade</b>, unit otomatis <b>keluar dari folder</b> jadi SN Lepas (biar folder tetap konsisten).
              </p>
            </div>
          )}
          {/* ⬅️ Step 4: Info SN Lepas */}
          {unit.is_sn_lepas && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-sky-800 leading-relaxed">
                <b>🆓 SN Lepas (tanpa folder).</b> Isi semua field dengan bebas. Setelah lulus QC, sistem otomatis cari folder yang cocok — kamu bisa pilih masukin ke folder atau tetap lepas.
              </p>
            </div>
          )}

          {/* ── Model Fields ── */}
          <div>
            <h3 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2">
              <LaptopIcon size={14} /> Spesifikasi Model
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Field teks yang sering berulang dapat autocomplete dari /api/suggestions. */}
              <QcInputField label="Nama Laptop" name="laptop_name" required autocompleteField="laptop_name" form={form} setForm={setForm} />
              <QcInputField label="Brand" name="brand" required autocompleteField="brand" form={form} setForm={setForm} />
              <QcInputField label="CPU" name="cpu" required autocompleteField="cpu" form={form} setForm={setForm} />
              <QcInputField label="RAM" name="ram" required autocompleteField="ram" form={form} setForm={setForm} />
              <QcInputField label="Storage" name="storage" required autocompleteField="storage" form={form} setForm={setForm} />
            </div>
          </div>

          {/* ── Unit Fields ── */}
          <div>
            <h3 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle2 size={14} /> Data Unit (per SN)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Serial Number: tidak pakai autocomplete — SN harus unik. */}
              <QcInputField label="Serial Number" name="serial_number" required form={form} setForm={setForm} />
              <QcInputField label="Grade (A/B/C)" name="grade" required autocompleteField="grade" form={form} setForm={setForm} />
              <QcInputField label="Sumber" name="source" required autocompleteField="source" form={form} setForm={setForm} />
              <QcInputField label="Harga Modal (Rp)" name="purchase_price" type="number" required form={form} setForm={setForm} />
              {/* Biaya Sparepart: OPSIONAL per 2026-11-19 — unit mulus boleh kosong. */}
              <QcInputField label="Biaya Sparepart (Rp)" name="sparepart_cost" type="number" form={form} setForm={setForm} />
              <QcInputField label="Harga Setor (Rp)" name="selling_price" type="number" required form={form} setForm={setForm} />
                          <QcInputField label="Harga Official (Rp)" name="official_price" type="number" required readOnly hint="Otomatis: Harga Setor + Rp 300.000" form={form} setForm={setForm} />
              <div className="md:col-span-2">
                {/* Kondisi & Catatan: OPSIONAL per 2026-11-19 — gak semua unit butuh catatan. */}
                <QcInputField label="Kondisi & Catatan" name="condition_note" autocompleteField="condition_note" form={form} setForm={setForm} />
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0 bg-white">
          <button
            type="button"
            onClick={() => setShowMinusReason(true)}
            disabled={markingMinus || saving}
            className="h-10 px-4 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold hover:bg-red-100 transition disabled:opacity-40 flex items-center gap-1.5"
          >
            <Ban size={14} /> {markingMinus ? "Memproses..." : "Tandai MINUS"}
          </button>
          <div className="flex-1" />
          <button onClick={onClose} disabled={saving}
            className="h-10 px-4 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition">
            Batal
          </button>
          <button onClick={handleSubmit as any} disabled={saving || markingMinus}
            className="h-10 px-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-xs font-semibold hover:from-indigo-700 hover:to-indigo-800 transition disabled:opacity-40 flex items-center gap-2">
            {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Simpan & Cek Kelengkapan
          </button>
        </div>
      </div>

      {/* Modal alasan MINUS — muncul di atas QcEditModal (z-60 vs z-50).
          Submit di sini langsung call handleMarkMinus dengan reason wajib. */}
      {showMinusReason && (
        <MinusReasonModal
          unit={{
            id: unit.id,
            name: unit.laptop.laptop_name || "Laptop tanpa nama",
            sn: unit.serial_number,
          }}
          onClose={() => setShowMinusReason(false)}
          onConfirm={handleMarkMinus}
        />
      )}
    </div>
  );
}

// ─── Type untuk Scan Preview (Fitur 2) ─────────────────────────────────
interface ScanPreview {
  total: number;
  already_needs_qc: number;
  will_drop_from_siap_jual: number;
  preview: {
    id: string;
    serial_number: string | null;
    laptop_name: string | null;
    qc_status: string;
    status: string;
    missing_fields: string[];
  }[];
}

// ─── Main Content ──────────────────────────────────────────────────────
export default function TeamQcContent() {
  const [units, setUnits] = useState<QcUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<QcUnit | null>(null);

  // ⬅️ Step 4 Q3 A: state untuk modal suggest folder setelah QC lulus
  const [suggestFolderData, setSuggestFolderData] = useState<{
    unit_id: string; unit_name: string; folders: any[];
  } | null>(null);

  // ── Scan Data Lama (Fitur 2) ──────────────────────────────────────────
  const [scanPreview, setScanPreview] = useState<ScanPreview | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanExecuting, setScanExecuting] = useState(false);

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/laptops/qc");
      const json = await res.json();
      if (json.success) setUnits(json.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // Handler: buka modal + fetch preview (dry-run)
  const openScanModal = useCallback(async () => {
    setScanLoading(true);
    setScanPreview({ total: 0, already_needs_qc: 0, will_drop_from_siap_jual: 0, preview: [] });
    try {
      const res = await fetch("/api/laptops/qc/scan-flag-incomplete");
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Gagal memuat preview scan");
        setScanPreview(null);
        return;
      }
      setScanPreview(json.data);
    } catch {
      toast.error("Gagal koneksi ke server");
      setScanPreview(null);
    } finally {
      setScanLoading(false);
    }
  }, []);

  // Handler: execute scan + flag unit ke NEEDS_QC
  const executeScan = useCallback(async () => {
    setScanExecuting(true);
    try {
      const res = await fetch("/api/laptops/qc/scan-flag-incomplete", { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Gagal menjalankan scan");
        return;
      }
      toast.success(json.message);
      setScanPreview(null);
      fetchUnits(); // refresh list Team QC
    } catch {
      toast.error("Gagal koneksi ke server");
    } finally {
      setScanExecuting(false);
    }
  }, [fetchUnits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter(u =>
      u.laptop.laptop_name?.toLowerCase().includes(q) ||
      u.serial_number?.toLowerCase().includes(q) ||
      u.laptop.brand?.toLowerCase().includes(q)
    );
  }, [units, search]);

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-full mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-md">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-800">Team QC — Perlu Pengecekan</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? "Memuat..." : `${units.length} unit menunggu QC`}
            </p>
          </div>
          {/* Fitur 2: tombol Scan Data Lama — flag unit yg field wajibnya kosong */}
          <button
            onClick={openScanModal}
            disabled={scanLoading || scanExecuting}
            title="Scan semua unit laptop + flag yg field wajibnya kurang → masuk antrian QC"
            className="h-10 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition disabled:opacity-40 flex items-center gap-2 whitespace-nowrap"
          >
            <ScanLine className="w-4 h-4" />
            <span className="hidden sm:inline">Scan Data Lama</span>
            <span className="sm:hidden">Scan</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama, SN, atau brand..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-10 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
            <CheckCircle2 className="w-14 h-14 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-700 font-bold text-base">Tidak ada unit perlu QC</p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? "Coba hapus pencarian" : "Semua unit sudah ter-QC atau ditandai minus"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(u => (
              <button
                key={u.id}
                onClick={() => setEditTarget(u)}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all p-4 flex items-start gap-3 text-left group"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${u.is_sn_lepas ? "bg-sky-50 border-sky-200" : "bg-amber-50 border-amber-100"}`}>
                  {u.is_sn_lepas ? <span className="text-sky-600 text-base">🆓</span> : <Clock className="w-4 h-4 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-bold text-gray-800 truncate">{u.laptop.laptop_name || u.serial_number || "Tanpa Nama"}</p>
                    <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {u.serial_number || "no-SN"}
                    </span>
                    {u.is_sn_lepas && (
                      <span className="text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-300 px-1.5 py-0.5 rounded">LEPAS</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mb-2">
                    {[u.laptop.brand, u.laptop.cpu, u.laptop.ram, u.laptop.storage].filter(Boolean).join(" · ") || "Belum ada spek"}
                    {" · masuk "}{fmtDate(u.created_at)}
                  </p>
                  {u.missing_fields.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        {u.missing_fields.length} field kosong:
                      </span>
                      {u.missing_fields.slice(0, 4).map(f => (
                        <span key={f} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          {f}
                        </span>
                      ))}
                      {u.missing_fields.length > 4 && (
                        <span className="text-[10px] text-amber-600">+{u.missing_fields.length - 4} lainnya</span>
                      )}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-2 group-hover:text-indigo-500 transition" />
              </button>
            ))}
          </div>
        )}
      </div>

      {editTarget && (
        <QcEditModal
          unit={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            fetchUnits();
            // ⬅️ Step 4 Q3 A: cek kalau QcEditModal set suggest_folders di window global
            const suggest = (window as any).__qcSuggestFolders;
            if (suggest) {
              setSuggestFolderData(suggest);
              (window as any).__qcSuggestFolders = null;
            }
          }}
        />
      )}

      {/* ⬅️ Step 4 Q3 A: Modal suggest folder match setelah QC lulus */}
      {suggestFolderData && (
        <SuggestFolderModal
          unitId={suggestFolderData.unit_id}
          unitName={suggestFolderData.unit_name}
          folders={suggestFolderData.folders}
          onClose={() => setSuggestFolderData(null)}
          onMoved={() => {
            setSuggestFolderData(null);
            fetchUnits();
          }}
        />
      )}

      {/* ── MODAL: Scan Data Lama (Fitur 2) ─────────────────────────── */}
      {scanPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={() => !scanExecuting && setScanPreview(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col animate-popIn">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-indigo-800 flex-shrink-0" />
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-white" />
                <p className="font-bold text-white text-sm">Scan Data Lama — Preview</p>
              </div>
              <p className="text-xs text-white/70 mt-0.5">Pakai aturan 10 field wajib (sparepart & catatan sudah opsional)</p>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {scanLoading ? (
                <div className="py-10 text-center">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-gray-400 mt-3">Memuat preview…</p>
                </div>
              ) : scanPreview.total === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-gray-800">Semua Data Sudah Lengkap</p>
                  <p className="text-xs text-gray-500 mt-1">Nggak ada unit yang perlu di-flag. Mantap!</p>
                </div>
              ) : (
                <>
                  {/* Statistik */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Total</p>
                      <p className="text-xl font-black text-indigo-700 tabular-nums mt-1">{scanPreview.total}</p>
                      <p className="text-[10px] text-indigo-500 mt-0.5">unit kena flag</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Sudah QC</p>
                      <p className="text-xl font-black text-amber-700 tabular-nums mt-1">{scanPreview.already_needs_qc}</p>
                      <p className="text-[10px] text-amber-500 mt-0.5">tetap NEEDS_QC</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Turun</p>
                      <p className="text-xl font-black text-red-700 tabular-nums mt-1">{scanPreview.will_drop_from_siap_jual}</p>
                      <p className="text-[10px] text-red-500 mt-0.5">dari SIAP_JUAL</p>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 leading-relaxed">
                      <p className="font-semibold mb-1">Yang terjadi kalau di-eksekusi:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        <li>Semua {scanPreview.total} unit → status <code className="bg-white px-1 rounded">BELUM_SIAP</code> + <code className="bg-white px-1 rounded">NEEDS_QC</code></li>
                        {scanPreview.will_drop_from_siap_jual > 0 && (
                          <li><b>{scanPreview.will_drop_from_siap_jual} unit</b> yg sekarang SIAP_JUAL → <b>turun</b> ke BELUM_SIAP sampai field lengkap</li>
                        )}
                        <li>Unit TERJUAL/RESERVED/dll <b>aman, nggak kena flag</b></li>
                      </ul>
                    </div>
                  </div>

                  {/* Preview sample */}
                  {scanPreview.preview.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Preview {scanPreview.preview.length} unit {scanPreview.total > 50 ? `(dari total ${scanPreview.total})` : ""}
                      </p>
                      <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                        {scanPreview.preview.map((u) => (
                          <div key={u.id} className="px-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{u.laptop_name || "Tanpa Nama"}</p>
                                <p className="text-[10px] font-mono text-gray-500">{u.serial_number || "no-SN"}</p>
                              </div>
                              <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                                {u.missing_fields.slice(0, 3).map(f => (
                                  <span key={f} className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">{f}</span>
                                ))}
                                {u.missing_fields.length > 3 && (
                                  <span className="text-[9px] text-amber-600">+{u.missing_fields.length - 3}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => setScanPreview(null)}
                disabled={scanExecuting}
                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >
                {scanPreview.total === 0 ? "Tutup" : "Batal"}
              </button>
              {scanPreview.total > 0 && !scanLoading && (
                <button
                  onClick={executeScan}
                  disabled={scanExecuting}
                  className="flex-1 h-11 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-indigo-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {scanExecuting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {scanExecuting ? "Memproses..." : `Eksekusi (${scanPreview.total} unit)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}