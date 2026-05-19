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

            <div className="space-y-5">

              {transactions?.map(
                (item) => (

                  <div
                    key={item.id}
                    className="
          bg-white
          rounded-3xl
          shadow-md
          p-5
          border
        "
                  >

                    {/* HEADER */}
                    <div className="flex justify-between items-start">

                      <div>

                        <h2 className="font-bold text-lg">
                          {
                            item.customer_name
                          }
                        </h2>

                        <p className="text-sm text-slate-500">
                          {
                            item.customer_phone
                          }
                        </p>

                        <p className="text-sm text-slate-400">
                          {
                            item.invoice_number
                          }
                        </p>

                      </div>

                      <span
                        className={`
              px-4 py-2 rounded-full text-sm font-semibold
              ${item.status ===
                            "PAID"
                            ? "bg-green-100 text-green-600"
                            : "bg-red-100 text-red-600"
                          }
            `}
                      >
                        {item.status}
                      </span>

                    </div>

                    {/* LAPTOP */}
                    <div className="mt-5 grid md:grid-cols-2 gap-4">

                      <div>

                        <h3 className="font-semibold mb-2">
                          Laptop
                        </h3>

                        <p>
                          {
                            item.laptop_name
                          }
                        </p>

                        <p className="text-sm text-slate-500">
                          SN:
                          {" "}
                          {
                            item.serial_number
                          }
                        </p>

                        <p className="text-sm text-slate-500">
                          Software:
                          {" "}
                          {
                            item.software_request ||
                            "-"
                          }
                        </p>

                      </div>

                      <div>

                        <h3 className="font-semibold mb-2">
                          Payment
                        </h3>

                        <p>
                          Method:
                          {" "}
                          {
                            item.payment_method
                          }
                        </p>

                        <p>
                          Harga Inventory:
                          {" "}
                          <span className="font-semibold">
                            Rp
                            {(item.inventory_price || 0)
                              .toLocaleString(
                                "id-ID"
                              )}
                          </span>
                        </p>

                        <p>
                          Harga Deal:
                          {" "}
                          <span className="font-semibold">
                            Rp
                            {(item.deal_price || item.amount)
                              .toLocaleString(
                                "id-ID"
                              )}
                          </span>
                        </p>

                        <p className="text-green-600 font-semibold">
                          Profit:
                          {" "}
                          +
                          Rp
                          {(item.other || 0)
                            .toLocaleString(
                              "id-ID"
                            )}
                        </p>

                      </div>

                    </div>

                    {/* PICKUP */}
                    <div className="mt-5 grid md:grid-cols-3 gap-4 text-sm">

                      <div>
                        <p className="font-semibold">
                          Pickup
                        </p>

                        <p>
                          {
                            item.pickup_method
                          }
                        </p>
                      </div>

                      <div>
                        <p className="font-semibold">
                          Jadwal
                        </p>

                        <p>
                          {
                            item.pickup_date
                          }
                          {" "}
                          {
                            item.pickup_time
                          }
                        </p>
                      </div>

                      <div>
                        <p className="font-semibold">
                          Source
                        </p>

                        <p>
                          {
                            item.source_platform
                          }
                        </p>
                      </div>

                    </div>

                    {/* NOTES */}
                    {item.notes && (
                      <div className="mt-5">

                        <p className="font-semibold">
                          Notes
                        </p>

                        <p className="text-slate-600">
                          {
                            item.notes
                          }
                        </p>

                      </div>
                    )}

                    {/* PHOTO + GPS */}
                    <div className="mt-5 flex gap-4 flex-wrap">

                      {item.payment_photo && (

                        <div>

                          <p className="font-semibold text-sm mb-2">
                            Bukti Pembayaran
                          </p>

                          <img
                            src={
                              item.payment_photo
                            }
                            alt="payment"
                            className="
                  w-32
                  h-32
                  rounded-2xl
                  object-cover
                  border
                "
                          />

                        </div>
                      )}

                      {item.latitude &&
                        item.longitude && (

                          <div>

                            <p className="font-semibold text-sm mb-2">
                              GPS
                            </p>

                            <a
                              href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
                              target="_blank"
                              className="
                    bg-blue-600
                    text-white
                    px-4
                    py-2
                    rounded-xl
                    inline-block
                  "
                            >
                              Lihat Lokasi
                            </a>

                          </div>
                        )}

                    </div>

                    {/* FOOTER */}
                    <div className="mt-5 pt-4 border-t flex justify-between items-center">

                      <p className="text-sm text-slate-500">
                        {new Date(
                          item.created_at
                        ).toLocaleString(
                          "id-ID"
                        )}
                      </p>

                      <a
                        href={`/receipt/${item.invoice_number}`}
                        className="
              bg-black
              text-white
              px-4
              py-2
              rounded-xl
            "
                      >
                        Receipt
                      </a>

                    </div>

                  </div>
                )
              )}

            </div>
          </div>
        </div>
      </div>
    </main>
  );
}