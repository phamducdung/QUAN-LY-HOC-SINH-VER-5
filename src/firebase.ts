import { initializeApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const db: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

const auth: Auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let isQuotaExceeded = false;
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
    quotaListeners.forEach((fn) => fn(isQuotaExceeded));
  }
}

export function handleFirestoreError(error: any, operationName: string) {
  const errCode = error?.code || 'unknown';
  const errMsg = error?.message || String(error || 'An unknown error occurred');

  // Check if error is resource-exhausted / quota exceeded
  if (errCode === 'resource-exhausted' || errMsg.includes('Quota exceeded') || errMsg.includes('resource-exhausted')) {
    setQuotaExceeded(true);
  }

  const errInfo = {
    operation: operationName,
    code: errCode,
    message: errMsg,
    timestamp: new Date().toISOString()
  };
  console.warn(`[Firestore Safe Handler] ${operationName}:`, errInfo);
  return errInfo;
}

export { firebaseConfig, app, db, auth, googleProvider };

