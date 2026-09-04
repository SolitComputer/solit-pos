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
  const preset = isAnimated ? (style as { preset: string }).preset : null;
  const orn = preset ? ORNAMENTS[preset] : null;

  const bgStyle: React.CSSProperties =
    style?.kind === "gradient"
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
