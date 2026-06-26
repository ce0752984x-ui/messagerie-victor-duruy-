import {
  auth, db, protegerPage, fabriquerEmail, DOMAINE_ETABLISSEMENT,
  collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp,
  signOut, createUserWithEmailAndPassword,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  formaterDate, echapperHTML, initiales
} from "./firebase-config.js";

// ============================================================
// Initialisation : protection de page (admin uniquement)
// ============================================================
let UTILISATEUR_COURANT = null;
let PROFIL_COURANT = null;
let TOUS_LES_COMPTES = [];   // cache local pour filtrage instantané
let TOUS_LES_MESSAGES = [];

protegerPage(["admin"]).then(({ user, profil }) => {
  UTILISATEUR_COURANT = user;
  PROFIL_COURANT = profil;
  document.getElementById("nom-admin-connecte").textContent = profil.nom;
  document.getElementById("avatar-admin").textContent = initiales(profil.nom);
  document.getElementById("affichage-domaine").textContent = "@" + DOMAINE_ETABLISSEMENT;
  document.getElementById("suffixe-domaine-modale").textContent = "@" + DOMAINE_ETABLISSEMENT;

  chargerTout();
});

// ============================================================
// Navigation entre vues
// ============================================================
const TITRES_VUES = {
  "tableau-de-bord": "Tableau de bord",
  comptes: "Gestion des comptes",
  messages: "Supervision des messages",
  parametres: "Paramètres",
};

document.querySelectorAll(".nav-item[data-vue]").forEach((bouton) => {
  bouton.addEventListener("click", () => allerVers(bouton.dataset.vue));
});
document.querySelectorAll("[data-vue-lien]").forEach((bouton) => {
  bouton.addEventListener("click", () => allerVers(bouton.dataset.vueLien));
});

function allerVers(nomVue) {
  document.querySelectorAll(".vue").forEach((v) => v.classList.add("masquee"));
  document.getElementById("vue-" + nomVue).classList.remove("masquee");
  document.querySelectorAll(".nav-item[data-vue]").forEach((b) => b.classList.remove("actif"));
  const boutonNav = document.querySelector(`.nav-item[data-vue="${nomVue}"]`);
  if (boutonNav) boutonNav.classList.add("actif");
  document.getElementById("titre-vue").textContent = TITRES_VUES[nomVue];
}

// ============================================================
// Déconnexion
// ============================================================
document.getElementById("bouton-deconnexion").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ============================================================
// Chargement des données (comptes + messages) + stats
// ============================================================
async function chargerTout() {
  await Promise.all([chargerComptes(), chargerMessages()]);
  calculerStats();
  afficherComptesRecents();
  afficherTableComptes();
  afficherTableMessages();
}

async function chargerComptes() {
  const snap = await getDocs(query(collection(db, "utilisateurs"), orderBy("creeLe", "desc")));
  TOUS_LES_COMPTES = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function chargerMessages() {
  try {
    const snap = await getDocs(query(collection(db, "messages"), orderBy("creeLe", "desc"), limit(200)));
    TOUS_LES_MESSAGES = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // La collection peut ne pas encore exister tant qu'aucun message n'a été envoyé.
    TOUS_LES_MESSAGES = [];
  }
}

function calculerStats() {
  const actifs = TOUS_LES_COMPTES.filter((c) => c.statut !== "désactivé");
  document.getElementById("stat-comptes-actifs").textContent = actifs.length;
  document.getElementById("stat-eleves").textContent = TOUS_LES_COMPTES.filter((c) => c.role === "eleve").length;
  document.getElementById("stat-professeurs").textContent = TOUS_LES_COMPTES.filter((c) => c.role === "professeur").length;
  // Compte uniquement les messages "envoyés" (pas les brouillons)
  document.getElementById("stat-messages").textContent = TOUS_LES_MESSAGES.filter((m) => m.statut === "envoyé").length;
}

function afficherComptesRecents() {
  const conteneur = document.getElementById("liste-comptes-recents");
  const recents = TOUS_LES_COMPTES.slice(0, 5);
  if (recents.length === 0) {
    conteneur.innerHTML = `<p style="color:var(--gris-texte);font-size:0.9rem;">Aucun compte créé pour l'instant.</p>`;
    return;
  }
  conteneur.innerHTML = recents.map((c) => `
    <div class="ligne-compte-recent">
      <div class="avatar-table">${initiales(c.nom)}</div>
      <div style="flex:1;">
        <strong style="font-size:0.9rem;">${echapperHTML(c.nom)}</strong>
        <div class="identifiant-mono">${echapperHTML(c.email)}</div>
      </div>
      <span class="badge badge-${c.role}">${libelleRole(c.role)}</span>
    </div>
  `).join("");
}

function libelleRole(role) {
  return { admin: "Admin", professeur: "Professeur", eleve: "Élève" }[role] || role;
}

// ============================================================
// VUE COMPTES : affichage table + recherche/filtres
// ============================================================
const elRecherche = document.getElementById("recherche-comptes");
const elFiltreRole = document.getElementById("filtre-role");
const elFiltreStatut = document.getElementById("filtre-statut");

[elRecherche, elFiltreRole, elFiltreStatut].forEach((el) =>
  el.addEventListener("input", afficherTableComptes)
);

function afficherTableComptes() {
  const texteRecherche = elRecherche.value.trim().toLowerCase();
  const role = elFiltreRole.value;
  const statut = elFiltreStatut.value;

  let resultats = TOUS_LES_COMPTES.filter((c) => {
    const correspondTexte =
      !texteRecherche ||
      c.nom?.toLowerCase().includes(texteRecherche) ||
      c.email?.toLowerCase().includes(texteRecherche) ||
      c.classeOuFonction?.toLowerCase().includes(texteRecherche);
    const correspondRole = !role || c.role === role;
    const correspondStatut = !statut || (c.statut || "actif") === statut;
    return correspondTexte && correspondRole && correspondStatut;
  });

  const corps = document.getElementById("corps-table-comptes");
  const etatVide = document.getElementById("etat-vide-comptes");

  if (resultats.length === 0) {
    corps.innerHTML = "";
    etatVide.hidden = false;
    return;
  }
  etatVide.hidden = true;

  corps.innerHTML = resultats.map((c) => `
    <tr>
      <td>
        <div class="cellule-compte">
          <div class="avatar-table">${initiales(c.nom)}</div>
          <strong>${echapperHTML(c.nom)}</strong>
        </div>
      </td>
      <td><span class="identifiant-mono">${echapperHTML(c.email)}</span></td>
      <td><span class="badge badge-${c.role}">${libelleRole(c.role)}</span></td>
      <td class="masquer-mobile">${echapperHTML(c.classeOuFonction || "—")}</td>
      <td>${(c.statut || "actif") === "désactivé"
          ? '<span class="badge badge-desactive">Désactivé</span>'
          : '<span class="badge" style="background:rgba(63,122,79,0.1);color:var(--vert-succes);">Actif</span>'}</td>
      <td>
        <div class="actions-ligne">
          <button class="btn-icone" title="Modifier" data-action="modifier" data-id="${c.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icone" title="${(c.statut || 'actif') === 'désactivé' ? 'Réactiver' : 'Désactiver'}" data-action="basculer-statut" data-id="${c.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </button>
          <button class="btn-icone" title="Supprimer" data-action="supprimer" data-id="${c.id}" style="color:var(--rouge-erreur);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

// Délégation d'événements sur la table (modifier / désactiver / supprimer)
document.getElementById("corps-table-comptes").addEventListener("click", (e) => {
  const bouton = e.target.closest("button[data-action]");
  if (!bouton) return;
  const id = bouton.dataset.id;
  const compte = TOUS_LES_COMPTES.find((c) => c.id === id);
  if (!compte) return;

  if (bouton.dataset.action === "modifier") ouvrirModaleCompte(compte);
  if (bouton.dataset.action === "basculer-statut") basculerStatutCompte(compte);
  if (bouton.dataset.action === "supprimer") demanderSuppressionCompte(compte);
});

// ============================================================
// MODALE COMPTE : création et édition
// ============================================================
const elFondModaleCompte = document.getElementById("fond-modale-compte");
const elFormulaireCompte = document.getElementById("formulaire-compte");
const elTitreModaleCompte = document.getElementById("titre-modale-compte");
const elUidEdition = document.getElementById("compte-uid-edition");
const elNomCompte = document.getElementById("compte-nom");
const elIdentifiantCompte = document.getElementById("compte-identifiant");
const elRoleCompte = document.getElementById("compte-role");
const elClasseCompte = document.getElementById("compte-classe");
const elMdpCompte = document.getElementById("compte-mdp");
const elChampMdpCreation = document.getElementById("champ-mdp-creation");
const elMessageErreurCompte = document.getElementById("message-erreur-compte");
const elBoutonEnregistrerCompte = document.getElementById("bouton-enregistrer-compte");

document.getElementById("bouton-nouveau-compte").addEventListener("click", () => ouvrirModaleCompte(null));
document.getElementById("fermer-modale-compte").addEventListener("click", fermerModaleCompte);
document.getElementById("annuler-modale-compte").addEventListener("click", fermerModaleCompte);

document.getElementById("bouton-generer-mdp").addEventListener("click", () => {
  elMdpCompte.value = genererMotDePasse();
});

function genererMotDePasse() {
  const adjectifs = ["rapide", "solide", "calme", "vif", "clair", "fort"];
  const noms = ["arbre", "fleuve", "stylo", "table", "livre", "craie"];
  const a = adjectifs[Math.floor(Math.random() * adjectifs.length)];
  const n = noms[Math.floor(Math.random() * noms.length)];
  const chiffre = Math.floor(10 + Math.random() * 89);
  return `${n}${a}${chiffre}`;
}

function ouvrirModaleCompte(compte) {
  elFormulaireCompte.reset();
  masquerErreurCompte();

  if (compte) {
    elTitreModaleCompte.textContent = "Modifier le compte";
    elBoutonEnregistrerCompte.textContent = "Enregistrer les modifications";
    elUidEdition.value = compte.id;
    elNomCompte.value = compte.nom;
    elIdentifiantCompte.value = compte.email.split("@")[0];
    elIdentifiantCompte.disabled = true; // l'email Firebase Auth n'est pas modifiable simplement
    elRoleCompte.value = compte.role;
    elClasseCompte.value = compte.classeOuFonction || "";
    elChampMdpCreation.style.display = "none"; // pas de mdp à la modification (réinitialisation séparée plus tard si besoin)
  } else {
    elTitreModaleCompte.textContent = "Nouveau compte";
    elBoutonEnregistrerCompte.textContent = "Créer le compte";
    elUidEdition.value = "";
    elIdentifiantCompte.disabled = false;
    elChampMdpCreation.style.display = "flex";
    elMdpCompte.value = genererMotDePasse();
    elMdpCompte.required = true;
  }

  elFondModaleCompte.classList.remove("masquee");
}

function fermerModaleCompte() {
  elFondModaleCompte.classList.add("masquee");
}

function afficherErreurCompte(texte) {
  elMessageErreurCompte.textContent = texte;
  elMessageErreurCompte.hidden = false;
}
function masquerErreurCompte() {
  elMessageErreurCompte.hidden = true;
}

elFormulaireCompte.addEventListener("submit", async (e) => {
  e.preventDefault();
  masquerErreurCompte();

  const estEdition = !!elUidEdition.value;
  const nom = elNomCompte.value.trim();
  const identifiant = elIdentifiantCompte.value.trim();
  const role = elRoleCompte.value;
  const classeOuFonction = elClasseCompte.value.trim();

  if (!nom || !identifiant || !role) {
    afficherErreurCompte("Merci de remplir tous les champs obligatoires.");
    return;
  }

  elBoutonEnregistrerCompte.disabled = true;

  try {
    if (estEdition) {
      // Mise à jour du profil Firestore uniquement (pas de l'email/mdp Auth)
      await updateDoc(doc(db, "utilisateurs", elUidEdition.value), {
        nom, role, classeOuFonction,
      });
      afficherToast("Compte mis à jour.", "succes");
    } else {
      const mdp = elMdpCompte.value;
      if (!mdp || mdp.length < 6) {
        afficherErreurCompte("Le mot de passe doit contenir au moins 6 caractères.");
        elBoutonEnregistrerCompte.disabled = false;
        return;
      }
      const email = fabriquerEmail(identifiant);

      // Vérifie l'unicité locale avant de créer (Firebase Auth refusera aussi si doublon)
      const existeDeja = TOUS_LES_COMPTES.some((c) => c.email === email);
      if (existeDeja) {
        afficherErreurCompte("Cet identifiant existe déjà. Choisis-en un autre.");
        elBoutonEnregistrerCompte.disabled = false;
        return;
      }

      // IMPORTANT : createUserWithEmailAndPassword connecte automatiquement
      // ce nouvel utilisateur dans le navigateur. On reconnectera l'admin ensuite.
      const identifiantsAdmin = { email: UTILISATEUR_COURANT.email };
      const nouvelUtilisateur = await createUserWithEmailAndPassword(auth, email, mdp);

      await setDoc(doc(db, "utilisateurs", nouvelUtilisateur.user.uid), {
        nom, email, role, classeOuFonction,
        statut: "actif",
        creeLe: serverTimestamp(),
        creePar: PROFIL_COURANT.nom,
      });

      // Firebase connecte automatiquement le navigateur sur le compte qui vient
      // d'être créé. On déconnecte donc immédiatement et on renvoie l'admin
      // se reconnecter avec ses propres identifiants.
      await signOut(auth);
      sessionStorage.setItem(
        "toast-apres-connexion",
        `Compte de ${nom} créé avec succès. Reconnecte-toi pour continuer.`
      );
      window.location.href = "index.html";
      return;
    }

    fermerModaleCompte();
    await chargerTout();
  } catch (erreur) {
    afficherErreurCompte(traduireErreurCreation(erreur.code));
  } finally {
    elBoutonEnregistrerCompte.disabled = false;
  }
});

function traduireErreurCreation(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "Cet identifiant est déjà utilisé par un autre compte.";
    case "auth/weak-password":
      return "Le mot de passe est trop faible (6 caractères minimum).";
    case "auth/invalid-email":
      return "L'identifiant saisi génère une adresse invalide.";
    default:
      return "Une erreur est survenue lors de la création du compte.";
  }
}

// ============================================================
// Basculer statut actif / désactivé
// ============================================================
async function basculerStatutCompte(compte) {
  const nouveauStatut = (compte.statut || "actif") === "désactivé" ? "actif" : "désactivé";
  if (compte.id === UTILISATEUR_COURANT.uid && nouveauStatut === "désactivé") {
    afficherToast("Tu ne peux pas désactiver ton propre compte.", "erreur");
    return;
  }
  await updateDoc(doc(db, "utilisateurs", compte.id), { statut: nouveauStatut });
  afficherToast(
    nouveauStatut === "désactivé" ? "Compte désactivé." : "Compte réactivé.",
    "succes"
  );
  await chargerTout();
}

// ============================================================
// Suppression de compte (avec confirmation)
// ============================================================
const elFondModaleConfirmation = document.getElementById("fond-modale-confirmation");
const elTitreConfirmation = document.getElementById("titre-modale-confirmation");
const elTexteConfirmation = document.getElementById("texte-modale-confirmation");
const elBoutonConfirmer = document.getElementById("confirmer-modale-confirmation");
let ACTION_CONFIRMEE = null;

document.getElementById("annuler-modale-confirmation").addEventListener("click", () => {
  elFondModaleConfirmation.classList.add("masquee");
});

function demanderSuppressionCompte(compte) {
  if (compte.id === UTILISATEUR_COURANT.uid) {
    afficherToast("Tu ne peux pas supprimer ton propre compte.", "erreur");
    return;
  }
  elTitreConfirmation.textContent = "Supprimer ce compte ?";
  elTexteConfirmation.textContent =
    `Le profil de ${compte.nom} (${compte.email}) sera supprimé de la base de données. ` +
    `Cette action est irréversible. Note : pour des raisons de sécurité Firebase, le compte ` +
    `d'authentification devra être supprimé séparément depuis la console Firebase si nécessaire.`;
  ACTION_CONFIRMEE = async () => {
    await deleteDoc(doc(db, "utilisateurs", compte.id));
    afficherToast("Profil supprimé.", "succes");
    await chargerTout();
  };
  elFondModaleConfirmation.classList.remove("masquee");
}

elBoutonConfirmer.addEventListener("click", async () => {
  if (ACTION_CONFIRMEE) {
    elBoutonConfirmer.disabled = true;
    await ACTION_CONFIRMEE();
    elBoutonConfirmer.disabled = false;
  }
  elFondModaleConfirmation.classList.add("masquee");
});

// ============================================================
// VUE MESSAGES : supervision (lecture seule + recherche)
// ============================================================
const elRechercheMessages = document.getElementById("recherche-messages");
elRechercheMessages.addEventListener("input", afficherTableMessages);

function afficherTableMessages() {
  const texte = elRechercheMessages.value.trim().toLowerCase();
  let resultats = TOUS_LES_MESSAGES.filter((m) =>
    !texte ||
    m.objet?.toLowerCase().includes(texte) ||
    m.expediteurNom?.toLowerCase().includes(texte) ||
    m.destinataireNom?.toLowerCase().includes(texte)
  );

  const corps = document.getElementById("corps-table-messages");
  const etatVide = document.getElementById("etat-vide-messages");

  if (resultats.length === 0) {
    corps.innerHTML = "";
    etatVide.hidden = false;
    return;
  }
  etatVide.hidden = true;

  corps.innerHTML = resultats.map((m) => `
    <tr>
      <td>${echapperHTML(m.expediteurNom || "—")}</td>
      <td>${echapperHTML(m.destinataireNom || "—")}</td>
      <td>${echapperHTML(m.objet || "(Sans objet)")}</td>
      <td class="masquer-mobile">${formaterDate(m.creeLe)}</td>
      <td>
        <button class="btn-icone" data-action="voir-message" data-id="${m.id}" title="Voir le message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </td>
    </tr>
  `).join("");
}

document.getElementById("corps-table-messages").addEventListener("click", (e) => {
  const bouton = e.target.closest("button[data-action='voir-message']");
  if (!bouton) return;
  const message = TOUS_LES_MESSAGES.find((m) => m.id === bouton.dataset.id);
  if (message) ouvrirModaleMessage(message);
});

function ouvrirModaleMessage(message) {
  document.getElementById("contenu-modale-message").innerHTML = `
    <div style="margin-bottom:1em; display:flex; flex-direction:column; gap:0.4em; font-size:0.88rem; color:var(--gris-texte);">
      <div><strong style="color:var(--encre);">De :</strong> ${echapperHTML(message.expediteurNom)} (${echapperHTML(message.expediteurEmail || "")})</div>
      <div><strong style="color:var(--encre);">À :</strong> ${echapperHTML(message.destinataireNom)} (${echapperHTML(message.destinataireEmail || "")})</div>
      <div><strong style="color:var(--encre);">Date :</strong> ${formaterDate(message.creeLe)}</div>
    </div>
    <h3 style="font-family:var(--police-titre); font-size:1.15rem; margin-bottom:0.6em;">${echapperHTML(message.objet || "(Sans objet)")}</h3>
    <p style="white-space:pre-wrap; line-height:1.6; color:var(--encre); font-size:0.92rem;">${echapperHTML(message.contenu || "")}</p>
  `;
  document.getElementById("fond-modale-message").classList.remove("masquee");
}
document.getElementById("fermer-modale-message").addEventListener("click", () => {
  document.getElementById("fond-modale-message").classList.add("masquee");
});

// ============================================================
// VUE PARAMÈTRES : changer le mot de passe admin
// ============================================================
document.getElementById("formulaire-mdp-admin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const elMessage = document.getElementById("message-mdp");
  elMessage.hidden = true;

  const mdpActuel = document.getElementById("mdp-actuel").value;
  const mdpNouveau = document.getElementById("mdp-nouveau").value;

  try {
    const credential = EmailAuthProvider.credential(UTILISATEUR_COURANT.email, mdpActuel);
    await reauthenticateWithCredential(UTILISATEUR_COURANT, credential);
    await updatePassword(UTILISATEUR_COURANT, mdpNouveau);
    afficherToast("Mot de passe mis à jour.", "succes");
    e.target.reset();
  } catch (erreur) {
    elMessage.textContent = "Mot de passe actuel incorrect ou nouveau mot de passe invalide.";
    elMessage.hidden = false;
  }
});

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

// Affiche un toast laissé en attente après une redirection (création de compte)
{
  const messageEnAttente = sessionStorage.getItem("toast-apres-connexion");
  if (messageEnAttente) {
    sessionStorage.removeItem("toast-apres-connexion");
    setTimeout(() => afficherToast(messageEnAttente, "succes"), 400);
  }
}
