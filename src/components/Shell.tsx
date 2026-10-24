import Link from "next/link";
import type { User } from "@/lib/auth";
import { NavLinks, PageTitle } from "./NavLinks";
import { Icon } from "./Icon";

const ROLE_NOTE: Record<User["role"], [string, string, string]> = {
  student: ["Eating at the mess?", "Open your QR at the counter.", "/student/qr"],
  staff: ["Counter open", "Scan QR or type a backup code.", "/staff"],
  manager: ["Plan the kitchen", "See exact counts for tomorrow.", "/manager"],
  admin: ["Deposits waiting?", "Verify them in Finance.", "/admin/finance"],
};

/** Role layout: sidebar + top bar. Pages pass only links their role may use. */
export function Shell({ user, links, children }: { user: User; links: [string, string][]; children: React.ReactNode }) {
  const initials = user.full_name.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [title, text, href] = ROLE_NOTE[user.role];
  return (
    <div className="app">
      <aside className="side">
        <Link href={links[0]?.[0] ?? "/"} className="brand"><span className="brand-mark" aria-hidden>◐</span>Saapidalaam</Link>
        <NavLinks links={links} />
        <div className="side-promo">
          <span className="promo-art" aria-hidden>🍛</span>
          <b>{title}</b>
          <p>{text}</p>
          <Link className="btn mint" href={href}>Open</Link>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <PageTitle links={links} />
          <div className="topbar-right">
            <span className="role-tag">{user.role}</span>
            <span className="avatar" title={user.full_name}>{initials}</span>
            <span className="who-name"><b>{user.full_name}</b><small>{user.roll_no ?? user.email}</small></span>
            <form action="/auth/logout" method="post"><button className="icon-btn secondary" aria-label="Sign out" title="Sign out"><Icon name="logout" size={18} /></button></form>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

export function Flash({ sp }: { sp: { ok?: string; error?: string } }) {
  if (sp.error) return <div className="flash error" role="alert">{sp.error}</div>;
  if (sp.ok) return <div className="flash" role="status">{sp.ok}</div>;
  return null;
}
