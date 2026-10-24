import Link from "next/link";
import { audit, regenerateBackupCode, sql } from "@/lib/db";
import { adminAct, email, oneOf, uuid } from "@/lib/admin";
import { Flash } from "@/components/Shell";

const P = "/admin/users";
const ROLES = ["staff", "manager", "admin"] as const;

async function allow(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const e = email(fd), role = oneOf(fd, "role", ROLES);
    await sql.begin(async (t) => {
      await t`insert into role_allowlist (email, role, added_by) values (${e}, ${role}, ${admin}) on conflict (email) do update set role = excluded.role`;
      await t`update profiles set role = ${role}, is_active = true where email = ${e}`; // existing account takes the new role
      await audit(t, admin, "allowlist.add", e, { role });
    });
    return `${e} allowlisted as ${role}`;
  });
}
async function disallow(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const e = email(fd);
    await sql.begin(async (t) => {
      const [p] = await t`select id from profiles where email = ${e} and id = ${admin}`;
      if (p) throw new Error("You can't remove your own access");
      await t`delete from role_allowlist where email = ${e}`;
      // BR-41: staff accounts exist only while allowlisted → deactivate the account too.
      await t`update profiles set is_active = false where email = ${e} and role <> 'student'`;
      await audit(t, admin, "allowlist.remove", e, {});
    });
    return `${e} removed and deactivated`;
  });
}
async function setActive(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const id = uuid(fd.get("id")), active = fd.get("active") === "true";
    if (id === admin) throw new Error("You can't deactivate yourself");
    await sql.begin(async (t) => {
      const [p] = await t`update profiles set is_active = ${active} where id = ${id} returning email`;
      if (!p) throw new Error("User not found");
      await audit(t, admin, active ? "user.reactivate" : "user.deactivate", id, { email: p.email });
    });
    return active ? "Reactivated" : "Deactivated";
  });
}
async function newCode(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const id = uuid(fd.get("id"));
    const [p] = await sql`select full_name from profiles where id = ${id} and role = 'student'`;
    if (!p) throw new Error("Student not found");
    const code = await regenerateBackupCode(id);
    await audit(sql, admin, "backup_code.regenerate", id, {});
    // ponytail: code shown once via the flash redirect (lands in URL/history); move to useActionState if that matters.
    return `New backup code for ${p.full_name}: ${code} (shown once)`;
  });
}

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const users = await sql`select id, email, full_name, roll_no, role, is_active from profiles
    where ${q ? sql`(full_name ilike ${like} or email ilike ${like} or roll_no ilike ${like})` : sql`true`}
    order by role, full_name limit 200`;
  const allowlist = await sql`select email, role, to_char(created_at at time zone 'Asia/Kolkata','YYYY-MM-DD') as added from role_allowlist order by role, email`;
  return (
    <>
      <h1>Users</h1>
      <Flash sp={sp} />
      <section className="card">
        <h2>Allowlist (staff, manager, admin)</h2>
        <form action={allow} className="row">
          <input type="email" name="email" placeholder="email" required maxLength={254} aria-label="Email" />
          <select name="role" aria-label="Role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          <button>Add</button>
        </form>
        <div className="scroll"><table>
          <thead><tr><th>Email</th><th>Role</th><th>Added</th><th></th></tr></thead>
          <tbody>{allowlist.map((a) => (
            <tr key={a.email}><td>{a.email}</td><td>{a.role}</td><td>{a.added}</td>
              <td><form action={disallow}><input type="hidden" name="email" value={a.email} /><button className="secondary">Remove</button></form></td></tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className="card">
        <h2>Accounts</h2>
        <form className="row"><input type="search" name="q" defaultValue={q} placeholder="Search name, email, roll no" aria-label="Search users" /><button className="secondary">Search</button></form>
        <div className="scroll"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Roll</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td>{u.role === "student" ? <Link href={`/admin/students/${u.id}`}>{u.full_name}</Link> : u.full_name}</td>
              <td>{u.email}</td><td>{u.roll_no ?? "—"}</td><td>{u.role}</td>
              <td className={u.is_active ? "ok" : "bad"}>{u.is_active ? "active" : "inactive"}</td>
              <td className="row">
                <form action={setActive}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="active" value={String(!u.is_active)} />
                  <button className="secondary">{u.is_active ? "Deactivate" : "Reactivate"}</button></form>
                {u.role === "student" && <form action={newCode}><input type="hidden" name="id" value={u.id} /><button className="secondary">New backup code</button></form>}
              </td>
            </tr>
          ))}{users.length === 0 && <tr><td colSpan={6} className="muted">No matches.</td></tr>}</tbody>
        </table></div>
      </section>
    </>
  );
}
