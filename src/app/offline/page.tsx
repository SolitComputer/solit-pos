export default function OfflinePage() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <img
          src="/assets/solit03.jpeg"
          className="w-24 h-24 rounded-xl mx-auto mb-4"
        />

        <h1 className="text-2xl font-bold">
          Solit POS Offline
        </h1>

        <p className="opacity-70 mt-2">
          Koneksi internet terputus
        </p>
      </div>
    </div>
  );
}