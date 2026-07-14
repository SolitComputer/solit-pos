// src/lib/supabaseFetch.ts
// Supabase membatasi setiap SELECT maksimal 1000 baris secara default dan
// MEMOTONG diam-diam (tanpa error) kalau lebih. Untuk agregasi (omzet, profit,
// saldo) pemotongan ini bikin total kurang hitung. Helper ini mengambil SEMUA
// baris dengan paginasi .range() sampai halaman terakhir.
export async function fetchAllRows<T>(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
