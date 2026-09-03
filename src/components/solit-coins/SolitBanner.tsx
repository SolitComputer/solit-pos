"use client";

import React from "react";
import type { BorderStyle } from "@/lib/solit-coins/types";

// Banner kosmetik = BINGKAI (frame) animasi di sekeliling area banner. Tengahnya
// transparan (pakai mask), jadi foto banner di belakang tetap kelihatan.
// Preset animasi sama namanya dengan border, dirender sebagai gradient bergerak.

function gradientCss(colors: string[]): string {
  const c = colors && colors.length ? colors : ["#6366f1", "#8b5cf6"];
  return `linear-gradient(135deg, ${c.join(", ")})`;
}

export default function SolitBanner({
  style,
  thickness = 6,
  openBottom = false,
  className = "",
}: {
  style?: BorderStyle | null;
  thickness?: number;
  /** Bingkai terbuka di bawah (tanpa sisi bawah) — dipakai di profil agar
   *  garis bawah tidak menyilang foto profil yang overlap. */
  openBottom?: boolean;
  className?: string;
}) {
  const isAnimated = style?.kind === "animated";
  const preset = isAnimated ? (style as { preset: string }).preset : null;
  // padding = sisi bingkai yang terlihat (mask exclude content-box). Bottom 0 → tanpa sisi bawah.
  const inline: React.CSSProperties = {
    padding: openBottom ? `${thickness}px ${thickness}px 0 ${thickness}px` : thickness,
  };
  if (style?.kind === "gradient") inline.background = gradientCss(style.colors);

  return (
    <div className={`sb-frame ${preset ? `sb-frame-${preset}` : ""} ${className}`} style={inline}>
      <style jsx global>{`
        .sb-frame {
          pointer-events: none;
          /* Hanya area padding (bingkai) yang terlihat; tengah (content-box) transparan. */
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        .sb-frame[class*="sb-frame-"] {
          background-size: 250% 100%;
          animation: sbf-slide 6s linear infinite;
        }
        .sb-frame-rgb-spin {
          background-image: linear-gradient(90deg, #ff0080, #ff8c00, #ffed00, #00ff8c, #00b3ff, #8b5cf6, #ff0080);
          animation-duration: 5s;
        }
        .sb-frame-aurora-wave {
          background-image: linear-gradient(90deg, #0f2027, #22d3ee, #34d399, #a855f7, #0f2027);
          animation-duration: 7s;
        }
        .sb-frame-galaxy-pulse {
          background-image: linear-gradient(90deg, #0f0c29, #7c3aed, #ec4899, #302b63, #0f0c29);
          animation: sbf-slide 8s linear infinite, sbf-pulse 4s ease-in-out infinite;
        }
        .sb-frame-golden-crown {
          background-image: linear-gradient(90deg, #7c5a00, #fde68a, #f59e0b, #fbbf24, #7c5a00);
          animation-duration: 6s;
        }
        .sb-frame-dragon-flame {
          background-image: linear-gradient(90deg, #7f1d1d, #ef4444, #f97316, #fbbf24, #7f1d1d);
          animation: sbf-slide 5s linear infinite, sbf-pulse 3s ease-in-out infinite;
        }
        .sb-frame-cosmic-starfield {
          background-image: linear-gradient(90deg, #0b1026, #312e81, #6366f1, #e0e7ff, #0b1026);
          animation-duration: 9s;
        }
        @keyframes sbf-slide {
          to {
            background-position: 250% 0;
          }
        }
        @keyframes sbf-pulse {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.35);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sb-frame {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
