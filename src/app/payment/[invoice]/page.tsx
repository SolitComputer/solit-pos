"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    const fetchInvoice =
      async () => {
        try {
          const response =
            await fetch(
              `/api/transaction/${invoice}`
            );

          const result =
            await response.json();

          if (
            !result.success
          ) {
            console.log(
              result.message
            );

            return;
          }

          const data =
            result.data;

          console.log(data);

          if (
            data.payment_token &&
            window.snap
          ) {
            window.snap.pay(
              data.payment_token
            );
          }
        } catch (error) {
          console.error(error);
        }
      };

    fetchInvoice();
  }, [invoice]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-center">
          Memuat QRIS...
        </h1>

        <p className="text-slate-500 mt-2 text-center">
          Tunggu sebentar
        </p>
      </div>
    </main>
  );
}