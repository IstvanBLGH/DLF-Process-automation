"use client";
// Strat de date comun: Firestore (producție) sau localStorage (mod demo, fără configurare).
// Colecțiile sunt aceleași ca în aplicația clasică: teste, testeCfg, tasks, lapte, trUnit, ...
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { dec, enc } from "./codec";
import { fb, hasFirebase } from "./firebase";

export type Doc = { id: string } & Record<string, unknown>;

const LKEY = (col: string) => `fn_demo_${col}`;
const bus = new EventTarget();

function localRead(col: string): Doc[] {
  try {
    return JSON.parse(localStorage.getItem(LKEY(col)) ?? "[]") as Doc[];
  } catch {
    return [];
  }
}
function localWrite(col: string, rows: Doc[]) {
  try {
    localStorage.setItem(LKEY(col), JSON.stringify(rows));
  } catch {
    /* plin / mod privat */
  }
  bus.dispatchEvent(new Event(col));
}

export function subscribe(col: string, cb: (rows: Doc[]) => void, onErr?: (e: Error) => void): () => void {
  if (hasFirebase) {
    return onSnapshot(
      collection(fb().db, col),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...(dec(d.data()) as Record<string, unknown>) }))),
      (e) => onErr?.(e),
    );
  }
  const fire = () => cb(localRead(col));
  bus.addEventListener(col, fire);
  const onStorage = (e: StorageEvent) => e.key === LKEY(col) && fire();
  window.addEventListener("storage", onStorage);
  queueMicrotask(fire);
  return () => {
    bus.removeEventListener(col, fire);
    window.removeEventListener("storage", onStorage);
  };
}

export async function put<T extends Doc>(col: string, item: T): Promise<void> {
  const { id, ...body } = item;
  if (hasFirebase) {
    await setDoc(doc(fb().db, col, id), enc(body) as Record<string, unknown>);
    return;
  }
  const rows = localRead(col);
  const i = rows.findIndex((r) => r.id === id);
  if (i >= 0) rows[i] = item;
  else rows.push(item);
  localWrite(col, rows);
}

export async function remove(col: string, id: string): Promise<void> {
  if (hasFirebase) {
    await deleteDoc(doc(fb().db, col, id));
    return;
  }
  localWrite(
    col,
    localRead(col).filter((r) => r.id !== id),
  );
}

/** Ascultă o colecție în timp real. `rows` e null până la prima încărcare. */
export function useCollection<T extends Doc = Doc>(col: string): { rows: T[] | null; error: string | null } {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      subscribe(
        col,
        (r) => setRows(r as T[]),
        (e) => setError(e.message),
      ),
    [col],
  );
  return { rows, error };
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
