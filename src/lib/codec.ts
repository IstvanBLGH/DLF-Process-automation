// Firestore nu acceptă liste în liste (ex. punctele de temperatură).
// Aceeași codare ca în aplicația clasică: [[..]] -> { __na: "<json>" }.
// Așa ambele variante (clasică și React) citesc și scriu aceleași documente.

type V = unknown;
const isNested = (a: unknown[]) => a.some((x) => Array.isArray(x));

export function enc(v: V): V {
  if (Array.isArray(v)) return isNested(v) ? { __na: JSON.stringify(v) } : v.map(enc);
  if (v && typeof v === "object") {
    const o: Record<string, V> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = enc(x);
    return o;
  }
  return v;
}

export function dec(v: V): V {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === "object") {
    const r = v as Record<string, V>;
    const keys = Object.keys(r);
    if (keys.length === 1 && typeof r.__na === "string") {
      try {
        return JSON.parse(r.__na);
      } catch {
        return [];
      }
    }
    const o: Record<string, V> = {};
    for (const k of keys) o[k] = dec(r[k]);
    return o;
  }
  return v;
}
