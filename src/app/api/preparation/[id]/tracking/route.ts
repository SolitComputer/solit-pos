import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES, PREPARATION_DELIVERY_ROLES } from "@/lib/permissions";

interface Props { params: Promise<{ id: string }>; }

// GET — titik tracking kronologis (lama → baru)
async function getHandler(req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;
    const latest = new URL(req.url).searchParams.get("latest") === "1";

    let query = supabase
      .from("delivery_tracking")
      .select("id, lat, lng, accuracy, speed, heading, phase, recorded_at")
      .eq("preparation_id", id)
      .order("recorded_at", { ascending: false });

    query = latest ? query.limit(1) : query.limit(1000);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, data: (data ?? []).slice().reverse() });
  } catch (err) {
    console.error("[GET tracking]", err);
    return NextResponse.json({ success: false, message: "Gagal ambil tracking" }, { status: 500 });
  }
}

// POST — device pengantar kirim lokasi (fase GO saat antar, RETURN saat pulang)
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { lat, lng, accuracy, speed, heading } = await req.json();
    if (lat == null || lng == null) {
      return NextResponse.json({ success: false, message: "lat & lng wajib diisi" }, { status: 400 });
    }

    const { data: order } = await supabase
      .from("preparation_orders")
      .select("id, status, delivery_method, return_started_at, returned_at")
      .eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    const inDelivery = order.status === "DIKIRIM";
    const inReturn = order.status === "SELESAI" && !!order.return_started_at && !order.returned_at;
    if (!inDelivery && !inReturn) {
      return NextResponse.json({ success: false, message: "Order tidak sedang dikirim/pulang" }, { status: 400 });
    }
    const phase = inReturn ? "RETURN" : "GO";

    const { error } = await supabase.from("delivery_tracking").insert({
      preparation_id: id,
      lat: Number(lat), lng: Number(lng),
      accuracy: accuracy != null ? Number(accuracy) : null,
      speed: speed != null ? Number(speed) : null,
      heading: heading != null ? Number(heading) : null,
      phase,
      recorded_by: user.id,
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST tracking]", err);
    return NextResponse.json({ success: false, message: "Gagal simpan lokasi" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);
export const POST = withAuth(postHandler, PREPARATION_DELIVERY_ROLES);