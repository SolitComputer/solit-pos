export default function Loading() {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <img
          src="/assets/solit03.jpeg"
          className="w-24 h-24 rounded-2xl mx-auto animate-pulse"
        />

        <h1 className="text-white text-xl mt-4 font-bold">
          Solit POS
        </h1>
      </div>
    </div>
  );
}