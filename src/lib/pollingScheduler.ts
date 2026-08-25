"use client";

/**
 * Pengganti setInterval dengan jitter acak, supaya banyak client tidak
 * menembak server di detik yang sama persis (cegah thundering herd tiap 60s).
 * @param fn       callback tiap siklus
 * @param baseMs   interval dasar (mis. 60000)
 * @param jitterMs rentang acak yang DITAMBAHKAN ke base (default 25% dari base, maks 15s)
 * @returns fungsi cleanup untuk menghentikan loop
 */
export function startJitteredPolling(
  fn: () => void,
  baseMs: number,
  jitterMs = Math.min(15000, Math.round(baseMs * 0.25))
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const next = () => {
    if (stopped) return;
    const delay = baseMs + Math.random() * jitterMs; // client → aman pakai Math.random
    timer = setTimeout(() => {
      fn();
      next();
    }, delay);
  };

  next();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
