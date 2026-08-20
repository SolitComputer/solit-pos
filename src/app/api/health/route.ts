// app/api/health/route.ts (FILE BARU)
export async function GET() {
  return Response.json({ ok: true, ts: Date.now() });
}