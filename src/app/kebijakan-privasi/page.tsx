export const metadata = {
  title: "Kebijakan Privasi — Solit 03",
  description: "Kebijakan privasi aplikasi Solit POS dan integrasi Facebook/WhatsApp.",
};

export default function KebijakanPrivasiPage() {
  return (
    <main className="max-w-3xl mx-auto px-5 py-12 text-gray-800">
      <h1 className="text-2xl font-black text-[#1a1a2e] mb-2">Kebijakan Privasi</h1>
      <p className="text-sm text-gray-500 mb-8">Terakhir diperbarui: {new Date().getFullYear()}</p>

      <section className="space-y-5 text-sm leading-relaxed">
        <p>
          Aplikasi Solit POS (&quot;kami&quot;) dikelola oleh Solit 03, penjual laptop
          bekas berbasis di Depok, Indonesia. Halaman ini menjelaskan data apa yang
          kami kumpulkan dan bagaimana kami menggunakannya, termasuk data yang berasal
          dari integrasi Facebook dan WhatsApp.
        </p>

        <div>
          <h2 className="font-bold text-base mb-1">Data yang Kami Kumpulkan</h2>
          <p>
            Melalui integrasi Facebook Page dan WhatsApp, kami menerima pesan yang
            dikirim pelanggan ke akun bisnis kami, beserta nama profil dan pengenal
            akun pengirim. Data ini digunakan semata-mata untuk membalas dan mengelola
            percakapan layanan pelanggan.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-base mb-1">Bagaimana Data Digunakan</h2>
          <p>
            Data percakapan digunakan untuk menjawab pertanyaan pelanggan, memproses
            transaksi, dan meningkatkan layanan. Kami tidak menjual atau membagikan
            data pelanggan kepada pihak ketiga untuk tujuan pemasaran.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-base mb-1">Penyimpanan Data</h2>
          <p>
            Data disimpan secara aman pada infrastruktur basis data kami dan hanya
            dapat diakses oleh staf yang berwenang.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-base mb-1">Penghapusan Data</h2>
          <p>
            Pelanggan dapat meminta penghapusan data percakapan mereka dengan
            menghubungi kami melalui email di bawah. Permintaan akan diproses dalam
            waktu yang wajar.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-base mb-1">Kontak</h2>
          <p>
            Untuk pertanyaan terkait privasi, hubungi kami di:{" "}
            <a href="mailto:reyzodiq0222@gmail.com" className="text-blue-600 underline">
              reyzodiq0222@gmail.com
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}