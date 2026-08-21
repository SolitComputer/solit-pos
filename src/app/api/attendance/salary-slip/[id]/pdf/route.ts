import { supabaseAdmin } from "@/services/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

const ADMIN_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ✅ SECURITY FIX: dulu endpoint ini TIDAK ADA pengecekan login/kepemilikan
    // sama sekali — siapa pun yang login (bahkan tebak-tebak UUID) bisa buka
    // slip gaji siapa saja. Disamakan dengan guard yang sudah benar di
    // halaman kembarnya /receipt/salary-slip/[slipId]/page.tsx.
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return new NextResponse(
        JSON.stringify({ message: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { id } = await params;

    // Step 1: Ambil slip dulu
    const { data: slip, error: slipError } = await supabaseAdmin
      .from("salary_slips")
      .select("*")
      .eq("id", id)
      .single();

    if (slipError || !slip) {
      return new NextResponse(
        JSON.stringify({ message: "Slip tidak ditemukan", error: slipError?.message }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const isAdmin = ADMIN_ROLES.includes(currentUser.role);
    if (!isAdmin && slip.user_id !== currentUser.id) {
      return new NextResponse(
        JSON.stringify({ message: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!isAdmin && !slip.sent_at) {
      return new NextResponse(
        JSON.stringify({ message: "Slip belum dikirim" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 2: Ambil user secara terpisah — hindari ambiguity join
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, name, role, shift")
      .eq("id", slip.user_id)
      .single();

    if (userError || !user) {
      return new NextResponse(
        JSON.stringify({ message: "User tidak ditemukan", error: userError?.message }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // ─── Helpers ───────────────────────────────────────────────────
    const MONTH_ID = [
      "Januari","Februari","Maret","April","Mei","Juni",
      "Juli","Agustus","September","Oktober","November","Desember",
    ];
    const monthName = MONTH_ID[slip.month - 1] ?? "";

    function fmt(n: number | null | undefined): string {
      if (!n || n === 0) return "-";
      return new Intl.NumberFormat("id-ID").format(n);
    }

    function roleLabel(role: string): string {
      const map: Record<string, string> = {
        ADMIN: "Admin",
        PROGRAMMER: "Programmer",
        ASISTEN_CEO: "Asisten CEO",
        CREW_SALES: "Sales",
        KEPALA_TEKNISI: "Kepala Teknisi",
        SOTECH: "Sotech",
        KONTEN_KREATOR: "Konten Kreator",
        STAFF: "Staff",
      };
      return map[role] ?? role.replace(/_/g, " ");
    }

    function row(label: string, amount: number | null): string {
      const zero = !amount || amount === 0;
      return `<tr>
        <td>${label}</td>
        <td>Rp</td>
        <td class="${zero ? "zero" : ""}">${zero ? "-" : fmt(amount!)}</td>
      </tr>`;
    }

    const today = new Date().toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
    });
    const sentLabel = slip.sent_at
      ? new Date(slip.sent_at).toLocaleDateString("id-ID", {
          day: "numeric", month: "long", year: "numeric",
        })
      : null;

    // ─── Logo URL ──────────────────────────────────────────────────
    // Gunakan URL absolut supaya gambar muncul saat print
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const logoUrl = `${baseUrl}/assets/solit03.jpeg`;

    // ─── HTML ──────────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Slip Gaji - ${user.name} - ${monthName} ${slip.year}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 13px; color: #111; background: white; }

    @page { size: A4 portrait; margin: 14mm 16mm; }

    @media print {
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
    }

    /* ACTION BAR — hanya di layar */
    .action-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: #1f2937; display: flex; align-items: center;
      justify-content: space-between; padding: 10px 20px; gap: 10px;
    }
    .action-bar-title { font-size: 13px; font-weight: 600; color: #e5e7eb; }
    .action-bar-title span { color: #9ca3af; font-weight: 400; }
    .btn-pdf {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 18px; background: #2563eb; color: white;
      border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
      cursor: pointer; font-family: inherit;
    }
    .btn-pdf:hover { background: #1d4ed8; }
    .btn-close {
      padding: 8px 14px; background: transparent; color: #9ca3af;
      border: 1px solid #374151; border-radius: 8px; font-size: 13px;
      font-weight: 600; cursor: pointer; font-family: inherit;
    }
    .btn-close:hover { background: #374151; color: white; }
    .spacer { height: 52px; }

    /* SLIP */
    .slip-wrap { max-width: 720px; margin: 20px auto 48px; background: white; padding: 32px 40px 40px; box-shadow: 0 2px 24px rgba(0,0,0,0.12); }

    /* HEADER */
    .doc-header { display: flex; align-items: center; gap: 18px; padding-bottom: 12px; border-bottom: 3px solid #111; margin-bottom: 10px; }
    .doc-logo { width: 68px; height: 68px; border-radius: 50%; object-fit: cover; border: 2px solid #d1d5db; }
    .doc-title { flex: 1; text-align: center; }
    .doc-title h1 { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    .doc-title p { font-size: 12px; color: #333; margin-top: 4px; }

    /* STATUS BARS */
    .draft-notice { text-align: center; font-size: 11px; color: #b45309; font-style: italic; background: #fffbeb; border-bottom: 1px solid #fde68a; padding: 5px 0; margin: 0 -40px 8px; }
    .sent-bar { font-size: 11px; color: #15803d; background: #f0fdf4; border-bottom: 1px solid #bbf7d0; padding: 5px 40px; margin: 0 -40px 8px; }

    /* EMPLOYEE INFO */
    .emp-block { padding: 10px 0 8px; border-bottom: 1px solid #d1d5db; margin-bottom: 14px; }
    .emp-row { display: flex; margin-bottom: 5px; font-size: 13px; line-height: 1.5; }
    .emp-label { font-weight: 700; width: 130px; flex-shrink: 0; }
    .emp-colon { margin-right: 8px; font-weight: 700; }

    /* TABLES */
    .tables-wrapper { display: grid; grid-template-columns: 1fr 1fr; border: 1.5px solid #333; margin-bottom: 14px; }
    .table-section + .table-section { border-left: 1.5px solid #333; }
    .table-header { background: #f3f4f6; text-align: center; padding: 6px 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1.5px solid #333; }
    table { width: 100%; border-collapse: collapse; }
    table td { padding: 5px 12px; font-size: 12.5px; border-bottom: 1px solid #e5e7eb; }
    table tr:last-child td { border-bottom: none; }
    table td:nth-child(2) { width: 28px; color: #555; font-size: 12px; }
    table td:nth-child(3) { width: 92px; text-align: right; }
    .zero { color: #9ca3af; }
    .table-total { border-top: 1.5px solid #333; background: #f9fafb; }
    .table-total td { font-weight: 700 !important; padding: 6px 12px !important; border-bottom: none !important; }

    /* NET */
    .net-block { border: 2px solid #111; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .net-label { font-size: 13px; font-weight: 700; text-transform: uppercase; }
    .net-center { display: flex; align-items: center; gap: 10px; }
    .net-rp { font-size: 13px; font-weight: 700; }
    .net-amount { font-size: 16px; font-weight: 700; }
    .net-method { font-size: 12px; font-weight: 700; color: #dc2626; text-transform: uppercase; }

    /* FOOTER */
    .slip-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; padding-top: 14px; border-top: 1px solid #d1d5db; }
    .sig-block { text-align: center; min-width: 160px; }
    .sig-city-date { font-size: 12px; color: #374151; margin-bottom: 52px; }
    .sig-line { width: 140px; height: 1px; background: #374151; margin: 0 auto 6px; }
    .sig-name { font-size: 12.5px; font-weight: 700; }
    .sig-title { font-size: 11px; color: #6b7280; margin-top: 2px; }

    /* NOTES */
    .notes-bar { margin-top: 12px; background: #fffbeb; border: 1px solid #fde68a; padding: 8px 14px; border-radius: 4px; font-size: 11.5px; color: #92400e; }
  </style>
</head>
<body>

  <!-- ACTION BAR (hilang saat print) -->
  <div class="action-bar no-print">
    <div class="action-bar-title">
      ${user.name} <span>· Slip Gaji ${monthName} ${slip.year}</span>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn-pdf" onclick="window.print()">💾 Simpan PDF</button>
      <button class="btn-close" onclick="window.close()">✕ Tutup</button>
    </div>
  </div>
  <div class="spacer no-print"></div>

  <!-- SLIP -->
  <div class="slip-wrap">

    <!-- HEADER -->
    <div class="doc-header">
      <img src="${logoUrl}" class="doc-logo" alt="Logo Solit Computer"/>
      <div class="doc-title">
        <h1>Slip Gaji Karyawan Solit Computer</h1>
        <p>PERIODE ${monthName.toUpperCase()} ${slip.year}</p>
      </div>
    </div>

    ${slip.status === "DRAFT"
      ? `<div class="draft-notice">⚠️ Dokumen ini berstatus DRAFT — belum difinalisasi</div>`
      : ""}
    ${sentLabel
      ? `<div class="sent-bar">✅ Telah dikirim ke karyawan · ${sentLabel}</div>`
      : ""}

    <!-- EMPLOYEE INFO -->
    <div class="emp-block">
      <div class="emp-row">
        <span class="emp-label">Nama</span>
        <span class="emp-colon">:</span>
        <strong>${user.name}</strong>
      </div>
      <div class="emp-row">
        <span class="emp-label">Jabatan</span>
        <span class="emp-colon">:</span>
        <span>${roleLabel(user.role)}</span>
      </div>
    </div>

    <!-- SALARY TABLES -->
    <div class="tables-wrapper">
      <div class="table-section">
        <div class="table-header">Penghasilan</div>
        <table>
          <tbody>
            ${row("Gaji Pokok", slip.salary_income ?? slip.base_salary)}
            ${row("Tunjangan Istri", slip.allowance_wife)}
            ${row("Tunjangan Anak", slip.allowance_child)}
            ${row("Tunjangan Transport", slip.allowance_transport)}
            ${row("Bonus", slip.bonus)}
            ${row("Lemburan", slip.overtime)}
          </tbody>
          <tfoot>
            <tr class="table-total">
              <td>Total</td><td>Rp</td><td>${fmt(slip.total_income)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="table-section">
        <div class="table-header">Potongan</div>
        <table>
          <tbody>
            ${row("Cicilan Pinjaman", slip.deduction_loan)}
            ${row("Dana Pensiun", slip.deduction_pension)}
            <tr style="visibility:hidden"><td>&nbsp;</td><td></td><td></td></tr>
            <tr style="visibility:hidden"><td>&nbsp;</td><td></td><td></td></tr>
            <tr style="visibility:hidden"><td>&nbsp;</td><td></td><td></td></tr>
          </tbody>
          <tfoot>
            <tr class="table-total">
              <td>Total</td><td>Rp</td><td>${fmt(slip.total_deduction)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- NET SALARY -->
    <div class="net-block">
      <span class="net-label">Gaji Bersih :</span>
      <div class="net-center">
        <span class="net-rp">Rp</span>
        <span class="net-amount">${fmt(slip.net_salary)}</span>
      </div>
      <span class="net-method">Transfer</span>
    </div>

    <!-- FOOTER -->
    <div class="slip-footer">
      <div></div>
      <div class="sig-block">
        <div class="sig-city-date">Depok, ${today}</div>
        <div class="sig-line"></div>
        <div class="sig-name">Yoga Adi Prakoso</div>
        <div class="sig-title">Finance</div>
      </div>
    </div>

    ${slip.notes
      ? `<div class="notes-bar"><strong>Catatan:</strong> ${slip.notes}</div>`
      : ""}

  </div>

  <script>
    // Tunggu gambar logo load dulu baru print
    window.addEventListener("load", function () {
      const img = document.querySelector(".doc-logo");
      if (img && !img.complete) {
        img.addEventListener("load", function () { window.print(); });
        img.addEventListener("error", function () { window.print(); }); // tetap print meski logo gagal
      } else {
        window.print();
      }
    });
  </script>

</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="SlipGaji-${user.name.replace(/\s+/g, "_")}-${monthName}${slip.year}.pdf"`,
      },
    });

  } catch (err: any) {
    console.error("[salary-slip/pdf] FATAL:", err);
    return new NextResponse(
      JSON.stringify({ message: "Internal server error", error: err?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}