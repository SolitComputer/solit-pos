"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const ACCENT = "#0d9488"; // teal-600

function CountTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const name = item?.payload?.label ?? label;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-900">{name}</div>
      <div className="text-gray-500">
        <span className="font-bold text-gray-900">{item.value}</span> {unit}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function PreparationCharts({
  workloadData, statusData, trendData,
}: {
  workloadData: { name: string; total: number }[];
  statusData: { status: string; label: string; value: number; color: string }[];
  trendData: { label: string; count: number }[];
}) {
  return (
    <div className="grid lg:grid-cols-3 gap-3">
      {/* Beban kerja */}
      <ChartCard
        title="Beban Kerja Kurir"
        subtitle="Total pengantaran per kurir"
        className="lg:col-span-2"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={workloadData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={32} />
            <Tooltip cursor={{ fill: "#f0fdfa" }} content={<CountTooltip unit="pengantaran" />} />
            <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={46}>
              {workloadData.map((_, i) => (
                <Cell key={i} fill={ACCENT} fillOpacity={1 - i * 0.07} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Distribusi status */}
      <ChartCard title="Distribusi Status" subtitle="Semua pengantaran periode ini">
        {statusData.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">
            Tidak ada data
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="none"
                >
                  {statusData.map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<CountTooltip unit="pengantaran" />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full mt-2 space-y-1.5">
              {statusData.map((s) => (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-gray-600 flex-1 truncate">{s.label}</span>
                  <span className="font-semibold text-gray-900">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      {/* Tren aktivitas */}
      <ChartCard
        title="Tren Pengantaran Selesai"
        subtitle="Jumlah pengantaran terselesaikan dari waktu ke waktu"
        className="lg:col-span-3"
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="prepTrend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={32} />
            <Tooltip content={<CountTooltip unit="pengantaran" />} />
            <Area type="monotone" dataKey="count" stroke={ACCENT} strokeWidth={2.5} fill="url(#prepTrend)" dot={false} activeDot={{ r: 4, fill: ACCENT }} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
