// Tipe bersama Solit Coins (dipakai backend & frontend).

export type QuestPeriodType = "DAILY" | "WEEKLY";

/** State 1 misi untuk ditampilkan di UI (progress dihitung real-time). */
export interface QuestState {
  key: string;
  label: string;
  description: string;
  rewardSc: number;
  periodType: QuestPeriodType;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
}

export type BorderStyle =
  | { kind: "gradient"; colors: string[] }
  | { kind: "animated"; preset: string }
  | {
      kind: "asset";
      /** PNG statis 512x512 transparan, ring dasar (dari asset AI-generated). */
      ringImage: string;
      /** WebM transparan (particle/glow animasi), opsional — kalau kosong ring statis saja. */
      overlayVideo?: string;
      /** Slot logo/medali (khusus border LIMITED/event, mis. anniversary-2026). */
      medallionImage?: string;
    };

export type BorderTier = "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "LIMITED";

export type CosmeticType = "BORDER" | "BANNER";

export interface BorderInfo {
  id: string;
  code: string;
  name: string;
  tier: BorderTier;
  price_sc: number;
  style: BorderStyle;
  is_purchasable: boolean;
  sort_order: number;
  item_type: CosmeticType;
}

/** Item kosmetik yang sedang di-equip user (border/banner) untuk render. */
export interface EquippedCosmetic {
  id: string;
  code: string;
  name: string;
  tier: BorderTier;
  style: BorderStyle;
}

/** @deprecated pakai EquippedCosmetic — dipertahankan utk kompat import lama. */
export type EquippedBorder = EquippedCosmetic;
