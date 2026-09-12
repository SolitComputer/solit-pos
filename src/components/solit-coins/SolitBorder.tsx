"use client";

import React from "react";
import type { BorderStyle } from "@/lib/solit-coins/types";

// Ring border avatar ala game — tiap border punya animasi unik sesuai namanya,
// makin flashy sesuai rarity (Common halus → Legendary mewah + glow).
// `style.preset` = kode border (mis. "cyber-neon"), dipetakan ke class .sb-p-<preset>.

const DEFAULT_GRADIENT = "linear-gradient(135deg,#6366f1,#8b5cf6)";

// Ornamen tematik (SVG asli, bukan emoji) yang nangkring di atas avatar.
const svgProps = (s: number) => ({
  width: s,
  height: s,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  xmlns: "http://www.w3.org/2000/svg",
});
const stroke = "rgba(255,255,255,.75)";

function Gem(s: number, fill: string) {
  return (
    <svg {...svgProps(s)}>
      <path d="M12 3l7.5 6.2L12 22 4.5 9.2z" fill={fill} stroke={stroke} strokeWidth="1" strokeLinejoin="round" />
      <path d="M4.5 9.2h15M12 3v19M8.2 9.2 12 22l3.8-12.8" stroke="rgba(255,255,255,.45)" strokeWidth=".8" />
    </svg>
  );
}
function Flame(s: number, outer: string, inner: string) {
  return (
    <svg {...svgProps(s)}>
      <path d="M12 2c2.2 4 5 6 5 10a5 5 0 0 1-10 0c0-2.2.9-3.4 2-4.4C9.2 9.4 10.2 10.4 11 10.4c1.2-2.2-.6-5 1-8.4z" fill={outer} />
      <path d="M12 9c1 1.8 2.2 3 2.2 4.8a2.2 2.2 0 0 1-4.4 0c0-1.3 1-2.4 2.2-4.8z" fill={inner} />
    </svg>
  );
}
function Sparkle(s: number, fill: string) {
  return (
    <svg {...svgProps(s)}>
      <path d="M12 1.5l2.3 7.2 7.2 2.3-7.2 2.3L12 22.5l-2.3-7.2L2.5 13l7.2-2.3z" fill={fill} stroke={stroke} strokeWidth=".6" strokeLinejoin="round" />
    </svg>
  );
}

const ORNAMENTS: Record<string, (s: number) => React.ReactNode> = {
  "emerald-minimal": (s) => Gem(s, "#10b981"),
  "royal-blue": (s) => Gem(s, "#3b82f6"),
  "obsidian-black": (s) => Gem(s, "#cbd5e1"),
  "cyber-neon": (s) => (
    <svg {...svgProps(s)}>
      <path d="M13 1.5 4.5 13.2H10l-1.5 9.3L20 10.2h-6z" fill="#22d3ee" stroke={stroke} strokeWidth=".7" strokeLinejoin="round" />
    </svg>
  ),
  "amber-flame": (s) => Flame(s, "#f59e0b", "#fde68a"),
  "amethyst-violet": (s) => Gem(s, "#a855f7"),
  "rgb-spin": (s) => Sparkle(s, "#ffffff"),
  "aurora-wave": (s) => (
    <svg {...svgProps(s)}>
      <path d="M2 10c3-4 5-4 8 0s5 4 8 0 4-4 4-2" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M2 15c3-4 5-4 8 0s5 4 8 0 4-4 4-2" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
    </svg>
  ),
  "galaxy-pulse": (s) => (
    <svg {...svgProps(s)}>
      <ellipse cx="12" cy="12" rx="11" ry="3.4" stroke="#c4b5fd" strokeWidth="1.4" transform="rotate(-22 12 12)" />
      <circle cx="12" cy="12" r="5.5" fill="#a78bfa" stroke={stroke} strokeWidth=".7" />
    </svg>
  ),
  "golden-crown": (s) => (
    <svg {...svgProps(s)}>
      <path d="M3 18 5 8.5l4 3 3-6 3 6 4-3L21 18z" fill="#fbbf24" stroke="#b45309" strokeWidth="1" strokeLinejoin="round" />
      <path d="M3 18h18" stroke="#b45309" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="5" cy="8" r="1.1" fill="#fff7cd" /><circle cx="12" cy="4.5" r="1.2" fill="#fff7cd" /><circle cx="19" cy="8" r="1.1" fill="#fff7cd" />
    </svg>
  ),
  "dragon-flame": (s) => Flame(s, "#f97316", "#fde047"),
  "cosmic-starfield": (s) => Sparkle(s, "#e0e7ff"),
};

// Scale ratio per border preset agar diameter inner opening frame PNG pas dengan avatar.
// Rasionya disesuaikan dari ukuran lubang transparan asli tiap PNG (500x500).
const ASSET_SCALE: Record<string, number> = {
  "dragon-flame": 1.34,
  "royal-blue": 1.42,
  "anniversary-2026": 1.45,
  "amethyst-violet": 1.48,
  "amber-flame": 1.50,
  "emerald-minimal": 1.50,
  "obsidian-black": 1.50,
  "cyber-neon": 1.50,
  "golden-crown": 1.52,
  "rgb-spin": 1.52,
  "aurora-wave": 1.52,
  "cosmic-starfield": 1.50,
  "galaxy-pulse": 1.50,
};

function gradientCss(colors: string[]): string {
  const c = colors && colors.length ? colors : ["#6366f1", "#8b5cf6"];
  return `linear-gradient(135deg, ${c.join(", ")})`;
}

export function SolitBorder({
  style,
  thickness = 3,
  className = "",
  ornament = true,
  ornamentSize = 18,
  children,
}: {
  style?: BorderStyle | null;
  thickness?: number;
  className?: string;
  /** Tampilkan ornamen ikon di atas avatar (matikan untuk avatar kecil). */
  ornament?: boolean;
  /** Ukuran ornamen (px). */
  ornamentSize?: number;
  children: React.ReactNode;
}) {
  const isAnimated = style?.kind === "animated";
  const asset = style?.kind === "asset" ? style : null;
  const preset = isAnimated ? (style as { preset: string }).preset : null;
  const orn = preset ? ORNAMENTS[preset] : null;

  // Jika tidak ada border sama sekali
  if (!style) {
    return (
      <span className={`sb-ring sb-none ${className}`}>
        <span className="sb-inner">{children}</span>
        <style jsx global>{`
          .sb-ring {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
          }
          .sb-ring > .sb-inner {
            position: relative;
            z-index: 1;
            display: inline-flex;
            border-radius: 9999px;
          }
        `}</style>
      </span>
    );
  }

  // ══ ASSET (PNG frame AI-generated, overlay di atas avatar) ══════
  if (asset) {
    const code = asset.ringImage.split("/").pop()?.replace(/\.[^/.]+$/, "") || "";
    const scale = ASSET_SCALE[code] ?? 1.50;
    const filterClass = code ? `sb-asset-${code}` : "";
    const auraClass = code ? `sb-aura-${code}` : "";
    const sweepClass = code ? `sb-sweep-${code}` : "";
    const sparkleClass = code ? `sb-sparkle-${code}` : "";

    return (
      <span className={`sb-ring sb-ring-asset ${className}`}>
        {/* Layer 1: Atmospheric Ambient Aura (cahaya magis/energi di belakang avatar) */}
        <span
          className={`sb-asset-aura ${auraClass}`}
          style={{ width: `${scale * 102}%`, height: `${scale * 102}%` }}
          aria-hidden="true"
        />

        {/* Layer 2: Avatar User */}
        <span className="sb-inner">{children}</span>

        {/* Layer 3: Frame PNG Ring 3D */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`sb-asset-frame ${filterClass}`}
          style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
          src={asset.ringImage}
          alt=""
          aria-hidden="true"
        />

        {/* Layer 4: Dynamic Specular Shine (sapuan kilap metalik mengikuti kontur frame PNG) */}
        <span
          className="sb-asset-shine"
          style={{
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
            WebkitMaskImage: `url(${asset.ringImage})`,
            maskImage: `url(${asset.ringImage})`,
          }}
          aria-hidden="true"
        >
          <span className={`sb-shine-sweep ${sweepClass}`} />
        </span>

        {/* Layer 5: Ethereal Sparkle Glints (bintang kelap-kelip tematik di ornamen frame) */}
        <span
          className={`sb-asset-sparkles ${sparkleClass}`}
          style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
          aria-hidden="true"
        >
          <span className="sb-sp sb-sp-1">✦</span>
          <span className="sb-sp sb-sp-2">✦</span>
        </span>

        {asset.overlayVideo && (
          <video
            className="sb-asset-frame sb-asset-video"
            style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
            src={asset.overlayVideo}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
          />
        )}
        {asset.medallionImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sb-medallion" src={asset.medallionImage} alt="" aria-hidden="true" />
        )}
        <style jsx global>{`
          .sb-ring {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
          }
          .sb-ring > .sb-inner {
            position: relative;
            z-index: 1;
            display: inline-flex;
            border-radius: 9999px;
          }

          /* ── 1. ATMOSPHERIC AMBIENT AURA ────────────────────────── */
          .sb-asset-aura {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            border-radius: 9999px;
            pointer-events: none;
            z-index: 0;
            will-change: transform, opacity;
          }
          .sb-aura-cosmic-starfield {
            background: conic-gradient(from 0deg, rgba(59,130,246,0.4), rgba(147,51,234,0.45), rgba(236,72,153,0.35), rgba(59,130,246,0.4));
            filter: blur(12px);
            animation: sb-spin 10s linear infinite, sb-aura-breath 3.5s ease-in-out infinite alternate;
          }
          .sb-aura-dragon-flame {
            background: radial-gradient(circle, rgba(249,115,22,0.55) 25%, rgba(239,68,68,0.3) 55%, transparent 75%);
            filter: blur(10px);
            animation: sb-aura-flame 1.8s ease-in-out infinite alternate;
          }
          .sb-aura-golden-crown {
            background: radial-gradient(circle, rgba(251,191,36,0.5) 30%, rgba(217,119,6,0.3) 60%, transparent 75%);
            filter: blur(11px);
            animation: sb-aura-gold 2.6s ease-in-out infinite alternate;
          }
          .sb-aura-cyber-neon {
            background: radial-gradient(circle, rgba(34,211,238,0.55) 30%, rgba(6,182,212,0.25) 60%, transparent 75%);
            filter: blur(10px);
            animation: sb-aura-neon 2s ease-in-out infinite alternate;
          }
          .sb-aura-rgb-spin {
            background: conic-gradient(from 0deg, #ff0080, #ff8c00, #ffed00, #00ff8c, #00b3ff, #8b5cf6, #ff0080);
            filter: blur(12px);
            opacity: 0.65;
            animation: sb-spin 3.5s linear infinite;
          }
          .sb-aura-aurora-wave {
            background: conic-gradient(from 0deg, rgba(34,211,238,0.45), rgba(52,211,153,0.5), rgba(168,85,247,0.45), rgba(34,211,238,0.45));
            filter: blur(11px);
            animation: sb-spin 6s linear infinite, sb-aura-breath 3s ease-in-out infinite alternate;
          }
          .sb-aura-galaxy-pulse {
            background: conic-gradient(from 0deg, rgba(99,102,241,0.45), rgba(236,72,153,0.4), rgba(139,92,246,0.5), rgba(99,102,241,0.4));
            filter: blur(11px);
            animation: sb-spin 8s linear infinite, sb-aura-breath 2.8s ease-in-out infinite alternate;
          }
          .sb-aura-amber-flame {
            background: radial-gradient(circle, rgba(245,158,11,0.45) 30%, rgba(234,88,12,0.25) 60%, transparent 75%);
            filter: blur(10px);
            animation: sb-aura-flame 2s ease-in-out infinite alternate;
          }
          .sb-aura-amethyst-violet {
            background: radial-gradient(circle, rgba(168,85,247,0.5) 30%, rgba(126,34,206,0.25) 60%, transparent 75%);
            filter: blur(10px);
            animation: sb-aura-breath 2.8s ease-in-out infinite alternate;
          }
          .sb-aura-emerald-minimal {
            background: radial-gradient(circle, rgba(16,185,129,0.45) 30%, rgba(5,150,105,0.2) 60%, transparent 75%);
            filter: blur(9px);
            animation: sb-aura-breath 3.2s ease-in-out infinite alternate;
          }
          .sb-aura-royal-blue {
            background: radial-gradient(circle, rgba(59,130,246,0.5) 30%, rgba(29,78,216,0.25) 60%, transparent 75%);
            filter: blur(10px);
            animation: sb-aura-breath 3s ease-in-out infinite alternate;
          }
          .sb-aura-obsidian-black {
            background: radial-gradient(circle, rgba(148,163,184,0.35) 30%, rgba(30,41,59,0.45) 60%, transparent 75%);
            filter: blur(9px);
            animation: sb-aura-breath 3.2s ease-in-out infinite alternate;
          }
          .sb-aura-anniversary-2026 {
            background: conic-gradient(from 0deg, rgba(244,63,94,0.45), rgba(251,191,36,0.5), rgba(168,85,247,0.45), rgba(244,63,94,0.45));
            filter: blur(11px);
            animation: sb-spin 6.5s linear infinite;
          }

          @keyframes sb-aura-breath {
            0% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.7; }
            100% { transform: translate(-50%, -50%) scale(1.06); opacity: 1; }
          }
          @keyframes sb-aura-flame {
            0% { transform: translate(-50%, -50%) scale(0.94); opacity: 0.65; }
            50% { transform: translate(-50%, -52%) scale(1.08); opacity: 1; }
            100% { transform: translate(-50%, -49%) scale(1.02); opacity: 0.8; }
          }
          @keyframes sb-aura-gold {
            0% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.7; filter: blur(9px); }
            100% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; filter: blur(13px); }
          }
          @keyframes sb-aura-neon {
            0% { transform: translate(-50%, -50%) scale(0.96); opacity: 0.65; }
            100% { transform: translate(-50%, -50%) scale(1.07); opacity: 1; }
          }

          /* ── 2. FRAME PNG OVERLAY ──────────────────────────────── */
          .sb-asset-frame {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            max-width: none !important;
            max-height: none !important;
            object-fit: contain;
            pointer-events: none;
            z-index: 10;
            user-select: none;
            will-change: transform, filter;
            animation: sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          @keyframes sb-frame-breathe {
            0% { transform: translate(-50%, -50%) scale(1); }
            100% { transform: translate(-50%, -50%) scale(1.018); }
          }
          .sb-asset-video {
            z-index: 11;
            mix-blend-mode: screen;
          }
          .sb-ring > .sb-medallion {
            position: absolute;
            left: 50%;
            bottom: 0;
            z-index: 12;
            width: 34%;
            line-height: 1;
            pointer-events: none;
            transform: translate(-50%, 35%);
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
          }

          /* ── 3. METALLIC SPECULAR LIGHT SWEEP ──────────────────── */
          .sb-asset-shine {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 12;
            -webkit-mask-size: contain;
            mask-size: contain;
            -webkit-mask-position: center;
            mask-position: center;
            -webkit-mask-repeat: no-repeat;
            overflow: hidden;
            border-radius: 9999px;
            mix-blend-mode: screen;
          }
          .sb-shine-sweep {
            position: absolute;
            inset: -60%;
            border-radius: 9999px;
            background: conic-gradient(
              from 0deg,
              transparent 0deg,
              transparent 70deg,
              rgba(255, 255, 255, 0.2) 85deg,
              rgba(255, 255, 255, 0.85) 90deg,
              rgba(255, 255, 255, 0.2) 95deg,
              transparent 110deg,
              transparent 360deg
            );
            animation: sb-spin 4.5s linear infinite;
          }
          .sb-sweep-dragon-flame {
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
            animation: sb-spin 3.2s linear infinite;
          }
          .sb-sweep-golden-crown {
            background: conic-gradient(
              from 0deg,
              transparent 0deg,
              transparent 65deg,
              rgba(253, 230, 138, 0.3) 80deg,
              rgba(255, 255, 255, 0.98) 90deg,
              rgba(251, 191, 36, 0.45) 100deg,
              transparent 115deg,
              transparent 360deg
            );
            animation: sb-spin 3.8s linear infinite;
          }
          .sb-sweep-cyber-neon {
            background: conic-gradient(
              from 0deg,
              transparent 0deg,
              transparent 65deg,
              rgba(34, 211, 238, 0.35) 80deg,
              rgba(255, 255, 255, 0.98) 90deg,
              rgba(6, 182, 212, 0.45) 100deg,
              transparent 115deg,
              transparent 360deg
            );
            animation: sb-spin 2.8s linear infinite;
          }
          .sb-sweep-rgb-spin {
            animation: sb-spin 2.2s linear infinite;
          }

          /* ── 4. ETHEREAL SPARKLE GLINTS ────────────────────────── */
          .sb-asset-sparkles {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 14;
          }
          .sb-sp {
            position: absolute;
            font-size: 13px;
            line-height: 1;
            color: #fff;
            user-select: none;
            filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 8px currentColor);
            animation: sb-sparkle-twinkle 2.6s ease-in-out infinite;
          }
          .sb-sp-1 {
            top: 4%;
            right: 12%;
            animation-delay: 0s;
          }
          .sb-sp-2 {
            bottom: 8%;
            left: 10%;
            animation-delay: 1.3s;
            font-size: 10px;
          }

          @keyframes sb-sparkle-twinkle {
            0%, 100% {
              opacity: 0;
              transform: scale(0.2) rotate(0deg);
            }
            50% {
              opacity: 1;
              transform: scale(1.15) rotate(45deg);
            }
          }

          .sb-sparkle-cosmic-starfield .sb-sp { color: #a5b4fc; }
          .sb-sparkle-dragon-flame .sb-sp { color: #fde047; }
          .sb-sparkle-golden-crown .sb-sp { color: #fef08a; }
          .sb-sparkle-cyber-neon .sb-sp { color: #67e8f9; }
          .sb-sparkle-aurora-wave .sb-sp { color: #6ee7b7; }
          .sb-sparkle-rgb-spin .sb-sp { color: #f472b6; }
          .sb-sparkle-galaxy-pulse .sb-sp { color: #c084fc; }
          .sb-sparkle-emerald-minimal .sb-sp { color: #6ee7b7; }
          .sb-sparkle-amethyst-violet .sb-sp { color: #d8b4fe; }
          .sb-sparkle-amber-flame .sb-sp { color: #fde68a; }
          .sb-sparkle-royal-blue .sb-sp { color: #93c5fd; }
          .sb-sparkle-obsidian-black .sb-sp { color: #e2e8f0; }
          .sb-sparkle-anniversary-2026 .sb-sp { color: #fbcfe8; }

          /* ── 5. THEMATIC GLOW & DROP-SHADOW ────────────────────── */
          .sb-asset-emerald-minimal {
            filter: drop-shadow(0 2px 7px rgba(16, 185, 129, 0.5));
          }
          .sb-asset-royal-blue {
            filter: drop-shadow(0 2px 8px rgba(59, 130, 246, 0.55));
          }
          .sb-asset-obsidian-black {
            filter: drop-shadow(0 2px 8px rgba(15, 23, 42, 0.6));
          }
          .sb-asset-cyber-neon {
            filter: drop-shadow(0 0 10px rgba(34, 211, 238, 0.75));
            animation: sb-asset-neon-glow 2.5s ease-in-out infinite alternate, sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          .sb-asset-amber-flame {
            filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.7));
            animation: sb-asset-flame-glow 2s ease-in-out infinite alternate, sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          .sb-asset-amethyst-violet {
            filter: drop-shadow(0 0 10px rgba(168, 85, 247, 0.7));
          }
          .sb-asset-rgb-spin {
            filter: drop-shadow(0 0 11px rgba(236, 72, 153, 0.65));
            animation: sb-asset-rgb-glow 4s linear infinite, sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          .sb-asset-aurora-wave {
            filter: drop-shadow(0 0 11px rgba(52, 211, 153, 0.7));
            animation: sb-asset-aurora 3.5s ease-in-out infinite alternate, sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          .sb-asset-galaxy-pulse {
            filter: drop-shadow(0 0 13px rgba(124, 58, 237, 0.75));
            animation: sb-asset-pulse 3s ease-in-out infinite alternate, sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          .sb-asset-golden-crown {
            filter: drop-shadow(0 0 13px rgba(245, 158, 11, 0.8));
            animation: sb-asset-gold-shimmer 3s ease-in-out infinite alternate, sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          .sb-asset-dragon-flame {
            filter: drop-shadow(0 0 13px rgba(239, 68, 68, 0.8));
            animation: sb-asset-dragon 2s ease-in-out infinite alternate, sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          .sb-asset-cosmic-starfield {
            filter: drop-shadow(0 0 13px rgba(129, 140, 248, 0.8));
            animation: sb-asset-cosmic 3.5s ease-in-out infinite alternate, sb-frame-breathe 4s ease-in-out infinite alternate;
          }
          .sb-asset-anniversary-2026 {
            filter: drop-shadow(0 0 13px rgba(244, 63, 94, 0.75));
            animation: sb-asset-anniv 3s ease-in-out infinite alternate, sb-frame-breathe 4s ease-in-out infinite alternate;
          }

          @keyframes sb-asset-neon-glow {
            0% { filter: drop-shadow(0 0 7px rgba(34, 211, 238, 0.65)); }
            100% { filter: drop-shadow(0 0 15px rgba(34, 211, 238, 1)) brightness(1.1); }
          }
          @keyframes sb-asset-flame-glow {
            0% { filter: drop-shadow(0 0 7px rgba(245, 158, 11, 0.65)); }
            100% { filter: drop-shadow(0 0 16px rgba(249, 115, 22, 0.95)) brightness(1.12); }
          }
          @keyframes sb-asset-rgb-glow {
            0% { filter: drop-shadow(0 0 9px rgba(255, 0, 128, 0.65)) hue-rotate(0deg); }
            100% { filter: drop-shadow(0 0 9px rgba(255, 0, 128, 0.65)) hue-rotate(360deg); }
          }
          @keyframes sb-asset-aurora {
            0% { filter: drop-shadow(0 0 8px rgba(52, 211, 153, 0.65)) hue-rotate(0deg); }
            100% { filter: drop-shadow(0 0 15px rgba(168, 85, 247, 0.85)) hue-rotate(30deg); }
          }
          @keyframes sb-asset-pulse {
            0% { filter: drop-shadow(0 0 8px rgba(124, 58, 237, 0.65)) brightness(1); }
            100% { filter: drop-shadow(0 0 16px rgba(236, 72, 153, 0.9)) brightness(1.18); }
          }
          @keyframes sb-asset-gold-shimmer {
            0% { filter: drop-shadow(0 0 9px rgba(245, 158, 11, 0.7)) brightness(1); }
            100% { filter: drop-shadow(0 0 18px rgba(253, 230, 138, 1)) brightness(1.18); }
          }
          @keyframes sb-asset-dragon {
            0% { filter: drop-shadow(0 0 9px rgba(239, 68, 68, 0.75)) brightness(1); }
            100% { filter: drop-shadow(0 0 17px rgba(249, 115, 22, 1)) brightness(1.2); }
          }
          @keyframes sb-asset-cosmic {
            0% { filter: drop-shadow(0 0 8px rgba(129, 140, 248, 0.7)) brightness(1); }
            100% { filter: drop-shadow(0 0 16px rgba(224, 231, 255, 1)) brightness(1.15); }
          }
          @keyframes sb-asset-anniv {
            0% { filter: drop-shadow(0 0 8px rgba(244, 63, 94, 0.65)); }
            100% { filter: drop-shadow(0 0 16px rgba(251, 191, 36, 0.9)) brightness(1.15); }
          }

          @media (prefers-reduced-motion: reduce) {
            .sb-asset-frame,
            .sb-asset-aura,
            .sb-shine-sweep,
            .sb-sp {
              animation: none !important;
            }
          }
        `}</style>
      </span>
    );
  }

  // ══ ANIMATED & GRADIENT FALLBACK ════════════════════════════════
  const bgStyle: React.CSSProperties =
    style.kind === "gradient"
      ? { background: gradientCss(style.colors) }
      : isAnimated
        ? {}
        : { background: DEFAULT_GRADIENT };

  return (
    <span className={`sb-ring ${className}`} style={{ padding: thickness }}>
      <span className={`sb-bg ${preset ? `sb-p-${preset}` : ""}`} style={bgStyle} />
      <span className="sb-inner">{children}</span>
      {ornament && orn && (
        <span className="sb-orn" aria-hidden="true">
          {orn(ornamentSize)}
        </span>
      )}
      <style jsx global>{`
        .sb-ring {
          position: relative;
          display: inline-flex;
          border-radius: 9999px;
        }
        .sb-ring > .sb-bg {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          z-index: 0;
          will-change: transform, filter;
        }
        .sb-ring > .sb-inner {
          position: relative;
          z-index: 1;
          display: inline-flex;
          border-radius: 9999px;
        }
        .sb-ring > .sb-orn {
          position: absolute;
          left: 50%;
          top: 0;
          z-index: 2;
          line-height: 1;
          pointer-events: none;
          transform: translate(-50%, -55%);
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
          animation: sb-orn-float 3s ease-in-out infinite;
        }
        @keyframes sb-orn-float {
          0%, 100% { transform: translate(-50%, -52%) rotate(-5deg); }
          50% { transform: translate(-50%, -66%) rotate(5deg); }
        }

        @keyframes sb-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes sb-spin-rev {
          to {
            transform: rotate(-360deg);
          }
        }

        /* ══ COMMON — halus & pelan ═══════════════════════════════════════ */
        .sb-p-emerald-minimal {
          background: conic-gradient(from 0deg, #065f46, #10b981, #6ee7b7, #10b981, #065f46);
          animation: sb-spin 9s linear infinite, sb-g-emerald 4s ease-in-out infinite;
        }
        @keyframes sb-g-emerald {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(16, 185, 129, 0.5)); }
          50% { filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.9)); }
        }
        .sb-p-royal-blue {
          background: conic-gradient(from 0deg, #1e3a8a, #3b82f6, #bfdbfe, #3b82f6, #1e3a8a);
          animation: sb-spin 9s linear infinite, sb-g-royal 4s ease-in-out infinite;
        }
        @keyframes sb-g-royal {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(59, 130, 246, 0.5)); }
          50% { filter: drop-shadow(0 0 7px rgba(59, 130, 246, 0.95)); }
        }
        .sb-p-obsidian-black {
          background: conic-gradient(from 0deg, #0f172a, #334155, #e2e8f0, #334155, #0f172a);
          animation: sb-spin 6s linear infinite, sb-g-obsidian 5s ease-in-out infinite;
        }
        @keyframes sb-g-obsidian {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(148, 163, 184, 0.4)); }
          50% { filter: drop-shadow(0 0 6px rgba(226, 232, 240, 0.85)); }
        }

        /* ══ RARE — neon, lebih hidup ═════════════════════════════════════ */
        .sb-p-cyber-neon {
          background: conic-gradient(from 0deg, #0e7490, #22d3ee, #cffafe, #22d3ee, #0891b2, #0e7490);
          animation: sb-spin 4s linear infinite, sb-g-cyber 2.2s ease-in-out infinite;
        }
        @keyframes sb-g-cyber {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.7)); }
          50% { filter: drop-shadow(0 0 12px rgba(34, 211, 238, 1)) brightness(1.15); }
        }
        .sb-p-amber-flame {
          background: conic-gradient(from 0deg, #b45309, #f59e0b, #fef3c7, #fbbf24, #b45309);
          animation: sb-spin 5s linear infinite, sb-g-amber 1.6s ease-in-out infinite;
        }
        @keyframes sb-g-amber {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.6)) brightness(1); }
          45% { filter: drop-shadow(0 0 10px rgba(249, 115, 22, 0.95)) brightness(1.2); }
          70% { filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.8)) brightness(1.05); }
        }
        .sb-p-amethyst-violet {
          background: conic-gradient(from 0deg, #6d28d9, #a855f7, #f3e8ff, #a855f7, #6d28d9);
          animation: sb-spin 5s linear infinite, sb-g-amethyst 3s ease-in-out infinite;
        }
        @keyframes sb-g-amethyst {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(168, 85, 247, 0.6)); }
          50% { filter: drop-shadow(0 0 11px rgba(168, 85, 247, 1)); }
        }

        /* ══ EPIC — spektakuler ═══════════════════════════════════════════ */
        .sb-p-rgb-spin {
          background: conic-gradient(from 0deg, #ff0080, #ff8c00, #ffed00, #00ff8c, #00b3ff, #8b5cf6, #ff0080);
          animation: sb-spin 3s linear infinite, sb-g-rgb 6s linear infinite;
        }
        @keyframes sb-g-rgb {
          to { filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.55)) hue-rotate(360deg); }
        }
        .sb-p-aurora-wave {
          background: conic-gradient(from 0deg, #22d3ee, #34d399, #a855f7, #3b82f6, #22d3ee);
          animation: sb-spin 6s linear infinite, sb-g-aurora 4s ease-in-out infinite;
        }
        @keyframes sb-g-aurora {
          0%, 100% { filter: drop-shadow(0 0 5px rgba(52, 211, 153, 0.7)) hue-rotate(0deg); }
          50% { filter: drop-shadow(0 0 13px rgba(168, 85, 247, 0.9)) hue-rotate(35deg); }
        }
        .sb-p-galaxy-pulse {
          background: conic-gradient(from 0deg, #312e81, #7c3aed, #ec4899, #6366f1, #312e81);
          animation: sb-spin 7s linear infinite, sb-g-galaxy 3s ease-in-out infinite;
        }
        @keyframes sb-g-galaxy {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(124, 58, 237, 0.7)) brightness(1); }
          50% { filter: drop-shadow(0 0 15px rgba(236, 72, 153, 0.95)) brightness(1.25); }
        }

        /* ══ LEGENDARY — mewah + glow kuat ════════════════════════════════ */
        .sb-p-golden-crown {
          background: conic-gradient(from 0deg, #7c5a00, #fbbf24, #fff7cd, #f59e0b, #fde68a, #7c5a00);
          animation: sb-spin 5s linear infinite, sb-g-gold 2.6s ease-in-out infinite;
        }
        @keyframes sb-g-gold {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.75)) brightness(1.02); }
          50% { filter: drop-shadow(0 0 16px rgba(253, 230, 138, 1)) brightness(1.25); }
        }
        .sb-p-dragon-flame {
          background: conic-gradient(from 0deg, #7f1d1d, #ef4444, #f97316, #fde047, #f97316, #7f1d1d);
          animation: sb-spin 4s linear infinite, sb-g-dragon 0.9s ease-in-out infinite;
        }
        @keyframes sb-g-dragon {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.8)) brightness(1); }
          40% { filter: drop-shadow(0 0 16px rgba(249, 115, 22, 1)) brightness(1.3); }
          65% { filter: drop-shadow(0 0 9px rgba(239, 68, 68, 0.9)) brightness(1.1); }
        }
        .sb-p-cosmic-starfield {
          background: conic-gradient(from 0deg, #0b1026, #312e81, #818cf8, #f0f9ff, #7c3aed, #0b1026);
          animation: sb-spin 10s linear infinite, sb-g-cosmic 3.5s ease-in-out infinite;
        }
        @keyframes sb-g-cosmic {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(129, 140, 248, 0.7)); }
          50% { filter: drop-shadow(0 0 14px rgba(240, 249, 255, 0.95)) brightness(1.2); }
        }

        @media (prefers-reduced-motion: reduce) {
          .sb-ring > .sb-bg {
            animation: none !important;
          }
        }
      `}</style>
    </span>
  );
}

export default SolitBorder;
