// src/lib/accessoryStock.ts
import { SupabaseClient } from "@supabase/supabase-js";

// Hitung ulang accessories.stock dari jumlah unit ber-SN yang masih aktif
// (status = TERSEDIA). Dipanggil setiap kali accessory_units berubah
// (tambah/edit/hapus unit) supaya kolom stock selalu akurat untuk KEDUA ARAH
// perubahan status — beda dari decrement manual yang cuma benar 1 arah.
// Pola sama persis dgn recalcLaptopParentQty() di lib/laptopStock.ts.
export async function recalcAccessoryParentStock(
    supabase: SupabaseClient,
    accessoryId: string
) {
    const { count } = await supabase
        .from("accessory_units")
        .select("id", { count: "exact", head: true })
        .eq("accessory_id", accessoryId)
        .eq("status", "TERSEDIA");

    await supabase
        .from("accessories")
        .update({ stock: count ?? 0 })
        .eq("id", accessoryId);
}