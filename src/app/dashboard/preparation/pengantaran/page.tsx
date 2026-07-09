"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import { playNotifSound, unlockAudio } from "@/lib/preparationSound";
import { usePrepAlarm, ALARM_KEYS } from "@/lib/prepAlarm";

interface PrepItem { id: string; serial_number: string; laptop_name: string | null; is_checked: boolean }
interface MyDelivery {
  id: string; order_number: string; customer_name: string; customer_phone: string | null;
  status: string; delivery_method: string | null; notes: string | null;
  delivery_address: string | null;
  delivery_accepted_at: string | null;
  delivery_started_at: string | null; delivered_at: string | null;
  return_started_at: string | null; returned_at: string | null;
  delivery_distance_m: number | null; delivery_duration_s: number | null;
  created_at: string; updated_at: string;
  preparation_items: PrepItem[]; scheduled_delivery_date: string | null;
}

type Phase = "MENUNGGU_SETUJU" | "PERLU_ANTAR" | "SEDANG_ANTAR" | "PULANG" | "SELESAI";

function getPhase(o: MyDelivery): Phase {
  if (o.status === "MENUNGGU_PENGANTAR") return "MENUNGGU_SETUJU";
  if (o.status === "DIKIRIM") return o.delivery_started_at ? "SEDANG_ANTAR" : "PERLU_ANTAR";
  if (o.status === "SELESAI" && o.return_started_at && !o.returned_at) return "PULANG";
  return "SELESAI";
}

const PHASE_META: Record<Phase, { label: string; badge: string; dot: string; cta: string; pulse?: boolean }> = {
  MENUNGGU_SETUJU: { label: "Perlu Disetujui", badge: "bg-yellow-50 text-yellow-700 border-yellow-200", dot: "bg-yellow-500", cta: "✅ Setujui Tugas", pulse: true },
  PERLU_ANTAR: { label: "Perlu Diantar", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", cta: "🎯 Mulai Antar", pulse: true },
  SEDANG_ANTAR: { label: "Sedang Diantar", badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", cta: "📍 Lanjutkan Antar", pulse: true },
  PULANG: { label: "Perjalanan Pulang", badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500", cta: "🏠 Lihat Perjalanan", pulse: true },
  SELESAI: { label: "Selesai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", cta: "Lihat Detail" },
};

const fmtSched = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short" });

function DeliveryTimer({ start, end }: { start: string; end?: string | null }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const update = () => {
      const endTime = end ? new Date(end).getTime() : Date.now();
      const diff = endTime - new Date(start).getTime();
      if (diff < 0) { setElapsed("0m 0s"); return; }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);
      let text = "";
      if (h > 0) text += `${h}j `;
      text += `${m}m ${s}d`;
      setElapsed(text);
    };
    update();
    if (end) return;
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [start, end]);

  return (
    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded flex items-center gap-1 ${end ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-orange-50 text-orange-700 border-orange-100"}`}>
      ⏱️ Aktual: <span className="font-mono tabular-nums">{elapsed}</span>
    </span>
  );
}

function DeliveryCard({ o, isNew }: { o: MyDelivery; isNew?: boolean }) {
  const phase = getPhase(o);
  const meta = PHASE_META[phase];
  const [showAllSN, setShowAllSN] = useState(false);
  const items = o.preparation_items ?? [];
  const shown = showAllSN ? items : items.slice(0, 3);

  return (
    <Link href={`/dashboard/preparation/${o.id}`}
      className={`block bg-white rounded-2xl border shadow-sm p-4 transition hover:shadow-md hover:border-gray-200 ${isNew ? "border-emerald-300 ring-2 ring-emerald-200" : "border-gray-100"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-mono text-xs font-bold text-gray-700">{o.order_number}</span>
            <span className={`inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border ${meta.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${meta.pulse ? "animate-pulse" : ""}`} />{meta.label}
            </span>
            {isNew && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white animate-pulse">BARU</span>}
          </div>
          <p className="text-base font-black text-gray-900 leading-tight truncate">{o.customer_name}</p>
          {o.customer_phone && (
            <a href={`tel:${o.customer_phone}`} onClick={(e) => e.stopPropagation()}
              className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5">
              📱 {o.customer_phone}
            </a>
          )}
        </div>
      </div>

      {o.delivery_address && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 mb-2 flex items-start gap-2">
          <span className="text-sm flex-shrink-0">📍</span>
          <p className="text-xs text-gray-600 leading-snug">{o.delivery_address}</p>
        </div>
      )}

      {o.scheduled_delivery_date && (
        <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1 mb-2">
          <span className="text-xs">📅</span>
          <span className="text-[11px] font-bold text-indigo-700">Antar: {fmtSched(o.scheduled_delivery_date)}</span>
        </div>
      )}

      <div className="mb-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Unit yang diantar ({items.length})</p>
        <div className="space-y-1">
          {shown.map((it) => (
            <div key={it.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
              <span className="font-mono text-xs font-bold text-gray-800">{it.serial_number}</span>
              {it.laptop_name && <span className="text-[10px] text-gray-400 truncate">· {it.laptop_name}</span>}
            </div>
          ))}
          {items.length > 3 && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAllSN((v) => !v); }}
              className="text-[11px] text-blue-600 hover:underline font-semibold">
              {showAllSN ? "Sembunyikan" : `+${items.length - 3} unit lagi`}
            </button>
          )}
        </div>
      </div>

      {(o.delivery_distance_m || o.delivery_duration_s || o.delivery_accepted_at) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {o.delivery_distance_m != null && <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded">📏 {(o.delivery_distance_m / 1000).toFixed(1)} km</span>}
          {o.delivery_duration_s != null && <span className="text-[10px] font-bold bg-gray-50 text-gray-700 border border-gray-100 px-2 py-0.5 rounded flex items-center gap-1">Estimasi: <span className="font-mono tabular-nums">{Math.round(o.delivery_duration_s / 60)} mnt</span></span>}
          {o.delivery_accepted_at && (
            <DeliveryTimer start={o.delivery_accepted_at} end={o.delivered_at} />
          )}
        </div>
      )}

      <div className={`mt-2 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition ${phase === "SELESAI" ? "bg-gray-100 text-gray-600" : "bg-[#1a1a2e] text-white"}`}>
        {meta.cta} →
      </div>
    </Link>
  );
}

export default function MyDeliveryPage() {
  const [orders, setOrders] = useState<MyDelivery[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"AKTIF" | "SELESAI" | "ALL">("AKTIF");
  const [search, setSearch] = useState("");

  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialRef = useRef(true);

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
    fetch("/api/auth/me").then((r) => r.json()).then((r) => setUserId(r.user?.id ?? null)).catch(() => setUserId(null));
  }, []);

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await fetch("/api/preparation/my-deliveries", { cache: "no-store" });
      const r = await res.json();
      const data: MyDelivery[] = r.success ? (r.data || []) : [];
      setOrders(data);

      const activeIds = data.filter((o) => o.status === "DIKIRIM" && !o.delivered_at).map((o) => o.id);
      if (!initialRef.current) {
        const fresh = activeIds.filter((id) => !knownIdsRef.current.has(id));
        if (fresh.length) {
          const o = data.find((d) => d.id === fresh[0]);
          showToast("🛵 Tugas antar baru!", `${o?.customer_name ?? "Customer"} · ${o?.order_number ?? ""}`);
          setNewIds((prev) => { const n = new Set(prev); fresh.forEach((id) => n.add(id)); return n; });
          fresh.forEach((id) => setTimeout(() => setNewIds((prev) => { const n = new Set(prev); n.delete(id); return n; }), 12000));
        }
      }
      activeIds.forEach((id) => knownIdsRef.current.add(id));
      initialRef.current = false;
    } catch { setOrders([]); } finally { setIsLoading(false); }
  }, [showToast]);
  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`my-delivery-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "preparation_orders", filter: `delivery_user_id=eq.${userId}` }, () => fetchDeliveries())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, fetchDeliveries]);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const counts = useMemo(() => {
    const perlu = orders.filter((o) => getPhase(o) === "PERLU_ANTAR").length;
    const jalan = orders.filter((o) => { const p = getPhase(o); return p === "SEDANG_ANTAR" || p === "PULANG"; }).length;
    const selesai = orders.filter((o) => getPhase(o) === "SELESAI").length;
    return { perlu, jalan, selesai, all: orders.length, aktif: perlu + jalan };
  }, [orders]);

  const perluSetuju = useMemo(
    () => orders.filter((o) => o.status === "MENUNGGU_PENGANTAR"),
    [orders]
  );
  const { unackedIds: alarmIds, acknowledge: ackApproval } = usePrepAlarm(
    perluSetuju,
    ALARM_KEYS.APPROVAL,
    soundOn
  );

  const filtered = useMemo(() => {
    let list = [...orders];
    if (filter === "AKTIF") list = list.filter((o) => getPhase(o) !== "SELESAI");
    else if (filter === "SELESAI") list = list.filter((o) => getPhase(o) === "SELESAI");
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter((o) =>
        o.order_number.toLowerCase().includes(t) ||
        o.customer_name.toLowerCase().includes(t) ||
        (o.customer_phone || "").toLowerCase().includes(t) ||
        (o.delivery_address || "").toLowerCase().includes(t) ||
        (o.preparation_items ?? []).some((it) => it.serial_number.toLowerCase().includes(t))
      );
    }
    const rank: Record<Phase, number> = { MENUNGGU_SETUJU: 0, PERLU_ANTAR: 1, SEDANG_ANTAR: 2, PULANG: 3, SELESAI: 4 };
    return list.sort((a, b) => {
      const ra = rank[getPhase(a)], rb = rank[getPhase(b)];
      if (ra !== rb) return ra - rb;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [orders, filter, search]);

  const STAT = [
    { label: "Perlu Diantar", value: counts.perlu, color: "from-amber-50 to-amber-100/50 border-amber-200 text-amber-700", icon: "📦" },
    { label: "Sedang Jalan", value: counts.jalan, color: "from-violet-50 to-violet-100/50 border-violet-200 text-violet-700", icon: "🛵" },
    { label: "Selesai", value: counts.selesai, color: "from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-700", icon: "✅" },
  ];

  const TABS = [
    { value: "AKTIF", label: "Aktif", count: counts.aktif },
    { value: "SELESAI", label: "Selesai", count: counts.selesai },
    { value: "ALL", label: "Semua", count: counts.all },
  ] as const;

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

        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 003-3v-6M16 5H9a3 3 0 00-3 3v6" /></svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Tugas Pengantaran Saya</h1>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />LIVE
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Barang yang ditugaskan untuk kamu antar</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/preparation/history" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                Riwayat Pengantaran →
              </Link>
              <button onClick={() => setSoundOn((v) => !v)}
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
            {STAT.map((s) => (
              <div key={s.label} className={`bg-gradient-to-br ${s.color} border rounded-2xl p-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-2xl font-black tabular-nums">{s.value}</span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">{s.label}</p>
              </div>
            ))}
          </div>

          {counts.perlu > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">📦</span>
              <div>
                <p className="text-sm font-bold text-amber-800">{counts.perlu} barang siap diantar</p>
                <p className="text-xs text-amber-600">Tap kartunya buat mulai antar & aktifkan tracking</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3 sticky top-2 z-20">
            <div className="flex flex-wrap gap-1.5">
              {TABS.map((t) => (
                <button key={t.value} onClick={() => setFilter(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filter === t.value ? "bg-[#1a1a2e] text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>
                  {t.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${filter === t.value ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>{t.count}</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari customer, alamat, SN, no order..."
                className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2.5">{[1, 2, 3].map((i) => <div key={i} className="h-48 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <div className="text-4xl mb-3 opacity-40">🛵</div>
              <p className="text-gray-500 text-sm font-medium">
                {filter === "SELESAI" ? "Belum ada pengantaran selesai" : "Belum ada tugas pengantaran buat kamu"}
              </p>
              <p className="text-xs text-gray-400 mt-1">Tugas baru muncul otomatis kalau penyedia barang nugasin kamu.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((o) => (
                <div key={o.id} onClick={() => ackApproval(o.id)}>
                  <DeliveryCard o={o} isNew={newIds.has(o.id) || alarmIds.has(o.id)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}