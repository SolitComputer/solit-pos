// src/app/terms/page.tsx
export const metadata = {
  title: "Syarat & Ketentuan — Solit POS",
  description: "Syarat dan ketentuan penggunaan sistem internal Solit POS.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-black tracking-tight text-gray-900">
        Syarat &amp; Ketentuan
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Terakhir diperbarui: 11 Juli 2026
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">1. Tentang Layanan</h2>
          <p>
            Solit POS adalah sistem operasional internal milik Solit 03 (Depok, Indonesia).
            Sistem ini digunakan secara eksklusif oleh karyawan Solit 03 untuk mengelola
            inventaris, transaksi, dan pelaporan konten. Layanan ini tidak terbuka untuk umum.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">2. Integrasi Media Sosial</h2>
          <p>
            Solit POS terhubung dengan platform media sosial (YouTube, TikTok, Instagram)
            semata-mata untuk <b>membaca metrik performa konten milik Solit 03 sendiri</b> —
            yaitu jumlah tayangan, suka, dan komentar. Sistem ini{" "}
            <b>tidak memposting, mengubah, atau menghapus</b> konten apa pun.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">3. Akses Pengguna</h2>
          <p>
            Akses diberikan oleh administrator Solit 03 dan dapat dicabut sewaktu-waktu.
            Pengguna bertanggung jawab menjaga kerahasiaan kredensial akunnya.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">4. Perubahan</h2>
          <p>
            Syarat ini dapat diperbarui sewaktu-waktu. Perubahan berlaku sejak dipublikasikan
            di halaman ini.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">5. Kontak</h2>
          <p>
            Pertanyaan dapat diajukan ke Solit 03 melalui{" "}
            <a href="https://solit03.com" className="font-bold text-violet-600 hover:underline">
              solit03.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}