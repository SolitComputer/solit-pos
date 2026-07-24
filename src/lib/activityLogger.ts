import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ ADD: "AUDIT" & "UNAUDIT" untuk aksi verifikasi audit di cashflow
export type LogAction = "CREATE" | "EDIT" | "DELETE" | "RESTORE" | "AUDIT" | "UNAUDIT";

export type LogEntity =
  | "laptop"
  | "unit"
  | "transaction"
  | "warranty"
  | "item_outflow"
  | "seller_followup"
  | "seller_followup_pic"   
  | "seller_followup_reminder"   
  | "preparation"
  | "cashflow"
  | "cashflow_audit_access";

interface LogActivityParams {
  userId: string;
  userName: string;
  userRole: string;
  action: LogAction;
  entity: LogEntity;
  entityId?: string;
  entityLabel?: string;
  beforeData?: Record<string, any> | null;
  afterData?: Record<string, any> | null;
}

export async function logActivity(params: LogActivityParams) {
  const { error } = await supabaseAdmin.from("activity_logs").insert({
    user_id: params.userId,
    user_name: params.userName,
    user_role: params.userRole,
    action: params.action,
    entity: params.entity,
    entity_id: params.entityId ?? null,
    entity_label: params.entityLabel ?? null,
    before_data: params.beforeData ?? null,
    after_data: params.afterData ?? null,
  });

  if (error) {
    // Jangan sampai error log menghancurkan response utama
    console.error("[activityLogger] Failed to insert log:", error.message);
  }
}