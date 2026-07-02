"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import { supabase } from "@/services/supabase";
import { playNotifSound, unlockAudio } from "@/lib/preparationSound";
import { OrderCard, type PrepOrder } from "@/components/preparation/prepShared";
import { isPrepProvider, isPrepSilent } from "@/lib/prepAlarm";

// ── BarcodeScanModal ──────────────────────────────────────────────────────────
// ── BarcodeScanModal (native + fallback ZXing) ────────────────────────────────
function BarcodeScanModal({
  onScan, onClose,
}: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>("");
  const [detected, setDetected] = useState<string | null>(null);
  const [engine, setEngine] = useState<"native" | "zxing" | "">("");

  // simpan callback terbaru di ref → effect cukup jalan sekali (kamera gak restart tiap render)
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onScanRef.current = onScan; onCloseRef.current = onClose; });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animId = 0;
    let zxingControls: { stop: () => void } | null = null;
    let done = false;

    const finish = (value: string) => {
      if (done) return;
      done = true;
      const clean = value.trim();
      setDetected(clean);
      setTimeout(() => { onScanRef.current(clean); onCloseRef.current(); }, 500);
    };

    // Engine 1: BarcodeDetector native (Chrome/Edge/Android)
    const startNative = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const detector = new (window as any).BarcodeDetector({
        formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "data_matrix", "upc_a"],
      });
      setEngine("native");
      const loop = async () => {
        if (done || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) return finish(codes[0].rawValue);
        } catch { /* frame belum siap */ }
        animId = requestAnimationFrame(loop);
      };
      animId = requestAnimationFrame(loop);
    };

    const startZxing = async () => {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      setEngine("zxing");
      zxingControls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result) => { if (result) finish(result.getText()); }
      );
    };

    const hasNative = async () => {
      if (!("BarcodeDetector" in window)) return false;
      try {
        const fmts = await (window as any).BarcodeDetector.getSupportedFormats?.();
        return !fmts || fmts.length > 0;
      } catch { return true; }
    };

    (async () => {
      try {
        if (await hasNative()) await startNative();
        else await startZxing();
      } catch (e1: any) {
        try { await startZxing(); } // native gagal → coba ZXing dulu sebelum nyerah
        catch (e2: any) {
          const name = e2?.name || e1?.name;
          if (name === "NotAllowedError")
            setError("Izin kamera ditolak. Aktifkan izin kamera lalu refresh halaman.");
          else if (name === "NotFoundError")
            setError("Kamera tidak ditemukan. Ketik SN manual saja ya.");
          else
            setError("Gagal memulai scanner di browser ini. Kamu masih bisa ketik SN manual.");
        }
      }
    })();

    return () => {
      done = true;
      cancelAnimationFrame(animId);
      try { zxingControls?.stop(); } catch { }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []); // jalan sekali saat modal dibuka

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/80">
      <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-gray-900 px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-white font-bold">📷 Scan Barcode</p>
            <p className="text-gray-400 text-xs">
              Arahkan ke barcode Serial Number{engine === "zxing" && " · mode kompatibel"}
            </p>
          </div>
          <button onClick={onClose} className="text-white p-1">✕</button>
        </div>

        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-40 border-2 border-emerald-400 rounded-xl relative">
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400" />
            </div>
          </div>
          {detected && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-2">✅</div>
                <p className="text-emerald-400 font-bold">Terbaca!</p>
                <p className="font-mono text-white mt-1">{detected}</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-t border-red-100">
            <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
          </div>
        )}

        <div className="p-4 border-t">
          <button onClick={onClose} className="w-full h-11 bg-gray-100 rounded-xl text-sm font-medium">
            Tutup Kamera
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ serial_number: string; laptop_name?: string; laptop_id?: string; unit_id?: string }[]>([]);
  const [snSearch, setSnSearch] = useState("");
  const [snResults, setSnResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualSN, setManualSN] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showBarcode, setShowBarcode] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSnResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/units/search-sn?q=${encodeURIComponent(q)}`);
      const result = await res.json();
      const existing = new Set(items.map(i => i.serial_number.toLowerCase()));
      setSnResults((result.data || []).filter((u: any) => !existing.has((u.serial_number || "").toLowerCase())));
    } catch { setSnResults([]); } finally { setSearching(false); }
  }, [items]);

  const addUnit = (u: any) => {
    setItems(prev => [...prev, {
      serial_number: u.serial_number, laptop_name: u.laptop_name ?? undefined,
      laptop_id: u.laptop_id ?? undefined, unit_id: u.id ?? undefined,
    }]);
    setSnSearch(""); setSnResults([]);
  };
  const addManual = () => {
    const sn = manualSN.trim();
    if (!sn) return;
    if (items.some(i => i.serial_number.toLowerCase() === sn.toLowerCase())) { setManualSN(""); return; }
    setItems(prev => [...prev, { serial_number: sn }]);
    setManualSN("");
  };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    setError("");
    if (!customerName.trim()) { setError("Nama customer wajib diisi"); return; }
    if (items.length === 0) { setError("Tambahkan minimal 1 serial number"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/preparation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(), customer_phone: customerPhone.trim() || null,
          delivery_address: deliveryAddress.trim() || null, notes: notes.trim() || null,
          items,
        }),
      });
      const result = await res.json();
      if (!result.success) { setError(result.message || "Gagal membuat penyiapan"); return; }
      onCreated(); onClose();
    } catch { setError("Terjadi kesalahan koneksi"); } finally { setSaving(false); }
  };

  const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-base">Buat Penyiapan Barang</h2>
            <p className="text-xs text-gray-400 mt-0.5">Input format SN untuk disiapkan penyedia barang</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Nama Customer *</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Atas nama..." className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">No. WhatsApp</label>
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="08xxxx" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Alamat (opsional, kalau diantar)</label>
            <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Alamat tujuan" className={inputCls} />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Serial Number {items.length > 0 && <span className="text-[#1a1a2e]">({items.length})</span>}</label>
            <div className="relative">
              <input value={snSearch} onChange={e => { setSnSearch(e.target.value); search(e.target.value); }} placeholder="Cari SN dari stok..." className={inputCls} />
              {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-200 border-t-[#1a1a2e] rounded-full animate-spin" />}
            </div>
            {snResults.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden bg-white max-h-44 overflow-y-auto">
                {snResults.map((u: any) => (
                  <button key={u.id} type="button" onClick={() => addUnit(u)} className="w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <p className="font-mono text-sm font-semibold text-gray-800">{u.serial_number}</p>
                    <p className="text-xs text-gray-500">{u.laptop_name}{u.grade ? ` · Grade ${u.grade}` : ""}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <input
                value={manualSN}
                onChange={(e) => setManualSN(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
                placeholder="Atau ketik SN manual..."
                className={`${inputCls} font-mono flex-1`}
              />
              <button
                type="button"
                onClick={() => setShowBarcode(true)}
                className="px-3 h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition whitespace-nowrap"
                title="Scan barcode SN"
              >
                📷
              </button>
              <button
                type="button"
                onClick={addManual}
                className="px-4 h-10 rounded-xl bg-[#1a1a2e] text-white text-sm font-semibold hover:bg-[#16213e] transition whitespace-nowrap"
              >
                + Tambah
              </button>
            </div>

            {items.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-gray-800">{it.serial_number}</p>
                      {it.laptop_name && <p className="text-[10px] text-gray-500 truncate">{it.laptop_name}</p>}
                    </div>
                    <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Catatan</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Catatan untuk penyedia barang..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition resize-none" />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
          {showBarcode && (
            <BarcodeScanModal
              onScan={(sn) => {
                const clean = sn.trim();
                if (clean && !items.some((i) => i.serial_number.toLowerCase() === clean.toLowerCase())) {
                  setItems((prev) => [...prev, { serial_number: clean }]);
                }
              }}
              onClose={() => setShowBarcode(false)}
            />
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
          <button onClick={submit} disabled={saving} className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50">
            {saving ? "Menyimpan..." : "Buat Penyiapan"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface LeaderRow { name: string; total: number; }
interface StatusCounts {
  menunggu: number; diproses: number; siap_kirim: number; menunggu_pengantar: number;
  dikirim: number; selesai: number; dibatalkan: number; total: number; unit_menunggu: number;
}
interface DashboardStats {
  range?: { from: string | null; to: string | null; label: string };
  status_counts: StatusCounts;
  formats: LeaderRow[]; prepared: LeaderRow[]; delivered: LeaderRow[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const localMidnightISO = (s: string) => new Date(`${s}T00:00:00`).toISOString();
const nextDayISO = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const fmtRange = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default function PreparationPage() {
  // ── View & data ──
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ── Periode / kalender ──
  const now0 = new Date();
  const [fromDate, setFromDate] = useState(() => ymd(new Date(now0.getFullYear(), now0.getMonth(), 1)));
  const [toDate, setToDate] = useState(() => ymd(now0));
  const [allTime, setAllTime] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("month");

  // ── Leaderboard / stats ──
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const notifiedDoneRef = useRef<Set<string>>(new Set());

  const canCreate = userRole ? hasPermission(userRole, PERMISSIONS.CREATE_PREPARATION) : false;
  const canDone = userRole ? hasPermission(userRole, PERMISSIONS.DONE_PREPARATION) : false;

  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const showToast = useCallback((title: string, sub: string) => {
    setToast({ title, sub });
    if (soundOnRef.current) playNotifSound();
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 7000);
  }, []);

  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener("pointerdown", unlock); };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(r => {
      setUserRole(r.user?.role ?? null);
      setUserId(r.user?.id ?? null);
    }).catch(() => { setUserRole(null); setUserId(null); });
  }, []);

  // debounce search (biar nggak spam server tiap ketik)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // filter berubah → balik ke halaman 1
  useEffect(() => { setPage(1); }, [statusFilter, debouncedSearch, fromDate, toDate, allTime]);

  const periodParams = useCallback((qs: URLSearchParams) => {
    if (!allTime) {
      qs.set("from", localMidnightISO(fromDate));
      qs.set("to", nextDayISO(toDate));
    }
    return qs;
  }, [allTime, fromDate, toDate]);

  const fetchList = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = periodParams(new URLSearchParams());
      qs.set("page", String(page));
      qs.set("limit", String(PAGE_SIZE));
      if (statusFilter !== "ALL") qs.set("status", statusFilter);
      if (debouncedSearch.trim()) qs.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/preparation?${qs.toString()}`);
      const result = await res.json();
      const data: PrepOrder[] = result.data || [];
      setOrders(data);
      setTotal(result.total ?? data.length);
      data.forEach(o => knownIdsRef.current.add(o.id));
    } catch { setOrders([]); setTotal(0); } finally { setIsLoading(false); }
  }, [periodParams, page, statusFilter, debouncedSearch]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const qs = allTime ? new URLSearchParams({ scope: "all" }) : periodParams(new URLSearchParams());
      const res = await fetch(`/api/preparation/leaderboard?${qs.toString()}`);
      const r = await res.json();
      if (r.success) setStats(r);
    } catch { /* keep last */ } finally { setStatsLoading(false); }
  }, [allTime, periodParams]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ref biar realtime nggak resubscribe tiap fetcher berubah
  const fetchListRef = useRef(fetchList);
  const fetchStatsRef = useRef(fetchStats);
  useEffect(() => { fetchListRef.current = fetchList; fetchStatsRef.current = fetchStats; });

  useEffect(() => {
    if (!userRole) return;
    const channel = supabase
      .channel("preparation-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "preparation_orders" }, (payload) => {
        const row: any = payload.new;
        if (isPrepProvider(userRole) && !isPrepSilent(userRole)) {
          showToast("📦 Penyiapan baru masuk!", `${row.customer_name ?? "Customer"} · ${row.order_number ?? ""}`);
        }
        if (row.id && !knownIdsRef.current.has(row.id)) {
          setNewIds(prev => new Set(prev).add(row.id));
          setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(row.id); return n; }), 10000);
        }
        fetchListRef.current(); fetchStatsRef.current();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_orders" }, (payload) => {
        const row: any = payload.new;
        if (
          row?.status === "SIAP_KIRIM" &&
          userId && row.created_by === userId &&
          !isPrepSilent(userRole) &&
          !notifiedDoneRef.current.has(row.id)
        ) {
          notifiedDoneRef.current.add(row.id);
          showToast("✅ Barang siap dikirim!", `${row.customer_name ?? "Customer"} · ${row.order_number ?? ""}`);
        }
        fetchListRef.current(); fetchStatsRef.current();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "preparation_orders" }, () => {
        fetchListRef.current(); fetchStatsRef.current();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userRole, userId, showToast]);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const handleReceive = async (id: string) => {
    setReceivingId(id);
    try {
      const res = await fetch(`/api/preparation/${id}/receive`, { method: "POST" });
      const result = await res.json();
      if (result.success) window.location.href = `/dashboard/preparation/${id}`;
      else alert(result.message || "Gagal");
    } catch { alert("Terjadi kesalahan"); } finally { setReceivingId(null); }
  };

  // ── Preset kalender ──
  const applyPreset = (key: string) => {
    const now = new Date();
    if (key === "today") { const t = ymd(now); setFromDate(t); setToDate(t); setAllTime(false); }
    else if (key === "7d") { setFromDate(ymd(new Date(Date.now() - 6 * 86400000))); setToDate(ymd(now)); setAllTime(false); }
    else if (key === "month") { setFromDate(ymd(new Date(now.getFullYear(), now.getMonth(), 1))); setToDate(ymd(now)); setAllTime(false); }
    else if (key === "lastMonth") {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(ymd(f)); setToDate(ymd(t)); setAllTime(false);
    } else if (key === "all") { setAllTime(true); }
    setActivePreset(key);
  };

  const applyMonth = (m: string) => {
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    const [y, mo] = m.split("-").map(Number);
    const now = new Date();
    const last = new Date(y, mo, 0);
    setFromDate(ymd(new Date(y, mo - 1, 1)));
    setToDate(ymd(last > now ? now : last));
    setAllTime(false);
    setActivePreset("custom");
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sc = stats?.status_counts;
  const rangeLabel = allTime ? "Semua Waktu" : `${fmtRange(fromDate)} — ${fmtRange(toDate)}`;
  const monthValue = fromDate.slice(0, 7);

  const inputCls = "h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed";

  const PRESETS = [
    { key: "today", label: "Hari Ini" },
    { key: "7d", label: "7 Hari" },
    { key: "month", label: "Bulan Ini" },
    { key: "lastMonth", label: "Bulan Lalu" },
    { key: "all", label: "Semua" },
  ];

  const STAT_CARDS = [
    { key: "MENUNGGU", label: "Menunggu", value: sc?.menunggu ?? 0, color: "amber", icon: "⏳" },
    { key: "DIPROSES", label: "Diproses", value: sc?.diproses ?? 0, color: "blue", icon: "🔧" },
    { key: "DIKIRIM", label: "Dikirim", value: sc?.dikirim ?? 0, color: "violet", icon: "🚚" },
    { key: "SELESAI", label: "Selesai", value: sc?.selesai ?? 0, color: "emerald", icon: "✅" },
  ];
  const statColor: Record<string, string> = {
    amber: "from-amber-50 to-amber-100/50 border-amber-200 text-amber-700",
    blue: "from-blue-50 to-blue-100/50 border-blue-200 text-blue-700",
    violet: "from-violet-50 to-violet-100/50 border-violet-200 text-violet-700",
    emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-700",
  };

  const boardGroups = [
    { key: "formats", title: "Paling Banyak Buat Format", sub: "Sales input penyiapan", icon: "📝", rows: stats?.formats ?? [] },
    { key: "prepared", title: "Paling Banyak Menyiapkan", sub: "Penyedia cek → siap kirim", icon: "📦", rows: stats?.prepared ?? [] },
    { key: "delivered", title: "Paling Banyak Mengantar", sub: "Pengantar selesai antar", icon: "🛵", rows: stats?.delivered ?? [] },
  ];
  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  const TABS = [
    { value: "ALL", label: "Semua" },
    { value: "MENUNGGU", label: "Menunggu" },
    { value: "DIPROSES", label: "Diproses" },
    { value: "SIAP_KIRIM", label: "Siap Kirim" },
    { value: "DIKIRIM", label: "Dikirim" },
    { value: "SELESAI", label: "Selesai" },
  ];

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        {toast && (
          <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="bg-white border-2 border-emerald-300 rounded-2xl shadow-2xl shadow-emerald-900/20 px-4 py-3.5 flex items-center gap-3 max-w-sm">
              <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0 animate-bounce">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-gray-900 truncate">{toast.title}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{toast.sub}</p>
              </div>
              <button onClick={() => setToast(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Dashboard Penyiapan</h1>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />LIVE
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Format SN dari sales → disiapkan penyedia barang</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSoundOn(v => !v)}
                title={soundOn ? "Suara notif aktif" : "Suara notif mati"}
                className={`w-9 h-9 flex items-center justify-center rounded-xl border transition ${soundOn ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-gray-100 border-gray-200 text-gray-400"}`}>
                {soundOn ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l4-4m0 4l-4-4" /></svg>
                )}
              </button>
              {canCreate && (
                <button onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 h-9 px-4 bg-gray-800 rounded-xl text-sm font-semibold text-white hover:bg-gray-900 active:scale-[0.97] transition shadow-lg shadow-gray-800/25">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  Buat Penyiapan
                </button>
              )}
            </div>
          </div>

          {/* View toggle */}
          <div className="inline-flex bg-white border border-gray-200 rounded-xl p-1 gap-1">
            {[
              { v: "list", label: "📋 Daftar" },
              { v: "board", label: "🏆 Papan Peringkat" },
            ].map(t => (
              <button key={t.v} onClick={() => setViewMode(t.v as "list" | "board")}
                className={`px-4 h-9 rounded-lg text-sm font-bold transition ${viewMode === t.v ? "bg-[#1a1a2e] text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Periode / kalender */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map(p => (
                <button key={p.key} onClick={() => applyPreset(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activePreset === p.key ? "bg-[#1a1a2e] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {p.label}
                </button>
              ))}
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                📅 {rangeLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dari</label>
                <input type="date" value={fromDate} max={toDate} disabled={allTime}
                  onChange={e => { setAllTime(false); setActivePreset("custom"); setFromDate(e.target.value); }} className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sampai</label>
                <input type="date" value={toDate} min={fromDate} max={ymd(new Date())} disabled={allTime}
                  onChange={e => { setAllTime(false); setActivePreset("custom"); setToDate(e.target.value); }} className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pilih Bulan</label>
                <input type="month" value={monthValue} max={ymd(new Date()).slice(0, 7)} disabled={allTime}
                  onChange={e => applyMonth(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Stat cards (berbasis periode terpilih) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {STAT_CARDS.map(s => (
              <button key={s.key} onClick={() => { setViewMode("list"); setStatusFilter(s.key); }}
                className={`bg-gradient-to-br ${statColor[s.color]} border rounded-2xl p-3 text-left transition hover:scale-[1.02] active:scale-95`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-2xl font-black tabular-nums">{statsLoading ? "…" : s.value}</span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">{s.label}</p>
              </button>
            ))}
          </div>

          {/* ── BOARD ── */}
          {viewMode === "board" ? (
            <>
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">🏆</span>
                <div>
                  <p className="text-sm font-bold text-indigo-800">Papan Peringkat · {rangeLabel}</p>
                  <p className="text-xs text-indigo-600">Default bulan berjalan (reset otomatis tiap bulan). Ganti periode/pilih bulan untuk lihat bulan sebelumnya.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {boardGroups.map(g => (
                  <div key={g.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-xl">{g.icon}</span>
                      <div>
                        <h3 className="text-sm font-black text-gray-800 leading-tight">{g.title}</h3>
                        <p className="text-[11px] text-gray-400">{g.sub}</p>
                      </div>
                    </div>
                    {statsLoading ? (
                      <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-11 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                    ) : g.rows.length === 0 ? (
                      <div className="py-8 text-center text-xs text-gray-400">Belum ada data di periode ini</div>
                    ) : (
                      <div className="space-y-1.5">
                        {g.rows.slice(0, 10).map((r, i) => (
                          <div key={r.name + i}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2 border ${i === 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                            <span className={`w-7 text-center text-sm font-black ${i > 2 ? "text-gray-400" : ""}`}>{medal(i)}</span>
                            <span className="flex-1 min-w-0 text-sm font-bold text-gray-700 truncate">{r.name}</span>
                            <span className="text-sm font-black text-gray-900 tabular-nums">{r.total}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* ── LIST ── */
            <>
              {canDone && (sc?.menunggu ?? 0) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl">📥</span>
                  <div>
                    <p className="text-sm font-bold text-amber-800">{sc?.menunggu} penyiapan menunggu diproses</p>
                    <p className="text-xs text-amber-600">Total {sc?.unit_menunggu ?? 0} unit perlu disiapkan</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3 sticky top-2 z-20">
                <div className="flex flex-wrap gap-1.5">
                  {TABS.map(t => (
                    <button key={t.value} onClick={() => setStatusFilter(t.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${statusFilter === t.value ? "bg-[#1a1a2e] text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor, customer, WA, SN..."
                    className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="h-44 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
              ) : orders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
                  <div className="text-4xl mb-3 opacity-40">📦</div>
                  <p className="text-gray-500 text-sm font-medium">
                    {debouncedSearch || statusFilter !== "ALL" || !allTime ? "Tidak ada penyiapan yang cocok di periode/filter ini" : "Belum ada penyiapan barang"}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {orders.map(o => (
                      <OrderCard key={o.id} o={o} canReceive={canDone} receivingId={receivingId} onReceive={handleReceive} isNew={newIds.has(o.id)} />
                    ))}
                  </div>

                  {total > PAGE_SIZE && (
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-gray-400">
                        Halaman <span className="font-bold text-gray-600">{page}</span> dari {totalPages} · {total} total
                      </p>
                      <div className="flex items-center gap-2">
                        <button disabled={page <= 1 || isLoading} onClick={() => setPage(p => Math.max(1, p - 1))}
                          className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition">← Sebelumnya</button>
                        <button disabled={page >= totalPages || isLoading} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition">Berikutnya →</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { fetchList(); fetchStats(); }} />}
    </DashboardLayout>
  );
}