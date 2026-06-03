export default function Loading() {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <img
          src="/assets/solit03.jpeg"
          alt="Solit POS"
          className="w-24 h-24 rounded-2xl mx-auto animate-pulse"
        />

        <h1 className="text-white text-xl font-bold mt-4">
          Solit POS
        </h1>

        <p className="text-slate-400 text-sm mt-2">
          Inventory & Payment System
        </p>
      </div>
    </div>
  );
}