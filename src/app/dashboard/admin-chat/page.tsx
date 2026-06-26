// src/app/dashboard/admin-chat/page.tsx
"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { AdminChatMonitor } from "@/components/ui/AdminChatMonitor";

export default function AdminChatPage() {
    return (
        <DashboardLayout>
            <div className="p-6 max-w-3xl mx-auto">
                <div className="mb-5">
                    <h1 className="text-2xl font-black text-gray-900">Monitor Chat</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Pantau semua percakapan antar karyawan · Hanya Admin & Programmer
                    </p>
                </div>
                <AdminChatMonitor />
            </div>
        </DashboardLayout>
    );
}