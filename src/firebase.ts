import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  disableNetwork,
  enableNetwork,
  setLogLevel,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

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
