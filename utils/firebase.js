// src/services/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: "AIzaSyDkrVV8Upr_UyjxhxHpf7ouVScZpoZPsTY",
  authDomain: "grequel-controller.firebaseapp.com",
  projectId: "grequel-controller",
  storageBucket: "grequel-controller.appspot.com",
  messagingSenderId: "24794021032",
  appId: "1:24794021032:web:0b7b932ad95546243ad69d",
  measurementId: "G-XFQBBZNEEM"
};

export const app = initializeApp(config);

// Auth
// export const auth = firebase.auth();
// export const googleAuth = new auth.GoogleAuthProvider();

// Firestore
export const db = getFirestore(app);
