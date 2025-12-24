import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCbxihn2gZvFqgV7K71dCU8tyslDXxC6qU",
  authDomain: "ielts-lms-e2437.firebaseapp.com",
  projectId: "ielts-lms-e2437",
  storageBucket: "ielts-lms-e2437.firebasestorage.app",
  messagingSenderId: "893003494356",
  appId: "1:893003494356:web:cf99139a8b806cdb195c41",
  measurementId: "G-FGEME93L6B"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);