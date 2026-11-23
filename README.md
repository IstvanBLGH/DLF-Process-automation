# Ferma DT – Next.js

Aplicația fabricii „De la Ferma cu Omenie”, pe **Next.js 16 + React 19 + Tailwind 4 + Firebase**.
Rulează în browser (PWA: „Adaugă pe ecranul principal” pe iPhone/Android). Nu are nevoie de App Store sau Google Play.

## Cum e construită: migrare treptată

| Ce | Unde | Stare |
|---|---|---|
| Hub „Fabrică”, login, roluri, bara de jos iOS | `src/app/(app)/page.tsx`, `src/components/` | ✅ React |
| **Teste – burduf** (cutie cu cutie / pe clase, tară, grafic, PDF) | `src/app/(app)/teste/burduf/` | ✅ React (modul pilot) |
| „Întreabă Claude” + citire din poze | `src/app/api/ask/route.ts` | ✅ Route Handler |
| Restul modulelor (lapte, trasabilitate, PROTEL, temperaturi, mentenanță, task-uri, piese, pontaj, panou, utilizatori) | `public/legacy/index.html` (deschis la `/clasic`) | ⏳ aplicația completă, funcțională |

Ambele variante folosesc **aceeași bază Firestore, aceleași colecții și aceleași conturi**. Un test salvat în React apare în aplicația clasică și invers. Ciorna nesalvată (`dt_teste_draft`) e comună.

Din hub, cardurile nemigrate deschid direct modulul din aplicația clasică (`/legacy/index.html#m=lapte`, `#m=tr`, `#m=protel`, …).

## Pornire locală

```bash
npm install
cp .env.example .env.local     # completează cheile
npm run dev                    # http://localhost:3000
```

Fără chei Firebase aplicația pornește în **mod demo**: ești admin, datele rămân doar în browser. Așa poți lucra la design fără bază de date.

## Deploy pe Vercel

1. Pune proiectul pe GitHub, apoi Vercel → *Add New Project* → importă-l (Next.js e detectat automat).
2. În *Settings → Environment Variables* adaugă toate variabilele din `.env.example`.
   - `NEXT_PUBLIC_*` sunt publice.
   - `ANTHROPIC_API_KEY` rămâne doar pe server.
3. Firebase Console:
   - *Authentication → Settings → Authorized domains*: adaugă domeniul de la Vercel.
   - *Firestore → Rules*: lipește `firestore.rules` (înlocuiește `ADMIN_EMAIL`).

> Configurarea aplicației clasice (`/legacy/firebase-config.js`) este generată la build din aceleași variabile. Dacă schimbi o variabilă, fă **Redeploy**.

## Structură

```
src/
  app/
    (app)/layout.tsx          login + header negru cu logo + bara de jos
    (app)/page.tsx            hub Fabrică (carduri după rol)
    (app)/teste/burduf/       modulul pilot: page, Editor, Trend
    api/ask/route.ts          proxy Claude (stream text, imagini, verificare token Firebase)
    legacy/firebase-config.js configurare pentru aplicația clasică
  components/                 AuthProvider (Firebase Auth + users/{uid}), Shell
  lib/
    firebase.ts               SDK modular + cache offline (merge și fără semnal în hală)
    store.ts                  useCollection / put / remove (Firestore sau demo)
    codec.ts                  codare liste-în-liste (__na), compatibilă cu clasica
    roles.ts                  rolurile: admin, mgmt, prod, lab, mnt, dep, op
    burduf.ts                 calculele testului (identice cu clasica)
    pdf.ts                    PDF cu diacritice (DejaVu) și logo
public/legacy/                aplicația completă actuală
```

## Cum muți următorul modul (rețeta)

1. Creezi `src/lib/<modul>.ts` cu tipurile și calculele, copiate din blocul IIFE din `public/legacy/index.html` (`const LAPTE=(()=>{…`, `const TR=…`, `const PJ=…`).
2. Creezi `src/app/(app)/<modul>/page.tsx` și citești datele cu `useCollection("<colecție>")`, apoi scrii cu `put`/`remove`. Colecția rămâne aceeași.
3. În `src/app/(app)/page.tsx` schimbi `href` spre noua rută și pui `ready: true`.
4. Testezi că datele vechi se văd și că ce salvezi nou apare și în clasică.

**Ordinea propusă:**
- **Pontaj:** mic, util zilnic.
- **Piese & comenzi.**
- **Gestiune lapte:** reutilizează grafica 3D a rezervoarelor ca componentă SVG.
- **Trasabilitate:** scanare QR cu `BarcodeDetector`/ZXing, pagini separate pentru locații, produse și statistici.
- **Task-uri și mentenanță.**
- **Panou management:** Server Components și alerte.
- **Utilizatori:** include tabletele de stație cu PIN, care deocamdată folosesc clasica.

Când toate modulele sunt mutate, ștergi `public/legacy/` și redirect-ul `/clasic` din `next.config.ts`.

## Comenzi

- `npm run dev`: dezvoltare
- `npm run build`: build de producție (verifică TypeScript)
- `npm run lint`: ESLint
