import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ id: string }>;
}

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id: laptopId } = await props.params;
    const body = await req.json();

    const { units } = body as {
      units: {
        serial_number:  string;
        grade:          string;
        condition_note: string;
        purchase_price: number;
        selling_price:  number;
        status:         string;
        notes:          string;
      }[];
    };

    if (!units || units.length === 0) {
      return NextResponse.json(
        { success: false, message: "Tidak ada unit yang dikirim" },
        { status: 400 }
      );
    }

    const snList = units.map(u => u.serial_number.trim()).filter(Boolean);
    const uniqueSns = new Set(snList);
    if (uniqueSns.size !== snList.length) {
      return NextResponse.json(
        { success: false, message: "Terdapat duplikat serial number dalam data yang dikirim" },
        { status: 400 }
      );
    }

    const { data: existingSns } = await supabase
      .from("laptop_units")
      .select("serial_number")
      .in("serial_number", snList);

    if (existingSns && existingSns.length > 0) {
      const dupes = existingSns.map(e => e.serial_number).join(", ");
      return NextResponse.json(
        { success: false, message: `Serial number berikut sudah terdaftar: ${dupes}` },
        { status: 409 }
      );
    }

    const payload = units.map(u => ({
      laptop_id:      laptopId,
      serial_number:  u.serial_number.trim(),
      grade:          u.grade || "B",
      condition_note: u.condition_note || "",
      purchase_price: Number(u.purchase_price) || 0,
      selling_price:  Number(u.selling_price) || 0,
      status:         u.status || "SIAP_JUAL",
      notes:          u.notes || "",
    }));

    const { data, error } = await supabase
      .from("laptop_units")
      .insert(payload)
      .select();

    if (error) throw error;

    // Ambil nama laptop
    const { data: laptop } = await supabase
      .from("laptops")
      .select("laptop_name")
      .eq("id", laptopId)
      .single();

    // Log aktivitas
    await logActivity({
      userId:      user.id,
      userName:    user.name,
      userRole:    user.role,
      action:      "CREATE",
      entity:      "unit",
      entityId:    laptopId,
      entityLabel: `Bulk ${units.length} unit${laptop ? ` (${laptop.laptop_name})` : ""}`,
      afterData:   { count: units.length, serial_numbers: snList },
    });

    return NextResponse.json({
      success: true,
      data,
      inserted: data.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal menambahkan units" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(postHandler, PERMISSIONS.CREATE_LAPTOP);