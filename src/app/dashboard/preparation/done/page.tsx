"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import { OrderCard, type PrepOrder } from "@/components/preparation/prepShared";

export default function PreparationDonePage() {
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DIKIRIM" | "SELESAI">("ALL");
  const [search, setSearch] = useState("");

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/preparation");
      const result = await res.json();
      const data: PrepOrder[] = result.data || [];
      const done = data.filter(o => o.status === "DIKIRIM" || o.status === "SELESAI");
      setOrders(done);
    } catch { setOrders([]); } finally { setIsLoading(false); }
  }, []);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    const channel = supabase
      .channel("prep-done-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "preparation_orders" }, () => fetchOrders())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "preparation_orders" }, () => fetchOrders())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "preparation_orders" }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders]);

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
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, statusFilter, search]);

  const counts = useMemo(() => ({
    ALL: orders.length,
    DIKIRIM: orders.filter(o => o.status === "DIKIRIM").length,
    SELESAI: orders.filter(o => o.status === "SELESAI").length,
  }), [orders]);

  const TABS = [
    { value: "ALL", label: "Semua" },
    { value: "DIKIRIM", label: "Dikirim" },
    { value: "SELESAI", label: "Selesai" },
  ] as const;

  const STAT = [
    { label: "Dikirim", value: counts.DIKIRIM, color: "from-violet-50 to-violet-100/50 border-violet-200 text-violet-700", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
    { label: "Selesai", value: counts.SELESAI, color: "from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-700", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
    { label: "Total", value: counts.ALL, color: "from-gray-50 to-gray-100/50 border-gray-200 text-gray-700", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
  ];

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 12l2 2 4-4" /><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Selesai Disiapkan</h1>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Barang yang sudah dikirim / selesai</p>
              </div>
            </div>
            <Link href="/dashboard/preparation/antrian" className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
              ← Antrian Masuk
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {STAT.map(s => (
              <div key={s.label} className={`bg-gradient-to-br ${s.color} border rounded-2xl p-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-current opacity-70">{s.icon}</span>
                  <span className="text-2xl font-black tabular-nums">{s.value}</span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">{s.label}</p>
              </div>
            ))}
          </div>

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
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <p className="text-gray-500 text-sm font-medium">Belum ada barang yang selesai disiapkan</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {filtered.map(o => <OrderCard key={o.id} o={o} />)}
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}