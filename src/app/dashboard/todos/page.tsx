import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import TodosClient from "./TodosClient";

const TODO_ROLES = ["ADMIN", "PROGRAMMER"];

export default async function TodosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) redirect("/login");

  const user = await verifyToken(token);
  if (!user) redirect("/login");

  const roles: string[] = (user as any).roles ?? [user.role];
  const hasAccess = roles.some((r) => TODO_ROLES.includes(r));
  if (!hasAccess) redirect("/dashboard");

  return <TodosClient />;
}