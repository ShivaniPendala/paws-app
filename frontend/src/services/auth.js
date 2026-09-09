import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;
export const auth = app ? getAuth(app) : null;
const googleProvider = new GoogleAuthProvider();

export function observeAuth(callback) {
  if (!auth) return () => callback(null);
  return onAuthStateChanged(auth, callback);
}

export function signIn(email, password) {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  return signInWithEmailAndPassword(auth, email, password);
}

export function signUp(email, password) {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signInWithGoogle() {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  return signInWithPopup(auth, googleProvider);
}

export function logOut() {
  return auth ? signOut(auth) : Promise.resolve();
}

export async function getVerifiedRole(user) {
  if (!user) return 'guest';
  const tokenResult = await user.getIdTokenResult();
  return tokenResult.claims.ngo_verified === true || tokenResult.claims.role === 'ngo' ? 'ngo' : 'citizen';
}
