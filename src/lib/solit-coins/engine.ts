// Engine progress misi Solit Coins — dihitung real-time, tanpa nyimpen angka.

import { createClient } from "@supabase/supabase-js";
import { currentDayKey, currentWeekKey } from "@/lib/solit-coins/period";
import {
  QUESTS,
  questApplies,
  periodKeyFor,
  type QuestDef,
} from "@/lib/solit-coins/questRegistry";
import type { QuestPeriodType, QuestState } from "@/lib/solit-coins/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Progress semua misi yang berlaku untuk user. */
export async function computeUserQuests(user: {
  id: string;
  roles: string[];
}): Promise<QuestState[]> {
  const dayKey = currentDayKey();
  const weekKey = currentWeekKey();

  const applicable = QUESTS.filter((q) => questApplies(q, user.roles));

  // Baris klaim untuk periode berjalan (harian + mingguan).
  const { data: claims } = await supabase
    .from("quest_progress")
    .select("quest_key, period_key")
    .eq("user_id", user.id)
    .in("period_key", [dayKey, weekKey]);

  const claimedSet = new Set(
    (claims ?? []).map((c: { quest_key: string; period_key: string }) => `${c.quest_key}|${c.period_key}`)
  );

  const ctx = { userId: user.id, roles: user.roles, dayKey, weekKey };

  return Promise.all(
    applicable.map(async (q: QuestDef): Promise<QuestState> => {
      const raw = await q.count(ctx);
      const periodKey = periodKeyFor(q, dayKey, weekKey);
      return {
        key: q.key,
        label: q.label,
        description: q.description,
        rewardSc: q.rewardSc,
        periodType: q.periodType,
        progress: Math.min(raw, q.target),
        target: q.target,
        completed: raw >= q.target,
        claimed: claimedSet.has(`${q.key}|${periodKey}`),
      };
    })
  );
}

/**
 * Verifikasi apakah user boleh klaim quest ini SEKARANG.
 * Return periodKey & reward untuk RPC bila valid; else alasan gagal.
 */
export async function verifyClaimable(
  user: { id: string; roles: string[] },
  questKey: string
): Promise<
  | { ok: true; periodKey: string; periodType: QuestPeriodType; reward: number }
  | { ok: false; code: "not_found" | "not_eligible" | "not_completed"; message: string }
> {
  const def = QUESTS.find((q) => q.key === questKey);
  if (!def) return { ok: false, code: "not_found", message: "Misi tidak ditemukan" };
  if (!questApplies(def, user.roles))
    return { ok: false, code: "not_eligible", message: "Misi ini bukan untuk role kamu" };

  const dayKey = currentDayKey();
  const weekKey = currentWeekKey();
  const raw = await def.count({ userId: user.id, roles: user.roles, dayKey, weekKey });
  if (raw < def.target)
    return { ok: false, code: "not_completed", message: "Target misi belum tercapai" };

  return {
    ok: true,
    periodKey: periodKeyFor(def, dayKey, weekKey),
    periodType: def.periodType,
    reward: def.rewardSc,
  };
}
