// Shared badge-level logic — dipakai oleh SEMUA jenis lencana bulanan
// (Absensi, Pekerjaan, dst). Aturan: Top 3 di suatu bulan = "qualifies".
// Streak berturut-turut (bulan ke bulan tanpa putus) menentukan level saat
// ini (1 bulan Top 3 = Level 1, 2 bulan berturut-turut = Level 2, dst,
// maksimal Level 10). Begitu pernah mencapai LOCK_LEVEL (3 bulan berturut-
// turut), lencana jadi PERMANEN dan tidak turun lagi walau performa
// berikutnya jelek. Kalau belum permanen dan bulan berjalan gagal Top 3,
// streak reset ke 0.

export const LOCK_LEVEL = 3;
export const MAX_LEVEL = 10;

export type HistRow = { year: number; month: number; rank: number | null };

export function computeBadgeLevel(rows: HistRow[]) {
  let currentStreak = 0;
  let bestStreakEver = 0;
  let prevKey: number | null = null;

  for (const row of rows) {
    const key = row.year * 12 + row.month;
    const qualifies = row.rank !== null && row.rank <= 3;
    if (qualifies) {
      currentStreak = prevKey !== null && key === prevKey + 1 ? currentStreak + 1 : 1;
      bestStreakEver = Math.max(bestStreakEver, currentStreak);
    } else {
      currentStreak = 0;
    }
    prevKey = key;
  }

  const permanentFloor = bestStreakEver >= LOCK_LEVEL ? LOCK_LEVEL : 0;
  const displayLevel = Math.min(Math.max(currentStreak, permanentFloor), MAX_LEVEL);
  const isPermanent = permanentFloor >= LOCK_LEVEL;
  const isTemporary = displayLevel > 0 && !isPermanent;

  return { currentStreak, bestStreakEver, displayLevel, isPermanent, isTemporary };
}