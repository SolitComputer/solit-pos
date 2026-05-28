import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";

export async function PUT(
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

        // Cek duplicate SN
        if (serial_number) {

            const { data: existing } = await supabase
                .from("laptop_units")
                .select("id")
                .eq("serial_number", serial_number)
                .neq("id", id)
                .single();

            if (existing) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Serial number "${serial_number}" sudah dipakai`
                    },
                    { status: 409 }
                );
            }
        }

        const { data, error } = await supabase
            .from("laptop_units")
            .update({
                ...(serial_number !== undefined && { serial_number }),
                ...(grade !== undefined && { grade }),
                ...(condition_note !== undefined && { condition_note }),
                ...(purchase_price !== undefined && {
                    purchase_price: Number(purchase_price)
                }),
                ...(selling_price !== undefined && {
                    selling_price: Number(selling_price)
                }),
                ...(status !== undefined && { status }),
                ...(notes !== undefined && { notes }),
            })
            .eq("id", id)
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
                message: "Gagal update unit"
            },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {

        const { id } = await params;

        const { error } = await supabase
            .from("laptop_units")
            .delete()
            .eq("id", id);

        if (error) throw error;

        return NextResponse.json({
            success: true
        });

    } catch (err) {

        console.error(err);

        return NextResponse.json(
            {
                success: false,
                message: "Gagal hapus unit"
            },
            { status: 500 }
        );
    }
}