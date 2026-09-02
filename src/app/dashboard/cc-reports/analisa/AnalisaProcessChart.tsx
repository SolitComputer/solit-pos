"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fmtMinutes } from "@/lib/ccReports";

const PROCESS_SEGMENTS = [
  { key: "takeMinutes", label: "Take", color: "#7c3aed" },
  { key: "handoffMinutes", label: "Serah ke Editor", color: "#f59e0b" },
  { key: "editMinutes", label: "Editing", color: "#10b981" },
] as const;

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

function ProcessTooltip({ active, payload, label }: TooltipInjected) {
  if (!active || !payload?.length) return null;
  const take = pick(payload, "takeMinutes");
  const handoff = pick(payload, "handoffMinutes");
  const edit = pick(payload, "editMinutes");
  return (
    <div className="max-w-[240px] rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg">
      <p className="truncate text-[11px] font-bold text-gray-500">{String(label)}</p>
      <div className="mt-1 space-y-0.5 text-xs font-semibold text-gray-700">
        <p> Take: <b>{fmtMinutes(take)}</b></p>
        <p> Serah ke editor: <b>{fmtMinutes(handoff)}</b></p>
        <p> Editing: <b>{fmtMinutes(edit)}</b></p>
        <p className="border-t border-gray-100 pt-1 text-gray-900">
          Total: <b>{fmtMinutes(take + handoff + edit)}</b>
        </p>
      </div>
    </div>
  );
}

export default function AnalisaProcessChart({
  processData,
}: {
  processData: { name: string; takeMinutes: number; handoffMinutes: number; editMinutes: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={processData} margin={{ top: 10, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#f1f2f4" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false} tickLine={false} interval={0} angle={-25}
          textAnchor="end" height={60}
          tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 14)}…` : v)} />
        <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickFormatter={(v: number) => fmtMinutes(v)}
          axisLine={false} tickLine={false} width={62} />
        <Tooltip cursor={{ fill: "#f9fafb" }}
          content={(p) => <ProcessTooltip {...(p as TooltipInjected)} />} />
        {PROCESS_SEGMENTS.map((s) => (
          <Bar key={s.key} dataKey={s.key} stackId="proc" fill={s.color} maxBarSize={48}
            radius={s.key === "editMinutes" ? [6, 6, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
