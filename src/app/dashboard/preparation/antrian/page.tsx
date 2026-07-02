"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import { supabase } from "@/services/supabase";
import { playNotifSound, unlockAudio } from "@/lib/preparationSound";
import { OrderCard, type PrepOrder } from "@/components/preparation/prepShared";
import { usePrepAlarm, ALARM_KEYS, isPrepProvider, isPrepSilent } from "@/lib/prepAlarm";

export default function PreparationAntrianPage() {
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MENUNGGU" | "DIPROSES">("ALL");
  const [search, setSearch] = useState("");
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());

  const canDone = userRole ? hasPermission(userRole, PERMISSIONS.DONE_PREPARATION) : false;

  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const menungguOrders = useMemo(
    () => orders.filter((o) => o.status === "MENUNGGU"),
    [orders]
  );

  const canHearIncoming = isPrepProvider(userRole) && !isPrepSilent(userRole);

  const { unackedCount: alarmCount, unackedIds: alarmIds, acknowledge } = usePrepAlarm(
    menungguOrders,
    ALARM_KEYS.MENUNGGU,
    soundOn && canHearIncoming   
  );

  const didInitAckRef = useRef(false);
  useEffect(() => {
    if (didInitAckRef.current || isLoading) return;
    menungguOrders.forEach((o) => acknowledge(o.id));
    didInitAckRef.current = true;
  }, [isLoading, menungguOrders, acknowledge]);

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
      const queue = data.filter(o => o.status === "MENUNGGU" || o.status === "DIPROSES");
      setOrders(queue);
      queue.forEach(o => knownIdsRef.current.add(o.id));
    } catch { setOrders([]); } finally { setIsLoading(false); }
  }, []);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    if (!userRole) return;
    const channel = supabase
      .channel("prep-antrian-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "preparation_orders" }, (payload) => {
        const row: any = payload.new;
        showToast("📦 Penyiapan baru masuk!", `${row.customer_name ?? "Customer"} · ${row.order_number ?? ""}`);
        if (row.id && !knownIdsRef.current.has(row.id)) {
          setNewIds(prev => new Set(prev).add(row.id));
          setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(row.id); return n; }), 10000);
        }
        fetchOrders();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_orders" }, () => fetchOrders())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "preparation_orders" }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userRole, showToast, fetchOrders]);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const handleReceive = async (id: string) => {
    acknowledge(id);
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
    // MENUNGGU duluan (paling butuh aksi), lalu terbaru
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "MENUNGGU" ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [orders, statusFilter, search]);

  const counts = useMemo(() => ({
    ALL: orders.length,
    MENUNGGU: orders.filter(o => o.status === "MENUNGGU").length,
    DIPROSES: orders.filter(o => o.status === "DIPROSES").length,
  }), [orders]);

  const totalUnitMenunggu = useMemo(
    () => orders.filter(o => o.status === "MENUNGGU").reduce((s, o) => s + o.preparation_items.length, 0),
    [orders]
  );

  const TABS = [
    { value: "ALL", label: "Semua Antrian" },
    { value: "MENUNGGU", label: "Menunggu" },
    { value: "DIPROSES", label: "Diproses" },
  ] as const;

  const STAT = [
    { label: "Menunggu", value: counts.MENUNGGU, color: "from-amber-50 to-amber-100/50 border-amber-200 text-amber-700", icon: "⏳" },
    { label: "Diproses", value: counts.DIPROSES, color: "from-blue-50 to-blue-100/50 border-blue-200 text-blue-700", icon: "🔧" },
    { label: "Unit Antri", value: totalUnitMenunggu, color: "from-violet-50 to-violet-100/50 border-violet-200 text-violet-700", icon: "💻" },
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

        {alarmCount > 0 && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] animate-in slide-in-from-top-2 duration-300">
            <div className="bg-red-600 text-white px-5 py-2.5 rounded-full shadow-2xl shadow-red-900/40 flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse flex-shrink-0" />
              <p className="text-sm font-black">🔔 {alarmCount} penyiapan menunggu diterima!</p>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Antrian Penyiapan</h1>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />LIVE
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Barang masuk dari sales → terima & siapkan</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/preparation/done" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                Selesai Disiapkan →
              </Link>
              <button onClick={() => setSoundOn(v => !v)}
                title={soundOn ? "Suara notif aktif" : "Suara notif mati"}
                className={`w-9 h-9 flex items-center justify-center rounded-xl border transition ${soundOn ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-gray-100 border-gray-200 text-gray-400"}`}>
                {soundOn ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l4-4m0 4l-4-4" /></svg>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {STAT.map(s => (
              <div key={s.label} className={`bg-gradient-to-br ${s.color} border rounded-2xl p-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-2xl font-black tabular-nums">{s.value}</span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">{s.label}</p>
              </div>
            ))}
          </div>

          {counts.MENUNGGU > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">📥</span>
              <div>
                <p className="text-sm font-bold text-amber-800">{counts.MENUNGGU} penyiapan menunggu diterima</p>
                <p className="text-xs text-amber-600">Total {totalUnitMenunggu} unit perlu disiapkan</p>
              </div>
            </div>
          )}

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
          </div>

          {isLoading ? (
            <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="h-44 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <div className="text-4xl mb-3">🎉</div>
              <p className="text-gray-500 text-sm font-medium">Antrian kosong — semua barang sudah disiapkan</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {filtered.map((o) => (
                <OrderCard
                  key={o.id}
                  o={o}
                  canReceive={canDone}
                  receivingId={receivingId}
                  onReceive={handleReceive}
                  isNew={newIds.has(o.id) || alarmIds.has(o.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}