import type { User } from 'firebase/auth';
import { auth } from '../firebase';

export const waitForCurrentUser = async (): Promise<User | null> => {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<User | null>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};
