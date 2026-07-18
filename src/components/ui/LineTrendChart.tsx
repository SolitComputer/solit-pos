"use client";

import { useId, useMemo, useState } from "react";

interface LineTrendChartProps {
  labels: string[];
  data: number[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}

export function LineTrendChart({
  labels,
  data,
  color = "#059669",
  height = 280,
  formatValue,
}: LineTrendChartProps) {
  const uid = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 700;
  const padL = 32;
  const padR = 12;
  const padT = 20;
  const padB = 32;
  const chartH = height - padT - padB;
  const chartW = width - padL - padR;

  const max = Math.max(1, ...data);
  const niceMax = Math.max(1, Math.ceil(max * 1.15));
  const stepX = labels.length > 1 ? chartW / (labels.length - 1) : 0;

  const points = data.map((v, i) => ({
    x: padL + (labels.length > 1 ? i * stepX : chartW / 2),
    y: padT + chartH - (v / niceMax) * chartH,
    v,
  }));

  // kurva smooth pakai cardinal spline (catmull-rom → bezier), bukan garis patah-patah
  const smoothPath = useMemo(() => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }, [points]);

  const areaPath =
    points.length > 0
      ? `${smoothPath} L ${points[points.length - 1].x} ${padT + chartH} L ${points[0].x} ${padT + chartH} Z`
      : "";

  const labelStep = Math.max(1, Math.ceil(labels.length / 7));

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: padT + chartH * (1 - f),
    value: Math.round(niceMax * f),
  }));

  if (labels.length === 0) return null;

  return (
    <div className="w-full">
      <div className="relative w-full" style={{ height }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {yTicks.map((t) => (
            <g key={t.y}>
              <line x1={padL} x2={width - padR} y1={t.y} y2={t.y} stroke="#f1f1f4" strokeWidth={1} />
              <text x={padL - 8} y={t.y + 3} textAnchor="end" fontSize="9" fontWeight={600} fill="#b7bcc7">
                {t.value}
              </text>
            </g>
          ))}
          <line x1={padL} x2={width - padR} y1={padT + chartH} y2={padT + chartH} stroke="#e5e7eb" strokeWidth={1.5} />

          {hoverIndex !== null && (
            <line
              x1={points[hoverIndex].x}
              x2={points[hoverIndex].x}
              y1={padT}
              y2={padT + chartH}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5}
            />
          )}

          <path d={areaPath} fill={`url(#${uid}-area)`} stroke="none" />
          <path d={smoothPath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, i) => (
            <g key={i}>
              {hoverIndex === i && <circle cx={p.x} cy={p.y} r={8} fill={color} opacity={0.15} />}
              <circle
                cx={p.x}
                cy={p.y}
                r={hoverIndex === i ? 5 : 3}
                fill={color}
                stroke="white"
                strokeWidth={hoverIndex === i ? 2 : 1.5}
              />
              <rect
                x={p.x - (stepX || 24) / 2}
                y={padT}
                width={stepX || 24}
                height={chartH}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
              {i % labelStep === 0 && (
                <text
                  x={p.x}
                  y={height - padB + 18}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight={600}
                  fill={hoverIndex === i ? color : "#9ca3af"}
                >
                  {labels[i]}
                </text>
              )}
            </g>
          ))}
        </svg>

        {hoverIndex !== null && (
          <div
            className="absolute pointer-events-none bg-[#1a1a2e] text-white text-[11px] px-3 py-2 rounded-xl shadow-xl whitespace-nowrap z-10 ring-1 ring-white/10"
            style={{
              left: `${(points[hoverIndex].x / width) * 100}%`,
              top: `${(points[hoverIndex].y / height) * 100}%`,
              transform: "translate(-50%, -130%)",
            }}
          >
            <p className="text-gray-300 mb-0.5">{labels[hoverIndex]}</p>
            <p className="font-bold">{formatValue ? formatValue(points[hoverIndex].v) : points[hoverIndex].v}</p>
          </div>
        )}
      </div>
    </div>
  );
}