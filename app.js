// ============================================================
// Loenga Keramikk – Strømoversikt
// app.js  (ES-modul, krever Firebase v10 og jsPDF via CDN)
// ============================================================

import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, getDoc, setDoc, query, where, orderBy, limit, getDocs, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  firebaseConfig,
  adminEmails,
  betalingInfo
} from "./config.js";

// ---- Firebase init ----
let db   = null;
let auth = null;
let firebaseOk = false;

try {
  if (!firebaseConfig.projectId || firebaseConfig.projectId === "ditt-prosjekt-id") {
    throw new Error("Firebase er ikke konfigurert i config.js");
  }
  const fbApp = initializeApp(firebaseConfig);
  db   = getFirestore(fbApp);
  auth = getAuth(fbApp);
  firebaseOk = true;
} catch (e) {
  console.warn("Firebase ikke tilgjengelig:", e.message);
}

function firebaseKrever(id) {
  if (!firebaseOk) {
    const el = $(id);
    if (el) showFeedback(id, "error",
      "Firebase er ikke konfigurert. Fyll inn verdier i config.js og start serveren på nytt.", 0);
    return true;
  }
  return false;
}

// ---- Konstanter ----
// Komplett liste over alle som noen gang kan være med — brukes i admin-konfig
const ALLE_MULIGE = ["Maia", "Marte", "Martine", "Mingshu", "Olia", "Silja", "Victoria"];

// Standard-konfig brukes når ingen manedskonfig er satt
const BRENNERE_DEFAULT = ["Marte", "Mingshu", "Olia", "Silja"];
const ALLE_DEFAULT     = ["Maia", "Marte", "Martine", "Mingshu", "Olia", "Silja", "Victoria"];
const MAANEDER   = [
  "Januar","Februar","Mars","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Desember"
];

// ---- Hjelp ----
const $   = id => document.getElementById(id);
const now = new Date();

function kr(n) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })
    .format(Math.round(Number(n) || 0)) + " kr";
}

function showFeedback(id, type, msg, timeoutMs = 6000) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `feedback show ${type}`;
  if (timeoutMs > 0) setTimeout(() => { el.className = "feedback"; }, timeoutMs);
}

function populateMonthSelect(id, selected = now.getMonth() + 1) {
  const sel = $(id);
  sel.innerHTML = "";
  MAANEDER.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = i + 1;
    opt.textContent = m;
    if (i + 1 === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function oppdaterNavnDropdown() {
  const maaned = parseInt($("reg-maaned").value);
  const aar    = parseInt($("reg-aar").value);
  const konfig = await hentMånedskonfig(maaned, aar);
  const sel    = $("reg-navn");
  const valgt  = sel?.value;
  if (!sel) return;
  sel.innerHTML = '<option value="">Velg navn…</option>';
  konfig.brennere.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n; opt.textContent = n;
    if (n === valgt) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ============================================================
// TAB-navigasjon
// ============================================================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ============================================================
// FANE 1 – Registrer brenning
// ============================================================
function initRegister() {
  populateMonthSelect("reg-maaned");
  $("reg-aar").value = now.getFullYear();
  oppdaterNavnDropdown();
  visNyesteRegistreringer();

  // Oppdater navn-dropdown når måned eller år endres
  $("reg-maaned").addEventListener("change", oppdaterNavnDropdown);
  $("reg-aar").addEventListener("change", oppdaterNavnDropdown);

  $("reg-btn").addEventListener("click", async () => {
    const navn  = $("reg-navn").value.trim();
    const type  = document.querySelector('input[name="brenning"]:checked')?.value;
    const maaned = parseInt($("reg-maaned").value);
    const aar    = parseInt($("reg-aar").value);

    if (!navn)  return showFeedback("reg-feedback", "error", "Velg navn.");
    if (!type)  return showFeedback("reg-feedback", "error", "Velg type brenning.");
    if (!aar || aar < 2020 || aar > 2100)
      return showFeedback("reg-feedback", "error", "Ugyldig år.");

    if (firebaseKrever("reg-feedback")) return;

    const btn = $("reg-btn");
    btn.disabled = true;
    btn.innerHTML = 'Lagrer… <span class="spinner"></span>';

    try {
      await addDoc(collection(db, "brenninger"), {
        navn, type, maaned, aar,
        opprettet: Timestamp.now()
      });
      const typeNavn = type === "raa" ? "Råbrann" : "Glasurbrann";
      showFeedback("reg-feedback", "success",
        `✓ ${typeNavn} registrert for ${navn} – ${MAANEDER[maaned - 1]} ${aar}`);
      // Reset form
      $("reg-navn").value = "";
      document.querySelectorAll('input[name="brenning"]').forEach(r => r.checked = false);
      visNyesteRegistreringer();
    } catch (e) {
      console.error("Firestore-feil:", e);
      showFeedback("reg-feedback", "error", "Feil ved lagring. Sjekk tilkobling og Firebase-oppsett.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Legg til brenning";
    }
  });
}

async function visNyesteRegistreringer() {
  const wrap = $("reg-siste-liste");
  if (!wrap || !firebaseOk) return;

  try {
    const snap = await getDocs(
      query(collection(db, "brenninger"),
        orderBy("opprettet", "desc"),
        limit(10))
    );

    if (snap.size === 0) {
      wrap.innerHTML = `<p style="color:#6b7280;font-size:0.9rem;padding:10px">Ingen brenninger registrert ennå.</p>`;
      return;
    }

    const rader = [];
    snap.forEach(d => rader.push(d.data()));

    wrap.innerHTML = rader.map(b => `
      <div class="brenning-item">
        <strong>${b.navn}</strong>
        <span style="color:#6b7280">–</span>
        ${b.type === "raa" ? "Råbrann" : "Glasurbrann"}
        <span style="color:#6b7280;font-size:0.85rem;margin-left:auto">
          ${MAANEDER[b.maaned - 1]} ${b.aar}
        </span>
      </div>`).join("");
  } catch (e) {
    console.error("Kunne ikke hente siste registreringer:", e);
  }
}

// ============================================================
// FANE 2 – Oversikt
// ============================================================
function initOversikt() {
  populateMonthSelect("ov-maaned");
  $("ov-aar").value = now.getFullYear();

  $("ov-load-btn").addEventListener("click", loadOversikt);
  loadOversikt();
}

async function loadOversikt() {
  const maaned = parseInt($("ov-maaned").value);
  const aar    = parseInt($("ov-aar").value);
  const wrap   = $("ov-table-container");

  if (!firebaseOk) {
    wrap.innerHTML = `<div class="feedback show error">Firebase er ikke konfigurert. Fyll inn verdier i config.js.</div>`;
    return;
  }

  wrap.innerHTML = "<p style='color:#666'>Henter…</p>";

  // Hent månedskonfig uavhengig av brenninger-spørringen
  const konfig = await hentMånedskonfig(maaned, aar);

  try {
    const snap = await getDocs(
      query(collection(db, "brenninger"),
        where("maaned", "==", maaned),
        where("aar",    "==", aar))
    );

    const counts = {};
    konfig.brennere.forEach(n => counts[n] = { raa: 0, glasur: 0 });
    snap.forEach(d => {
      const b = d.data();
      if (counts[b.navn]) counts[b.navn][b.type]++;
    });

    let totRaa = 0, totGlasur = 0;
    const rows = konfig.brennere.map(navn => {
      const { raa, glasur } = counts[navn] || { raa: 0, glasur: 0 };
      totRaa    += raa;
      totGlasur += glasur;
      return `<tr>
        <td>${navn}</td>
        <td class="num">${raa}</td>
        <td class="num">${glasur}</td>
        <td class="num">${raa + glasur}</td>
      </tr>`;
    }).join("");

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Navn</th>
            <th class="num">Råbrann</th>
            <th class="num">Glasurbrann</th>
            <th class="num">Totalt</th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td>Totalt</td>
              <td class="num">${totRaa}</td>
              <td class="num">${totGlasur}</td>
              <td class="num">${totRaa + totGlasur}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${snap.size === 0
        ? `<p style="margin-top:12px;color:#666;font-size:0.9rem">
             Ingen brenninger registrert for ${MAANEDER[maaned-1]} ${aar}.</p>`
        : ""}`;
  } catch (e) {
    console.error("Oversikt-feil:", e);
    // Vis selve feilmeldingen så det er enklere å feilsøke
    wrap.innerHTML = `<div class="feedback show error">
      Feil: ${e.message || e.code || "Ukjent"}
      ${e.message?.includes("index") ? "<br>Opprett manglende Firestore-index via lenken i nettleserkonsollen (F12)." : ""}
    </div>`;
  }
}

// ============================================================
// FANE 3 – Admin
// ============================================================
let adminAuthenticated = false;
let lastCalc = null;

function initAdmin() {
  populateMonthSelect("adm-maaned");
  $("adm-aar").value = now.getFullYear();
  populateMonthSelect("konfig-maaned");
  $("konfig-aar").value = now.getFullYear();

  // Hent lagret faktura når måned/år endres
  const hentFakturaInput = () => hentOgFyllFaktura("adm-maaned", "adm-aar", "adm-faktura");
  $("adm-maaned").addEventListener("change", hentFakturaInput);
  $("adm-aar").addEventListener("change", hentFakturaInput);

  $("adm-calc-btn")?.addEventListener("click", adminBeregn);
  $("adm-aapne-epost-btn")?.addEventListener("click", aapneEpostklient);
  $("adm-pdf-btn")?.addEventListener("click", lastNedPDF);
  $("adm-bilde-btn")?.addEventListener("click", lastNedBilde);
  $("adm-kopier-btn")?.addEventListener("click", kopierDeleTekst);
  $("adm-last-brenninger-btn")?.addEventListener("click", adminLastBrenninger);
  $("adm-lagre-mottakere-btn")?.addEventListener("click", lagreMottakere);
  $("adm-last-konfig-btn")?.addEventListener("click", adminLastKonfig);
  $("adm-lagre-konfig-btn")?.addEventListener("click", adminLagreKonfig);
  $("adm-legg-til-person-btn")?.addEventListener("click", leggTilPerson);
  $("ny-person-input")?.addEventListener("keydown", e => { if (e.key === "Enter") leggTilPerson(); });

  // Google-innlogging
  $("admin-google-btn")?.addEventListener("click", adminGoogleLogin);
  $("admin-logout-btn")?.addEventListener("click", adminLogout);

  // Sjekk om brukeren allerede er innlogget (ved sideoppdatering)
  if (auth) {
    onAuthStateChanged(auth, bruker => {
      if (bruker && adminEmails.includes(bruker.email)) {
        visAdminPanel(bruker.email);
      } else if (bruker) {
        // Innlogget, men ikke admin-e-post
        signOut(auth);
        $("admin-login-error").textContent = `${bruker.email} har ikke admin-tilgang.`;
      }
    });
  }
}

async function adminGoogleLogin() {
  if (!firebaseOk) return;
  const btn = $("admin-google-btn");
  btn.disabled = true;
  btn.textContent = "Logger inn…";
  try {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const email  = result.user.email;
    if (adminEmails.includes(email)) {
      visAdminPanel(email);
    } else {
      await signOut(auth);
      $("admin-login-error").textContent = `${email} har ikke admin-tilgang.`;
    }
  } catch (e) {
    $("admin-login-error").textContent = "Innlogging avbrutt eller feilet.";
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="height:18px;vertical-align:middle;margin-right:8px">Logg inn med Google';
  }
}

async function adminLogout() {
  if (auth) await signOut(auth);
  adminAuthenticated = false;
  lastCalc = null;
  $("admin-panel").style.display  = "none";
  $("admin-login").style.display  = "block";
  $("admin-login-error").textContent = "";
  $("adm-result").innerHTML = "";
  $("adm-email-section").style.display = "none";
}

async function visAdminPanel(email) {
  adminAuthenticated = true;
  $("admin-login").style.display  = "none";
  $("admin-panel").style.display  = "block";
  $("admin-user-email").textContent = email;
  const mottakere = await hentMottakere();
  const el = $("mottakere-input");
  if (el) el.value = mottakere;
  visPersonliste();
  initFakturaoversikt();
}

// ================================================================
// E-POSTMOTTAKERE – lagres i Firestore, ikke i GitHub
// ================================================================
async function hentMottakere() {
  try {
    const snap = await getDoc(doc(db, "innstillinger", "mottakere"));
    if (snap.exists()) return snap.data().epost || "";
  } catch (e) {
    console.warn("Kunne ikke hente mottakere:", e);
  }
  return "";
}

async function lagreMottakere() {
  const epost = $("mottakere-input")?.value.trim() || "";
  try {
    await setDoc(doc(db, "innstillinger", "mottakere"), { epost });
    showFeedback("adm-mottakere-feedback", "success", "✓ E-postadresser lagret i Firebase");
  } catch (e) {
    showFeedback("adm-mottakere-feedback", "error", "Feil ved lagring");
    console.error(e);
  }
}

// ================================================================
// PERSONLISTE – alle mulige deltakere (lagres i Firestore)
// ================================================================
async function hentAllePersoner() {
  if (!firebaseOk) return [...ALLE_MULIGE];
  try {
    const snap = await getDoc(doc(db, "innstillinger", "personliste"));
    if (snap.exists() && snap.data().navn?.length) {
      return snap.data().navn.slice().sort();
    }
  } catch (e) {
    console.warn("Bruker standard personliste:", e.message);
  }
  return [...ALLE_MULIGE];
}

async function leggTilPerson() {
  const input = $("ny-person-input");
  const navn  = input?.value.trim();
  if (!navn) return;

  const liste = await hentAllePersoner();
  if (liste.map(n => n.toLowerCase()).includes(navn.toLowerCase())) {
    showFeedback("adm-person-feedback", "error", `«${navn}» er allerede i listen.`);
    return;
  }

  liste.push(navn);
  liste.sort();

  try {
    await setDoc(doc(db, "innstillinger", "personliste"), { navn: liste });
    input.value = "";
    showFeedback("adm-person-feedback", "success", `✓ ${navn} lagt til`);
    visPersonliste(liste);
  } catch (e) {
    showFeedback("adm-person-feedback", "error", "Feil ved lagring.");
    console.error(e);
  }
}

async function fjernPerson(navn) {
  if (!confirm(`Fjern «${navn}» fra listen?`)) return;
  let liste = await hentAllePersoner();
  liste = liste.filter(n => n !== navn);
  try {
    await setDoc(doc(db, "innstillinger", "personliste"), { navn: liste });
    showFeedback("adm-person-feedback", "success", `✓ ${navn} fjernet`);
    visPersonliste(liste);
  } catch (e) {
    showFeedback("adm-person-feedback", "error", "Feil ved lagring.");
    console.error(e);
  }
}

async function visPersonliste(liste) {
  const wrap = $("adm-person-liste");
  if (!wrap) return;
  if (!liste) liste = await hentAllePersoner();
  wrap.innerHTML = liste.map(navn => `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:7px 10px;border-bottom:1px solid var(--border);font-size:0.95rem">
      <span>${navn}</span>
      <button onclick="fjernPerson('${navn}')"
        style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1rem;
               padding:2px 6px;border-radius:4px" title="Fjern">✕</button>
    </div>`).join("");
}

async function hentOgFyllFaktura(maanedId, aarId, inputId) {
  const maaned = parseInt($(maanedId).value);
  const aar    = parseInt($(aarId).value);
  if (!maaned || !aar) return;
  try {
    const snap = await getDoc(doc(db, "fakturaer", månedKey(maaned, aar)));
    const input = $(inputId);
    if (input) input.value = snap.exists() ? snap.data().faktura : "";
  } catch (e) { /* stille feil – bruker bare tomt felt */ }
}

// ================================================================
// FAKTURAOVERSIKT – alle måneder med inntastingsfelt
// ================================================================
let fakturaFremover = 2; // antall måneder frem i tid som vises

async function initFakturaoversikt() {
  const wrap = $("faktura-oversikt-liste");
  if (!wrap) return;

  // Hent lagrede fakturaer
  const lagrede = {};
  try {
    const snap = await getDocs(collection(db, "fakturaer"));
    snap.forEach(d => { lagrede[månedKey(d.data().maaned, d.data().aar)] = d.data().faktura; });
  } catch (e) { console.warn(e); }

  // Generer måneder fra jan 2026 til N måneder frem i tid
  const mnd = [];
  const slutt = new Date(now.getFullYear(), now.getMonth() + fakturaFremover, 1);
  let   d    = new Date(2026, 0, 1);
  while (d <= slutt) {
    mnd.push({ maaned: d.getMonth() + 1, aar: d.getFullYear() });
    d.setMonth(d.getMonth() + 1);
  }
  mnd.reverse(); // nyeste øverst

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Måned</th>
          <th class="num" style="width:160px">Fakturabeløp (kr)</th>
          <th style="width:80px"></th>
        </tr></thead>
        <tbody>
          ${mnd.map(m => {
            const key = månedKey(m.maaned, m.aar);
            const val = lagrede[key] || "";
            return `<tr id="frow-${key}">
              <td>${MAANEDER[m.maaned-1]} ${m.aar}</td>
              <td>
                <input type="number" id="finput-${key}" value="${val}"
                  placeholder="—" min="0" step="0.01"
                  style="width:100%;padding:6px 8px;border:1.5px solid var(--border);
                         border-radius:6px;font-size:0.9rem;text-align:right;
                         ${val ? "background:#f0fdf4;border-color:#a7d7a9" : ""}">
              </td>
              <td style="text-align:right">
                <button onclick="lagreFakturaRad('${key}',${m.maaned},${m.aar})"
                  style="background:var(--primary);color:white;border:none;
                         padding:5px 12px;border-radius:6px;cursor:pointer;
                         font-size:0.85rem;font-weight:600">
                  Lagre
                </button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div id="fakt-feedback" class="feedback" style="margin-top:8px"></div>
    <button onclick="leggTilNesteMaaned()"
      style="margin-top:10px;background:none;border:1.5px dashed var(--border);
             color:var(--text-muted);padding:8px 16px;border-radius:8px;
             cursor:pointer;font-size:0.9rem;width:100%">
      + Legg til neste måned
    </button>`;
}

async function lagreFakturaRad(key, maaned, aar) {
  const faktura = parseFloat($(`finput-${key}`)?.value) || 0;
  if (!faktura || faktura <= 0) {
    showFeedback("fakt-feedback", "error", "Angi et gyldig beløp.");
    return;
  }
  const konfig = await hentMånedskonfig(maaned, aar);
  try {
    await setDoc(doc(db, "fakturaer", key), {
      maaned, aar, faktura,
      alle:       konfig.alle,
      brennere:   konfig.brennere,
      lagretDato: Timestamp.now()
    });
    // Grønn bakgrunn på feltet
    const input = $(`finput-${key}`);
    if (input) {
      input.style.background = "#f0fdf4";
      input.style.borderColor = "#a7d7a9";
    }
    showFeedback("fakt-feedback", "success",
      `✓ ${MAANEDER[maaned-1]} ${aar}: ${kr(faktura)} lagret`);
    // Nullstill statistikk-cache
    const si = $("stat-innhold");
    if (si) delete si.dataset.lastet;
  } catch (e) {
    showFeedback("fakt-feedback", "error", "Feil ved lagring.");
    console.error(e);
  }
}
window.lagreFakturaRad = lagreFakturaRad;

function leggTilNesteMaaned() {
  fakturaFremover++;
  initFakturaoversikt();
}
window.leggTilNesteMaaned = leggTilNesteMaaned;

// ================================================================
// MÅNEDSKONFIGURASJON – hvem er med denne måneden?
// ================================================================
function månedKey(maaned, aar) {
  return `${aar}-${String(maaned).padStart(2, "0")}`;
}

async function hentMånedskonfig(maaned, aar) {
  if (!firebaseOk) return { alle: [...ALLE_DEFAULT], brennere: [...BRENNERE_DEFAULT] };
  try {
    const snap = await getDoc(doc(db, "manedskonfig", månedKey(maaned, aar)));
    if (snap.exists()) return snap.data();
  } catch (e) {
    console.warn("Ingen manedskonfig, bruker standard:", e.message);
  }
  return { alle: [...ALLE_DEFAULT], brennere: [...BRENNERE_DEFAULT] };
}

async function adminLastKonfig() {
  const maaned = parseInt($("konfig-maaned").value);
  const aar    = parseInt($("konfig-aar").value);

  const [konfig, alle] = await Promise.all([
    hentMånedskonfig(maaned, aar),
    hentAllePersoner()
  ]);

  const tbody = $("konfig-tbody");
  tbody.innerHTML = alle.map(navn => {
    const erMed     = konfig.alle.includes(navn);
    const brukerOvn = konfig.brennere.includes(navn);
    return `<tr>
      <td style="font-weight:600">${navn}</td>
      <td style="text-align:center">
        <input type="checkbox" class="cb-alle" data-navn="${navn}"
          ${erMed ? "checked" : ""}
          style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer">
      </td>
      <td style="text-align:center">
        <input type="checkbox" class="cb-brennere" data-navn="${navn}"
          ${brukerOvn ? "checked" : ""}
          style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer">
      </td>
    </tr>`;
  }).join("");

  // Haker av «Er med» automatisk når «Bruker ovn» krysses av
  tbody.querySelectorAll(".cb-brennere").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        tbody.querySelector(`.cb-alle[data-navn="${cb.dataset.navn}"]`).checked = true;
      }
    });
  });
  // Fjerner «Bruker ovn» automatisk når «Er med» fjernes
  tbody.querySelectorAll(".cb-alle").forEach(cb => {
    cb.addEventListener("change", () => {
      if (!cb.checked) {
        tbody.querySelector(`.cb-brennere[data-navn="${cb.dataset.navn}"]`).checked = false;
      }
    });
  });

  $("adm-konfig-panel").style.display = "block";
  $("adm-lagre-konfig-btn").textContent = `Lagre for ${MAANEDER[maaned - 1]} ${aar}`;
}

async function adminLagreKonfig() {
  const maaned   = parseInt($("konfig-maaned").value);
  const aar      = parseInt($("konfig-aar").value);
  const alle     = [...document.querySelectorAll(".cb-alle:checked")].map(cb => cb.dataset.navn);
  const brennere = [...document.querySelectorAll(".cb-brennere:checked")].map(cb => cb.dataset.navn);

  if (!alle.length) {
    return showFeedback("adm-konfig-feedback", "error", "Velg minst én deltaker.");
  }

  try {
    await setDoc(doc(db, "manedskonfig", månedKey(maaned, aar)),
      { alle, brennere, oppdatert: Timestamp.now() });
    showFeedback("adm-konfig-feedback", "success",
      `✓ ${MAANEDER[maaned-1]} ${aar}: ${alle.length} deltakere, ${brennere.length} ovnsbrukere`);
    oppdaterNavnDropdown();
  } catch (e) {
    showFeedback("adm-konfig-feedback", "error", "Feil ved lagring.");
    console.error(e);
  }
}

// ================================================================
// FELLES E-POST – åpner i e-postklient via mailto:
// ================================================================
function genererEpostInnhold() {
  if (!lastCalc) return { emne: "", tekst: "" };
  const { persons, likAndel, maanedNavn, aar, faktura, baseRaa, baseGlasur } = lastCalc;

  const kol = (s, n, høyre = false) => {
    const str = String(s);
    return høyre ? str.padStart(n) : str.padEnd(n);
  };

  const emne = `Strøm Loenga – ${maanedNavn} ${aar}`;

  const tekst = [
    `Hei alle,`,
    ``,
    `Her er strømfordelingen for ${maanedNavn} ${aar}.`,
    ``,
    `Fakturabeløp totalt: ${kr(faktura)}`,
    ``,
    `${kol("Person", 14)} ${kol("Råbrann", 8)} ${kol("Glasurbrann", 12)} ${kol("Totalt", 10)}`,
    `${"─".repeat(46)}`,
    ...persons.map(p => {
      const totalt = p.kost + likAndel;
      return `${kol(p.navn, 14)} ${kol(p.raa, 8, true)} ${kol(p.glasur, 12, true)} ${kol(kr(totalt), 10, true)}`;
    }),
    `${"─".repeat(46)}`,
    ``,
    `Grunnlag:`,
    `  Råbrann: 5,5 % av faktura = ${kr(baseRaa)} per brenning`,
    `  Glasurbrann: 6,5 % av faktura = ${kr(baseGlasur)} per brenning`,
    `  Restbeløp delt likt: ${kr(likAndel)} per person`,
    ``,
    `Betal til: ${betalingInfo.navn}`,
    `Kontonummer: ${betalingInfo.konto}`,
    `Vipps: ${betalingInfo.vipps}`,
    ``,
    `Hilsen Loenga Samvirke`
  ].join("\n");

  return { emne, tekst };
}

async function visEpostForhandsvis() {
  // Auto-fyll "Til"-feltet med lagrede adresser
  const tilFelt = $("epost-til");
  if (tilFelt && !tilFelt.value) {
    tilFelt.value = await hentMottakere();
  }
}

async function aapneEpostklient() {
  if (!lastCalc) return;

  // 1. Last ned PDF automatisk
  lastNedPDF();

  // 2. Åpne e-postklient med enkel brødtekst
  const { maanedNavn, aar } = lastCalc;
  const emne = `Strøm Loenga – ${maanedNavn} ${aar}`;
  const tekst = [
    `Hei,`,
    ``,
    `Her kommer fordelingen av strømutgiftene for ${maanedNavn} ${aar}. Se vedlegg.`,
    ``,
    `Vennlig hilsen`,
    `Loenga Samvirke`
  ].join("\n");

  let til = $("epost-til")?.value.trim();
  if (!til) til = await hentMottakere();

  // Kort pause så nettleseren rekker å starte nedlastingen
  await new Promise(r => setTimeout(r, 400));

  const mailto = `mailto:${encodeURIComponent(til)}?subject=${encodeURIComponent(emne)}&body=${encodeURIComponent(tekst)}`;
  window.location.href = mailto;

  showFeedback("adm-del-feedback", "info",
    "📎 PDF er lastet ned – legg den ved i e-postklienten som åpner seg nå.", 10000);
}

// ================================================================
// PDF-GENERERING
// ================================================================
function lastNedPDF() {
  if (!lastCalc) return;
  const { persons, likAndel, maanedNavn, aar, faktura, baseRaa, baseGlasur, totalBrenning, rest } = lastCalc;
  const { jsPDF } = window.jspdf;
  const pdf  = new jsPDF({ unit: 'mm', format: 'a4' });
  const mx   = 20;   // venstre margin
  const pw   = 170;  // innholdsbredde
  let   y    = 0;

  // ---- Grønn header ----
  pdf.setFillColor(44, 95, 46);
  pdf.rect(0, 0, 210, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(`Strøm Loenga – ${maanedNavn} ${aar}`, mx, 16);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Fordeling av strømkostnader', mx, 23);

  y = 38;

  // ---- Sammendrag ----
  pdf.setTextColor(40, 40, 40);
  const samm = [
    ['Fakturabeløp totalt:',                        kr(faktura)],
    ['Råbrann per brenning (5,5 %):',          kr(baseRaa)],
    ['Glasurbrann per brenning (6,5 %):',           kr(baseGlasur)],
    ['Sum brenningskostnader:',                           kr(totalBrenning)],
    [`Restbeløp delt likt (${persons.length} pers.):`,
     `${kr(rest)} → ${kr(likAndel)} per person`],
  ];
  samm.forEach(([label, val]) => {
    pdf.setFont('helvetica', 'bold');   pdf.setFontSize(9);
    pdf.text(label, mx, y);
    pdf.setFont('helvetica', 'normal'); pdf.text(val, mx + 85, y);
    y += 6;
  });

  y += 6;

  // ---- Tabell ----
  const cx   = [mx, mx + 62, mx + 94, mx + 130]; // x-start per kolonne
  const rowH = 8;

  // Kolonneoverskrifter
  pdf.setFillColor(44, 95, 46);
  pdf.rect(mx, y, pw, rowH, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
  ['Person', 'Råbrann', 'Glasurbrann', 'Totalt'].forEach((h, i) =>
    pdf.text(h, cx[i] + 2, y + 5.5));
  y += rowH;

  // Datarader
  persons.forEach((p, i) => {
    if (i % 2 === 0) {
      pdf.setFillColor(248, 249, 250);
      pdf.rect(mx, y, pw, rowH, 'F');
    }
    pdf.setTextColor(30, 30, 30);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text(p.navn,          cx[0] + 2, y + 5.5);
    pdf.text(String(p.raa),   cx[1] + 2, y + 5.5);
    pdf.text(String(p.glasur),cx[2] + 2, y + 5.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(44, 95, 46);
    pdf.text(kr(p.kost + likAndel), cx[3] + 2, y + 5.5);
    y += rowH;
  });

  // Tabellkant
  pdf.setDrawColor(200, 200, 200);
  pdf.rect(mx, y - (persons.length + 1) * rowH, pw, (persons.length + 1) * rowH, 'S');

  y += 10;

  // ---- Betalingsinformasjon ----
  pdf.setFillColor(232, 245, 233);
  pdf.setDrawColor(167, 215, 169);
  pdf.rect(mx, y, pw, 24, 'FD');
  const bx = mx + 3;
  pdf.setTextColor(30, 30, 30); pdf.setFontSize(9);
  [
    ['Betal til:',     betalingInfo.navn],
    ['Kontonummer:',   betalingInfo.konto],
    ['Vipps:',         betalingInfo.vipps],
  ].forEach(([label, val], i) => {
    pdf.setFont('helvetica', 'bold');   pdf.text(label, bx, y + 7 + i * 7);
    pdf.setFont('helvetica', 'normal'); pdf.text(val,   bx + 30, y + 7 + i * 7);
  });

  pdf.save(`strom_loenga_${maanedNavn}_${aar}.pdf`.toLowerCase().replace(/\s+/g, '_'));
}

// ================================================================
// ADMINISTRER BRENNINGER – vis og slett
// ================================================================
async function adminLastBrenninger() {
  if (!adminAuthenticated) return;
  const maaned = parseInt($("adm-maaned").value);
  const aar    = parseInt($("adm-aar").value);
  const wrap   = $("adm-brenninger-liste");
  wrap.innerHTML = "<p style='color:#6b7280'>Henter…</p>";

  try {
    const snap = await getDocs(
      query(collection(db, "brenninger"),
        where("maaned", "==", maaned),
        where("aar",    "==", aar))
    );

    if (snap.size === 0) {
      wrap.innerHTML = `<p style="color:#6b7280;font-size:0.9rem">
        Ingen brenninger for ${MAANEDER[maaned-1]} ${aar}.</p>`;
      return;
    }

    const liste = [];
    snap.forEach(d => liste.push({ id: d.id, ...d.data() }));
    liste.sort((a, b) => a.navn.localeCompare(b.navn));

    wrap.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Navn</th><th>Type</th><th></th></tr></thead>
      <tbody>
        ${liste.map(b => `
          <tr id="brow-${b.id}">
            <td>${b.navn}</td>
            <td>${b.type === "raa" ? "Råbrann" : "Glasurbrann"}</td>
            <td style="text-align:right">
              <button class="btn-slett-brenning" data-id="${b.id}"
                style="background:none;border:1.5px solid #dc2626;color:#dc2626;
                       padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem">
                Slett
              </button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;

    wrap.querySelectorAll(".btn-slett-brenning").forEach(btn => {
      btn.addEventListener("click", () => slettBrenning(btn.dataset.id, maaned, aar));
    });
  } catch (e) {
    wrap.innerHTML = `<div class="feedback show error">Feil ved henting.</div>`;
    console.error(e);
  }
}

async function slettBrenning(id, maaned, aar) {
  if (!confirm("Slett denne brenningen?")) return;
  try {
    await deleteDoc(doc(db, "brenninger", id));
    $(`brow-${id}`)?.remove();
    // Oppdater beregningen hvis den er gjort
    if (lastCalc && lastCalc.maaned === maaned && lastCalc.aar === aar) {
      lastCalc = null;
      $("adm-result").innerHTML =
        `<div class="feedback show info">Brenning slettet. Kjør beregningen på nytt.</div>`;
      $("adm-email-section").style.display = "none";
    }
  } catch (e) {
    alert("Kunne ikke slette. Sjekk at du er logget inn som admin.");
    console.error(e);
  }
}

async function adminBeregn() {
  if (!adminAuthenticated) return;
  if (firebaseKrever("adm-calc-feedback")) return;

  const maaned     = parseInt($("adm-maaned").value);
  const aar        = parseInt($("adm-aar").value);
  const faktura    = parseFloat($("adm-faktura").value) || 0;
  const maanedNavn = MAANEDER[maaned - 1];

  if (!faktura || faktura <= 0) {
    return showFeedback("adm-calc-feedback", "error", "Angi et gyldig fakturabeløp.");
  }

  const btn = $("adm-calc-btn");
  btn.disabled = true;
  btn.innerHTML = 'Beregner… <span class="spinner"></span>';

  try {
    const snap = await getDocs(
      query(collection(db, "brenninger"),
        where("maaned", "==", maaned),
        where("aar",    "==", aar))
    );

    // Hent hvem som er med denne måneden
    const konfig = await hentMånedskonfig(maaned, aar);

    const counts = {};
    konfig.brennere.forEach(n => counts[n] = { raa: 0, glasur: 0 });
    snap.forEach(doc => {
      const d = doc.data();
      if (counts[d.navn]) counts[d.navn][d.type]++;
    });

    // ---- Beregningslogikk ----
    const baseRaa    = faktura * 0.055;
    const baseGlasur = faktura * 0.065;

    let totalBrenning = 0;
    const persons = konfig.alle.map(navn => {
      const { raa, glasur } = counts[navn] || { raa: 0, glasur: 0 };
      const kost = raa * baseRaa + glasur * baseGlasur;
      totalBrenning += kost;
      return { navn, raa, glasur, kost };
    });

    const rest      = faktura - totalBrenning;
    const likAndel  = rest / konfig.alle.length;

    lastCalc = { persons, faktura, maaned, aar, maanedNavn, baseRaa, baseGlasur, totalBrenning, rest, likAndel };

    // Lagre faktura i Firestore så statistikk kan bruke den
    setDoc(doc(db, "fakturaer", månedKey(maaned, aar)), {
      maaned, aar, faktura,
      alle:     konfig.alle,
      brennere: konfig.brennere,
      lagretDato: Timestamp.now()
    }).then(() => initFakturaoversikt())
      .catch(e => console.warn("Kunne ikke lagre faktura:", e));

    // ---- Vis sammendrag ----
    const adm = $("adm-result");
    adm.innerHTML = `
      <div class="summary-box">
        <strong>Fakturabeløp:</strong> ${kr(faktura)}<br>
        <strong>Råbrann per brann:</strong> ${kr(baseRaa)} (5,5 %)<br>
        <strong>Glasurbrann per brann:</strong> ${kr(baseGlasur)} (6,5 %)<br>
        <strong>Sum brenningskostnader:</strong> ${kr(totalBrenning)}<br>
        <strong>Resterende delt likt (${konfig.alle.length} personer):</strong>
        ${kr(rest)} → <strong>${kr(likAndel)}</strong> per person
      </div>
      ${persons.map(p => {
        const totalt = p.kost + likAndel;
        return `<div class="card">
          <div class="card-name">${p.navn}</div>
          <div class="card-details">
            Råbrann: ${p.raa} × ${kr(baseRaa)} = ${kr(p.raa * baseRaa)}<br>
            Glasurbrann: ${p.glasur} × ${kr(baseGlasur)} = ${kr(p.glasur * baseGlasur)}<br>
            Brenningskostnad: ${kr(p.kost)} · Lik andel: ${kr(likAndel)}
          </div>
          <div class="card-total">${kr(totalt)}</div>
        </div>`;
      }).join("")}`;

    $("adm-email-section").style.display = "block";
    await visEpostForhandsvis();

  } catch (e) {
    console.error("Beregningsfeil:", e);
    showFeedback("adm-calc-feedback", "error", "Feil ved henting av brenningsdata.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Beregn fordeling";
  }
}


// ================================================================
// DEL PÅ MESSENGER
// ================================================================
function lastNedBilde() {
  if (!lastCalc) return;
  const { persons, likAndel, maanedNavn, aar, faktura } = lastCalc;

  const W = 560, PAD = 28;
  const HEADER_H = 76;
  const ROW_H = 48;
  const FOOTER_H = 72;
  const H = HEADER_H + 32 + ROW_H * persons.length + FOOTER_H;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#2c5f2e';
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial';
  ctx.fillText(`Strøm Loenga – ${maanedNavn} ${aar}`, PAD, 34);
  ctx.font = '13px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('Fordeling av strømkostnader', PAD, 56);
  // Fakturabeløp høyre side av headeren
  const faktStr = `Faktura: ${kr(faktura)}`;
  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(faktStr, W - PAD - ctx.measureText(faktStr).width, 56);

  let y = HEADER_H + 22;
  ctx.font = '12px Arial';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText('NAVN', PAD, y);
  ctx.fillText('RÅBRANN', 260, y);
  ctx.fillText('GLASURBRANN', 330, y);
  const totLabel = 'TOTALT';
  ctx.fillText(totLabel, W - PAD - ctx.measureText(totLabel).width, y);

  y += 8;
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(PAD, y, W - PAD * 2, 1);
  y += ROW_H * 0.35;

  persons.forEach((p, i) => {
    if (i % 2 === 0) {
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(0, y - 2, W, ROW_H - 2);
    }
    const totalt = p.kost + likAndel;
    const totStr = kr(totalt);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(p.navn, PAD, y + 20);

    ctx.font = '15px Arial';
    ctx.fillStyle = '#374151';
    ctx.fillText(String(p.raa),    275, y + 20);
    ctx.fillText(String(p.glasur), 355, y + 20);

    ctx.fillStyle = '#2c5f2e';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(totStr, W - PAD - ctx.measureText(totStr).width, y + 20);

    y += ROW_H;
  });

  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, y + 8, W, FOOTER_H + 4);
  ctx.fillStyle = '#6b7280';
  ctx.font = '13px Arial';
  ctx.fillText(`Betal til: ${betalingInfo.navn}`, PAD, y + 30);
  ctx.fillText(`Kontonummer: ${betalingInfo.konto}   ·   Vipps: ${betalingInfo.vipps}`, PAD, y + 50);

  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `strom_loenga_${maanedNavn}_${aar}.png`.toLowerCase().replace(/\s+/g, '_');
  a.click();
  showFeedback('adm-del-feedback', 'success', '✓ Bilde lastet ned – del det i Messenger-gruppa!');
}

function kopierDeleTekst() {
  if (!lastCalc) return;
  const { persons, likAndel, maanedNavn, aar } = lastCalc;

  const linjer = [
    `⚡ Strøm Loenga – ${maanedNavn} ${aar}`,
    ``,
    ...persons.map(p => `${p.navn}: ${kr(p.kost + likAndel)}`),
    ``,
    `Betal til: ${betalingInfo.navn}`,
    `Konto: ${betalingInfo.konto}`,
    `Vipps: ${betalingInfo.vipps}`
  ];

  navigator.clipboard.writeText(linjer.join('\n')).then(() => {
    showFeedback('adm-del-feedback', 'success', '✓ Tekst kopiert – lim inn i Messenger-gruppa!');
  });
}


// Gjør fjernPerson tilgjengelig globalt (kalles fra onclick i HTML)
window.fjernPerson = fjernPerson;

// ============================================================
// FANE 3 – Statistikk
// ============================================================
function initStatistikk() {
  $("stat-oppdater-btn")?.addEventListener("click", lastStatistikk);

  // Last automatisk når fanen åpnes første gang
  document.querySelector('[data-tab="statistikk"]')?.addEventListener("click", () => {
    if (!$("stat-innhold").dataset.lastet) lastStatistikk();
  });
}

async function lastStatistikk() {
  if (!firebaseOk) {
    $("stat-innhold").innerHTML = `<div class="feedback show error">Firebase ikke tilgjengelig.</div>`;
    return;
  }
  const btn = $("stat-oppdater-btn");
  if (btn) { btn.disabled = true; btn.innerHTML = 'Henter… <span class="spinner"></span>'; }

  try {
    const [brennSnap, faktSnap] = await Promise.all([
      getDocs(collection(db, "brenninger")),
      getDocs(collection(db, "fakturaer"))
    ]);
    if (brennSnap.size === 0) {
      $("stat-innhold").innerHTML = `<p style="color:#6b7280">Ingen brenninger registrert ennå.</p>`;
      return;
    }
    const brenninger = [];
    brennSnap.forEach(d => brenninger.push(d.data()));
    const fakturaer = {};
    faktSnap.forEach(d => { fakturaer[månedKey(d.data().maaned, d.data().aar)] = d.data(); });

    renderStatistikk(brenninger, fakturaer);
    $("stat-innhold").dataset.lastet = "1";
  } catch (e) {
    console.error("Statistikk-feil:", e);
    $("stat-innhold").innerHTML = `<div class="feedback show error">Feil: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Oppdater"; }
  }
}

function beregnMaanedKost(fakt, brenninger) {
  const { faktura, alle, brennere } = fakt;
  const baseRaa    = faktura * 0.055;
  const baseGlasur = faktura * 0.065;
  const counts = {};
  (brennere || []).forEach(n => counts[n] = { raa: 0, glasur: 0 });
  brenninger.forEach(b => { if (counts[b.navn]) counts[b.navn][b.type]++; });
  let totalBrenning = 0;
  const persons = (alle || []).map(navn => {
    const { raa = 0, glasur = 0 } = counts[navn] || {};
    const kost = raa * baseRaa + glasur * baseGlasur;
    totalBrenning += kost;
    return { navn, kost };
  });
  const likAndel = (faktura - totalBrenning) / (alle?.length || 1);
  const result = {};
  persons.forEach(p => { result[p.navn] = p.kost + likAndel; });
  return { result, faktura };
}

function renderStatistikk(data, fakturaer = {}) {
  const totalRaa    = data.filter(b => b.type === "raa").length;
  const totalGlasur = data.filter(b => b.type === "glasur").length;
  const total       = data.length;

  // ---- Per person ----
  const pp = {};
  data.forEach(b => {
    if (!pp[b.navn]) pp[b.navn] = { raa: 0, glasur: 0 };
    pp[b.navn][b.type]++;
  });
  const persons = Object.entries(pp)
    .map(([navn, t]) => ({ navn, raa: t.raa, glasur: t.glasur, total: t.raa + t.glasur }))
    .sort((a, b) => b.total - a.total);
  const maxP = persons[0]?.total || 1;

  // ---- Per måned ----
  const pm = {};
  data.forEach(b => {
    const key = `${b.aar}-${String(b.maaned).padStart(2, "0")}`;
    if (!pm[key]) pm[key] = { maaned: b.maaned, aar: b.aar, raa: 0, glasur: 0, personer: new Set() };
    pm[key][b.type]++;
    pm[key].personer.add(b.navn);
  });
  const months = Object.entries(pm)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, m]) => ({ ...m, total: m.raa + m.glasur, aktive: m.personer.size }));
  const maxM = Math.max(...months.map(m => m.total), 1);

  // ---- Kostnader per person (fra lagrede fakturaer) ----
  const kumKost = {}; // { navn: totalKr }
  const maanedKost = []; // [{ label, personKost: { navn: kr }, faktura }]
  let harFakturaer = false;

  months.slice().reverse().forEach(m => {
    const key  = månedKey(m.maaned, m.aar);
    const fakt = fakturaer[key];
    if (!fakt) return;
    harFakturaer = true;
    const mData = data.filter(b => b.maaned === m.maaned && b.aar === m.aar);
    const { result, faktura } = beregnMaanedKost(fakt, mData);
    Object.entries(result).forEach(([navn, bel]) => {
      kumKost[navn] = (kumKost[navn] || 0) + bel;
    });
    maanedKost.push({ label: `${MAANEDER[m.maaned-1]} ${m.aar}`, result, faktura });
  });

  const alleNavn = [...new Set([
    ...Object.keys(kumKost),
    ...maanedKost.flatMap(m => Object.keys(m.result))
  ])].sort();
  const maxKum = Math.max(...Object.values(kumKost), 1);

  // ---- Bygg HTML ----
  const wrap = $("stat-innhold");
  wrap.innerHTML = `

    <!-- Sammendrag -->
    <div class="summary-box" style="margin-bottom:24px">
      <strong>Totalt:</strong> ${total} brenninger
      &nbsp;·&nbsp; Råbrann: ${totalRaa}
      &nbsp;·&nbsp; Glasurbrann: ${totalGlasur}
      &nbsp;·&nbsp; ${months.length} måneder med aktivitet
    </div>

    <!-- Per person -->
    <h3 style="margin-bottom:10px">Per person – alle tider</h3>
    <div class="table-wrap" style="margin-bottom:28px">
      <table>
        <thead><tr>
          <th>Navn</th>
          <th class="num">Råbrann</th>
          <th class="num">Glasurbrann</th>
          <th class="num">Totalt</th>
          <th style="min-width:80px">Andel</th>
        </tr></thead>
        <tbody>
          ${persons.map(p => `
            <tr>
              <td><strong>${p.navn}</strong></td>
              <td class="num">${p.raa}</td>
              <td class="num">${p.glasur}</td>
              <td class="num">${p.total}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
                    <div style="height:100%;width:${Math.round(p.total / maxP * 100)}%;
                                background:var(--primary);border-radius:4px"></div>
                  </div>
                  <span style="font-size:0.8rem;color:#6b7280;width:28px;text-align:right">
                    ${Math.round(p.total / total * 100)} %
                  </span>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <!-- Månedlig diagram -->
    <h3 style="margin-bottom:12px">Aktivitet per måned</h3>
    <div style="overflow-x:auto;margin-bottom:28px">
      <div style="display:flex;align-items:flex-end;gap:6px;min-height:100px;padding-bottom:28px;position:relative;min-width:${months.length * 42}px">
        ${months.slice().reverse().map(m => {
          const rPct  = Math.round(m.raa    / maxM * 88);
          const gPct  = Math.round(m.glasur / maxM * 88);
          const label = MAANEDER[m.maaned - 1].substring(0, 3) + " " + String(m.aar).slice(2);
          return `<div style="flex:1;min-width:34px;display:flex;flex-direction:column;align-items:center;gap:2px">
            <span style="font-size:0.72rem;color:#374151;font-weight:600">${m.total || ""}</span>
            <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:1px">
              <div style="height:${gPct}px;background:#6aaa6d;border-radius:3px 3px 0 0;min-height:${m.glasur?2:0}px"
                   title="Glasurbrann: ${m.glasur}"></div>
              <div style="height:${rPct}px;background:var(--primary);border-radius:${m.glasur?0:3}px 0 0 0;min-height:${m.raa?2:0}px"
                   title="Råbrann: ${m.raa}"></div>
            </div>
            <span style="font-size:0.68rem;color:#6b7280;writing-mode:vertical-rl;
                         transform:rotate(180deg);height:38px;text-align:center">${label}</span>
          </div>`;
        }).join("")}
      </div>
      <div style="display:flex;gap:14px;font-size:0.82rem;color:#6b7280;margin-top:4px">
        <span><span style="display:inline-block;width:10px;height:10px;background:var(--primary);border-radius:2px;margin-right:4px"></span>Råbrann</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#6aaa6d;border-radius:2px;margin-right:4px"></span>Glasurbrann</span>
      </div>
    </div>

    <!-- Per måned tabell -->
    <h3 style="margin-bottom:10px">Detaljer per måned</h3>
    <div class="table-wrap" style="margin-bottom:28px">
      <table>
        <thead><tr>
          <th>Måned</th>
          <th class="num">Råbrann</th>
          <th class="num">Glasurbrann</th>
          <th class="num">Totalt</th>
          <th class="num">Aktive</th>
        </tr></thead>
        <tbody>
          ${months.map(m => `
            <tr>
              <td>${MAANEDER[m.maaned - 1]} ${m.aar}</td>
              <td class="num">${m.raa}</td>
              <td class="num">${m.glasur}</td>
              <td class="num"><strong>${m.total}</strong></td>
              <td class="num">${m.aktive}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    ${harFakturaer ? `
    <!-- Akkumulert kostnad per person -->
    <h3 style="margin-bottom:10px">Akkumulert kostnad per person</h3>
    <p style="font-size:0.85rem;color:#6b7280;margin-bottom:12px">
      Basert på ${maanedKost.length} måned${maanedKost.length !== 1 ? "er" : ""} med registrert faktura.
    </p>
    <div class="table-wrap" style="margin-bottom:28px">
      <table>
        <thead><tr>
          <th>Navn</th>
          <th class="num">Totalt betalt</th>
          <th style="min-width:100px">Andel</th>
        </tr></thead>
        <tbody>
          ${alleNavn.map(navn => {
            const bel = kumKost[navn] || 0;
            return `<tr>
              <td><strong>${navn}</strong></td>
              <td class="num">${kr(bel)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
                    <div style="height:100%;width:${Math.round(bel/maxKum*100)}%;
                                background:var(--primary);border-radius:4px"></div>
                  </div>
                  <span style="font-size:0.8rem;color:#6b7280;width:44px;text-align:right">
                    ${kr(bel)}
                  </span>
                </div>
              </td>
            </tr>`;
          }).join("")}
          <tr class="total-row">
            <td>Totalt</td>
            <td class="num">${kr(Object.values(kumKost).reduce((a,b)=>a+b,0))}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Kostnad per person per måned -->
    <h3 style="margin-bottom:10px">Kostnad per person per måned</h3>
    <div class="table-wrap" style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Måned</th>
          <th class="num">Faktura</th>
          ${alleNavn.map(n => `<th class="num">${n}</th>`).join("")}
        </tr></thead>
        <tbody>
          ${maanedKost.map(m => `
            <tr>
              <td>${m.label}</td>
              <td class="num" style="color:#6b7280">${kr(m.faktura)}</td>
              ${alleNavn.map(navn => `
                <td class="num">${m.result[navn] != null ? kr(m.result[navn]) : "—"}</td>
              `).join("")}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : `
    <div class="summary-box" style="color:#6b7280">
      💡 Kostnader vises når admin har beregnet og lagret minst én faktura via Admin-fanen.
    </div>`}
  `;
}

// ============================================================
// Init
// ============================================================
initRegister();
initOversikt();
initStatistikk();
initAdmin();
