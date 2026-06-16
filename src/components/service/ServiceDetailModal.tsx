"use client";
// src/components/service/ServiceDetailModal.tsx

import { useEffect, useState } from "react";
import type { ServiceOrder, ServiceOrderLog } from "@/types/service";
import { STATUS_LABEL, STATUS_COLOR } from "@/types/service";
import ServiceStatusBadge from "./ServiceStatusBadge";

interface Props {
  orderId: string | null;
  onClose: () => void;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function fmtRupiah(n?: number) {
  if (!n) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function getDuration(masuk: string, selesai?: string) {
  const start = new Date(masuk).getTime();
  const end = selesai ? new Date(selesai).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000 / 60);
  if (diff < 60) return `${diff} menit`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} jam ${diff % 60} mnt`;
  return `${Math.floor(h / 24)} hari ${h % 24} jam`;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash / Tunai",
  TRANSFER: "Transfer Bank",
  QRIS: "QRIS",
};

export default function ServiceDetailModal({ orderId, onClose }: Props) {
  const [data, setData] = useState<(ServiceOrder & { logs: ServiceOrderLog[] }) | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId) { setData(null); return; }
    setLoading(true);
    fetch(`/api/service/${orderId}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); })
      .finally(() => setLoading(false));
  }, [orderId]);

  if (!orderId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#1a1a2e]">Detail Order Servis</h2>
            {data && (
              <p className="text-xs text-gray-400 mt-0.5">
                No. {data.no_urut} · Masuk {formatDate(data.tanggal_masuk)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data && <ServiceStatusBadge status={data.status} />}
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !data ? (
            <p className="text-sm text-gray-500 text-center py-8">Data tidak ditemukan</p>
          ) : (
            <>
              {/* Pelanggan */}
              <Section title="Data Pelanggan">
                <Row label="Nama" value={data.nama} />
                <Row label="No HP" value={data.no_hp} />
                <Row label="Alamat" value={data.alamat || "—"} />
              </Section>

              {/* Laptop */}
              <Section title="Data Laptop">
                <Row label="Type" value={data.type_laptop} />
                <Row label="CPU" value={data.cpu || "—"} />
                <Row label="RAM" value={data.ram || "—"} />
                <Row label="Storage" value={data.storage || "—"} />
                <Row label="Kelengkapan" value={data.kelengkapan || "—"} />
              </Section>

              {/* Keluhan & Analisa */}
              <Section title="Keluhan & Analisa">
                <Row label="Keluhan" value={data.keluhan} multiline />
                <Row label="Hasil Analisa" value={data.hasil_analisa || "—"} multiline />
                {data.alasan_tidak_jadi && (
                  <Row label="Alasan" value={data.alasan_tidak_jadi} multiline highlight="red" />
                )}
              </Section>

              {/* Timeline */}
              <Section title="Timeline">
                <Row label="Tanggal Masuk" value={formatDate(data.tanggal_masuk)} />
                <Row label="Tanggal Selesai" value={formatDate(data.tanggal_selesai)} />
                {data.tanggal_diambil && (
                  <Row label="Tanggal Diambil" value={formatDate(data.tanggal_diambil)} />
                )}
                <Row label="Total Waktu" value={getDuration(data.tanggal_masuk, data.tanggal_selesai)} />
              </Section>

              {/* Tim */}
              <Section title="Tim">
                <Row label="Dibuat oleh" value={data.created_by_user?.name || "—"} />
                <Row label="Dikerjakan oleh" value={data.dikerjakan_by_user?.name || "—"} />
                {data.diambil_by_user && (
                  <Row label="Dikonfirmasi diambil" value={data.diambil_by_user.name} />
                )}
              </Section>

              {/* Payment */}
              {(data.payment_amount || data.status === "DONE") && (
                <Section title="Payment">
                  {data.payment_amount ? (
                    <>
                      <Row label="Total Biaya" value={fmtRupiah(data.payment_amount)} highlight="green" />
                      <Row label="Metode" value={PAYMENT_METHOD_LABEL[data.payment_method || "CASH"] || data.payment_method || "—"} />
                      <Row label="Catatan" value={data.payment_note || "—"} multiline />
                      <Row label="Dikonfirmasi oleh" value={data.payment_by_user?.name || "—"} />
                      <Row label="Tanggal Konfirmasi" value={formatDate(data.payment_confirmed_at)} />
                    </>
                  ) : (
                    <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                      Belum ada data payment
                    </p>
                  )}
                </Section>
              )}

              {/* Log Riwayat */}
              {data.logs && data.logs.length > 0 && (
                <Section title="Riwayat Perubahan">
                  <div className="space-y-2">
                    {data.logs.map((log, i) => (
                      <div key={log.id} className="flex gap-3 items-start">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-[#1a1a2e] mt-1.5" />
                          {i < data.logs.length - 1 && (
                            <div className="w-px flex-1 bg-gray-200 my-1 min-h-[16px]" />
                          )}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {log.status_from && (
                              <>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_COLOR[log.status_from]}`}>
                                  {STATUS_LABEL[log.status_from]}
                                </span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_COLOR[log.status_to]}`}>
                              {STATUS_LABEL[log.status_to]}
                            </span>
                          </div>
                          {log.catatan && (
                            <p className="text-xs text-gray-600 mt-0.5">{log.catatan}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {log.changed_by_user?.name || "—"} · {formatDate(log.changed_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{title}</p>
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {children}
      </div>
    </div>
  );
}

function Row({
  label, value, multiline, highlight,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  highlight?: "red" | "green";
}) {
  const valueClass = highlight === "red"
    ? "text-red-600 font-medium"
    : highlight === "green"
      ? "text-emerald-700 font-bold text-base"
      : "text-gray-800";

  return (
    <div className={`flex ${multiline ? "flex-col" : "items-start"} gap-1 px-4 py-2.5`}>
      <span className="text-xs text-gray-400 font-medium flex-shrink-0 w-36">{label}</span>
      <span className={`text-sm ${valueClass} ${multiline ? "" : "flex-1"} whitespace-pre-wrap break-words`}>
        {value}
      </span>
    </div>
  );
}