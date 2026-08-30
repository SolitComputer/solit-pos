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

    // type opsional: 'LAPTOP' | 'AKSESORIS'. Kalau tidak valid, jangan diubah.
    const typeInput = String(body.type ?? "").toUpperCase();
    const type = typeInput === "LAPTOP" || typeInput === "AKSESORIS" ? typeInput : null;
    const basePayload = {
      name,
      description: body.description?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from("laptop_categories")
      .update(type ? { ...basePayload, type } : basePayload)
      .eq("id", id)
      .select()
      .single();

    // Kolom `type` belum ada (migrasi belum dijalankan) → ulangi tanpa type.
    if (error?.code === "42703") {
      ({ data, error } = await supabase
        .from("laptop_categories")
        .update(basePayload)
        .eq("id", id)
        .select()
        .single());
    }

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

    // Cek dulu apakah masih ada laptop atau aksesori yang pakai kategori ini
    const { count: laptopCount } = await supabase
      .from("laptops")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);

    let accCount = 0;
    if (category?.name) {
      const { count } = await supabase
        .from("accessories")
        .select("id", { count: "exact", head: true })
        .ilike("category", category.name);
      accCount = count ?? 0;
    }

    const totalInUse = (laptopCount ?? 0) + accCount;
    if (totalInUse > 0) {
      const parts: string[] = [];
      if (laptopCount && laptopCount > 0) parts.push(`${laptopCount} laptop`);
      if (accCount > 0) parts.push(`${accCount} aksesori`);
      return NextResponse.json(
        {
          success: false,
          message: `Tidak bisa menghapus: masih ada ${parts.join(" dan ")} yang memakai kategori ini. Pindahkan dulu barang tersebut ke kategori lain.`,
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