"use client";
// src/app/dashboard/akuntansi/page.tsx

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MONTH_LABELS } from "@/lib/accounting";


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

  // Foto companion custom — bisa diganti langsung dari web (upload), tanpa perlu edit kode.
  // Kalau belum pernah di-upload, fallback ke foto default di /public/images.
  const [companionPhotoUrl, setCompanionPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/photo?key=akutansi_companion_photo")
      .then((r) => r.json())
      .then((j) => { if (j.success && j.url) setCompanionPhotoUrl(j.url); })
      .catch(() => { });
  }, []);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset supaya bisa pilih file yang sama lagi kalau perlu
    if (!file) return;

    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("key", "akutansi_companion_photo");
      form.append("file", file);
      const res = await fetch("/api/settings/photo", { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) { setPhotoError(json.message ?? "Gagal upload foto"); return; }
      setCompanionPhotoUrl(json.url);
    } catch {
      setPhotoError("Koneksi bermasalah");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Motif/watermark background di kartu bulan — sama seperti foto companion, bisa diganti dari web.
  const [cardWatermarkUrl, setCardWatermarkUrl] = useState<string | null>(null);
  const [uploadingWatermark, setUploadingWatermark] = useState(false);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/photo?key=akutansi_card_watermark")
      .then((r) => r.json())
      .then((j) => { if (j.success && j.url) setCardWatermarkUrl(j.url); })
      .catch(() => { });
  }, []);

  const handleWatermarkChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setWatermarkError(null);
    setUploadingWatermark(true);
    try {
      const form = new FormData();
      form.append("key", "akutansi_card_watermark");
      form.append("file", file);
      const res = await fetch("/api/settings/photo", { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) { setWatermarkError(json.message ?? "Gagal upload motif"); return; }
      setCardWatermarkUrl(json.url);
    } catch {
      setWatermarkError("Koneksi bermasalah");
    } finally {
      setUploadingWatermark(false);
    }
  };

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
          <div className="relative rounded-[28px] border border-white/70 bg-white/50 backdrop-blur-sm shadow-[0_10px_35px_rgba(70,120,170,0.10)] px-6 py-6 sm:px-8 sm:py-7 flex items-start justify-between flex-wrap gap-6">
            <span aria-hidden="true" className="butterfly butterfly-1">
              <svg viewBox="0 0 32 24" className="w-5 h-4 sm:w-6 sm:h-5">
                <g className="butterfly-wing-l" style={{ transformOrigin: "16px 12px" }}>
                  <path d="M16 12C10 2 0 2 2 10c1 6 8 6 14 2Z" fill="#8FBFA0" opacity="0.8" />
                </g>
                <g className="butterfly-wing-r" style={{ transformOrigin: "16px 12px" }}>
                  <path d="M16 12c6-10 16-10 14-2-1 6-8 6-14 2Z" fill="#F6E3B4" opacity="0.8" />
                </g>
                <line x1="16" y1="6" x2="16" y2="18" stroke="#8A6A2F" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </span>
            <span aria-hidden="true" className="butterfly butterfly-2">
              <svg viewBox="0 0 32 24" className="w-4 h-3 sm:w-5 sm:h-4">
                <g className="butterfly-wing-l" style={{ transformOrigin: "16px 12px" }}>
                  <path d="M16 12C10 2 0 2 2 10c1 6 8 6 14 2Z" fill="#E7D9F5" opacity="0.8" />
                </g>
                <g className="butterfly-wing-r" style={{ transformOrigin: "16px 12px" }}>
                  <path d="M16 12c6-10 16-10 14-2-1 6-8 6-14 2Z" fill="#9FD8B5" opacity="0.8" />
                </g>
                <line x1="16" y1="6" x2="16" y2="18" stroke="#8A6A2F" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </span>
            <span aria-hidden="true" className="butterfly butterfly-3">
              <svg viewBox="0 0 32 24" className="w-5 h-4 sm:w-6 sm:h-5">
                <g className="butterfly-wing-l" style={{ transformOrigin: "16px 12px" }}>
                  <path d="M16 12C10 2 0 2 2 10c1 6 8 6 14 2Z" fill="#F6E3B4" opacity="0.8" />
                </g>
                <g className="butterfly-wing-r" style={{ transformOrigin: "16px 12px" }}>
                  <path d="M16 12c6-10 16-10 14-2-1 6-8 6-14 2Z" fill="#8FBFA0" opacity="0.8" />
                </g>
                <line x1="16" y1="6" x2="16" y2="18" stroke="#8A6A2F" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </span>
            <span aria-hidden="true" className="fairy-wisp fairy-wisp-1">
              <span className="fairy-wisp-core" />
              <span className="fairy-wisp-trail fairy-wisp-trail-a" />
              <span className="fairy-wisp-trail fairy-wisp-trail-b" />
            </span>
            <span aria-hidden="true" className="fairy-wisp fairy-wisp-2">
              <span className="fairy-wisp-core" />
              <span className="fairy-wisp-trail fairy-wisp-trail-a" />
              <span className="fairy-wisp-trail fairy-wisp-trail-b" />
            </span>
            <span aria-hidden="true" className="fairy-petal fairy-petal-1" style={{ background: "#F3C9DA" }} />
            <span aria-hidden="true" className="fairy-petal fairy-petal-2" style={{ background: "#F6E3B4" }} />
            <span aria-hidden="true" className="fairy-petal fairy-petal-3" style={{ background: "#BFE8CE" }} />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-[2px] bg-gradient-to-r from-[#9FD8B5] to-transparent" />
                <span className="text-[10px] font-semibold tracking-[0.25em] uppercase text-[#9C7420]">
                  Pembukuan Internal
                </span>
              </div>
              <h1
                className="text-4xl font-black tracking-tight bg-gradient-to-r from-[#3A3528] via-[#5C6B5E] to-[#8A6A2F] bg-clip-text text-transparent"
              >
                Akuntansi
              </h1>
              <p className="text-sm text-gray-500 mt-1.5">
                Pilih bulan untuk membuka buku besar
              </p>
            </div>

            {/* Companion frame (foto) + Year switcher — satu grup, tidak lagi tabrakan */}
            <div className="relative flex flex-col items-center gap-3">
              <div className="nahida-float group relative w-20 h-20 sm:w-28 sm:h-28">
                <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-[#BFE8CE] via-[#E7D9F5] to-[#F6E3B4] opacity-70 blur-xl" />
                <div className="absolute inset-0 rounded-full p-[3px] bg-gradient-to-br from-[#9FD8B5] via-[#F6E3B4] to-[#E7D9F5] shadow-[0_6px_18px_rgba(150,120,80,0.25)]">
                  <div className="w-full h-full rounded-full overflow-hidden bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={companionPhotoUrl || "/images/nahida-akutansi.png"}
                      alt=""
                      aria-hidden="true"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* Tombol ganti foto — muncul saat hover/tap, upload langsung dari web */}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  title="Ganti foto"
                  className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-200 disabled:cursor-wait"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />

                <span className="sparkle sparkle-a" />
                <span className="sparkle sparkle-b" />
                <span className="sparkle sparkle-c" />
              </div>
              {photoError && (
                <p className="text-[10px] text-red-500 font-semibold -mt-1">{photoError}</p>
              )}

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
                  className="year-pop px-3 text-sm font-bold text-gray-900 tabular-nums"
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
                  className={`ledger-card group relative aspect-[4/5] rounded-2xl overflow-hidden transition-all duration-200 flex flex-col items-center justify-center active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2
                    ${isFuture
                      ? "bg-slate-50/60 border border-dashed border-slate-200 text-slate-300 hover:border-slate-300"
                      : "bg-white border border-slate-200/80 text-slate-900 shadow-xs hover:-translate-y-1.5 hover:shadow-md hover:border-slate-300"
                    }`}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[-1] flex items-center justify-center opacity-[0.22]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cardWatermarkUrl || "/images/nahida-wle.png"}
                      alt=""
                      className="w-full h-full object-contain scale-125"
                    />
                  </div>
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
                    className="text-3xl font-bold tabular-nums leading-none transition-transform duration-200 group-hover:scale-110"
                  >
                    {String(m).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider mt-2 ${isFuture ? "text-gray-300" : "text-[#3A3528]/50"
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-gray-500 font-mono">
                Data jurnal dipisah per bulan. Bulan yang belum lewat tetap bisa dibuka untuk input berjalan.
              </p>
              <button
                type="button"
                onClick={() => watermarkInputRef.current?.click()}
                disabled={uploadingWatermark}
                className="text-[11px] font-semibold text-[#2F6FA6] hover:underline disabled:opacity-50 disabled:cursor-wait shrink-0"
              >
                {uploadingWatermark ? "Mengupload..." : "Ganti motif kartu"}
              </button>
            </div>
            {watermarkError && (
              <p className="text-[10px] text-red-500 font-semibold mt-1">{watermarkError}</p>
            )}
            <input
              ref={watermarkInputRef}
              type="file"
              accept="image/*"
              onChange={handleWatermarkChange}
              className="hidden"
            />
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

        .butterfly {
          position: absolute;
          pointer-events: none;
          z-index: 5;
          filter: drop-shadow(0 1px 2px rgba(58, 53, 40, 0.12));
        }
        .butterfly-1 {
          top: 8%;
          left: 38%;
          animation: flutterA 9s ease-in-out infinite;
        }
        .butterfly-2 {
          top: 55%;
          left: 60%;
          animation: flutterB 12s ease-in-out infinite;
          animation-delay: 1.5s;
        }
        .butterfly-3 {
          top: 20%;
          left: 80%;
          animation: flutterC 15s ease-in-out infinite;
          animation-delay: 3s;
        }
        @keyframes flutterA {
          0%,
          100% {
            transform: translate(0, 0) rotate(-4deg);
          }
          25% {
            transform: translate(45px, -22px) rotate(6deg);
          }
          50% {
            transform: translate(85px, 4px) rotate(-8deg);
          }
          75% {
            transform: translate(40px, 24px) rotate(4deg);
          }
        }
        @keyframes flutterB {
          0%,
          100% {
            transform: translate(0, 0) rotate(5deg);
          }
          30% {
            transform: translate(-55px, -16px) rotate(-6deg);
          }
          60% {
            transform: translate(-90px, 10px) rotate(8deg);
          }
          85% {
            transform: translate(-38px, 26px) rotate(-3deg);
          }
        }
        @keyframes flutterC {
          0%,
          100% {
            transform: translate(0, 0) rotate(0deg);
          }
          20% {
            transform: translate(-40px, 18px) rotate(-5deg);
          }
          50% {
            transform: translate(-75px, -12px) rotate(7deg);
          }
          80% {
            transform: translate(-20px, -28px) rotate(-6deg);
          }
        }
        .butterfly-wing-l,
        .butterfly-wing-r {
          animation: wingFlap 0.32s ease-in-out infinite alternate;
        }
        .butterfly-wing-r {
          animation-delay: 0.06s;
        }
      @keyframes wingFlap {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0.4);
          }
        }

        .fairy-wisp {
          position: absolute;
          pointer-events: none;
          z-index: 6;
        }
        .fairy-wisp-1 {
          top: 65%;
          left: 12%;
          animation: fairyDrift1 11s ease-in-out infinite;
        }
        .fairy-wisp-2 {
          top: 12%;
          left: 62%;
          animation: fairyDrift2 14s ease-in-out infinite;
          animation-delay: 2.5s;
        }
        .fairy-wisp-core {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: radial-gradient(circle, #fff 0%, #F6E3B4 45%, rgba(191, 232, 206, 0.4) 75%, transparent 100%);
          box-shadow: 0 0 10px 3px rgba(246, 227, 180, 0.55), 0 0 18px 6px rgba(191, 232, 206, 0.3);
          animation: wispGlow 2.2s ease-in-out infinite;
        }
        .fairy-wisp-trail {
          position: absolute;
          width: 3px;
          height: 3px;
          border-radius: 9999px;
          background: radial-gradient(circle, #fff 0%, #E7D9F5 60%, transparent 80%);
        }
        .fairy-wisp-trail-a {
          top: 7px;
          left: -8px;
          animation: sparkleTwinkle 1.8s ease-in-out infinite;
          animation-delay: 0.3s;
        }
        .fairy-wisp-trail-b {
          top: 12px;
          left: -15px;
          animation: sparkleTwinkle 1.8s ease-in-out infinite;
          animation-delay: 0.6s;
        }
        @keyframes wispGlow {
          0%,
          100% {
            transform: scale(0.85);
            opacity: 0.75;
          }
          50% {
            transform: scale(1.15);
            opacity: 1;
          }
        }
        @keyframes fairyDrift1 {
          0%,
          100% {
            transform: translate(0, 0);
          }
          25% {
            transform: translate(35px, -25px);
          }
          50% {
            transform: translate(70px, 5px);
          }
          75% {
            transform: translate(30px, 20px);
          }
        }
        @keyframes fairyDrift2 {
          0%,
          100% {
            transform: translate(0, 0);
          }
          30% {
            transform: translate(-40px, 18px);
          }
          60% {
            transform: translate(-65px, -12px);
          }
          85% {
            transform: translate(-25px, -28px);
          }
        }

        .fairy-petal {
          position: absolute;
          top: -6%;
          width: 10px;
          height: 7px;
          border-radius: 100% 0 100% 0;
          pointer-events: none;
          z-index: 4;
        }
        .fairy-petal-1 {
          left: 22%;
          animation: petalFall1 10s linear infinite;
        }
        .fairy-petal-2 {
          left: 55%;
          animation: petalFall2 13s linear infinite;
          animation-delay: 3s;
        }
        .fairy-petal-3 {
          left: 85%;
          animation: petalFall3 16s linear infinite;
          animation-delay: 6s;
        }
        @keyframes petalFall1 {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 0;
          }
          8% {
            opacity: 0.85;
          }
          50% {
            transform: translate(18px, 60px) rotate(160deg);
          }
          92% {
            opacity: 0.85;
          }
          100% {
            transform: translate(-10px, 130px) rotate(320deg);
            opacity: 0;
          }
        }
        @keyframes petalFall2 {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 0;
          }
          8% {
            opacity: 0.8;
          }
          50% {
            transform: translate(-22px, 65px) rotate(-140deg);
          }
          92% {
            opacity: 0.8;
          }
          100% {
            transform: translate(14px, 135px) rotate(-300deg);
            opacity: 0;
          }
        }
        @keyframes petalFall3 {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 0;
          }
          8% {
            opacity: 0.85;
          }
          50% {
            transform: translate(20px, 58px) rotate(180deg);
          }
          92% {
            opacity: 0.85;
          }
          100% {
            transform: translate(-16px, 128px) rotate(340deg);
            opacity: 0;
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
          animation: fairyDustDrift 6s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes fairyDustDrift {
          0%,
          100% {
            opacity: 0;
            transform: translate(0, 0) scale(0.4);
          }
          50% {
            opacity: 1;
            transform: translate(6px, -10px) scale(1.15);
          }
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
          .firefly-dot,
          .butterfly-1,
          .butterfly-2,
          .butterfly-3,
          .butterfly-wing-l,
          .butterfly-wing-r,
          .fairy-wisp-1,
          .fairy-wisp-2,
          .fairy-wisp-core,
          .fairy-wisp-trail-a,
          .fairy-wisp-trail-b,
          .fairy-petal-1,
          .fairy-petal-2,
          .fairy-petal-3 {
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