"use client";

import {
  useEffect,
  useState,
} from "react";

interface Stats {
  totalRevenue:
    number;

  totalSold:
    number;

  pendingCount:
    number;

  stockReady:
    number;
}

export default function Page() {

  const [
    stats,
    setStats,
  ] =
    useState<
      Stats
    >();

  const [
    transactions,
    setTransactions,
  ] =
    useState<
      any[]
    >([]);

  useEffect(() => {
    fetchStats();
    fetchTransactions();
  }, []);

  const fetchStats =
    async () => {
      const response =
        await fetch(
          "/api/dashboard/stats"
        );

      const result =
        await response.json();

      setStats(
        result.data
      );
    };

  const fetchTransactions =
    async () => {
      const response =
        await fetch(
          "/api/dashboard/transactions"
        );

      const result =
        await response.json();

      setTransactions(
        result.data
      );
    };

  return (
    <main className="min-h-screen bg-slate-100 p-5">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-3xl font-bold mb-6">
          Dashboard
        </h1>

        {/* CARDS */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">

          <div className="bg-white rounded-3xl p-5 shadow-md">
            <p className="text-slate-500">
              Pendapatan Hari Ini
            </p>

            <h2 className="text-2xl font-bold text-green-600">
              Rp
              {stats?.totalRevenue?.toLocaleString(
                "id-ID"
              )}
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-5 shadow-md">
            <p className="text-slate-500">
              Laptop Terjual
            </p>

            <h2 className="text-2xl font-bold">
              {
                stats?.totalSold
              }
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-5 shadow-md">
            <p className="text-slate-500">
              Pending
            </p>

            <h2 className="text-2xl font-bold text-yellow-600">
              {
                stats?.pendingCount
              }
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-5 shadow-md">
            <p className="text-slate-500">
              Stock Ready
            </p>

            <h2 className="text-2xl font-bold text-blue-600">
              {
                stats?.stockReady
              }
            </h2>
          </div>
        </div>

        {/* QUICK MENU */}
        <div className="flex flex-wrap gap-3 mb-8">

          <a
            href="/payment/create"
            className="bg-black text-white px-5 py-3 rounded-2xl"
          >
            + Buat Pembayaran
          </a>

          <a
            href="/dashboard/laptops"
            className="bg-white border px-5 py-3 rounded-2xl"
          >
            Data Laptop
          </a>

          <a
            href="/dashboard/laptops/create"
            className="bg-white border px-5 py-3 rounded-2xl"
          >
            + Tambah Laptop
          </a>
        </div>

        {/* TRANSAKSI */}
        <div className="bg-white rounded-3xl p-5 shadow-md">

          <h2 className="font-bold text-xl mb-5">
            Transaksi Terbaru
          </h2>

          <div className="space-y-4">

            {transactions.map(
              (
                item
              ) => (
                <div
                  key={
                    item.id
                  }
                  className="flex justify-between border-b pb-4"
                >
                  <div>
                    <h3 className="font-semibold">
                      {
                        item.customer_name
                      }
                    </h3>

                    <p className="text-slate-500 text-sm">
                      {
                        item.laptop_name
                      }
                    </p>

                    <p className="text-xs text-slate-400">
                      {
                        item.invoice_number
                      }
                    </p>
                  </div>

                  <div className="text-right">

                    <h3 className="font-bold">
                      Rp
                      {item.amount?.toLocaleString(
                        "id-ID"
                      )}
                    </h3>

                    <span
                      className={`
                        px-3 py-1 rounded-full text-xs font-semibold
                        ${
                          item.status ===
                          "PAID"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }
                      `}
                    >
                      {
                        item.status
                      }
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </main>
  );
}