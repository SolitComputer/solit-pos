// app/dashboard/data-barang/TeamQcContent.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Search, X, CheckCircle2, AlertTriangle, Clock, Laptop as LaptopIcon,
  ChevronRight, Ban,
} from "lucide-react";

interface QcUnit {
  id: string;
  laptop_id: string;
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
  laptop: {
    id: string;
    laptop_name: string | null;
    brand: string | null;
    cpu: string | null;
    ram: string | null;
    storage: string | null;
  };
}

const fmt = (n: number | null) => n == null ? "—" : "Rp " + n.toLocaleString("id-ID");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

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

      if (json.is_complete) {
        toast.success("Semua kriteria lengkap — unit otomatis naik ke SIAP JUAL");
      } else {
        toast.success(`Disimpan — masih ${json.missing_fields.length} field kosong`);
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const handleMarkMinus = async () => {
    const reason = window.prompt("Alasan ditandai minus (opsional):", "");
    if (reason === null) return;
    setMarkingMinus(true);
    try {
      const res = await fetch("/api/laptops/qc/mark-minus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: unit.id, reason }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal"); return; }
      toast.success("Unit ditandai MINUS — dilempar ke Pengelola Barang");
      onSaved();
    } finally { setMarkingMinus(false); }
  };

  const Input = ({ label, name, type = "text", required = false }: {
    label: string; name: keyof typeof form; type?: string; required?: boolean;
  }) => {
    const isEmpty = form[name].trim() === "";
    return (
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <input
          type={type}
          value={form[name]}
          onChange={(e) => setForm(f => ({ ...f, [name]: e.target.value }))}
          className={`w-full h-10 border rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 focus:bg-white transition ${
            isEmpty && required ? "border-amber-300 bg-amber-50/30" : "border-gray-200"
          }`}
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div>
            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">QC — Isi Kriteria Lengkap</p>
            <h2 className="text-white font-bold text-base mt-0.5 truncate">{unit.laptop.laptop_name || "Laptop"}</h2>
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
          {/* Info Section */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-indigo-700 leading-relaxed">
              Isi SEMUA field. Nilai <span className="font-mono bg-white px-1.5 py-0.5 rounded">0</span> dianggap terisi (contoh: sparepart Rp 0 = tidak ada sparepart).
              Hanya field yang <span className="font-bold">kosong total</span> yang bikin unit tidak lolos QC.
            </p>
          </div>

          {/* ── Model Fields ── */}
          <div>
            <h3 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2">
              <LaptopIcon size={14} /> Spesifikasi Model
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Nama Laptop" name="laptop_name" required />
              <Input label="Brand" name="brand" required />
              <Input label="CPU" name="cpu" required />
              <Input label="RAM" name="ram" required />
              <Input label="Storage" name="storage" required />
            </div>
          </div>

          {/* ── Unit Fields ── */}
          <div>
            <h3 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle2 size={14} /> Data Unit (per SN)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Serial Number" name="serial_number" required />
              <Input label="Grade (A/B/C)" name="grade" required />
              <Input label="Sumber" name="source" required />
              <Input label="Harga Modal (Rp)" name="purchase_price" type="number" required />
              <Input label="Biaya Sparepart (Rp)" name="sparepart_cost" type="number" required />
              <Input label="Harga Setor (Rp)" name="selling_price" type="number" required />
              <Input label="Harga Official (Rp)" name="official_price" type="number" required />
              <div className="md:col-span-2">
                <Input label="Kondisi & Catatan" name="condition_note" required />
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0 bg-white">
          <button
            type="button"
            onClick={handleMarkMinus}
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
    </div>
  );
}

// ─── Main Content ──────────────────────────────────────────────────────
export default function TeamQcContent() {
  const [units, setUnits] = useState<QcUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<QcUnit | null>(null);

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/laptops/qc");
      const json = await res.json();
      if (json.success) setUnits(json.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

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
          <div>
            <h1 className="text-base font-bold text-gray-800">Team QC — Perlu Pengecekan</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? "Memuat..." : `${units.length} unit menunggu QC`}
            </p>
          </div>
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
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{u.laptop.laptop_name || "Tanpa Nama"}</p>
                    <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {u.serial_number || "no-SN"}
                    </span>
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
          onSaved={() => { setEditTarget(null); fetchUnits(); }}
        />
      )}
    </main>
  );
}