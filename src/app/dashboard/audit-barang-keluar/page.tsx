"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import AuditBarangKeluarContent from "./AuditBarangKeluarContent";

export default function AuditBarangKeluarPage() {
    return (
        <DashboardLayout>
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-5">
                <div className="flex items-center gap-3 px-4 sm:px-6 py-4 sm:py-5">
                    <div className="w-10 h-10 sm:w-9 sm:h-9 bg-gray-900 rounded-[10px] flex items-center justify-center flex-shrink-0 shadow-md">
                        <svg
                            className="w-[18px] h-[18px] sm:w-[17px] sm:h-[17px]"
                            viewBox="0 0 24 24" fill="none" stroke="white"
                            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[15px] sm:text-[14.5px] font-bold text-gray-900 tracking-tight leading-tight truncate">
                            Audit Barang Keluar
                        </h1>
                        <p className="text-[11.5px] text-gray-400 mt-1 font-normal truncate">
                            Semua barang keluar — dari Pengambilan Barang &amp; Riwayat Transaksi
                        </p>
                    </div>
                </div>
            </div>

            <AuditBarangKeluarContent />
        </DashboardLayout>
    );
}