import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { getAttendanceScope } from "@/lib/attendanceScope";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { user_id, off_date, work_date, note } = body;

        if (!user_id || !off_date || !work_date) {
            return NextResponse.json(
                { success: false, message: "user_id, off_date, dan work_date wajib diisi" },
                { status: 400 }
            );
        }

        if (off_date === work_date) {
            return NextResponse.json(
                { success: false, message: "Tanggal libur dan tanggal masuk tidak boleh sama" },
                { status: 400 }
            );
        }

        // Izin: full access → semua | kepala divisi → hanya bawahannya
        const scope = await getAttendanceScope(supabase, user);
        const allowed = scope.all || scope.manageableIds.includes(user_id);
        if (!allowed) {
            return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
        }

        const [offResult, workResult] = await Promise.all([
            supabase
                .from("user_date_off")
                .upsert(
                    { user_id, off_date, note: note || "Tukar libur", created_by: user.id },
                    { onConflict: "user_id,off_date" }
                )
                .select("id, user_id, off_date")
                .single(),

            supabase
                .from("user_date_work")
                .upsert(
                    { user_id, work_date, note: note || "Tukar libur", created_by: user.id },
                    { onConflict: "user_id,work_date" }
                )
                .select("id, user_id, work_date")
                .single(),
        ]);

        if (offResult.error) {
            console.error("[swap-dayoff] offResult error:", JSON.stringify(offResult.error));
            return NextResponse.json({
                success: false,
                message: offResult.error.message,
                detail: offResult.error.details,
                hint: offResult.error.hint,
            }, { status: 500 });
        }
        if (workResult.error) {
            console.error("[swap-dayoff] workResult error:", JSON.stringify(workResult.error));
            return NextResponse.json({
                success: false,
                message: workResult.error.message,
                detail: workResult.error.details,
                hint: workResult.error.hint,
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: { off: offResult.data, work: workResult.data },
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const user_id = searchParams.get("user_id");
        const off_date = searchParams.get("off_date");
        const work_date = searchParams.get("work_date");

        if (!user_id || !off_date || !work_date) {
            return NextResponse.json(
                { success: false, message: "user_id, off_date, work_date wajib diisi" },
                { status: 400 }
            );
        }

        const scope = await getAttendanceScope(supabase, user);
        const allowed = scope.all || scope.manageableIds.includes(user_id);
        if (!allowed) {
            return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
        }

        await Promise.all([
            supabase.from("user_date_off").delete().eq("user_id", user_id).eq("off_date", off_date),
            supabase.from("user_date_work").delete().eq("user_id", user_id).eq("work_date", work_date),
        ]);

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}