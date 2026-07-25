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

async function restockActiveOutflows(outflows: { unit_id: string | null; accessory_id: string | null; qty: number }[]) {
  const unitIds = outflows.filter(o => o.unit_id).map(o => o.unit_id as string);
  if (unitIds.length > 0) {
    await supabaseAdmin.from("accessory_units").update({ status: "TERSEDIA" }).in("id", unitIds);
  }

  const qtyByAccessory = new Map<string, number>();
  for (const o of outflows) {
    if (o.accessory_id && Number(o.qty) > 0) {
      qtyByAccessory.set(o.accessory_id, (qtyByAccessory.get(o.accessory_id) ?? 0) + Number(o.qty));
    }
  }

  for (const [accessoryId, qty] of qtyByAccessory) {
    const { data: acc } = await supabaseAdmin
      .from("accessories")
      .select("stock")
      .eq("id", accessoryId)
      .maybeSingle();
    if (acc) {
      await supabaseAdmin
        .from("accessories")
        .update({ stock: (Number(acc.stock) || 0) + qty })
        .eq("id", accessoryId);
    }
  }
}

export async function cancelOutflowByInvoice(invoice: string) {
  try {
    // Kembalikan stok aksesoris + status unit sebelum outflow ditandai cancelled
    const { data: outflows } = await supabaseAdmin
      .from("accessory_outflows")
      .select("unit_id, accessory_id, qty")
      .eq("transaction_invoice", invoice)
      .eq("status", "active");

    if (outflows && outflows.length > 0) {
      await restockActiveOutflows(outflows);
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
      .select("unit_id, accessory_id, qty")
      .eq("service_id", serviceId)
      .eq("status", "active");

    if (outflows && outflows.length > 0) {
      await restockActiveOutflows(outflows);
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
