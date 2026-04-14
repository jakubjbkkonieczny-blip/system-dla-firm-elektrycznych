// lib/firebase/admin.ts
import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type SA = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function initAdmin() {
  if (getApps().length) return;

  // Preferuj pojedynczy JSON, bo jest najmniej problematyczny na produkcji
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  let projectId = process.env.FIREBASE_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (saJson) {
    let parsed: SA | null = null;
    try {
      parsed = JSON.parse(saJson) as SA;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON nie jest poprawnym JSON-em");
    }

    projectId = projectId || parsed?.project_id;
    clientEmail = clientEmail || parsed?.client_email;
    privateKey = privateKey || parsed?.private_key;
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Brak FIREBASE creds. Ustaw FIREBASE_SERVICE_ACCOUNT_JSON albo FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY"
    );
  }

  // ważne: env często ma \n jako dwa znaki
  privateKey = privateKey.replace(/\\n/g, "\n");

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

initAdmin();

export const auth = getAuth();
export const db = getFirestore();

// aliasy, jakby stary kod używał
export const adminAuth = auth;
export const adminDb = db;