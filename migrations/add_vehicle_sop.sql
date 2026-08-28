-- SQL Migration Script: SOP Peminjaman Kendaraan (input admin, dibaca semua role)
-- Jalankan manual di Supabase SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS vehicle_sop (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content    text NOT NULL DEFAULT '',
  updated_by uuid
             CONSTRAINT vehicle_sop_updated_by_fkey
             REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
