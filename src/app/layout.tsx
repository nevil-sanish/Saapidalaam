import "./globals.css";
import type { Metadata } from "next";

// Every page reads the session/DB at request time; never prerender at build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Saapidalaam — IIIT Kottayam Mess", description: "Pre-book mess meals, pay from deposit, verify by QR." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
