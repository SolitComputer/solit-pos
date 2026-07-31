"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startRegistration, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { Fingerprint, CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";

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
    setRegistering(true); setError(null); setSuccess(null);
    try {
      const optRes = await fetch("/api/auth/webauthn/register-options", { method: "POST" });
      const optData = await optRes.json();
      if (!optData.success) { setError(optData.message ?? "Gagal memulai pendaftaran"); return; }

      const attResp = await startRegistration({ optionsJSON: optData.options });

      const verifyRes = await fetch("/api/auth/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) { setError(verifyData.message ?? "Gagal mendaftarkan sidik jari"); return; }

      setSuccess("Sidik jari berhasil didaftarkan di device ini");
      fetchStatus();
    } catch (err: any) {
      setError(err?.name === "NotAllowedError" ? "Dibatalkan atau ditolak oleh device" : "Gagal memproses pendaftaran sidik jari");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#F7F7F8", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
            <Fingerprint className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 900, color: "#0f172a" }}>Daftar Sidik Jari</h1>
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Lakukan di depan admin, di device yang akan dipakai absen setiap hari.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, textAlign: "center", fontSize: 13, color: "#94a3b8", border: "1px solid #f0f0f8" }}>
            Memuat status...
          </div>
        ) : !eligible ? (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 16, padding: 20, display: "flex", gap: 12 }}>
            <AlertTriangle className="w-5 h-5" style={{ color: "#d97706", flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>Fitur sidik jari belum diaktifkan</p>
              <p style={{ fontSize: 11.5, color: "#b45309", marginTop: 4 }}>
                Minta admin mengaktifkan sidik jari untuk akun Anda dari halaman Manajemen User.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={{ background: "#fff", borderRadius: 16, padding: 18, border: "1px solid #f0f0f8", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 12 }}>
                <Smartphone className="w-4 h-4" /> Device terdaftar
              </div>
              {devices.length === 0 ? (
                <p style={{ fontSize: 11.5, color: "#94a3b8" }}>Belum ada device yang terdaftar untuk akun ini.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {devices.map(d => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 12, background: "#f8fafc" }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{d.device_label ?? "Unknown device"}</p>
                        <p style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>
                          Didaftarkan {new Date(d.created_at).toLocaleDateString("id-ID")}
                          {d.last_used_at ? ` · terakhir dipakai ${new Date(d.last_used_at).toLocaleDateString("id-ID")}` : ""}
                        </p>
                      </div>
                      <CheckCircle2 className="w-4 h-4" style={{ color: "#059669", flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "#fff", borderRadius: 16, padding: 18, border: "1px solid #f0f0f8" }}>
              {error && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", marginBottom: 12 }}>
                  <AlertTriangle className="w-3.5 h-3.5" style={{ flexShrink: 0 }} /> {error}
                </div>
              )}
              {success && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#059669", marginBottom: 12 }}>
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ flexShrink: 0 }} /> {success}
                </div>
              )}
              <button
                onClick={handleRegister}
                disabled={registering || deviceSupported === false}
                style={{
                  width: "100%", height: 44, borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: "linear-gradient(135deg, #0f0c29, #1a1545)",
                  opacity: registering || deviceSupported === false ? 0.5 : 1,
                  border: "none", cursor: registering || deviceSupported === false ? "not-allowed" : "pointer",
                }}
              >
                {registering ? (
                  <>
                    <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    Mendaftarkan...
                  </>
                ) : deviceSupported === false ? (
                  "Device ini tidak mendukung sidik jari"
                ) : (
                  <><Fingerprint className="w-4 h-4" /> Daftarkan Sidik Jari di Device Ini</>
                )}
              </button>
              <p style={{ fontSize: 10.5, color: "#94a3b8", textAlign: "center", marginTop: 10 }}>
                Setiap device (HP/laptop) yang dipakai absen perlu didaftarkan sendiri-sendiri.
              </p>
            </div>

            {redirectTo && (
              <button
                onClick={() => router.push(redirectTo)}
                style={{ width: "100%", height: 40, borderRadius: 12, fontSize: 11, fontWeight: 700, color: "#64748b", background: "#f1f5f9", border: "none", marginTop: 12, cursor: "pointer" }}
              >
                ← Kembali ke halaman absen
              </button>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}