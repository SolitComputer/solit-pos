-- Checklist tes kondisi (BH/WL, Key Test, LCD Test, dst) untuk barang
-- kategori Laptop & Monitor. Disimpan sebagai JSONB dengan bentuk:
--   { "<key>": { "result": "OKE" | "TIDAK_OKE" | null, "note": "..." }, ... }
-- Daftar key ada di src/lib/conditionChecks.ts.
--
-- Aman dijalankan berulang (idempotent). Jalankan di Supabase SQL Editor.

ALTER TABLE laptops
  ADD COLUMN IF NOT EXISTS condition_checks jsonb NOT NULL DEFAULT '{}'::jsonb;
