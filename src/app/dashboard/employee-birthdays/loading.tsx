export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F7F7F8]">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-4">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-2xl" style={{ background: "#e2e8f0" }} />
          <div className="space-y-2">
            <div className="h-4 w-48 rounded-full" style={{ background: "#e2e8f0" }} />
            <div className="h-2.5 w-32 rounded-full" style={{ background: "#f1f5f9" }} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl h-24 animate-pulse"
              style={{ border: "1px solid #f0f0f8" }}
            />
          ))}
        </div>
        <div
          className="bg-white rounded-2xl h-96 animate-pulse"
          style={{ border: "1px solid #f0f0f8" }}
        />
      </div>
    </div>
  );
}