export default function OfflinePage() {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <img
          src="/assets/solit03.jpeg"
          alt="Solit POS"
          className="w-24 h-24 rounded-2xl mx-auto mb-4"
        />

        <h1 className="text-2xl font-bold">
          Solit POS Offline
        </h1>

        <p className="text-slate-400 mt-2">
          Koneksi internet terputus
        </p>
      </div>
    </div>
  );
}