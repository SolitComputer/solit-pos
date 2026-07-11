// src/app/privacy/page.tsx
export const metadata = {
  title: "Kebijakan Privasi — Solit POS",
  description: "Kebijakan privasi sistem internal Solit POS.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-black tracking-tight text-gray-900">
        Kebijakan Privasi
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Terakhir diperbarui: 11 Juli 2026
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">1. Data yang Dikumpulkan</h2>
          <p className="mb-2">
            Solit POS adalah sistem internal Solit 03. Melalui integrasi media sosial,
            sistem hanya membaca:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Nama tampilan akun media sosial Solit 03</li>
            <li>Metrik publik konten Solit 03: jumlah tayangan, suka, dan komentar</li>
          </ul>
          <p className="mt-2">
            Sistem <b>tidak</b> mengumpulkan data pribadi pengikut, pesan langsung,
            informasi kontak, maupun data pengguna platform lainnya.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">2. Penggunaan Data</h2>
          <p>
            Data metrik digunakan semata-mata untuk pelaporan performa konten internal
            Solit 03. Data tidak dijual, disewakan, atau dibagikan kepada pihak ketiga mana pun.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">3. Penyimpanan &amp; Keamanan</h2>
          <p>
            Data disimpan pada basis data terenkripsi (Supabase) dan hanya dapat diakses oleh
            karyawan Solit 03 yang berwenang. Token akses platform disimpan di sisi server dan
            tidak pernah diekspos ke browser.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">4. Penghapusan Data</h2>
          <p>
            Solit 03 dapat memutus koneksi akun media sosial kapan saja melalui dasbor internal.
            Saat diputus, seluruh token dan data terkait dihapus dari sistem. Pemilik akun juga
            dapat mencabut akses langsung dari pengaturan platform masing-masing.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-black text-gray-900">5. Kontak</h2>
          <p>
            Pertanyaan terkait privasi dapat diajukan melalui{" "}
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