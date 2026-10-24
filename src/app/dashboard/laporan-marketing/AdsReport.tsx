"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Download, ImagePlus, Loader2, Plus, Table2, Trash2, X } from "lucide-react";
import { parseInsightNumber } from "@/lib/marketing-insight";

type ColType = "text" | "num";
interface Col { k: string; label: string; type: ColType; min?: number; rp?: boolean }
interface Section { key: string; label: string; hasNo: boolean; cols: Col[] }

const SECTIONS: Section[] = [
  { key: "ringkasan", label: "Ringkasan CEO", hasNo: false, cols: [
    { k: "sumber", label: "Sumber Iklan", type: "text", min: 180 },
    { k: "spend", label: "Spend", type: "num", rp: true },
    { k: "leads", label: "Leads / Chat", type: "num" },
    { k: "cpl", label: "CPL", type: "num", rp: true },
    { k: "closing", label: "Closing", type: "num" },
    { k: "omzet", label: "Omzet", type: "num", rp: true },
    { k: "roas", label: "ROAS", type: "text" },
  ]},
  { key: "fb_toko", label: "FB Toko (META)", hasNo: true, cols: [
    { k: "akun", label: "Akun / Toko", type: "text", min: 140 },
    { k: "barang", label: "Barang Diiklankan", type: "text", min: 180 },
    { k: "anggaran", label: "Anggaran", type: "num", rp: true },
    { k: "durasi", label: "Durasi", type: "text" },
    { k: "jangkauan", label: "Jangkauan", type: "num" },
    { k: "impresi", label: "Impresi", type: "num" },
    { k: "klik", label: "Klik Tautan", type: "num" },
    { k: "ctr", label: "CTR", type: "text" },
    { k: "chat", label: "Chat Dimulai", type: "num" },
    { k: "cpl", label: "CPL", type: "num", rp: true },
    { k: "closing", label: "Closing", type: "num" },
    { k: "omzet", label: "Omzet", type: "num", rp: true },
    { k: "roas", label: "ROAS", type: "text" },
  ]},
  { key: "shopee", label: "Shopee Ads", hasNo: true, cols: [
    { k: "toko", label: "Toko", type: "text", min: 120 },
    { k: "periode", label: "Tanggal / Periode", type: "text", min: 140 },
    { k: "nama_iklan", label: "Nama Iklan / Produk", type: "text", min: 180 },
    { k: "biaya", label: "Biaya Iklan", type: "num", rp: true },
    { k: "dilihat", label: "Dilihat", type: "num" },
    { k: "klik", label: "Jumlah Klik", type: "num" },
    { k: "ctr", label: "CTR", type: "text" },
    { k: "closing", label: "Closing", type: "num" },
    { k: "omzet", label: "Omzet Iklan", type: "num", rp: true },
    { k: "roas", label: "ROAS", type: "text" },
    { k: "catatan", label: "Catatan", type: "text", min: 200 },
  ]},
  { key: "fb_pribadi", label: "FB Pribadi", hasNo: true, cols: [
    { k: "akun", label: "Akun FB", type: "text", min: 140 },
    { k: "barang", label: "Barang Diiklankan", type: "text", min: 180 },
    { k: "harga", label: "Harga Satuan", type: "num", rp: true },
    { k: "budget", label: "Budget", type: "num", rp: true },
    { k: "durasi", label: "Durasi (Hari)", type: "num" },
    { k: "klik", label: "Klik Tawaran", type: "num" },
    { k: "chat", label: "Chat Masuk", type: "num" },
    { k: "cpl", label: "CPL", type: "num", rp: true },
    { k: "persen_chat", label: "% Chat dari Klik", type: "text" },
    { k: "closing", label: "Closing", type: "num" },
    { k: "omzet", label: "Omzet", type: "num", rp: true },
    { k: "roas", label: "ROAS", type: "text" },
  ]},
];

interface AdsRow { id: string; sort_order: number; data: Record<string, string> }

// Kompres gambar ke JPEG kecil (data URL) biar ringan disimpan.
async function compressImage(file: File, maxDim = 1000, quality = 0.7): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = document.createElement("img");
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  let { width, height } = img;
  if (width >= height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
  else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export default function AdsReport() {
  const [sectionKey, setSectionKey] = useState("ringkasan");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AdsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const section = useMemo(() => SECTIONS.find((s) => s.key === sectionKey)!, [sectionKey]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res = await fetch(`/api/ads-report?section=${sectionKey}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat");
      setRows(json.data as AdsRow[]);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [sectionKey]);
  useEffect(() => { load(); }, [load]);

  const saveRow = useCallback((id: string, data: Record<string, string>, immediate = false) => {
    const run = async () => {
      try {
        const res = await fetch(`/api/ads-report?id=${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || "Gagal menyimpan");
      } catch (e: any) { setError(e.message); }
    };
    if (timers.current[id]) clearTimeout(timers.current[id]);
    if (immediate) run();
    else timers.current[id] = setTimeout(run, 600);
  }, []);

  const setCell = (id: string, k: string, value: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const data = { ...r.data, [k]: value };
      saveRow(id, data, k === "foto"); // foto simpan langsung, teks debounce
      return { ...r, data };
    }));
  };

  const addRow = async () => {
    try {
      const res = await fetch(`/api/ads-report?section=${sectionKey}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menambah baris");
      setRows((prev) => [...prev, json.data as AdsRow]);
    } catch (e: any) { setError(e.message); }
  };

  const deleteRow = async (id: string) => {
    if (!window.confirm("Hapus baris ini?")) return;
    try {
      const res = await fetch(`/api/ads-report?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menghapus");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) { setError(e.message); }
  };

  const onPickPhoto = async (id: string, file: File | null) => {
    if (!file) return;
    try { setCell(id, "foto", await compressImage(file)); }
    catch { setError("Gagal memproses foto"); }
  };

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const col of section.cols) {
      if (col.type !== "num") continue;
      t[col.k] = rows.reduce((s, r) => s + parseInsightNumber(r.data[col.k]), 0);
    }
    return t;
  }, [rows, section]);

  // ── Export Excel (foto ter-embed di cell) ──
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    if (rows.length === 0 || exporting) return;
    try {
      setExporting(true);
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(section.label.slice(0, 31) || "Ads");
      const leadingNo = section.hasNo ? 1 : 0;

      ws.addRow([...(section.hasNo ? ["No."] : []), ...section.cols.map((c) => c.label), "Foto"]);

      rows.forEach((row, i) => {
        const vals: any[] = section.hasNo ? [i + 1] : [];
        for (const c of section.cols) {
          const raw = row.data[c.k] ?? "";
          if (c.type === "num") {
            const n = parseInsightNumber(raw);
            vals.push(raw !== "" && String(n) === raw.trim() ? n : raw);
          } else vals.push(raw);
        }
        vals.push(""); // kolom foto diisi gambar
        ws.addRow(vals);
      });

      const totalVals: any[] = section.hasNo ? [""] : [];
      section.cols.forEach((c, i) => totalVals.push(i === 0 ? "TOTAL" : c.type === "num" ? (totals[c.k] || 0) : ""));
      totalVals.push("");
      ws.addRow(totalVals);

      // Styling
      const thin = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
      const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
      let ci = 1;
      if (section.hasNo) ws.getColumn(ci++).width = 5;
      for (const c of section.cols) ws.getColumn(ci++).width = c.type === "num" ? 14 : Math.max(14, Math.round((c.min ?? 90) / 7));
      ws.getColumn(ci).width = 14; // Foto
      ws.views = [{ state: "frozen", ySplit: 1 }];

      const hr = ws.getRow(1);
      hr.height = 24;
      hr.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = allBorders;
      });

      const fotoColIdx = leadingNo + section.cols.length; // 0-based
      const lastRow = ws.rowCount;
      for (let r = 2; r < lastRow; r++) {
        const row = rows[r - 2];
        ws.getRow(r).eachCell((cell, col) => {
          cell.border = allBorders;
          cell.alignment = { vertical: "middle", horizontal: section.hasNo && col === 1 ? "center" : "left", wrapText: true };
          const sc = section.cols[col - 1 - leadingNo];
          if (sc?.rp && typeof cell.value === "number") cell.numFmt = '"Rp" #,##0';
        });
        const foto = row.data.foto;
        if (foto && foto.startsWith("data:image/")) {
          const ext = foto.startsWith("data:image/png") ? "png" : "jpeg";
          const imageId = wb.addImage({ base64: foto, extension: ext as "png" | "jpeg" });
          ws.getRow(r).height = 60;
          ws.addImage(imageId, { tl: { col: fotoColIdx + 0.1, row: (r - 1) + 0.1 }, ext: { width: 80, height: 56 } });
        }
      }

      const tr = ws.getRow(lastRow);
      tr.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
        cell.font = { bold: true, color: { argb: "FF1E3A8A" } };
        cell.border = { ...allBorders, top: { style: "double", color: { argb: "FF1D4ED8" } } };
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Laporan Ads - ${section.label}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError("Gagal export Excel: " + (e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dropdown pilih tabel */}
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <button onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 h-10 px-3.5 rounded-full bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-100 min-w-[200px] justify-between">
            <span className="inline-flex items-center gap-2"><Table2 className="w-4 h-4 text-violet-500" /> {section.label}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute z-20 mt-1.5 w-64 rounded-2xl bg-white border border-gray-100 shadow-xl ring-1 ring-gray-100 p-1.5">
                {SECTIONS.map((s) => (
                  <button key={s.key} onClick={() => { setSectionKey(s.key); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left ${s.key === sectionKey ? "bg-violet-50 text-violet-700 font-semibold" : "text-gray-700 hover:bg-gray-50"}`}>
                    <Table2 className="w-3.5 h-3.5" /> {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel} disabled={exporting || rows.length === 0}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-sm font-semibold bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export Excel
          </button>
          <button onClick={addRow}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-sm font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40 hover:opacity-95">
            <Plus className="w-4 h-4" /> Baris Baru
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-9 rounded bg-gray-100 animate-pulse" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: "max-content" }}>
              <thead>
                <tr className="bg-blue-700 text-white">
                  {section.hasNo && <th className="border border-blue-800 px-2 py-2 font-bold w-10">No.</th>}
                  {section.cols.map((c) => (
                    <th key={c.k} className="border border-blue-800 px-2 py-2 font-bold text-center" style={{ minWidth: c.min ?? 90 }}>{c.label}</th>
                  ))}
                  <th className="border border-blue-800 px-2 py-2 font-bold text-center min-w-[90px]">Foto</th>
                  <th className="border border-blue-800 px-1 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={section.cols.length + (section.hasNo ? 3 : 2)} className="border border-gray-200 px-4 py-6 text-center text-gray-400">Belum ada baris. Klik “Baris Baru”.</td></tr>
                ) : rows.map((row, idx) => (
                  <tr key={row.id} className="group hover:bg-blue-50/30">
                    {section.hasNo && <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-400 font-semibold">{idx + 1}</td>}
                    {section.cols.map((c) => (
                      <td key={c.k} className="border border-gray-200 p-0">
                        <div className="flex items-center">
                          {c.rp && <span className="pl-2 text-[11px] font-semibold text-gray-400 shrink-0 select-none">Rp. </span>}
                          <input
                            value={row.data[c.k] ?? ""}
                            onChange={(e) => setCell(row.id, c.k, e.target.value)}
                            className={`w-full px-2 py-1.5 bg-transparent outline-none focus:bg-violet-50/40 text-gray-800 ${c.rp ? "text-left tabular-nums pl-1" : c.type === "num" ? "text-right tabular-nums" : ""}`}
                          />
                        </div>
                      </td>
                    ))}
                    {/* Foto */}
                    <td className="border border-gray-200 p-1 text-center">
                      {row.data.foto ? (
                        <div className="relative inline-block">
                          <img src={row.data.foto} alt="foto" onClick={() => setPreview(row.data.foto)}
                            className="h-10 w-14 object-cover rounded cursor-pointer border border-gray-200" />
                          <button onClick={() => setCell(row.id, "foto", "")} title="Hapus foto"
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center justify-center w-14 h-10 rounded border border-dashed border-violet-300 text-violet-500 hover:bg-violet-50 cursor-pointer">
                          <ImagePlus className="w-4 h-4" />
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickPhoto(row.id, e.target.files?.[0] ?? null)} />
                        </label>
                      )}
                    </td>
                    <td className="border border-gray-200 text-center">
                      <button onClick={() => deleteRow(row.id)} title="Hapus baris"
                        className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-blue-50 font-bold text-blue-800">
                    {section.hasNo && <td className="border border-blue-200 px-2 py-2" />}
                    {section.cols.map((c, i) => (
                      <td key={c.k} className={`border border-blue-200 px-2 py-2 ${c.type === "num" ? "text-right tabular-nums" : ""}`}>
                        {i === 0 ? "TOTAL" : c.rp ? `Rp ${(totals[c.k] || 0).toLocaleString("id-ID")}` : c.type === "num" ? (totals[c.k] || 0).toLocaleString("id-ID") : ""}
                      </td>
                    ))}
                    <td className="border border-blue-200" />
                    <td className="border border-blue-200" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Preview foto */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60" onClick={() => setPreview(null)}>
          <img src={preview} alt="preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}