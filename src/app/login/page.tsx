import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/lib/auth";
import { slots, sql } from "@/lib/db";
import { todayIST } from "@/lib/time";

// Google sign-in only, restricted to @iiitkottayam.ac.in (BR-40). Roles come from the admin allowlist (BR-41).
// The page opens with today's real menu: the most useful thing a hungry student can see.
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const u = await currentUser();
  if (u) redirect(homeFor(u.role));
  const { error } = await searchParams;
  const today = todayIST();
  const ss = await slots();
  const menu = await sql<{ slot_id: number; items: string }[]>`select slot_id, items from menu_entries where served_on = ${today} and diet = 'veg'`;
  const dayName = new Date(today + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  };

  return (
    <div className="login-wrap">
      <div className="login">
        <section className="card dark login-hero">
          <div>
            <p className="muted" style={{ marginBottom: 18 }}>IIIT Kottayam mess</p>
            <h1 className="wordmark">Saapidalaam</h1>
            <p className="muted" style={{ marginTop: 14, maxWidth: 340 }}>
              Book the meals you will eat, pay from your semester deposit, and show a QR at the counter.
            </p>
          </div>
          <div>
            {error && <div className="flash error">{error}</div>}
            <a href="/auth/google" style={{ textDecoration: "none" }}>
              <button className="google-btn" type="button">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                Sign in with Google
              </button>
            </a>
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Use your @iiitkottayam.ac.in account. Staff, manager and admin access is set by the college admin.</p>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 4 }}>On the menu today</h2>
          <p className="muted">{dayName}</p>
          <div className="today" style={{ marginTop: 14 }}>
            {ss.map((s) => (
              <div className="meal" key={s.id}>
                <div><b>{s.label}</b><small>{fmt(s.start_time)} – {fmt(s.end_time)}</small></div>
                <p>{menu.find((m) => m.slot_id === s.id)?.items ?? "Menu not published yet."}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
