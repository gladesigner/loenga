// ============================================================
// KONFIGURASJON – Fyll inn dine verdier her
// ============================================================

// 1. Firebase-konfigurasjon
//    Finn disse i Firebase Console → Prosjektinnstillinger → Dine apper
export const firebaseConfig = {
  apiKey:            "DIN_API_NØKKEL",
  authDomain:        "ditt-prosjekt.firebaseapp.com",
  projectId:         "ditt-prosjekt-id",
  storageBucket:     "ditt-prosjekt.firebasestorage.app",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abcdef123456"
};

// 2. EmailJS-konfigurasjon
//    Opprett gratis konto på https://www.emailjs.com
//    Lag en Gmail-tjeneste og en e-postmal (se README for malinnhold)
export const emailjsConfig = {
  publicKey:  "DIN_PUBLIC_KEY",       // Account → API Keys
  serviceId:  "service_xxxxxxx",      // Email Services → Service ID
  templateId: "template_xxxxxxx"      // Email Templates → Template ID
};

// 3. Admin-passord
//    Dette brukes for å låse opp beregning og e-postutsending
export const ADMIN_PASSORD = "loenga2024";

// 4. E-postadresser til keramikerne
export const keramikereEmails = {
  "Maia":     "maia@example.com",
  "Marte":    "marte@example.com",
  "Martine":  "martine@example.com",
  "Mingshu":  "mingshu@example.com",
  "Olga":     "olga@example.com",
  "Silja":    "silja@example.com",
  "Victoria": "victoria@example.com"
};

// 5. Betalingsinformasjon (vises i e-post og i appen)
export const betalingInfo = {
  navn:  "Marte Sørensen",
  konto: "9802.62.01039",
  vipps: "91715753"
};
