// Importă unul sau mai multe fișiere de backup („backup-DT-*.json”) în Supabase și VERIFICĂ rezultatul.
//
//   npm run import -- backup-DT-2026-11-23-complet.json              (adaugă doar ce lipsește – sigur)
//   npm run import -- backup.json --overwrite                         (suprascrie documentele cu același id)
//   npm run import -- backup.json --dry                               (doar arată ce ar face)
//
// Citește NEXT_PUBLIC_SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY din .env.local (sau din mediu).
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const overwrite = args.includes("--overwrite");
const dry = args.includes("--dry");
if (!URL || !KEY) {
  console.error("Lipsesc NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (pune-le în .env.local).");
  process.exit(1);
}
if (!files.length) {
  console.error("Dă cel puțin un fișier: npm run import -- backup-DT-....json");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// JSON canonic (cheile sortate) – ca să comparăm exact conținutul
const canon = (v) =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}`
      : JSON.stringify(v ?? null);
// aplicația veche cu Firebase coda listele-în-liste ca {__na:"..."}; aici le salvăm normal
const dec = (v) =>
  Array.isArray(v)
    ? v.map(dec)
    : v && typeof v === "object"
      ? Object.keys(v).length === 1 && typeof v.__na === "string"
        ? JSON.parse(v.__na)
        : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)]))
      : v;

async function fetchCol(col) {
  const m = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("docs").select("id,data").eq("col", col).order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data) m.set(r.id, r.data);
    if (data.length < 1000) break;
  }
  return m;
}

// 1) adunăm toate documentele din fișiere (la id dublat între fișiere câștigă ultimul fișier dat)
const want = new Map(); // col -> Map(id -> data)
for (const f of files) {
  const J = JSON.parse(readFileSync(f, "utf8"));
  if (!J || typeof J.collections !== "object") throw new Error(`${f} nu e un backup al aplicației`);
  let n = 0;
  for (const [col, rows] of Object.entries(J.collections)) {
    if (!Array.isArray(rows)) continue;
    const m = want.get(col) ?? new Map();
    for (const r of rows) {
      if (!r || r.id == null) continue;
      m.set(String(r.id), dec(r.data ?? {}));
      n++;
    }
    want.set(col, m);
  }
  console.log(`📄 ${f}: ${n} înregistrări (exportat ${String(J.exported ?? "").slice(0, 16)}, mod ${J.mode ?? "?"})`);
}

// 2) comparăm cu ce e deja în Supabase și scriem
const report = [];
let totalWritten = 0;
for (const [col, m] of want) {
  if (!m.size) continue;
  const have = await fetchCol(col);
  const rows = [];
  let same = 0, kept = 0;
  for (const [id, data] of m) {
    const cur = have.get(id);
    if (cur !== undefined && canon(cur) === canon(data)) same++;
    else if (cur !== undefined && !overwrite) kept++;
    else rows.push({ col, id, data });
  }
  if (!dry)
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from("docs").upsert(rows.slice(i, i + 200), { onConflict: "col,id" });
      if (error) throw new Error(`${col}: ${error.message}`);
    }
  totalWritten += rows.length;
  report.push({ col, inFile: m.size, scrise: rows.length, identice: same, pastrateDinSupabase: kept });
}
console.table(report);

if (dry) {
  console.log("--dry: nu am scris nimic.");
  process.exit(0);
}

// 3) VERIFICARE: recitim tot și comparăm document cu document
let ok = 0, bad = 0, keptDiff = 0;
for (const [col, m] of want) {
  const have = await fetchCol(col);
  for (const [id, data] of m) {
    const cur = have.get(id);
    if (cur === undefined) {
      bad++;
      console.error(`❌ lipsește ${col}/${id}`);
    } else if (canon(cur) === canon(data)) ok++;
    else if (!overwrite) keptDiff++;
    else {
      bad++;
      console.error(`❌ diferă ${col}/${id}`);
    }
  }
}
console.log(`\nScrise acum: ${totalWritten}. Verificare: ${ok} identice cu backup-ul` + (keptDiff ? `, ${keptDiff} existau deja în Supabase cu altă versiune (păstrate; folosește --overwrite ca să le înlocuiești)` : "") + (bad ? `, ${bad} PROBLEME` : ""));
if (bad) process.exit(2);
console.log("✅ Toate datele din backup sunt în Supabase.");
