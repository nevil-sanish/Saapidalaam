import { requireRole } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("manager", "admin");
  return <Shell user={user} links={[["/manager", "Demand"], ["/manager/payable", "Payable"]]}>{children}</Shell>;
}
