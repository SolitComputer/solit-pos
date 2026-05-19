"use client";

import { useEffect, useState } from "react";

interface Stats {
  todayRevenue: number;
  todayProfit: number;
  todayTransactions: number;
  laptopReady: number;
  stockTotal: number;
  topSales: { name: string; total: number; profit: number }[];
  topSources: { name: string; total: number }[];
  topLaptop: { name: string; total: number }[];
}

interface Transaction {
  id: string;
  customer_name: string;
  laptop_name: string;
  amount: number;
  other: number;
  status: string;
  payment_photo?: string;
  latitude?: string;
  longitude?: string;
  created_at: string;
}

export default function Page() {
  const [stats, setStats] = useState<Stats>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    fetchStats();
    fetchTransactions();
  }, []);

  const fetchStats = async () => {
    const response = await fetch("/api/dashboard/stats");
    const result = await response.json();
    setStats(result.data);
  };

  const fetchTransactions = async () => {
    try {
      const response = await fetch("/api/dashboard/transactions");
      const result = await response.json();
      setTransactions(result?.data || []);
    } catch (error) {
      console.log(error);
      setTransactions([]);
    }
  };

  return (
    <main className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Dashboard</h1>

      {/* STATS CARD - 5 kolom utama */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          label="Omzet Hari Ini"
          value={`Rp ${stats?.todayRevenue?.toLocaleString("id-ID") || 0}`}
        />
        <StatCard
          label="Profit Hari Ini"
          value={`+ Rp ${stats?.todayProfit?.toLocaleString("id-ID") || 0}`}
        />
        <StatCard
          label="Transaksi Hari Ini"
          value={stats?.todayTransactions || 0}
        />
        <StatCard label="Laptop Ready" value={stats?.laptopReady || 0} />
        <StatCard label="Total Stock" value={stats?.stockTotal || 0} />
      </div>

      {/* TOP SECTION - 3 kolom */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Top Sales */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Top Sales Hari Ini</h2>
          <div className="space-y-3">
            {stats?.topSales?.map((item) => (
              <div key={item.name} className="border border-gray-100 rounded-xl p-3">
                <p className="font-medium text-gray-800">{item.name}</p>
                <p className="text-sm text-gray-500">{item.total} transaksi</p>
                <p className="text-sm text-gray-700 mt-1">
                  Profit: Rp {item.profit.toLocaleString("id-ID")}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Top Source */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Top Source</h2>
          <div className="space-y-3">
            {stats?.topSources?.map((item) => (
              <div
                key={item.name}
                className="border border-gray-100 rounded-xl p-3 flex justify-between items-center"
              >
                <span className="text-gray-700">{item.name}</span>
                <span className="font-medium text-gray-800">{item.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Laptop */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Laptop Terlaris</h2>
          <div className="space-y-3">
            {stats?.topLaptop?.map((item) => (
              <div
                key={item.name}
                className="border border-gray-100 rounded-xl p-3 flex justify-between items-center"
              >
                <span className="text-gray-700">{item.name}</span>
                <span className="font-medium text-gray-800">{item.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TRANSACTION TERBARU */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Transaksi Terbaru</h2>
          <a
            href="/dashboard/transactions"
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            Lihat Semua →
          </a>
        </div>

        <div className="space-y-4">
          {transactions?.map((item) => (
            <div
              key={item.id}
              className="border border-gray-100 rounded-xl p-4 bg-gray-50/40"
            >
              <div className="flex justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold text-gray-800">
                    {item.customer_name}
                  </h3>
                  <p className="text-gray-500 text-sm">{item.laptop_name}</p>
                  <p className="font-medium text-gray-800 mt-2">
                    Rp {item.amount.toLocaleString("id-ID")}
                  </p>
                  <p className="text-gray-600 text-sm font-medium mt-0.5">
                    Profit: + Rp {(item.other || 0).toLocaleString("id-ID")}
                  </p>
                </div>
                <div className="text-right">
                  <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">
                    {item.status}
                  </span>
                  <p className="text-gray-400 text-xs mt-2">
                    {new Date(item.created_at).toLocaleDateString("id-ID")}
                  </p>
                </div>
              </div>

              {item.payment_photo && (
                <div className="mt-4">
                  <img
                    src={item.payment_photo}
                    alt="payment"
                    className="w-20 h-20 rounded-lg object-cover border border-gray-200"
                  />
                </div>
              )}

              {item.latitude && item.longitude && (
                <a
                  href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
                  target="_blank"
                  className="text-gray-500 text-sm mt-3 inline-block hover:text-gray-700 transition"
                >
                  📍 Lihat Lokasi
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// Komponen card statistik (opsional agar rapi)
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <p className="text-gray-500 text-sm">{label}</p>
      <p className="text-2xl font-semibold text-gray-800 mt-1">{value}</p>
    </div>
  );
}