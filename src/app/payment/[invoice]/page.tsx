"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";

declare global {
  interface Window {
    snap: any;
  }
}

export default function Page() {
  const params = useParams();
  const invoice = params.invoice;
  const [status, setStatus] = useState("PENDING");

  useEffect(() => {
    const interval = setInterval(async () => {
      const response = await fetch(`/api/transaction/${invoice}`);
      const result = await response.json();
      if (!result.success) return;
      const data = result.data;
      setStatus(data.status);

      if (data.payment_token && window.snap && data.status === "PENDING") {
        window.snap.pay(data.payment_token);
      }

      if (data.status === "PAID") {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [invoice]);

  const Content = () => (
    <div className="max-w-lg mx-auto mt-10">
      {status === "PAID" ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Pembayaran Berhasil!</h1>
          <p className="text-gray-500 mt-2">Terima kasih, transaksi Anda telah lunas.</p>
          <p className="text-sm text-gray-400 mt-1">Invoice: {invoice}</p>
          <a
            href="/dashboard"
            className="inline-block mt-6 bg-white text-gray-700 border border-gray-200 rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-50 transition shadow-sm"
          >
            Kembali ke Dashboard
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Menunggu Pembayaran</h1>
          <p className="text-gray-500 mt-2">Silakan scan QRIS atau selesaikan pembayaran Anda.</p>
          <p className="text-sm text-gray-400 mt-1">Invoice: {invoice}</p>
          <div className="mt-6 text-xs text-gray-400">Halaman akan otomatis berubah setelah pembayaran sukses.</div>
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <Content />
    </DashboardLayout>
  );
}