// lib/cors.ts
const ALLOWED_ORIGINS = [
  "https://www.solit.id",
  "https://solit.id",
  "https://solit03.com",
  "https://www.solit03.com",
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin", // wajib saat origin dipantulin dinamis, biar cache gak ketuker
  };
}