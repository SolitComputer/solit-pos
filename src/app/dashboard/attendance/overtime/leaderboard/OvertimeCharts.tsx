"use client";

import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

type BarDatum = { name: string; fullName: string; totalHours: number; totalMinutes: number; sessions: number };
type PieDatum = { name: string; value: number; color: string };
type TrendDatum = { key: string; hours: number };

function formatDurationMinutes(mins: number) {
    if (!mins) return "0 jam";
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}

function BarTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-gray-900 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg">
            <p className="font-bold mb-0.5">{d.fullName}</p>
            <p className="text-gray-300">{formatDurationMinutes(d.totalMinutes)} · {d.sessions} sesi</p>
        </div>
    );
}
function TrendTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-900 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg">
            <p className="font-bold mb-0.5">{label}</p>
            <p className="text-gray-300">{payload[0].value} jam</p>
        </div>
    );
}

export default function OvertimeCharts({
    barData, pieData, trend, trendLabel, trendTickFormatter, isMobile,
}: {
    barData: BarDatum[];
    pieData: PieDatum[];
    trend: TrendDatum[];
    trendLabel: string;
    trendTickFormatter: (v: string) => string;
    isMobile: boolean;
}) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar ranking */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Ranking Jam Lembur (Top 10)</p>
                <ResponsiveContainer width="100%" height={Math.max(220, barData.length * (isMobile ? 28 : 34))}>
                    <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f1f3" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: isMobile ? 9 : 10, fill: "#4b5563" }} axisLine={false} tickLine={false} width={isMobile ? 52 : 70} />
                        <Tooltip content={<BarTooltip />} cursor={{ fill: "#f5f3ff" }} />
                        <Bar dataKey="totalHours" fill="#7c3aed" radius={[0, 6, 6, 0]} barSize={isMobile ? 12 : 16} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Status distribution */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Distribusi Status</p>
                <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${value ?? 0} lemburan`, name]} />
                        <Legend wrapperStyle={{ fontSize: "10px" }} iconType="circle" />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* Trend */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                    Tren Jam Lembur {trendLabel}
                </p>
                <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trend} margin={{ left: isMobile ? -20 : -16, right: 16, top: 4, bottom: 4 }}>
                        <defs>
                            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f3" />
                        <XAxis dataKey="key" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                            tickFormatter={trendTickFormatter} />
                        <YAxis tick={{ fontSize: isMobile ? 9 : 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={isMobile ? 30 : 42} />
                        <Tooltip content={<TrendTooltip />} />
                        <Area type="monotone" dataKey="hours" stroke="#7c3aed" strokeWidth={2} fill="url(#trendFill)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
