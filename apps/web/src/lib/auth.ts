import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient } from "@saap/supabase-client";

export type Role = "student" | "staff" | "manager" | "admin";
export type User = { id: string; email: string; full_name: string; roll_no: string | null; role: Role; photo_path: string | null; has_photo: boolean };

/** Supabase client acting as the signed-in user: every query is subject to RLS (rule 4). */
export async function supa() {
  return serverClient(await cookies());
}

export async function currentUser(): Promise<User | null> {
  const sb = await supa();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: p } = await sb.from("profiles").select("id, email, full_name, roll_no, role, photo_path, is_active").eq("id", user.id).single();
  if (!p || !p.is_active) return null;
  return { ...p, role: p.role as Role, has_photo: Boolean(p.photo_path) };
}

/** Server-side role gate. Hiding UI is not security; RLS + RPC role checks are the real guard. */
export async function requireRole(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!roles.includes(u.role)) redirect(homeFor(u.role));
  return u;
}
export const homeFor = (r: Role) => `/${r}`;
