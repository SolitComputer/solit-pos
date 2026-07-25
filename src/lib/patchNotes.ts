// src/lib/patchNotes.ts
import type { UserRole } from "@/lib/permissions";
import { expandRolesWithParents } from "@/lib/permissions";

export type PatchNoteCategory = "FITUR_BARU" | "PERBAIKAN" | "PERUBAHAN_KECIL";

export const VALID_PATCH_NOTE_CATEGORIES: PatchNoteCategory[] = [
  "FITUR_BARU",
  "PERBAIKAN",
  "PERUBAHAN_KECIL",
];

/** Hanya ADMIN & PROGRAMMER — sengaja tidak pakai FULL_ACCESS_ROLES karena
 *  itu juga mencakup ASISTEN_CEO, lebih luas dari yang diminta. */
export const PATCH_NOTES_PUBLISH_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER"];

export const PATCH_NOTE_CATEGORY_META: Record<
  PatchNoteCategory,
  { label: string; bg: string; text: string; border: string }
> = {
  FITUR_BARU: { label: "Fitur Baru", bg: "#ecfdf5", text: "#059669", border: "#a7f3d0" },
  PERBAIKAN: { label: "Perbaikan", bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
  PERUBAHAN_KECIL: { label: "Perubahan Kecil", bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
};

export interface PatchNote {
  id: string;
  title: string;
  description: string;
  category: PatchNoteCategory;
  target_roles: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * target_roles kosong = untuk semua orang. Pakai expandRolesWithParents
 * (sama seperti withAuth) supaya PKL_SALES ikut lihat patch note yang
 * ditarget ke CREW_SALES (role induknya).
 */
export function isPatchNoteVisibleToUser(
  targetRoles: string[],
  userRoles: string[]
): boolean {
  if (!targetRoles || targetRoles.length === 0) return true;
  const effective = expandRolesWithParents(userRoles);
  return targetRoles.some((r) => effective.includes(r));
}
