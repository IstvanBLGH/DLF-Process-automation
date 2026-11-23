"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { calc, classes, clsOf, fTs, n2, num, type Box, type Test } from "@/lib/burduf";
import { footer, newPdf } from "@/lib/pdf";

const DRAFT = "dt_teste_draft";
const TONE = { bad: "bg-bad-soft text-bad", ok: "bg-good-soft text-good", warn: "bg-warn-soft text-warn" } as const;

type Props = {
  initial: Test;
  ro: boolean;
  isNew: boolean;
  onClose: () => void;
  onSave: (t: Test) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function Editor({ initial, ro, isNew, onClose, onSave, onDelete }: Props) {
  const [t, setT] = useState<Test>(() => ({ ...initial, cls: initial.cls?.length ? initial.cls : [{}, {}, {}, {}] }));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pend, setPend] = useState<{ kg: string; n: string; c: number | null }>({ kg: "", n: "", c: null });
  const kgRef = useRef<HTMLInputElement>(null);

  const r = useMemo(() => calc(t), [t]);
  const CL = classes(r.C);
  const set = (p: Partial<Test>) => {
    setT((x) => ({ ...x, ...p }));
    setDirty(true);
  };

  // ciornă automată: nu se pierde testul dacă închizi pagina
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(DRAFT, JSON.stringify(t));
    } catch {
      /* ignorat */
    }
  }, [t, dirty]);

  // clasa propusă din (brut − tară) / bucăți; operatorul o poate schimba
  const pKg = num(pend.kg), pN = num(pend.n);
  const auto = pKg != null && pN ? clsOf(((pKg - (num(t.tara) ?? 0) / 1000) / pN) * 1000, r.C) : null;
  const pCls = pend.c ?? auto;
  const canAdd = pKg != null && pKg > 0 && !!pN && pCls != null;

  const addBox = (): Box[] => {
    if (!canAdd) return t.box;
    const box = [...t.box, { c: pCls!, kg: pend.kg, n: pend.n }];
    set({ box });
    setPend({ kg: "", n: "", c: null });
    kgRef.current?.focus();
    return box;
  };

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const box = t.mode === "box" && canAdd ? addBox() : t.box; // cutia scrisă dar neadăugată intră și ea
      const out = { ...t, box };
      if (!calc(out).n) {
        setMsg("Nu ai introdus nicio bucată – adaugă cel puțin o cutie sau o clasă.");
        return;
      }
      await onSave(out);
      localStorage.removeItem(DRAFT);
      onClose();
    } catch (e) {
      setMsg("Nu am putut salva: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pdf() {
    const { doc, table, y } = await newPdf("Test burduf – cântărire", `${fTs(t.ts)}${t.lot ? " · lot " + t.lot : ""}${t.op ? " · " + t.op : ""}`);
    table({
      startY: 34,
      head: [["Clasă", "Bucăți", "%", "kg net", "Media g/buc"]],
      body: [
        ...r.rows.map((x, i) => [CL[i].l, String(x.n), n2(x.pc, 1) + "%", n2(x.kg, 3), n2(x.avg, 1)]),
        ["TOTAL", String(r.n), "100%", n2(r.kg, 3), n2(r.avg, 1)],
      ],
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    table({
      startY: y() + 6,
      head: [["Indicator", "Valoare"]],
      body: [
        ["Media pe bucată", `${n2(r.avg, 1)} g (țintă >= ${r.C.tinta} g) – ${r.ok ? "CONFORM" : "SUB ȚINTĂ"}`],
        ["Dat în plus față de nominal", `${n2(r.give, 1)} g/buc (nominal ${r.C.nominal} g)`],
        ["Sub limita de " + r.C.lim[0] + " g", `${r.under} buc (${n2(r.underPc, 1)}%)`],
        ["Tara cutie", `${n2(r.tara, 0)} g · ${r.cut} cutii · brut ${n2(r.br, 3)} kg`],
        ["MP fără ambalaj", r.mp != null ? `${n2(r.mp, 3)} kg` : "—"],
        ["Deșeu brânză pe jos", r.desKg != null ? `${n2(r.desKg, 3)} kg (${n2(r.lossPc, 2)}%)` : "—"],
        ["Randament ambalat", r.yieldPc != null ? `${n2(r.yieldPc, 1)}%` : "—"],
        ...(t.linie ? [["Linie", t.linie]] : []),
        ...(t.note ? [["Observații", t.note]] : []),
      ],
      columnStyles: { 0: { cellWidth: 60, fontStyle: "bold" } },
    });
    if (t.mode === "box" && t.box.length)
      table({
        startY: y() + 6,
        head: [["#", "Clasă", "kg brut", "Bucăți", "g/buc net"]],
        body: t.box.map((b, i) => {
          const net = (num(b.kg) ?? 0) - r.tara / 1000, n = num(b.n) ?? 0;
          return [String(i + 1), CL[b.c]?.l ?? "", n2(num(b.kg), 3), String(n), n ? n2((net / n) * 1000, 1) : "—"];
        }),
      });
    footer(doc);
    doc.save(`test-burduf-${t.ts.slice(0, 10)}${t.lot ? "-" + t.lot.replace(/[^\w-]+/g, "_") : ""}.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost -ml-3"
          onClick={() => {
            if (dirty && !confirm("Ieși fără să salvezi? Testul rămâne ca ciornă și îl poți continua.")) return;
            onClose();
          }}
        >
          ‹ Înapoi
        </button>
        <h1 className="text-[22px] font-bold tracking-tight">{isNew ? "Test nou" : "Test burduf"}</h1>
        {dirty && <span className="ml-auto rounded-full bg-warn-soft px-2.5 py-1 text-[12px] font-semibold text-warn">nesalvat</span>}
      </div>

      <fieldset disabled={ro} className="space-y-4">
        <section className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <label className="col-span-2 sm:col-span-1">
            <span className="label">Data și ora</span>
            <input className="field" type="datetime-local" value={t.ts} onChange={(e) => set({ ts: e.target.value })} />
          </label>
          <label>
            <span className="label">Lot</span>
            <input className="field" value={t.lot} onChange={(e) => set({ lot: e.target.value })} />
          </label>
          <label>
            <span className="label">Tara cutie (g)</span>
            <input className="field" inputMode="decimal" value={t.tara} onChange={(e) => set({ tara: e.target.value })} />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="label">Operator</span>
            <input className="field" value={t.op} onChange={(e) => set({ op: e.target.value })} />
          </label>
        </section>

        <div className="seg" role="group" aria-label="Mod de introducere">
          <button type="button" aria-pressed={t.mode === "box"} onClick={() => set({ mode: "box" })}>
            📦 Cutie cu cutie
          </button>
          <button type="button" aria-pressed={t.mode === "cls"} onClick={() => set({ mode: "cls" })}>
            📝 Totaluri pe clase
          </button>
        </div>

        {t.mode === "box" ? (
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Cântăresc cutia</h2>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="label">kg brut (cu cutie)</span>
                <input
                  ref={kgRef}
                  className="field text-[22px] font-semibold"
                  inputMode="decimal"
                  placeholder="0,000"
                  value={pend.kg}
                  onChange={(e) => setPend({ ...pend, kg: e.target.value })}
                />
              </label>
              <label>
                <span className="label">Nr. bucăți</span>
                <input
                  className="field text-[22px] font-semibold"
                  inputMode="numeric"
                  placeholder="0"
                  value={pend.n}
                  onChange={(e) => setPend({ ...pend, n: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBox())}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CL.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => setPend({ ...pend, c: c.k })}
                  className={`min-h-12 rounded-xl border-2 px-2 text-[15px] font-semibold transition ${
                    pCls === c.k ? `border-current ${TONE[c.tone]}` : "border-line bg-white text-muted"
                  }`}
                >
                  {c.l}
                  {auto === c.k && pend.c == null && <span className="block text-[11px] font-normal">propusă</span>}
                </button>
              ))}
            </div>
            <button type="button" className="btn-primary w-full" disabled={!canAdd} onClick={addBox}>
              ＋ Adaugă cutia
            </button>

            {t.box.length > 0 && (
              <ol className="divide-y divide-line rounded-xl border border-line">
                {t.box.map((b, i) => {
                  const n = num(b.n) ?? 0, net = (num(b.kg) ?? 0) - r.tara / 1000;
                  return (
                    <li key={i} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                      <span className="w-6 text-muted">{i + 1}.</span>
                      <span className={`rounded-md px-2 py-0.5 text-[13px] font-semibold ${TONE[CL[b.c]?.tone ?? "ok"]}`}>{CL[b.c]?.l}</span>
                      <span className="flex-1">
                        {n2(num(b.kg), 3)} kg · {n} buc · <b>{n ? n2((net / n) * 1000, 1) : "—"} g/buc</b>
                      </span>
                      <button
                        type="button"
                        aria-label="Șterge cutia"
                        className="px-2 text-bad"
                        onClick={() => set({ box: t.box.filter((_, j) => j !== i) })}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ) : (
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Totaluri pe clase (ca pe foaie)</h2>
            {CL.map((c, i) => {
              const row = t.cls[i] ?? {};
              const upd = (p: Partial<typeof row>) => set({ cls: t.cls.map((x, j) => (j === i ? { ...x, ...p } : x)) });
              return (
                <div key={c.k} className="grid grid-cols-[96px_1fr_1fr_1fr] items-end gap-2">
                  <span className={`mb-1 rounded-lg px-2 py-2 text-center text-[14px] font-semibold ${TONE[c.tone]}`}>{c.l}</span>
                  <label>
                    <span className="label">kg brut</span>
                    <input className="field" inputMode="decimal" value={row.kg ?? ""} onChange={(e) => upd({ kg: e.target.value })} />
                  </label>
                  <label>
                    <span className="label">cutii</span>
                    <input className="field" inputMode="numeric" value={row.cut ?? ""} onChange={(e) => upd({ cut: e.target.value })} />
                  </label>
                  <label>
                    <span className="label">bucăți</span>
                    <input className="field" inputMode="numeric" value={row.n ?? ""} onChange={(e) => upd({ n: e.target.value })} />
                  </label>
                </div>
              );
            })}
          </section>
        )}

        <section className="card grid grid-cols-2 gap-3 p-4">
          <label>
            <span className="label">MP fără ambalaj (kg)</span>
            <input className="field" inputMode="decimal" value={t.mp} onChange={(e) => set({ mp: e.target.value })} />
          </label>
          <label>
            <span className="label">Deșeu brânză pe jos</span>
            <div className="flex gap-2">
              <input className="field" inputMode="decimal" value={t.des} onChange={(e) => set({ des: e.target.value })} />
              <select className="field w-20" value={t.desU} onChange={(e) => set({ desU: e.target.value as "g" | "kg" })}>
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </label>
          <label className="col-span-2">
            <span className="label">Observații</span>
            <textarea className="field min-h-20" value={t.note} onChange={(e) => set({ note: e.target.value })} />
          </label>
        </section>
      </fieldset>

      <Result r={r} />

      {msg && <p className="rounded-xl bg-bad-soft p-3 text-bad">{msg}</p>}

      <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex flex-wrap gap-2 rounded-2xl bg-canvas/90 py-2 backdrop-blur md:bottom-4">
        {!ro && (
          <button className="btn-primary flex-1" disabled={busy} onClick={save}>
            {busy ? "Se salvează…" : "Salvează testul"}
          </button>
        )}
        <button className="btn-secondary" onClick={pdf} disabled={!r.n}>
          PDF
        </button>
        {!ro && !isNew && (
          <button
            className="btn-secondary text-bad"
            onClick={async () => {
              if (!confirm("Ștergi definitiv testul?")) return;
              await onDelete(t.id);
              onClose();
            }}
          >
            Șterge
          </button>
        )}
      </div>
    </div>
  );
}

function Result({ r }: { r: ReturnType<typeof calc> }) {
  const CL = classes(r.C);
  return (
    <section className="card overflow-hidden">
      <div className={`flex items-center gap-4 p-4 ${r.avg == null ? "" : r.ok ? "bg-good-soft" : "bg-bad-soft"}`}>
        <div>
          <div className="text-[13px] font-medium uppercase tracking-wide text-muted">Media pe bucată</div>
          <div className="text-[40px] leading-none font-bold tracking-tight">
            {n2(r.avg, 1)} <span className="text-[20px] font-semibold text-muted">g</span>
          </div>
        </div>
        {r.avg != null && (
          <div className={`ml-auto text-right font-semibold ${r.ok ? "text-good" : "text-bad"}`}>
            {r.ok ? "✓ Conform" : "✕ Sub țintă"}
            <div className="text-[14px] font-normal text-muted">țintă ≥ {r.C.tinta} g</div>
          </div>
        )}
      </div>
      <table className="w-full text-[15px]">
        <thead className="text-left text-[12px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Clasă</th>
            <th className="px-2 py-2 text-right font-medium">Buc</th>
            <th className="px-2 py-2 text-right font-medium">%</th>
            <th className="px-2 py-2 text-right font-medium">kg net</th>
            <th className="px-4 py-2 text-right font-medium">g/buc</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {r.rows.map((x, i) => (
            <tr key={i}>
              <td className="px-4 py-2">{CL[i].l}</td>
              <td className="px-2 py-2 text-right tabular-nums">{x.n}</td>
              <td className="px-2 py-2 text-right tabular-nums">{n2(x.pc, 1)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{n2(x.kg, 3)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{n2(x.avg, 1)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="px-4 py-2">Total</td>
            <td className="px-2 py-2 text-right tabular-nums">{r.n}</td>
            <td className="px-2 py-2 text-right">100</td>
            <td className="px-2 py-2 text-right tabular-nums">{n2(r.kg, 3)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{n2(r.avg, 1)}</td>
          </tr>
        </tbody>
      </table>
      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line text-[15px] sm:grid-cols-4">
        {[
          ["Dat în plus", r.give != null ? `${n2(r.give, 1)} g/buc` : "—"],
          [`Sub ${r.C.lim[0]} g`, `${r.under} buc · ${n2(r.underPc, 1)}%`],
          ["Randament", r.yieldPc != null && r.mp != null ? `${n2(r.yieldPc, 1)}%` : "—"],
          ["Deșeu", r.desKg != null ? `${n2(r.desKg, 3)} kg` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-white p-3">
            <dt className="text-[12px] uppercase tracking-wide text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
