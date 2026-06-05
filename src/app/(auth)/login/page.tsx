"use client";

import { useState } from "react";

export default function Page() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    if (!email || !password) {
      setError("Email dan password wajib diisi");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();

      if (!result.success) {
        setError(result.message || "Login gagal");
        return;
      }

      setTimeout(() => {
        const destination = result.redirect ?? "/dashboard";
        window.location.href = destination;  
      }, 300);

    } catch {
      setError("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <main className="min-h-screen bg-[#03030a] flex items-center justify-center p-5 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-[100px] animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/5 rounded-full blur-[120px]" />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="relative w-full max-w-lg z-10">
        {/* Floating card with glassmorphism */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40 hover:border-white/20 transition-all duration-500">

          {/* Logo area with glow */}
          <div className="flex flex-col items-center mb-10">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
              <div className="relative w-16 h-16 bg-white rounded-2xl overflow-hidden shadow-lg">
                <img
                  src="/assets/solit03.jpeg"
                  alt="Logo Solit"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <h1 className="text-white text-3xl font-bold mt-5 tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              Solit POS
            </h1>
            <p className="text-white/40 text-sm mt-2">Akses sistem terintegrasi</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl backdrop-blur-sm animate-shake">
              <p className="text-red-400 text-sm flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </p>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-5">
            <div>
              <label className="text-white/50 text-xs font-semibold mb-2 block uppercase tracking-wider flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                Email
              </label>
              <input
                type="email"
                placeholder="Masukan email Anda"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl h-12 px-4 text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-purple-500/30 transition-all duration-300"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            <div>
              <label className="text-white/50 text-xs font-semibold mb-2 block uppercase tracking-wider flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl h-12 px-4 pr-11 text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-purple-500/30 transition-all duration-300"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={(e) => {
                    // Placeholder akan hilang saat input di-focus
                    e.target.placeholder = "";
                  }}
                  onBlur={(e) => {
                    // Placeholder akan kembali jika password kosong
                    if (!password) {
                      e.target.placeholder = "••••••••";
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-all duration-200"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Login button with gradient */}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="relative w-full group mt-4"
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl blur opacity-40 group-hover:opacity-70 transition duration-300" />
              <div className="relative w-full bg-white rounded-xl h-12 font-semibold text-sm text-[#03030a] flex items-center justify-center gap-2 hover:bg-white/95 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Memproses...
                  </>
                ) : (
                  "Masuk ke Dashboard"
                )}
              </div>
            </button>
          </div>

          {/* Additional info */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-white/25 text-[11px] tracking-wide">
              Sistem manajemen point of sale terintegrasi
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/15 text-[10px] tracking-wider mt-6">
          © 2025 Solit — Hak akses terbatas untuk internal
        </p>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
        .delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
    </main>
  );
}