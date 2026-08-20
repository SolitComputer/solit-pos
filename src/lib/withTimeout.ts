// src/lib/withTimeout.ts
//
// Pembungkus generik buat call async (terutama query Supabase) yang wajib
// punya batas waktu. Tanpa ini, kalau koneksi ke Supabase nge-hang (bukan
// error/throw, cuma gak pernah resolve — misal network hiccup atau
// connection pool exhausted), middleware/route bisa nunggu tanpa batas
// sampai reverse proxy di depan (nginx/LiteSpeed di Hostinger) motong paksa
// koneksinya -> muncul sebagai 408 "0 bytes" di browser karena server belum
// sempat nulis response apa pun.
export async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
