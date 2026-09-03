-- ═══════════════════════════════════════════════════════════════════════════
-- Solit Coins — Banner kosmetik (animasi, per-rarity)
--
-- Menambah jenis item "BANNER" ke katalog Solit Coins yang sudah ada. Banner
-- adalah background animasi untuk area banner profil, sejalur dengan border
-- (tier & harga sama polanya). Reuse tabel katalog + inventory yang sudah ada;
-- hanya slot equip banner yang terpisah dari border.
--
-- Aman dijalankan berulang (idempotent). Jalankan SETELAH add_solit_coins.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Bedakan jenis item di katalog (border vs banner).
ALTER TABLE border_catalog
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'BORDER';
ALTER TABLE border_catalog DROP CONSTRAINT IF EXISTS border_catalog_item_type_check;
ALTER TABLE border_catalog ADD CONSTRAINT border_catalog_item_type_check
  CHECK (item_type IN ('BORDER', 'BANNER'));

-- 2. Slot banner yang sedang dipakai (terpisah dari user_equipped_border).
--    Inventory tetap pakai user_border_inventory (generic: border_id → katalog).
CREATE TABLE IF NOT EXISTS user_equipped_banner (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  border_id   uuid NOT NULL REFERENCES border_catalog(id) ON DELETE CASCADE,
  equipped_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Seed banner (item_type='BANNER'). Idempoten via ON CONFLICT (code).
INSERT INTO border_catalog (code, name, tier, price_sc, style, is_purchasable, sort_order, item_type) VALUES
  -- Common (gradient statis)
  ('banner-emerald', 'Emerald Field',    'COMMON',    150, '{"kind":"gradient","colors":["#065f46","#10b981"]}'::jsonb, true, 300, 'BANNER'),
  ('banner-royal',   'Royal Night',      'COMMON',    250, '{"kind":"gradient","colors":["#1e3a8a","#3b82f6"]}'::jsonb, true, 310, 'BANNER'),
  -- Rare (gradient statis)
  ('banner-sunset',  'Sunset Blaze',     'RARE',      600, '{"kind":"gradient","colors":["#7c2d12","#f97316","#fbbf24"]}'::jsonb, true, 320, 'BANNER'),
  ('banner-violet',  'Violet Dream',     'RARE',      800, '{"kind":"gradient","colors":["#4c1d95","#a855f7"]}'::jsonb, true, 330, 'BANNER'),
  -- Epic (animasi)
  ('banner-rgb',     'RGB Flow',         'EPIC',     1500, '{"kind":"animated","preset":"rgb-spin"}'::jsonb, true, 340, 'BANNER'),
  ('banner-aurora',  'Aurora Borealis',  'EPIC',     1800, '{"kind":"animated","preset":"aurora-wave"}'::jsonb, true, 350, 'BANNER'),
  -- Legendary/Mythic (animasi premium)
  ('banner-galaxy',  'Galaxy Drift',     'LEGENDARY', 3000, '{"kind":"animated","preset":"galaxy-pulse"}'::jsonb, true, 360, 'BANNER'),
  ('banner-dragon',  'Dragon Ember',     'LEGENDARY', 4000, '{"kind":"animated","preset":"dragon-flame"}'::jsonb, true, 370, 'BANNER'),
  ('banner-cosmic',  'Cosmic Voyage',    'LEGENDARY', 5000, '{"kind":"animated","preset":"cosmic-starfield"}'::jsonb, true, 380, 'BANNER')
ON CONFLICT (code) DO NOTHING;
