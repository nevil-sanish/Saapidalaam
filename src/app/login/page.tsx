import { redirect } from "next/navigation";
import { checkPw, ready, sql } from "@/lib/db";
import { currentUser, homeFor, startSession } from "@/lib/auth";
import { googleEnabled } from "@/lib/supabase";

async function passwordLogin(fd: FormData) {
  "use server";
  await ready();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const [p] = await sql`select id, role, pw_hash, is_active from profiles where email = ${email}`;
  if (!p || !p.is_active || !checkPw(String(fd.get("password") ?? ""), p.pw_hash)) redirect("/login?error=Invalid+email+or+password");
  await startSession(p.id);
  redirect(homeFor(p.role));
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const u = await currentUser();
  if (u) redirect(homeFor(u.role));
  const { error } = await searchParams;
  return (
    <main style={{ maxWidth: 420, marginTop: "8vh" }}>
      <h1>Saapidalaam</h1>
      <p className="muted">IIIT Kottayam mess — book meals, scan at the counter.</p>
      {error && <div className="flash error">{error}</div>}
      <div className="card">
        {googleEnabled() ? (
          <a href="/auth/google"><button style={{ width: "100%" }}>Sign in with Google</button></a>
        ) : (
          <p className="muted">Google sign-in is not configured (set NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).</p>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Students: use your @iiitkottayam.ac.in account. Staff / manager: the email the admin allowlisted.</p>
      </div>
      <details className="card">
        <summary>Sign in with password (allowlisted / demo accounts)</summary>
        <form action={passwordLogin} style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <input name="email" type="email" placeholder="email" required autoComplete="username" />
          <input name="password" type="password" placeholder="password" required autoComplete="current-password" />
          <button>Sign in</button>
        </form>
      </details>
    </main>
  );
}
