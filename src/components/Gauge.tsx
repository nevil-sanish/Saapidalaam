/** Semicircle gauge: ink = spent, hatched = committed to future meals, track = still free. Values are fractions 0..1. */
export function Gauge({ spent, committed }: { spent: number; committed: number }) {
  const r = 80, len = Math.PI * r;
  const s = Math.max(0, Math.min(1, spent)), c = Math.max(0, Math.min(1 - s, committed));
  const arc = `M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`;
  return (
    <svg className="gauge" viewBox="0 0 200 112" role="img" aria-label={`${Math.round(s * 100)}% spent, ${Math.round(c * 100)}% committed`}>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#a6f2a0" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#252525" strokeWidth="1.6" />
        </pattern>
      </defs>
      <path d={arc} fill="none" stroke="#e3e8e0" strokeWidth="22" strokeLinecap="round" />
      {c > 0 && <path d={arc} fill="none" stroke="url(#hatch)" strokeWidth="22" strokeLinecap="round"
        strokeDasharray={`0 ${len * s} ${len * c} ${len}`} />}
      {s > 0 && <path d={arc} fill="none" stroke="#252525" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${len * s} ${len}`} />}
    </svg>
  );
}
