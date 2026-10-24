import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/lib/auth";

// Google sign-in only, restricted to @iiitkottayam.ac.in (BR-40). Roles come from the admin allowlist (BR-41).
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
        <p className="muted" style={{ fontSize: 13 }}>Use your @iiitkottayam.ac.in account. Staff, manager and admin roles are assigned by the admin.</p>
      </div>
    </main>
  );
}
