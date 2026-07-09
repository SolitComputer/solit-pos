import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES } from "@/lib/permissions";

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
    try {
        const url = new URL(req.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const scope = url.searchParams.get("scope"); // "all"

        // Ambil semua order dalam rentang waktu
        let query = supabase
            .from("preparation_orders")
            .select(
                "created_by_name, done_by_name, created_at, received_at, done_at, dispatched_at, dispatched_by_name, status"
            )
            .neq("status", "DIBATALKAN")
            .order("created_at", { ascending: true });

        if (scope !== "all") {
            if (from) query = query.gte("created_at", from);
            if (to) query = query.lt("created_at", to);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = data ?? [];

        // ── Helper: format jam WIB dari ISO string ──────────────────────────────
        const toWIBHour = (iso: string): number => {
            const d = new Date(iso);
            return (d.getUTCHours() + 7) % 24;
        };
        const toWIBMinute = (iso: string): number => new Date(iso).getUTCMinutes();
        const toWIBTimeStr = (iso: string): string => {
            const h = toWIBHour(iso);
            const m = toWIBMinute(iso);
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        };
        const toWeekKey = (iso: string): string => {
            // ISO week: YYYY-Www
            const d = new Date(iso);
            const wibD = new Date(d.getTime() + 7 * 3600_000);
            const dayOfWeek = wibD.getUTCDay() || 7;
            wibD.setUTCDate(wibD.getUTCDate() + 4 - dayOfWeek);
            const yearStart = new Date(Date.UTC(wibD.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((wibD.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
            return `${wibD.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
        };
        const diffMin = (a: string | null, b: string | null): number | null => {
            if (!a || !b) return null;
            const d = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
            return d >= 0 && d < 1440 ? Math.round(d) : null;
        };

        // ── Agregasi per SALES (created_by_name) ────────────────────────────────
        // Untuk setiap sales: jam mulai & selesai kerja per hari, avg durasi per minggu
        type PersonStat = {
            name: string;
            role: "sales" | "penyedia";
            // Waktu kerja: earliest created_at (WIB) dan latest dispatched_at/done_at per hari
            earliest_times: number[]; // jam mulai dalam menit dari tengah malam WIB
            latest_times: number[]; // jam selesai dalam menit dari tengah malam WIB
            // Rata-rata durasi per minggu (jumlah order per minggu)
            weekly_counts: Record<string, number>;
            // Durasi penyiapan (hanya penyedia)
            prep_durations: number[];
            // Total
            total_orders: number;
            // Jam kerja paling awal dan paling akhir (untuk display)
            earliest_time_str: string;
            latest_time_str: string;
            avg_per_week: number;
            avg_prep_min: number | null; // hanya penyedia
        };

        const salesMap = new Map<string, PersonStat>();
        const penyediaMap = new Map<string, PersonStat>();

        const ensurePerson = (map: Map<string, PersonStat>, name: string, role: "sales" | "penyedia") => {
            if (!map.has(name)) {
                map.set(name, {
                    name, role,
                    earliest_times: [], latest_times: [],
                    weekly_counts: {}, prep_durations: [],
                    total_orders: 0,
                    earliest_time_str: "", latest_time_str: "",
                    avg_per_week: 0, avg_prep_min: null,
                });
            }
            return map.get(name)!;
        };

        for (const o of rows) {
            // SALES: berdasarkan created_by_name + created_at
            if (o.created_by_name && o.created_at) {
                const s = ensurePerson(salesMap, o.created_by_name, "sales");
                s.total_orders++;

                // Jam mulai = waktu buat format (WIB menit dari tengah malam)
                const startMin = toWIBHour(o.created_at) * 60 + toWIBMinute(o.created_at);
                s.earliest_times.push(startMin);

                // Jam selesai = dispatched_at kalau ada, fallback created_at
                const endIso = o.dispatched_at || o.created_at;
                const endMin = toWIBHour(endIso) * 60 + toWIBMinute(endIso);
                s.latest_times.push(endMin);

                // Per minggu
                const wk = toWeekKey(o.created_at);
                s.weekly_counts[wk] = (s.weekly_counts[wk] ?? 0) + 1;
            }

            // PENYEDIA: berdasarkan done_by_name + received_at → done_at
            if (o.done_by_name && o.done_at) {
                const p = ensurePerson(penyediaMap, o.done_by_name, "penyedia");
                p.total_orders++;

                // Jam mulai penyedia = received_at (kalau ada) atau done_at
                const startIso = o.received_at || o.done_at;
                const startMin = toWIBHour(startIso) * 60 + toWIBMinute(startIso);
                p.earliest_times.push(startMin);

                // Jam selesai penyedia = done_at
                const endMin = toWIBHour(o.done_at) * 60 + toWIBMinute(o.done_at);
                p.latest_times.push(endMin);

                // Per minggu
                const wk = toWeekKey(o.done_at);
                p.weekly_counts[wk] = (p.weekly_counts[wk] ?? 0) + 1;

                // Durasi penyiapan
                const dur = diffMin(o.received_at, o.done_at);
                if (dur !== null) p.prep_durations.push(dur);
            }
        }

        // ── Finalisasi perhitungan ───────────────────────────────────────────────
        const finalize = (map: Map<string, PersonStat>): any[] => {
            return Array.from(map.values()).map(p => {
                // Jam paling awal (median dari percentile 10% biar gak kena outlier)
                const sortedEarliest = [...p.earliest_times].sort((a, b) => a - b);
                const sortedLatest = [...p.latest_times].sort((a, b) => a - b);

                const pct = (arr: number[], pct: number) => arr[Math.floor(arr.length * pct)] ?? arr[0];

                const earliestMin = pct(sortedEarliest, 0.1); // P10 = biasanya jam mulai
                const latestMin = pct(sortedLatest, 0.9);   // P90 = biasanya jam selesai

                const toHHMM = (totalMin: number) => {
                    const h = Math.floor(totalMin / 60) % 24;
                    const m = totalMin % 60;
                    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                };

                // Rata-rata per minggu
                const weeks = Object.values(p.weekly_counts);
                const avgPerWeek = weeks.length > 0
                    ? Math.round(weeks.reduce((s, v) => s + v, 0) / weeks.length)
                    : 0;

                // Avg durasi penyiapan
                const avgPrepMin = p.prep_durations.length > 0
                    ? Math.round(p.prep_durations.reduce((s, v) => s + v, 0) / p.prep_durations.length)
                    : null;

                return {
                    name: p.name,
                    role: p.role,
                    total_orders: p.total_orders,
                    earliest_time: toHHMM(earliestMin ?? 0),
                    latest_time: toHHMM(latestMin ?? 0),
                    avg_per_week: avgPerWeek,
                    avg_prep_min: avgPrepMin,
                    week_count: weeks.length,
                };
            }).sort((a, b) => b.total_orders - a.total_orders);
        };

        return NextResponse.json({
            success: true,
            sales: finalize(salesMap),
            penyedia: finalize(penyediaMap),
        });
    } catch (err) {
        console.error("[GET /api/preparation/person-stats]", err);
        return NextResponse.json({ success: false, message: "Gagal mengambil data" }, { status: 500 });
    }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);