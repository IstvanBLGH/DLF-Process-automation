// Logica testului „Burduf – cântărire”, identică cu aplicația clasică (modulul TST).
// Documentele din colecția `teste` (tip:"burduf") sunt compatibile în ambele sensuri.
import type { Doc } from "./store";

export type Cfg = { lim: [number, number, number]; tinta: number; nominal: number; tara: number | string };
export type Box = { c: number; kg: string | number; n: string | number };
export type ClsRow = { kg?: string | number; cut?: string | number; n?: string | number };
export type Mode = "box" | "cls" | "pcs";

export type Test = Doc & {
  tip: "burduf";
  ts: string; // "YYYY-MM-DDTHH:MM"
  lot: string;
  op: string;
  linie: string;
  tara: string | number; // grame / cutie
  mode: Mode;
  cls: ClsRow[];
  pcs: number[];
  box: Box[];
  mp: string | number; // kg materie primă fără ambalaj
  des: string | number; // deșeu brânză pe jos
  desU: "g" | "kg";
  note: string;
  cfg: Cfg;
};

export const DEF_CFG: Cfg = { lim: [286, 304, 312], tinta: 304, nominal: 300, tara: 0 };
export const cfgOf = (c?: Partial<Cfg> | null): Cfg => ({ ...DEF_CFG, ...(c ?? {}) });

export const num = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  const x = parseFloat(String(v).replace(",", "."));
  return Number.isNaN(x) ? null : x;
};

export const n2 = (x: number | null | undefined, d = 1) =>
  x == null || Number.isNaN(x)
    ? "—"
    : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });

export function classes(C: Cfg) {
  const [a, b, c] = C.lim;
  return [
    { k: 0, l: `< ${a} g`, t: "Sub limită", tone: "bad" as const },
    { k: 1, l: `${a} – ${b} g`, t: "", tone: "ok" as const },
    { k: 2, l: `${b} – ${c} g`, t: "", tone: "ok" as const },
    { k: 3, l: `> ${c} g`, t: "Peste (dat în plus)", tone: "warn" as const },
  ];
}

export const clsOf = (w: number, C: Cfg) => {
  const [a, b, c] = C.lim;
  return w < a ? 0 : w < b ? 1 : w <= c ? 2 : 3;
};

type Row = { kg: number; br: number; cut: number; n: number };

export function calc(r: Pick<Test, "cfg" | "tara" | "mode" | "pcs" | "box" | "cls" | "mp" | "des" | "desU">) {
  const C = cfgOf(r.cfg);
  const tara = (num(r.tara) ?? 0) / 1000;
  let rows: Row[] = [0, 1, 2, 3].map(() => ({ kg: 0, br: 0, cut: 0, n: 0 }));
  if (r.mode === "pcs") {
    (r.pcs ?? []).forEach((w) => {
      const x = rows[clsOf(w, C)];
      x.n++;
      x.kg += w / 1000;
      x.br += w / 1000;
    });
  } else if (r.mode === "box") {
    (r.box ?? []).forEach((b) => {
      const x = rows[b.c];
      if (!x) return;
      x.br += num(b.kg) ?? 0;
      x.cut++;
      x.n += num(b.n) ?? 0;
      x.kg += (num(b.kg) ?? 0) - tara; // scad tara cutiei
    });
  } else {
    rows = (r.cls ?? []).slice(0, 4).map((x) => {
      const br = num(x.kg) ?? 0;
      const cut = num(x.cut) ?? 0;
      return { br, cut, kg: br - cut * tara, n: num(x.n) ?? 0 };
    });
  }
  while (rows.length < 4) rows.push({ kg: 0, br: 0, cut: 0, n: 0 });

  const kg = rows.reduce((a, x) => a + x.kg, 0);
  const n = rows.reduce((a, x) => a + x.n, 0);
  const avg = n ? (kg / n) * 1000 : null; // masă netă / nr. bucăți
  const mp = num(r.mp);
  const des = num(r.des);
  const desKg = des == null ? null : r.desU === "g" ? des / 1000 : des;
  const inKg = kg + (mp ?? 0) + (desKg ?? 0);
  return {
    C,
    br: rows.reduce((a, x) => a + x.br, 0),
    cut: rows.reduce((a, x) => a + x.cut, 0),
    tara: tara * 1000,
    rows: rows.map((x) => ({ ...x, avg: x.n ? (x.kg / x.n) * 1000 : null, pc: n ? (x.n / n) * 100 : 0 })),
    kg,
    n,
    avg,
    mp,
    desKg,
    inKg,
    ok: avg != null && avg >= C.tinta,
    under: rows[0].n,
    underPc: n ? (rows[0].n / n) * 100 : 0,
    overPc: n ? (rows[3].n / n) * 100 : 0,
    give: avg != null ? avg - C.nominal : null,
    yieldPc: inKg ? (kg / inKg) * 100 : null,
    lossPc: inKg && desKg != null ? (desKg / inKg) * 100 : null,
  };
}
export type Calc = ReturnType<typeof calc>;

export const nowTs = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fTs = (t?: string) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)} ${t.slice(11, 16)}` : "");
