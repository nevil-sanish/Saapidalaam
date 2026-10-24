import { requireRole } from "@/lib/auth";
import { tick } from "@/lib/db";
import { Shell } from "@/components/Shell";

const LINKS: [string, string][] = [
  ["/admin", "Overview"], ["/admin/catalog", "Catalog"], ["/admin/menu", "Menu"], ["/admin/specials", "Specials"],
  ["/admin/users", "Users"], ["/admin/finance", "Finance"], ["/admin/audit", "Audit"], ["/admin/reports", "Reports"],
  ["/admin/health", "Health"], ["/manager", "Demand"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");
  await tick();
  return <Shell user={user} links={LINKS}>{children}</Shell>;
}
