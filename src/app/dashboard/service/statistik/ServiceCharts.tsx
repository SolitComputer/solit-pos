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
import {
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
} from "lucide-react";

const ACCENT = "#52525b"; // zinc-600

function CountTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const name = item?.payload?.label ?? label;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg px-3 py-2 text-xs">
      <div className="font-bold text-gray-900">{name}</div>
      <div className="text-gray-500">
        <span className="font-black text-gray-900 tabular-nums">{item.value}</span> {unit}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 ${className}`}>
      <div className="mb-3 flex items-start gap-2">
        {icon && (
          <span className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-gray-900 truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-400 font-medium truncate">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ServiceCharts({
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
        title="Beban Kerja Teknisi"
        subtitle="Total servis per teknisi"
        icon={<BarChart3 className="w-3.5 h-3.5" />}
        className="lg:col-span-2"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={workloadData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={32} />
            <Tooltip cursor={{ fill: "#f4f4f5" }} content={<CountTooltip unit="servis" />} />
            <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={46}>
              {workloadData.map((_, i) => (
                <Cell key={i} fill={ACCENT} fillOpacity={1 - i * 0.07} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Distribusi status */}
      <ChartCard
        title="Distribusi Status"
        subtitle="Semua servis periode ini"
        icon={<PieChartIcon className="w-3.5 h-3.5" />}
      >
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
                <Tooltip content={<CountTooltip unit="servis" />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full mt-2 space-y-1.5">
              {statusData.map((s) => (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-gray-600 flex-1 truncate">{s.label}</span>
                  <span className="font-bold text-gray-900 tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      {/* Tren aktivitas */}
      <ChartCard
        title="Tren Servis Selesai"
        subtitle="Jumlah servis terselesaikan dari waktu ke waktu"
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        className="lg:col-span-3"
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="svcTrend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={32} />
            <Tooltip content={<CountTooltip unit="servis" />} />
            <Area type="monotone" dataKey="count" stroke={ACCENT} strokeWidth={2.5} fill="url(#svcTrend)" dot={false} activeDot={{ r: 4, fill: ACCENT }} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
