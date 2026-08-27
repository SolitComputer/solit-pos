import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { BARANG_FULL_ACCESS_ROLES, hasAnyRole } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ id: string }>;
}

async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    if (!hasAnyRole(user.roles ?? [user.role], BARANG_FULL_ACCESS_ROLES)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id } = await props.params;
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ success: false, message: "Nama kategori wajib diisi" }, { status: 400 });
    }

    const { data: before } = await supabase
      .from("laptop_categories")
      .select("*")
      .eq("id", id)
      .single();

    const { data, error } = await supabase
      .from("laptop_categories")
      .update({
        name,
        description: body.description?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      const message = error.code === "23505" ? `Kategori "${name}" sudah ada` : error.message;
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "laptop_category",
      entityId: id,
      entityLabel: before?.name ?? data.name,
      beforeData: before,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, message: "Gagal memperbarui kategori" }, { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    if (!hasAnyRole(user.roles ?? [user.role], BARANG_FULL_ACCESS_ROLES)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id } = await props.params;

    const { data: category } = await supabase
      .from("laptop_categories")
      .select("*")
      .eq("id", id)
      .single();

    // Cek dulu apakah masih ada laptop yang pakai kategori ini
    const { count } = await supabase
      .from("laptops")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);

    if (count && count > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Tidak bisa menghapus: masih ada ${count} laptop yang memakai kategori ini. Pindahkan dulu laptop-laptop tersebut ke kategori lain.`,
        },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("laptop_categories").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "DELETE",
      entity: "laptop_category",
      entityId: id,
      entityLabel: category?.name,
      beforeData: category,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Gagal menghapus kategori" }, { status: 500 });
  }
}

export const PUT = withAuth(putHandler);
export const DELETE = withAuth(deleteHandler);