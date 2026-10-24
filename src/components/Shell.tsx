import Link from "next/link";
import type { User } from "@/lib/auth";

/** Role layout header. Pages pass only links their role may use. */
export function Shell({ user, links, children }: { user: User; links: [string, string][]; children: React.ReactNode }) {
  return (
    <>
      <header className="top">
        <strong>Saapidalaam</strong>
        <nav>{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        <span className="who">{user.full_name} · {user.role}</span>
        <form action="/auth/logout" method="post"><button className="secondary">Sign out</button></form>
      </header>
      <main>{children}</main>
    </>
  );
}

export function Flash({ sp }: { sp: { ok?: string; error?: string } }) {
  if (sp.error) return <div className="flash error">{sp.error}</div>;
  if (sp.ok) return <div className="flash">{sp.ok}</div>;
  return null;
}
