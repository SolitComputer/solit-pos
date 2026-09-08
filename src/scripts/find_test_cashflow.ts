import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Searching cashflow_entries for 'test'...");
  
  // Search with ilike on various columns
  const cols = ["keterangan", "nama", "kategori", "source_id", "source_type"];
  const results: any[] = [];
  const seenIds = new Set();

  for (const col of cols) {
    const { data, error } = await supabase
      .from("cashflow_entries")
      .select("*")
      .ilike(col, "%test%");

    if (error) {
      console.error(`Error querying ${col}:`, error.message);
      continue;
    }

    if (data) {
      for (const row of data) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          results.push(row);
        }
      }
    }
  }

  console.log(`=== FOUND ${results.length} ENTRIES IN cashflow_entries MATCHING 'test' ===`);
  results.forEach((r, idx) => {
    console.log(`\n[${idx + 1}] ID: ${r.id}`);
    console.log(`Tanggal: ${r.tanggal} | Arah: ${r.direction} | Kategori: ${r.kategori}`);
    console.log(`Nama: ${r.nama} | Nominal: ${r.nominal}`);
    console.log(`Keterangan: ${r.keterangan}`);
    console.log(`Source: ${r.source_type} (${r.source_id}) | Void: ${r.is_voided}`);
    console.log(`Created at: ${r.created_at} | Created by: ${r.created_by}`);
  });

  // Also check transactions matching test
  const { data: txData } = await supabase
    .from("transactions")
    .select("invoice_number, customer_name, laptop_name, deal_price, amount, status, payment_status, created_at, notes")
    .or("customer_name.ilike.%test%,laptop_name.ilike.%test%,notes.ilike.%test%,invoice_number.ilike.%test%")
    .limit(20);

  console.log(`\n=== FOUND ${txData?.length || 0} TRANSACTIONS MATCHING 'test' ===`);
  txData?.forEach((t, idx) => {
    console.log(`[${idx + 1}] Invoice: ${t.invoice_number} | Customer: ${t.customer_name} | Laptop: ${t.laptop_name} | Status: ${t.status}/${t.payment_status} | Nominal: ${t.deal_price || t.amount} | Date: ${t.created_at}`);
  });

  // Also check service transactions matching test
  const { data: srvData } = await supabase
    .from("services")
    .select("id, customer_name, unit_name, biaya, status, created_at")
    .or("customer_name.ilike.%test%,unit_name.ilike.%test%")
    .limit(20);

  if (srvData && srvData.length > 0) {
    console.log(`\n=== FOUND ${srvData.length} SERVICES MATCHING 'test' ===`);
    srvData.forEach((s, idx) => {
      console.log(`[${idx + 1}] ID: ${s.id} | Customer: ${s.customer_name} | Unit: ${s.unit_name} | Biaya: ${s.biaya} | Status: ${s.status}`);
    });
  }

  // Also check accessories / other sales matching test
  const { data: accData } = await supabase
    .from("accessory_sales")
    .select("id, invoice_number, customer_name, total_price, created_at")
    .or("customer_name.ilike.%test%,invoice_number.ilike.%test%")
    .limit(20);

  if (accData && accData.length > 0) {
    console.log(`\n=== FOUND ${accData.length} ACCESSORY SALES MATCHING 'test' ===`);
    accData.forEach((a, idx) => {
      console.log(`[${idx + 1}] Invoice: ${a.invoice_number} | Customer: ${a.customer_name} | Total: ${a.total_price}`);
    });
  }
}

main().catch(console.error);
