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

export function handleFirestoreError(error: any, operationName: string) {
  const errInfo = {
    operation: operationName,
    code: error?.code || 'unknown',
    message: error?.message || 'An unknown error occurred',
    timestamp: new Date().toISOString()
  };
  console.error(`[Firestore Error] ${operationName}:`, errInfo);
  return errInfo;
}

export { firebaseConfig, app, db, auth, googleProvider };
