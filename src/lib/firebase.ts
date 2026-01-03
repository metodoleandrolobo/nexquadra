import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


const firebaseConfig = {
   apiKey: "AIzaSyA8nyAok5H1u3y1upQNosz5oJnIwDARpqI",
  authDomain: "coachhub-c4709.firebaseapp.com",
  projectId: "coachhub-c4709",
  storageBucket: "coachhub-c4709.firebasestorage.app",
  messagingSenderId: "489644676315",
  appId: "1:489644676315:web:803626ddad09de47d0a8fe",
  measurementId: "G-XDM8VLKE6X"
};

// Evita inicializar mais de uma vez (importante no Next.js durante reload)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

console.log("🔥 App Firebase carregado, projectId =", app.options.projectId);
console.log("FIREBASE PROJECT:", firebaseConfig.projectId);
console.log("AUTH DOMAIN:", firebaseConfig.authDomain);
