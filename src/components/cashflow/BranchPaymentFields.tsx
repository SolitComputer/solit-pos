"use client";
// src/components/cashflow/BranchPaymentFields.tsx
//
// Blok bersama "Cabang" + "Metode Pembayaran" yang dipakai SERAGAM di semua modal
// Cashflow & Pengajuan Dana. DUA dimensi yang sengaja DIPISAH:
//   - branch (Cabang): UTAMA / JOGJA — penanda laba-rugi per cabang + tag jurnal.
//   - metode kas (akun kas fisik tempat uang benar-benar keluar/masuk):
//       Saldo      -> payment_method "SALDO", cash_location null    (akun 110)
//       Cash Utama -> payment_method "CASH",  cash_location "UTAMA"  (akun 120)
//       Cash Jogja -> payment_method "CASH",  cash_location "JOGJA"  (akun 121)
//
// Cash Jogja (121) DI-DISABLE sampai kas fisik Jogja ada (jogjaCashEnabled=false).
// Sebelum itu: operasional Jogja dibayar dari Cash Utama -> Cabang=Jogja + Cash Utama.

import { Banknote, Landmark } from "lucide-react";

export type Branch = "UTAMA" | "JOGJA";
export type PaymentMethod = "CASH" | "SALDO";
export type CashLocation = "UTAMA" | "JOGJA" | null;

export interface BranchPaymentValue {
  branch: Branch | null;
  paymentMethod: PaymentMethod | null;
  cashLocation: CashLocation;
}

export interface BranchPaymentFieldsProps {
  value: BranchPaymentValue;
  onChange: (next: BranchPaymentValue) => void;
  /** true = opsi "Cash Jogja" (akun 121) bisa dipilih. Default false (kas fisik Jogja belum ada). */
  jogjaCashEnabled?: boolean;
  disabled?: boolean;
  /** tampilkan tanda wajib (*) di label */
  required?: boolean;
  /** prefix id unik supaya 2 modal di 1 halaman tidak bentrok id select-nya */
  idPrefix?: string;
}

/** Label sumber kas untuk badge/detail: "Cash Utama" | "Cash Jogja" | "Saldo" | "—" */
export function cashSourceLabel(pm: PaymentMethod | null, loc: CashLocation): string {
  if (pm === "SALDO") return "Saldo";
  if (pm === "CASH") return loc === "JOGJA" ? "Cash Jogja" : "Cash Utama";
  return "—";
}

export function BranchPaymentFields({
  value,
  onChange,
  jogjaCashEnabled = false,
  disabled = false,
  required = false,
  idPrefix = "bpf",
}: BranchPaymentFieldsProps) {
  const { branch, paymentMethod, cashLocation } = value;

  const setBranch = (b: Branch) => onChange({ ...value, branch: b });
  const setSaldo = () => onChange({ ...value, paymentMethod: "SALDO", cashLocation: null });
  const setCash = (loc: Exclude<CashLocation, null>) =>
    onChange({ ...value, paymentMethod: "CASH", cashLocation: loc });

  const req = required ? <span className="text-red-500">*</span> : null;

  const segBtn = (active: boolean) =>
    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 " +
    "disabled:opacity-50 disabled:pointer-events-none " +
    (active
      ? "bg-white text-slate-900 shadow-sm border border-slate-200"
      : "text-slate-400 hover:text-slate-600");

  return (
    <div className="space-y-4">
      {/* Cabang (dimensi laba-rugi) */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Cabang {req}</label>
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
          <button type="button" disabled={disabled} aria-pressed={branch === "UTAMA"} onClick={() => setBranch("UTAMA")} className={segBtn(branch === "UTAMA")}>
            🏢 Cabang Utama
          </button>
          <button type="button" disabled={disabled} aria-pressed={branch === "JOGJA"} onClick={() => setBranch("JOGJA")} className={segBtn(branch === "JOGJA")}>
            📍 Cabang Jogja
          </button>
        </div>
      </div>

      {/* Metode Pembayaran (akun kas fisik) */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-2">Metode Pembayaran {req}</label>
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
          <button type="button" disabled={disabled} aria-pressed={paymentMethod === "CASH"} onClick={() => setCash(cashLocation ?? "UTAMA")} className={segBtn(paymentMethod === "CASH")}>
            <Banknote className="w-4 h-4" /> Cash
          </button>
          <button type="button" disabled={disabled} aria-pressed={paymentMethod === "SALDO"} onClick={setSaldo} className={segBtn(paymentMethod === "SALDO")}>
            <Landmark className="w-4 h-4" /> Saldo
          </button>
        </div>

        {/* Sub-pilihan akun Cash — muncul hanya saat Cash dipilih */}
        {paymentMethod === "CASH" && (
          <div className="mt-2">
            <label htmlFor={`${idPrefix}-cashloc`} className="block text-[11px] font-semibold text-slate-500 mb-1">
              Sumber Cash
            </label>
            <select
              id={`${idPrefix}-cashloc`}
              disabled={disabled}
              value={cashLocation ?? "UTAMA"}
              onChange={(e) => setCash(e.target.value as Exclude<CashLocation, null>)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20 transition disabled:opacity-60"
            >
              <option value="UTAMA">Cash Utama</option>
              <option value="JOGJA" disabled={!jogjaCashEnabled}>
                Cash Jogja{!jogjaCashEnabled ? " — kas fisik belum ada" : ""}
              </option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

export default BranchPaymentFields;