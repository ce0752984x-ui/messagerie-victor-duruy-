import {
  auth, db, protegerPage,
  collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  signOut, formaterDate, echapperHTML, initiales
} from "./firebase-config.js";

let UTILISATEUR_COURANT = null;
let PROFIL_COURANT = null;
let TOUS_LES_COMPTES = [];     // pour l'assistant destinataire
let DOSSIER_ACTUEL = "reception";
let MESSAGES_DOSSIER_ACTUEL = [];
let MESSAGE_SELECTIONNE_ID = null;
let DESINSCRIRE_ECOUTE = null; // fonction pour arrêter l'écoute temps réel précédente

// ============================================================
// Initialisation
// ============================================================
protegerPage().then(async ({ user, profil }) => {
  UTILISATEUR_COURANT = user;
  PROFIL_COURANT = profil;

  if (profil.role === "admin") {
    document.getElementById("lien-vers-admin").classList.remove("masquee");
  }

  await chargerAnnuaire();
  ouvrirDossier("reception");
});

async function chargerAnnuaire() {
  const snap = await getDocs(collection(db, "utilisateurs"));
  TOUS_LES_COMPTES = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.id !== UTILISATEUR_COURANT.uid && c.statut !== "désactivé");
}

document.getElementById("bouton-deconnexion").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ============================================================
// Navigation entre dossiers (réception / envoyés / brouillons)
// ============================================================
const TITRES_DOSSIERS = {
  reception: "Boîte de réception",
  envoyes: "Envoyés",
  brouillons: "Brouillons",
};

document.querySelectorAll(".nav-item[data-dossier]").forEach((bouton) => {
  bouton.addEventListener("click", () => ouvrirDossier(bouton.dataset.dossier));
});

function ouvrirDossier(nom) {
  DOSSIER_ACTUEL = nom;
  document.getElementById("titre-dossier").textContent = TITRES_DOSSIERS[nom];
  document.querySelectorAll(".nav-item[data-dossier]").forEach((b) => b.classList.remove("actif"));
  document.querySelector(`.nav-item[data-dossier="${nom}"]`).classList.add("actif");
  reinitialiserLecture();
  ecouterDossier(nom);
}

function reinitialiserLecture() {
  MESSAGE_SELECTIONNE_ID = null;
  document.getElementById("zone-lecture").innerHTML = `
    <div class="etat-vide" style="height:100%;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>
      <h3>Sélectionne un message</h3>
      <p>Choisis un message dans la liste pour l'afficher ici.</p>
    </div>`;
}

// ============================================================
// Écoute en temps réel du dossier courant
// ============================================================
function ecouterDossier(nom) {
  if (DESINSCRIRE_ECOUTE) DESINSCRIRE_ECOUTE();

  let q;
  if (nom === "reception") {
    q = query(
      collection(db, "messages"),
      where("destinataireUid", "==", UTILISATEUR_COURANT.uid),
      where("statut", "==", "envoyé"),
      orderBy("creeLe", "desc")
    );
  } else if (nom === "envoyes") {
    q = query(
      collection(db, "messages"),
      where("expediteurUid", "==", UTILISATEUR_COURANT.uid),
      where("statut", "==", "envoyé"),
      orderBy("creeLe", "desc")
    );
  } else {
    q = query(
      collection(db, "messages"),
      where("expediteurUid", "==", UTILISATEUR_COURANT.uid),
      where("statut", "==", "brouillon"),
      orderBy("creeLe", "desc")
    );
  }

  DESINSCRIRE_ECOUTE = onSnapshot(q, (snap) => {
    MESSAGES_DOSSIER_ACTUEL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    afficherListeMessages();
    mettreAJourCompteurNonLus();
  }, (erreur) => {
    console.error("Erreur d'écoute Firestore :", erreur);
    document.getElementById("conteneur-liste-messages").innerHTML = `
      <div class="etat-vide">
        <h3>Impossible de charger les messages</h3>
        <p>Vérifie ta connexion ou réessaie dans un instant.</p>
      </div>`;
  });
}

// Compteur de non lus dans la barre latérale (toujours basé sur la réception)
function mettreAJourCompteurNonLus() {
  if (DOSSIER_ACTUEL !== "reception") return;
  const nonLus = MESSAGES_DOSSIER_ACTUEL.filter((m) => !m.lu).length;
  const elCompteur = document.getElementById("compteur-non-lus");
  if (nonLus > 0) {
    elCompteur.textContent = nonLus;
    elCompteur.hidden = false;
  } else {
    elCompteur.hidden = true;
  }
}

// ============================================================
// Affichage de la liste + recherche
// ============================================================
const elRechercheMail = document.getElementById("recherche-mail");
elRechercheMail.addEventListener("input", afficherListeMessages);

function afficherListeMessages() {
  const texte = elRechercheMail.value.trim().toLowerCase();
  const conteneur = document.getElementById("conteneur-liste-messages");

  let resultats = MESSAGES_DOSSIER_ACTUEL.filter((m) =>
    !texte ||
    m.objet?.toLowerCase().includes(texte) ||
    m.expediteurNom?.toLowerCase().includes(texte) ||
    m.destinataireNom?.toLowerCase().includes(texte) ||
    m.contenu?.toLowerCase().includes(texte)
  );

  if (resultats.length === 0) {
    conteneur.innerHTML = `
      <div class="etat-vide">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>
        <h3>${libelleVideDossier()}</h3>
        <p>${DOSSIER_ACTUEL === "reception" ? "Les messages que tu reçois apparaîtront ici." : DOSSIER_ACTUEL === "envoyes" ? "Les messages que tu envoies apparaîtront ici." : "Enregistre un message sans l'envoyer pour le retrouver ici."}</p>
      </div>`;
    return;
  }

  conteneur.innerHTML = resultats.map((m) => {
    const correspondantNom = DOSSIER_ACTUEL === "reception" ? m.expediteurNom : (m.destinataireNom || "(destinataire supprimé)");
    const nonLu = DOSSIER_ACTUEL === "reception" && !m.lu;
    return `
      <div class="item-message ${nonLu ? "non-lu" : ""} ${m.id === MESSAGE_SELECTIONNE_ID ? "selectionne" : ""}" data-id="${m.id}">
        <div class="ligne-haut-item">
          <strong>${nonLu ? '<span class="point-non-lu"></span>' : ""}${echapperHTML(correspondantNom)}</strong>
          <span class="date-item">${formaterDate(m.creeLe)}</span>
        </div>
        <div class="objet-item">${echapperHTML(m.objet || "(Sans objet)")}</div>
        <div class="apercu-item">${echapperHTML((m.contenu || "").slice(0, 80))}</div>
      </div>`;
  }).join("");
}

function libelleVideDossier() {
  return { reception: "Boîte de réception vide", envoyes: "Aucun message envoyé", brouillons: "Aucun brouillon" }[DOSSIER_ACTUEL];
}

document.getElementById("conteneur-liste-messages").addEventListener("click", (e) => {
  const item = e.target.closest(".item-message");
  if (!item) return;
  const message = MESSAGES_DOSSIER_ACTUEL.find((m) => m.id === item.dataset.id);
  if (!message) return;

  MESSAGE_SELECTIONNE_ID = message.id;
  afficherListeMessages(); // pour mettre à jour la sélection visuelle

  if (DOSSIER_ACTUEL === "brouillons") {
    ouvrirComposition(message);
  } else {
    afficherLectureMessage(message);
    if (DOSSIER_ACTUEL === "reception" && !message.lu) {
      updateDoc(doc(db, "messages", message.id), { lu: true });
    }
  }
});

// ============================================================
// Affichage de la lecture d'un message (réception / envoyés)
// ============================================================
function afficherLectureMessage(message) {
  const estReception = DOSSIER_ACTUEL === "reception";
  const nomAffiche = estReception ? message.expediteurNom : message.destinataireNom;
  const emailAffiche = estReception ? message.expediteurEmail : message.destinataireEmail;

  document.getElementById("zone-lecture").innerHTML = `
    <div class="entete-lecture">
      <h2>${echapperHTML(message.objet || "(Sans objet)")}</h2>
      <div class="meta-lecture">
        <div class="avatar-lecture">${initiales(nomAffiche)}</div>
        <div class="meta-lecture-texte">
          <div><span class="nom-expediteur">${echapperHTML(nomAffiche || "Compte supprimé")}</span></div>
          <div class="info-secondaire">${estReception ? "à toi" : "à " + echapperHTML(nomAffiche || "")} · ${echapperHTML(emailAffiche || "")} · ${formaterDate(message.creeLe)}</div>
        </div>
      </div>
    </div>
    <div class="corps-lecture">${echapperHTML(message.contenu || "")}</div>
    <div class="actions-lecture">
      ${estReception ? `<button class="btn btn-principal" id="bouton-repondre">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        Répondre
      </button>` : ""}
    </div>
  `;

  if (estReception) {
    document.getElementById("bouton-repondre").addEventListener("click", () => {
      ouvrirComposition(null, {
        destinataireUid: message.expediteurUid,
        destinataireNom: message.expediteurNom,
        destinataireEmail: message.expediteurEmail,
        objet: message.objet?.startsWith("Re : ") ? message.objet : "Re : " + (message.objet || ""),
      });
    });
  }
}

// ============================================================
// COMPOSITION : nouveau message / réponse / édition de brouillon
// ============================================================
const elFondComposition = document.getElementById("fond-composition");
const elFormulaireComposition = document.getElementById("formulaire-composition");
const elTitreComposition = document.getElementById("titre-composition");
const elBrouillonIdEdition = document.getElementById("brouillon-id-edition");
const elDestinataireSaisie = document.getElementById("champ-destinataire-saisie");
const elDestinataireUid = document.getElementById("destinataire-uid");
const elSuggestions = document.getElementById("suggestions-destinataire");
const elDestinataireChoisi = document.getElementById("destinataire-choisi");
const elObjet = document.getElementById("champ-objet");
const elContenu = document.getElementById("champ-contenu");
const elMessageErreurComposition = document.getElementById("message-erreur-composition");

let DESTINATAIRE_SELECTIONNE = null;

document.getElementById("bouton-nouveau-message").addEventListener("click", () => ouvrirComposition(null));
document.getElementById("fermer-composition").addEventListener("click", fermerComposition);

function ouvrirComposition(brouillon = null, prefill = null) {
  elFormulaireComposition.reset();
  masquerErreurComposition();
  DESTINATAIRE_SELECTIONNE = null;
  elDestinataireUid.value = "";
  elDestinataireSaisie.value = "";
  elDestinataireSaisie.disabled = false;
  elDestinataireChoisi.hidden = true;
  elSuggestions.hidden = true;

  if (brouillon) {
    elTitreComposition.textContent = "Modifier le brouillon";
    elBrouillonIdEdition.value = brouillon.id;
    elObjet.value = brouillon.objet || "";
    elContenu.value = brouillon.contenu || "";
    if (brouillon.destinataireUid) {
      selectionnerDestinataire({
        id: brouillon.destinataireUid,
        nom: brouillon.destinataireNom,
        email: brouillon.destinataireEmail,
        role: brouillon.destinataireRole,
        classeOuFonction: brouillon.destinataireClasseOuFonction,
      });
    }
  } else {
    elTitreComposition.textContent = "Nouveau message";
    elBrouillonIdEdition.value = "";
    if (prefill) {
      elObjet.value = prefill.objet || "";
      selectionnerDestinataire({
        id: prefill.destinataireUid,
        nom: prefill.destinataireNom,
        email: prefill.destinataireEmail,
      });
    }
  }

  elFondComposition.classList.remove("masquee");
  setTimeout(() => (prefill ? elContenu : elDestinataireSaisie).focus(), 50);
}

function fermerComposition() {
  elFondComposition.classList.add("masquee");
}

// ---------- Assistant destinataire (auto-complétion) ----------
elDestinataireSaisie.addEventListener("input", () => {
  const texte = elDestinataireSaisie.value.trim().toLowerCase();
  if (!texte) {
    elSuggestions.hidden = true;
    return;
  }
  const resultats = TOUS_LES_COMPTES.filter((c) =>
    c.nom?.toLowerCase().includes(texte) ||
    c.email?.toLowerCase().includes(texte) ||
    c.classeOuFonction?.toLowerCase().includes(texte)
  ).slice(0, 8);

  if (resultats.length === 0) {
    elSuggestions.innerHTML = `<div class="suggestions-vide">Aucun compte ne correspond.</div>`;
  } else {
    elSuggestions.innerHTML = resultats.map((c) => `
      <div class="suggestion-item" data-id="${c.id}">
        <div class="avatar-table">${initiales(c.nom)}</div>
        <div class="suggestion-item-texte">
          <strong>${echapperHTML(c.nom)}</strong>
          <span>${echapperHTML(c.classeOuFonction || libelleRoleMail(c.role))} · ${echapperHTML(c.email)}</span>
        </div>
      </div>`).join("");
  }
  elSuggestions.hidden = false;
});

elSuggestions.addEventListener("click", (e) => {
  const item = e.target.closest(".suggestion-item");
  if (!item) return;
  const compte = TOUS_LES_COMPTES.find((c) => c.id === item.dataset.id);
  if (compte) selectionnerDestinataire(compte);
});

function selectionnerDestinataire(compte) {
  DESTINATAIRE_SELECTIONNE = compte;
  elDestinataireUid.value = compte.id;
  elDestinataireSaisie.value = "";
  elDestinataireSaisie.disabled = true;
  elSuggestions.hidden = true;
  elDestinataireChoisi.hidden = false;
  elDestinataireChoisi.innerHTML = `
    <div class="avatar-table">${initiales(compte.nom)}</div>
    <span>${echapperHTML(compte.nom)}</span>
    <button type="button" id="retirer-destinataire" aria-label="Retirer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  document.getElementById("retirer-destinataire").addEventListener("click", () => {
    DESTINATAIRE_SELECTIONNE = null;
    elDestinataireUid.value = "";
    elDestinataireChoisi.hidden = true;
    elDestinataireSaisie.disabled = false;
    elDestinataireSaisie.value = "";
    elDestinataireSaisie.focus();
  });
}

function libelleRoleMail(role) {
  return { admin: "Administration", professeur: "Professeur / Personnel", eleve: "Élève" }[role] || role;
}

// Ferme les suggestions si on clique ailleurs
document.addEventListener("click", (e) => {
  if (!e.target.closest(".champ-destinataire")) elSuggestions.hidden = true;
});

// ---------- Enregistrer brouillon ----------
document.getElementById("bouton-enregistrer-brouillon").addEventListener("click", async () => {
  await sauvegarderMessage("brouillon");
});

// ---------- Envoyer ----------
elFormulaireComposition.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!DESTINATAIRE_SELECTIONNE) {
    afficherErreurComposition("Choisis un destinataire dans la liste suggérée.");
    return;
  }
  if (!elContenu.value.trim()) {
    afficherErreurComposition("Le message ne peut pas être vide.");
    return;
  }
  await sauvegarderMessage("envoyé");
});

async function sauvegarderMessage(statutCible) {
  masquerErreurComposition();
  const idBrouillon = elBrouillonIdEdition.value;

  const donnees = {
    expediteurUid: UTILISATEUR_COURANT.uid,
    expediteurNom: PROFIL_COURANT.nom,
    expediteurEmail: PROFIL_COURANT.email,
    destinataireUid: DESTINATAIRE_SELECTIONNE?.id || null,
    destinataireNom: DESTINATAIRE_SELECTIONNE?.nom || null,
    destinataireEmail: DESTINATAIRE_SELECTIONNE?.email || null,
    objet: elObjet.value.trim(),
    contenu: elContenu.value.trim(),
    statut: statutCible,
    lu: false,
  };

  if (statutCible === "brouillon" && !DESTINATAIRE_SELECTIONNE && !elObjet.value.trim() && !elContenu.value.trim()) {
    fermerComposition();
    return; // rien à enregistrer
  }

  try {
    if (idBrouillon) {
      await updateDoc(doc(db, "messages", idBrouillon), { ...donnees, creeLe: serverTimestamp() });
    } else {
      await addDoc(collection(db, "messages"), { ...donnees, creeLe: serverTimestamp() });
    }
    afficherToast(statutCible === "envoyé" ? "Message envoyé." : "Brouillon enregistré.", "succes");
    fermerComposition();
  } catch (erreur) {
    console.error(erreur);
    afficherErreurComposition("Une erreur est survenue. Réessaie.");
  }
}

function afficherErreurComposition(texte) {
  elMessageErreurComposition.textContent = texte;
  elMessageErreurComposition.hidden = false;
}
function masquerErreurComposition() {
  elMessageErreurComposition.hidden = true;
}

// ============================================================
// Toasts
// ============================================================
function afficherToast(texte, type = "succes") {
  const zone = document.getElementById("toast-zone");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = texte;
  zone.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
