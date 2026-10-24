import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser, homeFor, supa } from "@/lib/auth";

async function passwordLogin(fd: FormData) {
  "use server";
  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) })
    .safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) redirect("/login?error=Invalid+email+or+password");
  const sb = await supa();
  const { error } = await sb.auth.signInWithPassword(parsed.data);
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
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
        <a href="/auth/google"><button style={{ width: "100%" }}>Sign in with Google</button></a>
        <p className="muted" style={{ fontSize: 13 }}>Students: your @iiitkottayam.ac.in account (BR-40). Staff / manager / admin: the email the admin allowlisted (BR-41).</p>
      </div>
      <details className="card">
        <summary>Sign in with email + password (allowlisted / demo accounts)</summary>
        <form action={passwordLogin} style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <input name="email" type="email" placeholder="email" required autoComplete="username" />
          <input name="password" type="password" placeholder="password" required autoComplete="current-password" />
          <button>Sign in</button>
        </form>
      </details>
    </main>
  );
}
