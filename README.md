# MedPrep — versiune pregătită pentru Cloudflare

Interfața aplicației rămâne integral în limba română. Această versiune folosește:
- **Cloudflare Workers** pentru API și aplicație;
- **Cloudflare D1** pentru datele utilizatorilor, întrebări și progres;
- **Cloudflare R2** pentru fișierele încărcate;
- **OpenAI API** pentru generarea răspunsurilor.

## Ce este necesar
1. Un cont Cloudflare.
2. Un domeniu adăugat în Cloudflare (sau un subdomeniu pe care îl vei conecta după publicare).
3. Node.js 20+ instalat pe calculator.
4. O cheie API OpenAI pentru funcțiile AI (opțională la prima publicare, necesară pentru răspunsuri AI).

**Nu trimite nimănui parola Cloudflare sau cheia API.** Cheia se adaugă ca secret în Cloudflare.

## Publicare — pași

Deschide terminalul în acest folder și execută:

### 1. Instalează instrumentele
```bash
npm install
npx wrangler login
```
Se va deschide pagina Cloudflare pentru autorizare.

### 2. Creează baza de date D1
```bash
npx wrangler d1 create medprep-db
```
Comanda va afișa `database_id`. Copiază acel ID în `wrangler.toml`, în locul textului `REPLACE_WITH_D1_DATABASE_ID`.

### 3. Creează spațiul de fișiere R2
```bash
npx wrangler r2 bucket create medprep-files
```

### 4. Creează tabelele bazei de date
```bash
npx wrangler d1 migrations apply medprep-db --remote
```

### 5. Configurează cheia AI
Dacă ai o cheie OpenAI:
```bash
npx wrangler secret put OPENAI_API_KEY
```
Lipește cheia în terminalul securizat când ți se cere. Opțional, poți configura modelul:
```bash
npx wrangler secret put OPENAI_MODEL
```
Introdu `gpt-4o-mini` ca valoare. Nu pune cheia în fișierele publice sau în `public/app.js`.

### 6. Publică aplicația
```bash
npm run deploy
```
Cloudflare va afișa adresa temporară `*.workers.dev`.

## Conectarea domeniului tău
În Cloudflare Dashboard:
1. Intră la **Workers & Pages** și deschide aplicația `medprep`.
2. Deschide **Settings → Domains & Routes**.
3. Alege **Add → Custom Domain**.
4. Introdu domeniul sau subdomeniul dorit, de exemplu `medprep.exemplu.com`.
5. Urmează instrucțiunile Cloudflare pentru DNS și certificat HTTPS.

Dacă domeniul nu este încă în Cloudflare, adaugă-l mai întâi în **Websites → Add a site** și finalizează schimbarea nameserverelor la registrar.

## Important — ce suportă această versiune
- Fișierele de până la 25 MB sunt stocate privat în R2 și legate de contul personal.
- Extragerea automată de text și detectarea întrebărilor este activată pentru fișiere TXT.
- PDF, DOCX, PPT/PPTX și imagini pot fi încărcate și păstrate în biblioteca personală, dar această versiune Cloudflare nu rulează încă OCR sau conversia lor automată. Pentru extragere, adaugă textul întrebărilor manual în modul Învățare sau convertește documentul în TXT înainte de încărcare.
- Fiecare spațiu personal este separat printr-un token secret și verificarea proprietarului în API. Linkul personal funcționează ca o parolă: păstrează-l privat.
- Aceasta este o aplicație educațională, nu un dispozitiv medical și nu înlocuiește bibliografia, profesorii sau recomandările profesionale.

## Fișiere importante
- `src/index.js` — Worker/API.
- `public/` — interfața web.
- `schema.sql` și `migrations/` — structura D1.
- `wrangler.toml` — legăturile către D1, R2 și fișierele statice.
