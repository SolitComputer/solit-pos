// src/types/service.ts

export type ServiceStatus =
  | "ANTRIAN"
  | "SEDANG_DIKERJAKAN"
  | "MENUNGGU_SPAREPART"
  | "DONE"
  | "SUDAH_DIAMBIL"
  | "TIDAK_JADI"
  | "GAGAL_DIPERBAIKI"; // ✅ NEW

export interface ServiceOrder {
  id: string;
  no_urut: number;

  // Data pelanggan
  nama: string;
  no_hp: string;
  alamat?: string;

  // Data laptop
  type_laptop: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  kelengkapan?: string;

  // Keluhan & analisa
  keluhan: string;
  hasil_analisa?: string;

  // Status
  status: ServiceStatus;

  // Timestamps
  tanggal_masuk: string;
  tanggal_selesai?: string;
  tanggal_diambil?: string;

  // Payment ✅ NEW
  estimasi_harga?: number | null;
  biaya_sparepart?: number | null;

  payment_amount?: number;
  payment_note?: string;
  payment_method?: "CASH" | "TRANSFER" | "QRIS";
  payment_confirmed_at?: string;
  payment_by?: string;

  // User tracking
  created_by?: string;
  dikerjakan_by?: string;
  diambil_by?: string;
  alasan_tidak_jadi?: string;

  // Relasi (join dari API)
  created_by_user?: { id: string; name: string };
  dikerjakan_by_user?: { id: string; name: string };
  diambil_by_user?: { id: string; name: string };
  payment_by_user?: { id: string; name: string };

  updated_at: string;
}

export interface ServiceOrderLog {
  id: string;
  service_order_id: string;
  status_from?: ServiceStatus;
  status_to: ServiceStatus;
  catatan?: string;
  changed_by?: string;
  changed_at: string;
  changed_by_user?: { id: string; name: string };
}

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  ANTRIAN: "Antrian",
  SEDANG_DIKERJAKAN: "Sedang Dikerjakan",
  MENUNGGU_SPAREPART: "Menunggu Sparepart",
  DONE: "Selesai",
  SUDAH_DIAMBIL: "Sudah Diambil",
  TIDAK_JADI: "Tidak Jadi",
  GAGAL_DIPERBAIKI: "Gagal Diperbaiki", // ✅
};

export const STATUS_COLOR: Record<ServiceStatus, string> = {
  ANTRIAN: "bg-yellow-100 text-yellow-800 border-yellow-200",
  SEDANG_DIKERJAKAN: "bg-blue-100 text-blue-800 border-blue-200",
  MENUNGGU_SPAREPART: "bg-orange-100 text-orange-800 border-orange-200",
  DONE: "bg-green-100 text-green-800 border-green-200",
  SUDAH_DIAMBIL: "bg-gray-100 text-gray-600 border-gray-200",
  TIDAK_JADI: "bg-red-100 text-red-700 border-red-200",
  GAGAL_DIPERBAIKI: "bg-rose-100 text-rose-700 border-rose-200", // ✅
};