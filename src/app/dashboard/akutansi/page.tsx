"use client";
// src/app/dashboard/akuntansi/page.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fraunces } from "next/font/google";
import Image from "next/image";
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
    stampRipple(e, isFutureMonth ? "rgba(143,191,160,0.10)" : "rgba(155,122,74,0.16)");
    const period = `${year}-${String(month).padStart(2, "0")}`;
    router.push(`/dashboard/akutansi/${period}`);
  };

  return (
    <DashboardLayout>
      <div className="ledger-bg relative min-h-[80vh] bg-gradient-to-b from-[#FBF8F2] via-[#F4F1E6] to-[#EAF4EE] overflow-hidden">
        <span aria-hidden="true" className="ambient-sparkle ambient-sparkle-1" />
        <span aria-hidden="true" className="ambient-sparkle ambient-sparkle-2" />
        <span aria-hidden="true" className="ambient-sparkle ambient-sparkle-3" />
        <span aria-hidden="true" className="ambient-sparkle ambient-sparkle-4" />
        <span aria-hidden="true" className="ambient-sparkle ambient-sparkle-5" />

        <div className="relative max-w-[1100px] mx-auto px-6 py-10 space-y-8">
          {/* Header — glass hero panel, foto & year switcher digabung jadi satu widget */}
          <div className="relative rounded-[28px] border border-white/70 bg-white/50 backdrop-blur-sm shadow-[0_10px_35px_rgba(150,120,80,0.10)] px-6 py-6 sm:px-8 sm:py-7 flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-[2px] bg-gradient-to-r from-[#9FD8B5] to-transparent" />
                <span className="text-[10px] font-semibold tracking-[0.25em] uppercase text-[#9C7420]">
                  Pembukuan Internal
                </span>
              </div>
              <h1
                className={`${fraunces.className} text-4xl font-black italic tracking-tight bg-gradient-to-r from-[#3A3528] via-[#5C6B5E] to-[#8A6A2F] bg-clip-text text-transparent`}
              >
                Akuntansi
              </h1>
              <p className="text-sm text-gray-500 mt-1.5">
                Pilih bulan untuk membuka buku besar
              </p>
            </div>

            {/* Companion frame (foto) + Year switcher — satu grup, tidak lagi tabrakan */}
            <div className="relative flex flex-col items-center gap-3">
              <div className="nahida-float relative w-20 h-20 sm:w-28 sm:h-28">
                <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-[#BFE8CE] via-[#E7D9F5] to-[#F6E3B4] opacity-70 blur-xl" />
                <div className="absolute inset-0 rounded-full p-[3px] bg-gradient-to-br from-[#9FD8B5] via-[#F6E3B4] to-[#E7D9F5] shadow-[0_6px_18px_rgba(150,120,80,0.25)]">
                  <div className="w-full h-full rounded-full overflow-hidden bg-white">
                    <Image
                      src="/images/nahida-akutansi.png"
                      alt=""
                      aria-hidden="true"
                      width={220}
                      height={220}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <span className="sparkle sparkle-a" />
                <span className="sparkle sparkle-b" />
                <span className="sparkle sparkle-c" />
              </div>

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
                        : "paper bg-[#FBF7EC] border border-black/5 text-[#3A3528] shadow-sm hover:-translate-y-1.5 hover:shadow-lg hover:shadow-[#8FBFA0]/20 hover:border-[#BFE8CE]/60"
                    }`}
                >
                  {!isFuture && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="absolute top-2.5 left-2.5 w-3 h-3 text-[#9C7420]/35 group-hover:text-[#9C7420]/70 transition-colors duration-300 z-10"
                      fill="currentColor"
                    >
                      <path d="M12 0c0 4.5 3 7.5 7.5 7.5-4.5 0-7.5 3-7.5 7.5 0-4.5-3-7.5-7.5-7.5C9 7.5 12 4.5 12 0z" />
                    </svg>
                  )}

                  {isCurrent && (
                    <span className="seal-pulse absolute -top-3 -right-3 w-14 h-14 rounded-full bg-gradient-to-br from-[#BFE8CE] to-[#EFD9A9] border-2 border-white/70 shadow-lg shadow-[#8FBFA0]/40 flex flex-col items-center justify-center rotate-[-12deg] z-10">
                      <span className="text-[7px] font-bold tracking-wider uppercase text-[#8A6A2F] leading-none">
                        Dibuka
                      </span>
                      <span className="text-[11px] text-[#3A3528] leading-none mt-0.5">✓</span>
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

                  {!isFuture && (
                    <>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        style={{ animationDelay: `${i * 260}ms` }}
                        className="leaf-drift absolute bottom-2.5 right-2.5 w-4 h-4 text-[#8FBFA0] z-10"
                        fill="currentColor"
                      >
                        <path d="M12 2C7 2 3 6 3 12c0 4 3 8 9 10 6-2 9-6 9-10 0-6-4-10-9-10z" opacity="0.55" />
                        <path
                          d="M12 4v16"
                          stroke="currentColor"
                          strokeWidth="0.6"
                          opacity="0.4"
                        />
                      </svg>
                      <span
                        style={{ animationDelay: `${i * 320}ms` }}
                        className="firefly-dot absolute bottom-6 right-1.5 z-10"
                      />
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="relative rounded-2xl border border-white/70 bg-white/50 backdrop-blur-sm px-5 py-3.5 shadow-[0_4px_16px_rgba(150,120,80,0.06)]">
            <p className="text-xs text-gray-500 font-mono">
              Data jurnal dipisah per bulan. Bulan yang belum lewat tetap bisa dibuka untuk input berjalan.
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .ledger-bg {
          background-image: radial-gradient(rgba(150, 130, 90, 0.1) 1px, transparent 1px);
          background-size: 22px 22px;
        }

        .nahida-float {
          animation: nahidaFloat 5s ease-in-out infinite;
        }
        @keyframes nahidaFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .sparkle {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: radial-gradient(circle, #fff 0%, #f6e3b4 60%, transparent 70%);
          animation: sparkleTwinkle 2.6s ease-in-out infinite;
        }
        .sparkle-a {
          top: -8%;
          left: 6%;
          animation-delay: 0s;
        }
        .sparkle-b {
          top: 45%;
          right: -12%;
          animation-delay: 0.8s;
        }
        .sparkle-c {
          bottom: -10%;
          left: 35%;
          animation-delay: 1.6s;
        }
        @keyframes sparkleTwinkle {
          0%,
          100% {
            opacity: 0;
            transform: scale(0.4);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }

        .ambient-sparkle {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, rgba(191, 232, 206, 0.5) 55%, transparent 75%);
          animation: sparkleTwinkle 4.5s ease-in-out infinite;
          pointer-events: none;
        }
        .ambient-sparkle-1 {
          top: 14%;
          left: 8%;
          animation-delay: 0.3s;
        }
        .ambient-sparkle-2 {
          top: 62%;
          right: 10%;
          animation-delay: 1.8s;
        }
        .ambient-sparkle-3 {
          bottom: 10%;
          left: 42%;
          animation-delay: 3s;
        }
        .ambient-sparkle-4 {
          top: 32%;
          left: 48%;
          animation-delay: 2.4s;
        }
        .ambient-sparkle-5 {
          bottom: 30%;
          right: 28%;
          animation-delay: 1.1s;
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
        .ledger-card.paper::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            115deg,
            transparent 20%,
            rgba(255, 255, 255, 0.5) 45%,
            transparent 70%
          );
          transform: translateX(-120%);
          transition: transform 0.6s ease;
          pointer-events: none;
        }
        .ledger-card.paper:hover::after {
          transform: translateX(120%);
        }

        .leaf-drift {
          opacity: 0.35;
          pointer-events: none;
          transition: opacity 0.3s ease;
          animation: leafFloat 4.5s ease-in-out infinite;
        }
        .group:hover .leaf-drift {
          opacity: 0.7;
        }
        @keyframes leafFloat {
          0%,
          100% {
            transform: translateY(0) rotate(-6deg);
          }
          50% {
            transform: translateY(-5px) rotate(6deg);
          }
        }

        .firefly-dot {
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: radial-gradient(circle, #fff 0%, #f6e3b4 60%, transparent 75%);
          animation: sparkleTwinkle 3s ease-in-out infinite;
          pointer-events: none;
        }

        .seal-pulse {
          animation: sealPulse 2.4s ease-out infinite;
        }
        @keyframes sealPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(143, 191, 160, 0.35);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(143, 191, 160, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(143, 191, 160, 0);
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
          .seal-pulse,
          .nahida-float,
          .sparkle,
          .ambient-sparkle,
          .leaf-drift,
          .firefly-dot {
            animation: none !important;
          }
          .ledger-card.paper::after {
            transition: none !important;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}