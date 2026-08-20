import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/supabaseFetchWithTimeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
    global: { fetch: fetchWithTimeout },
});