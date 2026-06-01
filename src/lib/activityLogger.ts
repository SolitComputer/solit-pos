import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type LogAction = "CREATE" | "EDIT" | "DELETE" | "RESTORE";
export type LogEntity = "laptop" | "unit" | "transaction" | "warranty";

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
    user_id:      params.userId,
    user_name:    params.userName,
    user_role:    params.userRole,
    action:       params.action,
    entity:       params.entity,
    entity_id:    params.entityId ?? null,
    entity_label: params.entityLabel ?? null,
    before_data:  params.beforeData ?? null,
    after_data:   params.afterData ?? null,
  });

  if (error) {
    // Jangan sampai error log menghancurkan response utama
    console.error("[activityLogger] Failed to insert log:", error.message);
  }
}