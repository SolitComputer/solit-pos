-- SQL Migration Script: Tambah kolom notes di tabel log Stok Opname (SO)

-- 1. Tambah kolom notes di laptop_so_logs
ALTER TABLE laptop_so_logs 
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- 2. Tambah kolom notes di laptop_unit_so_logs
ALTER TABLE laptop_unit_so_logs 
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;
