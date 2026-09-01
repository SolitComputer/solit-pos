"use client";

import { useEffect } from "react";

type Slip = {
  id: string;
  user_id: string;
  year: number;
  month: number;
  salary_type: "FIXED" | "PERCENTAGE";
  base_salary: number;
  salary_income?: number;
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
  sent_at: string | null;
  sent_by: string | null;
  notes: string | null;
};

type User = {
  id: string;
  name: string;
  role: string;
  phone_number: string | null;
  shift: string;
};

function formatRp(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "-";
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
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  const local = d.startsWith("62") ? "0" + d.slice(2) : d;
  // Format: 0858-1769-2891
  const part1 = local.slice(0, 4);
  const part2 = local.slice(4, 8);
  const part3 = local.slice(8);
  return [part1, part2, part3].filter(Boolean).join("-");
}

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

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
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  const today = new Date();
  const todayLabel = today.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const monthName = MONTH_ID[slip.month - 1] ?? "";
  const shortName = user.name.split(" ").slice(0, 2).join(" ");

  // Period label: "30 APR - 30 MEI 2026" style
  const periodDisplay = periodLabel || `${monthName.toUpperCase()} ${slip.year}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&family=Arial:wght@400;700&display=swap');

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: Arial, 'Helvetica Neue', sans-serif;
          background: #e5e7eb;
          -webkit-font-smoothing: antialiased;
        }

        @page {
          size: A4;
          margin: 15mm 18mm;
        }

        @media print {
          body {
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          .slip-page {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
          }
        }

        @media screen {
          .slip-page {
            margin: 32px auto;
            max-width: 740px;
            background: white;
            box-shadow: 0 2px 24px rgba(0,0,0,0.13);
            padding: 32px 40px 40px;
          }
        }

        /* ─── HEADER ─── */
        .doc-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          padding-bottom: 14px;
          border-bottom: 3px solid #111;
          margin-bottom: 6px;
        }

        .doc-logo {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          border: 2px solid #d1d5db;
        }

        .doc-title-block {
          text-align: center;
          flex: 1;
        }

        .doc-title-main {
          font-size: 18px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #111;
          line-height: 1.2;
        }

        .doc-title-sub {
          font-size: 13px;
          color: #333;
          margin-top: 4px;
          letter-spacing: 0.2px;
        }

        /* ─── DRAFT BADGE ─── */
        .draft-notice {
          text-align: center;
          padding: 5px 0;
          font-size: 11px;
          color: #b45309;
          font-style: italic;
          border-bottom: 1px solid #fde68a;
          background: #fffbeb;
          margin: 0 -40px;
          padding-left: 40px;
          padding-right: 40px;
        }

        /* ─── EMPLOYEE INFO ─── */
        .emp-block {
          padding: 14px 0 10px;
          border-bottom: 1px solid #d1d5db;
          margin-bottom: 12px;
        }

        .emp-row {
          display: flex;
          align-items: baseline;
          margin-bottom: 4px;
          font-size: 13px;
          color: #111;
        }

        .emp-label {
          font-weight: 700;
          width: 130px;
          flex-shrink: 0;
          font-size: 13px;
        }

        .emp-colon {
          margin-right: 8px;
          font-weight: 700;
        }

        .emp-value {
          font-size: 13px;
          color: #111;
        }

        .emp-value.bold {
          font-weight: 700;
        }

        /* ─── SALARY TABLES ─── */
        .tables-wrapper {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          border: 1.5px solid #333;
          margin-bottom: 14px;
        }

        .table-section {
          padding: 0;
        }

        .table-section + .table-section {
          border-left: 1.5px solid #333;
        }

        .table-header {
          background: #f3f4f6;
          text-align: center;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #111;
          border-bottom: 1.5px solid #333;
        }

        .table-body {
          padding: 0;
        }

        .t-row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          padding: 5px 12px;
          border-bottom: 1px solid #e5e7eb;
          min-height: 26px;
          font-size: 12.5px;
          color: #111;
        }

        .t-row:last-child {
          border-bottom: none;
        }

        .t-label {
          color: #111;
        }

        .t-rp {
          width: 28px;
          text-align: left;
          color: #555;
          font-size: 12px;
          padding-right: 4px;
        }

        .t-amount {
          width: 90px;
          text-align: right;
          font-size: 12.5px;
          color: #111;
        }

        .t-amount.zero {
          color: #9ca3af;
        }

        .table-total {
          border-top: 1.5px solid #333;
          padding: 7px 12px;
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          background: #f9fafb;
        }

        .table-total .t-label {
          font-weight: 700;
          font-size: 12.5px;
        }

        .table-total .t-rp {
          font-weight: 700;
        }

        .table-total .t-amount {
          font-weight: 700;
          font-size: 12.5px;
        }

        /* ─── NET SALARY ─── */
        .net-block {
          border: 2px solid #111;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .net-left-label {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .net-center {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .net-rp {
          font-size: 13px;
          font-weight: 700;
        }

        .net-amount {
          font-size: 16px;
          font-weight: 700;
          color: #111;
        }

        .net-method {
          font-size: 12px;
          font-weight: 700;
          color: #dc2626;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          align-self: flex-end;
          padding-bottom: 1px;
        }

        /* ─── FOOTER ─── */
        .slip-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 20px;
          padding-top: 14px;
          border-top: 1px solid #d1d5db;
        }

        .bank-block {
          font-size: 12px;
          color: #374151;
          line-height: 1.6;
        }

        .bank-block .bank-label {
          font-size: 10px;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .bank-block .bank-acc {
          font-size: 14px;
          font-weight: 700;
          color: #111;
          letter-spacing: 0.5px;
        }

        .sig-block {
          text-align: center;
          min-width: 160px;
        }

        .sig-city-date {
          font-size: 12px;
          color: #374151;
          margin-bottom: 56px;
        }

        .sig-line {
          width: 140px;
          height: 1px;
          background: #374151;
          margin: 0 auto 6px;
        }

        .sig-name {
          font-size: 12.5px;
          font-weight: 700;
          color: #111;
        }

        .sig-title {
          font-size: 11px;
          color: #6b7280;
          margin-top: 2px;
        }

        /* ─── NOTES ─── */
        .notes-bar {
          margin-top: 12px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          padding: 8px 14px;
          display: flex;
          gap: 8px;
          align-items: flex-start;
          border-radius: 4px;
        }

        .notes-text {
          font-size: 11.5px;
          color: #92400e;
          line-height: 1.5;
        }

        /* ─── PRINT BUTTONS ─── */
        .no-print.actions {
          position: fixed;
          top: 16px;
          right: 16px;
          display: flex;
          gap: 8px;
          z-index: 100;
        }

        .btn-print {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: #111827;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }

        .btn-print:hover { background: #1f2937; }

        .btn-close {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: white;
          color: #374151;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }

        .btn-close:hover { background: #f9fafb; }
      `}</style>

      {/* ── Action Buttons ── */}
      <div className="no-print actions">
        <button className="btn-print" onClick={() => window.print()}>
           Print / Simpan PDF
        </button>
        <button className="btn-close" onClick={() => window.close()}>
           Tutup
        </button>
      </div>

      {/* ── Slip Page ── */}
      <div className="slip-page">

        {/* HEADER */}
        <div className="doc-header">
          <img
            src="/assets/solit03.jpeg"
            alt="Solit Computer"
            className="doc-logo"
          />
          <div className="doc-title-block">
            <div className="doc-title-main">Slip Gaji Karyawan Solit Computer</div>
            <div className="doc-title-sub">PERIODE {periodDisplay.toUpperCase()}</div>
          </div>
        </div>

        {/* DRAFT NOTICE */}
        {slip.status === "DRAFT" && (
          <div className="draft-notice">
             Dokumen ini berstatus DRAFT — belum difinalisasi
          </div>
        )}

        {/* EMPLOYEE INFO */}
        <div className="emp-block">
          <div className="emp-row">
            <span className="emp-label">Nama</span>
            <span className="emp-colon">:</span>
            <span className="emp-value bold">{user.name}</span>
          </div>
          <div className="emp-row">
            <span className="emp-label">Jabatan</span>
            <span className="emp-colon">:</span>
            <span className="emp-value">{roleLabel(user.role)}</span>
          </div>
          {user.phone_number && (
            <>
              <div className="emp-row">
                <span className="emp-label">Rek Pribadi</span>
                <span className="emp-colon">:</span>
                <span className="emp-value bold">{formatPhone(user.phone_number)}</span>
              </div>
              <div className="emp-row">
                <span className="emp-label">DANA a/n</span>
                <span className="emp-colon">:</span>
                <span className="emp-value bold">{shortName}</span>
              </div>
            </>
          )}
        </div>

        {/* SALARY TABLES */}
        <div className="tables-wrapper">
          {/* Penghasilan */}
          <div className="table-section">
            <div className="table-header">Penghasilan</div>
            <div className="table-body">
              <TableRow label="Gaji Pokok" amount={slip.salary_income ?? slip.base_salary} />
              <TableRow label="Tunjangan Istri" amount={slip.allowance_wife} />
              <TableRow label="Tunjangan Anak" amount={slip.allowance_child} />
              <TableRow label="Tunjangan Transport" amount={slip.allowance_transport} />
              <TableRow label="Bonus" amount={slip.bonus} />
              <TableRow label="Lemburan" amount={slip.overtime} />
            </div>
            <div className="table-total">
              <span className="t-label">Total</span>
              <span className="t-rp">Rp</span>
              <span className="t-amount">{formatRp(slip.total_income)}</span>
            </div>
          </div>

          {/* Potongan */}
          <div className="table-section">
            <div className="table-header">Potongan</div>
            <div className="table-body">
              <TableRow label="Cicilan Pinjaman" amount={slip.deduction_loan} />
              <TableRow label="Dana Pensiun" amount={slip.deduction_pension} />
              {/*  FIX: baris "Pelanggaran" dihapus — deduction_violation selalu 0 dari backend.
                  Spacer ditambah jadi 4 (dari 3) biar tinggi tabel Potongan tetap sejajar
                  dengan tabel Penghasilan yang punya 6 baris */}
              <TableRow label="" amount={null} spacer />
              <TableRow label="" amount={null} spacer />
              <TableRow label="" amount={null} spacer />
              <TableRow label="" amount={null} spacer />
            </div>
            <div className="table-total">
              <span className="t-label">Total</span>
              <span className="t-rp">Rp</span>
              <span className="t-amount">{formatRp(slip.total_deduction)}</span>
            </div>
          </div>
        </div>

        {/* NET SALARY */}
        <div className="net-block">
          <span className="net-left-label">Gaji Bersih :</span>
          <div className="net-center">
            <span className="net-rp">Rp</span>
            <span className="net-amount">{formatRp(slip.net_salary)}</span>
          </div>
          <span className="net-method">Transfer</span>
        </div>

        {/* FOOTER */}
        <div className="slip-footer">
          {user.phone_number ? (
            <div className="bank-block">
              <div className="bank-label">Dibayarkan ke</div>
              <div>Dana (e-wallet) · a/n {shortName}</div>
              <div className="bank-acc">{formatPhone(user.phone_number)}</div>
            </div>
          ) : (
            <div />
          )}
          <div className="sig-block">
            <div className="sig-city-date">Depok, {todayLabel}</div>
            <div className="sig-line" />
            <div className="sig-name">Herliana Agustina</div>
            <div className="sig-title">Finance Purchasing</div>
          </div>
        </div>

        {/* NOTES */}
        {slip.notes && (
          <div className="notes-bar">
            <p className="notes-text"><strong>Catatan:</strong> {slip.notes}</p>
          </div>
        )}

      </div>
    </>
  );
}

// ── Sub-components ──

function TableRow({
  label,
  amount,
  spacer = false,
}: {
  label: string;
  amount: number | null;
  spacer?: boolean;
}) {
  if (spacer) {
    return (
      <div className="t-row" style={{ visibility: "hidden" }}>
        <span className="t-label">&nbsp;</span>
        <span className="t-rp">Rp</span>
        <span className="t-amount">-</span>
      </div>
    );
  }

  const isZero = amount === null || amount === undefined || amount === 0;

  return (
    <div className="t-row">
      <span className="t-label">{label}</span>
      <span className="t-rp">Rp</span>
      <span className={`t-amount${isZero ? " zero" : ""}`}>
        {isZero ? "-" : new Intl.NumberFormat("id-ID").format(amount!)}
      </span>
    </div>
  );
}