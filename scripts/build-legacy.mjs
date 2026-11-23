// Construiește aplicația clasică pentru Next.js:
//   legacy/source.html  (aplicația completă, un singur fișier)  ->  public/legacy/index.html
//   src/legacy/adapter.ts (Supabase, login, roluri)               ->  public/legacy/adapter.js
// Rulează automat înainte de `npm run build` și `npm run dev`.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

mkdirSync("public/legacy", { recursive: true });

await build({
  entryPoints: ["src/legacy/adapter.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "public/legacy/adapter.js",
  legalComments: "none",
  logLevel: "warning",
});

let html = readFileSync("legacy/source.html", "utf8");
const must = (s) => {
  if (!html.includes(s)) throw new Error("Nu găsesc în legacy/source.html: " + s.slice(0, 80));
};

const jspdf = '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/';
must(jspdf);
html = html.replace(jspdf, '<script src="config.js"></script>\n<script src="adapter.js"></script>\n' + jspdf);

must("\napplyRole();\ninit();\n");
html = html.replace("\napplyRole();\ninit();\n", "\nwindow.__startApp=()=>{ applyRole(); init(); };\n");

html = html.replace("Descărcarea nu e disponibilă aici – deschide pagina în claude.ai", "Descărcarea nu e disponibilă în acest browser");
html = html.replace(
  '<link rel="apple-touch-icon" href="img/logo.png">',
  '<link rel="apple-touch-icon" href="img/logo.png">\n<link rel="manifest" href="/manifest.webmanifest">',
);

writeFileSync("public/legacy/index.html", html);
console.log("legacy OK", (html.length / 1024).toFixed(0) + " KB");
