export default function Loading() {
  return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 flex-1 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-96 bg-slate-100 rounded-2xl animate-pulse" />
    </div>
  );
}