"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startRegistration, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { Fingerprint, CheckCircle2, AlertTriangle, Smartphone, ShieldCheck } from "lucide-react";

interface DeviceRow {
  id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export default function BiometricEnrollPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("from");

  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [deviceSupported, setDeviceSupported] = useState<boolean | null>(null);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/webauthn/status");
      const data = await res.json();
      if (data.success) {
        setEligible(Boolean(data.biometricEligible));
        setDevices(data.devices ?? []);
      }
    } catch { /* diam-diam gagal, tampilkan state kosong */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (eligible && browserSupportsWebAuthn()) {
      platformAuthenticatorIsAvailable().then(setDeviceSupported).catch(() => setDeviceSupported(false));
    } else {
      setDeviceSupported(false);
    }
  }, [eligible]);

  const handleRegister = async () => {
    setRegistering(true); setError(null); setErrorDetail(null); setSuccess(null);
    try {
      const optRes = await fetch("/api/auth/webauthn/register-options", { method: "POST" });
      const optData = await optRes.json();
      if (!optData.success) {
        console.error("[biometric enroll] register-options failed:", optData);
        setError(optData.message ?? "Gagal memulai pendaftaran");
        setErrorDetail(optData.debugReason ?? null);
        return;
      }

      const attResp = await startRegistration({ optionsJSON: optData.options });

      const verifyRes = await fetch("/api/auth/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        console.error("[biometric enroll] register-verify failed:", verifyData);
        setError(verifyData.message ?? "Gagal mendaftarkan sidik jari");
        setErrorDetail(verifyData.debugReason ?? null);
        return;
      }

      setSuccess("Sidik jari berhasil didaftarkan di device ini");
      fetchStatus();
    } catch (err: any) {
      const name = err?.name;
      if (name === "NotAllowedError") {
        setError("Dibatalkan, ditolak, atau waktu habis. Coba lagi.");
      } else if (name === "InvalidStateError") {
        setError("Sidik jari sudah pernah didaftarkan di device ini.");
      } else if (name === "SecurityError") {
        setError("Domain tidak cocok dengan yang terdaftar. Hubungi programmer.");
      } else if (name === "NotSupportedError") {
        setError("Device/browser ini tidak mendukung sidik jari platform.");
      } else {
        setError("Gagal memproses pendaftaran. Pastikan sidik jari sudah diatur di Pengaturan HP, lalu coba lagi.");
      }

      setErrorDetail(name ? `WebAuthn: ${name}` : null);
      console.error("[biometric enroll] webauthn error:", name, err);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(900px 420px at 50% -120px, rgba(26,21,69,0.10), transparent 70%), #F5F5F8",
        display: "flex",
        justifyContent: "center",
        padding: "40px 16px 48px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* ===== Header ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #0f0c29, #1a1545)",
              boxShadow: "0 8px 20px -6px rgba(15,12,41,0.55), 0 0 0 4px rgba(26,21,69,0.06)",
              flexShrink: 0,
            }}
          >
            <Fingerprint className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.02em" }}>
              Daftar Sidik Jari
            </h1>
            <p style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3, lineHeight: 1.45 }}>
              Lakukan di depan admin, di device yang akan dipakai absen setiap hari.
            </p>
          </div>
        </div>

        {loading ? (
          /* ===== Loading ===== */
          <div
            style={{
              background: "#fff",
              borderRadius: 20,
              padding: 32,
              textAlign: "center",
              border: "1px solid #eef0f6",
              boxShadow: "0 10px 30px -18px rgba(15,23,42,0.25)",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                border: "2.5px solid #e2e8f0",
                borderTopColor: "#1a1545",
                borderRadius: "50%",
                margin: "0 auto 12px",
                animation: "spin 0.7s linear infinite",
              }}
            />
            <p style={{ fontSize: 12.5, color: "#94a3b8", fontWeight: 600 }}>Memuat status...</p>
          </div>
        ) : !eligible ? (
          /* ===== Belum eligible ===== */
          <div
            style={{
              background: "linear-gradient(180deg, #fffbeb, #fff8e1)",
              border: "1px solid #fde68a",
              borderRadius: 20,
              padding: 22,
              display: "flex",
              gap: 14,
              boxShadow: "0 10px 30px -20px rgba(180,120,0,0.4)",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "#fef3c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: "#d97706" }} />
            </div>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 800, color: "#92400e" }}>
                Fitur sidik jari belum diaktifkan
              </p>
              <p style={{ fontSize: 11.5, color: "#b45309", marginTop: 5, lineHeight: 1.5 }}>
                Minta admin mengaktifkan sidik jari untuk akun Anda dari halaman Manajemen User.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ===== Device terdaftar ===== */}
            <div
              style={{
                background: "#fff",
                borderRadius: 20,
                padding: 20,
                border: "1px solid #eef0f6",
                marginBottom: 14,
                boxShadow: "0 10px 30px -20px rgba(15,23,42,0.22)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#334155",
                  marginBottom: 14,
                }}
              >
                <Smartphone className="w-4 h-4" style={{ color: "#1a1545" }} /> Device terdaftar
                {devices.length > 0 && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: "#1a1545",
                      background: "#eef0fb",
                      borderRadius: 999,
                      padding: "2px 9px",
                    }}
                  >
                    {devices.length}
                  </span>
                )}
              </div>
              {devices.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "18px 8px",
                    border: "1px dashed #e2e8f0",
                    borderRadius: 14,
                  }}
                >
                  <Smartphone className="w-6 h-6" style={{ color: "#cbd5e1", margin: "0 auto 8px" }} />
                  <p style={{ fontSize: 11.5, color: "#94a3b8" }}>
                    Belum ada device yang terdaftar untuk akun ini.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {devices.map((d) => (
                    <div
                      key={d.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "11px 13px",
                        borderRadius: 14,
                        background: "#f8fafc",
                        border: "1px solid #f1f5f9",
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 11,
                          background: "#fff",
                          border: "1px solid #eef0f6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Smartphone className="w-4 h-4" style={{ color: "#64748b" }} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            fontSize: 12.5,
                            fontWeight: 800,
                            color: "#334155",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {d.device_label ?? "Unknown device"}
                        </p>
                        <p style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>
                          Didaftarkan {new Date(d.created_at).toLocaleDateString("id-ID")}
                          {d.last_used_at
                            ? ` · terakhir dipakai ${new Date(d.last_used_at).toLocaleDateString("id-ID")}`
                            : ""}
                        </p>
                      </div>
                      <CheckCircle2 className="w-5 h-5" style={{ color: "#059669", flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ===== Register card ===== */}
            <div
              style={{
                background: "#fff",
                borderRadius: 20,
                padding: "24px 20px 20px",
                border: "1px solid #eef0f6",
                boxShadow: "0 14px 40px -24px rgba(15,12,41,0.4)",
              }}
            >
              {/* Fingerprint hero (dekoratif) */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
                <div style={{ position: "relative", width: 86, height: 86, marginBottom: 12 }}>
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      background: "radial-gradient(circle, rgba(26,21,69,0.14), transparent 68%)",
                      animation: "fp-pulse 2.4s ease-in-out infinite",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 14,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #0f0c29, #1a1545)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 12px 26px -10px rgba(15,12,41,0.6)",
                    }}
                  >
                    <Fingerprint className="w-8 h-8 text-white" />
                  </div>
                </div>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a" }}>Daftarkan device ini</p>
                <p
                  style={{
                    fontSize: 11,
                    color: "#94a3b8",
                    textAlign: "center",
                    marginTop: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#059669" }} /> Data sidik jari tidak pernah
                  meninggalkan HP Anda
                </p>
              </div>

              {error && (
                <div
                  style={{
                    padding: "11px 13px",
                    borderRadius: 14,
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#be123c",
                    }}
                  >
                    <AlertTriangle className="w-4 h-4" style={{ flexShrink: 0 }} /> {error}
                  </div>
                  {errorDetail && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "#f43f5e",
                        marginTop: 7,
                        fontFamily: "monospace",
                        wordBreak: "break-word",
                        opacity: 0.75,
                      }}
                    >
                      Detail: {errorDetail}
                    </div>
                  )}
                </div>
              )}
              {success && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "11px 13px",
                    borderRadius: 14,
                    fontSize: 12,
                    fontWeight: 700,
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#059669",
                    marginBottom: 14,
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" style={{ flexShrink: 0 }} /> {success}
                </div>
              )}

              <button
                onClick={handleRegister}
                disabled={registering || deviceSupported === false}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 14,
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  background: "linear-gradient(135deg, #0f0c29, #1a1545)",
                  opacity: registering || deviceSupported === false ? 0.5 : 1,
                  border: "none",
                  cursor: registering || deviceSupported === false ? "not-allowed" : "pointer",
                  boxShadow:
                    registering || deviceSupported === false
                      ? "none"
                      : "0 12px 26px -12px rgba(15,12,41,0.65)",
                  transition: "opacity 0.2s, transform 0.1s",
                }}
              >
                {registering ? (
                  <>
                    <div
                      style={{
                        width: 15,
                        height: 15,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                      }}
                    />
                    Mendaftarkan...
                  </>
                ) : deviceSupported === false ? (
                  "Device ini tidak mendukung sidik jari"
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4" /> Daftarkan Sidik Jari di Device Ini
                  </>
                )}
              </button>
              <p style={{ fontSize: 10.5, color: "#94a3b8", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
                Setiap device (HP/laptop) yang dipakai absen perlu didaftarkan sendiri-sendiri.
              </p>
            </div>

            {redirectTo && (
              <button
                onClick={() => router.push(redirectTo)}
                style={{
                  width: "100%",
                  height: 42,
                  borderRadius: 14,
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: "#64748b",
                  background: "#fff",
                  border: "1px solid #eef0f6",
                  marginTop: 14,
                  cursor: "pointer",
                }}
              >
                ← Kembali ke halaman absen
              </button>
            )}
          </>
        )}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fp-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.12); opacity: 0.5; }
        }
      `}</style>
    </main>
  );
}