"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

// BR-30: fetch a fresh signed token every 25s (tokens live ~30s) and render it as a QR.
export function RotatingQr() {
  const [img, setImg] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/qr-token", { cache: "no-store" });
        if (!r.ok) throw new Error("Could not load QR");
        const { token, expiresAt } = (await r.json()) as { token: string; expiresAt: number };
        const url = await QRCode.toDataURL(token, { width: 320, margin: 2, errorCorrectionLevel: "M" });
        if (alive) { setImg(url); setExpiresAt(expiresAt); setError(null); }
      } catch (e) { if (alive) setError((e as Error).message); }
    };
    load();
    const refresh = setInterval(load, 25_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(refresh); clearInterval(clock); };
  }, []);

  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return (
    <div style={{ textAlign: "center" }}>
      {error && <div className="flash error" role="alert">{error}</div>}
      {img ? <img src={img} alt="Your rotating meal QR code" width={320} height={320} style={{ maxWidth: "100%", height: "auto", background: "#fff", borderRadius: 8 }} />
        : <p className="muted" aria-busy="true">Loading QR…</p>}
      <p className="muted" aria-live="polite">{img && (left > 0 ? `Refreshes in ${left}s` : "Refreshing…")}</p>
    </div>
  );
}
