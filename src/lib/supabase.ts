"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDocDb, type DocDb, type DocDbStatus } from "./docdb";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Fără configurare Supabase aplicația rulează în „mod demo” (date doar în acest browser). */
export const hasSupabase = !!URL && !!KEY;

let client: SupabaseClient | undefined;
let docdb: DocDb | undefined;
const statusSubs = new Set<(s: DocDbStatus, n: number) => void>();

export function sb(): SupabaseClient {
  if (!hasSupabase) throw new Error("Supabase nu e configurat");
  client ??= createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export function db(): DocDb {
  docdb ??= createDocDb(sb(), { onStatus: (s, n) => statusSubs.forEach((f) => f(s, n)) });
  return docdb;
}

export function onSyncStatus(f: (s: DocDbStatus, n: number) => void) {
  statusSubs.add(f);
  return () => statusSubs.delete(f);
}
