// ============================================================
// KONFIGURASJON – Fyll inn dine verdier her
// ============================================================

// 1. Firebase-konfigurasjon
//    Finn disse i Firebase Console → Prosjektinnstillinger → Dine apper
// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyChIsUHiywTJQhZSeM5-TCWyfd7qltwpFg",
  authDomain: "loenga.firebaseapp.com",
  projectId: "loenga",
  storageBucket: "loenga.firebasestorage.app",
  messagingSenderId: "227441599547",
  appId: "1:227441599547:web:e79d5ffe5b4ac02b45681e"
};

// 2. EmailJS-konfigurasjon
//    Opprett gratis konto på https://www.emailjs.com
//    Lag en Gmail-tjeneste og en e-postmal (se README for malinnhold)
export const emailjsConfig = {
  publicKey:  "DIN_PUBLIC_KEY",       // Account → API Keys
  serviceId:  "service_xxxxxxx",      // Email Services → Service ID
  templateId: "template_xxxxxxx"      // Email Templates → Template ID
};

// 3. Admin-e-poster (Google-kontoer med admin-tilgang)
//    Legg til e-postadressen(e) til de som skal ha admin-tilgang
export const adminEmails = [
  "gladesigner@gmail.com"   // ← bytt til ekte Google-e-post
];

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
