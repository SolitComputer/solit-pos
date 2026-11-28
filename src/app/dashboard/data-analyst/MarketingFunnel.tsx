"use client";

import { Eye, Heart, Target, ShoppingCart } from "lucide-react";

interface FunnelData {
  awareness: number;
  interest: number;
  decision: number;
  action: number;
}

interface Props {
  data: FunnelData;
  loading?: boolean;
  onAwarenessClick?: () => void; // click handler untuk buka breakdown modal
}

// ─── SVG Funnel (segitiga terbalik) ────────────────────────────────────────
// 4 band: 3 trapezoid + 1 triangle di bawah (mengerucut ke titik).
// Koordinat sengaja hardcoded supaya shape-nya konsisten, canvas 800x540.
const BANDS = [
  // top wide → narrower each row. Format: polygon points
  { points: "40,40 760,40 700,150 100,150", stage: "awareness" as const },
  { points: "100,150 700,150 625,260 175,260", stage: "interest" as const },
  { points: "175,260 625,260 525,370 275,370", stage: "decision" as const },
  { points: "275,370 525,370 400,510", stage: "action" as const }, // triangle
];

// Pakai gradient id berbeda tiap band supaya tidak ada name collision kalau
// komponen ini di-render 2x di halaman yang sama.
const INSTANCE = `mf-${Math.random().toString(36).slice(2, 8)}`;

const STAGE_META = {
  awareness: {
    label: "Awareness",
    caption: "Orang yang tahu Solit",
    icon: Eye,
    from: "#8B5CF6", // violet-500
    to: "#D946EF",   // fuchsia-500
    textY: 100,
  },
  interest: {
    label: "Interest",
    caption: "Yang tertarik (like/komen/share)",
    icon: Heart,
    from: "#EC4899", // pink-500
    to: "#F43F5E",   // rose-500
    textY: 210,
  },
  decision: {
    label: "Decision",
    caption: "Berminat membeli",
    icon: Target,
    from: "#F59E0B", // amber-500
    to: "#F97316",   // orange-500
    textY: 320,
  },
  action: {
    label: "Action",
    caption: "Transaksi aktual",
    icon: ShoppingCart,
    from: "#10B981", // emerald-500
    to: "#14B8A6",   // teal-500
    textY: 420,
  },
};

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export default function MarketingFunnel({ data, loading, onAwarenessClick }: Props) {
  const { awareness, interest, decision, action } = data;

  // Konversi antar tahap — selalu relatif ke tahap sebelumnya
  const conv = {
    interestFromAwareness: pct(interest, awareness),
    decisionFromInterest: pct(decision, interest),
    actionFromDecision: pct(action, decision),
    overall: pct(action, awareness),
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm ring-1 ring-gray-50 overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Marketing Funnel</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Perjalanan customer dari awareness sampai pembelian
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
          Overall conversion {conv.overall}
        </span>
      </div>

      <div className="grid lg:grid-cols-[1fr_auto] gap-0">
        {/* SVG funnel */}
        <div className="p-4 sm:p-6 flex items-center justify-center">
          <svg
            viewBox="0 0 800 540"
            className={`w-full max-w-2xl h-auto ${loading ? "opacity-50" : ""}`}
            role="img"
            aria-label="Marketing funnel visualization"
          >
            <defs>
              {Object.entries(STAGE_META).map(([k, m]) => (
                <linearGradient
                  key={k}
                  id={`${INSTANCE}-${k}`}
                  x1="0%" y1="0%" x2="100%" y2="100%"
                >
                  <stop offset="0%" stopColor={m.from} />
                  <stop offset="100%" stopColor={m.to} />
                </linearGradient>
              ))}
            </defs>

            {BANDS.map((band) => {
              const meta = STAGE_META[band.stage];
              const value = data[band.stage];
              const clickable = band.stage === "awareness" && !!onAwarenessClick;
              return (
                <g key={band.stage} onClick={clickable ? onAwarenessClick : undefined}
                   style={clickable ? { cursor: "pointer" } : undefined}>
                  <polygon
                    points={band.points}
                    fill={`url(#${INSTANCE}-${band.stage})`}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                  <text
                    x="400"
                    y={meta.textY - 10}
                    textAnchor="middle"
                    fill="white"
                    fontSize="14"
                    fontWeight="600"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
                  >
                    {meta.label.toUpperCase()}
                  </text>
                  <text
                    x="400"
                    y={meta.textY + 18}
                    textAnchor="middle"
                    fill="white"
                    fontSize="28"
                    fontWeight="800"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                  >
                    {Number(value).toLocaleString("id-ID")}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right side: breakdown cards */}
        <div className="border-t lg:border-t-0 lg:border-l border-gray-100 p-4 sm:p-5 bg-gray-50/50 lg:w-72 flex flex-col gap-2.5">
          <FunnelDetailCard
            meta={STAGE_META.awareness}
            value={awareness}
            conversion={null}
          />
          <ConversionArrow pct={conv.interestFromAwareness} />
          <FunnelDetailCard
            meta={STAGE_META.interest}
            value={interest}
            conversion={conv.interestFromAwareness}
            placeholder={interest === 0}
          />
          <ConversionArrow pct={conv.decisionFromInterest} />
          <FunnelDetailCard
            meta={STAGE_META.decision}
            value={decision}
            conversion={conv.decisionFromInterest}
          />
          <ConversionArrow pct={conv.actionFromDecision} />
          <FunnelDetailCard
            meta={STAGE_META.action}
            value={action}
            conversion={conv.actionFromDecision}
          />
        </div>
      </div>
    </div>
  );
}

function FunnelDetailCard({
  meta, value, conversion, placeholder,
}: {
  meta: typeof STAGE_META[keyof typeof STAGE_META];
  value: number;
  conversion: string | null;
  placeholder?: boolean;
}) {
  const Icon = meta.icon;
  return (
    <div className={`bg-white rounded-xl border border-gray-100 px-3 py-2.5 shadow-sm ${placeholder ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">{meta.label}</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">
            {value.toLocaleString("id-ID")}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-1 truncate">
        {placeholder ? "Data belum tersedia" : meta.caption}
      </p>
    </div>
  );
}

function ConversionArrow({ pct }: { pct: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 font-semibold -my-1">
      <span className="h-px w-6 bg-gray-200" />
      <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200">
        ↓ {pct}
      </span>
      <span className="h-px w-6 bg-gray-200" />
    </div>
  );
}