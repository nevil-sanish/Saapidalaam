"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, iconFor } from "./Icon";

// Longest matching prefix is the active tab, so /student/menu doesn't also light up /student.
const useActive = (links: [string, string][]) => {
  const path = usePathname();
  return links.map(([h]) => h).filter((h) => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
};

export function NavLinks({ links }: { links: [string, string][] }) {
  const active = useActive(links);
  return (
    <nav aria-label="Sections" className="side-nav">
      {links.map(([href, label]) => (
        <Link key={href} href={href} aria-current={href === active ? "page" : undefined}>
          <Icon name={iconFor(href)} /> <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function PageTitle({ links }: { links: [string, string][] }) {
  const active = useActive(links);
  return <h2 className="topbar-title">{links.find(([h]) => h === active)?.[1] ?? "Saapidalaam"}</h2>;
}
