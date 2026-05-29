// C:\solit-pos\src\components\ui\BarcodeModal.tsx
//
// Modal untuk menampilkan + mencetak barcode unit.
// Dipanggil dari laptops/page.tsx saat klik ikon barcode di row.
//
// Barcode = CODE128 dari serial_number unit yang berstatus SIAP_JUAL.
// Jika ada beberapa unit SIAP_JUAL, ditampilkan semua (bisa cetak satu-satu).
//
// Dependencies: jsbarcode (npm install jsbarcode)
// Atau gunakan canvas native — tidak perlu install package.

"use client";

import { useEffect, useRef, useState } from "react";

interface UnitBarcode {
  id: string;
  serial_number: string;
  grade: "A" | "B" | "C";
  selling_price: number;
  status: string;
}

interface BarcodeModalProps {
  laptopId: string;
  laptopName: string;
  onClose: () => void;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_COLOR = {
  A: { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" },
  B: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
  C: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
};

export default function BarcodeModal({ laptopId, laptopName, onClose }: BarcodeModalProps) {
  const [units, setUnits] = useState<UnitBarcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const res = await fetch(`/api/laptops/${laptopId}/units`);
        const data = await res.json();
        // Tampilkan semua unit yang SIAP_JUAL saja untuk barcode penjualan
        const siapJual: UnitBarcode[] = (data.data || []).filter(
          (u: UnitBarcode) => u.status === "SIAP_JUAL"
        );
        setUnits(siapJual);
      } catch {
        setUnits([]);
      } finally {
        setLoading(false);
      }
    };
    fetchUnits();
  }, [laptopId]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const activeUnit = units[activeIdx] ?? null;

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>

        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={iconBoxStyle}>
              <svg width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4v1m0 14v1M4 12H3m18 0h-1M6.343 6.343l-.707-.707m13.728 13.728l-.707-.707M6.343 17.657l-.707.707M17.657 6.343l-.707.707" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>
                Barcode Unit
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                {laptopName}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={spinnerStyle} />
              <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 12 }}>Memuat unit...</p>
            </div>
          ) : units.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
              <p style={{ color: "#374151", fontSize: 14, fontWeight: 600, margin: 0 }}>
                Tidak ada unit tersedia
              </p>
              <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 6 }}>
                Belum ada unit dengan status <strong>Siap Jual</strong>
              </p>
            </div>
          ) : (
            <>
              {/* Unit tabs — jika lebih dari 1 */}
              {units.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {units.map((u, idx) => (
                    <button
                      key={u.id}
                      onClick={() => setActiveIdx(idx)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 8,
                        border: "1px solid",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        background: activeIdx === idx ? "#1a1a2e" : "white",
                        color: activeIdx === idx ? "white" : "#6b7280",
                        borderColor: activeIdx === idx ? "#1a1a2e" : "#e5e7eb",
                      }}
                    >
                      Unit {idx + 1} · {u.grade}
                    </button>
                  ))}
                </div>
              )}

              {/* Barcode card */}
              {activeUnit && (
                <BarcodeCard
                  unit={activeUnit}
                  laptopName={laptopName}
                />
              )}

              {/* Info scan */}
              <div style={scanInfoStyle}>
                <svg width="13" height="13" fill="none" stroke="#2563eb" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={{ color: "#1d4ed8", fontSize: 11 }}>
                  Scan barcode untuk melihat detail atau memproses penjualan
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Barcode Card ─────────────────────────────────────────────────────────────
function BarcodeCard({ unit, laptopName }: { unit: UnitBarcode; laptopName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scanUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/scan/${encodeURIComponent(unit.serial_number)}`;

  useEffect(() => {
    drawBarcode(canvasRef.current, unit.serial_number);
  }, [unit.serial_number]);

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const imgData = canvas.toDataURL("image/png");
    const grade = GRADE_COLOR[unit.grade] || GRADE_COLOR.A;

    const printWin = window.open("", "_blank", "width=400,height=600");
    if (!printWin) return;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Barcode - ${unit.serial_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
          }
          .card {
            border: 2px solid #1a1a2e;
            border-radius: 16px;
            padding: 20px;
            width: 280px;
            text-align: center;
          }
          .laptop-name {
            font-size: 13px;
            font-weight: 700;
            color: #1a1a2e;
            margin-bottom: 4px;
          }
          .grade-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 99px;
            font-size: 11px;
            font-weight: 700;
            background: ${grade.bg};
            color: ${grade.text};
            border: 1px solid ${grade.border};
            margin-bottom: 14px;
          }
          .barcode-img {
            width: 100%;
            max-width: 240px;
            margin: 0 auto 12px;
            display: block;
          }
          .sn {
            font-family: monospace;
            font-size: 11px;
            color: #6b7280;
            letter-spacing: 0.08em;
            margin-bottom: 8px;
          }
          .price {
            font-size: 16px;
            font-weight: 800;
            color: #1a1a2e;
            letter-spacing: -0.02em;
          }
          .divider {
            border: none;
            border-top: 1px dashed #e5e7eb;
            margin: 12px 0;
          }
          .scan-url {
            font-size: 9px;
            color: #9ca3af;
            word-break: break-all;
          }
          @media print {
            body { padding: 0; }
            .card { border-radius: 0; border: 1px solid #000; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <p class="laptop-name">${laptopName}</p>
          <span class="grade-badge">Grade ${unit.grade}</span>
          <img src="${imgData}" class="barcode-img" />
          <p class="sn">${unit.serial_number}</p>
          <p class="price">${fmt(unit.selling_price)}</p>
          <hr class="divider" />
          <p class="scan-url">${scanUrl}</p>
        </div>
        <script>
          window.onload = () => { window.print(); window.close(); }
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `barcode-${unit.serial_number}.png`;
    link.click();
  };

  const grade = GRADE_COLOR[unit.grade] || GRADE_COLOR.A;

  return (
    <div style={barcodeCardStyle}>
      {/* Laptop name + grade */}
      <p style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
        {laptopName}
      </p>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <span style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: 99,
          fontSize: 11,
          fontWeight: 700,
          background: grade.bg,
          color: grade.text,
          border: `1px solid ${grade.border}`,
        }}>
          Grade {unit.grade}
        </span>
      </div>

      {/* Barcode canvas */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <canvas ref={canvasRef} style={{ maxWidth: "100%" }} />
      </div>

      {/* SN text */}
      <p style={{ textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#9ca3af", letterSpacing: "0.08em", marginBottom: 10 }}>
        {unit.serial_number}
      </p>

      {/* Price */}
      <p style={{ textAlign: "center", fontSize: 18, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.02em", marginBottom: 6 }}>
        {fmt(unit.selling_price)}
      </p>

      {/* Scan URL kecil */}
      <p style={{ textAlign: "center", fontSize: 9, color: "#d1d5db", wordBreak: "break-all", marginBottom: 16 }}>
        {scanUrl}
      </p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleDownload} style={btnDownloadStyle}>
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
        <button onClick={handlePrint} style={btnPrintStyle}>
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Cetak
        </button>
      </div>
    </div>
  );
}

// ─── Barcode Generator (Canvas, tanpa library eksternal) ──────────────────────
function drawBarcode(canvas: HTMLCanvasElement | null, text: string) {
  if (!canvas) return;

  // Encode CODE128B
  const CODE128B_START = 104;
  const CODE128_STOP = 106;
  const CODE128_PATTERNS: Record<number, string> = {
    0:"11011001100", 1:"11001101100", 2:"11001100110", 3:"10010011000",
    4:"10010001100", 5:"10001001100", 6:"10011001000", 7:"10011000100",
    8:"10001100100", 9:"11001001000", 10:"11001000100", 11:"11000100100",
    12:"10110011100", 13:"10011011100", 14:"10011001110", 15:"10111001100",
    16:"10011101100", 17:"10011100110", 18:"11001110010", 19:"11001011100",
    20:"11001001110", 21:"11011100100", 22:"11001110100", 23:"11101101110",
    24:"11101001100", 25:"11100101100", 26:"11100100110", 27:"11101100100",
    28:"11100110100", 29:"11100110010", 30:"11011011000", 31:"11011000110",
    32:"11000110110", 33:"10100011000", 34:"10001011000", 35:"10001000110",
    36:"10110001000", 37:"10001101000", 38:"10001100010", 39:"11010001000",
    40:"11000101000", 41:"11000100010", 42:"10110111000", 43:"10110001110",
    44:"10001101110", 45:"10111011000", 46:"10111000110", 47:"10001110110",
    48:"11101110110", 49:"11010001110", 50:"11000101110", 51:"11011101000",
    52:"11011100010", 53:"11011101110", 54:"11101011000", 55:"11101000110",
    56:"11100010110", 57:"11101101000", 58:"11101100010", 59:"11100011010",
    60:"11101111010", 61:"11001000010", 62:"11110001010", 63:"10100110000",
    64:"10100001100", 65:"10010110000", 66:"10010000110", 67:"10000101100",
    68:"10000100110", 69:"10110010000", 70:"10110000100", 71:"10011010000",
    72:"10011000010", 73:"10000110100", 74:"10000110010", 75:"11000010010",
    76:"11001010000", 77:"11110111010", 78:"11000010100", 79:"10001111010",
    80:"10100111100", 81:"10010111100", 82:"10010011110", 83:"10111100100",
    84:"10011110100", 85:"10011110010", 86:"11110100100", 87:"11110010100",
    88:"11110010010", 89:"11011011110", 90:"11011110110", 91:"11110110110",
    92:"10101111000", 93:"10100011110", 94:"10001011110", 95:"10111101000",
    96:"10111100010", 97:"11110101000", 98:"11110100010", 99:"10111011110",
    100:"10111101110", 101:"11101011110", 102:"11110101110",
    103:"11010000100", 104:"11010010000", 105:"11010011100",
    106:"11000111010",
  };

  const getCharCode = (c: string): number => {
    const code = c.charCodeAt(0);
    return code >= 32 && code <= 126 ? code - 32 : -1;
  };

  let checksum = CODE128B_START;
  const bars: string[] = [CODE128_PATTERNS[CODE128B_START]];

  for (let i = 0; i < text.length; i++) {
    const val = getCharCode(text[i]);
    if (val < 0) continue;
    checksum += (i + 1) * val;
    bars.push(CODE128_PATTERNS[val] ?? CODE128_PATTERNS[0]);
  }

  bars.push(CODE128_PATTERNS[checksum % 103]);
  bars.push(CODE128_PATTERNS[CODE128_STOP]);

  const combined = bars.join("") + "11"; // trailing
  const moduleWidth = 2;
  const barHeight = 60;
  const quietZone = 10;
  const canvasWidth = combined.length * moduleWidth + quietZone * 2;
  const canvasHeight = barHeight + 16; // 16 for text area

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  for (let i = 0; i < combined.length; i++) {
    if (combined[i] === "1") {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(quietZone + i * moduleWidth, 0, moduleWidth, barHeight);
    }
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  background: "rgba(0,0,0,0.45)",
  backdropFilter: "blur(4px)",
};

const modalStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 20,
  width: "100%",
  maxWidth: 380,
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderBottom: "1px solid #f1f5f9",
};

const iconBoxStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "#1a1a2e",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const closeButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  border: "1px solid #f1f5f9",
  background: "white",
  cursor: "pointer",
  color: "#9ca3af",
};

const barcodeCardStyle: React.CSSProperties = {
  background: "#f9fafb",
  border: "1px solid #f1f5f9",
  borderRadius: 14,
  padding: "16px",
  marginBottom: 12,
};

const scanInfoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 10,
  padding: "9px 12px",
};

const spinnerStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: "2.5px solid #f3f4f6",
  borderTop: "2.5px solid #1a1a2e",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
  margin: "0 auto",
};

const btnDownloadStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 38,
  background: "white",
  color: "#374151",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnPrintStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 38,
  background: "#1a1a2e",
  color: "white",
  border: "none",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};