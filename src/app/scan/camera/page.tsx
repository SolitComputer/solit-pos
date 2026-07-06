"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useRouter } from "next/navigation";

export default function CameraScanPage() {
    const router = useRouter();
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const [decoded, setDecoded] = useState("");        // teks mentah hasil decode
    const [loading, setLoading] = useState(false);
    const [debug, setDebug] = useState<string | null>(null); // diagnostik di layar

    useEffect(() => {
        startScanner();
        return () => {
            stopScanner();
        };
    }, []);

    const startScanner = async () => {
        try {
            const scanner = new Html5Qrcode("reader");
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 120 } },
                async (decodedText) => {
                    setDecoded(decodedText);
                    await stopScanner();
                    handleSearch(decodedText);
                },
                () => { }
            );
        } catch (err) {
            console.error(err);
            setDebug("Gagal membuka kamera: " + String(err));
        }
    };

    const stopScanner = async () => {
        try {
            if (scannerRef.current && scannerRef.current.isScanning) {
                await scannerRef.current.stop();
            }
        } catch { }
    };

    const handleSearch = async (raw: string) => {
        const sn = raw.trim();
        setLoading(true);
        setDebug(null);

        try {
            const url = `/api/units/check-sn?sn=${encodeURIComponent(sn)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data.success) {
                setDebug(
                    `❌ API GAGAL (HTTP ${res.status})\n` +
                    `SN dikirim: "${sn}"\n` +
                    `Pesan: ${data.message || "-"}`
                );
                setLoading(false);
                return;
            }

            // Sukses — tampilkan type dulu biar keliatan LAPTOP vs ACCESSORY
            setDebug(`✅ KETEMU — type = ${data.data?.type ?? "(kosong!)"} → redirect...`);
            router.push(`/scan/${encodeURIComponent(sn)}`);
        } catch (e) {
            setDebug("❌ Gagal fetch API: " + String(e));
            setLoading(false);
        }
    };

    const rescan = () => {
        setDecoded("");
        setDebug(null);
        setLoading(false);
        startScanner();
    };

    return (
        <main className="min-h-screen bg-black text-white">
            <div className="p-4 border-b border-white/10">
                <h1 className="text-lg font-bold">Camera Barcode Scanner</h1>
                <p className="text-sm text-white/60 mt-1">Arahkan kamera ke barcode</p>
            </div>

            <div className="p-4">
                <div id="reader" className="overflow-hidden rounded-2xl" />

                {loading && (
                    <div className="mt-4 text-sm text-white/70">Mencari data...</div>
                )}

                {decoded && (
                    <div className="mt-4 text-sm">
                        Hasil decode:{" "}
                        <span className="font-mono text-emerald-400">{decoded}</span>
                    </div>
                )}

                {debug && (
                    <pre className="mt-3 text-xs whitespace-pre-wrap bg-white/5 border border-white/10 rounded-lg p-3 font-mono text-white/80">
                        {debug}
                    </pre>
                )}

                {(debug || decoded) && (
                    <button
                        onClick={rescan}
                        className="mt-4 w-full h-11 rounded-xl bg-white/10 border border-white/15 text-sm font-semibold"
                    >
                        🔄 Scan Ulang
                    </button>
                )}
            </div>
        </main>
    );
}