// Tipe & helper bersama untuk fitur "Laporan Insight" (papan manual ala Excel).
// Dipakai di API route maupun komponen client → JANGAN import modul server-only.

export interface InsightColumn {
  id: string;
  name: string;
}

export interface InsightRow {
  id: string;
  cells: Record<string, string>;
}

export interface InsightSheet {
  id: string;
  name: string;
  columns: InsightColumn[];
  rows: InsightRow[];
  sort_order: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// Id lokal untuk kolom/baris (dibuat di client, jadi key tiap cell).
export function makeLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}