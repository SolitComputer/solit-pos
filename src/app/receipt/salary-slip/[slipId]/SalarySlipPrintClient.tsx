"use client";

import { useEffect } from "react";

type Slip = {
  id: string;
  user_id: string;
  year: number;
  month: number;
  salary_type: "FIXED" | "PERCENTAGE";
  base_salary: number;
  allowance_wife: number;
  allowance_child: number;
  allowance_transport: number;
  bonus: number;
  overtime: number;
  total_income: number;
  deduction_violation: number;
  deduction_loan: number;
  deduction_pension: number;
  total_deduction: number;
  net_salary: number;
  status: "DRAFT" | "FINALIZED";
  notes: string | null;
};

type User = {
  id: string;
  name: string;
  role: string;
  phone_number: string | null;
  shift: string;
};

function formatRp(n: number): string {
  if (!n || n === 0) return "-";
  return new Intl.NumberFormat("id-ID").format(n);
}

function formatRpFull(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: "Admin",
    PROGRAMMER: "Programmer",
    ASISTEN_CEO: "Asisten CEO",
    CREW_SALES: "Sales",
    KEPALA_TEKNISI: "Kepala Teknisi",
    SOTECH: "Sotech",
    KONTEN_KREATOR: "Konten Kreator",
    STAFF: "Staff",
  };
  return map[role] ?? role.replace(/_/g, " ");
}

function formatPhone(phone: string | null): string {
  if (!phone) return "-";
  // Format: 0895-xxxx-xxxx
  const d = phone.replace(/\D/g, "");
  const local = d.startsWith("62") ? "0" + d.slice(2) : d;
  // Format dengan tanda hubung setiap 4 digit
  const chunks = local.match(/.{1,4}/g) ?? [local];
  return chunks.join("-");
}

export default function SalarySlipPrintClient({
  slip,
  user,
  periodLabel,
  monthYear,
}: {
  slip: Slip;
  user: User;
  periodLabel: string;
  monthYear: string;
}) {
  // Auto-trigger print dialog
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const today = new Date();
  const todayLabel = today.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      {/* Print styles — hanya aktif saat print */}
      <style>{`
        @page {
          size: A4;
          margin: 15mm 20mm;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .slip-page { box-shadow: none !important; margin: 0 !important; }
        }
        @media screen {
          body { background: #f3f4f6; }
        }
      `}</style>

      {/* Tombol aksi — hilang saat print */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-gray-700 transition"
        >
          🖨️ Print / Simpan PDF
        </button>
        <button
          onClick={() => window.close()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold shadow hover:bg-gray-50 transition"
        >
          ✕ Tutup
        </button>
      </div>

      {/* Slip Container */}
      <div
        className="slip-page bg-white mx-auto my-8 shadow-xl"
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "20mm 22mm",
          fontFamily: "'Arial', sans-serif",
          fontSize: "11pt",
          color: "#111",
          boxSizing: "border-box",
        }}
      >
        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "8mm", borderBottom: "2px solid #111", paddingBottom: "6mm" }}>
          {/* Logo */}
          <div style={{ marginRight: "6mm", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Solit Computer"
              style={{ width: "18mm", height: "18mm", objectFit: "contain" }}
              onError={(e) => {
                // Fallback kalau logo tidak ada
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          {/* Title */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "15pt", fontWeight: "bold", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              SLIP GAJI KARYAWAN SOLIT COMPUTER
            </div>
            <div style={{ fontSize: "10pt", marginTop: "2mm", color: "#333" }}>
              PERIODE {periodLabel.toUpperCase()}
            </div>
            {slip.status === "DRAFT" && (
              <div style={{ fontSize: "8pt", color: "#e11d48", marginTop: "1mm", fontWeight: "bold" }}>
                ⚠️ DRAFT — BELUM DIFINALISASI
              </div>
            )}
          </div>
        </div>

        {/* ── INFO KARYAWAN ── */}
        <div style={{ marginBottom: "8mm" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <InfoRow label="Nama" value={user.name} bold />
              <InfoRow label="Jabatan" value={roleLabel(user.role)} />
              {user.phone_number && (
                <>
                  <InfoRow label="Rek Pribadi" value={formatPhone(user.phone_number)} bold />
                  <InfoRow label="" value={`Dana a/n ${user.name.split(" ").slice(0, 2).join(" ")}`} bold />
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* ── TABEL PENGHASILAN + POTONGAN ── */}
        <div style={{ display: "flex", gap: "8mm", marginBottom: "6mm" }}>
          {/* Penghasilan */}
          <div style={{ flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #111" }}>
              <thead>
                <tr>
                  <th colSpan={3} style={{ background: "#fff", border: "1px solid #111", padding: "3mm 4mm", textAlign: "center", fontWeight: "bold", fontSize: "11pt", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                    PENGHASILAN
                  </th>
                </tr>
              </thead>
              <tbody>
                <SlipRow label="Gaji Pokok" amount={slip.base_salary} />
                <SlipRow label="Tunjangan Istri" amount={slip.allowance_wife} />
                <SlipRow label="Tunjangan Anak" amount={slip.allowance_child} />
                <SlipRow label="Tunjangan Transport" amount={slip.allowance_transport} />
                <SlipRow label="Bonus" amount={slip.bonus} />
                <SlipRow label="Lemburan" amount={slip.overtime} />
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1.5px solid #111" }}>
                  <td style={{ padding: "3mm 4mm", fontWeight: "bold", fontSize: "10.5pt" }}>Total :</td>
                  <td style={{ padding: "3mm 2mm", fontWeight: "bold", textAlign: "right" }}>Rp</td>
                  <td style={{ padding: "3mm 4mm", fontWeight: "bold", textAlign: "right", minWidth: "24mm" }}>
                    {formatRpFull(slip.total_income)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Potongan */}
          <div style={{ flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #111" }}>
              <thead>
                <tr>
                  <th colSpan={3} style={{ background: "#fff", border: "1px solid #111", padding: "3mm 4mm", textAlign: "center", fontWeight: "bold", fontSize: "11pt", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                    POTONGAN
                  </th>
                </tr>
              </thead>
              <tbody>
                <SlipRow label="Pelanggaran" amount={slip.deduction_violation} />
                <SlipRow label="Cicilan Pinjaman" amount={slip.deduction_loan} />
                <SlipRow label="Dana Pensiun" amount={slip.deduction_pension} />
                {/* Padding rows supaya tingginya sama dengan tabel kiri */}
                <SlipRow label="" amount={null} />
                <SlipRow label="" amount={null} />
                <SlipRow label="" amount={null} />
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1.5px solid #111" }}>
                  <td style={{ padding: "3mm 4mm", fontWeight: "bold", fontSize: "10.5pt" }}>Total :</td>
                  <td style={{ padding: "3mm 2mm", fontWeight: "bold", textAlign: "right" }}>Rp</td>
                  <td style={{ padding: "3mm 4mm", fontWeight: "bold", textAlign: "right", minWidth: "24mm" }}>
                    {formatRpFull(slip.total_deduction)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── GAJI BERSIH ── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "10mm" }}>
          <div style={{ border: "2px solid #111", padding: "3mm 8mm", display: "inline-flex", alignItems: "center", gap: "4mm" }}>
            <span style={{ fontWeight: "bold", fontSize: "12pt", whiteSpace: "nowrap" }}>GAJI BERSIH :</span>
            <span style={{ fontWeight: "bold", fontSize: "12pt", whiteSpace: "nowrap" }}>Rp</span>
            <span style={{ fontWeight: "bold", fontSize: "13pt", minWidth: "32mm", textAlign: "right" }}>
              {formatRpFull(slip.net_salary)}
            </span>
          </div>
        </div>

        {/* Metode pembayaran */}
        <div style={{ textAlign: "center", color: "#e11d48", fontWeight: "bold", fontSize: "11pt", marginBottom: "10mm", letterSpacing: "1px" }}>
          TRANSFER
        </div>

        {/* ── TTD + TANGGAL ── */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ textAlign: "center", minWidth: "50mm" }}>
            <div style={{ fontSize: "10pt", marginBottom: "1mm" }}>Depok, {todayLabel}</div>
            <div style={{ fontSize: "10pt", marginBottom: "18mm" }}>Finance Purchasing</div>
            {/* Space untuk TTD */}
            <div style={{ borderBottom: "1px solid transparent", height: "1px" }} />
            <div style={{ fontSize: "10pt", fontWeight: "bold", marginTop: "1mm" }}>Herliana Agustina</div>
          </div>
        </div>

        {/* Notes kalau ada */}
        {slip.notes && (
          <div style={{ marginTop: "6mm", padding: "3mm 4mm", border: "1px solid #ccc", borderRadius: "2mm", fontSize: "9pt", color: "#555" }}>
            <strong>Catatan:</strong> {slip.notes}
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ──

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr>
      <td style={{ width: "28mm", fontWeight: "bold", padding: "0.8mm 0", verticalAlign: "top" }}>
        {label}{label ? " :" : ""}
      </td>
      <td style={{ padding: "0.8mm 0 0.8mm 4mm", fontWeight: bold ? "bold" : "normal" }}>
        {value}
      </td>
    </tr>
  );
}

function SlipRow({ label, amount }: { label: string; amount: number | null }) {
  return (
    <tr>
      <td style={{ padding: "2mm 4mm", borderBottom: "1px solid #e5e7eb", fontSize: "10.5pt" }}>
        {label}
      </td>
      <td style={{ padding: "2mm 2mm", borderBottom: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
        {amount !== null && amount !== undefined ? "Rp" : ""}
      </td>
      <td style={{ padding: "2mm 4mm", borderBottom: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap", minWidth: "22mm" }}>
        {amount === null || amount === undefined ? "" : amount === 0 ? "-" : formatRp(amount)}
      </td>
    </tr>
  );
}