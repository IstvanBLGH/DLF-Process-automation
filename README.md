# Ferma DT – totul într-un singur loc: Vercel + Supabase

Aplicația fabricii „De la Ferma cu Omenie” este un singur proiect Next.js, publicat pe **Vercel**. Toate datele stau într-o singură bază **Supabase** (Postgres).

- **Aplicația completă** (task-uri, mentenanță, lapte, trasabilitate, PROTEL, temperaturi, piese, pontaj, panou, utilizatori) rulează la `/clasic`.
- **Modulele noi în React** (Fabrică, Teste – burduf, Date și backup) rulează la `/`.
- Ambele folosesc aceeași bază, aceleași conturi și aceeași sesiune: te loghezi o dată.

---

## Mutarea datelor (o singură dată, fără pierderi)

### 1. Creezi proiectul Supabase
1. Pe [supabase.com](https://supabase.com) → *New project*. Alege regiunea **Frankfurt (eu-central-1)**.
2. Deschide *SQL Editor*, lipește tot fișierul `supabase/schema.sql` și apasă **Run**.
3. Tot în SQL Editor, scrie emailul tău de administrator și rulează:
   ```sql
   update app_config set value = 'emailul.tau@domeniu.ro' where key = 'admin_email';
   ```
4. Mergi la *Authentication → Providers → Email*:
   - dezactivează **Allow new users to sign up**. Conturile le creezi doar tu, din aplicație.
5. Mergi la *Authentication → Users → Add user* și creează contul tău, cu același email ca la pasul 3.
6. Mergi la *Authentication → URL Configuration* și pune la **Site URL** adresa de pe Vercel, de exemplu `https://ferma-dt.vercel.app`.

### 2. Importi datele

Fișierul `backup-DT-2026-11-23-complet.json` conține toate cele **89 de înregistrări** din aplicația actuală:

| Ce | Câte |
|---|---|
| Task-uri | 27 |
| Zile de temperaturi | 24 |
| Locații de trasabilitate | 12 |
| Camere | 9 |
| Echipamente | 4 |
| Produse | 3 |
| Fișe PROTEL | 3 |
| Reparații | 2 |
| Recipiente | 2 |
| Soluții | 1 |
| Test burduf | 1 |
| Pontaj | 1 |

**Varianta A, din aplicație** (cea mai simplă, după deploy):
1. Te loghezi ca administrator și apeși **Date** sus în bară.
2. Apeși **Alege fișierele**, selectezi backup-ul, apoi **Importă și verifică**.
3. La final trebuie să vezi: **„Verificare: 89 identice cu backup-ul. Nimic pierdut.”**

**Varianta B, din calculator:**
```bash
npm install
cp .env.example .env.local        # completează cheile Supabase
npm run import -- backup-DT-2026-11-23-complet.json
```
La final scriptul trebuie să afișeze **„✅ Toate datele din backup sunt în Supabase.”**

### 3. Ziua mutării: datele scrise între timp
Ce se scrie în aplicația veche după 23.11.2026 nu e în fișierul de mai sus. În ziua în care treceți pe noua adresă:
1. În aplicația veche apasă **⋯ → Backup**. Se descarcă un fișier nou.
2. Fă la fel pe **fiecare tabletă sau telefon** care a arătat „Salvare locală”, pentru că acelea țin datele doar în aparat.
3. În noua aplicație mergi la **Date → Alege fișierele** și le selectezi pe toate deodată.
4. Aplicația arată câte sunt **Noi**, **Identice** și **Diferite**.
   - Pentru datele din aplicația veche bifează **Înlocuiește și documentele diferite**, pentru că acolo sunt mai noi.
5. Apasă **Importă și verifică**.

Importul nu șterge niciodată nimic. Orice modificare sau ștergere din Supabase se păstrează în tabelul `docs_history`, cu varianta de dinainte, așa că se poate recupera.

---

## Deploy pe Vercel

1. Pune proiectul pe GitHub.
2. În Vercel: *Add New Project* → importă repo-ul. Next.js e detectat automat.
3. În *Settings → Environment Variables* adaugă:

| Variabilă | De unde | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | da |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | același loc, cheia `anon` | da (e protejată de reguli) |
| `SUPABASE_SERVICE_ROLE_KEY` | același loc, cheia `service_role` | **NU – doar server** |
| `ANTHROPIC_API_KEY` | console.anthropic.com | **NU – doar server** |

4. Apasă **Deploy**.
   - Dacă schimbi o variabilă mai târziu, apasă **Redeploy**.

Pe telefon, deschide adresa în Safari sau Chrome și alege **Adaugă pe ecranul principal**. Aplicația arată atunci ca una instalată.

---

## Cum funcționează

- **O singură tabelă, `docs`**, cu câmpurile `col`, `id` și `data` (JSON).
  - Fiecare înregistrare din aplicația veche intră exact cum era, așa că nu e nimic de convertit.
  - Un modul nou nu cere tabele noi.
- **Securitate la nivel de rând (RLS)** pe roluri, aplicată de baza de date, nu doar de interfață:

| Rol | Ce poate |
|---|---|
| Producție | scrie la producție, lapte, trasabilitate, teste |
| Laborator | scrie la lapte, PROTEL, temperaturi, teste |
| Mentenanță | scrie la echipamente, reparații, piese |
| Depozit & Achiziții | scrie la lapte, trasabilitate, piese |
| Top management | vede tot (inclusiv pontajul), nu modifică nimic |
| Stație | tabletă comună; operatorul intră cu PIN-ul lui |
| Admin | tot, inclusiv utilizatorii |

- **Timp real:** ce scrie cineva pe o tabletă apare imediat pe celelalte, prin Supabase Realtime.
- **Fără semnal în hală:**
  - aplicația pornește din datele memorate în aparat;
  - ce scrii se păstrează și se trimite singur când revine rețeaua;
  - în colț apare „Fără semnal · N de trimis”.
- **Istoric complet:** tabelul `docs_history` păstrează fiecare modificare.
- **Backup:** din **Date → Descarcă backup** iei oricând toate datele într-un fișier. E bine să faci asta lunar.

## Structură

```
supabase/schema.sql            tabelul docs, istoric, roluri, RLS, realtime – rulat o dată
scripts/import-backup.mjs      import + verificare document cu document
scripts/build-legacy.mjs       construiește aplicația completă (rulează automat la build/dev)
legacy/source.html             sursa aplicației complete (un fișier)
src/legacy/adapter.ts          legătura aplicației complete cu Supabase: login, roluri, PIN, offline
src/lib/docdb.ts               baza de date comună: cache, timp real, coadă offline
src/lib/supabase.ts            clientul din browser
src/lib/server.ts              clientul de server (service role) + verificarea tokenului
src/app/(app)/                 paginile React: Fabrică, Teste/burduf, Date și backup
src/app/api/ask                „Întreabă Claude” și citirea din poze
src/app/api/admin/users        crearea conturilor (doar admin)
src/app/reset                  parolă nouă (din emailul „Am uitat parola”)
```

## Mai departe: mutarea modulelor în React

Rețeta e aceeași pentru fiecare modul:
1. Muți logica într-un fișier `src/lib/<modul>.ts`.
2. Construiești pagina `src/app/(app)/<modul>/page.tsx` cu `useCollection("<colecție>")`, `put` și `remove`. Colecția rămâne aceeași.
3. În pagina Fabrică pui `ready: true` pe cardul modulului.

Ordinea propusă: Pontaj → Piese → Lapte → Trasabilitate → Task-uri → Panou → Utilizatori.

## Comenzi

- `npm run dev`: dezvoltare. Fără chei Supabase pornește în **mod demo**, cu date doar în browser.
- `npm run build`: build de producție.
- `npm run import -- fisier.json [--overwrite] [--dry]`: import cu verificare.
- `npm run lint`
