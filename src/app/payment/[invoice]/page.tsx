"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

declare global {
  interface Window {
    snap: any;
  }
}

export default function Page() {
  const params =
    useParams();

  const invoice =
    params.invoice;

  const [status, setStatus] =
    useState("PENDING");

  useEffect(() => {
    const interval =
      setInterval(
        async () => {
          const response =
            await fetch(
              `/api/transaction/${invoice}`
            );

          const result =
            await response.json();

          if (
            !result.success
          )
            return;

          const data =
            result.data;

          setStatus(
            data.status
          );

          // OPEN SNAP
          if (
            data.payment_token &&
            window.snap &&
            data.status ===
            "PENDING"
          ) {
            window.snap.pay(
              data.payment_token
            );
          }

          // AUTO STOP
          if (
            data.status ===
            "PAID"
          ) {
            clearInterval(
              interval
            );
          }
        },
        3000
      );

    return () =>
      clearInterval(
        interval
      );
  }, [invoice]);

  if (
    status === "PAID"
  ) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-green-50 p-5">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md w-full">
          <h1 className="text-4xl font-bold text-green-600">
            LUNAS
          </h1>

          <p className="mt-3 text-slate-600">
            Pembayaran berhasil
          </p>

          <p className="text-sm text-slate-400 mt-2">
            Invoice:
            {invoice}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-3xl shadow-xl text-center">
        <h1 className="text-2xl font-bold">
          Menunggu
          Pembayaran
        </h1>

        <p className="text-slate-500 mt-2">
          Silakan scan
          QRIS
        </p>
      </div>
    </main>
  );
}