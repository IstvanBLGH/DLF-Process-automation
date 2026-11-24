// Aceleași roluri ca în aplicația clasică (ROLES din legacy/index.html).
// `fab` = modulele de fabrică la care rolul are acces.
export type RoleKey = "admin" | "mgmt" | "dg" | "prod" | "lab" | "mnt" | "dep" | "op";
export type ModKey = "temp" | "protel" | "lapte" | "tr" | "ts" | "doc";

export const ROLES: Record<RoleKey, { n: string; fab: ModKey[]; ro?: boolean }> = {
  admin: { n: "Director tehnic / Administrator", fab: ["temp", "protel", "lapte", "tr", "ts", "doc"] },
  mgmt: { n: "Top management", fab: ["temp", "protel", "lapte", "tr", "ts", "doc"], ro: true },
  // Director general: vede tot, în afară de task-uri, mentenanță, pontaj și utilizatori; doar vizualizare
  dg: { n: "Director general", fab: ["temp", "protel", "lapte", "tr", "ts", "doc"], ro: true },
  prod: { n: "Producție", fab: ["protel", "tr", "ts", "lapte", "temp", "doc"] },
  lab: { n: "Laborator / Calitate", fab: ["lapte", "protel", "ts", "temp", "tr", "doc"] },
  mnt: { n: "Mentenanță", fab: ["temp", "doc"] },
  dep: { n: "Depozit & Achiziții", fab: ["lapte", "tr", "doc"] },
  op: { n: "Operator producție", fab: ["protel", "tr", "ts", "doc"] },
};

export type Profile = {
  uid: string;
  name: string;
  email?: string;
  role: RoleKey;
  station?: boolean;
  demo?: boolean;
};

export const can = (p: Profile | null, m: ModKey) => !!p && (ROLES[p.role] ?? ROLES.op).fab.includes(m);
export const readOnly = (p: Profile | null) => !!p && !!ROLES[p.role]?.ro;
