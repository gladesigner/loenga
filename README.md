# Loenga Keramikk – Strømoversikt

Nettapp for å registrere ovnsbruk og fordele strømkostnader mellom keramikerne på Loenga.

**Funksjoner:**
- Keramikere registrerer egne brenninger (råbrann / glasurbrann)
- Oversikt over hvem som har brent hvilken måned
- Admin legger inn strømfaktura → appen beregner hva hver person skal betale
- Betalingskrav sendes ut på e-post, eller genereres som kopierbar tekst

---

## Oppsett – steg for steg

### 1. GitHub Pages

1. Opprett et GitHub-repo (f.eks. `loenga-strom`)
2. Last opp alle filene: `index.html`, `style.css`, `app.js`, `config.js`
3. Gå til **Settings → Pages → Source: Deploy from a branch → main / root**
4. Appen er tilgjengelig på `https://dittbrukernavn.github.io/loenga-strom/`

> **Obs:** `config.js` inneholder Firebase-nøkler som er trygge å ha i et offentlig repo –
> sikkerhet ivaretas av Firestore-regler (se punkt 3). EmailJS-nøkler er også designet
> for klient-side bruk og er trygge å eksponere.

---

### 2. Firebase Firestore (database)

#### 2a. Opprett prosjekt
1. Gå til [console.firebase.google.com](https://console.firebase.google.com)
2. Klikk **Legg til prosjekt** → gi det et navn (f.eks. `loenga-strom`)
3. Deaktiver Google Analytics om ønskelig → **Opprett prosjekt**

#### 2b. Aktiver Firestore
1. Velg **Firestore Database** i menyen
2. Klikk **Opprett database**
3. Velg **Produksjonsmodus** → velg en region nær deg (f.eks. `europe-west3`)

#### 2c. Hent konfigurasjonsnøkler
1. Klikk tannhjulikonet → **Prosjektinnstillinger**
2. Scroll ned til **Dine apper** → klikk **Web** (`</>`)
3. Gi appen et navn → kopier `firebaseConfig`-objektet
4. Lim inn verdiene i `config.js`

#### 2d. Sett Firestore-sikkerhetsregler
1. I Firestore: **Regler**-fanen
2. Erstatt med følgende og publiser:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /brenninger/{doc} {
      allow read, write: if true;
    }
  }
}
```

> Dette lar alle lese og skrive brenninger (åpent for alle med lenken).
> Det er tilsvarende en delt notisbok – passer for et lite samvirke.

---

### 3. EmailJS (e-postutsending fra nettleser)

#### 3a. Opprett konto
1. Gå til [emailjs.com](https://www.emailjs.com) → **Sign Up** (gratis: 200 e-poster/mnd)

#### 3b. Koble til Gmail
1. **Email Services → Add New Service → Gmail**
2. Koble til Gmail-kontoen som skal sende e-postene
3. Kopier **Service ID** (ser ut som `service_abc123`)

#### 3c. Lag e-postmal
1. **Email Templates → Create New Template**
2. Sett felter slik:

| Felt | Verdi |
|------|-------|
| To Email | `{{to_email}}` |
| Subject | `Strøm Loenga – {{maaned_aar}}` |
| Body | Se malen nedenfor |

**E-postmal (body):**
```
Hei {{to_name}},

Her er din strøm-andel for {{maaned_aar}}.

Brenninger:
  Råbrann:     {{raa_antall}} stk
  Glasurbrann: {{glasur_antall}} stk

Kostnad brenning:  {{brenning_kost}}
Lik andel:         {{lik_andel}}
─────────────────────────────────────
Totalt å betale:   {{totalt_belop}}

Betal til: {{betaling_navn}}
Kontonummer: {{betaling_konto}}
Vipps: {{betaling_vipps}}

Hilsen Loenga Samvirke
```

3. Kopier **Template ID** (ser ut som `template_xyz456`)

#### 3d. Hent Public Key
1. **Account → API Keys** → kopier Public Key

#### 3e. Fyll inn i config.js
```js
export const emailjsConfig = {
  publicKey:  "din-public-key",
  serviceId:  "service_abc123",
  templateId: "template_xyz456"
};
```

---

### 4. Fyll inn config.js

Åpne `config.js` og fyll inn:
- Firebase-konfigurasjonen (fra punkt 2c)
- EmailJS-verdiene (fra punkt 3)
- Admin-passord (bytt fra standard!)
- E-postadresser til alle keramikerne

---

### 5. Test

1. Åpne appen i nettleseren (lokalt: åpne `index.html` via en lokal server, f.eks. VS Code Live Server)
2. Registrer en prøvebrenning
3. Gå til Oversikt og sjekk at den dukker opp
4. Gå til Admin → logg inn → legg inn et testbeløp → beregn

> For e-posttest: bruk en reell e-postadresse i `config.js` og klikk «Send alle»

---

## Beregningslogikk

| Type | Andel av faktura per brenning |
|------|-------------------------------|
| Råbrann | 5,5 % |
| Glasurbrann | 6,5 % |

Fremgangsmåte:
1. Beregn kostnad per brenning = type-prosent × fakturabeløp
2. Summer all brenningskostnad
3. Trekk fra faktura → rest deles likt på alle 7
4. Hvert medlem betaler: sin brenningskostnad + lik andel

---

## Filstruktur

```
├── index.html    Hoved-HTML med tre faner
├── style.css     Styling
├── app.js        App-logikk (Firebase + EmailJS)
├── config.js     Konfigurasjon – fyll inn dine verdier
└── README.md     Denne filen
```

---

## Støtte og endringer

- **Legge til/fjerne keramikere:** Endre `KERAMIKERE`-arrayen i `app.js` og oppdater `keramikereEmails` i `config.js`
- **Endre prosentsatser:** Endre `0.055` / `0.065` i `app.js` (i `adminBeregn`-funksjonen)
- **Endre betalingsinformasjon:** Oppdater `betalingInfo` i `config.js`
