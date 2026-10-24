import { requireRole } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("staff", "admin");
  return <Shell user={user} links={[["/staff", "Scanner"], ["/staff/counts", "Live counts"]]}>{children}</Shell>;
}
