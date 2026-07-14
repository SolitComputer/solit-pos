// src/lib/laptopStock.ts
import type { SupabaseClient } from "@supabase/supabase-js";

// Hitung ulang laptops.qty dari jumlah unit yang benar-benar SIAP_JUAL.
// Dipanggil setelah SETIAP mutasi unit (tambah/hapus/ubah status) supaya qty
// parent tidak menyimpang dari kenyataan. Kalau ada stok, status di-set
// SIAP_JUAL (mengembalikan laptop yang sempat SOLD); saat qty 0 status tidak
// dipaksa berubah agar tidak menimpa state seperti BELUM_SIAP.
export async function recalcLaptopParentQty(
  supabase: SupabaseClient,
  laptopId: string | null | undefined
): Promise<void> {
  if (!laptopId) return;
  const { data } = await supabase
    .from("laptop_units")
    .select("id")
    .eq("laptop_id", laptopId)
    .eq("status", "SIAP_JUAL");
  const qty = data?.length ?? 0;
  const patch: Record<string, unknown> = { qty };
  if (qty > 0) patch.status = "SIAP_JUAL";
  await supabase.from("laptops").update(patch).eq("id", laptopId);
}
