// src/app/dashboard/laptops/minus/AntrianSparepartTab.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Wrench, CheckCircle2, Package, Clock, User as UserIcon } from "lucide-react";

interface SparepartItem {
  id: string;
  unit_id: string;
  laptop_id: string;
  sparepart_name: string;
  estimasi_harga: number | null;
  catatan: string | null;
  status: "MENUNGGU" | "SELESAI";
  created_at: string;
  serial_number: string | null;
  laptop?: { id: string; laptop_name: string; brand?: string };
  pic?: { id: string; name: string } | null;
}

const fmt = (n: number | null) => n == null ? "—" : "Rp " + n.toLocaleString("id-ID");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AntrianSparepartTab() {
  const [items, setItems] = useState<SparepartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/laptops/sparepart-queue?status=MENUNGGU");
      const json = await res.json();
      if (json.success) setItems(json.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleComplete = async (item: SparepartItem) => {
    if (!confirm(`Tandai "${item.sparepart_name}" sebagai SELESAI?\n\nKalau ini sparepart terakhir untuk unit SN ${item.serial_number}, sistem akan otomatis cek kelengkapan QC dan pindahkan unit ke SIAP JUAL atau balik ke Team QC.`)) return;
    setCompleting(item.id);
    try {
      const res = await fetch(`/api/laptops/sparepart-queue/${item.id}/complete`, { method: "POST" });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || "Gagal"); return; }
      toast.success(json.message);
      fetchItems();
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setCompleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="w-4 h-4 text-emerald-700" />
          <p className="text-sm font-bold text-emerald-700">Antrian Beli Sparepart</p>
        </div>
        <p className="text-[11px] text-emerald-600 leading-relaxed">
          Sparepart yang perlu dibeli untuk unit yang diputuskan <span className="font-bold">BISA DIPERBAIKI</span> oleh Pengelola Barang.
          Tombol <span className="font-bold">Selesai</span> menandai sparepart sudah dibeli & dipasang.
          Setelah sparepart terakhir selesai, sistem otomatis cek kelengkapan QC unit.
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <Package className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-700 font-bold text-base">Tidak ada sparepart menunggu</p>
          <p className="text-gray-400 text-sm mt-1">
            Antrian kosong — semua sparepart sudah selesai, atau belum ada unit yang diputuskan "Bisa Diperbaiki"
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(it => (
            <div key={it.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-200 transition p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                <Wrench className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-bold text-gray-800">{it.sparepart_name}</p>
                  {it.estimasi_harga != null && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      est. {fmt(it.estimasi_harga)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mb-1.5">
                  <span className="font-semibold text-gray-700">{it.laptop?.laptop_name ?? "—"}</span>
                  {" · SN: "}
                  <span className="font-mono bg-gray-100 px-1 rounded">{it.serial_number ?? "—"}</span>
                </p>
                {it.catatan && (
                  <p className="text-[11px] text-gray-600 italic mb-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">
                    "{it.catatan}"
                  </p>
                )}
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><Clock size={10} />{fmtDate(it.created_at)}</span>
                  {it.pic && <span className="flex items-center gap-1"><UserIcon size={10} />PIC: {it.pic.name}</span>}
                </div>
              </div>
              <button
                onClick={() => handleComplete(it)}
                disabled={completing !== null}
                className="h-9 px-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-xs font-bold hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
              >
                {completing === it.id ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                Selesai
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}