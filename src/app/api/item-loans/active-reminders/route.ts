import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";

// Pengingat tiap 2 hari sekali per pinjaman aktif.
const REMINDER_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface LoanRow {
  id: string;
  item_name: string;
  serial_number: string | null;
  approved_at: string | null;
  last_reminder_at: string | null;
  created_at: string;
}

async function getHandler(_req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    // Ambil semua pinjaman APPROVED milik user ini
    const { data, error } = await supabaseAdmin
      .from("item_loans")
      .select("id, item_name, serial_number, approved_at, last_reminder_at, created_at")
      .eq("borrower_id", user.id)
      .eq("status", "APPROVED");

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    const loans = (data ?? []) as LoanRow[];
    const now = Date.now();

    // Filter yang jatuh tempo:
    // - Anchor = last_reminder_at kalau ada, kalau belum pernah → approved_at
    // - Fallback paling akhir: created_at (jaga-jaga data lama tanpa approved_at)
    const due = loans.filter((l) => {
      const anchorIso = l.last_reminder_at ?? l.approved_at ?? l.created_at;
      if (!anchorIso) return false;
      return now - new Date(anchorIso).getTime() >= REMINDER_INTERVAL_MS;
    });

    if (due.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Tandai sudah diingatkan supaya tidak muncul lagi 2 hari ke depan.
    const nowIso = new Date().toISOString();
    const dueIds = due.map((l) => l.id);
    await supabaseAdmin
      .from("item_loans")
      .update({ last_reminder_at: nowIso })
      .in("id", dueIds);

    // Kirim info lengkap ke client untuk ditampilkan di toast.
    return NextResponse.json({
      success: true,
      data: due.map((l) => ({
        id: l.id,
        item_name: l.item_name,
        serial_number: l.serial_number,
        approved_at: l.approved_at,
        days_since_approved: l.approved_at
          ? Math.floor((now - new Date(l.approved_at).getTime()) / DAY_MS)
          : null,
      })),
    });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);