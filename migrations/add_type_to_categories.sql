-- Menambah kolom `type` ke laptop_categories agar kategori laptop & aksesoris
-- tidak lagi tercampur di dropdown. Nilai: 'LAPTOP' atau 'AKSESORIS'.
--
-- Aman dijalankan berulang (idempotent). Jalankan di Supabase SQL Editor.

-- 1. Tambah kolom (default AKSESORIS karena mayoritas kategori existing adalah aksesoris).
ALTER TABLE laptop_categories
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'AKSESORIS';

-- 2. Backfill: hanya kategori bernama "Laptop" yang benar-benar untuk laptop.
UPDATE laptop_categories
  SET type = 'LAPTOP'
  WHERE upper(name) = 'LAPTOP';

-- 3. Batasi nilai yang boleh masuk.
ALTER TABLE laptop_categories
  DROP CONSTRAINT IF EXISTS laptop_categories_type_check;
ALTER TABLE laptop_categories
  ADD CONSTRAINT laptop_categories_type_check
  CHECK (type IN ('LAPTOP', 'AKSESORIS'));
