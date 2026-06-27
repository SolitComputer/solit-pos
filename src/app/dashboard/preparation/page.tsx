"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import { supabase } from "@/services/supabase";
import { playNotifSound, unlockAudio } from "@/lib/preparationSound";

interface PrepItem { id: string; serial_number: string; laptop_name: string | null; is_checked: boolean }
interface PrepOrder {
  id: string; order_number: string; customer_name: string; customer_phone: string | null;
  status: string; delivery_method: string | null;
  created_by_name: string | null; created_by_role: string | null;
  received_by_name: string | null; done_by_name: string | null;
  delivery_address: string | null; created_at: string;
  preparation_items: PrepItem[];
}

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  MENUNGGU: { label: "Menunggu", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
  DIPROSES: { label: "Diproses", badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  DIKIRIM: { label: "Dikirim", badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  SELESAI: { label: "Selesai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  DIBATALKAN: { label: "Batal", badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400" },
};
const DELIVERY_META: Record<string, { label: string; icon: string }> = {
  DIAMBIL_CUSTOMER: { label: "Diambil Customer", icon: "🧍" },
  PENGANTARAN: { label: "Pengantaran", icon: "🛵" },
  KURIR: { label: "Kurir", icon: "📦" },
};

// Tanggal lengkap: "Sen, 27 Jun 2026"
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
// Jam: "14:32"
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

// Relatif: "Baru saja", "5 mnt lalu", "2 jam lalu"
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const d = Math.floor(hr / 24);
  return `${d} hr lalu`;
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
          delivery_address: deliveryAddress.trim() || null, notes: notes.trim() || null, items,
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
              <input value={manualSN} onChange={e => setManualSN(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
                placeholder="Atau ketik SN manual..." className={`${inputCls} font-mono`} />
              <button type="button" onClick={addManual} className="px-4 h-10 rounded-xl bg-[#1a1a2e] text-white text-sm font-semibold hover:bg-[#16213e] transition whitespace-nowrap">+ Tambah</button>
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

// ── Kartu order ──────────────────────────────────────────────────────
function OrderCard({ o, canDone, receivingId, onReceive, isNew }: {
  o: PrepOrder; canDone: boolean; receivingId: string | null;
  onReceive: (id: string) => void; isNew: boolean;
}) {
  const sm = STATUS_META[o.status] ?? STATUS_META.MENUNGGU;
  const dm = o.delivery_method ? DELIVERY_META[o.delivery_method] : null;
  const checked = o.preparation_items.filter(it => it.is_checked).length;
  const total = o.preparation_items.length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 transition hover:shadow-md ${isNew ? "border-emerald-300 ring-2 ring-emerald-100" : "border-gray-100"}`}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-mono text-xs font-bold text-gray-700">{o.order_number}</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${sm.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{sm.label}
            </span>
            {dm && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200">{dm.icon} {dm.label}</span>}
            {isNew && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white animate-pulse">BARU</span>}
          </div>
          <p className="text-base font-black text-gray-900 leading-tight">{o.customer_name}</p>
          {o.customer_phone && <p className="text-xs text-gray-500 mt-0.5">📱 {o.customer_phone}</p>}
        </div>

        {/* Tanggal + jam lengkap */}
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] font-bold text-gray-700">{fmtTime(o.created_at)}</p>
          <p className="text-[10px] text-gray-400">{fmtDate(o.created_at)}</p>
          <p className="text-[9px] text-gray-300 mt-0.5">{timeAgo(o.created_at)}</p>
        </div>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-2 flex-wrap text-xs mb-2.5">
        <span className="bg-gray-100 px-2 py-1 rounded-lg font-bold text-gray-700">{total} unit</span>
        {o.status === "DIPROSES" && (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-bold border border-blue-100">
            {checked}/{total} dicek · {pct}%
          </span>
        )}
        {o.created_by_name && <span className="text-gray-400">oleh <span className="font-semibold text-gray-600">{o.created_by_name}</span></span>}
      </div>

      {/* Progress bar (saat diproses) */}
      {o.status === "DIPROSES" && total > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2.5">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* SN chips */}
      <div className="flex flex-wrap gap-1 mb-3">
        {o.preparation_items.slice(0, 6).map(it => (
          <span key={it.id} className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${it.is_checked ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-600"}`}>{it.serial_number}</span>
        ))}
        {total > 6 && <span className="text-[10px] text-gray-400 px-1 self-center">+{total - 6} lagi</span>}
      </div>

      {o.delivery_address && (
        <p className="text-[11px] text-gray-400 mb-3 truncate">📍 {o.delivery_address}</p>
      )}

      <div className="flex gap-2">
        {o.status === "MENUNGGU" && canDone && (
          <button onClick={() => onReceive(o.id)} disabled={receivingId === o.id}
            className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50">
            {receivingId === o.id ? "Memproses..." : "📥 Terima & Cek"}
          </button>
        )}
        <Link href={`/dashboard/preparation/${o.id}`}
          className="flex-1 h-9 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition flex items-center justify-center">
          Lihat Detail →
        </Link>
      </div>
    </div>
  );
}

export default function PreparationPage() {
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  // Toast notif realtime
  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tandai order baru (highlight beberapa detik)
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

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
    fetch("/api/auth/me").then(r => r.json()).then(r => setUserRole(r.user?.role ?? null)).catch(() => setUserRole(null));
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/preparation");
      const result = await res.json();
      const data: PrepOrder[] = result.data || [];
      setOrders(data);
      // Catat semua ID yang sudah pernah dilihat
      data.forEach(o => knownIdsRef.current.add(o.id));
    } catch { setOrders([]); } finally {
      setIsLoading(false);
      isFirstLoadRef.current = false;
    }
  }, []);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Realtime ──
  useEffect(() => {
    if (!userRole) return;

    const channel = supabase
      .channel("preparation-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "preparation_orders" },
        (payload) => {
          const row: any = payload.new;
          if (canDone) {
            showToast(
              "📦 Penyiapan baru masuk!",
              `${row.customer_name ?? "Customer"} · ${row.order_number ?? ""}`
            );
          }
          // Highlight kartu baru selama 10 detik
          if (row.id && !knownIdsRef.current.has(row.id)) {
            setNewIds(prev => new Set(prev).add(row.id));
            setTimeout(() => {
              setNewIds(prev => { const next = new Set(prev); next.delete(row.id); return next; });
            }, 10000);
          }
          fetchOrders();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "preparation_orders" },
        () => { fetchOrders(); }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "preparation_orders" },
        () => { fetchOrders(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userRole, canDone, showToast, fetchOrders]);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  const handleReceive = async (id: string) => {
    setReceivingId(id);
    try {
      const res = await fetch(`/api/preparation/${id}/receive`, { method: "POST" });
      const result = await res.json();
      if (result.success) window.location.href = `/dashboard/preparation/${id}`;
      else alert(result.message || "Gagal");
    } catch { alert("Terjadi kesalahan"); } finally { setReceivingId(null); }
  };

  const filtered = useMemo(() => {
    let list = [...orders];
    if (statusFilter !== "ALL") list = list.filter(o => o.status === statusFilter);
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(o =>
        o.order_number.toLowerCase().includes(t) ||
        o.customer_name.toLowerCase().includes(t) ||
        (o.customer_phone || "").toLowerCase().includes(t) ||
        o.preparation_items.some(it => it.serial_number.toLowerCase().includes(t))
      );
    }
    return list;
  }, [orders, statusFilter, search]);

  const counts = useMemo(() => ({
    ALL: orders.length,
    MENUNGGU: orders.filter(o => o.status === "MENUNGGU").length,
    DIPROSES: orders.filter(o => o.status === "DIPROSES").length,
    DIKIRIM: orders.filter(o => o.status === "DIKIRIM").length,
    SELESAI: orders.filter(o => o.status === "SELESAI").length,
  }), [orders]);

  // Total unit yang nunggu disiapkan (buat highlight beban kerja)
  const totalUnitMenunggu = useMemo(
    () => orders.filter(o => o.status === "MENUNGGU").reduce((s, o) => s + o.preparation_items.length, 0),
    [orders]
  );

  const TABS = [
    { value: "ALL", label: "Semua" },
    { value: "MENUNGGU", label: "Menunggu" },
    { value: "DIPROSES", label: "Diproses" },
    { value: "DIKIRIM", label: "Dikirim" },
    { value: "SELESAI", label: "Selesai" },
  ];

  const STAT_CARDS = [
    { label: "Menunggu", value: counts.MENUNGGU, color: "amber", icon: "⏳" },
    { label: "Diproses", value: counts.DIPROSES, color: "blue", icon: "🔧" },
    { label: "Dikirim", value: counts.DIKIRIM, color: "violet", icon: "🚚" },
    { label: "Selesai", value: counts.SELESAI, color: "emerald", icon: "✅" },
  ];
  const statColor: Record<string, string> = {
    amber: "from-amber-50 to-amber-100/50 border-amber-200 text-amber-700",
    blue: "from-blue-50 to-blue-100/50 border-blue-200 text-blue-700",
    violet: "from-violet-50 to-violet-100/50 border-violet-200 text-violet-700",
    emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-700",
  };

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        {/* Toast notif realtime */}
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
                  <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Penyiapan Barang</h1>
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

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {STAT_CARDS.map(s => (
              <button key={s.label} onClick={() => setStatusFilter(s.label === "Menunggu" ? "MENUNGGU" : s.label === "Diproses" ? "DIPROSES" : s.label === "Dikirim" ? "DIKIRIM" : "SELESAI")}
                className={`bg-gradient-to-br ${statColor[s.color]} border rounded-2xl p-3 text-left transition hover:scale-[1.02] active:scale-95`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-2xl font-black tabular-nums">{s.value}</span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">{s.label}</p>
              </button>
            ))}
          </div>

          {/* Banner beban kerja (kalau ada yang nunggu & user penyedia) */}
          {canDone && counts.MENUNGGU > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">📥</span>
              <div>
                <p className="text-sm font-bold text-amber-800">
                  {counts.MENUNGGU} penyiapan menunggu diproses
                </p>
                <p className="text-xs text-amber-600">Total {totalUnitMenunggu} unit perlu disiapkan</p>
              </div>
            </div>
          )}

          {/* Tabs + Search (sticky biar gampang pas data banyak) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3 sticky top-2 z-20">
            <div className="flex flex-wrap gap-1.5">
              {TABS.map(t => (
                <button key={t.value} onClick={() => setStatusFilter(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${statusFilter === t.value ? "bg-[#1a1a2e] text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>
                  {t.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${statusFilter === t.value ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>
                    {counts[t.value as keyof typeof counts]}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor, customer, WA, SN..."
                className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
            </div>
            {(search || statusFilter !== "ALL") && (
              <p className="text-[11px] text-gray-400 px-1">
                Menampilkan <span className="font-bold text-gray-600">{filtered.length}</span> dari {orders.length} penyiapan
              </p>
            )}
          </div>

          {/* List */}
          {isLoading ? (
            <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="h-44 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <div className="text-4xl mb-3 opacity-40">📦</div>
              <p className="text-gray-500 text-sm font-medium">
                {search || statusFilter !== "ALL" ? "Tidak ada penyiapan yang cocok" : "Belum ada penyiapan barang"}
              </p>
              {(search || statusFilter !== "ALL") && (
                <button onClick={() => { setSearch(""); setStatusFilter("ALL"); }} className="mt-3 text-xs text-blue-600 hover:underline">Reset filter</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {filtered.map(o => (
                <OrderCard
                  key={o.id}
                  o={o}
                  canDone={canDone}
                  receivingId={receivingId}
                  onReceive={handleReceive}
                  isNew={newIds.has(o.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={fetchOrders} />}
    </DashboardLayout>
  );
}