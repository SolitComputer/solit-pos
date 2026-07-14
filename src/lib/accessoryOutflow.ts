import { supabaseAdmin } from "@/services/supabaseAdmin";

type OutflowSource = "transaction" | "service" | "manual";
type RoleType = "SALES" | "TEKNISI" | "PENGELOLA_BARANG";

export interface OutflowData {
  accessory_id: string;
  unit_id?: string | null;
  source_type: OutflowSource;
  transaction_invoice?: string | null;
  service_id?: string | null;
  qty: number;
  taken_by_role?: RoleType | null;
  notes?: string | null;
  created_by?: string | null;
}

export async function recordOutflow(data: OutflowData) {
  try {
    const { error } = await supabaseAdmin.from("accessory_outflows").insert({
      accessory_id: data.accessory_id,
      unit_id: data.unit_id || null,
      source_type: data.source_type,
      transaction_invoice: data.transaction_invoice || null,
      service_id: data.service_id || null,
      qty: data.qty,
      status: "active",
      taken_by_role: data.taken_by_role || null,
      notes: data.notes || null,
      created_by: data.created_by || null,
    });
    if (error) {
      console.error("[recordOutflow] DB Error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[recordOutflow] Exception:", err);
    return false;
  }
}

export async function cancelOutflowByInvoice(invoice: string) {
  try {
    // Return units to available status if there are unit_ids attached
    const { data: outflows } = await supabaseAdmin
      .from("accessory_outflows")
      .select("unit_id")
      .eq("transaction_invoice", invoice)
      .eq("status", "active")
      .not("unit_id", "is", null);
      
    if (outflows && outflows.length > 0) {
      const unitIds = outflows.map(o => o.unit_id);
      await supabaseAdmin.from("accessory_units").update({ status: "TERSEDIA" }).in("id", unitIds);
    }

    const { error } = await supabaseAdmin
      .from("accessory_outflows")
      .update({ status: "cancelled" })
      .eq("transaction_invoice", invoice)
      .eq("status", "active");
    if (error) {
      console.error(`[cancelOutflowByInvoice] DB Error:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[cancelOutflowByInvoice] Exception:`, err);
    return false;
  }
}

export async function cancelOutflowByService(serviceId: string) {
  try {
    const { data: outflows } = await supabaseAdmin
      .from("accessory_outflows")
      .select("unit_id")
      .eq("service_id", serviceId)
      .eq("status", "active")
      .not("unit_id", "is", null);
      
    if (outflows && outflows.length > 0) {
      const unitIds = outflows.map(o => o.unit_id);
      await supabaseAdmin.from("accessory_units").update({ status: "TERSEDIA" }).in("id", unitIds);
    }

    const { error } = await supabaseAdmin
      .from("accessory_outflows")
      .update({ status: "cancelled" })
      .eq("service_id", serviceId)
      .eq("status", "active");
    if (error) {
      console.error(`[cancelOutflowByService] DB Error:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[cancelOutflowByService] Exception:`, err);
    return false;
  }
}
