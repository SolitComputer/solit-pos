import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const RAYHAN_ACCOUNTING_USER_ID = "7a0aacab-961c-4332-b4bf-361431126f77";

export const GET = withAuth(async (req, _ctx, user) => {
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") ?? "today";

    // Define time ranges
    const now = new Date();
    // Jakarta timezone calculation
    now.setHours(now.getHours() + 7);
    let startDate = new Date(now);
    let endDate = new Date(now);

    if (period === "today") {
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    } else if (period === "week") {
      const day = startDate.getUTCDay();
      const diff = startDate.getUTCDate() - day + (day === 0 ? -6 : 1);
      startDate.setUTCDate(diff);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    } else if (period === "month") {
      startDate.setUTCDate(1);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCMonth(endDate.getUTCMonth() + 1, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // 1. Fetch all non-admin users
    const { data: rawUsers, error } = await supabaseAdmin
      .from("users")
      .select("id, name, role, roles");

    if (error || !rawUsers) throw new Error("Gagal mengambil data user: " + (error?.message || ""));

    // Filter out users named 'Admin'
    const usersData = rawUsers.filter((u) => {
      const name = (u.name || "").toLowerCase();
      return name !== "admin" && name !== "administrator";
    });

    const [
      { data: transactions },
      { data: preparations },
      { data: serviceOrders },
      { data: ccReports },
      { data: cashflows },
      { data: activities },
      { data: journalLogs },
      { data: cashflowAudits },
      { data: missions }
    ] = await Promise.all([
      // Sales: transactions
      supabaseAdmin
        .from("transactions")
        .select("created_by, invoice, total_amount, status")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .eq("status", "LUNAS"),

      // Penyedia Barang / Pengantaran: preparations (all records to count both creators and preparers)
      supabaseAdmin
        .from("preparation_orders")
        .select("id, order_number, created_by, done_by, received_by, status, created_at, done_at, delivery_user_id, delivery_user_name, delivery_method, delivered_at, preparation_items(id, is_cancelled)")
        .gte("created_at", startIso)
        .lte("created_at", endIso),

      supabaseAdmin
        .from("service_orders")
        .select("id, status, dikerjakan_by, tanggal_selesai, tanggal_diambil")
        .in("status", ["DONE", "SUDAH_DIAMBIL"]),

      // Konten: cc_reports
      supabaseAdmin
        .from("cc_reports")
        .select("id, created_by_id")
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

      // Accounting: audit Cashflow — is_audited di-toggle lewat PATCH
      // /api/cashflow/[id] (action "toggle_audit"), yang SUDAH mencatat
      // audited_by (user id) & audited_at LANGSUNG di cashflow_entries
      // sendiri — tidak perlu tabel log terpisah.
      supabaseAdmin
        .from("cashflow_entries")
        .select("audited_by, audited_at")
        .not("audited_by", "is", null)
        .gte("audited_at", startIso)
        .lte("audited_at", endIso),

      // Missions: (all)
      supabaseAdmin
        .from("missions")
        .select("id, assigned_to, status")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .eq("status", "DONE")
    ]);

    // Calculate score per user
    const leaderboard = usersData.map((u) => {
      let score = 0;
      let metrics = [];
      const uid = u.id;
      const userRoles = u.roles || [u.role];
      const hasRole = (roleMatch: string) => userRoles.some((r: string) => r && r.includes(roleMatch));

      // TRANSACTIONS (Sales) — DINONAKTIFKAN SEMENTARA, cuma Purchasing dulu yang aktif.
      // Uncomment blok ini kapan aja buat aktifin lagi scoring Sales.
      // const uTransactions = (transactions ?? []).filter((t) => t.created_by === uid);
      // const uFormats = (preparations ?? []).filter((p) => p.created_by === uid);
      // if (uTransactions.length > 0 || uFormats.length > 0 || hasRole("SALES")) {
      //   score += uTransactions.length * 20; // 20 points per transaction
      //   score += uFormats.length * 5; // 5 points per format
      //   metrics.push({ label: "Total Payment", value: uTransactions.length, unit: "trx" });
      //   metrics.push({ label: "Buat Format", value: uFormats.length, unit: "order" });
      // }

      // PREPARATIONS (Penyedia Barang) — per UNIT laptop (bukan per order):
      // 3 poin kalau received_by === done_by (satu orang terima order SAMPAI
      // selesai cek semua unit sendiri). 1,5 poin kalau beda orang (done_by
      // cuma finalize/QC akhir, bukan yang menerima order di awal). Unit yang
      // is_cancelled tidak dihitung sama sekali.
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

      // PENGANTARAN (Delivery) — 6 poin per pesanan yang BERHASIL diantar.
      // Sumbernya sama kayak PREPARATIONS di atas (tabel preparation_orders),
      // tapi pengantar ditandai lewat delivery_user_id, BUKAN done_by/received_by
      // (lihat action "COMPLETE" di /api/preparation/[id]/delivery/route.ts, yang
      // set status "SELESAI" + delivered_at). Dihitung per ORDER, bukan per unit,
      // karena satu pengantaran bisa bawa lebih dari 1 laptop sekaligus.
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

      // SERVICE (Teknisi) — 5 poin per laptop solved DI PERIODE TERPILIH. Basis tanggal ikut
      // status: DONE pakai tanggal_selesai, SUDAH_DIAMBIL pakai tanggal_diambil — bukan created_at
      // order, supaya laptop yang masuk antrian bulan lalu tapi baru solved bulan ini tetap
      // kehitung di periode dia SOLVED, bukan periode dia masuk antrian. "TEKNISI" match via
      // substring, otomatis ikut PKL_TEKNISI & KEPALA_TEKNISI juga.
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

      // KONTEN (cc_reports) — DINONAKTIFKAN SEMENTARA.
      // const uReports = (ccReports ?? []).filter((c) => c.created_by_id === uid);
      // if (uReports.length > 0 || hasRole("KONTEN")) {
      //   score += uReports.length * 15;
      //   metrics.push({ label: "Konten Dibuat", value: uReports.length, unit: "doc" });
      // }

      if (hasRole("PURCHASING")) {
        const uManualCashflows = (cashflows ?? []).filter(
          (c) => c.created_by === uid && c.source_type === "MANUAL"
        );
        score += uManualCashflows.length * 1;
        metrics.push({ label: "Input Cashflow", value: uManualCashflows.length, unit: "data" });
      }
      // else {
      //   // ACCOUNTING (cashflow) — DINONAKTIFKAN SEMENTARA, logic lama tetap disimpan di sini.
      //   const uCashflows = (cashflows ?? []).filter((c) => c.created_by === uid);
      //   if (uCashflows.length > 0 || hasRole("ACCOUNTING")) {
      //     score += uCashflows.length * 10;
      //     metrics.push({ label: "Input Cashflow", value: uCashflows.length, unit: "trx" });
      //   }
      // }

      // PENGELOLA BARANG — Input Barang (CREATE unit baru/SN masuk stok) =
      // 1 poin/unit. SO (Stock Opname, baik level model di
      // laptops/[id]/so maupun level unit di units/[id]/so — keduanya sama-
      // sama tercatat activity_logs action "SO") = 0,3 poin/aksi. UNSO
      // (pembatalan SO) TIDAK dihitung. "Input Barang" khusus entity "unit"
      // (fisik SN) — bikin MODEL laptop baru (entity "laptop", belum tentu
      // ada unit fisiknya) TIDAK ikut dihitung di sini.
      const uActivities = (activities ?? []).filter((a: any) => a.user_id === uid);
      const uInputBarang = uActivities.filter((a: any) => a.action === "CREATE" && a.entity === "unit");
      const uSo = uActivities.filter((a: any) => a.action === "SO");
      const uMinusFixed = uActivities.filter((a: any) => a.action === "MINUS_FIXED");
      if (hasRole("PENGELOLA")) {
        score += uInputBarang.length * 1 + uSo.length * 0.3 + uMinusFixed.length * 5;
        metrics.push({ label: "Input Barang", value: uInputBarang.length, unit: "unit" });
      }

      // ACCOUNTING — Pembukuan Manual (bikin jurnal lewat "+ Jurnal Manual",
      // journal_audit_logs action "CREATE") = 0,3 poin/entry. Konfirmasi
      // Pending → Jurnal Umum (action "CONFIRM", 1 baris log per item yang
      // dikonfirmasi — lihat POST /api/akutansi/jurnal/confirm) = 0,2
      // poin/item. Rayhan disatukan ke sini lewat ID (lihat konstanta di
      // atas) — role dia di database TETAP ADMIN.
      const uJournalLogs = (journalLogs ?? []).filter((j: any) => j.changed_by === uid);
      const uPembukuanManual = uJournalLogs.filter((j: any) => j.action === "CREATE");
      const uPembukuanKonfirmasi = uJournalLogs.filter((j: any) => j.action === "CONFIRM");
      // Audit — gabungan 2 sumber: audit Cashflow (cashflow_entries.audited_by,
      // sudah tercatat langsung di tabel itu) + audit Data Barang laptop & unit
      // (activity_logs action "AUDIT" — asumsi endpoint audit laptop/unit
      // mencatat log dengan pola sama seperti SO).
      const uCashflowAudits = (cashflowAudits ?? []).filter((c: any) => c.audited_by === uid);
      const uDataBarangAudits = uActivities.filter((a: any) => a.action === "AUDIT");
      const uAuditTotal = uCashflowAudits.length + uDataBarangAudits.length;
      if (hasRole("ACCOUNTING") || uid === RAYHAN_ACCOUNTING_USER_ID) {
        score += uPembukuanManual.length * 0.3 + uPembukuanKonfirmasi.length * 0.2 + uAuditTotal * 0.5;
        metrics.push({ label: "Jurnal Manual", value: uPembukuanManual.length, unit: "entry" });
        metrics.push({ label: "Konfirmasi Pending", value: uPembukuanKonfirmasi.length, unit: "entry" });
        metrics.push({ label: "Audit", value: uAuditTotal, unit: "aksi" });
      }

      // MISSIONS — DINONAKTIFKAN SEMENTARA (biar leaderboard "Pekerjaan" fokus Purchasing dulu).
      // const uMissions = (missions ?? []).filter((m) => m.assigned_to === uid);
      // if (uMissions.length > 0) {
      //   score += uMissions.length * 20;
      //   metrics.push({ label: "Misi Diselesaikan", value: uMissions.length, unit: "misi" });
      // }

      return {
        id: u.id,
        name: u.name,
        role: u.role,
        photo_url: null,
        score,
        metrics
      };
    });

    // Filter out users with 0 score
    const activeLeaderboard = leaderboard
      .filter((l) => l.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    return NextResponse.json({ success: true, data: activeLeaderboard });
  } catch (error: any) {
    console.error("Leaderboard error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
});
