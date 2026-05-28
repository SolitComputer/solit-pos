import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {

        const { id } = await params;

        const { data, error } = await supabase
            .from("laptop_units")
            .select("*")
            .eq("laptop_id", id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data
        });

    } catch (err) {
        console.error(err);

        return NextResponse.json(
            {
                success: false,
                message: "Gagal mengambil data units"
            },
            { status: 500 }
        );
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {

        const { id } = await params;

        const body = await req.json();

        const {
            serial_number,
            grade,
            condition_note,
            purchase_price,
            selling_price,
            status,
            notes
        } = body;

        const { data, error } = await supabase
            .from("laptop_units")
            .insert({
                laptop_id: id,
                serial_number,
                grade,
                condition_note,
                purchase_price,
                selling_price,
                status,
                notes
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data
        });

    } catch (err) {
        console.error(err);

        return NextResponse.json(
            {
                success: false,
                message: "Gagal menambahkan unit"
            },
            { status: 500 }
        );
    }
}