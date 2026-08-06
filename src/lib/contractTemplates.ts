export type ContractType = "PENGANTARAN" | "GAJI_FLAT" | "GAJI_NON_FLAT" | "CUSTOM";
export type ContractStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  PENGANTARAN: "Kontrak Pengantaran",
  GAJI_FLAT: "Kontrak Gaji Tetap",
  GAJI_NON_FLAT: "Kontrak Gaji Persentase",
  CUSTOM: "Kontrak Custom",
};

// Judul yang dikirim ke karyawan selalu seragam, terlepas jenis kontrak yang dipilih admin.
// CONTRACT_TYPE_LABELS di atas tetap dipakai untuk label tombol pemilih jenis kontrak di modal.
export const CONTRACT_DEFAULT_TITLE = "Kontrak Kerja Karyawan";

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; color: string; bg: string; border: string }> = {
NONE: { label: "Belum Dikirim", color: "text-gray-500", bg: "bg-gray-100", border: "border-gray-200" },
  PENDING: { label: "Menunggu Persetujuan", color: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200" },
  APPROVED: { label: "Disetujui", color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-200" },
  REJECTED: { label: "Ditolak", color: "text-red-700", bg: "bg-red-100", border: "border-red-200" },
  EXPIRED: { label: "Kadaluarsa", color: "text-red-700", bg: "bg-red-100", border: "border-red-200" },
};

export const CONTRACT_DURATION_OPTIONS: { label: string; months: number | null }[] = [
  { label: "1 Bulan", months: 1 },
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

const KEWAJIBAN_PERUSAHAAN = `Pasal 3 - Kewajiban Perusahaan
Apabila hubungan kerja diputus secara sepihak oleh Perusahaan sebelum masa kontrak berakhir, tanpa adanya pelanggaran berat yang dilakukan Karyawan, maka "Dana Pensiun" Karyawan wajib dicairkan sesuai kebijakan yang berlaku.`;

function kewajibanKaryawan(extraPoint: string) {
  return `Pasal 4 - Kewajiban Karyawan
1. Menjalankan pekerjaan sesuai SOP Perusahaan dan tanggung jawab divisinya, termasuk SOP operasional, SOP keselamatan kerja, dan SOP penggunaan sistem Solit POS.
2. Mengisi/mencatat laporan kerja secara tepat dan jujur melalui sistem yang berlaku.
3. Menjaga etika, komunikasi, dan sikap profesional selama bekerja.
4. Menjaga kerahasiaan data Perusahaan, data pelanggan, dan informasi internal lainnya, baik selama maupun setelah masa kerja berakhir.
5. Menjaga nama baik Perusahaan dan tidak melakukan pelanggaran disiplin kerja.
6. Segera melaporkan kepada atasan/HR apabila mengetahui adanya pelanggaran SOP, kecurangan, atau hal lain yang merugikan Perusahaan.
7. Selama masih terikat masa kontrak, Karyawan tidak diperbolehkan mengajukan "resign". Jika Karyawan tetap mengajukan resign dalam masa kontrak, maka "Dana Pensiun" dan Surat Paklaring tidak akan diterbitkan.
${extraPoint}`;
}

const SISTEM_SANKSI = `Pasal 5 - Sistem Sanksi
Setiap pelanggaran yang dilakukan Karyawan dikenakan poin sesuai tingkat pelanggaran sebagai berikut:
- Ringan : 1 poin
- Sedang : 5 poin
- Berat : 10 poin
- Sangat Berat : pemutusan hubungan kerja (PHK) tanpa kompensasi.

Akumulasi poin dapat memengaruhi besaran bonus/insentif Karyawan (jika berlaku pada jenis kontraknya). Akumulasi pelanggaran berat dapat menyebabkan pemutusan hubungan kerja sebelum masa kontrak berakhir.`;

const PENUTUP = `Pasal 6 - Penutup
Perjanjian ini dibuat dan disepakati oleh kedua belah pihak dengan penuh kesadaran tanpa paksaan dari pihak manapun. Dengan menekan tombol "Saya Setuju & Lanjutkan" pada aplikasi ini, Karyawan menyatakan telah membaca, memahami, dan menyetujui seluruh isi perjanjian kerja ini sebagai dasar hubungan kerja dengan Perusahaan.`;

function baseTemplate(name: string, pasal2: string, kewajibanTambahan: string) {
  return `PERJANJIAN KERJA
Solit 03

Perjanjian ini dibuat antara Solit 03 ("Perusahaan") dengan ${name || "[Nama Karyawan]"} ("Karyawan").

Pasal 1 - Masa Berlaku
Perjanjian kerja ini berlaku sesuai dengan tanggal mulai dan tanggal berakhir yang tercantum pada bagian "Masa Berlaku" kontrak ini. Setelah masa berlaku berakhir, perjanjian dapat diperpanjang atau dihentikan berdasarkan hasil evaluasi kinerja Karyawan.

${pasal2}

${KEWAJIBAN_PERUSAHAAN}

${kewajibanKaryawan(kewajibanTambahan)}

${SISTEM_SANKSI}

${PENUTUP}`;
}

export const CONTRACT_TEMPLATES: Record<Exclude<ContractType, "CUSTOM">, (name: string) => string> = {
  PENGANTARAN: (name) =>
    baseTemplate(
      name,
      `Pasal 2 - Hak Karyawan
1. Menerima gaji pokok sesuai nominal yang ditetapkan Perusahaan per bulan.
2. Menerima insentif/bonus pengantaran sesuai kebijakan yang berlaku di sistem, dan dapat berubah sewaktu-waktu dengan pemberitahuan.
3. Penggantian biaya bensin diberikan sesuai kebijakan Perusahaan dengan syarat menyerahkan bukti struk asli (foto) dan jujur dalam pelaporan; pemalsuan struk atau manipulasi dikenakan sanksi pelanggaran sangat berat.
4. Mendapatkan waktu istirahat dan cuti sesuai kebijakan Perusahaan.
5. Mendapatkan makan siang yang disediakan oleh Perusahaan.
6. Berhak atas evaluasi kinerja untuk kenaikan tingkatan atau perpanjangan kontrak.`,
      `8. Wajib melakukan konfirmasi status pengantaran (dispatch, diterima, gagal) melalui sistem Solit POS secara real-time, mematuhi rute dan SOP keselamatan berkendara, serta menjaga keamanan barang selama proses pengantaran hingga diterima pelanggan.`
    ),
  GAJI_FLAT: (name) =>
    baseTemplate(
      name,
      `Pasal 2 - Hak Karyawan
1. Menerima gaji pokok tetap (flat) setiap bulan sesuai nominal yang ditetapkan Perusahaan, tidak berubah berdasarkan persentase kehadiran, kecuali terjadi pelanggaran SOP.
2. Gaji diberikan berdasarkan tanggung jawab pekerjaan, bukan berdasarkan jam kerja; dengan ketentuan ini, tidak berlaku hitungan lembur dan bonus mingguan.
3. Tunjangan (jika ada) dan potongan (kasbon/pinjaman) mengikuti ketentuan yang berlaku dan tercatat di sistem payroll Perusahaan.
4. Mendapatkan waktu istirahat dan cuti sesuai kebijakan Perusahaan.
5. Mendapatkan makan siang yang disediakan oleh Perusahaan.
6. Berhak atas evaluasi kinerja untuk kenaikan tingkatan atau perpanjangan kontrak.`,
      `8. Wajib hadir sesuai jadwal kerja/shift yang ditentukan dan melakukan absensi melalui sistem yang berlaku.`
    ),
  GAJI_NON_FLAT: (name) =>
    baseTemplate(
      name,
      `Pasal 2 - Hak Karyawan
1. Menerima gaji pokok bulanan berbasis persentase kehadiran: (gaji pokok ÷ total hari kerja) × skor kehadiran, sebagaimana tercatat pada sistem absensi Solit POS.
2. Menerima bonus mingguan dan/atau bulanan sesuai performa dan kebijakan Perusahaan.
3. Tunjangan (jika ada) turut disesuaikan dengan persentase kehadiran bulan berjalan, sedangkan potongan (kasbon/pinjaman) dipotong penuh tanpa penyesuaian.
4. Mendapatkan waktu istirahat dan cuti sesuai kebijakan Perusahaan.
5. Mendapatkan makan siang yang disediakan oleh Perusahaan.
6. Berhak atas evaluasi kinerja untuk kenaikan tingkatan atau perpanjangan kontrak.`,
      `8. Wajib melakukan absensi masuk dan pulang secara akurat melalui sistem yang berlaku, karena memengaruhi langsung perhitungan gaji pada periode berjalan.`
    ),
};