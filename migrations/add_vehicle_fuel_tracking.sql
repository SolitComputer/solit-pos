-- SQL Migration Script: Tracking bensin/baterai kendaraan (level saat ini)
-- Jalankan manual di Supabase SQL editor. Idempotent.

-- fuel_level = level bensin/baterai TERKINI kendaraan (mobil & motor).
-- Diisi saat input awal, lalu otomatis di-update ke return_fuel_level checkout terakhir.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_level text;

-- Bawa data battery_level lama (motor) ke fuel_level biar nggak hilang.
UPDATE vehicles
SET fuel_level = battery_level
WHERE fuel_level IS NULL AND battery_level IS NOT NULL;
