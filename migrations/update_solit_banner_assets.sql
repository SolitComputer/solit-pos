-- ═══════════════════════════════════════════════════════════════════════════
-- Solit Coins — Upgrade banner ke asset PNG (corner ornament AI-generated)
--
-- Semua banner pindah dari style "gradient"/"animated" polos ke "asset":
-- 4 sudut pakai PNG ornamen (1 file di-mirror/rotate jadi 4 sudut oleh
-- SolitBanner.tsx), garis penghubung antar-sudut tetap CSS animated
-- (linePreset → class .sb-frame-<linePreset>).
--
-- File disajikan dari /public/assets/banner/ (Next.js static asset), bukan
-- Supabase Storage — ringImage cukup path relatif.
--
-- Idempoten (UPDATE by code). Jalankan di Supabase SQL Editor SETELAH
-- add_solit_banners.sql.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-emerald.png","linePreset":"emerald"}'::jsonb         WHERE code = 'banner-emerald';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-royal.png","linePreset":"royal"}'::jsonb             WHERE code = 'banner-royal';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-sunset.png","linePreset":"sunset"}'::jsonb           WHERE code = 'banner-sunset';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-violet.png","linePreset":"violet"}'::jsonb           WHERE code = 'banner-violet';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-rgb.png","linePreset":"rgb-spin"}'::jsonb            WHERE code = 'banner-rgb';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-aurora.png","linePreset":"aurora-wave"}'::jsonb      WHERE code = 'banner-aurora';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-galaxy.png","linePreset":"galaxy-pulse"}'::jsonb     WHERE code = 'banner-galaxy';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-dragon.png","linePreset":"dragon-flame"}'::jsonb     WHERE code = 'banner-dragon';
UPDATE border_catalog SET style = '{"kind":"asset","ringImage":"/assets/banner/banner-cosmic.png","linePreset":"cosmic-starfield"}'::jsonb WHERE code = 'banner-cosmic';
