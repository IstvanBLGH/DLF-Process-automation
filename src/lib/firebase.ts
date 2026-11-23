"use client";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "").toLowerCase();

/** Fără configurare Firebase aplicația rulează în „mod demo” (date doar în acest browser). */
export const hasFirebase = !!config.apiKey && !!config.projectId;

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

export function fb(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!hasFirebase) throw new Error("Firebase nu e configurat");
  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
    try {
      db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        // lucru offline (hală fără semnal): datele se sincronizează când revine rețeaua
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      db = getFirestore(app);
    }
  }
  return { app, auth: getAuth(app), db: db! };
}
