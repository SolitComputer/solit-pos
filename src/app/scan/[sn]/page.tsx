// C:\solit-pos\src\app\scan\[sn]\page.tsx
//
// Halaman ini dibuka saat barcode di-scan.
// URL: /scan/ABC123
// - Fetch data unit berdasarkan SN dari params
// - Cek role user (dari /api/auth/me)
// - Laptop: SALES/ADMIN → Lihat Data + Jual Sekarang; role lain → Lihat Data
// - Aksesoris: Lihat Detail Aksesoris

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getAuthUser } from "@/hooks/useAuthUser";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LaptopUnitData {
  type: "LAPTOP";
  id: string;
  serial_number: string;
  grade: "A" | "B" | "C";
  condition_note: string;
  selling_price: number;
  status: string;
  notes: string;
  laptop: {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    gpu: string;
    display: string;
  };
}

interface AccessoryUnitData {
  type: "ACCESSORY";
  id: string;
  serial_number: string;
  condition: string;        // BARU | BEKAS
  selling_price: number;
  status: string;           // TERSEDIA | TERJUAL | ...
  notes: string | null;
  accessory: {
    id: string;
    name: string;
    category: string;
    brand: string | null;
    spec: string | null;
  };
}

// Nama tetap UnitData biar useState & referensi lain nggak berubah
type UnitData = LaptopUnitData | AccessoryUnitData;

interface AuthUser {
  id: string;
  name: string;
  role: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_CONFIG = {
  A: { label: "Grade A", desc: "Kondisi mulus / sempurna", color: "#059669", bg: "#d1fae5", border: "#6ee7b7" },
  B: { label: "Grade B", desc: "Minus sedikit", color: "#d97706", bg: "#fef3c7", border: "#fcd34d" },
  C: { label: "Grade C", desc: "Banyak minus", color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  SIAP_JUAL: { label: "Siap Jual", color: "#059669", dot: "#10b981" },
  BELUM_SIAP: { label: "Belum Siap", color: "#d97706", dot: "#f59e0b" },
  SERVICE: { label: "Service", color: "#2563eb", dot: "#3b82f6" },
  SOLD: { label: "Terjual", color: "#6b7280", dot: "#9ca3af" },
};

const ACC_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  TERSEDIA: { label: "Tersedia", color: "#059669", dot: "#10b981" },
  TERJUAL: { label: "Terjual", color: "#6b7280", dot: "#9ca3af" },
  RUSAK: { label: "Rusak", color: "#dc2626", dot: "#ef4444" },
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ScanPage() {
  const { sn } = useParams<{ sn: string }>();
  const router = useRouter();

  const [unit, setUnit] = useState<UnitData | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const decodedSn = decodeURIComponent(sn || "");

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        // Paralel: fetch unit data + auth user
        const [unitRes, authRes] = await Promise.all([
          fetch(`/api/units/check-sn?sn=${encodeURIComponent(decodedSn)}`),
          getAuthUser().then(u => ({ ok: true, json: () => Promise.resolve({ success: true, user: u }) })),
        ]);

        const unitData = await unitRes.json();
        const authData = await authRes.json().catch(() => ({ success: false, user: null }));

        if (!unitData.success) {
          setError(unitData.message || "Unit tidak ditemukan");
        } else {
          setUnit(unitData.data);
        }

        if (authData.success && authData.user) {
          setUser(authData.user);
        }
      } catch {
        setError("Gagal memuat data. Periksa koneksi internet.");
      } finally {
        setLoading(false);
      }
    };

    if (decodedSn) init();
  }, [decodedSn]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <ScanLoadingScreen sn={decodedSn} />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !unit) return <ScanErrorScreen sn={decodedSn} message={error} />;

  // ── Cabang: Aksesoris (early-return, sebelum kode laptop) ──
  if (unit.type === "ACCESSORY") {
    return <AccessoryScanView decodedSn={decodedSn} unit={unit} user={user} />;
  }

  // ── Di bawah sini `unit` sudah pasti LaptopUnitData (TS narrowing) ──
  // Role check: hanya ADMIN dan SALES yang bisa jual
  const canSell = user?.role === "ADMIN" || user?.role === "SALES";
  const canSellUnit = canSell && unit.status === "SIAP_JUAL";

  const grade = GRADE_CONFIG[unit.grade] ?? GRADE_CONFIG.A;
  const status = STATUS_CONFIG[unit.status] ?? { label: unit.status, color: "#6b7280", dot: "#9ca3af" };
  const laptop = unit.laptop;

  return (
    <div style={styles.root}>
      {/* Background decoration */}
      <div style={styles.bgCircle1} />
      <div style={styles.bgCircle2} />

      <div style={styles.container}>

        {/* ── Header ── */}
        <div style={styles.header}>
          <div style={styles.scanIcon}>
            <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4v1m0 14v1M4 12H3m18 0h-1M6.343 6.343l-.707-.707m13.728 13.728l-.707-.707M6.343 17.657l-.707.707M17.657 6.343l-.707.707" />
            </svg>
          </div>
          <div>
            <p style={styles.headerLabel}>Hasil Scan</p>
            <p style={styles.headerSn}>{decodedSn}</p>
          </div>
          {user && (
            <div style={styles.userBadge}>
              <span style={styles.userRole}>{user.role}</span>
              <span style={styles.userName}>{user.name}</span>
            </div>
          )}
        </div>

        {/* ── Laptop Info Card ── */}
        <div style={styles.card}>
          <div style={styles.laptopHeader}>
            <div style={styles.laptopIcon}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={styles.laptopName}>{laptop.laptop_name}</h2>
              <p style={styles.laptopBrand}>{laptop.brand}</p>
            </div>
            {/* Status badge */}
            <div style={{
              ...styles.statusBadge,
              background: status.color + "15",
              border: `1px solid ${status.color}30`,
            }}>
              <span style={{ ...styles.statusDot, background: status.dot }} />
              <span style={{ color: status.color, fontSize: 11, fontWeight: 600 }}>
                {status.label}
              </span>
            </div>
          </div>

          {/* Specs grid */}
          <div style={styles.specsGrid}>
            {[
              { label: "CPU", value: laptop.cpu },
              { label: "RAM", value: laptop.ram },
              { label: "Storage", value: laptop.storage },
              { label: "GPU", value: laptop.gpu },
              { label: "Display", value: laptop.display },
            ].filter(s => s.value).map(spec => (
              <div key={spec.label} style={styles.specItem}>
                <span style={styles.specLabel}>{spec.label}</span>
                <span style={styles.specValue}>{spec.value}</span>
              </div>
            ))}
          </div>

          {/* SN + Grade row */}
          <div style={styles.snGradeRow}>
            <div style={styles.snBox}>
              <span style={styles.snLabel}>Serial Number</span>
              <span style={styles.snValue}>{unit.serial_number}</span>
            </div>
            <div style={{
              ...styles.gradeBox,
              background: grade.bg,
              border: `1px solid ${grade.border}`,
            }}>
              <span style={{ color: grade.color, fontSize: 12, fontWeight: 700 }}>{grade.label}</span>
              <span style={{ color: grade.color, fontSize: 10, opacity: 0.8 }}>{grade.desc}</span>
            </div>
          </div>

          {/* Condition note */}
          {unit.condition_note && (
            <div style={styles.conditionNote}>
              <svg width="13" height="13" fill="none" stroke="#b45309" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span style={{ color: "#92400e", fontSize: 12 }}>{unit.condition_note}</span>
            </div>
          )}

          {/* Price */}
          <div style={styles.priceRow}>
            <span style={styles.priceLabel}>Harga Jual</span>
            <span style={styles.priceValue}>{fmt(unit.selling_price)}</span>
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div style={styles.actions}>

          {/* Jual Sekarang — hanya SALES/ADMIN + status SIAP_JUAL */}
          {canSell && (
            <>
              {canSellUnit ? (
                <button
                  onClick={() => {
                    // Redirect ke payment/create dengan unit info di URL params
                    const params = new URLSearchParams({
                      unit_id: unit.id,
                      laptop_id: laptop.id,
                      sn: unit.serial_number,
                    });
                    router.push(`/payment/create?${params.toString()}`);
                  }}
                  style={styles.btnSell}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Jual Sekarang
                </button>
              ) : (
                <div style={styles.btnSellDisabled}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Tidak Tersedia untuk Dijual
                  <span style={styles.sellDisabledNote}>Status: {status.label}</span>
                </div>
              )}
            </>
          )}

          {/* Lihat Data — semua role */}
          <Link
            href={`/dashboard/laptops/${laptop.id}/units`}
            style={styles.btnView}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Lihat Detail Unit
          </Link>

          {/* Kembali ke dashboard jika sudah login */}
          {user && (
            <Link href="/dashboard/laptops" style={styles.btnBack}>
              ← Kembali ke Dashboard
            </Link>
          )}
        </div>

        {/* Guest notice */}
        {!user && (
          <p style={styles.guestNotice}>
            <Link href="/login" style={{ color: "#1a1a2e", fontWeight: 600 }}>Login</Link>
            {" "}untuk mengakses opsi penjualan
          </p>
        )}

      </div>
    </div>
  );
}

// ─── Accessory Scan View ──────────────────────────────────────────────────────
function AccessoryScanView({
  decodedSn,
  unit,
  user,
}: {
  decodedSn: string;
  unit: AccessoryUnitData;
  user: AuthUser | null;
}) {
  const acc = unit.accessory;
  const status =
    ACC_STATUS_CONFIG[unit.status] ?? { label: unit.status, color: "#6b7280", dot: "#9ca3af" };

  const specs = [
    { label: "Kategori", value: acc.category },
    { label: "Brand", value: acc.brand },
    { label: "Spesifikasi", value: acc.spec },
  ].filter((s) => s.value);

  return (
    <div style={styles.root}>
      <div style={styles.bgCircle1} />
      <div style={styles.bgCircle2} />

      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.scanIcon}>
            <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4v1m0 14v1M4 12H3m18 0h-1M6.343 6.343l-.707-.707m13.728 13.728l-.707-.707M6.343 17.657l-.707.707M17.657 6.343l-.707.707" />
            </svg>
          </div>
          <div>
            <p style={styles.headerLabel}>Hasil Scan</p>
            <p style={styles.headerSn}>{decodedSn}</p>
          </div>
          {user && (
            <div style={styles.userBadge}>
              <span style={styles.userRole}>{user.role}</span>
              <span style={styles.userName}>{user.name}</span>
            </div>
          )}
        </div>

        {/* Card */}
        <div style={styles.card}>
          <div style={styles.laptopHeader}>
            <div style={styles.laptopIcon}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={styles.laptopName}>{acc.name}</h2>
              <p style={styles.laptopBrand}>{acc.brand || acc.category}</p>
            </div>
            <div style={{
              ...styles.statusBadge,
              background: status.color + "15",
              border: `1px solid ${status.color}30`,
            }}>
              <span style={{ ...styles.statusDot, background: status.dot }} />
              <span style={{ color: status.color, fontSize: 11, fontWeight: 600 }}>
                {status.label}
              </span>
            </div>
          </div>

          {/* Specs */}
          {specs.length > 0 && (
            <div style={styles.specsGrid}>
              {specs.map((s) => (
                <div key={s.label} style={styles.specItem}>
                  <span style={styles.specLabel}>{s.label}</span>
                  <span style={styles.specValue}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* SN + Kondisi */}
          <div style={styles.snGradeRow}>
            <div style={styles.snBox}>
              <span style={styles.snLabel}>Serial Number</span>
              <span style={styles.snValue}>{unit.serial_number}</span>
            </div>
            <div style={{ ...styles.gradeBox, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
              <span style={{ color: "#4338ca", fontSize: 12, fontWeight: 700 }}>{unit.condition}</span>
              <span style={{ color: "#4338ca", fontSize: 10, opacity: 0.8 }}>Kondisi</span>
            </div>
          </div>

          {/* Notes */}
          {unit.notes && (
            <div style={styles.conditionNote}>
              <svg width="13" height="13" fill="none" stroke="#b45309" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span style={{ color: "#92400e", fontSize: 12 }}>{unit.notes}</span>
            </div>
          )}

          {/* Price */}
          <div style={styles.priceRow}>
            <span style={styles.priceLabel}>Harga Jual</span>
            <span style={styles.priceValue}>{fmt(unit.selling_price)}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <Link href={`/dashboard/accessories/${acc.id}`} style={styles.btnView}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Lihat Detail Aksesoris
          </Link>

          {user && (
            <Link href="/dashboard/accessories" style={styles.btnBack}>
              ← Kembali ke Dashboard
            </Link>
          )}
        </div>

        {!user && (
          <p style={styles.guestNotice}>
            <Link href="/login" style={{ color: "#1a1a2e", fontWeight: 600 }}>Login</Link>
            {" "}untuk mengakses opsi lainnya
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function ScanLoadingScreen({ sn }: { sn: string }) {
  return (
    <div style={styles.root}>
      <div style={styles.container}>
        <div style={{ textAlign: "center", paddingTop: 80 }}>
          <div style={styles.loadingSpinner} />
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 16 }}>Memuat data untuk</p>
          <p style={{ color: "#1a1a2e", fontSize: 13, fontFamily: "monospace", fontWeight: 600, marginTop: 4 }}>{sn}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────
function ScanErrorScreen({ sn, message }: { sn: string; message: string | null }) {
  return (
    <div style={styles.root}>
      <div style={styles.container}>
        <div style={{ textAlign: "center", paddingTop: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}></div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Unit Tidak Ditemukan</h2>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
            {message || `Serial number "${sn}" tidak terdaftar dalam sistem`}
          </p>
          <div style={{ marginTop: 6, padding: "6px 14px", background: "#f3f4f6", borderRadius: 6, display: "inline-block" }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#374151" }}>{sn}</span>
          </div>
          <div style={{ marginTop: 32 }}>
            <Link href="/dashboard/laptops" style={styles.btnView}>
              ← Ke Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100dvh",
    background: "#f8fafc",
    position: "relative",
    overflow: "hidden",
  },
  bgCircle1: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 400,
    height: 400,
    borderRadius: "50%",
    background: "radial-gradient(circle, #1a1a2e10 0%, transparent 70%)",
    pointerEvents: "none",
  },
  bgCircle2: {
    position: "absolute",
    bottom: -80,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: "50%",
    background: "radial-gradient(circle, #1a1a2e08 0%, transparent 70%)",
    pointerEvents: "none",
  },
  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "24px 16px 40px",
    position: "relative",
    zIndex: 1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  scanIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "#1a1a2e",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: 0,
  },
  headerSn: {
    fontSize: 14,
    fontFamily: "monospace",
    fontWeight: 700,
    color: "#1a1a2e",
    margin: 0,
    marginTop: 2,
  },
  userBadge: {
    marginLeft: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
  },
  userRole: {
    fontSize: 10,
    fontWeight: 700,
    color: "#1a1a2e",
    background: "#e0e7ff",
    padding: "2px 8px",
    borderRadius: 99,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  userName: {
    fontSize: 10,
    color: "#9ca3af",
  },
  card: {
    background: "white",
    borderRadius: 20,
    border: "1px solid #f1f5f9",
    boxShadow: "0 1px 20px rgba(0,0,0,0.06)",
    padding: 20,
    marginBottom: 16,
  },
  laptopHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  laptopIcon: {
    fontSize: 28,
    lineHeight: 1,
    flexShrink: 0,
    marginTop: 2,
  },
  laptopName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: 0,
    lineHeight: 1.3,
    wordBreak: "break-word",
  },
  laptopBrand: {
    fontSize: 12,
    color: "#9ca3af",
    margin: "3px 0 0",
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    borderRadius: 99,
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },
  specsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 14,
  },
  specItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    background: "#f8fafc",
    borderRadius: 10,
    padding: "8px 10px",
    border: "1px solid #f1f5f9",
  },
  specLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  specValue: {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
  },
  snGradeRow: {
    display: "flex",
    gap: 10,
    marginBottom: 12,
    alignItems: "stretch",
  },
  snBox: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 3,
    background: "#f8fafc",
    borderRadius: 10,
    padding: "10px 12px",
    border: "1px solid #f1f5f9",
    minWidth: 0,
  },
  snLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  snValue: {
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: 700,
    color: "#1a1a2e",
    wordBreak: "break-all",
  },
  gradeBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    padding: "10px 16px",
    gap: 2,
    flexShrink: 0,
  },
  conditionNote: {
    display: "flex",
    gap: 7,
    alignItems: "flex-start",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 10,
    padding: "9px 12px",
    marginBottom: 12,
  },
  priceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTop: "1px solid #f1f5f9",
  },
  priceLabel: {
    fontSize: 13,
    color: "#6b7280",
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 800,
    color: "#1a1a2e",
    letterSpacing: "-0.02em",
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  btnSell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    height: 52,
    background: "#1a1a2e",
    color: "white",
    border: "none",
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "-0.01em",
    transition: "background 0.15s",
    textDecoration: "none",
    boxSizing: "border-box",
  },
  btnSellDisabled: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: "100%",
    padding: "12px 20px",
    background: "#f3f4f6",
    color: "#9ca3af",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    fontSize: 13,
    fontWeight: 600,
    cursor: "not-allowed",
    boxSizing: "border-box",
  },
  sellDisabledNote: {
    fontSize: 11,
    fontWeight: 400,
    color: "#d1d5db",
  },
  btnView: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    height: 48,
    background: "white",
    color: "#1a1a2e",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    boxSizing: "border-box",
  },
  btnBack: {
    display: "block",
    textAlign: "center",
    padding: "12px 20px",
    color: "#9ca3af",
    fontSize: 13,
    textDecoration: "none",
    borderRadius: 10,
  },
  loadingSpinner: {
    width: 36,
    height: 36,
    border: "3px solid #f3f4f6",
    borderTop: "3px solid #1a1a2e",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto",
  },
  guestNotice: {
    textAlign: "center",
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 16,
  },
};