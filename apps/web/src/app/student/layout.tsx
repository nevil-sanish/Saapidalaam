import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("student");
  return (
    <Shell user={user} links={[["/student", "Dashboard"], ["/student/menu", "Menu & booking"], ["/student/pattern", "Pattern"], ["/student/qr", "QR"], ["/student/deposit", "Deposit"], ["/student/notifications", "Notifications"]]}>
      {!user.has_photo && (
        <div className="flash error">Upload your profile photo before booking meals. <Link href="/student/photo">Add photo</Link></div>
      )}
      {children}
    </Shell>
  );
}
