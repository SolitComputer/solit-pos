-- ═══════════════════════════════════════════════════════════════════════════
-- Fitur Gamifikasi "Solit Coins" (SC)
--
-- Sistem currency kosmetik + quest harian. TERPISAH TOTAL dari sistem Lencana
-- dan gaji: Solit Coins TIDAK PERNAH muncul di perhitungan gaji/slip gaji.
-- Progress misi dihitung real-time dari tabel operasional (read-only); yang
-- disimpan di sini hanya status KLAIM (anti double-claim), saldo, katalog
-- border, koleksi, dan border yang di-equip.
--
-- Aman dijalankan berulang (idempotent). Jalankan di Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Dompet SC per user ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_wallets (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance    int NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Klaim misi (bukan progress — progress dihitung real-time) ─────────────
-- period_key: day-key 04:00 WIB (misi DAILY) / week-key Senin (misi WEEKLY).
-- UNIQUE (user_id, quest_key, period_key) = kunci anti double-claim.
CREATE TABLE IF NOT EXISTS quest_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_key   text NOT NULL,
  period_type text NOT NULL,
  period_key  text NOT NULL,
  reward_sc   int  NOT NULL DEFAULT 0,
  claimed_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quest_progress DROP CONSTRAINT IF EXISTS quest_progress_period_type_check;
ALTER TABLE quest_progress ADD CONSTRAINT quest_progress_period_type_check
  CHECK (period_type IN ('DAILY', 'WEEKLY'));
CREATE UNIQUE INDEX IF NOT EXISTS quest_progress_unique
  ON quest_progress (user_id, quest_key, period_key);
CREATE INDEX IF NOT EXISTS quest_progress_user_period
  ON quest_progress (user_id, period_key);

-- ─── 3. Katalog border (master) ──────────────────────────────────────────────
-- style jsonb: {"kind":"gradient","colors":[...]} atau {"kind":"animated","preset":"..."}
CREATE TABLE IF NOT EXISTS border_catalog (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text UNIQUE NOT NULL,
  name           text NOT NULL,
  tier           text NOT NULL,
  price_sc       int  NOT NULL DEFAULT 0 CHECK (price_sc >= 0),
  style          jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_purchasable boolean NOT NULL DEFAULT true,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE border_catalog DROP CONSTRAINT IF EXISTS border_catalog_tier_check;
ALTER TABLE border_catalog ADD CONSTRAINT border_catalog_tier_check
  CHECK (tier IN ('COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'LIMITED'));

-- ─── 4. Koleksi border milik user ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_border_inventory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  border_id   uuid NOT NULL REFERENCES border_catalog(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_border_inventory_unique
  ON user_border_inventory (user_id, border_id);

-- ─── 5. Border yang sedang dipakai (equip) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_equipped_border (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  border_id   uuid NOT NULL REFERENCES border_catalog(id) ON DELETE CASCADE,
  equipped_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC — operasi yang menyentuh saldo dibungkus fungsi agar ATOMIC.
-- ═══════════════════════════════════════════════════════════════════════════

-- Klaim misi: idempoten lewat UNIQUE (user_id, quest_key, period_key).
-- Route yang verifikasi "misi selesai"; fungsi ini yang mencegah double-claim.
CREATE OR REPLACE FUNCTION sc_claim_quest(
  p_user_id     uuid,
  p_quest_key   text,
  p_period_type text,
  p_period_key  text,
  p_reward      int
) RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted int;
  v_balance  int;
BEGIN
  INSERT INTO quest_progress (user_id, quest_key, period_type, period_key, reward_sc, claimed_at)
  VALUES (p_user_id, p_quest_key, p_period_type, p_period_key, p_reward, now())
  ON CONFLICT (user_id, quest_key, period_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'already_claimed';
  END IF;

  INSERT INTO user_wallets (user_id, balance, updated_at)
  VALUES (p_user_id, GREATEST(p_reward, 0), now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance = user_wallets.balance + GREATEST(p_reward, 0), updated_at = now()
  RETURNING balance INTO v_balance;

  RETURN v_balance;
END;
$$;

-- Beli border: cek katalog, is_purchasable, kepemilikan, saldo — semua atomic.
CREATE OR REPLACE FUNCTION sc_purchase_border(
  p_user_id   uuid,
  p_border_id uuid
) RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_price       int;
  v_purchasable boolean;
  v_balance     int;
  v_owned       int;
BEGIN
  SELECT price_sc, is_purchasable INTO v_price, v_purchasable
  FROM border_catalog WHERE id = p_border_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'border_not_found';
  END IF;
  IF NOT v_purchasable THEN
    RAISE EXCEPTION 'not_purchasable';
  END IF;

  SELECT count(*) INTO v_owned FROM user_border_inventory
  WHERE user_id = p_user_id AND border_id = p_border_id;
  IF v_owned > 0 THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  -- Pastikan baris wallet ada, lalu kunci untuk cek saldo.
  INSERT INTO user_wallets (user_id, balance, updated_at)
  VALUES (p_user_id, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM user_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance < v_price THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE user_wallets SET balance = balance - v_price, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO user_border_inventory (user_id, border_id, acquired_at)
  VALUES (p_user_id, p_border_id, now());

  RETURN v_balance;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed katalog border. Idempoten via ON CONFLICT (code).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO border_catalog (code, name, tier, price_sc, style, is_purchasable, sort_order) VALUES
  -- Common (animasi halus)
  ('emerald-minimal',  'Emerald Minimal',   'COMMON',    100, '{"kind":"animated","preset":"emerald-minimal"}'::jsonb, true, 10),
  ('royal-blue',       'Royal Blue',        'COMMON',    175, '{"kind":"animated","preset":"royal-blue"}'::jsonb, true, 20),
  ('obsidian-black',   'Obsidian Black',    'COMMON',    250, '{"kind":"animated","preset":"obsidian-black"}'::jsonb, true, 30),
  -- Rare (animasi neon)
  ('cyber-neon',       'Cyber Neon Cyan',   'RARE',      500, '{"kind":"animated","preset":"cyber-neon"}'::jsonb, true, 40),
  ('amber-flame',      'Amber Flame',       'RARE',      650, '{"kind":"animated","preset":"amber-flame"}'::jsonb, true, 50),
  ('amethyst-violet',  'Amethyst Violet',   'RARE',      800, '{"kind":"animated","preset":"amethyst-violet"}'::jsonb, true, 60),
  -- Epic (animasi)
  ('rgb-spin',         'RGB Rainbow Spin',  'EPIC',     1200, '{"kind":"animated","preset":"rgb-spin"}'::jsonb, true, 70),
  ('aurora-wave',      'Aurora Wave',       'EPIC',     1500, '{"kind":"animated","preset":"aurora-wave"}'::jsonb, true, 80),
  ('galaxy-pulse',     'Galaxy Pulse',      'EPIC',     1800, '{"kind":"animated","preset":"galaxy-pulse"}'::jsonb, true, 90),
  -- Legendary/Mythic (animasi premium)
  ('golden-crown',     'Golden Crown Aura', 'LEGENDARY', 2500, '{"kind":"animated","preset":"golden-crown"}'::jsonb, true, 100),
  ('dragon-flame',     'Dragon Flame',      'LEGENDARY', 3500, '{"kind":"animated","preset":"dragon-flame"}'::jsonb, true, 110),
  ('cosmic-starfield', 'Cosmic Starfield',  'LEGENDARY', 5000, '{"kind":"animated","preset":"cosmic-starfield"}'::jsonb, true, 120),
  -- Limited/Event (tidak dijual, event-only)
  ('anniversary-2026', 'Ultah Solit 2026',  'LIMITED',      0, '{"kind":"animated","preset":"golden-crown"}'::jsonb, false, 200)
ON CONFLICT (code) DO NOTHING;
