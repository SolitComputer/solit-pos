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
        if (result.user?.role === "ADMIN") {
          window.location.href = "/dashboard";
        } else if (result.user?.role === "OPERATOR") {
          window.location.href = "/dashboard/laptops";
        } else {
          window.location.href = "/payment/create";
        }
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
    <main className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-5 relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Subtle glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/[0.02] blur-3xl pointer-events-none" />

     <div className="relative w-full max-w-sm">
  {/* Logo area */}
  <div className="mb-8 text-center">
    <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-2xl mb-4 overflow-hidden">
      <img
        src="/assets/solit03.jpeg"
        alt="Logo Solit"
        className="w-full h-full object-cover"
      />
    </div>
    <h1 className="text-white text-2xl font-bold tracking-tight">Solit POS</h1>
    <p className="text-white/40 text-sm mt-1">Masuk ke akun kamu</p>
  </div>


        {/* Card */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            {/* Email */}
            <div>
              <label className="text-white/50 text-xs font-medium mb-1.5 block uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                placeholder="nama@solit.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl h-11 px-4 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 focus:bg-white/8 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-white/50 text-xs font-medium mb-1.5 block uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl h-11 px-4 pr-11 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 focus:bg-white/8 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Button */}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-white text-[#0f0f0f] rounded-xl h-11 font-semibold text-sm hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Masuk...
                </span>
              ) : (
                "Masuk"
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          © 2025 Solit · Internal Use Only
        </p>
      </div>
    </main>
  );
}