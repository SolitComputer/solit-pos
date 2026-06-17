// src/app/api/dashboard/service-stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, PERMISSIONS } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

const SERVICE_DASHBOARD_ROLES = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "TEKNISI", "KEPALA_TEKNISI", "CUSTOMER_SERVICE",
];

function getTodayWIBStart(): string {
    const WIB = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + WIB);
    const dateStr = nowWIB.toISOString().split("T")[0];
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - WIB).toISOString();
}

async function handler(req: NextRequest, _ctx: unknown, user: AuthUser) {
    if (!SERVICE_DASHBOARD_ROLES.includes(user.role)) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const supabase = getAdmin();
    const todayStart = getTodayWIBStart();

    const [
        { data: antrian },
        { data: sedang },
        { data: sparepart },
        { data: done },
        { data: gagal },
        { data: diambilHariIni },
        { data: terlamaAntrian },
        { data: sedangDetail },
        // ✅ Semua order yg pernah dikerjakan (untuk ranking)
        { data: semuaDikerjakan },
        // ✅ Yang selesai hari ini saja (untuk stat harian)
        { data: doneHariIni },
    ] = await Promise.all([
        supabase.from("service_orders").select("id").eq("status", "ANTRIAN"),
        supabase.from("service_orders").select("id").eq("status", "SEDANG_DIKERJAKAN"),
        supabase.from("service_orders").select("id").eq("status", "MENUNGGU_SPAREPART"),
        supabase.from("service_orders").select("id").eq("status", "DONE"),
        supabase.from("service_orders").select("id").eq("status", "GAGAL_DIPERBAIKI"),
        supabase.from("service_orders")
            .select("id, payment_amount")
            .eq("status", "SUDAH_DIAMBIL")
            .gte("tanggal_diambil", todayStart),
        supabase.from("service_orders")
            .select("no_urut, nama, type_laptop, tanggal_masuk")
            .eq("status", "ANTRIAN")
            .order("tanggal_masuk", { ascending: true })
            .limit(3),
        supabase.from("service_orders")
            .select("no_urut, nama, type_laptop, tanggal_masuk, dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(name)")
            .eq("status", "SEDANG_DIKERJAKAN")
            .order("tanggal_masuk", { ascending: true })
            .limit(5),
        // ✅ Semua order yang pernah diselesaikan (all time) untuk ranking total
        supabase.from("service_orders")
            .select("dikerjakan_by, dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(id, name)")
            .in("status", ["DONE", "SUDAH_DIAMBIL", "GAGAL_DIPERBAIKI"])
            .not("dikerjakan_by", "is", null),
        // ✅ Yang selesai hari ini untuk leaderboard harian
        supabase.from("service_orders")
            .select("dikerjakan_by, dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(id, name)")
            .in("status", ["DONE", "SUDAH_DIAMBIL", "GAGAL_DIPERBAIKI"])
            .not("dikerjakan_by", "is", null)
            .gte("tanggal_selesai", todayStart),
    ]);

    const pendapatanHariIni = (diambilHariIni ?? []).reduce(
        (acc, o) => acc + (Number(o.payment_amount) || 0), 0
    );

    const allTimeMap = new Map<string, { id: string; name: string; count: number }>();
    for (const order of semuaDikerjakan ?? []) {
        const raw = order.dikerjakan_by_user;
        const u = Array.isArray(raw) ? raw[0] : raw;
        if (!u?.id || !u?.name) continue;
        const existing = allTimeMap.get(u.id);
        if (existing) existing.count += 1;
        else allTimeMap.set(u.id, { id: u.id, name: u.name, count: 1 });
    }
    const topTeknisiAllTime = Array.from(allTimeMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const todayMap = new Map<string, { id: string; name: string; count: number }>();
    for (const order of doneHariIni ?? []) {
        const raw = order.dikerjakan_by_user;
        const u = Array.isArray(raw) ? raw[0] : raw;
        if (!u?.id || !u?.name) continue;
        const existing = todayMap.get(u.id);
        if (existing) existing.count += 1;
        else todayMap.set(u.id, { id: u.id, name: u.name, count: 1 });
    }
    const topTeknisiHariIni = Array.from(todayMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    return NextResponse.json({
        success: true,
        data: {
            antrian: antrian?.length ?? 0,
            sedangDikerjakan: sedang?.length ?? 0,
            menungguSparepart: sparepart?.length ?? 0,
            done: done?.length ?? 0,
            gagal: gagal?.length ?? 0,
            sudahDiambilHariIni: diambilHariIni?.length ?? 0,
            pendapatanHariIni,
            terlamaAntrian: terlamaAntrian ?? [],
            sedangDetail: sedangDetail ?? [],
            topTeknisiAllTime,   // ✅ ranking semua waktu
            topTeknisiHariIni,   // ✅ ranking hari ini
        },
    });
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);