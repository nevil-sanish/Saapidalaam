import { requireRole } from "@/lib/auth";
import { act } from "@/lib/act";
import { sql } from "@/lib/db";
import { fmtIST } from "@/lib/time";
import { Flash } from "@/components/Shell";

async function markAll() {
  "use server";
  const user = await requireRole("student");
  await act("/student/notifications", async () => {
    await sql`update notifications set read_at = now() where user_id = ${user.id} and read_at is null`;
    return "All marked read";
  });
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const rows = await sql<{ id: string; title: string; body: string; read_at: Date | null; created_at: Date }[]>`
    select id, title, body, read_at, created_at from notifications where user_id = ${user.id} order by created_at desc limit 200`;
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <h1>Notifications</h1>
      <Flash sp={sp} />
      <div className="card">
        <div className="row"><span>{unread} unread</span>{unread > 0 && <form action={markAll}><button className="secondary">Mark all read</button></form>}</div>
      </div>
      {rows.length === 0 ? <p className="muted">No notifications yet.</p> : rows.map((n) => (
        <div key={n.id} className="card">
          <div className="row"><b>{n.title}</b>{!n.read_at && <span className="pill warn">new</span>}<span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>{fmtIST(n.created_at.getTime())}</span></div>
          <p style={{ margin: "6px 0 0" }}>{n.body}</p>
        </div>
      ))}
    </>
  );
}
