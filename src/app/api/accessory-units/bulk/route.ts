// src/app/api/accessory-units/bulk/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const ALLOWED_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
];

export const POST = withAuth(async (req: NextRequest) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { success: false, message: "Body tidak valid" },
            { status: 400 }
        );
    }

    const { accessory_id, units } = body as {
        accessory_id?: string;
        units?: Array<{
            serial_number: string;
            condition?: string;
            status?: string;
            buy_price?: number;
            selling_price?: number;
            notes?: string;
        }>;
    };

    if (!accessory_id || typeof accessory_id !== "string") {
        return NextResponse.json(
            { success: false, message: "accessory_id wajib diisi" },
            { status: 400 }
        );
    }

    if (!Array.isArray(units) || units.length === 0) {
        return NextResponse.json(
            { success: false, message: "Minimal 1 unit harus dikirim" },
            { status: 400 }
        );
    }

    if (units.length > 500) {
        return NextResponse.json(
            { success: false, message: "Maksimal 500 unit per batch" },
            { status: 400 }
        );
    }

    // Validasi accessory exists
    const { data: accessory, error: accErr } = await supabaseAdmin
        .from("accessories")
        .select("id")
        .eq("id", accessory_id)
        .maybeSingle();

    if (accErr || !accessory) {
        return NextResponse.json(
            { success: false, message: "Aksesori tidak ditemukan" },
            { status: 404 }
        );
    }

    // Cek duplikat SN dalam request
    const snList = units.map((u) => u.serial_number?.trim().toUpperCase()).filter(Boolean);
    const uniqueSNs = new Set(snList);
    if (uniqueSNs.size !== snList.length) {
        return NextResponse.json(
            { success: false, message: "Ada serial number duplikat dalam daftar" },
            { status: 400 }
        );
    }

    // Cek duplikat SN di database (untuk accessory yang sama)
    const { data: existingUnits } = await supabaseAdmin
        .from("accessory_units")
        .select("serial_number")
        .eq("accessory_id", accessory_id)
        .in("serial_number", Array.from(uniqueSNs));

    if (existingUnits && existingUnits.length > 0) {
        const dupes = existingUnits.map((u) => u.serial_number).join(", ");
        return NextResponse.json(
            {
                success: false,
                message: `SN sudah terdaftar: ${dupes}`,
            },
            { status: 400 }
        );
    }

    // Build rows
    const VALID_CONDITIONS = ["BARU", "BEKAS"];
    const VALID_STATUSES = ["TERSEDIA", "RESERVED"];

    const rows = units.map((u) => ({
        accessory_id,
        serial_number: (u.serial_number ?? "").trim().toUpperCase(),
        condition: VALID_CONDITIONS.includes(u.condition ?? "")
            ? u.condition!
            : "BARU",
        status: VALID_STATUSES.includes(u.status ?? "")
            ? u.status!
            : "TERSEDIA",
        buy_price: Math.max(0, Math.round(Number(u.buy_price) || 0)),
        selling_price: Math.max(0, Math.round(Number(u.selling_price) || 0)),
        notes: u.notes?.trim() || null,
    }));

    // Filter out empty SN
    const validRows = rows.filter((r) => r.serial_number.length > 0);
    if (validRows.length === 0) {
        return NextResponse.json(
            { success: false, message: "Tidak ada serial number yang valid" },
            { status: 400 }
        );
    }

    const { data, error } = await supabaseAdmin
        .from("accessory_units")
        .insert(validRows)
        .select();

    if (error) {
        console.error("[POST /api/accessory-units/bulk]", error);
        // ✅ FIX: cek duplikat di atas cuma SELECT-lalu-INSERT (masih race
        // kalau ada import/insert lain jalan bersamaan) — jadi kalaupun lolos
        // sampai sini, unique constraint DB (kalau sudah dipasang) akan
        // menolak dengan error 23505. Ditangani di sini biar pesan errornya
        // jelas, bukan error mentah dari DB.
        const message = error.code === "23505"
            ? "Ada serial number yang baru saja terdaftar oleh proses lain — silakan cek ulang & coba lagi."
            : error.message;
        return NextResponse.json(
            { success: false, message },
            { status: error.code === "23505" ? 409 : 500 }
        );
    }

    return NextResponse.json(
        {
            success: true,
            message: `${data.length} unit berhasil ditambahkan`,
            count: data.length,
        },
        { status: 201 }
    );
}, ALLOWED_ROLES);