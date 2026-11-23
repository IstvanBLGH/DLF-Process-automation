"use client";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { dec } from "@/lib/codec";
import { db, hasSupabase, sb } from "@/lib/supabase";

type Row = { id: string; data: Record<string, unknown> };
type Plan = { col: string; rows: Row[]; nou: number; identic: number; diferit: number };

// JSON canonic (cheile sortate), ca să comparăm exact conținutul
const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as object)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k]))
          .join(",")}}`
      : JSON.stringify(v ?? null);

async function readAll(): Promise<Map<string, Map<string, unknown>>> {
  const out = new Map<string, Map<string, unknown>>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from("docs").select("col,id,data").order("col").order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const m = out.get(r.col) ?? new Map();
      m.set(r.id, r.data);
      out.set(r.col, m);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function ImportPage() {
  const { profile } = useAuth();
  const [plan, setPlan] = useState<Plan[] | null>(null);
  const [src, setSrc] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState("");

  if (profile?.role !== "admin") return <p className="card p-6 text-center text-muted">Doar administratorul are acces aici.</p>;
  if (!hasSupabase) return <p className="card p-6 text-center text-muted">Configurează întâi Supabase (vezi README).</p>;

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setResult("");
    setBusy("Citesc fișierele…");
    try {
      const want = new Map<string, Map<string, Record<string, unknown>>>();
      const names: string[] = [];
      for (const f of Array.from(files)) {
        const J = JSON.parse(await f.text()) as { collections?: Record<string, Row[]>; exported?: string };
        if (!J?.collections) throw new Error(`${f.name} nu e un backup al aplicației`);
        names.push(`${f.name} (${String(J.exported ?? "").slice(0, 10)})`);
        for (const [col, rows] of Object.entries(J.collections)) {
          const m = want.get(col) ?? new Map();
          for (const r of rows ?? []) if (r?.id != null) m.set(String(r.id), dec(r.data ?? {}) as Record<string, unknown>);
          want.set(col, m);
        }
      }
      const have = await readAll();
      const p: Plan[] = [];
      for (const [col, m] of want) {
        if (!m.size) continue;
        const h = have.get(col) ?? new Map();
        const pl: Plan = { col, rows: [], nou: 0, identic: 0, diferit: 0 };
        for (const [id, data] of m) {
          pl.rows.push({ id, data });
          if (!h.has(id)) pl.nou++;
          else if (canon(h.get(id)) === canon(data)) pl.identic++;
          else pl.diferit++;
        }
        p.push(pl);
      }
      setSrc(names.join(", "));
      setPlan(p);
    } catch (e) {
      setResult("❌ " + (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function run() {
    if (!plan) return;
    setBusy("Import…");
    try {
      const have = await readAll();
      let k = 0;
      for (const p of plan)
        for (const r of p.rows) {
          const cur = have.get(p.col)?.get(r.id);
          if (cur !== undefined && (canon(cur) === canon(r.data) || !overwrite)) continue;
          await db().collection(p.col).doc(r.id).set(r.data);
          if (++k % 20 === 0) setBusy(`Import… ${k}`);
        }
      await db().flush();
      // verificare: recitim și comparăm document cu document
      setBusy("Verific…");
      const after = await readAll();
      let ok = 0, kept = 0, bad = 0;
      for (const p of plan)
        for (const r of p.rows) {
          const cur = after.get(p.col)?.get(r.id);
          if (cur === undefined) bad++;
          else if (canon(cur) === canon(r.data)) ok++;
          else if (!overwrite) kept++;
          else bad++;
        }
      setResult(
        (bad ? "❌ " : "✅ ") +
          `Scrise ${k}. Verificare: ${ok} identice cu backup-ul` +
          (kept ? `, ${kept} păstrate în varianta din baza de date (mai noi)` : "") +
          (bad ? `, ${bad} cu probleme – reîncearcă` : ". Nimic pierdut."),
      );
      setPlan(null);
    } catch (e) {
      setResult("❌ " + (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function exportAll() {
    setBusy("Pregătesc backup-ul…");
    try {
      const all = await readAll();
      const collections: Record<string, Row[]> = {};
      let n = 0;
      for (const [col, m] of all) {
        collections[col] = [...m].map(([id, data]) => ({ id, data: data as Record<string, unknown> }));
        n += m.size;
      }
      const out = { app: "DT-Ferma", version: 2, exported: new Date().toISOString(), mode: "supabase", collections };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
      a.download = `backup-DT-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setResult(`✅ Backup descărcat – ${n} înregistrări`);
    } catch (e) {
      setResult("❌ " + (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[15px] font-medium text-brand">Administrare</p>
        <h1 className="text-[28px] font-bold tracking-tight">Date și backup</h1>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Importă un backup</h2>
        <p className="text-[15px] text-muted">
          Fișierele „backup-DT-….json” din aplicația veche (butonul Backup) sau de pe tabletele care au lucrat „Salvare locală”. Poți alege mai multe deodată.
        </p>
        <label className="btn-secondary w-full cursor-pointer">
          Alege fișierele
          <input type="file" accept="application/json,.json" multiple hidden onChange={(e) => pick(e.target.files)} />
        </label>

        {plan && (
          <div className="space-y-3">
            <p className="text-[15px]">
              <b>Sursa:</b> {src}
            </p>
            <table className="w-full text-[15px]">
              <thead className="text-left text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1">Colecție</th>
                  <th className="text-right">Noi</th>
                  <th className="text-right">Identice</th>
                  <th className="text-right">Diferite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {plan.map((p) => (
                  <tr key={p.col}>
                    <td className="py-1.5">{p.col}</td>
                    <td className="text-right tabular-nums">{p.nou}</td>
                    <td className="text-right tabular-nums text-muted">{p.identic}</td>
                    <td className={`text-right tabular-nums ${p.diferit ? "font-semibold text-warn" : "text-muted"}`}>{p.diferit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.some((p) => p.diferit) && (
              <label className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-[15px]">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                <span>
                  Înlocuiește și documentele <b>diferite</b> cu varianta din backup. Fără bifă le păstrez pe cele din baza de date (de obicei mai noi). Varianta veche rămâne
                  oricum în istoric.
                </span>
              </label>
            )}
            <button className="btn-primary w-full" onClick={run} disabled={!!busy}>
              Importă și verifică
            </button>
          </div>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Descarcă backup complet</h2>
        <p className="text-[15px] text-muted">Toate datele din Supabase într-un singur fișier, în același format. Bun de păstrat lunar.</p>
        <button className="btn-secondary w-full" onClick={exportAll} disabled={!!busy}>
          Descarcă backup
        </button>
      </section>

      {(busy || result) && <p className={`card p-4 font-medium ${result.startsWith("❌") ? "text-bad" : ""}`}>{busy || result}</p>}
    </div>
  );
}
