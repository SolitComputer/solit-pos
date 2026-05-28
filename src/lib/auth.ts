import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export type UserRole = "ADMIN" | "SALES" | "OPERATOR";

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
}

const getSecret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || "secret");

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard/laptops": ["ADMIN", "OPERATOR"],      
  "/dashboard/transactions": ["ADMIN", "SALES"],      
  "/dashboard": ["ADMIN", "OPERATOR"],                
  "/payment/create": ["ADMIN", "SALES"],              
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

type RouteHandler = (
  req: NextRequest,
  props: any,   
  user: AuthUser
) => Promise<NextResponse> | NextResponse;

export function withAuth(handler: RouteHandler, allowedRoles?: UserRole[]) {
  return async (req: NextRequest, ctx: { params: any }) => {
    const token = req.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await verifyToken(token);

    if (!user) {
      const res = NextResponse.json(
        { success: false, message: "Token tidak valid" },
        { status: 401 }
      );
      res.cookies.delete("token");
      return res;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: akses ditolak" },
        { status: 403 }
      );
    }

    return handler(req, ctx, user);
  };
}