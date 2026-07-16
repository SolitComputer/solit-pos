"use client";

import { useEffect, useRef, useState } from "react";
import {
  searchPlaces, getRoute, fmtDistance, fmtDuration,
  parseLatLngFromText, reverseGeocode,
  isShortMapLink, resolveShortMapLink,
  STORE_ORIGIN, type GeoPlace, type RouteResult,
} from "@/lib/geo";

export interface StartTripPayload {
  dest: { lat: number; lng: number };
  address: string;
  route: RouteResult | null;
}
interface Props {
  defaultAddress?: string | null;
  onClose: () => void;
  onConfirm: (p: StartTripPayload) => Promise<void>;
}

export default function StartTripModal({ defaultAddress, onClose, onConfirm }: Props) {
  // Input SELALU kosong saat modal dibuka — pengantar isi/paste manual.
  // defaultAddress hanya dipakai sebagai referensi (lihat blok "Alamat dari sales").
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<GeoPlace | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // origin: GPS pengantar kalau bisa, fallback titik toko
  const getOrigin = () =>
    new Promise<{ lat: number; lng: number }>((resolve) => {
      if (!navigator.geolocation) return resolve(STORE_ORIGIN);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(STORE_ORIGIN),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      );
    });

  // Hanya update teks. TIDAK memproses apa pun otomatis —
  // semua (link/koordinat/alamat) diproses lewat tombol "Deteksi Tujuan".
  const onSearch = (q: string) => {
    setQuery(q);
    setSelected(null);
    setRoute(null);
    setError("");
    setResults([]);
    if (debRef.current) clearTimeout(debRef.current);
  };

  // Pilih tujuan dari koordinat (hasil parse / resolve link Maps)
  const pickCoord = async (c: { lat: number; lng: number }) => {
    setError("");
    const fallback = `Titik dari link Maps (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})`;
    setSelected({ lat: c.lat, lng: c.lng, label: fallback });
    setQuery(fallback);
    setRouting(true);

    // perkaya label via reverse geocode (tidak nge-block rute)
    reverseGeocode(c.lat, c.lng).then((r) => {
      if (r?.label) {
        const nice = `${r.label} · dari link Maps`;
        setSelected((prev) => (prev ? { ...prev, label: nice } : prev));
        setQuery(nice);
      }
    });

    const origin = await getOrigin();
    const r = await getRoute(origin, c);
    setRoute(r); setRouting(false);
  };

  // Pilih tujuan dari daftar rekomendasi alamat
  const pick = async (p: GeoPlace) => {
    setSelected(p); setQuery(p.label); setResults([]);
    setRouting(true);
    const origin = await getOrigin();
    const r = await getRoute(origin, { lat: p.lat, lng: p.lng });
    setRoute(r); setRouting(false);
  };

  // Manual: proses isi input saat tombol diklik (link pendek / koordinat / alamat)
  const detectDestination = async () => {
    const q = query.trim();
    setError("");
    if (!q) { setError("Isi alamat / link tujuan dulu"); return; }

    // 1) Link PENDEK Google Maps → resolve di server (butuh loading)
    if (isShortMapLink(q)) {
      setDetecting(true);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const coord = await resolveShortMapLink(q, abortRef.current.signal);
      setDetecting(false);
      if (coord) await pickCoord(coord);
      else setError("Link tidak bisa dibaca. Buka link → salin URL panjang (ada @lat,lng), atau ketik alamat manual.");
      return;
    }

    // 2) Link panjang / koordinat tertulis
    const coord = parseLatLngFromText(q);
    if (coord) { await pickCoord(coord); return; }

    // 3) Alamat teks → cari rekomendasi (loading sebentar)
    setDetecting(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const data = await searchPlaces(q, abortRef.current.signal);
    setDetecting(false);
    setResults(data);
    if (data.length === 0) setError("Alamat tidak ketemu. Coba kata kunci lain atau paste link Maps.");
  };

  const confirm = async () => {
    setError("");
    if (!selected) { setError("Deteksi & pilih tujuan dulu"); return; }
    setSaving(true);
    try {
      await onConfirm({ dest: { lat: selected.lat, lng: selected.lng }, address: selected.label, route });
    } catch { setError("Gagal memulai pengantaran"); } finally { setSaving(false); }
  };

  useEffect(() => () => { abortRef.current?.abort(); if (debRef.current) clearTimeout(debRef.current); }, []);

  const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="bg-[#1a1a2e] px-5 py-4 flex-shrink-0">
          <p className="font-bold text-white text-sm"> Atur Tujuan & Mulai Antar</p>
          <p className="text-xs text-gray-300 mt-0.5">Isi alamat / link Maps, lalu deteksi tujuan</p>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Tujuan Pengantaran *</label>
            <input value={query} onChange={(e) => onSearch(e.target.value)}
              placeholder="Ketik alamat / wilayah, atau paste link Google Maps" className={inputCls} />
            {searching && <div className="absolute right-3 top-9 w-4 h-4 border-2 border-gray-200 border-t-[#1a1a2e] rounded-full animate-spin" />}
            {results.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden bg-white max-h-56 overflow-y-auto">
                {results.map((r, i) => (
                  <button key={i} type="button" onClick={() => pick(r)} className="w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <p className="text-sm font-semibold text-gray-800 truncate"> {r.label.split(",").slice(0, 2).join(",")}</p>
                    <p className="text-[11px] text-gray-400 truncate">{r.label}</p>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
               Paste link Google Maps atau ketik alamat, lalu klik &quot;Deteksi Tujuan&quot;.
            </p>

            {/* Referensi alamat dari sales — TIDAK mengisi input otomatis */}
            {defaultAddress && (
              <div className="mt-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <p className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">Alamat dari sales</p>
                <p className="text-[11px] text-gray-600 break-all">{defaultAddress}</p>
                <button type="button"
                  onClick={() => onSearch(defaultAddress)}
                  className="mt-1 text-[11px] text-blue-600 font-semibold hover:underline">
                  Pakai alamat ini →
                </button>
              </div>
            )}

            {/* Tombol deteksi manual + loading */}
            <button type="button" onClick={detectDestination}
              disabled={detecting || routing || !query.trim()}
              className="mt-2 w-full h-10 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {detecting || routing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Mendeteksi lokasi...
                </>
              ) : " Deteksi Tujuan"}
            </button>
          </div>

          {selected && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-[10px] text-emerald-600 font-semibold uppercase mb-1">Tujuan dipilih</p>
              <p className="text-sm font-bold text-emerald-800">{selected.label.split(",").slice(0, 3).join(",")}</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div className="bg-white rounded-lg p-2.5 border border-emerald-100 text-center">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase">Jarak</p>
                  <p className="text-sm font-black text-gray-800">{routing ? "..." : route ? fmtDistance(route.distanceM) : "—"}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-emerald-100 text-center">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase">Estimasi</p>
                  <p className="text-sm font-black text-gray-800">{routing ? "..." : route ? fmtDuration(route.durationS) : "—"}</p>
                </div>
              </div>
              {!route && !routing && <p className="text-[10px] text-amber-600 mt-2">Rute gak ketemu, tetap bisa lanjut (tujuan tetap tersimpan).</p>}
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
          <button onClick={confirm} disabled={saving || !selected} className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50">
            {saving ? "Memulai..." : " Mulai Antar"}
          </button>
        </div>
      </div>
    </div>
  );
}