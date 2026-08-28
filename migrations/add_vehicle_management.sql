-- SQL Migration Script: Fitur Manajemen Kendaraan (peminjaman kendaraan operasional)
-- Jalankan manual di Supabase SQL editor (sesuai konvensi folder migrations/).
-- Idempotent: aman dijalankan ulang.

-- 1. Tabel master kendaraan
CREATE TABLE IF NOT EXISTS vehicles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  type          text NOT NULL DEFAULT 'MOTOR'
                CHECK (type IN ('MOTOR', 'MOBIL')),
  status        text NOT NULL DEFAULT 'TERSEDIA'
                CHECK (status IN ('TERSEDIA', 'DIPAKAI', 'MAINTENANCE')),
  -- battery_level cuma relevan buat motor listrik, boleh null
  battery_level text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Tabel pengajuan peminjaman kendaraan
CREATE TABLE IF NOT EXISTS vehicle_borrow_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        uuid NOT NULL
                    CONSTRAINT vehicle_borrow_requests_vehicle_id_fkey
                    REFERENCES vehicles (id) ON DELETE CASCADE,
  user_id           uuid NOT NULL
                    CONSTRAINT vehicle_borrow_requests_user_id_fkey
                    REFERENCES users (id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
  requested_at      timestamptz NOT NULL DEFAULT now(),
  -- approved_by dipakai buat approver DAN rejecter (siapa admin yang meng-ACC/menolak)
  approved_by       uuid
                    CONSTRAINT vehicle_borrow_requests_approved_by_fkey
                    REFERENCES users (id) ON DELETE SET NULL,
  approved_at       timestamptz,
  rejection_note    text,
  actual_start      timestamptz,
  actual_end        timestamptz,
  return_fuel_level text,
  return_condition  text
                    CHECK (return_condition IN ('BAIK', 'LECET', 'RUSAK')),
  duration_minutes  integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 3. Index buat query yang sering dipakai
CREATE INDEX IF NOT EXISTS idx_vbr_status      ON vehicle_borrow_requests (status);
CREATE INDEX IF NOT EXISTS idx_vbr_user_id     ON vehicle_borrow_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_vbr_vehicle_id  ON vehicle_borrow_requests (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles (status);
