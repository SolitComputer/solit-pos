import { NextRequest, NextResponse } from "next/server";
import { supabaseVehicles, getRequester } from "@/lib/vehicles";

// GET /api/vehicles/sop — baca SOP (semua role)
export async function GET(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseVehicles
    .from("vehicle_sop")
    .select("id, content, updated_at, updated_by")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ success: true, sop: null });

  let updatedByName: string | null = null;
  if (data.updated_by) {
    const { data: u } = await supabaseVehicles
      .from("users")
      .select("name")
      .eq("id", data.updated_by)
      .maybeSingle();
    updatedByName = u?.name ?? null;
  }

  return NextResponse.json({
    success: true,
    sop: {
      content: data.content ?? "",
      updated_at: data.updated_at,
      updated_by_name: updatedByName,
    },
  });
}

// PUT /api/vehicles/sop — simpan SOP (ADMIN only)
export async function PUT(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!me.isAdmin)
    return NextResponse.json({ success: false, message: "Hanya Admin yang bisa mengubah SOP." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const content = (body?.content ?? "").trim();
  if (!content) return NextResponse.json({ success: false, message: "Isi SOP tidak boleh kosong." }, { status: 400 });

  const nowIso = new Date().toISOString();

  // Single-row: update baris yang ada, kalau belum ada baru insert
  const { data: existing } = await supabaseVehicles
    .from("vehicle_sop")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let result;
  if (existing?.id) {
    result = await supabaseVehicles
      .from("vehicle_sop")
      .update({ content, updated_by: me.id, updated_at: nowIso })
      .eq("id", existing.id)
      .select("content, updated_at")
      .single();
  } else {
    result = await supabaseVehicles
      .from("vehicle_sop")
      .insert({ content, updated_by: me.id, updated_at: nowIso })
      .select("content, updated_at")
      .single();
  }

  if (result.error) return NextResponse.json({ success: false, message: result.error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    sop: { content: result.data.content, updated_at: result.data.updated_at, updated_by_name: me.name },
  });
}
