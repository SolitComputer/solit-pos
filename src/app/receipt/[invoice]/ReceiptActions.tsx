"use client";

import { useState } from "react";
import domtoimage from "dom-to-image-more";

interface Props {
    customerPhone: string;
    invoiceNumber: string;
}

export default function ReceiptActions({ customerPhone, invoiceNumber }: Props) {
    const [generating, setGenerating] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [sendingWa, setSendingWa] = useState(false);
    const [sent, setSent] = useState(false);

    // ── Helper: render card ke Blob JPEG ─────────────────────────────────────
    const renderToBlob = async (): Promise<Blob | null> => {
        const card = document.getElementById("receipt-card");
        if (!card) { alert("Struk tidak ditemukan"); return null; }

        const scale = 2;
        const width = card.offsetWidth;
        const height = card.offsetHeight;

        try {
            const blob = await domtoimage.toBlob(card, {
                width: width * scale,
                height: height * scale,
                quality: 0.92,
                bgcolor: "#ffffff",
                style: {
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    width: `${width}px`,
                    height: `${height}px`,
                },
            });
            return blob;
        } catch (err) {
            console.error("dom-to-image error:", err);
            throw err;
        }
    };

    // ── Generate gambar + upload ke Supabase ──────────────────────────────────
    const generateImage = async (): Promise<string | null> => {
        setGenerating(true);
        try {
            const blob = await renderToBlob();
            if (!blob) return null;

            const formData = new FormData();
            formData.append("file", blob, `receipt-${invoiceNumber}.jpg`);
            formData.append("invoice", invoiceNumber);

            const res = await fetch("/api/receipt/upload-image", {
                method: "POST",
                body: formData,
            });
            const result = await res.json();

            if (result.url) {
                setImageUrl(result.url);
                return result.url;
            }
            return null;
        } catch (err) {
            console.error("generateImage error:", err);
            alert("Gagal buat gambar struk. Coba download manual.");
            return null;
        } finally {
            setGenerating(false);
        }
    };

    // ── Download JPG langsung ke device ───────────────────────────────────────
    const handleDownload = async () => {
        setGenerating(true);
        try {
            const blob = await renderToBlob();
            if (!blob) return;

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.download = `struk-${invoiceNumber}.jpg`;
            link.href = url;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            alert("Gagal download. Coba screenshot manual.");
        } finally {
            setGenerating(false);
        }
    };

    // ── Kirim gambar ke WA via Fonnte ─────────────────────────────────────────
    const handleSendWa = async () => {
        setSendingWa(true);
        try {
            const url = imageUrl || await generateImage();
            if (!url) {
                alert("Gagal generate gambar struk");
                return;
            }

            const res = await fetch("/api/receipt/send-wa-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: customerPhone,
                    imageUrl: url,
                    invoice: invoiceNumber,
                }),
            });
            const result = await res.json();
            if (result.success) {
                setSent(true);
            } else {
                alert("Gagal kirim WA: " + (result.message || "Unknown error"));
            }
        } finally {
            setSendingWa(false);
        }
    };

    return (
        <div className="space-y-3">
            {/* Kirim struk gambar ke WA */}
            <button
                onClick={handleSendWa}
                disabled={sendingWa || generating || sent}
                className={`flex items-center justify-center gap-2.5 w-full rounded-2xl h-13 py-3.5 font-semibold text-sm transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                    sent
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : "bg-[#25D366] hover:bg-[#20bd5a] text-white"
                }`}
            >
                {sent ? (
                    <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Struk Terkirim ke WA ✓
                    </>
                ) : sendingWa || generating ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        {generating ? "Membuat gambar..." : "Mengirim ke WA..."}
                    </>
                ) : (
                    <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        Kirim Struk Gambar ke WA
                    </>
                )}
            </button>

            {/* Download JPG */}
            <button
                onClick={handleDownload}
                disabled={generating}
                className="flex items-center justify-center gap-2 w-full bg-white border border-gray-200 text-gray-700 rounded-2xl py-3 font-medium text-sm hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-50"
            >
                {generating ? (
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                )}
                Download Struk JPG
            </button>

            {/* Preview link */}
            {imageUrl && (
                <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-xs text-blue-500 hover:text-blue-700 transition underline"
                >
                    Lihat gambar struk →
                </a>
            )}
        </div>
    );
}