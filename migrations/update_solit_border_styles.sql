-- ═══════════════════════════════════════════════════════════════════════════
-- Solit Coins — Upgrade animasi border (ala border game)
--
-- Semua BORDER sekarang animated dengan preset = kode border (dipetakan ke
-- animasi unik di komponen SolitBorder). Border Common/Rare yang tadinya
-- gradient statis diubah jadi animated; Epic/Legendary disamakan preset=kode.
--
-- Idempoten (UPDATE by code). Banner (item_type='BANNER') TIDAK diubah.
-- Jalankan di Supabase SQL Editor SETELAH add_solit_coins.sql.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE border_catalog SET style = '{"kind":"animated","preset":"emerald-minimal"}'::jsonb  WHERE code = 'emerald-minimal';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"royal-blue"}'::jsonb        WHERE code = 'royal-blue';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"obsidian-black"}'::jsonb     WHERE code = 'obsidian-black';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"cyber-neon"}'::jsonb         WHERE code = 'cyber-neon';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"amber-flame"}'::jsonb        WHERE code = 'amber-flame';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"amethyst-violet"}'::jsonb    WHERE code = 'amethyst-violet';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"rgb-spin"}'::jsonb           WHERE code = 'rgb-spin';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"aurora-wave"}'::jsonb        WHERE code = 'aurora-wave';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"galaxy-pulse"}'::jsonb       WHERE code = 'galaxy-pulse';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"golden-crown"}'::jsonb       WHERE code = 'golden-crown';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"dragon-flame"}'::jsonb       WHERE code = 'dragon-flame';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"cosmic-starfield"}'::jsonb   WHERE code = 'cosmic-starfield';
UPDATE border_catalog SET style = '{"kind":"animated","preset":"golden-crown"}'::jsonb       WHERE code = 'anniversary-2026';
