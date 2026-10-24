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
  const R = 22, C = 2 * Math.PI * R, frac = Math.min(1, left / 30);
  return (
    <div className="qr-live">
      {error && <div className="flash error" role="alert">{error}</div>}
      <div className="qr-tile">
        {img ? <img src={img} alt="Your rotating meal QR code" width={320} height={320} />
          : <p className="muted" aria-busy="true">Loading QR…</p>}
      </div>
      {img && (
        <div className="qr-timer" aria-live="polite">
          <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
            <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="5" />
            <circle cx="26" cy="26" r={R} fill="none" stroke="var(--mint)" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 26 26)" style={{ transition: "stroke-dashoffset 1s linear" }} />
            <text x="26" y="31" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor">{left}</text>
          </svg>
          <span>{left > 0 ? `Refreshes in ${left}s` : "Refreshing…"}</span>
        </div>
      )}
    </div>
  );
}
