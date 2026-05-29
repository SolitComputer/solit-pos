"use client";

import { useEffect, useState } from "react";
import QuickScan from "@/components/ui/QuickScan";
import Link from "next/link";

interface User {
    id: string;
    name: string;
    role: string;
}

export default function ScanPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchUser = async () => {
        try {
            const res = await fetch("/api/auth/me");
            const result = await res.json();

            if (result?.user) {
                setUser(result.user);
            } else {
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-sm text-gray-500">
                    Memuat scanner...
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-2xl mx-auto space-y-4">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-[#1a1a2e]">
                        Quick Barcode Scanner
                    </h1>

                    <p className="text-sm text-gray-500 mt-1">
                        Scan barcode atau serial number untuk melihat data unit
                    </p>
                </div>

                {/* Scanner */}
                <QuickScan user={user} />

                <Link
                    href="/scan/camera"
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#1a1a2e] text-white text-sm font-medium"
                >
                    Buka Kamera Scanner
                </Link>

            </div>
        </main>
    );
}