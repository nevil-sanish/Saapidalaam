import { requireRole } from "@/lib/auth";
import { act } from "@/lib/act";
import { regenerateBackupCode } from "@/lib/db";
import { Flash } from "@/components/Shell";
import { RotatingQr } from "@/components/student/RotatingQr";

async function newCode() {
  "use server";
  const user = await requireRole("student");
  // Code is shown once via the flash; only its hash is stored (BR-31).
  await act("/student/qr", async () => `Your new backup code: ${await regenerateBackupCode(user.id)} — write it down, it won't be shown again`);
}

export default async function QrPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  return (
    <>
      <h1>Counter QR</h1>
      <Flash sp={sp} />
      <div className="card">
        <p style={{ textAlign: "center" }}><b>{user.full_name}</b> · {user.roll_no ?? "no roll no"}</p>
        <RotatingQr />
        <p className="muted" style={{ textAlign: "center" }}>Screenshots stop working within 30 seconds.</p>
      </div>
      <div className="card">
        <h2>Backup code</h2>
        <p className="muted">For a dead phone: tell the counter staff your 8-character code. Backup-code scans are flagged (BR-31). Generating a new code invalidates the old one.</p>
        <form action={newCode}><button className="secondary">Generate new backup code</button></form>
      </div>
    </>
  );
}
