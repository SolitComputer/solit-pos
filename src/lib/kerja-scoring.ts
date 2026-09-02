import { supabaseAdmin } from "@/services/supabaseAdmin";

const RAYHAN_ACCOUNTING_USER_ID = "7a0aacab-961c-4332-b4bf-361431126f77";

// Sales Offline — CUMA 4 orang spesifik ini (bukan semua role yang
// mengandung "SALES"), makanya dicek via ID, bukan hasRole("SALES").
const SALES_OFFLINE_USER_IDS = [
  "2c570a8b-9c98-46f5-ad86-b0b0953a2afc", // Novita Glory Sendouw
  "1b59e57c-94cf-4dd1-b5fb-7173ecb03cad", // Andini Sazkia Putri
  "26f13a77-9179-4ac7-97ec-e1dfa1af4096", // Amaliyah
  "680c7e1c-512b-4223-85f2-df38dcdd7a97", // Nova Rovatul Walidah
];
// ke scoring & divisi Programmer lewat ID (bukan lewat hasRole("PROGRAMMER")).
const PROGRAMMER_USER_IDS = [
  "3d8fe0d7-1735-492d-afe8-71991154c066",
  "63d839c4-f019-40da-b673-52a6e3a854eb",
  "a106053f-8168-4574-9586-6049300bb614",
  "a136bb0a-d6de-4439-946c-c17a85b11a67",
];
// Sales Online — role yang dapat poin dari Laporan Harian Sales (chat leads),
// role-based (bukan per akun). Harus disamakan manual dengan
// SALES_REPORT_ROLES di src/lib/permissions.ts.
const SALES_ONLINE_ROLES = [
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "KEPALA_SOTECH",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_ZENITH", "PKL_SALES",
];

export type KerjaScoreRow = {
  id: string;
  name: string;
  role: string;
  photo_url: null;
  score: number;
  metrics: { label: string; value: number; unit?: string }[];
};

// Dipakai oleh /api/leaderboard-kerja (live, periode today/week/month relatif
// ke hari ini) DAN /api/leaderboard-kerja/quality-rank (snapshot bulanan untuk
// lencana). Logic scoring HARUS SAMA PERSIS di kedua tempat — makanya diekstrak
// ke sini, jangan duplikat lagi di route lain.
export async function computeKerjaScores(startDate: Date, endDate: Date): Promise<KerjaScoreRow[]> {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  const { data: rawUsers, error } = await supabaseAdmin
    .from("users")
    .select("id, name, role, roles");

  if (error || !rawUsers) throw new Error("Gagal mengambil data user: " + (error?.message || ""));

  const usersData = rawUsers.filter((u) => {
    const name = (u.name || "").toLowerCase();
    return name !== "admin" && name !== "administrator";
  });

  const [
    { data: transactions },
    { data: preparations },
    { data: serviceOrders },
    { data: ccReports },
    { data: ccPostings },
    { data: cashflows },
    { data: activities },
    { data: journalLogs },
    { data: cashflowAudits },
    { data: todos },
    { data: todoItems },
    { data: missions },
    { data: salesOnlineReports }
  ] = await Promise.all([
    supabaseAdmin
      .from("transactions")
      .select("sales_id, invoice_number, amount, status")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .eq("status", "PAID"),

    supabaseAdmin
      .from("preparation_orders")
      .select("id, order_number, created_by, done_by, received_by, status, created_at, done_at, delivery_user_id, delivery_user_name, delivery_method, delivered_at, preparation_items(id, is_cancelled)")
      .gte("created_at", startIso)
      .lte("created_at", endIso),

    supabaseAdmin
      .from("service_orders")
      .select("id, status, dikerjakan_by, tanggal_selesai, tanggal_diambil")
      .in("status", ["DONE", "SUDAH_DIAMBIL"]),

    supabaseAdmin
      .from("cc_reports")
      .select("id, take_done, take_done_by, take_done_at, edit_done, edit_done_by, edit_done_at")
      .or("take_done.eq.true,edit_done.eq.true"),

    supabaseAdmin
      .from("cc_postings")
      .select("id, created_by, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),

    supabaseAdmin
      .from("cashflow_entries")
      .select("id, created_by, source_type")
      .gte("created_at", startIso)
      .lte("created_at", endIso),

    supabaseAdmin
      .from("activity_logs")
      .select("user_id, action, entity")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .in("action", ["CREATE", "SO", "MINUS_FIXED", "AUDIT"])
      .in("entity", ["laptop", "unit"]),

    supabaseAdmin
      .from("journal_audit_logs")
      .select("changed_by, action")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .in("action", ["CREATE", "CONFIRM"]),

    supabaseAdmin
      .from("cashflow_entries")
      .select("audited_by, audited_at")
      .not("audited_by", "is", null)
      .gte("audited_at", startIso)
      .lte("audited_at", endIso),

    supabaseAdmin
      .from("todos")
      .select("id, completed_by, completed_at")
      .not("completed_by", "is", null)
      .gte("completed_at", startIso)
      .lte("completed_at", endIso),

    supabaseAdmin
      .from("todo_items")
      .select("id, todo_id, completed_by, completed_at"),

    supabaseAdmin
      .from("missions")
      .select("id, assigned_to, status")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .eq("status", "DONE"),

    supabaseAdmin
      .from("sales_online_reports")
      .select("id, filled_by")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
  ]);

  const itemCountByTodoId = new Map<string, number>();
  (todoItems ?? []).forEach((it: any) => {
    itemCountByTodoId.set(it.todo_id, (itemCountByTodoId.get(it.todo_id) ?? 0) + 1);
  });

  const leaderboard: KerjaScoreRow[] = usersData.map((u) => {
    let score = 0;
    let metrics: { label: string; value: number; unit?: string }[] = [];
    const uid = u.id;
    const userRoles = u.roles || [u.role];
    const hasRole = (roleMatch: string) => userRoles.some((r: string) => r && r.includes(roleMatch));

    const uTransactions = (transactions ?? []).filter((t: any) => t.sales_id === uid);
    if (SALES_OFFLINE_USER_IDS.includes(uid)) {
      score += uTransactions.length * 5;
      metrics.push({ label: "Customer Dilayani", value: uTransactions.length, unit: "trx" });
    }

    const uSalesOnlineReports = (salesOnlineReports ?? []).filter((r: any) => r.filled_by === uid);
    if (userRoles.some((r: string) => SALES_ONLINE_ROLES.includes(r))) {
      score += uSalesOnlineReports.length * 1;
      metrics.push({ label: "Chat Dilayani", value: uSalesOnlineReports.length, unit: "chat" });
    }

    const uPreparations = (preparations ?? []).filter((p: any) => p.done_by === uid && p.done_at);
    if (hasRole("PENYEDIA")) {
      let fullUnits = 0;
      let qcOnlyUnits = 0;
      uPreparations.forEach((p: any) => {
        const unitCount = (p.preparation_items ?? []).filter((it: any) => !it.is_cancelled).length;
        if (p.received_by && p.received_by === p.done_by) {
          fullUnits += unitCount;
        } else {
          qcOnlyUnits += unitCount;
        }
      });
      score += fullUnits * 3 + qcOnlyUnits * 1.5;

      let totalSpeedMs = 0;
      let speedCount = 0;
      uPreparations.forEach((p: any) => {
        if (p.created_at && p.done_at) {
          const ms = new Date(p.done_at).getTime() - new Date(p.created_at).getTime();
          if (ms > 0) {
            totalSpeedMs += ms;
            speedCount++;
          }
        }
      });

      const avgSpeedMinutes = speedCount > 0 ? Math.round((totalSpeedMs / speedCount) / 60000) : 0;
      metrics.push({ label: "Unit Selesai Penuh", value: fullUnits, unit: "unit" });
      metrics.push({ label: "Unit QC Saja", value: qcOnlyUnits, unit: "unit" });
      metrics.push({ label: "Kecepatan Rata-rata", value: avgSpeedMinutes, unit: "menit" });
    }

    const uDeliveries = (preparations ?? []).filter(
      (p: any) =>
        p.delivery_user_id === uid &&
        p.delivery_method === "PENGANTARAN" &&
        p.status === "SELESAI" &&
        p.delivered_at
    );
    if (hasRole("PENGANTARAN")) {
      score += uDeliveries.length * 6;
      metrics.push({ label: "Berhasil Diantar", value: uDeliveries.length, unit: "order" });
    }

    const uServices = (serviceOrders ?? []).filter((s) => {
      if (s.dikerjakan_by !== uid) return false;
      const doneIso = s.status === "SUDAH_DIAMBIL" ? s.tanggal_diambil : s.tanggal_selesai;
      if (!doneIso) return false;
      const doneMs = new Date(doneIso).getTime();
      return doneMs >= startDate.getTime() && doneMs <= endDate.getTime();
    });
    if (hasRole("TEKNISI")) {
      score += uServices.length * 5;
      metrics.push({ label: "Laptop Solved", value: uServices.length, unit: "unit" });
    }

    const uTakeReports = (ccReports ?? []).filter((c: any) => {
      if (c.take_done_by !== uid || !c.take_done_at) return false;
      const ms = new Date(c.take_done_at).getTime();
      return ms >= startDate.getTime() && ms <= endDate.getTime();
    });
    const uEditReports = (ccReports ?? []).filter((c: any) => {
      if (c.edit_done_by !== uid || !c.edit_done_at) return false;
      const ms = new Date(c.edit_done_at).getTime();
      return ms >= startDate.getTime() && ms <= endDate.getTime();
    });
    const uPostings = (ccPostings ?? []).filter((p: any) => p.created_by === uid);
    if (hasRole("KONTEN")) {
      score += uTakeReports.length * 4 + uEditReports.length * 4 + uPostings.length * 1;
      metrics.push({ label: "Take Video", value: uTakeReports.length, unit: "konten" });
      metrics.push({ label: "Edit Selesai", value: uEditReports.length, unit: "konten" });
      metrics.push({ label: "Upload", value: uPostings.length, unit: "post" });
    }

    if (hasRole("PURCHASING")) {
      const uManualCashflows = (cashflows ?? []).filter(
        (c) => c.created_by === uid && c.source_type === "MANUAL"
      );
      score += uManualCashflows.length * 1;
      metrics.push({ label: "Input Cashflow", value: uManualCashflows.length, unit: "data" });
    }

    const uActivities = (activities ?? []).filter((a: any) => a.user_id === uid);
    const uInputBarang = uActivities.filter((a: any) => a.action === "CREATE" && a.entity === "unit");
    const uSo = uActivities.filter((a: any) => a.action === "SO");
    const uMinusFixed = uActivities.filter((a: any) => a.action === "MINUS_FIXED");
    if (hasRole("PENGELOLA")) {
      score += uInputBarang.length * 1 + uSo.length * 0.3 + uMinusFixed.length * 5;
      metrics.push({ label: "Input Barang", value: uInputBarang.length, unit: "unit" });
    }

    const uJournalLogs = (journalLogs ?? []).filter((j: any) => j.changed_by === uid);
    const uPembukuanManual = uJournalLogs.filter((j: any) => j.action === "CREATE");
    const uPembukuanKonfirmasi = uJournalLogs.filter((j: any) => j.action === "CONFIRM");
    const uCashflowAudits = (cashflowAudits ?? []).filter((c: any) => c.audited_by === uid);
    const uDataBarangAudits = uActivities.filter((a: any) => a.action === "AUDIT");
    const uAuditTotal = uCashflowAudits.length + uDataBarangAudits.length;
    if (hasRole("ACCOUNTING") || uid === RAYHAN_ACCOUNTING_USER_ID) {
      score += uPembukuanManual.length * 0.3 + uPembukuanKonfirmasi.length * 0.2 + uAuditTotal * 0.5;
      metrics.push({ label: "Jurnal Manual", value: uPembukuanManual.length, unit: "entry" });
      metrics.push({ label: "Konfirmasi Pending", value: uPembukuanKonfirmasi.length, unit: "entry" });
      metrics.push({ label: "Audit", value: uAuditTotal, unit: "aksi" });
    }

    const uSubtaskCompletions = (todoItems ?? []).filter((it: any) => {
      if (it.completed_by !== uid || !it.completed_at) return false;
      const ms = new Date(it.completed_at).getTime();
      return ms >= startDate.getTime() && ms <= endDate.getTime();
    });
    const uTodoFallbackCompletions = (todos ?? []).filter((t: any) => {
      if (t.completed_by !== uid || !t.completed_at) return false;
      if ((itemCountByTodoId.get(t.id) ?? 0) > 0) return false;
      const ms = new Date(t.completed_at).getTime();
      return ms >= startDate.getTime() && ms <= endDate.getTime();
    });
    const uTodoUnits = uSubtaskCompletions.length + uTodoFallbackCompletions.length;
    if (hasRole("PROGRAMMER") || PROGRAMMER_USER_IDS.includes(uid)) {
      score += uTodoUnits * 3;
      metrics.push({ label: "Tugas Selesai", value: uTodoUnits, unit: "item" });
    }

    return {
      id: u.id,
      name: u.name,
      role: u.role,
      photo_url: null,
      score,
      metrics
    };
  });

  return leaderboard;
}