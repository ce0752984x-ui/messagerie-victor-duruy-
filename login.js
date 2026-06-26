import {
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  recupererProfil,
  fabriquerEmail,
  DOMAINE_ETABLISSEMENT
} from "./firebase-config.js";

const elIdentifiant = document.getElementById("identifiant");
const elMotDePasse = document.getElementById("mot-de-passe");
const elFormulaire = document.getElementById("formulaire-connexion");
const elMessageErreur = document.getElementById("message-erreur");
const elBoutonConnexion = document.getElementById("bouton-connexion");
const elTexteBouton = document.getElementById("texte-bouton");
const elBoutonOeil = document.getElementById("bouton-oeil");
const elSuffixe = document.getElementById("suffixe-domaine");

elSuffixe.textContent = "@" + DOMAINE_ETABLISSEMENT;

// Affiche / masque le mot de passe
elBoutonOeil.addEventListener("click", () => {
  const estVisible = elMotDePasse.type === "text";
  elMotDePasse.type = estVisible ? "password" : "text";
});

// Affiche un toast laissé en attente (ex: après création d'un compte par un admin)
{
  const messageEnAttente = sessionStorage.getItem("toast-apres-connexion");
  if (messageEnAttente) {
    sessionStorage.removeItem("toast-apres-connexion");
    setTimeout(() => afficherToast(messageEnAttente, "succes"), 300);
  }
}

function afficherToast(texte, type = "succes") {
  const zone = document.getElementById("toast-zone");
  if (!zone) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = texte;
  zone.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Si un paramètre ?desactive=1 est présent (renvoyé depuis protegerPage),
// on affiche un message clair.
const params = new URLSearchParams(window.location.search);
if (params.get("desactive") === "1") {
  afficherErreur("Ce compte a été désactivé. Contactez l'administration.");
}

// Si déjà connecté, redirige automatiquement vers le bon espace.
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const profil = await recupererProfil(user.uid);
    if (profil && profil.statut !== "désactivé") {
      rediriger(profil.role);
    }
  }
});

elFormulaire.addEventListener("submit", async (e) => {
  e.preventDefault();
  masquerErreur();

  const idSaisi = elIdentifiant.value.trim();
  const mdp = elMotDePasse.value;

  if (!idSaisi || !mdp) {
    afficherErreur("Merci de renseigner ton identifiant et ton mot de passe.");
    return;
  }

  // Si l'utilisateur a tapé une adresse complète par erreur, on la respecte ;
  // sinon on complète avec le domaine de l'établissement.
  const email = idSaisi.includes("@") ? idSaisi : fabriquerEmail(idSaisi);

  basculerChargement(true);

  try {
    const identifiants = await signInWithEmailAndPassword(auth, email, mdp);
    const profil = await recupererProfil(identifiants.user.uid);

    if (!profil) {
      afficherErreur("Ce compte n'a pas de profil associé. Contacte l'administration.");
      basculerChargement(false);
      return;
    }

    if (profil.statut === "désactivé") {
      afficherErreur("Ce compte a été désactivé. Contacte l'administration.");
      const { signOut } = await import("./firebase-config.js");
      basculerChargement(false);
      return;
    }

    rediriger(profil.role);

  } catch (erreur) {
    basculerChargement(false);
    afficherErreur(traduireErreur(erreur.code));
  }
});

function rediriger(role) {
  if (role === "admin") {
    window.location.href = "admin.html";
  } else {
    window.location.href = "mail.html";
  }
}

function afficherErreur(texte) {
  elMessageErreur.textContent = texte;
  elMessageErreur.hidden = false;
}
function masquerErreur() {
  elMessageErreur.hidden = true;
}

function basculerChargement(enCours) {
  elBoutonConnexion.disabled = enCours;
  elTexteBouton.innerHTML = enCours
    ? '<span class="spinner"></span> Connexion...'
    : "Se connecter";
}

function traduireErreur(code) {
  switch (code) {
    case "auth/invalid-email":
      return "L'identifiant saisi n'est pas valide.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "Identifiant ou mot de passe incorrect.";
    case "auth/wrong-password":
      return "Identifiant ou mot de passe incorrect.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessaie dans quelques minutes.";
    case "auth/network-request-failed":
      return "Problème de connexion réseau. Vérifie ta connexion internet.";
    default:
      return "Une erreur est survenue. Réessaie ou contacte l'administration.";
  }
}
