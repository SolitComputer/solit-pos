// src/app/api/laptops/sparepart-queue/[id]/route.ts
//
// DELETE /api/laptops/sparepart-queue/[id]
// Hapus 1 sparepart dari antrian (user salah ketik, atau batal beli).
// Cuma boleh hapus yang status=MENUNGGU — yg sudah SELESAI jadi history.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PENGELOLA_DECISION_ROLES } from "@/lib/permissions";

interface Props { params: Promise<{ id: string }>; }

async function deleteHandler(_req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data: sp, error: fetchErr } = await supabase
      .from("sparepart_queue").select("id, status").eq("id", id).single();

    if (fetchErr || !sp) {
      return NextResponse.json({ success: false, message: "Sparepart tidak ditemukan" }, { status: 404 });
    }
    if (sp.status === "SELESAI") {
      return NextResponse.json({
        success: false,
        message: "Sparepart yang sudah SELESAI tidak bisa dihapus (jadi history)",
      }, { status: 400 });
    }

    const { error: delErr } = await supabase.from("sparepart_queue").delete().eq("id", id);
    if (delErr) return NextResponse.json({ success: false, message: delErr.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sparepart-queue DELETE]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const DELETE = withAuth(deleteHandler, PENGELOLA_DECISION_ROLES);