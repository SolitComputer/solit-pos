"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

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
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

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

          {/* SN dari inventaris */}
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

            {/* Manual */}
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

export default function PreparationPage() {
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const canCreate = userRole ? hasPermission(userRole, PERMISSIONS.CREATE_PREPARATION) : false;
  const canDone = userRole ? hasPermission(userRole, PERMISSIONS.DONE_PREPARATION) : false;

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(r => setUserRole(r.user?.role ?? null)).catch(() => setUserRole(null));
  }, []);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/preparation");
      const result = await res.json();
      setOrders(result.data || []);
    } catch { setOrders([]); } finally { setIsLoading(false); }
  }, []);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

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

  const TABS = [
    { value: "ALL", label: "Semua" },
    { value: "MENUNGGU", label: "Menunggu" },
    { value: "DIPROSES", label: "Diproses" },
    { value: "DIKIRIM", label: "Dikirim" },
    { value: "SELESAI", label: "Selesai" },
  ];

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
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
                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Penyiapan Barang</h1>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Format SN dari sales → disiapkan penyedia barang</p>
              </div>
            </div>
            {canCreate && (
              <button onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 h-9 px-4 bg-gray-800 rounded-xl text-sm font-semibold text-white hover:bg-gray-900 active:scale-[0.97] transition shadow-lg shadow-gray-800/25">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                Buat Penyiapan
              </button>
            )}
          </div>

          {/* Tabs + Search */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3">
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
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor, customer, SN..."
                className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
            </div>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <div className="text-4xl mb-3 opacity-40">📦</div>
              <p className="text-gray-500 text-sm font-medium">Belum ada penyiapan barang</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map(o => {
                const sm = STATUS_META[o.status] ?? STATUS_META.MENUNGGU;
                const dm = o.delivery_method ? DELIVERY_META[o.delivery_method] : null;
                const checked = o.preparation_items.filter(it => it.is_checked).length;
                return (
                  <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-gray-700">{o.order_number}</span>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${sm.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{sm.label}
                          </span>
                          {dm && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200">{dm.icon} {dm.label}</span>}
                        </div>
                        <p className="text-sm font-bold text-gray-900 mt-1">{o.customer_name}</p>
                        {o.customer_phone && <p className="text-xs text-gray-500">📱 {o.customer_phone}</p>}
                      </div>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtDateTime(o.created_at)}</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                      <span className="bg-gray-100 px-2 py-1 rounded-lg font-semibold">{o.preparation_items.length} unit</span>
                      {o.status === "DIPROSES" && <span className="text-blue-600 font-semibold">{checked}/{o.preparation_items.length} dicek</span>}
                      {o.created_by_name && <span>oleh {o.created_by_name}</span>}
                    </div>

                    {/* SN chips */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {o.preparation_items.slice(0, 5).map(it => (
                        <span key={it.id} className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${it.is_checked ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{it.serial_number}</span>
                      ))}
                      {o.preparation_items.length > 5 && <span className="text-[10px] text-gray-400 px-1">+{o.preparation_items.length - 5} lagi</span>}
                    </div>

                    <div className="flex gap-2">
                      {o.status === "MENUNGGU" && canDone && (
                        <button onClick={() => handleReceive(o.id)} disabled={receivingId === o.id}
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
              })}
            </div>
          )}
        </div>
      </main>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={fetchOrders} />}
    </DashboardLayout>
  );
}