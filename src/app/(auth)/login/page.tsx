"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type LoginStage = "login" | "set-password";

// ── Komponen inner yang pakai useSearchParams ─────────────────────────────────
// Dipisah karena useSearchParams harus dibungkus Suspense di Next.js App Router
function LoginInner() {
  const searchParams = useSearchParams();
  const loginReason = searchParams.get("reason");

  const [stage, setStage] = useState<LoginStage>("login");

  // Login form
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Set password form
  const [userId, setUserId] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // ✅ Kalau ada ?reason=force_logout atau session_expired,
  // clear error state supaya tidak bentrok dengan banner
  useEffect(() => {
    if (loginReason) setError("");
  }, [loginReason]);

  const handleLogin = async () => {
    setError("");
    if (!phone || !password) {
      setError("Nomor WA dan password wajib diisi");
      return;
    }
    if (phone.length < 8) {
      setError("Nomor WA terlalu pendek");
      return;
    }
    try {
      setLoading(true);
      const fullPhone = "0" + phone;
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, password }),
      });
      const result = await res.json();

      if (result.needSetPassword) {
        setUserId(result.userId);
        setStage("set-password");
        return;
      }

      if (!result.success) {
        setError(result.message || "Login gagal");
        return;
      }

      setTimeout(() => {
        window.location.href = result.redirect ?? "/dashboard";
      }, 300);
    } catch {
      setError("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    setPwError("");
    setPwSuccess("");
    if (!newPw || !confirmPw) {
      setPwError("Semua field wajib");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("Password tidak cocok");
      return;
    }
    if (newPw.length < 6) {
      setPwError("Minimal 6 karakter");
      return;
    }

    try {
      setPwLoading(true);
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          password: newPw,
          confirmPassword: confirmPw,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        setPwError(result.message);
        return;
      }
      setPwSuccess("Password berhasil dibuat! Silakan login.");
      setTimeout(() => {
        setStage("login");
        setNewPw("");
        setConfirmPw("");
      }, 1800);
    } catch {
      setPwError("Terjadi kesalahan");
    } finally {
      setPwLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (stage === "login") handleLogin();
      else handleSetPassword();
    }
  };

  return (
    <main className="min-h-screen bg-[#03030a] flex items-center justify-center p-5 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-[100px] animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/5 rounded-full blur-[120px]" />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="relative w-full max-w-lg z-10">
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40 hover:border-white/20 transition-all duration-500">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
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
            <h1 className="text-white text-3xl font-bold mt-5 tracking-tight">
              Solit POS
            </h1>
            <p className="text-white/40 text-sm mt-2">
              {stage === "login"
                ? "Akses sistem terintegrasi"
                : "Buat password Anda"}
            </p>
          </div>

          {/* ── LOGIN STAGE ── */}
          {stage === "login" && (
            <>
              {/* ✅ Banner force logout — muncul ketika di-redirect dari middleware */}
              {loginReason === "force_logout" && (
                <div className="mb-5 px-4 py-3 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">🚪</span>
                  <p className="text-orange-300 text-sm leading-relaxed">
                    Sesi kamu telah diakhiri oleh admin.
                    Silakan login kembali untuk melanjutkan.
                  </p>
                </div>
              )}

              {/* ✅ Banner session expired — auto logout jam 03:00 WIB */}
              {loginReason === "session_expired" && (
                <div className="mb-5 px-4 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">⏰</span>
                  <p className="text-blue-300 text-sm leading-relaxed">
                    Sesi kamu telah berakhir otomatis.
                    Silakan login kembali.
                  </p>
                </div>
              )}

              {/* Error login biasa — hanya tampil jika TIDAK ada reason banner */}
              {error && !loginReason && (
                <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-shake">
                  <p className="text-red-400 text-sm flex items-center gap-2">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </p>
                </div>
              )}

              {/* Error login ketika ada reason — tampil di bawah banner */}
              {error && loginReason && (
                <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-shake">
                  <p className="text-red-400 text-sm flex items-center gap-2">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </p>
                </div>
              )}

              <div className="space-y-5">
                {/* Nomor WA */}
                <div>
                  <label className="text-white/50 text-xs font-semibold mb-2 block uppercase tracking-wider flex items-center gap-1">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.09 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                    </svg>
                    Nomor WhatsApp
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-4 text-white/40 text-sm font-mono select-none pointer-events-none z-10">
                      0
                    </div>
                    <input
                      type="tel"
                      placeholder="8xxxxxxxxxx"
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl h-12 pl-8 pr-4 text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-purple-500/30 transition-all duration-300 font-mono"
                      value={phone}
                      onChange={(e) => {
                        let digits = e.target.value.replace(/\D/g, "");
                        if (digits.startsWith("628"))
                          digits = digits.slice(2);
                        else if (digits.startsWith("62"))
                          digits = digits.slice(2);
                        else if (digits.startsWith("08"))
                          digits = digits.slice(1);
                        else if (digits.startsWith("0"))
                          digits = digits.slice(1);
                        setPhone(digits.slice(0, 13));
                      }}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                  <p className="text-white/20 text-[10px] mt-1.5 ml-1">
                    Contoh: 8 1 2 3 4 5 6 7 8 9 0 (nomor setelah 0)
                  </p>
                </div>

                {/* Password */}
                <div>
                  <label className="text-white/50 text-xs font-semibold mb-2 block uppercase tracking-wider flex items-center gap-1">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      placeholder="••••••••"
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl h-12 px-4 pr-11 text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-purple-500/30 transition-all duration-300"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-all duration-200"
                    >
                      {showPw ? (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="relative w-full group mt-4"
                >
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl blur opacity-40 group-hover:opacity-70 transition duration-300" />
                  <div className="relative w-full bg-white rounded-xl h-12 font-semibold text-sm text-[#03030a] flex items-center justify-center gap-2 hover:bg-white/95 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? (
                      <>
                        <svg
                          className="animate-spin w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="3"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Memproses...
                      </>
                    ) : (
                      "Masuk ke Dashboard"
                    )}
                  </div>
                </button>
              </div>
            </>
          )}

          {/* ── SET PASSWORD STAGE ── */}
          {stage === "set-password" && (
            <>
              <div className="mb-6 px-4 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-blue-400 text-sm">
                  Selamat datang! Akun Anda sudah dibuat oleh admin. Silakan
                  buat password untuk pertama kali.
                </p>
              </div>

              {pwError && (
                <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-shake">
                  <p className="text-red-400 text-sm">{pwError}</p>
                </div>
              )}
              {pwSuccess && (
                <div className="mb-4 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <p className="text-green-400 text-sm">{pwSuccess}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-white/50 text-xs font-semibold mb-2 block uppercase tracking-wider">
                    Password Baru
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPw ? "text" : "password"}
                      placeholder="Minimal 6 karakter"
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl h-12 px-4 pr-11 text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all duration-300"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-all"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        {showNewPw ? (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </>
                        ) : (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-white/50 text-xs font-semibold mb-2 block uppercase tracking-wider">
                    Konfirmasi Password
                  </label>
                  <input
                    type="password"
                    placeholder="Ulangi password"
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl h-12 px-4 text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all duration-300"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                <button
                  onClick={handleSetPassword}
                  disabled={pwLoading}
                  className="relative w-full group mt-2"
                >
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-teal-600 rounded-xl blur opacity-40 group-hover:opacity-70 transition duration-300" />
                  <div className="relative w-full bg-white rounded-xl h-12 font-semibold text-sm text-[#03030a] flex items-center justify-center gap-2 hover:bg-white/95 active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
                    {pwLoading ? (
                      <>
                        <svg
                          className="animate-spin w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="3"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Menyimpan...
                      </>
                    ) : (
                      "Simpan Password"
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setStage("login")}
                  className="w-full text-white/30 text-xs hover:text-white/60 transition py-2"
                >
                  ← Kembali ke halaman login
                </button>
              </div>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-white/25 text-[11px] tracking-wide">
              Sistem manajemen point of sale terintegrasi
            </p>
          </div>
        </div>

        <p className="text-center text-white/15 text-[10px] tracking-wider mt-6">
          © 2025 Solit — Hak akses terbatas untuk internal
        </p>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-5px);
          }
          40% {
            transform: translateX(5px);
          }
          60% {
            transform: translateX(-3px);
          }
          80% {
            transform: translateX(3px);
          }
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

// ── Export default dengan Suspense wrapper ────────────────────────────────────
// ✅ WAJIB: useSearchParams() di App Router harus dibungkus Suspense
// Tanpa ini Next.js akan throw error saat build:
// "useSearchParams() should be wrapped in a suspense boundary"
export default function Page() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#03030a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </main>
    }>
      <LoginInner />
    </Suspense>
  );
}