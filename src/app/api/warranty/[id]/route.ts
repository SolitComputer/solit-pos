import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { computeWarrantyStatus } from "@/lib/warranty";

interface Props {
  params: Promise<{ id: string }>;
}

async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data, error } = await supabase
      .from("warranties")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();

    // Ambil data sebelum diubah
    const { data: before } = await supabase
      .from("warranties")
      .select("*")
      .eq("id", id)
      .single();

    const allowed: Record<string, any> = {};
    if (body.warranty_end      !== undefined) allowed.warranty_end      = body.warranty_end;
    if (body.warranty_duration !== undefined) allowed.warranty_duration = Number(body.warranty_duration);
    if (body.status            !== undefined) allowed.status            = body.status;
    if (body.notes             !== undefined) allowed.notes             = body.notes;
    if (body.technician_notes  !== undefined) allowed.technician_notes  = body.technician_notes;
    if (body.customer_phone    !== undefined) allowed.customer_phone    = body.customer_phone;
    allowed.last_edited_by = user.name;
    allowed.last_edited_at = new Date().toISOString();

    // ✅ FIX: kalau admin sengaja memilih status yang beda dari hasil hitung
    // otomatis (mis. paksa ACTIVE walau tanggalnya sudah lewat), tandai
    // manual_status_override supaya GET list tidak menimpanya balik di
    // refresh berikutnya. Kalau status yang dipilih ternyata SAMA dengan
    // hasil hitung otomatis (warranty_end dipakai kalau ikut diedit), berarti
    // bukan override — biarkan auto-hitung jalan lagi seperti biasa.
    if (body.status !== undefined && before) {
      const warrantyEndForCheck = allowed.warranty_end ?? before.warranty_end;
      const { computedStatus: autoStatus } = computeWarrantyStatus(warrantyEndForCheck, body.status);
      allowed.manual_status_override = body.status !== autoStatus;
    }

    const { data, error } = await supabase
      .from("warranties")
      .update(allowed)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    await logActivity({
      userId:      user.id,
      userName:    user.name,
      userRole:    user.role,
      action:      "EDIT",
      entity:      "warranty",
      entityId:    id,
      entityLabel: `${before?.invoice_number ?? "—"} — ${before?.customer_name ?? "—"}`,
      beforeData:  before,
      afterData:   data,
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_WARRANTY);
export const PUT = withAuth(putHandler, PERMISSIONS.EDIT_WARRANTY);