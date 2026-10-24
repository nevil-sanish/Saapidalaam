"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Result = {
  result: "served" | "already_served" | "no_booking" | "invalid_token" | "outside_window";
  student?: { id: string; full_name: string; roll_no: string | null };
  servedAt?: string; servedBy?: string; slot?: string; flagged?: boolean; photoUrl?: string;
};
type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

const LABEL: Record<Result["result"], [string, string, string]> = {
  served: ["Served", "ok", "✓"],
  already_served: ["Already served", "warn", "!"],
  no_booking: ["No booking for this slot", "bad", "✕"],
  invalid_token: ["Invalid or expired code", "bad", "✕"],
  outside_window: ["Outside serving window", "bad", "✕"],
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short" });

export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef<{ token: string; at: number }>({ token: "", at: 0 });
  const busy = useRef(false);
  const [camMsg, setCamMsg] = useState("Starting camera…");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const [paste, setPaste] = useState("");
  const [code, setCode] = useState("");

  const submit = useCallback(async (input: string, method: "qr" | "backup") => {
    input = input.trim();
    if (!input || busy.current) return;
    const now = Date.now();
    if (input === last.current.token && now - last.current.at < 3000) return; // debounce repeat frames
    last.current = { token: input, at: now };
    busy.current = true;
    setErr("");
    try {
      const r = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, method }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error(j?.error ?? `Server error (${r.status})`);
      setRes(j as Result);
    } catch (e) {
      setRes(null);
      setErr(e instanceof TypeError ? "Network error — check the connection and scan again." : (e as Error).message);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!BD) { setCamMsg("This browser can't read QR codes from the camera. Paste the token or use the backup code below."); return; }
    let stream: MediaStream | null = null, timer = 0, stopped = false;
    const detector = new BD({ formats: ["qr_code"] });
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } }).then(async (s) => {
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setCamMsg("");
      const loop = async () => {
        if (stopped) return;
        try { const [c] = await detector.detect(v); if (c?.rawValue) await submit(c.rawValue, "qr"); } catch { /* frame not ready */ }
        timer = window.setTimeout(loop, 250);
      };
      loop();
    }).catch(() => setCamMsg("Camera unavailable or permission denied. Paste the token or use the backup code below."));
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [submit]);

  return (
    <>
      <h1>Scanner</h1>
      <div className="bento">
        <section className="card dark scan-stage span-7">
          <div className="scan-frame">
            <video ref={video} muted playsInline aria-label="Camera preview for QR scanning" style={{ display: camMsg ? "none" : "block" }} />
            {camMsg && <p className="muted scan-msg" role="status">{camMsg}</p>}
            <i className="corner tl" aria-hidden /><i className="corner tr" aria-hidden /><i className="corner bl" aria-hidden /><i className="corner br" aria-hidden />
          </div>
          <form className="scan-form" onSubmit={(e) => { e.preventDefault(); submit(paste, "qr"); setPaste(""); }}>
            <label htmlFor="tok" className="muted">QR token</label>
            <input id="tok" value={paste} maxLength={200} onChange={(e) => setPaste(e.target.value)} placeholder="Paste token" />
            <button className="mint">Check</button>
          </form>
        </section>

        <section className="card span-5 backup-card">
          <h2>Backup code</h2>
          <p className="muted">For students whose phone can&apos;t show the QR. Check their face against the photo.</p>
          <form className="scan-form" onSubmit={(e) => { e.preventDefault(); submit(code, "backup"); setCode(""); }}>
            <label htmlFor="code" className="sr-only">Backup code</label>
            <input id="code" className="code-input" value={code} maxLength={8} minLength={8} required autoComplete="off" autoCapitalize="characters"
              placeholder="8-character code"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <button>Verify</button>
          </form>
        </section>
      </div>

      <div aria-live="polite" style={{ marginTop: 18 }}>
        {err && <div className="flash error">{err}</div>}
        {res && <ResultCard r={res} />}
      </div>
    </>
  );
}

function ResultCard({ r }: { r: Result }) {
  const [label, tone, mark] = LABEL[r.result];
  return (
    <section className={`card scan-result ${tone}`}>
      <div className="sr-photo">
        {r.photoUrl
          ? <img src={r.photoUrl} alt={r.student ? `Photo of ${r.student.full_name}` : "Student photo"} width={180} height={180} />
          : <span aria-hidden>{mark}</span>}
      </div>
      <div className="sr-body">
        <p className="sr-verdict">{label}</p>
        {r.result === "already_served" && r.servedAt && <p className="sr-sub">At {time(r.servedAt)}{r.servedBy ? ` by ${r.servedBy}` : ""}</p>}
        {r.student && <p className="sr-name">{r.student.full_name}</p>}
        <div className="row">
          {r.student && <span className="pill">{r.student.roll_no ?? "No roll no"}</span>}
          {r.slot && <span className="pill">{r.slot}</span>}
          {r.flagged && <span className="pill flag">Backup code — check face</span>}
        </div>
      </div>
    </section>
  );
}
