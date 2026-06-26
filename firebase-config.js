// ============================================================
// CONFIGURATION FIREBASE — CLG VICTOR DURUY
// Ce fichier est partagé par toutes les pages du site.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Ta configuration Firebase (déjà remplie, ne pas modifier)
const firebaseConfig = {
  apiKey: "AIzaSyBH7brAhLPlyTmgKXPjFBvyo-cfla_pPW4",
  authDomain: "messagerie-administrative-clg.firebaseapp.com",
  projectId: "messagerie-administrative-clg",
  storageBucket: "messagerie-administrative-clg.firebasestorage.app",
  messagingSenderId: "685444050276",
  appId: "1:685444050276:web:687dd9ebcd1ce44c365e71"
};

// Nom de domaine interne utilisé pour générer les adresses des comptes.
// Tu peux le changer ici si besoin : tous les comptes utiliseront ce domaine.
export const DOMAINE_ETABLISSEMENT = "clg-victorduruy.fr";

// Initialisation
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Ré-export des fonctions Firebase pour que les autres fichiers
// n'aient qu'un seul endroit à importer.
export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
};

// ------------------------------------------------------------
// Fabrique l'adresse email interne à partir d'un identifiant.
// Ex: fabriquerEmail("jdupont") -> "jdupont@clg-victorduruy.fr"
// ------------------------------------------------------------
export function fabriquerEmail(identifiant) {
  const propre = identifiant
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .replace(/[^a-z0-9._-]/g, "");
  return `${propre}@${DOMAINE_ETABLISSEMENT}`;
}

// ------------------------------------------------------------
// Récupère le profil Firestore (rôle, nom, classe...) de l'utilisateur connecté.
// ------------------------------------------------------------
export async function recupererProfil(uid) {
  const ref = doc(db, "utilisateurs", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ------------------------------------------------------------
// Protège une page : redirige vers login si pas connecté,
// ou si rôleRequis est précisé et ne correspond pas.
// Retourne {user, profil} si tout est ok.
// ------------------------------------------------------------
export function protegerPage(rolesAutorises = null) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      const profil = await recupererProfil(user.uid);
      if (!profil) {
        // Compte auth existe mais pas de profil Firestore -> anomalie, on déconnecte
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }
      if (profil.statut === "désactivé") {
        await signOut(auth);
        window.location.href = "index.html?desactive=1";
        return;
      }
      if (rolesAutorises && !rolesAutorises.includes(profil.role)) {
        window.location.href = "mail.html";
        return;
      }
      resolve({ user, profil });
    });
  });
}

// ------------------------------------------------------------
// Formate une date Firestore Timestamp en chaîne lisible française.
// ------------------------------------------------------------
export function formaterDate(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const aujourdHui = new Date();
  const memeJour =
    date.getDate() === aujourdHui.getDate() &&
    date.getMonth() === aujourdHui.getMonth() &&
    date.getFullYear() === aujourdHui.getFullYear();

  if (memeJour) {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ------------------------------------------------------------
// Échappe le HTML pour éviter toute injection dans les messages affichés.
// ------------------------------------------------------------
export function echapperHTML(texte) {
  const div = document.createElement("div");
  div.textContent = texte ?? "";
  return div.innerHTML;
}

// ------------------------------------------------------------
// Initiales pour les avatars (ex: "Jean Dupont" -> "JD")
// ------------------------------------------------------------
export function initiales(nomComplet) {
  if (!nomComplet) return "?";
  const parts = nomComplet.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
