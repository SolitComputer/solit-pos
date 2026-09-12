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

      {/* ── 2. 4 ORNAMEN SUDUT 3D FANTASY ── */}
      {asset && (
        <>
          <Corner pos="tl" src={asset.ringImage} code={code} />
          <Corner pos="tr" src={asset.ringImage} code={code} />
          <Corner pos="bl" src={asset.ringImage} code={code} />
          <Corner pos="br" src={asset.ringImage} code={code} />
        </>
      )}

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
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          background-size: 250% 250%;
          animation: sb-cf-flow 6s ease-in-out infinite alternate;
          will-change: background-position;
        }

        @keyframes sb-cf-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
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

        @keyframes sb-spin {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .sb-continuous-frame,
          .sb-corner-img,
          .sb-corner-aura,
          .sb-c-sweep,
          .sb-corner-sparkle {
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
