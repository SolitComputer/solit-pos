import type { PostgrestError } from "@supabase/supabase-js";

// Batas default PostgREST/Supabase = 1000 baris per request.
const PAGE_SIZE = 1000;

// Ambil SEMUA baris dengan menarik per halaman (.range) sampai habis.
// buildQuery harus sudah punya .order() yang deterministik supaya
// halaman antar-request tidak tumpang tindih / bolong.
export async function fetchAllRows<T = any>(
    buildQuery: (
        from: number,
        to: number
    ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<{ data: T[]; error: PostgrestError | null }> {
    const all: T[] = [];

    for (let from = 0; ;) {
        const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
        if (error) return { data: [], error };

        const rows = data ?? [];
        if (rows.length === 0) break; // sudah habis
        all.push(...rows);
        from += rows.length; // maju sesuai jumlah yang benar-benar diterima server
    }

    return { data: all, error: null };
}