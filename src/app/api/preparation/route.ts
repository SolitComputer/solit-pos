import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES, PREPARATION_CREATE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

// helper: "besok" dalam WIB (Vercel jalan di UTC)
function tomorrowWIB(): string {
  const nowWIB = new Date(Date.now() + 7 * 3600_000);
  nowWIB.setUTCDate(nowWIB.getUTCDate() + 1);
  return nowWIB.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Nomor order: PREP-YYYYMMDD-XXXX
async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const prefix = `PREP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const { data } = await supabase
    .from("preparation_orders")
    .select("order_number")
    .like("order_number", `${prefix}%`)
    .order("order_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const lastNum = parseInt(data[0].order_number.split("-").pop() ?? "0", 10);
    if (!isNaN(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "ALL";
    const search = url.searchParams.get("search")?.trim() ?? "";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const pageParam = url.searchParams.get("page");
    const limitParam = url.searchParams.get("limit");

    const paginated = pageParam !== null || limitParam !== null;
    const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? "20", 10) || 20));

    let snIds: string[] = [];
    if (search) {
      const { data: snRows } = await supabase
        .from("preparation_items")
        .select("preparation_id")
        .ilike("serial_number", `%${search}%`)
        .limit(500);
      snIds = [...new Set((snRows ?? []).map((r: any) => r.preparation_id))];
    }

    let query = supabase
      .from("preparation_orders")
      .select(
       `*, preparation_items ( id, serial_number, laptop_name, laptop_id, is_checked, check_note, is_cancelled, cancel_reason )`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (status !== "ALL") query = query.eq("status", status);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lt("created_at", to);

    if (search) {
      const s = search.replace(/[%,()]/g, " ").trim();
      const ors = [
        `order_number.ilike.%${s}%`,
        `customer_name.ilike.%${s}%`,
        `customer_phone.ilike.%${s}%`,
        `received_by_name.ilike.%${s}%`,
      ];
      if (snIds.length > 0) ors.push(`id.in.(${snIds.join(",")})`);
      query = query.or(ors.join(","));
    }

    if (paginated) {
      const start = (page - 1) * limit;
      query = query.range(start, start + limit - 1);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    // ── Enrich preparation_items dengan spek laptop (CPU/RAM/Storage/GPU) ──
    // laptop_id sudah tersimpan di preparation_items sejak dibuat, tapi
    // speknya sendiri TIDAK didenormalisasi ke situ — diambil live dari
    // tabel `laptops` tiap kali di-GET, jadi kalau spek modelnya diedit
    // belakangan di Data Barang, yang tampil di sini ikut ke-update.
    const laptopIds = [
      ...new Set(
        (data ?? []).flatMap((o: any) =>
          (o.preparation_items ?? []).map((it: any) => it.laptop_id).filter(Boolean)
        )
      ),
    ] as string[];

    if (laptopIds.length > 0) {
      const { data: laptopSpecs } = await supabase
        .from("laptops")
        .select("id, cpu, ram, storage, gpu")
        .in("id", laptopIds);
      const specMap = new Map((laptopSpecs ?? []).map((l: any) => [l.id, l]));
      (data ?? []).forEach((o: any) => {
        o.preparation_items = (o.preparation_items ?? []).map((it: any) => ({
          ...it,
          laptop_spec: it.laptop_id ? specMap.get(it.laptop_id) ?? null : null,
        }));
      });
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      total: count ?? (data?.length ?? 0),
      page: paginated ? page : 1,
      limit: paginated ? limit : (data?.length ?? 0),
    });
  } catch (err) {
    console.error("[GET /api/preparation]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil data" }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { customer_name, customer_phone, notes, items, delivery_address, scheduled_delivery_date } = body;

    if (!customer_name || !String(customer_name).trim()) {
      return NextResponse.json({ success: false, message: "Nama customer wajib diisi" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Minimal 1 serial number harus diisi" }, { status: 400 });
    }

    const cleanItems = items
      .map((it: any) => ({
        serial_number: String(it.serial_number ?? "").trim(),
        laptop_name: it.laptop_name ?? null,
        laptop_id: it.laptop_id ?? null,
        unit_id: it.unit_id ?? null,
      }))
      .filter((it) => it.serial_number);

    if (cleanItems.length === 0) {
      return NextResponse.json({ success: false, message: "Serial number tidak boleh kosong" }, { status: 400 });
    }

    // validasi jadwal antar — minimal besok (req 8)
    let schedDate: string | null = null;
    if (scheduled_delivery_date) {
      const minDate = tomorrowWIB();
      if (scheduled_delivery_date < minDate) {
        return NextResponse.json(
          { success: false, message: "Jadwal antar paling cepat besok" },
          { status: 400 }
        );
      }
      schedDate = scheduled_delivery_date;
    }

    // ── Bypass validasi ketersediaan unit (business rule fase Preparation) ──
    // Fase Preparation TIDAK BOLEH error walau SN sama diinput dua kali/lebih,
    // atau SN yang sedang dipakai order lain (status DALAM_PENYIAPAN) dipakai
    // lagi. Makanya di sini SENGAJA TIDAK ada pengecekan status yang bisa
    // menolak request (tidak ada lagi response 409).
    // Guard "SIAP_JUAL" tetap dipasang di query UPDATE di bawah — itu cukup
    // untuk mencegah unit yang sudah DALAM_PENYIAPAN/SOLD ikut ter-update
    // (jadi Data Barang tidak salah hitung), tapi TIDAK membuat request ini gagal.
    const unitIds = [...new Set(cleanItems.map((it) => it.unit_id).filter(Boolean))] as string[];
    const unitsToReserve: { id: string }[] = unitIds.map((id) => ({ id }));

    const order_number = await generateOrderNumber();

    const { data: order, error: orderError } = await supabase
      .from("preparation_orders")
      .insert({
        order_number,
        customer_name: String(customer_name).trim(),
        customer_phone: customer_phone ?? null,
        delivery_address: delivery_address ?? null,
        scheduled_delivery_date: schedDate,   // ← baru
        notes: notes ?? null,
        status: "MENUNGGU",
        created_by: user.id,
        created_by_name: user.name,
        created_by_role: user.role,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const { error: itemsError } = await supabase
      .from("preparation_items")
      .insert(cleanItems.map((it) => ({ preparation_id: order.id, ...it })));

    if (itemsError) {
      await supabase.from("preparation_orders").delete().eq("id", order.id);
      throw itemsError;
    }

   // ── Kurangi stok "Siap Jual" — BUKAN "Data Barang" ──
    // Unit pindah SIAP_JUAL → DALAM_PENYIAPAN begitu masuk antrian penyiapan.
    // SENGAJA BUKAN "RESERVED" — status itu sudah dipakai untuk unit yang
    // di-DP oleh customer (lihat units/reserve & confirm-payment), dan
    // LaptopsContent.tsx sengaja MENGECUALIKAN "RESERVED" dari stok_tersedia
    // (Data Barang). Kalau kita reuse "RESERVED" di sini, Data Barang akan
    // ikut berkurang saat antrian penyiapan dibuat — melanggar business rule.
    // "DALAM_PENYIAPAN" TETAP dihitung sebagai stok_tersedia di LaptopsContent.
    if (unitsToReserve.length > 0) {
      const { error: reserveError } = await supabase
        .from("laptop_units")
        .update({ status: "DALAM_PENYIAPAN" })
        .in("id", unitsToReserve.map((u) => u.id))
        .eq("status", "SIAP_JUAL"); // guard tambahan terhadap race condition

      if (reserveError) {
        await supabase.from("preparation_items").delete().eq("preparation_id", order.id);
        await supabase.from("preparation_orders").delete().eq("id", order.id);
        throw reserveError;
      }
    }

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "CREATE", entity: "preparation", entityId: order.id,
      entityLabel: `${order_number} — ${customer_name} (${cleanItems.length} SN)`,
      afterData: order,
    });

    return NextResponse.json({
      success: true, data: order,
      message: `Penyiapan ${order_number} dibuat (${cleanItems.length} unit)`,
    });
  } catch (err: any) {
    console.error("[POST /api/preparation]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal membuat penyiapan" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);
export const POST = withAuth(postHandler, PREPARATION_CREATE_ROLES);