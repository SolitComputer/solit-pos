import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES, PREPARATION_CREATE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import { generateOrderNumber } from "@/lib/preparationOrderNumber";

// helper: "besok" dalam WIB (Vercel jalan di UTC)
function tomorrowWIB(): string {
  const nowWIB = new Date(Date.now() + 7 * 3600_000);
  nowWIB.setUTCDate(nowWIB.getUTCDate() + 1);
  return nowWIB.toISOString().slice(0, 10); // YYYY-MM-DD
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
    } else {
      // Safe default limit to avoid unbounded table scans
      query = query.limit(100);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    // ── Resolve laptop_id untuk item yang TIDAK punya laptop_id ──
    const allItemsFlat = (data ?? []).flatMap((o: any) => o.preparation_items ?? []);
    const missingSns = [
      ...new Set(
        allItemsFlat
          .filter((it: any) => !it.laptop_id && it.serial_number)
          .map((it: any) => it.serial_number)
      ),
    ] as string[];

    let snToLaptop = new Map<string, string>();
    if (missingSns.length > 0) {
      const { data: matchedUnits } = await supabase
        .from("laptop_units")
        .select("serial_number, laptop_id")
        .in("serial_number", missingSns);
      snToLaptop = new Map(
        (matchedUnits ?? [])
          .filter((u: any) => u.laptop_id)
          .map((u: any) => [u.serial_number, u.laptop_id])
      );
    }

    // ── Enrich preparation_items dengan spek & nama laptop dalam 1 query tunggal ──
    const laptopIds = [
      ...new Set(
        allItemsFlat
          .map((it: any) => it.laptop_id ?? snToLaptop.get(it.serial_number))
          .filter(Boolean)
      ),
    ] as string[];

    if (laptopIds.length > 0) {
      const { data: laptopsData, error: lErr } = await supabase
        .from("laptops")
        .select("id, laptop_name, cpu, ram, storage, gpu")
        .in("id", laptopIds);

      if (!lErr && laptopsData) {
        const specMap = new Map(laptopsData.map((l: any) => [l.id, l]));
        const laptopNameMap = new Map(laptopsData.map((l: any) => [l.id, l.laptop_name]));

        (data ?? []).forEach((o: any) => {
          o.preparation_items = (o.preparation_items ?? []).map((it: any) => {
            const resolvedLaptopId = it.laptop_id ?? snToLaptop.get(it.serial_number) ?? null;
            return {
              ...it,
              laptop_name: it.laptop_name ?? (resolvedLaptopId ? laptopNameMap.get(resolvedLaptopId) ?? null : null),
              laptop_spec: resolvedLaptopId ? specMap.get(resolvedLaptopId) ?? null : null,
            };
          });
        });
      }
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

    // ── Preparation TIDAK mengunci/mengubah status unit sama sekali ──
    // Business rule baru: Data Barang, Penyedia Barang, Pengantaran, dan
    // Transaksi berdiri sendiri-sendiri (tidak ada relasi otomatis). SN yang
    // sama boleh diinput berkali-kali baik dalam satu order maupun lintas
    // order, tanpa validasi konflik apa pun — preparation_items cuma
    // catatan/riwayat, bukan penanda stok.
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

      // ── SENGAJA TIDAK ADA update ke laptop_units di sini ──
    // Dulu di titik ini status unit diubah SIAP_JUAL → DALAM_PENYIAPAN, itu
    // yang bikin unit hilang dari "Barang Siap Jual" tiap kali Sales bikin
    // Penyiapan. Sekarang dihapus total: unit_id tetap tersimpan di
    // preparation_items (untuk riwayat & pencarian), tapi laptop_units.status
    // TIDAK PERNAH disentuh oleh alur Penyiapan. Stok Siap Jual baru
    // berkurang saat Transaksi (penjualan) benar-benar dibuat — lihat
    // transaction/create & units/confirm-payment.

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