"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useRouter } from "next/navigation";

export default function CameraScanPage() {
    const router = useRouter();

    const scannerRef = useRef<Html5Qrcode | null>(null);

    const [result, setResult] = useState("");
    const [loading, setLoading] = useState(false);

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
                {
                    facingMode: "environment",
                },
                {
                    fps: 10,
                    qrbox: {
                        width: 250,
                        height: 120,
                    },
                },
                async (decodedText) => {
                    setResult(decodedText);

                    await stopScanner();

                    handleSearch(decodedText);
                },
                () => { }
            );
        } catch (err) {
            console.error(err);
        }
    };

    const stopScanner = async () => {
        try {
            if (
                scannerRef.current &&
                scannerRef.current.isScanning
            ) {
                await scannerRef.current.stop();
            }
        } catch { }
    };

    const handleSearch = async (sn: string) => {
        try {
            setLoading(true);

            const res = await fetch(
                `/api/units/check-sn?sn=${encodeURIComponent(sn)}`
            );

            const data = await res.json();

            if (!data.success) {
                alert("Unit tidak ditemukan");
                return;
            }

            router.push(
                `/dashboard/laptops/${data.data.laptop.id}`
            );
        } catch {
            alert("Gagal scan");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-black text-white">
            <div className="p-4 border-b border-white/10">
                <h1 className="text-lg font-bold">
                    Camera Barcode Scanner
                </h1>

                <p className="text-sm text-white/60 mt-1">
                    Arahkan kamera ke barcode
                </p>
            </div>

            <div className="p-4">
                <div
                    id="reader"
                    className="overflow-hidden rounded-2xl"
                />

                {loading && (
                    <div className="mt-4 text-sm text-white/70">
                        Mencari data...
                    </div>
                )}

                {result && (
                    <div className="mt-4 text-sm">
                        Hasil:{" "}
                        <span className="font-mono">
                            {result}
                        </span>
                    </div>
                )}
            </div>
        </main>
    );
}