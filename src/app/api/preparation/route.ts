import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES, PREPARATION_CREATE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import { generateOrderNumber } from "@/lib/preparationOrderNumber";
import { generateInvoice } from "@/lib/invoice";
import { recalcLaptopParentQty } from "@/lib/laptopStock";

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

    const { data, error, count } = await query.abortSignal(AbortSignal.timeout(8000));
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
    const {
      customer_name, customer_phone, notes, items, delivery_address, scheduled_delivery_date,
      sales_channel, ecommerce_platform, deal_price,
    } = body;

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

    // ── Channel penjualan: MANUAL (default) atau ECOMMERCE ──────────────────
    // ECOMMERCE = order dari marketplace (Shopee/Tokopedia/TikTok/Lazada).
    // Nominal (deal_price) WAJIB untuk MANUAL, OPSIONAL untuk ECOMMERCE.
    const ECOMMERCE_PLATFORMS = ["SHOPEE", "TOKOPEDIA", "TIKTOK", "LAZADA"];
    const salesChannel: "MANUAL" | "ECOMMERCE" = sales_channel === "ECOMMERCE" ? "ECOMMERCE" : "MANUAL";
    const ecommercePlatform = salesChannel === "ECOMMERCE" ? String(ecommerce_platform ?? "").toUpperCase() : null;

    if (salesChannel === "ECOMMERCE" && !ECOMMERCE_PLATFORMS.includes(ecommercePlatform ?? "")) {
      return NextResponse.json(
        { success: false, message: "Pilih e-commerce (Shopee/Tokopedia/TikTok/Lazada)" },
        { status: 400 }
      );
    }

    let dealPriceNum = Number(deal_price) || 0;
    if (salesChannel === "MANUAL" && dealPriceNum <= 0) {
      return NextResponse.json(
        { success: false, message: "Nominal harga jual wajib diisi" },
        { status: 400 }
      );
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
        sales_channel: salesChannel,           // ← baru: MANUAL | ECOMMERCE
        ecommerce_platform: ecommercePlatform, // ← baru
        deal_price: dealPriceNum,              // ← baru
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

    // ── SENGAJA TIDAK ADA update ke laptop_units di sini untuk channel MANUAL ──
    // Dulu di titik ini status unit diubah SIAP_JUAL → DALAM_PENYIAPAN, itu
    // yang bikin unit hilang dari "Barang Siap Jual" tiap kali Sales bikin
    // Penyiapan. Sekarang dihapus total: unit_id tetap tersimpan di
    // preparation_items (untuk riwayat & pencarian), tapi laptop_units.status
    // TIDAK PERNAH disentuh oleh alur Penyiapan MANUAL. Stok Siap Jual baru
    // berkurang saat Transaksi (penjualan) benar-benar dibuat — lihat
    // transaction/create & units/confirm-payment.
    //
    // ── KECUALI channel ECOMMERCE ────────────────────────────────────────
    // Order marketplace (Shopee/Tokopedia/TikTok/Lazada) dianggap sudah pasti
    // laku begitu di-input, jadi langsung: (1) buat baris `transactions`
    // berstatus "PACKING", (2) tandai laptop_units terkait jadi "SOLD" biar
    // stok Siap Jual di Data Barang otomatis berkurang, (3) link invoice-nya
    // ke preparation_orders ini — supaya muncul juga di Riwayat Transaksi &
    // Riwayat Pending (keduanya sudah generic terhadap status PACKING).
    if (salesChannel === "ECOMMERCE") {
      try {
        // Resolve unit_id yang belum ada (SN diketik manual/scan barcode)
        // lewat serial_number, sama seperti pola resolve di GET /api/preparation.
        const missingSnItems = cleanItems.filter((it) => !it.unit_id && it.serial_number);
        if (missingSnItems.length > 0) {
          const { data: matchedUnits } = await supabase
            .from("laptop_units")
            .select("id, serial_number")
            .in("serial_number", missingSnItems.map((it) => it.serial_number));
          const snToUnitId = new Map((matchedUnits ?? []).map((u: any) => [u.serial_number, u.id]));
          for (const it of missingSnItems) {
            const resolved = snToUnitId.get(it.serial_number);
            if (resolved) it.unit_id = resolved;
          }
        }

        const invoice_number = await generateInvoice();
        const unitIds = cleanItems.map((it) => it.unit_id).filter(Boolean) as string[];
        const serialNumbers = cleanItems.map((it) => it.serial_number).filter(Boolean);

        const { error: trxError } = await supabase.from("transactions").insert({
          invoice_number,
          status: "PACKING",
          customer_name: String(customer_name).trim(),
          customer_phone: customer_phone ?? null,
          laptop_name: cleanItems.length === 1 ? cleanItems[0].laptop_name : `${cleanItems.length} Laptop`,
          serial_number: cleanItems.length === 1 ? cleanItems[0].serial_number : null,
          serial_numbers: serialNumbers,
          unit_id: unitIds.length === 1 ? unitIds[0] : null,
          unit_ids: unitIds,
          laptop_id: cleanItems.length === 1 ? cleanItems[0].laptop_id : null,
          deal_price: dealPriceNum,
          amount: dealPriceNum,
          dp_amount: 0,
          payment_method: "E-COMMERCE",
          source_platform: ecommercePlatform,
          item_kind: "laptop",
          notes: notes ?? null,
          sales_id: user.id,
          sales_name: user.name,
        });
        if (trxError) throw trxError;

        if (cleanItems.length > 0) {
          const perUnitPrice = cleanItems.length > 1 ? Math.round(dealPriceNum / cleanItems.length) : dealPriceNum;
          const { error: trxItemsError } = await supabase.from("transaction_items").insert(
            cleanItems.map((it) => ({
              invoice_number,
              item_type: "laptop",
              unit_id: it.unit_id,
              laptop_id: it.laptop_id,
              serial_number: it.serial_number,
              item_name: it.laptop_name,
              quantity: 1,
              deal_price: perUnitPrice,
            }))
          );
          if (trxItemsError) throw trxItemsError;
        }

        if (unitIds.length > 0) {
          // ── PENTING: status unit di sini HARUS "PACKING", BUKAN "SOLD" ──
          // "SOLD" baru boleh dipasang oleh /api/units/confirm-payment saat
          // dana marketplace benar-benar cair dan sales klik "Konfirmasi
          // Lunas". Kalau di sini langsung "SOLD", nanti confirm-payment akan
          // MENOLAK proses pelunasan dengan pesan "sudah terjual lewat
          // transaksi lain" (lihat guard `unit.status === "SOLD"` di sana),
          // padahal itu transaksi yang sama — prosesnya jadi macet permanen.
          //
          // Status "PACKING" di level unit sudah jadi konvensi resmi sistem
          // ini (lihat LaptopsContent.tsx: PACKING tidak dihitung di
          // stok_tersedia, tapi dihitung di belum_lunas) — otomatis mengurangi
          // stok tersedia di Data Barang, tanpa memblokir pelunasan nanti.
          await supabase.from("laptop_units").update({ status: "PACKING" }).in("id", unitIds);

          // ── Sinkronkan cache qty/status di tabel `laptops` ──────────────
          // Data Barang (LaptopsContent.tsx) sendiri sudah otomatis berkurang
          // stoknya karena dia hitung ulang langsung dari laptop_units tiap
          // fetch — tapi kolom cache di tabel `laptops` (dipakai halaman lain
          // seperti Ready to Sell / situs publik) perlu di-recalc manual,
          // sama seperti pola di api/laptops/[id]/units/route.ts setelah
          // CRUD unit.
          const { data: packingUnits } = await supabase
            .from("laptop_units")
            .select("laptop_id")
            .in("id", unitIds);
          const affectedLaptopIds = [...new Set((packingUnits ?? []).map((u: any) => u.laptop_id).filter(Boolean))] as string[];
          await Promise.allSettled(affectedLaptopIds.map((lid) => recalcLaptopParentQty(supabase, lid)));
        }

        await supabase
          .from("preparation_orders")
          .update({ transaction_invoice: invoice_number, transaction_linked_at: new Date().toISOString() })
          .eq("id", order.id);

        order.transaction_invoice = invoice_number;
      } catch (ecomErr) {
        // Penyiapan tetap dibuat walau link transaksi e-commerce gagal, biar
        // SN yang sudah diinput sales tidak hilang — errornya dicatat saja.
        console.error("[POST /api/preparation] gagal buat transaksi e-commerce:", ecomErr);
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