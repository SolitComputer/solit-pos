"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { fmtCompact, fmtNum } from "@/lib/ccReports";

interface TooltipItem {
  dataKey?: string | number | ((obj: unknown) => unknown);
  value?: number | string | Array<number | string>;
}
interface TooltipInjected {
  active?: boolean;
  payload?: readonly TooltipItem[];
  label?: unknown;
}

function pick(payload: readonly TooltipItem[] | undefined, key: string): number {
  const hit = payload?.find((p) => p.dataKey === key)?.value;
  return typeof hit === "number" || typeof hit === "string" ? Number(hit) || 0 : 0;
}

function BarTooltip({
  active, payload, label, metricLabel, color,
}: TooltipInjected & { metricLabel: string; color: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="max-w-[240px] rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg">
      <p className="truncate text-[11px] font-bold text-gray-500">{String(label)}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-black tabular-nums text-gray-900">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {fmtNum(pick(payload, "value"))} <span className="font-semibold text-gray-400">{metricLabel}</span>
      </p>
      <p className="text-[11px] font-semibold text-gray-400">{pick(payload, "posts")} posting</p>
    </div>
  );
}

export default function AnalisaHeroChart({
  barData, metricLabel, color,
}: {
  barData: { name: string; value: number; posts: number }[];
  metricLabel: string;
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={barData} margin={{ top: 10, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#f1f2f4" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false} tickLine={false} interval={0} angle={-25}
          textAnchor="end" height={60}
          tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 14)}…` : v)} />
        <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={fmtCompact}
          axisLine={false} tickLine={false} width={52} />
        <Tooltip cursor={{ fill: "#f9fafb" }}
          content={(props) => (
            <BarTooltip {...(props as TooltipInjected)} metricLabel={metricLabel} color={color} />
          )} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={54}>
          {barData.map((_, i) => (
            <Cell key={i} fill={color} fillOpacity={1 - i * 0.06} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
