"use client";

import { useState } from "react";
import { toPng } from "html-to-image";

interface Props {
    customerPhone: string;
    invoiceNumber: string;
    customerName: string;
    laptopName: string;
    serialNumber?: string;
    amount: number;
    paymentMethod: string;
    pickupMethod: string;
    pickupDate?: string;
    pickupTime?: string;
    softwareRequest?: string;
    warrantyEnd?: string;
    warrantyDaysLeft?: number;
    customerType?: string;
}
export default function ReceiptActions({
    customerPhone,
    invoiceNumber,
    customerName,
    laptopName,
    serialNumber,
    amount,
    paymentMethod,
    pickupMethod,
    pickupDate,
    pickupTime,
    softwareRequest,
    warrantyEnd,
    warrantyDaysLeft,
    customerType,
}: Props) {
    const [downloading, setDownloading] = useState(false);
    const [waSent, setWaSent] = useState(false);

    const fmtDate = (d?: string) => {
        if (!d) return null;
        return new Date(d).toLocaleDateString("id-ID", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
    };

    const handleSendWa = () => {
        // Normalisasi nomor CUSTOMER (bukan CS)
        const phone = customerPhone
            ?.replace(/^0/, "62")
            .replace(/\D/g, "");

        const fmtDateStr = fmtDate(pickupDate);
        const warrantyLine = warrantyEnd
            ? ` Berlaku s/d  : ${fmtDate(warrantyEnd)}${warrantyDaysLeft !== undefined && warrantyDaysLeft > 0
                ? ` (${warrantyDaysLeft} hari lagi)`
                : " (Kadaluarsa)"
            }`
            : null;

        const lines = [
            `Halo ${customerName} `,
            ``,
            ` *Pembayaran Berhasil!*`,
            `Terima kasih sudah berbelanja di *Solit 03* `,
            ``,
            `━━━━━━━━━━━━━━━━━━`,
            ` *Detail Transaksi*`,
            `━━━━━━━━━━━━━━━━━━`,
            ` Nota           : ${invoiceNumber}`,
            ` Laptop        : ${laptopName}`,
            serialNumber ? ` Serial No    : ${serialNumber}` : null,
            ` Total           : Rp${amount?.toLocaleString("id-ID")}`,
            ` Pembayaran  : ${paymentMethod}`,
            customerType === "RESELLER" ? ` Tipe             : Reseller` : null,
            customerType === "MITRA" ? ` Tipe             : Mitra Bisnis` : null,
            ``,
            `━━━━━━━━━━━━━━━━━━`,
            ` *Info Pengambilan*`,
            `━━━━━━━━━━━━━━━━━━`,
            ` Metode       : ${pickupMethod === "DATANG" ? "Datang ke Toko" : "Diantar"}`,
            fmtDateStr ? ` Tanggal     : ${fmtDateStr}` : null,
            pickupTime ? ` Jam             : ${pickupTime}` : null,
            softwareRequest ? ` Software    : ${softwareRequest}` : null,
            ``,
            `━━━━━━━━━━━━━━━━━━`,
            ` *Garansi Laptop*`,
            `━━━━━━━━━━━━━━━━━━`,
            warrantyLine,
            ``,
            ` Cek garansi online:`,
            ` https://solit03.com/cek-garansi`,
            serialNumber ? `Masukkan SN: *${serialNumber}*` : null,
            ``,
            `Terima kasih sudah berbelanja di *Solit 03* `,
            `_Sawangan, Depok_`,
        ]
            .filter((l) => l !== null)
            .join("\n");

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines)}`;
        window.open(url, "_blank");
        setWaSent(true);
        setTimeout(() => setWaSent(false), 5000);
    };

    const handleDownload = async () => {
        const card = document.getElementById("receipt-card");
        if (!card) {
            alert("Elemen struk tidak ditemukan");
            return;
        }

        setDownloading(true);
        try {
            window.scrollTo(0, 0);

            const dataUrl = await toPng(card, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: "#ffffff",
                filter: (node) => {
                    if (node instanceof HTMLElement) {
                        return !node.classList.contains("no-capture");
                    }
                    return true;
                },
            });

            const link = document.createElement("a");
            link.download = `struk-${invoiceNumber}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error("Screenshot error:", err);
            alert("Gagal membuat screenshot. Silakan screenshot manual.");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="space-y-3">
            {/* Kirim WA — teks */}
            <button
                onClick={handleSendWa}
                disabled={waSent}
                className={`flex items-center justify-center gap-2.5 w-full rounded-2xl py-3.5 font-semibold text-sm transition active:scale-[0.98] disabled:opacity-70 ${waSent
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-[#25D366] hover:bg-[#20bd5a] text-white"
                    }`}
            >
                {waSent ? (
                    <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        WA Dibuka 
                    </>
                ) : (
                    <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        Kirim Struk ke WhatsApp
                    </>
                )}
            </button>

            {/* Download Screenshot */}
            <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center justify-center gap-2 w-full bg-white border border-gray-200 text-gray-700 rounded-2xl py-3 font-medium text-sm hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-50"
            >
                {downloading ? (
                    <>
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        Membuat gambar...
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Struk (PNG)
                    </>
                )}
            </button>
        </div>
    );
}