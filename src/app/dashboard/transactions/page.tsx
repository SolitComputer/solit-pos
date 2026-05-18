"use client";

import {
  useEffect,
  useState,
} from "react";

export default function Page() {

  const [
    transactions,
    setTransactions,
  ] =
    useState<
      any[]
    >([]);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    status,
    setStatus,
  ] =
    useState("ALL");

  useEffect(() => {
    fetchTransactions();
  }, [
    search,
    status,
  ]);

  const fetchTransactions =
    async () => {

      const response =
        await fetch(
          `/api/transaction?search=${search}&status=${status}`
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

        <div className="flex justify-between items-center mb-6">

          <h1 className="text-3xl font-bold">
            Riwayat Transaksi
          </h1>

          <a
            href="/dashboard"
            className="bg-black text-white px-5 py-3 rounded-2xl"
          >
            Dashboard
          </a>
        </div>

        {/* FILTER */}
        <div className="bg-white rounded-3xl p-5 shadow-md mb-5">

          <div className="grid md:grid-cols-2 gap-4">

            <input
              type="text"
              placeholder="Cari invoice / customer / WA / laptop"
              className="border rounded-2xl h-12 px-4"
              value={
                search
              }
              onChange={(
                e
              ) =>
                setSearch(
                  e.target
                    .value
                )
              }
            />

            <select
              className="border rounded-2xl h-12 px-4"
              value={
                status
              }
              onChange={(
                e
              ) =>
                setStatus(
                  e.target
                    .value
                )
              }
            >
              <option value="ALL">
                Semua
              </option>

              <option value="PAID">
                Paid
              </option>

              <option value="PENDING">
                Pending
              </option>

              <option value="FAILED">
                Failed
              </option>
            </select>
          </div>
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-3xl shadow-md overflow-hidden">

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead className="bg-slate-100">

                <tr className="text-left">

                  <th className="p-4">
                    Invoice
                  </th>

                  <th className="p-4">
                    Customer
                  </th>

                  <th className="p-4">
                    Laptop
                  </th>

                  <th className="p-4">
                    WA
                  </th>

                  <th className="p-4">
                    Total
                  </th>

                  <th className="p-4">
                    Status
                  </th>

                  <th className="p-4">
                    Tanggal
                  </th>

                  <th className="p-4">
                    Action
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
                      className="border-t"
                    >
                      <td className="p-4 font-semibold">
                        {
                          item.invoice_number
                        }
                      </td>

                      <td className="p-4">
                        {
                          item.customer_name
                        }
                      </td>

                      <td className="p-4">
                        {
                          item.laptop_name
                        }
                      </td>

                      <td className="p-4">
                        {
                          item.customer_phone
                        }
                      </td>

                      <td className="p-4 font-semibold">
                        Rp
                        {item.amount?.toLocaleString(
                          "id-ID"
                        )}
                      </td>

                      <td className="p-4">

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

                      </td>

                      <td className="p-4 text-sm text-slate-500">
                        {new Date(
                          item.created_at
                        ).toLocaleDateString(
                          "id-ID"
                        )}
                      </td>

                      <td className="p-4">

                        <a
                          href={`/receipt/${item.invoice_number}`}
                          target="_blank"
                          className="bg-black text-white px-4 py-2 rounded-xl"
                        >
                          Lihat
                        </a>

                      </td>
                    </tr>
                  )
                )}

              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}