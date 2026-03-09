import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDQn568lTS8llDYqqBN7yS5mjWe6MrhnkA",
  authDomain: "pocketledger-4fd7d.firebaseapp.com",
  projectId: "pocketledger-4fd7d",
  storageBucket: "pocketledger-4fd7d.firebasestorage.app",
  messagingSenderId: "470935586540",
  appId: "1:470935586540:web:97479f7e8acfbb375247c9"
};
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);