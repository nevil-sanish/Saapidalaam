import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { COLLEGE_DOMAIN, ready, sql, type Role } from "./db";

const COOKIE = "saap_session";
const TTL = 7 * 86_400_000;
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET not set");
  return s ?? "dev-only-secret";
};
const sig = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");

export type User = { id: string; email: string; full_name: string; roll_no: string | null; role: Role; has_photo: boolean };

export async function startSession(userId: string) {
  const v = `${userId}.${Date.now() + TTL}`;
  (await cookies()).set(COOKIE, `${v}.${sig(v)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL / 1000 });
}
export async function endSession() { (await cookies()).delete(COOKIE); }

export async function currentUser(): Promise<User | null> {
  await ready();
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, s] = raw.split(".");
  const v = `${id}.${exp}`, a = Buffer.from(sig(v)), b = Buffer.from(s ?? "");
  if (a.length !== b.length || !timingSafeEqual(a, b) || Number(exp) < Date.now()) return null;
  await ready();
  const [u] = await sql<User[]>`select id, email, full_name, roll_no, role, photo is not null as has_photo from profiles where id = ${id} and is_active`;
  return u ?? null;
}

/** Server-side role gate. Hiding UI is not security (CLAUDE.md style rule). */
export async function requireRole(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!roles.includes(u.role)) redirect(homeFor(u.role));
  return u;
}
export const homeFor = (r: Role) => `/${r}`;

/** BR-40/41: college domain → student; anyone else only if allowlisted with a role. Returns profile id or throws. */
export async function resolveLogin(email: string, fullName: string) {
  await ready();
  email = email.trim().toLowerCase();
  if (!email.endsWith(COLLEGE_DOMAIN)) throw new Error(`Only ${COLLEGE_DOMAIN} Google accounts may sign in`);
  const [existing] = await sql`select id, is_active from profiles where email = ${email}`;
  if (existing) {
    if (!existing.is_active) throw new Error("Account deactivated");
    return existing.id as string;
  }
  // Google + college domain only for every role; the allowlist only decides the role (BR-40/41).
  const [al] = await sql`select role from role_allowlist where email = ${email}`;
  const [p] = await sql`insert into profiles (email, full_name, role) values (${email}, ${fullName || email}, ${al?.role ?? "student"}) returning id`;
  return p.id as string;
}
