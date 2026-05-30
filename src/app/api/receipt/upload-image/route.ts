import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const invoice = formData.get("invoice") as string;

        if (!file || !invoice) {
            return NextResponse.json({ error: "Missing file or invoice" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fileName = `receipts/${invoice}.jpg`;

        const { error } = await supabase.storage
            .from("payment-proof")
            .upload(fileName, buffer, {
                contentType: "image/jpeg",
                upsert: true, 
            });

        if (error) {
            console.error("Upload error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const { data: urlData } = supabase.storage
            .from("payment-proof")
            .getPublicUrl(fileName);

        return NextResponse.json({ url: urlData.publicUrl });
    } catch (err) {
        console.error("upload-image error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}