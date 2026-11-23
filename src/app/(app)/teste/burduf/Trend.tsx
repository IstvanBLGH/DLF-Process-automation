"use client";
import { useState } from "react";
import { calc, fTs, n2, type Test } from "@/lib/burduf";

// Media pe bucată la fiecare test, cu linia țintei. O singură serie: titlul o numește, fără legendă.
export function Trend({ tests, target }: { tests: Test[]; target: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const pts = tests.map((t) => ({ t, avg: calc(t).avg })).filter((p): p is { t: Test; avg: number } => p.avg != null);
  if (pts.length < 2) return null;

  const W = 360, H = 160, L = 30, R = 8, T = 16, B = 12;
  const vals = [...pts.map((p) => p.avg), target];
  const lo = Math.floor(Math.min(...vals) - 4), hiV = Math.ceil(Math.max(...vals) + 4);
  const x = (i: number) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v: number) => T + ((hiV - v) * (H - T - B)) / (hiV - lo);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join("");
  const ticks = [lo, Math.round((lo + hiV) / 2), hiV];
  const h = hi != null ? pts[hi] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Media pe bucată la ultimele teste">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-line" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {v}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="#6e6266" strokeDasharray="4 4" />
        <text x={W - R} y={y(target) - 5} textAnchor="end" className="fill-muted text-[11px]">
          țintă {target} g
        </text>
        <path d={d} fill="none" stroke="#700c30" strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={p.t.id} onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)}>
            <circle cx={x(i)} cy={y(p.avg)} r={14} fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(p.avg)}
              r={hi === i ? 6 : 4}
              fill={p.avg >= target ? "#700c30" : "#fff"}
              stroke="#700c30"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      {h && hi != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[13px] whitespace-nowrap text-white shadow"
          style={{ left: `${(x(hi) / W) * 100}%`, top: 0 }}
        >
          {fTs(h.t.ts)} · <b>{n2(h.avg, 1)} g</b>
          {h.t.lot && ` · lot ${h.t.lot}`}
        </div>
      )}
      <p className="mt-1 text-[13px] text-muted">Punct plin = media peste țintă · punct gol = sub țintă</p>
    </div>
  );
}
