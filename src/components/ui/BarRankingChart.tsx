"use client";

import { useId, useState } from "react";

interface BarSeries {
  key: string;
  label: string;
  color: string;
  data: number[];
  formatValue?: (v: number) => string;
}

interface BarRankingChartProps {
  labels: string[];
  series: BarSeries[];
  height?: number;
}

// path rect dengan sudut membulat hanya di atas (biar bar terlihat seperti "pill" naik dari baseline)
function roundedTopPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

export function BarRankingChart({ labels, series, height = 280 }: BarRankingChartProps) {
  const uid = useId();
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null);

  if (labels.length === 0) return null;

  const width = 700;
  const padL = 8;
  const padR = 8;
  const padT = 20;
  const padB = 36;
  const chartH = height - padT - padB;
  const chartW = width - padL - padR;

  const groupW = chartW / labels.length;
  const gap = 5;
  const barW = Math.max(5, (groupW - gap * (series.length + 1)) / series.length);
  const radius = Math.min(6, barW / 2);

  // tiap series dinormalisasi ke max-nya sendiri, biar metrik dengan skala beda (Total Pekerjaan vs Jam Terbang)
  // tetap enak dibandingkan secara visual walau angka aslinya jauh berbeda
  const maxes = series.map((s) => Math.max(1, ...s.data, 0));

  return (
    <div className="w-full">
      <div className="relative w-full" style={{ height }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.55} />
              </linearGradient>
            ))}
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = padT + chartH * (1 - f);
            return <line key={f} x1={padL} x2={width - padR} y1={y} y2={y} stroke="#f1f1f4" strokeWidth={1} />;
          })}
          <line x1={padL} x2={width - padR} y1={padT + chartH} y2={padT + chartH} stroke="#e5e7eb" strokeWidth={1.5} />

          {labels.map((label, gi) => {
            const groupX = padL + gi * groupW;
            const isGroupHovered = hover?.g === gi;
            return (
              <g key={label}>
                {isGroupHovered && (
                  <rect x={groupX} y={padT} width={groupW} height={chartH} fill="#1a1a2e" opacity={0.05} rx={8} />
                )}
                {series.map((s, si) => {
                  const value = s.data[gi] ?? 0;
                  const barH = maxes[si] > 0 ? (value / maxes[si]) * chartH : 0;
                  const x = groupX + gap + si * (barW + gap);
                  const y = padT + chartH - Math.max(barH, 2);
                  const isHovered = hover?.g === gi && hover?.s === si;
                  return (
                    <path
                      key={s.key}
                      d={roundedTopPath(x, y, barW, Math.max(barH, 2), radius)}
                      fill={`url(#${uid}-${s.key})`}
                      opacity={isHovered ? 1 : hover ? 0.5 : 0.92}
                      style={{ cursor: "pointer", transition: "opacity 120ms ease" }}
                      onMouseEnter={() => setHover({ g: gi, s: si })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
                <text
                  x={groupX + groupW / 2}
                  y={height - padB + 18}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight={600}
                  fill={isGroupHovered ? "#1a1a2e" : "#9ca3af"}
                >
                  {label.length > 10 ? `${label.slice(0, 9)}…` : label}
                </text>
              </g>
            );
          })}
        </svg>

        {hover && (
          <div
            className="absolute pointer-events-none bg-[#1a1a2e] text-white text-[11px] px-3 py-2 rounded-xl shadow-xl whitespace-nowrap z-10 ring-1 ring-white/10"
            style={{
              left: `${((padL + hover.g * groupW + groupW / 2) / width) * 100}%`,
              top: 0,
              transform: "translate(-50%, -100%) translateY(-8px)",
            }}
          >
            <p className="text-gray-300 mb-1 font-bold">{labels[hover.g]}</p>
            <p className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: series[hover.s].color }} />
              <span className="text-gray-300">{series[hover.s].label}:</span>
              <span className="font-bold">
                {series[hover.s].formatValue
                  ? series[hover.s].formatValue!(series[hover.s].data[hover.g] ?? 0)
                  : series[hover.s].data[hover.g]}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-5 mt-4 justify-center flex-wrap">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[10.5px] font-bold text-gray-600">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}