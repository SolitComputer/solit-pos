-- ═══════════════════════════════════════════════════════════════════════════
-- Solit Coins — Upgrade border ke asset PNG (AI-generated, ganti dari CSS)
--
-- Semua border pindah dari style "animated" (conic-gradient CSS) ke "asset"
-- (PNG ring asli). File disajikan langsung dari /public/assets/border/ (Next.js
-- static asset), BUKAN Supabase Storage — jadi ringImage cukup path relatif.
--
-- anniversary-2026: ring masih placeholder (slot medali kosong, logo Solit 03
-- belum ditempel). medallionImage BELUM diisi — nyusul migration terpisah
-- begitu file logo terpisah/ring final tersedia.
--
-- Belum ada overlayVideo (WebM) untuk semua border — ring statis dulu, animasi
-- overlay nyusul kalau asetnya sudah dibuat.
--
-- Idempoten (UPDATE by code). Jalankan di Supabase SQL Editor SETELAH
-- add_solit_coins.sql.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/emerald-minimal.png"}'::jsonb   WHERE code = 'emerald-minimal';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/royal-blue.png"}'::jsonb         WHERE code = 'royal-blue';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/obsidian-black.png"}'::jsonb     WHERE code = 'obsidian-black';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/cyber-neon.png"}'::jsonb         WHERE code = 'cyber-neon';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/amber-flame.png"}'::jsonb        WHERE code = 'amber-flame';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/amethyst-violet.png"}'::jsonb    WHERE code = 'amethyst-violet';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/rgb-spin.png"}'::jsonb           WHERE code = 'rgb-spin';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/aurora-wave.png"}'::jsonb        WHERE code = 'aurora-wave';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/galaxy-pulse.png"}'::jsonb       WHERE code = 'galaxy-pulse';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/golden-crown.png"}'::jsonb       WHERE code = 'golden-crown';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/dragon-flame.png"}'::jsonb       WHERE code = 'dragon-flame';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/cosmic-starfield.png"}'::jsonb   WHERE code = 'cosmic-starfield';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/border/anniversary-2026.png"}'::jsonb   WHERE code = 'anniversary-2026';
