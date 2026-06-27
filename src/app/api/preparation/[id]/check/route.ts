import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DONE_ROLES } from "@/lib/permissions";

interface Props { params: Promise<{ id: string }>; }

async function patchHandler(req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;
    const { item_id, is_checked, check_note } = await req.json();
    if (!item_id) return NextResponse.json({ success: false, message: "item_id wajib diisi" }, { status: 400 });

    const { data: item } = await supabase
      .from("preparation_items").select("id, preparation_id").eq("id", item_id).single();

    if (!item || item.preparation_id !== id) {
      return NextResponse.json({ success: false, message: "Item tidak ditemukan" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("preparation_items")
      .update({
        ...(is_checked !== undefined && { is_checked }),
        ...(check_note !== undefined && { check_note }),
      })
      .eq("id", item_id).select().single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH check]", err);
    return NextResponse.json({ success: false, message: "Gagal update item" }, { status: 500 });
  }
}

export const PATCH = withAuth(patchHandler, PREPARATION_DONE_ROLES);