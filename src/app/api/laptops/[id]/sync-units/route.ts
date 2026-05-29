// C:\solit-pos\src\app\api\laptops\[id]\sync-units\route.ts
//
// POST /api/laptops/:id/sync-units
// Dipanggil dari units page setiap kali unit di-add/edit/delete.
// Update qty (jumlah SIAP_JUAL) dan status pada tabel laptops.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";

interface Props {
    params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
    try {
        const { id }       = await params;
        const { qty, status } = await req.json();

        const { data, error } = await supabase
            .from("laptops")
            .update({
                qty:          Number(qty),
                status:       status,
                ready_to_sell: Number(qty) > 0,
            })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ success: false, message: "Gagal sync units" }, { status: 500 });
    }
}