import "./globals.css";
import type { Metadata } from "next";

// Every page reads the session/DB at request time; never prerender at build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Saapidalaam — IIIT Kottayam Mess", description: "Pre-book mess meals, pay from deposit, verify by QR." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
