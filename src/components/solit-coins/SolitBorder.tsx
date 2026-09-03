"use client";

import React from "react";
import type { BorderStyle } from "@/lib/solit-coins/types";

// Ring border avatar. Membungkus children (foto/inisial) dengan cincin gradient
// statis atau animasi. Tanpa `style` → gradient default (perilaku existing).

const DEFAULT_GRADIENT = "linear-gradient(135deg,#6366f1,#8b5cf6)";

function gradientCss(colors: string[]): string {
  const c = colors && colors.length ? colors : ["#6366f1", "#8b5cf6"];
  return `linear-gradient(135deg, ${c.join(", ")})`;
}

export function SolitBorder({
  style,
  thickness = 3,
  className = "",
  children,
}: {
  style?: BorderStyle | null;
  thickness?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const isAnimated = style?.kind === "animated";
  const preset = isAnimated ? (style as { preset: string }).preset : null;

  const bgStyle: React.CSSProperties =
    style?.kind === "gradient"
      ? { background: gradientCss(style.colors) }
      : isAnimated
        ? {}
        : { background: DEFAULT_GRADIENT };

  return (
    <span className={`sb-ring ${className}`} style={{ padding: thickness }}>
      <span className={`sb-bg ${preset ? `sb-preset-${preset}` : ""}`} style={bgStyle} />
      <span className="sb-inner">{children}</span>
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
        }
        .sb-ring > .sb-inner {
          position: relative;
          z-index: 1;
          display: inline-flex;
          border-radius: 9999px;
        }
        .sb-preset-rgb-spin {
          background: conic-gradient(from 0deg, #ff0080, #ff8c00, #ffed00, #00ff8c, #00b3ff, #8b5cf6, #ff0080);
          animation: sb-spin 3s linear infinite;
        }
        .sb-preset-aurora-wave {
          background: conic-gradient(from 0deg, #22d3ee, #34d399, #a855f7, #22d3ee);
          animation: sb-spin 6s linear infinite;
        }
        .sb-preset-galaxy-pulse {
          background: conic-gradient(from 0deg, #7c3aed, #ec4899, #6366f1, #7c3aed);
          animation: sb-spin 8s linear infinite, sb-pulse 3s ease-in-out infinite;
        }
        .sb-preset-golden-crown {
          background: conic-gradient(from 0deg, #fde68a, #f59e0b, #fbbf24, #fde68a);
          animation: sb-spin 5s linear infinite;
        }
        .sb-preset-dragon-flame {
          background: conic-gradient(from 0deg, #ef4444, #f97316, #fbbf24, #ef4444);
          animation: sb-spin 4s linear infinite;
        }
        .sb-preset-cosmic-starfield {
          background: conic-gradient(from 0deg, #0f172a, #6366f1, #e0e7ff, #312e81, #0f172a);
          animation: sb-spin 10s linear infinite;
        }
        @keyframes sb-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes sb-pulse {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.35);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sb-bg {
            animation: none !important;
          }
        }
      `}</style>
    </span>
  );
}

export default SolitBorder;
