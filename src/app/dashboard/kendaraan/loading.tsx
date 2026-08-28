export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-[#F7F7F8]">
      <div className="flex items-center gap-2 text-gray-400 text-sm">
        <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-600 rounded-full animate-spin" />
        Memuat kendaraan…
      </div>
    </div>
  );
}
