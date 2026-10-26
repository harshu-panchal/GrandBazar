import dotenv from "dotenv";
// firebase-admin v13+ under ESM: the default import resolves to the package's
// `app` entry point, which exposes initializeApp/cert directly and has NO
// `admin.credential` or `admin.messaging` namespace. The old CJS-style
// `admin.credential.cert(...)` threw here, getFirebaseAdminApp() swallowed it
// and returned null, and every push notification then failed with
// "Firebase Admin is not configured". Use the modular entry points instead.
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

let firebaseAdminApp = null;

/**
 * Returns a firebase-admin app when FIREBASE_SERVICE_ACCOUNT (JSON string)
 * is set. FIREBASE_DATABASE_URL is optional (required only for Realtime DB).
 */
export const getFirebaseAdminApp = () => {
  if (firebaseAdminApp) return firebaseAdminApp;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!json) {
    return null;
  }

  try {
    const serviceAccount = JSON.parse(json);
    const config = {
      credential: cert(serviceAccount),
    };
    if (databaseURL) {
      config.databaseURL = databaseURL;
    }
    // Reuse the default app if something else already initialised it, since a
    // second initializeApp() with the same name throws.
    firebaseAdminApp = getApps().length ? getApp() : initializeApp(config);
    return firebaseAdminApp;
  } catch (e) {
    console.warn("[Firebase] Init skipped:", e.message);
    return null;
  }
};

export const getFirebaseRealtimeDb = () => {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getDatabase(app);
};

