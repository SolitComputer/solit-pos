"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useRouter } from "next/navigation";

export default function CameraScanPage() {
    const router = useRouter();
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const [decoded, setDecoded] = useState("");        // teks mentah hasil decode
    const [loading, setLoading] = useState(false);
    const [debug, setDebug] = useState<string | null>(null); // diagnostik di layar
    const [torchOn, setTorchOn] = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);

    useEffect(() => {
        startScanner();
        return () => {
            stopScanner();
        };
    }, []);

    const startScanner = async () => {
        try {
            const scanner = new Html5Qrcode("reader", {
                // Pakai BarcodeDetector native browser — jauh lebih akurat baca
                // barcode 1D (Code128/Code39) dibanding decoder JS bawaan.
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                // WAJIB daftarkan format 1D. SN aksesoris dicetak sebagai
                // barcode garis (Code128), bukan QR seperti laptop.
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.ITF,
                    Html5QrcodeSupportedFormats.CODABAR,
                ],
                verbose: false,
            });
            scannerRef.current = scanner;

            await scanner.start(
                // Argumen pertama HARUS objek 1-key (aturan html5-qrcode).
                // Resolusi tinggi dipindah ke videoConstraints di argumen config
                // bawah — di sinilah width/height yang benar diterima.
                { facingMode: "environment" },
                {
                    // Resolusi tinggi diminta DI SINI (videoConstraints) — makin
                    // banyak piksel, makin terbaca bar yang tipis. HP ambil yang
                    // terdekat yang didukung. facingMode diulang di sini karena
                    // videoConstraints menggantikan argumen pertama saat diisi.
                    videoConstraints: {
                        facingMode: "environment",
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    // FPS lebih tinggi = lebih banyak frame dianalisa per detik,
                    // jadi barcode tipis/panjang lebih cepat "kekunci" saat tangan
                    // sedikit goyang. 10 → 15 masih ringan di HP modern.
                    fps: 15,
                    // Kotak scan dilebarkan (maks 400px) & dipendekkan tingginya.
                    // Barcode 1D itu LEBAR tapi PENDEK — kotak yang lebih lebar &
                    // tipis bikin barcode panjang seperti "HDD-750GB-890" muat
                    // penuh tanpa terpotong, dan rasio tinggi 0.4 mengurangi area
                    // noise di atas/bawah yang bikin decoder bingung.
                    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                        const width = Math.min(viewfinderWidth - 32, 400);
                        const height = Math.min(
                            Math.max(110, Math.floor(width * 0.4)),
                            viewfinderHeight - 32
                        );
                        return { width, height };
                    },
                    // 1.777 (16:9) memberi frame lebih lebar daripada 1:1 — cocok
                    // untuk barcode garis yang memanjang horizontal.
                    aspectRatio: 1.777,
                },
                async (decodedText) => {
                    // Bersihkan karakter kontrol + AIM prefix (]C1 dll) di titik
                    // decode juga, supaya SN yang DITAMPILKAN di layar juga sudah
                    // bersih (bukan cuma yang dikirim ke API).
                    const clean = decodedText
                        .replace(/[\u0000-\u001F\u007F]/g, "")
                        .replace(/^\][A-Za-z]\d/, "")
                        .trim();
                    setDecoded(clean);
                    await stopScanner();
                    handleSearch(clean);
                },
                // Callback error per-frame SENGAJA dikosongkan: html5-qrcode
                // memanggil ini tiap frame yang gagal decode (normal). Kalau diisi
                // setDebug, layar akan spam error padahal cuma "belum ketemu".
                () => { }
            );

            // Cek apakah kamera HP ini punya torch (senter). Kalau ada, tombolnya
            // dimunculkan. Tidak semua browser/HP mendukung, jadi dibungkus try.
            try {
                const track = scanner.getRunningTrackCameraCapabilities?.();
                if (track && (track as any).torchFeature?.().isSupported?.()) {
                    setTorchSupported(true);
                }
            } catch { /* torch tidak didukung — abaikan */ }
        } catch (err) {
            console.error(err);
            setDebug("Gagal membuka kamera: " + String(err));
        }
    };

    const toggleTorch = async () => {
        try {
            const track = scannerRef.current?.getRunningTrackCameraCapabilities?.();
            const torch = (track as any)?.torchFeature?.();
            if (torch?.isSupported?.()) {
                await torch.apply(!torchOn);
                setTorchOn(v => !v);
            }
        } catch { /* gagal nyalakan torch — abaikan */ }
    };

    const stopScanner = async () => {
        try {
            if (scannerRef.current && scannerRef.current.isScanning) {
                await scannerRef.current.stop();
            }
        } catch { }
    };

    const handleSearch = async (raw: string) => {
        // Buang karakter kontrol/non-printable (mis. Enter dari scanner) lalu trim.
        let sn = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
        // ✅ Buang AIM symbology identifier yang ditambahkan BarcodeDetector di
        // depan hasil: ]C1 (Code128), ]C0, ]C2, ]A0 (Code39), ]Q0 (QR), ]E0 (EAN),
        // dll. Pola: ] + 1 huruf + 1 digit. Tanpa ini, SN "MPC-WW" terkirim jadi
        // "]C1MPC-WW" → API 404. Inilah akar kegagalan scan kamera.
        sn = sn.replace(/^\][A-Za-z]\d/, "").trim();
        setLoading(true);
        setDebug(null);

        try {
            const url = `/api/units/check-sn?sn=${encodeURIComponent(sn)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data.success) {
                setDebug(
                    ` API GAGAL (HTTP ${res.status})\n` +
                    `SN dikirim: "${sn}"\n` +
                    `Pesan: ${data.message || "-"}`
                );
                setLoading(false);
                return;
            }

            // Sukses — tampilkan type dulu biar keliatan LAPTOP vs ACCESSORY
            setDebug(` KETEMU — type = ${data.data?.type ?? "(kosong!)"} → redirect...`);
            router.push(`/scan/${encodeURIComponent(sn)}`);
        } catch (e) {
            setDebug(" Gagal fetch API: " + String(e));
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
                         Scan Ulang
                    </button>
                )}
            </div>
        </main>
    );
}