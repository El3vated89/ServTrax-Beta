import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  setPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const createAuth = () => {
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (error) {
    console.warn('Falling back to default Firebase Auth initialization:', error);
    const fallbackAuth = getAuth(app);

    void setPersistence(fallbackAuth, browserLocalPersistence).catch(() =>
      setPersistence(fallbackAuth, inMemoryPersistence).catch((persistenceError) => {
        console.warn('Failed to set Firebase Auth persistence fallback:', persistenceError);
      })
    );

    return fallbackAuth;
  }
};

export const auth = createAuth();
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
