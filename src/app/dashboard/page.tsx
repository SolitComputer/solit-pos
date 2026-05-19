"use client";

import {
  useEffect,
  useState,
} from "react";

interface Stats {
  todayRevenue:
  number;

  todayProfit:
  number;

  todayTransactions:
  number;

  laptopReady:
  number;

  stockTotal:
  number;
}

interface Transaction {
  id: string;

  customer_name:
  string;

  laptop_name:
  string;

  amount:
  number;

  other:
  number;

  status:
  string;

  payment_photo?:
  string;

  latitude?:
  string;

  longitude?:
  string;

  created_at:
  string;
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

  useEffect(
    () => {
      fetchStats();
      fetchTransactions();
    },
    []
  );

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

      try {

        const response =
          await fetch(
            "/api/dashboard/transactions"
          );

        const result =
          await response.json();

        console.log(
          "TRANSACTION:",
          result
        );

        setTransactions(
          result?.data || []
        );

      } catch (
      error
      ) {

        console.log(
          error
        );

        setTransactions(
          []
        );
      }
    };

  return (
    <main className="p-5 bg-slate-100 min-h-screen">

      <h1 className="text-3xl font-bold mb-6">
        Dashboard
      </h1>

      {/* STATS */}
      <div className="grid md:grid-cols-5 gap-4">

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
            Profit Hari Ini
          </p>

          <h2 className="text-2xl font-bold mt-2 text-emerald-600">
            +
            Rp
            {stats?.todayProfit?.toLocaleString(
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
            Total Stock
          </p>

          <h2 className="text-2xl font-bold mt-2 text-blue-600">
            {
              stats?.stockTotal
            }
          </h2>
        </div>

      </div>

      {/* TRANSACTION */}
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

        <div className="space-y-4">

          {transactions?.map(
            (
              item
            ) => (

              <div
                key={
                  item.id
                }
                className="
                                    border
                                    rounded-2xl
                                    p-4
                                    bg-slate-50
                                "
              >

                <div className="flex justify-between">

                  <div>

                    <h3 className="font-semibold text-lg">
                      {
                        item.customer_name
                      }
                    </h3>

                    <p className="text-slate-500 text-sm">
                      {
                        item.laptop_name
                      }
                    </p>

                    <p className="font-semibold mt-2">
                      Rp
                      {item.amount.toLocaleString(
                        "id-ID"
                      )}
                    </p>

                    <p className="text-green-600 text-sm font-medium">
                      Profit:
                      {" "}
                      +
                      Rp
                      {(item.other || 0).toLocaleString(
                        "id-ID"
                      )}
                    </p>

                  </div>

                  <div className="text-right">

                    <span
                      className="
                                                bg-green-100
                                                text-green-600
                                                px-3
                                                py-1
                                                rounded-full
                                                text-sm
                                                font-medium
                                            "
                    >
                      {
                        item.status
                      }
                    </span>

                    <p className="text-slate-400 text-sm mt-2">
                      {new Date(
                        item.created_at
                      ).toLocaleDateString(
                        "id-ID"
                      )}
                    </p>

                  </div>

                </div>

                {/* PHOTO */}
                {item.payment_photo && (
                  <div className="mt-4">

                    <img
                      src={
                        item.payment_photo
                      }
                      alt="payment"
                      className="
                                                w-28
                                                h-28
                                                rounded-xl
                                                object-cover
                                                border
                                            "
                    />

                  </div>
                )}

                {/* GPS */}
                {item.latitude &&
                  item.longitude && (

                    <a
                      href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
                      target="_blank"
                      className="
                                                text-blue-600
                                                text-sm
                                                mt-3
                                                inline-block
                                            "
                    >
                      📍 Lihat Lokasi
                    </a>
                  )}

              </div>
            )
          )}

        </div>

      </div>
    </main>
  );
}