import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  disableNetwork,
  enableNetwork,
  setLogLevel,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';

// Safe optional load of ../firebase-applet-config.json so `vite build` on Vercel/GitHub
// never fails if AI Studio's GitHub exporter excludes firebase-applet-config.json
const configModules = (import.meta as any).glob
  ? (import.meta as any).glob('../firebase-applet-config.json', { eager: true })
  : {};
const loadedJsonConfig =
  (Object.values(configModules)[0] as any)?.default ||
  (Object.values(configModules)[0] as any) ||
  null;

const env = (import.meta as any).env || {};

const firebaseConfig = {
  projectId:
    env.VITE_FIREBASE_PROJECT_ID ||
    loadedJsonConfig?.projectId ||
    'tranquil-amp-140ks',
  appId:
    env.VITE_FIREBASE_APP_ID ||
    loadedJsonConfig?.appId ||
    '1:116706140397:web:6aeec2216a8c2fdc322ce4',
  apiKey:
    env.VITE_FIREBASE_API_KEY ||
    loadedJsonConfig?.apiKey ||
    'AIzaSyBJSc-wU7sFd_ebZ7Zm1AnG1aSxCpakvkA',
  authDomain:
    env.VITE_FIREBASE_AUTH_DOMAIN ||
    loadedJsonConfig?.authDomain ||
    'tranquil-amp-140ks.firebaseapp.com',
  firestoreDatabaseId:
    env.VITE_FIREBASE_DATABASE_ID ||
    loadedJsonConfig?.firestoreDatabaseId ||
    'ai-studio-qunllphctonthcs-f4826bd8-ef41-43fe-8cff-8dd629fb5e56',
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    loadedJsonConfig?.storageBucket ||
    'tranquil-amp-140ks.firebasestorage.app',
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    loadedJsonConfig?.messagingSenderId ||
    '116706140397',
  measurementId: loadedJsonConfig?.measurementId || '',
  oAuthClientId:
    loadedJsonConfig?.oAuthClientId ||
    '116706140397-a0493rg3e3m6j0lgciauoosff80hhlnn.apps.googleusercontent.com',
  recaptchaSiteKey: loadedJsonConfig?.recaptchaSiteKey || '',
};

// Silence internal @firebase/firestore backoff/quota console.error noise so circuit breaker handles it cleanly
try {
  setLogLevel('silent');
} catch (e) {
  // Ignore if setLogLevel is unavailable in test env
}

const app = initializeApp(firebaseConfig);

const db: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

const auth: Auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let isQuotaExceeded = false;
let networkDisabledByCircuitBreaker = false;

try {
  const todayStr = new Date().toISOString().slice(0, 10);
  const savedQuotaDate = localStorage.getItem('firestore_quota_exceeded_date');
  if (savedQuotaDate === todayStr) {
    isQuotaExceeded = true;
  }
} catch (e) {
  // localStorage might fail in restricted iframe environments
}

// Immediately trip circuit breaker on boot if today's quota was already marked exceeded
if (isQuotaExceeded) {
  networkDisabledByCircuitBreaker = true;
  disableNetwork(db).catch(() => {});
}

const quotaListeners: Array<(exceeded: boolean) => void> = [];

export function subscribeQuotaStatus(listener: (exceeded: boolean) => void) {
  quotaListeners.push(listener);
  listener(isQuotaExceeded);
  return () => {
    const idx = quotaListeners.indexOf(listener);
    if (idx !== -1) quotaListeners.splice(idx, 1);
  };
}

export function getIsQuotaExceeded() {
  return isQuotaExceeded;
}

export function setQuotaExceeded(val: boolean) {
  if (isQuotaExceeded !== val) {
    isQuotaExceeded = val;
    if (val) {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        localStorage.setItem('firestore_quota_exceeded_date', todayStr);
      } catch (e) {}
      if (!networkDisabledByCircuitBreaker) {
        networkDisabledByCircuitBreaker = true;
        disableNetwork(db).catch(() => {});
      }
    } else {
      try {
        localStorage.removeItem('firestore_quota_exceeded_date');
      } catch (e) {}
      if (networkDisabledByCircuitBreaker) {
        networkDisabledByCircuitBreaker = false;
        enableNetwork(db).catch(() => {});
      }
    }
    quotaListeners.forEach((fn) => fn(isQuotaExceeded));
  } else if (val && !networkDisabledByCircuitBreaker) {
    networkDisabledByCircuitBreaker = true;
    disableNetwork(db).catch(() => {});
  }
}

export async function tryReconnectFirestore(): Promise<boolean> {
  try {
    setQuotaExceeded(false);
    await enableNetwork(db);
    networkDisabledByCircuitBreaker = false;
    return true;
  } catch (err) {
    handleFirestoreError(err, 'ReconnectFirestore');
    return false;
  }
}

export function handleFirestoreError(error: any, operationName: string) {
  const errCode = error?.code || 'unknown';
  const errMsg = error?.message || String(error || 'An unknown error occurred');

  // Check if error is resource-exhausted / quota exceeded
  const isQuotaError =
    errCode === 'resource-exhausted' ||
    errMsg.includes('Quota exceeded') ||
    errMsg.includes('Quota limit exceeded') ||
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('Free daily write units') ||
    errMsg.includes('Free daily read units') ||
    errMsg.includes('maximum backoff delay');

  if (isQuotaError) {
    setQuotaExceeded(true);
  }

  const errInfo = {
    operation: operationName,
    code: errCode,
    message: errMsg,
    timestamp: new Date().toISOString(),
  };
  if (!isQuotaError) {
    console.warn(`[Firestore Safe Handler] ${operationName}:`, errInfo);
  }
  return errInfo;
}

export { firebaseConfig, app, db, auth, googleProvider };
