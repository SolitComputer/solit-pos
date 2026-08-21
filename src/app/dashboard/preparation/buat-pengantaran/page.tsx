"use client";
// src/app/dashboard/preparation/buat-pengantaran/page.tsx
// Sales bikin Pengantaran LANGSUNG — skip antrian Penyedia Barang sama sekali.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Bike, Package, User, CheckCircle2, Truck, Search, Box,
  PackageSearch, ClipboardCheck, AlertCircle, X, UserCircle, Send,
  type LucideIcon,
} from "lucide-react";

interface PickedItem {
  serial_number: string;
  laptop_name?: string;
  laptop_id?: string;
  unit_id?: string;
}

type DeliveryMethod = "DIAMBIL_CUSTOMER" | "PENGANTARAN" | "KURIR";

const inputCls =
  "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1545]/20 focus:border-[#1a1545] focus:bg-white transition";

const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDaysLocal = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function SectionHeader({ step, icon: Icon, title }: { step: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-lg bg-[#1a1545]/[0.06] text-[#1a1545] text-[10px] font-black flex items-center justify-center flex-shrink-0">
        {step}
      </span>
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
    </div>
  );
}

const METHOD_LABEL: Record<DeliveryMethod, string> = {
  DIAMBIL_CUSTOMER: "Diambil Customer",
  PENGANTARAN: "Diantar Role Pengantaran",
  KURIR: "Diantar Kurir",
};

export default function BuatPengantaranPage() {
  const router = useRouter();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<PickedItem[]>([]);
  const [snSearch, setSnSearch] = useState("");
  const [snResults, setSnResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualSN, setManualSN] = useState("");

  const [method, setMethod] = useState<DeliveryMethod | null>(null);
  const [address, setAddress] = useState("");
  const [schedule, setSchedule] = useState<"TODAY" | "TOMORROW">("TODAY");
  const [drivers, setDrivers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [courierService, setCourierService] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [courierNote, setCourierNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSnResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/units/search-sn?q=${encodeURIComponent(q)}`);
      const result = await res.json();
      setSnResults(result.data || []);
    } catch { setSnResults([]); } finally { setSearching(false); }
  }, []);

  const addUnit = (u: any) => {
    setItems(prev => [...prev, {
      serial_number: u.serial_number,
      laptop_name: u.laptop_name ?? undefined,
      laptop_id: u.laptop_id ?? undefined,
      unit_id: u.id ?? undefined,
    }]);
    setSnSearch(""); setSnResults([]);
  };
  const addManual = () => {
    const sn = manualSN.trim();
    if (!sn) return;
    setItems(prev => [...prev, { serial_number: sn }]);
    setManualSN("");
  };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const loadDrivers = useCallback(() => {
    if (drivers.length > 0) return;
    setDriversLoading(true);
    fetch("/api/preparation/delivery-users")
      .then(r => r.json())
      .then(r => { if (r.success) setDrivers(r.data || []); })
      .catch(() => {})
      .finally(() => setDriversLoading(false));
  }, [drivers.length]);

  const selectMethod = (m: DeliveryMethod) => {
    setMethod(m);
    if (m === "PENGANTARAN") loadDrivers();
  };

  // ── Murni turunan buat kartu Ringkasan — tidak mengubah logic apa pun ──
  const summaryReady = useMemo(
    () => Boolean(customerName.trim() && items.length > 0 && method),
    [customerName, items.length, method]
  );

  const submit = async () => {
    setError("");
    if (!customerName.trim()) { setError("Nama customer wajib diisi"); return; }
    if (items.length === 0) { setError("Tambahkan minimal 1 serial number"); return; }
    if (!method) { setError("Pilih metode pengiriman"); return; }
    if (method === "PENGANTARAN" && !address.trim()) { setError("Alamat tujuan wajib diisi"); return; }
    if (method === "PENGANTARAN" && !driverId) { setError("Pilih pengantar yang bertugas"); return; }
    if (method === "KURIR" && !courierService.trim()) { setError("Nama jasa kurir wajib diisi"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/preparation/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          notes: notes.trim() || null,
          items,
          delivery_method: method,
          delivery_address: method === "PENGANTARAN" ? address.trim() : null,
          delivery_user_id: method === "PENGANTARAN" ? driverId : null,
          delivery_user_name: method === "PENGANTARAN" ? driverName : null,
          scheduled_delivery_date: method === "PENGANTARAN" ? (schedule === "TODAY" ? todayLocal() : addDaysLocal(1)) : null,
          courier_service: method === "KURIR" ? courierService.trim() : null,
          courier_tracking_number: method === "KURIR" ? (trackingNumber.trim() || null) : null,
          courier_note: method === "KURIR" ? (courierNote.trim() || null) : null,
        }),
      });
      const result = await res.json();
      if (!result.success) { setError(result.message || "Gagal membuat pengantaran"); return; }
      router.push(`/dashboard/preparation/${result.data.id}`);
    } catch {
      setError("Terjadi kesalahan koneksi");
    } finally {
      setSaving(false);
    }
  };

  const OPTIONS: { value: DeliveryMethod; icon: LucideIcon; title: string; desc: string }[] = [
    { value: "DIAMBIL_CUSTOMER", icon: User, title: "Langsung Diambil Customer", desc: "Customer ambil ke toko, langsung selesai" },
    { value: "PENGANTARAN", icon: Bike, title: "Diantar Role Pengantaran", desc: "Pilih nama pengantar, tugas langsung aktif" },
    { value: "KURIR", icon: Package, title: "Diantar Kurir", desc: "Jasa kurir pihak ketiga (JNE, J&T, dll)" },
  ];

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-5">
          <Link href="/dashboard/preparation" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Kembali
          </Link>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-[#1a1545] to-[#0f0c29] rounded-2xl flex items-center justify-center shadow-lg shadow-[#1a1545]/25 flex-shrink-0">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Buat Pengantaran Langsung</h1>
              <p className="text-xs text-gray-400 mt-1.5 font-medium">Tidak melalui antrian Penyedia Barang — langsung ke tahap pengiriman</p>
            </div>
          </div>

          {/* 01 — Customer */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <SectionHeader step="01" icon={UserCircle} title="Data Customer" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Nama Customer <span className="text-red-500">*</span>
                </label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Atas nama..." className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">No. WhatsApp</label>
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="08xxxx" className={inputCls} />
              </div>
            </div>
          </div>

          {/* 02 — Barang */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <SectionHeader step="02" icon={Box} title="Barang (Serial Number)" />
              {items.length > 0 && (
                <span className="text-xs font-bold text-[#1a1545] bg-[#1a1545]/[0.06] px-2.5 py-1 rounded-full flex-shrink-0">
                  {items.length} unit
                </span>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={snSearch}
                onChange={(e) => { setSnSearch(e.target.value); search(e.target.value); }}
                placeholder="Cari SN dari stok..."
                className={`${inputCls} pl-9`}
              />
              {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-200 border-t-[#1a1545] rounded-full animate-spin" />}
            </div>
            {snResults.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto shadow-sm">
                {snResults.map((u: any) => (
                  <button key={u.id} type="button" onClick={() => addUnit(u)}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
                      <Box className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-gray-800">{u.serial_number}</p>
                      <p className="text-xs text-gray-500 truncate">{u.laptop_name}{u.grade ? ` · Grade ${u.grade}` : ""}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={manualSN}
                onChange={(e) => setManualSN(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
                placeholder="Atau ketik SN manual..."
                className={`${inputCls} font-mono flex-1`}
              />
              <button type="button" onClick={addManual}
                className="px-4 h-10 rounded-xl bg-[#1a1545] text-white text-sm font-semibold hover:bg-[#0f0c29] active:scale-[0.97] transition whitespace-nowrap">
                + Tambah
              </button>
            </div>

            {items.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-xl py-7 text-center">
                <PackageSearch className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-400 font-medium">Belum ada barang ditambahkan</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 hover:border-gray-300 transition">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                        <Box className="w-3.5 h-3.5 text-gray-400" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-gray-800">{it.serial_number}</p>
                        {it.laptop_name && <p className="text-[10px] text-gray-500 truncate">{it.laptop_name}</p>}
                      </div>
                    </div>
                    <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 03 — Metode Pengiriman */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3.5">
            <SectionHeader step="03" icon={Send} title="Metode Pengiriman" />
            <div className="space-y-2.5">
              {OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = method === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => selectMethod(opt.value)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${active ? "border-[#1a1545] bg-[#1a1545]/[0.03] shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition ${active ? "bg-[#1a1545] text-white" : "bg-gray-100 text-gray-400"}`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${active ? "text-[#1a1545]" : "text-gray-700"}`}>{opt.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                    </div>
                    {active && <CheckCircle2 className="w-5 h-5 text-[#1a1545] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {method === "PENGANTARAN" && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Pilih Pengantar *</label>
                  {driversLoading ? (
                    <div className="text-xs text-gray-400 py-2">Memuat daftar pengantar...</div>
                  ) : drivers.length === 0 ? (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Belum ada akun role Pengantaran.</div>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {drivers.map(d => (
                        <button key={d.id} type="button" onClick={() => { setDriverId(d.id); setDriverName(d.name); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition ${driverId === d.id ? "border-violet-500 bg-violet-100" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${driverId === d.id ? "bg-violet-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                            {d.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-bold truncate ${driverId === d.id ? "text-violet-800" : "text-gray-700"}`}>{d.name}</p>
                            <p className="text-[10px] text-gray-400">{d.role}</p>
                          </div>
                          {driverId === d.id && <CheckCircle2 className="text-violet-600 w-5 h-5 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Alamat Tujuan *</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Alamat atau paste link Google Maps" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Jadwal Antar *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSchedule("TODAY")}
                      className={`h-11 rounded-xl border-2 text-sm font-bold transition ${schedule === "TODAY" ? "border-violet-500 bg-violet-100 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                      Antar Hari Ini
                    </button>
                    <button type="button" onClick={() => setSchedule("TOMORROW")}
                      className={`h-11 rounded-xl border-2 text-sm font-bold transition ${schedule === "TOMORROW" ? "border-violet-500 bg-violet-100 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                      Antar Besok
                    </button>
                  </div>
                </div>
              </div>
            )}

            {method === "KURIR" && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Jasa Kurir *</label>
                  <input value={courierService} onChange={e => setCourierService(e.target.value)} placeholder="JNE, J&T, SiCepat..." className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">No. Resi (opsional)</label>
                  <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="Nomor resi" className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catatan (opsional)</label>
                  <input value={courierNote} onChange={e => setCourierNote(e.target.value)} placeholder="Catatan kurir" className={inputCls} />
                </div>
              </div>
            )}
          </div>

          {/* Catatan */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catatan (opsional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Catatan tambahan..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1545]/20 focus:border-[#1a1545] focus:bg-white transition resize-none" />
          </div>

          {/* Ringkasan — muncul otomatis begitu field wajib lengkap, murni tampilan cek-ulang */}
          {summaryReady && (
            <div className="bg-gradient-to-br from-[#1a1545] to-[#0f0c29] rounded-2xl p-5 text-white shadow-lg shadow-[#1a1545]/25">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardCheck className="w-4 h-4 text-white/60" />
                <p className="text-[11px] font-bold text-white/60 uppercase tracking-wide">Ringkasan Sebelum Dibuat</p>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-white/50">Customer</span>
                  <span className="font-bold text-right">{customerName.trim()}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-white/50">Jumlah Barang</span>
                  <span className="font-bold">{items.length} unit</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-white/50">Metode</span>
                  <span className="font-bold text-right">{METHOD_LABEL[method as DeliveryMethod]}</span>
                </div>
                {method === "PENGANTARAN" && driverName && (
                  <div className="flex justify-between gap-3">
                    <span className="text-white/50">Pengantar</span>
                    <span className="font-bold text-right">{driverName}</span>
                  </div>
                )}
                {method === "KURIR" && courierService && (
                  <div className="flex justify-between gap-3">
                    <span className="text-white/50">Jasa Kurir</span>
                    <span className="font-bold text-right">{courierService}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button onClick={submit} disabled={saving}
            className="w-full h-12 bg-gradient-to-r from-[#1a1545] to-[#0f0c29] text-white rounded-xl text-sm font-bold hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 shadow-lg shadow-[#1a1545]/25 flex items-center justify-center gap-2">
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" />
                Buat Pengantaran
              </>
            )}
          </button>
        </div>
      </main>
    </DashboardLayout>
  );
}