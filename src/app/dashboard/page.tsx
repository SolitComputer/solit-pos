"use client";

import {
  useEffect,
  useState,
} from "react";

interface Stats {
  todayRevenue:
  number;

  todayTransactions:
  number;

  laptopReady:
  number;

  pendingPayments:
  number;
}

interface Transaction {
  id: string;
  customer_name: string;
  laptop_name: string;
  amount: number;
  status: string;
  created_at: string;
}

export default function Page() {

  const [
    stats,
    setStats,
  ] =
    useState<Stats>();

  const [
    transactions,
    setTransactions,
  ] =
    useState<
      Transaction[]
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
    <main className="p-5">

      <h1 className="text-3xl font-bold mb-6">
        Dashboard
      </h1>

      <div className="grid md:grid-cols-4 gap-4">

        <div className="bg-white rounded-3xl p-5 shadow">

          <p className="text-slate-500 text-sm">
            Omzet Hari Ini
          </p>

          <h2 className="text-2xl font-bold mt-2 text-green-600">
            Rp
            {stats?.todayRevenue?.toLocaleString(
              "id-ID"
            )}
          </h2>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow">

          <p className="text-slate-500 text-sm">
            Transaksi Hari Ini
          </p>

          <h2 className="text-2xl font-bold mt-2">
            {
              stats?.todayTransactions
            }
          </h2>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow">

          <p className="text-slate-500 text-sm">
            Laptop Ready
          </p>

          <h2 className="text-2xl font-bold mt-2">
            {
              stats?.laptopReady
            }
          </h2>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow">

          <p className="text-slate-500 text-sm">
            Pending Payment
          </p>

          <h2 className="text-2xl font-bold mt-2 text-orange-500">
            {
              stats?.pendingPayments
            }
          </h2>
        </div>

      </div>

      <div className="mt-8 bg-white rounded-3xl p-5 shadow">

        <div className="flex justify-between items-center mb-5">

          <h2 className="text-xl font-bold">
            Transaksi Terbaru
          </h2>

          <a
            href="/dashboard/transactions"
            className="text-sm text-blue-600"
          >
            Lihat Semua
          </a>
        </div>

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead>

              <tr className="border-b text-left text-slate-500">

                <th className="py-3">
                  Customer
                </th>

                <th>
                  Laptop
                </th>

                <th>
                  Total
                </th>

                <th>
                  Status
                </th>

                <th>
                  Tanggal
                </th>

              </tr>

            </thead>

            <tbody>

              {transactions.map(
                (
                  item
                ) => (
                  <tr
                    key={
                      item.id
                    }
                    className="border-b"
                  >

                    <td className="py-4 font-medium">
                      {
                        item.customer_name
                      }
                    </td>

                    <td>
                      {
                        item.laptop_name
                      }
                    </td>

                    <td className="font-semibold">
                      Rp
                      {item.amount.toLocaleString(
                        "id-ID"
                      )}
                    </td>

                    <td>

                      <span
                        className={`
                    px-3
                    py-1
                    rounded-full
                    text-sm
                    font-medium
                    ${item.status ===
                            "PAID"
                            ? "bg-green-100 text-green-600"
                            : "bg-orange-100 text-orange-600"
                          }
                  `}
                      >
                        {
                          item.status
                        }
                      </span>

                    </td>

                    <td className="text-slate-500 text-sm">

                      {new Date(
                        item.created_at
                      ).toLocaleDateString(
                        "id-ID"
                      )}

                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

        </div>
      </div>
    </main>
  );
}