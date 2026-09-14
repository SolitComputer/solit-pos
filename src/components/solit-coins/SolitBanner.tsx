"use client";

import React from "react";
import type { BorderStyle } from "@/lib/solit-coins/types";

// Banner kosmetik = Bingkai mewah (frame) mengelilingi banner:
// - Frame kontinu mengalir (CSS mask border) yang mengikuti lekukan kartu (rounded-t-3xl) tanpa sudut siku 90° yang kotak/kaku.
// - Menghubungkan seluruh 4 sisi secara mulus (termasuk sisi bawah, tanpa memotong foto avatar).
// - 4 sudut dihiasi ornamen 3D AI-generated, specular shine sweep, sparkle glint, dan ambient aura bulat sferis.

export default function SolitBanner({
  style,
  thickness = 3,
  openBottom = false,
  className = "",
  compact = false,
}: {
  style?: BorderStyle | null;
  thickness?: number;
  openBottom?: boolean;
  className?: string;
  compact?: boolean;
}) {
  if (!style) return null;

  const isAnimated = style.kind === "animated";
  const asset = style.kind === "asset" ? style : null;
  const preset = isAnimated
    ? (style as { preset: string }).preset
    : asset?.linePreset ?? "cosmic-starfield";
  const code = asset
    ? asset.ringImage.split("/").pop()?.replace(/\.[^/.]+$/, "") || ""
    : preset;

  return (
    <div className={`sb-frame-wrap ${compact ? "sb-compact" : ""} ${className}`}>
      {/* Ambient card glow — cahaya besar & blur yang "napas" di belakang
          seluruh kartu, beda dari corner-glow yang cuma di 4 titik sudut;
          ini menyatukan seluruh kartu jadi satu sumber cahaya. Reuse
          warna dari sb-cg-<preset> yang sudah ada (radial-gradient per
          preset) — dipasang ulang di elemen baru berukuran penuh. */}
      <span className={`sb-ambient-glow sb-cg-${preset}`} aria-hidden="true" />

      {/* ── 1. CONTINUOUS FLOWING FRAME (Border mulus mengikuti lekukan rounded-t kartu) ── */}
      <div
        className={`sb-continuous-frame sb-cf-${preset}`}
        style={{
          padding: openBottom
            ? `${thickness}px ${thickness}px 0 ${thickness}px`
            : `${thickness}px`,
        }}
        aria-hidden="true"
      />

      {/* Tekstur faset — pakai mask exclude yang sama kayak frame utama,
          jadi otomatis ke-crop jadi bentuk ring & ngikutin lekukan kartu. */}
      <div
        className="sb-frame-facets"
        style={{
          padding: openBottom
            ? `${thickness}px ${thickness}px 0 ${thickness}px`
            : `${thickness}px`,
        }}
        aria-hidden="true"
      />

      {/* Sapuan pelangi holografik — muter di dalam ring, warna-warni
          (bukan monokrom putih kayak shine sweep/orbit sweep), efeknya
          kayak cahaya nembus kristal/prisma. Pakai mask trick yang sama. */}
      <div
        className="sb-frame-prism"
        style={{
          padding: openBottom
            ? `${thickness}px ${thickness}px 0 ${thickness}px`
            : `${thickness}px`,
        }}
        aria-hidden="true"
      />

      {/* Titik cahaya yang beneran ngelilingin seluruh tepi kartu (bukan
          gradient diputer di tempat) — lintasannya persegi mengikuti
          4 sisi, pakai keyframe left/top persentase biar otomatis
          nyesuaiin ukuran kartu berapa pun (preview besar vs grid kecil). */}
      <span className="sb-frame-travel" aria-hidden="true">
        <span className="sb-travel-dot" />
        <span className="sb-travel-dot sb-travel-dot-2" />
      </span>

      {/* ── 2. 4 ORNAMEN SUDUT 3D FANTASY (asset) ATAU CORNER GLOW (animated) ── */}
      {asset ? (
        <>
          <Corner pos="tl" src={asset.ringImage} code={code} />
          <Corner pos="tr" src={asset.ringImage} code={code} />
          <Corner pos="bl" src={asset.ringImage} code={code} />
          <Corner pos="br" src={asset.ringImage} code={code} />
        </>
      ) : (
        <FrameCornerGlow preset={preset} />
      )}

      {/* ── 3. MID-EDGE SPARKLES (universal, asset maupun animated) ── */}
      <span className="sb-edge-sparkle sb-es-top" aria-hidden="true">✦</span>
      <span className="sb-edge-sparkle sb-es-bottom" aria-hidden="true">✦</span>
      <span className="sb-edge-sparkle sb-es-left" aria-hidden="true">✦</span>
      <span className="sb-edge-sparkle sb-es-right" aria-hidden="true">✦</span>

      <style jsx global>{`
        .sb-frame-wrap {
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
        }

        /* ── BINGKAI KONTINU (FLOWING ENERGY FRAME) ───────────────── */
        /* Menggunakan CSS mask agar hanya border luar (area padding) yang terlihat */
        /* Mengikuti border-radius: inherit (rounded-t-3xl) secara sempurna sehingga sudutnya melengkung halus, BUKAN kotak */
        .sb-continuous-frame {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          z-index: 1;
          overflow: hidden;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          background-size: 250% 250%;
          animation: sb-cf-flow 6s ease-in-out infinite alternate, sb-cf-breathe 3s ease-in-out infinite;
          will-change: background-position;
        }

        @keyframes sb-cf-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes sb-cf-breathe {
          0%, 100% { opacity: 0.82; }
          50% { opacity: 1; }
        }

        /* Sapuan kilap diagonal yang lewat sepanjang bingkai — otomatis
           ke-crop jadi bentuk ring tipis karena mask di elemen induk
           berlaku juga untuk pseudo-element di dalamnya. */
        .sb-continuous-frame::before {
          content: "";
          position: absolute;
          inset: -60%;
          background: linear-gradient(
            100deg,
            transparent 35%,
            rgba(255, 255, 255, 0.9) 49%,
            rgba(255, 255, 255, 0.9) 51%,
            transparent 65%
          );
          mix-blend-mode: overlay;
          animation: sb-frame-shine-sweep 3.4s linear infinite;
        }
        @keyframes sb-frame-shine-sweep {
          0% { transform: translateX(-55%); }
          100% { transform: translateX(55%); }
        }

        /* Sapuan energi kedua yang mengorbit penuh (conic) — beda arah &
           ritme dari shine sweep linear di atas, biar kerasa 2 sumber
           cahaya, bukan cuma satu diulang. Otomatis ke-crop jadi bentuk
           ring karena ini pseudo-element dari .sb-continuous-frame yang
           sudah kena mask + overflow:hidden. */
        .sb-continuous-frame::after {
          content: "";
          position: absolute;
          inset: -25%;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            transparent 335deg,
            rgba(255, 255, 255, 0.5) 350deg,
            rgba(255, 255, 255, 0.95) 358deg,
            transparent 360deg
          );
          mix-blend-mode: screen;
          animation: sb-spin 2.4s linear infinite;
        }

        /* Tekstur faset diagonal — dipisah jadi div sendiri (bukan
           pseudo-element ketiga di sb-continuous-frame, karena tiap
           elemen cuma boleh punya ::before DAN ::after, sudah kepakai
           semua buat shine sweep + orbit sweep). Pakai repeating-linear
           (bukan repeating-conic kayak di border) karena bentuk banner
           persegi panjang, bukan lingkaran — garis diagonal lebih cocok
           ngikutin bentuk rect daripada pola radial. */
        .sb-frame-facets {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          z-index: 1;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          mix-blend-mode: overlay;
          opacity: 0.5;
          background: repeating-linear-gradient(
            115deg,
            rgba(255, 255, 255, 0.4) 0px 3px,
            rgba(0, 0, 0, 0.3) 3px 6px
          );
          background-size: 200% 200%;
          animation: sb-frame-facet-shift 9s linear infinite;
        }
        @keyframes sb-frame-facet-shift {
          0% { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }

        /* Preset color gradients & drop-shadow glows */
        .sb-cf-cosmic-starfield {
          background-image: linear-gradient(135deg, #1e1b4b 0%, #3b82f6 25%, #c084fc 50%, #818cf8 75%, #3b82f6 100%);
          filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.65));
        }
        .sb-cf-dragon-flame {
          background-image: linear-gradient(135deg, #7f1d1d 0%, #ef4444 25%, #fde047 50%, #f97316 75%, #ef4444 100%);
          filter: drop-shadow(0 0 6px rgba(249, 115, 22, 0.65));
        }
        .sb-cf-golden-crown {
          background-image: linear-gradient(135deg, #7c5a00 0%, #fbbf24 25%, #fffbeb 50%, #f59e0b 75%, #fbbf24 100%);
          filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.65));
        }
        .sb-cf-cyber-neon {
          background-image: linear-gradient(135deg, #0e7490 0%, #22d3ee 25%, #e0f2fe 50%, #06b6d4 75%, #22d3ee 100%);
          filter: drop-shadow(0 0 6px rgba(6, 182, 212, 0.65));
        }
        .sb-cf-rgb-spin {
          background-image: linear-gradient(135deg, #ff0080, #ff8c00, #ffed00, #00ff8c, #00b3ff, #8b5cf6, #ff0080);
          filter: drop-shadow(0 0 6px rgba(236, 72, 153, 0.65));
          animation-duration: 3.5s;
        }
        .sb-cf-aurora-wave {
          background-image: linear-gradient(135deg, #064e3b 0%, #34d399 25%, #22d3ee 50%, #a855f7 75%, #34d399 100%);
          filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.65));
        }
        .sb-cf-galaxy-pulse {
          background-image: linear-gradient(135deg, #312e81 0%, #7c3aed 25%, #ec4899 50%, #c084fc 75%, #7c3aed 100%);
          filter: drop-shadow(0 0 6px rgba(124, 58, 237, 0.65));
        }
        .sb-cf-emerald {
          background-image: linear-gradient(135deg, #065f46 0%, #10b981 25%, #6ee7b7 50%, #34d399 75%, #10b981 100%);
          filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.65));
        }
        .sb-cf-royal {
          background-image: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 25%, #93c5fd 50%, #60a5fa 75%, #3b82f6 100%);
          filter: drop-shadow(0 0 6px rgba(59, 130, 246, 0.65));
        }
        .sb-cf-sunset {
          background-image: linear-gradient(135deg, #7c2d12 0%, #ea580c 25%, #fde047 50%, #f97316 75%, #ea580c 100%);
          filter: drop-shadow(0 0 6px rgba(234, 88, 12, 0.65));
        }
        .sb-cf-violet {
          background-image: linear-gradient(135deg, #581c87 0%, #a855f7 25%, #f3e8ff 50%, #c084fc 75%, #a855f7 100%);
          filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.65));
        }

        /* ── 2. ORNAMEN SUDUT 3D ─────────────────────────────────── */
        .sb-corner {
          position: absolute;
          width: 44px;
          height: 44px;
          aspect-ratio: 1 / 1;
          pointer-events: none;
          z-index: 3;
          will-change: transform;
        }
        @media (min-width: 640px) {
          .sb-corner {
            width: 52px;
            height: 52px;
          }
        }
        @media (min-width: 1024px) {
          .sb-corner {
            width: 58px;
            height: 58px;
          }
        }
        .sb-compact .sb-corner {
          width: 22px !important;
          height: 22px !important;
        }

        .sb-corner-tl {
          top: 0;
          left: 0;
        }
        .sb-corner-tr {
          top: 0;
          right: 0;
          transform: scaleX(-1);
        }
        .sb-corner-bl {
          bottom: 0;
          left: 0;
          transform: scaleY(-1);
        }
        .sb-corner-br {
          bottom: 0;
          right: 0;
          transform: scale(-1, -1);
        }

        .sb-corner-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          pointer-events: none;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.55));
          animation: sb-corner-breathe 4s ease-in-out infinite alternate;
        }
        @keyframes sb-corner-breathe {
          0% { filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55)) brightness(1); }
          100% { filter: drop-shadow(0 3px 12px rgba(0, 0, 0, 0.7)) brightness(1.08); }
        }

        /* ── 3. CORNER AMBIENT AURA (Murni sferis bulat & bergradasi lembut, tidak kotak) ── */
        .sb-corner-aura {
          position: absolute;
          inset: 12%;
          border-radius: 50%;
          pointer-events: none;
          z-index: -1;
          filter: blur(8px);
          will-change: opacity, transform;
          animation: sb-ca-pulse 3s ease-in-out infinite alternate;
        }
        @keyframes sb-ca-pulse {
          0% { opacity: 0.55; transform: scale(0.92); }
          100% { opacity: 0.95; transform: scale(1.05); }
        }
        .sb-ca-banner-cosmic {
          background: radial-gradient(circle at center, rgba(129, 140, 248, 0.75) 0%, rgba(99, 102, 241, 0.35) 35%, transparent 65%);
        }
        .sb-ca-banner-dragon {
          background: radial-gradient(circle at center, rgba(251, 146, 60, 0.8) 0%, rgba(239, 68, 68, 0.35) 35%, transparent 65%);
        }
        .sb-ca-banner-galaxy {
          background: radial-gradient(circle at center, rgba(192, 132, 252, 0.8) 0%, rgba(124, 58, 237, 0.35) 35%, transparent 65%);
        }
        .sb-ca-banner-cyber {
          background: radial-gradient(circle at center, rgba(103, 232, 249, 0.8) 0%, rgba(6, 182, 212, 0.35) 35%, transparent 65%);
        }
        .sb-ca-banner-rgb {
          background: radial-gradient(circle at center, rgba(244, 114, 182, 0.8) 0%, rgba(99, 102, 241, 0.35) 35%, transparent 65%);
        }
        .sb-ca-banner-aurora {
          background: radial-gradient(circle at center, rgba(110, 231, 183, 0.8) 0%, rgba(34, 211, 238, 0.35) 35%, transparent 65%);
        }
        .sb-ca-banner-emerald {
          background: radial-gradient(circle at center, rgba(110, 231, 183, 0.75) 0%, rgba(5, 150, 105, 0.3) 35%, transparent 65%);
        }
        .sb-ca-banner-royal {
          background: radial-gradient(circle at center, rgba(147, 197, 253, 0.8) 0%, rgba(59, 130, 246, 0.35) 35%, transparent 65%);
        }
        .sb-ca-banner-sunset {
          background: radial-gradient(circle at center, rgba(251, 146, 60, 0.8) 0%, rgba(234, 88, 12, 0.35) 35%, transparent 65%);
        }
        .sb-ca-banner-violet {
          background: radial-gradient(circle at center, rgba(192, 132, 252, 0.8) 0%, rgba(168, 85, 247, 0.35) 35%, transparent 65%);
        }

        /* ── 4. CORNER SPECULAR SHINE SWEEP ──────────────────────── */
        .sb-corner-shine {
          position: absolute;
          inset: 0;
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-position: center;
          mask-position: center;
          -webkit-mask-repeat: no-repeat;
          overflow: hidden;
          mix-blend-mode: screen;
          pointer-events: none;
          z-index: 2;
        }
        .sb-c-sweep {
          position: absolute;
          inset: -60%;
          border-radius: 9999px;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            transparent 65deg,
            rgba(255, 255, 255, 0.2) 80deg,
            rgba(255, 255, 255, 0.95) 90deg,
            rgba(255, 255, 255, 0.2) 100deg,
            transparent 115deg,
            transparent 360deg
          );
          animation: sb-spin 4s linear infinite;
        }
        .sb-csweep-banner-dragon {
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            transparent 65deg,
            rgba(254, 215, 170, 0.25) 80deg,
            rgba(254, 240, 138, 0.95) 90deg,
            rgba(251, 146, 60, 0.35) 100deg,
            transparent 115deg,
            transparent 360deg
          );
          animation: sb-spin 3s linear infinite;
        }

        /* ── 5. CORNER SPARKLE GLINT ─────────────────────────────── */
        .sb-corner-sparkle {
          position: absolute;
          top: 14%;
          left: 14%;
          font-size: 13px;
          line-height: 1;
          color: #fff;
          user-select: none;
          pointer-events: none;
          z-index: 4;
          filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 8px currentColor);
          animation: sb-c-sparkle 2.6s ease-in-out infinite;
        }
        @keyframes sb-c-sparkle {
          0%, 100% {
            opacity: 0;
            transform: scale(0.2) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.15) rotate(45deg);
          }
        }

        /* ── 3. MID-EDGE SPARKLES ─────────────────────────────────── */
        /* Posisi dipusatkan pakai margin, BUKAN transform: translate —
           soalnya keyframe sb-c-sparkle yang dipakai ulang di sini juga
           nge-set property transform (scale/rotate). Kalau dipusatkan
           pakai translate(-50%), tiap frame animasi bakal MENIMPA nilai
           translate itu (property yang sama gak bisa digabung dari 2
           sumber beda) dan sparkle-nya geser dari posisi yang seharusnya. */
        .sb-edge-sparkle {
          position: absolute;
          font-size: 11px;
          line-height: 1;
          color: #fff;
          z-index: 3;
          pointer-events: none;
          user-select: none;
          filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 7px currentColor);
          animation: sb-c-sparkle 3s ease-in-out infinite;
        }
        .sb-es-top { top: -4px; left: 50%; margin-left: -5.5px; animation-delay: 0.4s; }
        .sb-es-bottom { bottom: -4px; left: 50%; margin-left: -5.5px; animation-delay: 1.6s; }
        .sb-es-left { left: -4px; top: 50%; margin-top: -5.5px; animation-delay: 0.9s; }
        .sb-es-right { right: -4px; top: 50%; margin-top: -5.5px; animation-delay: 2.2s; }
        .sb-compact .sb-edge-sparkle { display: none; }

        /* ── TRAVELING SPARK ──────────────────────────────────────── */
        /* Posisi digerakkan lewat left/top persentase (bukan transform),
           supaya lintasannya OTOMATIS mengikuti ukuran kartu — banner
           preview besar dan kartu grid kecil dapat lintasan proporsional
           yang sama tanpa perlu angka px berbeda per ukuran. */
        .sb-frame-travel {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
        }
        .sb-compact .sb-frame-travel { display: none; }
        .sb-travel-dot {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 9999px;
          background: #fff;
          box-shadow: 0 0 7px 2px rgba(255, 255, 255, 0.9);
          transform: translate(-50%, -50%);
          animation: sb-frame-travel-path 5s linear infinite;
        }
        .sb-travel-dot-2 {
          animation-delay: 2.5s;
        }
        @keyframes sb-frame-travel-path {
          0% { left: 0%; top: 0%; }
          25% { left: 100%; top: 0%; }
          50% { left: 100%; top: 100%; }
          75% { left: 0%; top: 100%; }
          100% { left: 0%; top: 0%; }
        }

        @keyframes sb-spin {
          to { transform: rotate(360deg); }
        }

        /* ── 6. CORNER GLOW (untuk banner animated tanpa PNG asset) ── */
        .sb-corner-glow {
          position: absolute;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 2;
          filter: blur(9px);
          animation: sb-cg-pulse 2.6s ease-in-out infinite;
        }
        @media (min-width: 640px) {
          .sb-corner-glow {
            width: 42px;
            height: 42px;
          }
        }
        .sb-compact .sb-corner-glow {
          width: 18px !important;
          height: 18px !important;
          filter: blur(5px);
        }
        .sb-corner-glow-tl { top: -6px; left: -6px; }
        .sb-corner-glow-tr { top: -6px; right: -6px; }
        .sb-corner-glow-bl { bottom: -6px; left: -6px; }
        .sb-corner-glow-br { bottom: -6px; right: -6px; }
        @keyframes sb-cg-pulse {
          0%, 100% { opacity: 0.45; transform: scale(0.85); }
          50% { opacity: 0.95; transform: scale(1.12); }
        }
        /* Cincin energi yang "meletup" keluar dari tiap corner glow,
           berulang terus (beda dari sb-burst di border yang cuma
           sekali pas mount) — 4 sudut meletup bareng, kayak detak. */
        .sb-corner-glow::after {
          content: "";
          position: absolute;
          inset: -35%;
          border-radius: 50%;
          border: 1.5px solid rgba(255, 255, 255, 0.65);
          opacity: 0;
          animation: sb-cg-burst 2.6s ease-out infinite;
        }
        @keyframes sb-cg-burst {
          0% { transform: scale(0.6); opacity: 0.6; }
          70% { opacity: 0; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        .sb-cg-cosmic-starfield { background: radial-gradient(circle, rgba(129, 140, 248, 0.85) 0%, transparent 70%); }
        .sb-cg-dragon-flame { background: radial-gradient(circle, rgba(251, 146, 60, 0.85) 0%, transparent 70%); }
        .sb-cg-golden-crown { background: radial-gradient(circle, rgba(251, 191, 36, 0.85) 0%, transparent 70%); }
        .sb-cg-cyber-neon { background: radial-gradient(circle, rgba(34, 211, 238, 0.85) 0%, transparent 70%); }
        .sb-cg-rgb-spin {
          background: radial-gradient(circle, rgba(244, 114, 182, 0.85) 0%, transparent 70%);
          animation: sb-cg-pulse 1.8s ease-in-out infinite;
        }
        .sb-cg-aurora-wave { background: radial-gradient(circle, rgba(110, 231, 183, 0.85) 0%, transparent 70%); }
        .sb-cg-galaxy-pulse { background: radial-gradient(circle, rgba(192, 132, 252, 0.85) 0%, transparent 70%); }
        .sb-cg-emerald { background: radial-gradient(circle, rgba(110, 231, 183, 0.8) 0%, transparent 70%); }
        .sb-cg-royal { background: radial-gradient(circle, rgba(147, 197, 253, 0.85) 0%, transparent 70%); }
        .sb-cg-sunset { background: radial-gradient(circle, rgba(251, 146, 60, 0.85) 0%, transparent 70%); }
        .sb-cg-violet { background: radial-gradient(circle, rgba(192, 132, 252, 0.85) 0%, transparent 70%); }

        @media (prefers-reduced-motion: reduce) {
          .sb-continuous-frame,
          .sb-continuous-frame::before,
          .sb-continuous-frame::after,
          .sb-frame-facets,
          .sb-corner-img,
          .sb-corner-aura,
          .sb-corner-glow,
          .sb-corner-glow::after,
          .sb-c-sweep,
          .sb-corner-sparkle,
          .sb-edge-sparkle,
          .sb-travel-dot {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function Corner({
  pos,
  src,
  code,
}: {
  pos: "tl" | "tr" | "bl" | "br";
  src: string;
  code: string;
}) {
  return (
    <span className={`sb-corner sb-corner-${pos}`}>
      {/* Aura bercahaya sferis di belakang sudut */}
      <span className={`sb-corner-aura sb-ca-${code}`} aria-hidden="true" />

      {/* PNG ornamen sudut 3D */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="sb-corner-img" src={src} alt="" aria-hidden="true" />

      {/* Sapuan kilap specular metalik */}
      <span
        className="sb-corner-shine"
        style={{
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
        }}
        aria-hidden="true"
      >
        <span className={`sb-c-sweep sb-csweep-${code}`} />
      </span>

      {/* Bintang sparkle kelap-kelip */}
      <span className="sb-corner-sparkle" aria-hidden="true">✦</span>
    </span>
  );
}

function FrameCornerGlow({ preset }: { preset: string }) {
  return (
    <>
      <span className={`sb-corner-glow sb-corner-glow-tl sb-cg-${preset}`} aria-hidden="true" />
      <span className={`sb-corner-glow sb-corner-glow-tr sb-cg-${preset}`} aria-hidden="true" />
      <span className={`sb-corner-glow sb-corner-glow-bl sb-cg-${preset}`} aria-hidden="true" />
      <span className={`sb-corner-glow sb-corner-glow-br sb-cg-${preset}`} aria-hidden="true" />
    </>
  );
}
