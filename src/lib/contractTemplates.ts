export type ContractType = "PENGANTARAN" | "GAJI_FLAT" | "GAJI_NON_FLAT" | "CUSTOM";
export type ContractStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  PENGANTARAN: "Kontrak Pengantaran",
  GAJI_FLAT: "Kontrak Gaji Tetap",
  GAJI_NON_FLAT: "Kontrak Gaji Persentase",
  CUSTOM: "Kontrak Custom",
};

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; color: string; bg: string; border: string }> = {
  NONE: { label: "Belum Ada Kontrak", color: "text-gray-500", bg: "bg-gray-100", border: "border-gray-200" },
  PENDING: { label: "Menunggu Persetujuan", color: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200" },
  APPROVED: { label: "Disetujui", color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-200" },
  REJECTED: { label: "Ditolak", color: "text-red-700", bg: "bg-red-100", border: "border-red-200" },
  EXPIRED: { label: "Kadaluarsa", color: "text-red-700", bg: "bg-red-100", border: "border-red-200" },
};

export const CONTRACT_DURATION_OPTIONS: { label: string; months: number | null }[] = [
  { label: "3 Bulan", months: 3 },
  { label: "6 Bulan", months: 6 },
  { label: "1 Tahun", months: 12 },
  { label: "2 Tahun", months: 24 },
  { label: "Tanpa Batas (Permanen)", months: null },
];

export const CONTRACT_WARNING_DAYS = 14;

export function computeValidUntil(validFrom: string, months: number | null): string | null {
  if (months === null) return null;
  const d = new Date(validFrom + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function baseTemplate(name: string, body: string) {
  return `PERJANJIAN KERJA
Solit 03

Perjanjian ini dibuat antara Solit 03 ("Perusahaan") dengan ${name || "[Nama Karyawan]"} ("Karyawan").

${body}

Dengan menekan tombol "Saya Setuju" pada aplikasi ini, Karyawan menyatakan telah membaca, memahami, dan menyetujui seluruh isi perjanjian ini sebagai dasar hubungan kerja dengan Perusahaan.`;
}

export const CONTRACT_TEMPLATES: Record<Exclude<ContractType, "CUSTOM">, (name: string) => string> = {
  PENGANTARAN: (name) =>
    baseTemplate(
      name,
      `1. Karyawan bertugas sebagai Pengantaran (kurir/delivery) untuk mengantarkan unit/barang milik Perusahaan ke alamat pelanggan sesuai penugasan.
2. Karyawan wajib menjaga keamanan barang selama proses pengantaran hingga diterima pelanggan dan bertanggung jawab atas kehilangan/kerusakan akibat kelalaian.
3. Karyawan wajib melakukan konfirmasi status pengantaran (dispatch, diterima, gagal) melalui sistem Solit POS secara real-time.
4. Jam kerja dan shift mengikuti jadwal yang ditentukan Perusahaan melalui sistem absensi.
5. Karyawan wajib mematuhi rute dan SOP keselamatan berkendara yang berlaku.
6. Kompensasi/insentif pengantaran dihitung sesuai kebijakan yang berlaku di sistem dan dapat berubah sewaktu-waktu dengan pemberitahuan.`
    ),
  GAJI_FLAT: (name) =>
    baseTemplate(
      name,
      `1. Karyawan menerima gaji pokok tetap (flat) setiap bulan sesuai nominal yang ditetapkan Perusahaan, tidak berubah berdasarkan persentase kehadiran, kecuali terjadi pelanggaran SOP.
2. Karyawan wajib hadir sesuai jadwal kerja/shift yang ditentukan dan melakukan absensi melalui sistem yang berlaku.
3. Tunjangan (jika ada) dan potongan (kasbon/pinjaman) mengikuti ketentuan yang berlaku dan tercatat di sistem payroll Perusahaan.
4. Perubahan nominal gaji akan diinformasikan melalui sistem dan/atau tertulis sebelum berlaku efektif.
5. Karyawan wajib menjalankan tugas sesuai deskripsi pekerjaan pada perannya masing-masing di Perusahaan.`
    ),
  GAJI_NON_FLAT: (name) =>
    baseTemplate(
      name,
      `1. Karyawan menerima gaji berbasis persentase kehadiran (non-flat): gaji pokok bulanan dihitung dari (gaji pokok ÷ total hari kerja) × skor kehadiran, sebagaimana tercatat pada sistem absensi Solit POS.
2. Karyawan memahami bahwa ketidakhadiran, keterlambatan, atau cuti akan memengaruhi besaran gaji sesuai formula yang berlaku di sistem.
3. Tunjangan (jika ada) turut disesuaikan dengan persentase kehadiran bulan berjalan, sedangkan potongan (kasbon/pinjaman) dipotong penuh tanpa penyesuaian.
4. Karyawan wajib melakukan absensi masuk dan pulang secara akurat melalui sistem yang berlaku.
5. Rincian perhitungan gaji dapat dilihat Karyawan melalui slip gaji pada sistem setiap periode.`
    ),
};