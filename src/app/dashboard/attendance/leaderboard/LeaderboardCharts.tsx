"use client";

import { BarChart3, Percent, Activity } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

type BarDatum = { name: string; fullName: string; bayesianScore: number; tepat: number; telat: number };
type PieDatum = { name: string; value: number; color: string };
type TrendDatum = { key: string; count: number };

function BarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-900 text-white text-[10px] rounded-xl px-3 py-2 shadow-lg">
      <p className="font-bold mb-0.5">{d.fullName}</p>
      <p className="text-gray-300">{d.bayesianScore.toFixed(1)} poin · {d.tepat} tepat · {d.telat} telat</p>
    </div>
  );
}
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white text-[10px] rounded-xl px-3 py-2 shadow-lg">
      <p className="font-bold mb-0.5">{label}</p>
      <p className="text-gray-300">{payload[0].value} absen</p>
    </div>
  );
}

export default function LeaderboardCharts({
  barData, pieData, trend, trendLabel, trendTickFormatter,
}: {
  barData: BarDatum[];
  pieData: PieDatum[];
  trend: TrendDatum[];
  trendLabel: string;
  trendTickFormatter: (v: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
      {/* Bar ranking */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <div className="flex items-center gap-1.5 mb-3 sm:mb-4">
          <div className="w-5 h-5 rounded-md bg-violet-50 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-3 h-3 text-violet-600" />
          </div>
          <p className="text-[8px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-widest">Skor Bayesian Top 10</p>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 32)}>
          <BarChart data={barData} layout="vertical" margin={{ left: -10, right: 10, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f1f3" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#4b5563" }} axisLine={false} tickLine={false} width={55} />
            <Tooltip content={<BarTooltip />} cursor={{ fill: "#f5f3ff" }} />
            <Bar dataKey="bayesianScore" fill="#7c3aed" radius={[0, 6, 6, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Status distribution */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <div className="flex items-center gap-1.5 mb-3 sm:mb-4">
          <div className="w-5 h-5 rounded-md bg-cyan-50 flex items-center justify-center flex-shrink-0">
            <Percent className="w-3 h-3 text-cyan-600" />
          </div>
          <p className="text-[8px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-widest">Distribusi Status</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
              {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(value, name) => [`${value ?? 0} hari`, name]} />
            <Legend wrapperStyle={{ fontSize: "10px" }} iconType="circle" />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Trend */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 lg:col-span-2">
        <div className="flex items-center gap-1.5 mb-3 sm:mb-4">
          <div className="w-5 h-5 rounded-md bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Activity className="w-3 h-3 text-emerald-600" />
          </div>
          <p className="text-[8px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-widest">
            Tren Kehadiran {trendLabel}
          </p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={trend} margin={{ left: -20, right: 10, top: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="trendFillAbsen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f3" />
            <XAxis dataKey="key" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false}
              tickFormatter={trendTickFormatter} />
            <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<TrendTooltip />} />
            <Area type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} fill="url(#trendFillAbsen)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
