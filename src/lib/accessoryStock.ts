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
    // Stok = unit yang BELUM terjual (bukan cuma TERSEDIA). Disamakan dengan
    // derivedStock di /api/accessories (status !== "TERJUAL") supaya kolom
    // accessories.stock konsisten dengan tampilan Data Barang. Penting setelah
    // ada status MINUS_SIAP_JUAL: unit MSJ tetap stok nyata (belum terjual),
    // jadi TIDAK boleh bikin kolom stock turun / barang ke-auto-arsip.
    // Stok = unit yang BELUM terjual DAN belum keluar (diambil untuk kebutuhan/
    // service). Unit berstatus KELUAR di-hidden dari stok — harus sama persis
    // dengan filter di normalizeAccessory (UnifiedBarangContent): membuang
    // TERJUAL & KELUAR. Dulu bug: cuma buang TERJUAL, jadi unit yang sudah
    // diambil (KELUAR) tetap kehitung stok & tetap muncul di Data Barang.
    const { count } = await supabase
        .from("accessory_units")
        .select("id", { count: "exact", head: true })
        .eq("accessory_id", accessoryId)
        .neq("status", "TERJUAL")
        .neq("status", "KELUAR");

    await supabase
        .from("accessories")
        .update({ stock: count ?? 0 })
        .eq("id", accessoryId);
}