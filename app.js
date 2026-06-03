// ============================================================
// Loenga Keramikk – Strømoversikt
// app.js  (ES-modul, krever Firebase v10 + EmailJS via CDN)
// ============================================================

import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, getDoc, setDoc, query, where, getDocs, Timestamp }
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
const KERAMIKERE = ["Maia", "Marte", "Martine", "Mingshu", "Olga", "Silja", "Victoria"];
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

function populateNameSelect(id) {
  const sel = $(id);
  sel.innerHTML = '<option value="">Velg navn...</option>';
  KERAMIKERE.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
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
  populateNameSelect("reg-navn");
  populateMonthSelect("reg-maaned");
  $("reg-aar").value = now.getFullYear();

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
    } catch (e) {
      console.error("Firestore-feil:", e);
      showFeedback("reg-feedback", "error", "Feil ved lagring. Sjekk tilkobling og Firebase-oppsett.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Legg til brenning";
    }
  });
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

  wrap.innerHTML = "<p style='color:#666'>Henter data…</p>";

  try {
    const snap = await getDocs(
      query(collection(db, "brenninger"),
        where("maaned", "==", maaned),
        where("aar",    "==", aar))
    );

    // Telle opp per person
    const counts = {};
    KERAMIKERE.forEach(n => counts[n] = { raa: 0, glasur: 0 });
    snap.forEach(doc => {
      const d = doc.data();
      if (counts[d.navn]) counts[d.navn][d.type]++;
    });

    let totRaa = 0, totGlasur = 0;
    let rows = KERAMIKERE.map(navn => {
      const { raa, glasur } = counts[navn];
      totRaa    += raa;
      totGlasur += glasur;
      return `<tr>
        <td>${navn}</td>
        <td class="num">${raa}</td>
        <td class="num">${glasur}</td>
        <td class="num">${raa + glasur}</td>
      </tr>`;
    }).join("");

    rows += `<tr class="total-row">
      <td>Totalt</td>
      <td class="num">${totRaa}</td>
      <td class="num">${totGlasur}</td>
      <td class="num">${totRaa + totGlasur}</td>
    </tr>`;

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Navn</th>
            <th class="num">Råbrann</th>
            <th class="num">Glasurbrann</th>
            <th class="num">Totalt</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${snap.size === 0
        ? `<p style="margin-top:12px;color:#666;font-size:0.9rem">
             Ingen brenninger registrert for ${MAANEDER[maaned-1]} ${aar}.</p>`
        : ""}`;
  } catch (e) {
    console.error("Oversikt-feil:", e);
    wrap.innerHTML = `<div class="feedback show error">Klarte ikke hente data. Sjekk Firebase-oppsett.</div>`;
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

  $("adm-calc-btn")?.addEventListener("click", adminBeregn);
  $("adm-aapne-epost-btn")?.addEventListener("click", aapneEpostklient);
  $("adm-last-brenninger-btn")?.addEventListener("click", adminLastBrenninger);

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

function visAdminPanel(email) {
  adminAuthenticated = true;
  $("admin-login").style.display  = "none";
  $("admin-panel").style.display  = "block";
  $("admin-user-email").textContent = email;
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

function visEpostForhandsvis() {
  const prev = $("epost-preview");
  if (!prev) return;
  const { tekst } = genererEpostInnhold();
  prev.textContent = tekst;
}

function aapneEpostklient() {
  const { emne, tekst } = genererEpostInnhold();
  const til = $("epost-til")?.value.trim() || "";
  const mailto = `mailto:${encodeURIComponent(til)}?subject=${encodeURIComponent(emne)}&body=${encodeURIComponent(tekst)}`;
  window.location.href = mailto;
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

    const counts = {};
    KERAMIKERE.forEach(n => counts[n] = { raa: 0, glasur: 0 });
    snap.forEach(doc => {
      const d = doc.data();
      if (counts[d.navn]) counts[d.navn][d.type]++;
    });

    // ---- Beregningslogikk (identisk med original HTML) ----
    const baseRaa    = faktura * 0.055; // kr per råbrann
    const baseGlasur = faktura * 0.065; // kr per glasurbrann

    let totalBrenning = 0;
    const persons = KERAMIKERE.map(navn => {
      const { raa, glasur } = counts[navn];
      const kost = raa * baseRaa + glasur * baseGlasur;
      totalBrenning += kost;
      return { navn, raa, glasur, kost };
    });

    const rest      = faktura - totalBrenning;
    const likAndel  = rest / KERAMIKERE.length;

    // Lagre for e-postutsending
    lastCalc = { persons, faktura, maaned, aar, maanedNavn, baseRaa, baseGlasur, totalBrenning, rest, likAndel };

    // ---- Vis sammendrag ----
    const adm = $("adm-result");
    adm.innerHTML = `
      <div class="summary-box">
        <strong>Fakturabeløp:</strong> ${kr(faktura)}<br>
        <strong>Råbrann per brann:</strong> ${kr(baseRaa)} (5,5 %)<br>
        <strong>Glasurbrann per brann:</strong> ${kr(baseGlasur)} (6,5 %)<br>
        <strong>Sum brenningskostnader:</strong> ${kr(totalBrenning)}<br>
        <strong>Resterende delt likt (${KERAMIKERE.length} personer):</strong>
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
    visEpostForhandsvis();

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
  const { persons, likAndel, maanedNavn, aar } = lastCalc;

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


// ============================================================
// Init
// ============================================================
initRegister();
initOversikt();
initAdmin();

$("adm-bilde-btn")?.addEventListener("click", lastNedBilde);
$("adm-kopier-btn")?.addEventListener("click", kopierDeleTekst);
