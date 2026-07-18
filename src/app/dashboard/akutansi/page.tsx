"use client";
// src/app/dashboard/akuntansi/page.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fraunces } from "next/font/google";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MONTH_LABELS } from "@/lib/accounting";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

function stampRipple(e: React.MouseEvent<HTMLButtonElement>, color: string) {
  const button = e.currentTarget;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.8;
  const ripple = document.createElement("span");
  ripple.className = "ledger-ripple";
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  ripple.style.background = color;
  button.appendChild(ripple);
  setTimeout(() => ripple.remove(), 550);
}

export default function AkuntansiPeriodPickerPage() {
  const router = useRouter();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [year, setYear] = useState(currentYear);

  const open = (
    month: number,
    e: React.MouseEvent<HTMLButtonElement>,
    isFutureMonth: boolean
  ) => {
    stampRipple(e, isFutureMonth ? "rgba(15,12,41,0.06)" : "rgba(58,53,40,0.18)");
    const period = `${year}-${String(month).padStart(2, "0")}`;
    router.push(`/dashboard/akutansi/${period}`);
  };

  return (
    <DashboardLayout>
      <div className="ledger-bg relative min-h-[80vh] bg-[#F7F7F8]">
        <div className="relative max-w-[1100px] mx-auto px-6 py-10 space-y-8">
          {/* Header */}
          <div className="relative flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-[2px] bg-gradient-to-r from-[#0f0c29] to-transparent" />
                <span className="text-[10px] font-semibold tracking-[0.25em] uppercase text-[#9C7420]">
                  Pembukuan Internal
                </span>
              </div>
              <h1
                className={`${fraunces.className} text-4xl font-black italic text-gray-900 tracking-tight`}
              >
                Akuntansi
              </h1>
              <p className="text-sm text-gray-500 mt-1.5">
                Pilih bulan untuk membuka buku besar
              </p>
            </div>

            {/* Year switcher */}
            <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-full p-1 shadow-sm">
              <button
                onClick={() => setYear((y) => y - 1)}
                aria-label="Tahun sebelumnya"
                className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-900 active:scale-90 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9C7420]"
              >
                ‹
              </button>
              <span
                key={year}
                className={`year-pop ${fraunces.className} px-3 text-sm font-bold text-gray-900 tabular-nums`}
              >
                {year}
              </span>
              <button
                onClick={() => setYear((y) => y + 1)}
                disabled={year >= currentYear + 1}
                aria-label="Tahun berikutnya"
                className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-900 active:scale-90 transition-all duration-150 disabled:opacity-25 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9C7420]"
              >
                ›
              </button>
            </div>
          </div>

          {/* Grid bulan — kartu ledger */}
          <div className="relative grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m, i) => {
              const isCurrent = year === currentYear && m === currentMonth;
              const isFuture =
                year > currentYear || (year === currentYear && m > currentMonth);
              const tilt = i % 2 === 0 ? "-2deg" : "2deg";

              return (
                <button
                  key={m}
                  onClick={(e) => open(m, e, isFuture)}
                  aria-label={`Buka pembukuan ${MONTH_LABELS[m - 1]} ${year}`}
                  style={{ animationDelay: `${i * 45}ms`, ["--tilt" as string]: tilt }}
                  className={`ledger-card group relative aspect-[4/5] rounded-lg overflow-hidden transition-all duration-200 flex flex-col items-center justify-center active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9C7420] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F7F8]
                    ${
                      isFuture
                        ? "bg-white/60 border border-dashed border-gray-200 text-gray-300 hover:border-gray-300"
                        : "paper bg-[#FBF7EC] border border-black/5 text-[#3A3528] shadow-sm hover:-translate-y-1.5 hover:shadow-lg hover:shadow-gray-900/10"
                    }`}
                >
                  {isCurrent && (
                    <span className="seal-pulse absolute -top-3 -right-3 w-14 h-14 rounded-full bg-gradient-to-br from-[#0f0c29] to-[#1a1545] border-2 border-[#D9A94A]/70 shadow-lg shadow-black/30 flex flex-col items-center justify-center rotate-[-12deg] z-10">
                      <span className="text-[7px] font-bold tracking-wider uppercase text-[#D9A94A] leading-none">
                        Dibuka
                      </span>
                      <span className="text-[11px] text-white leading-none mt-0.5">✓</span>
                    </span>
                  )}

                  <span
                    className={`${fraunces.className} text-3xl font-bold tabular-nums leading-none transition-transform duration-200 group-hover:scale-110`}
                  >
                    {String(m).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider mt-2 ${
                      isFuture ? "text-gray-300" : "text-[#3A3528]/50"
                    }`}
                  >
                    {MONTH_LABELS[m - 1]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <p className="relative text-xs text-gray-400 font-mono border-t border-gray-200 pt-3">
            Data jurnal dipisah per bulan. Bulan yang belum lewat tetap bisa dibuka untuk input berjalan.
          </p>
        </div>
      </div>

      <style jsx global>{`
        .ledger-bg {
          background-image: radial-gradient(rgba(15, 12, 41, 0.05) 1px, transparent 1px);
          background-size: 22px 22px;
        }

        .ledger-card {
          animation: dealIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes dealIn {
          from {
            opacity: 0;
            transform: translateY(18px) rotate(var(--tilt, 0deg)) scale(0.92);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotate(0deg) scale(1);
          }
        }

        .ledger-card.paper::before {
          content: "";
          position: absolute;
          top: 10px;
          bottom: 10px;
          left: 24%;
          width: 1px;
          background: rgba(184, 92, 74, 0.3);
        }
        .ledger-card.paper {
          background-image: repeating-linear-gradient(
            to bottom,
            transparent,
            transparent 15px,
            rgba(58, 53, 40, 0.04) 16px
          );
        }

        .seal-pulse {
          animation: sealPulse 2.4s ease-out infinite;
        }
        @keyframes sealPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(15, 12, 41, 0.25);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(15, 12, 41, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(15, 12, 41, 0);
          }
        }

        .year-pop {
          display: inline-block;
          animation: yearPop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes yearPop {
          from {
            opacity: 0;
            transform: translateY(4px) scale(0.85);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .ledger-ripple {
          position: absolute;
          border-radius: 9999px;
          animation: rippleAnim 0.55s ease-out forwards;
          pointer-events: none;
        }
        @keyframes rippleAnim {
          from {
            transform: scale(0);
            opacity: 0.55;
          }
          to {
            transform: scale(1);
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ledger-card,
          .ledger-ripple,
          .year-pop,
          .seal-pulse {
            animation: none !important;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}