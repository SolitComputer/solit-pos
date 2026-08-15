import TanyaCeoWorkspace from "./TanyaCeoWorkspace";
import TanyaCeoAdminWorkspace from "./TanyaCeoAdminWorkspace";
import { getCurrentUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function Page() {
    const user = await getCurrentUser();
    
    // Gunakan roles array jika ada, jika tidak fallback ke role tunggal
    const roles: string[] = (user as any)?.roles || (user?.role ? [user.role] : []);
    
    const isAdmin = roles.some(role => (AI_CEO_ROLES as readonly string[]).includes(role));

    if (isAdmin) {
        return <TanyaCeoAdminWorkspace />;
    }

    return <TanyaCeoWorkspace />;
}