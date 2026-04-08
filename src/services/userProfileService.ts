import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { waitForCurrentUser } from './authSessionService';
import { handleFirestoreError, OperationType } from './verificationService';

export interface UserProfile {
  uid: string;
  email: string;
  name?: string;
  phone?: string;
  role: 'owner' | 'admin' | 'staff';
  permissions?: string[];
  team_memberships?: string[];
  active?: boolean;
  created_at?: any;
  updated_at?: any;
}

const PLATFORM_ADMIN_EMAIL = 'thomaslmiller89@gmail.com';
const TEAM_PERMISSION_KEYS = ['route_access', 'customer_access', 'expense_entry_access', 'job_interaction_access'] as const;
export type TeamPermissionKey = typeof TEAM_PERMISSION_KEYS[number];

export const userProfileService = {
  getCurrentUserProfile: async (): Promise<UserProfile | null> => {
    const user = await waitForCurrentUser();
    if (!user) return null;

    try {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? ({ uid: user.uid, ...docSnap.data() } as UserProfile) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'users');
      return null;
    }
  },

  subscribeToCurrentUserProfile: (callback: (profile: UserProfile | null) => void) => {
    let unsubscribeProfile = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeProfile();

      if (!user) {
        callback(null);
        return;
      }

      unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
        callback(snapshot.exists() ? ({ uid: user.uid, ...snapshot.data() } as UserProfile) : null);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  },

  ensureCurrentUserProfile: async () => {
    const user = await waitForCurrentUser();
    if (!user) return;

    const docRef = doc(db, 'users', user.uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      await setDoc(docRef, {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || '',
        phone: '',
        role: user.email === PLATFORM_ADMIN_EMAIL ? 'admin' : 'owner',
        permissions: [],
        team_memberships: [],
        active: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        email: user.email || docSnap.data().email || '',
        name: user.displayName || docSnap.data().name || '',
        role: user.email === PLATFORM_ADMIN_EMAIL ? 'admin' : (docSnap.data().role || 'owner'),
        active: true,
        updated_at: serverTimestamp(),
      });
    }
  },

  updateCurrentUserProfile: async (updates: Partial<UserProfile>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      const docRef = doc(db, 'users', user.uid);
      const existing = await getDoc(docRef);

      if (existing.exists()) {
        await updateDoc(docRef, {
          ...updates,
          updated_at: serverTimestamp(),
        });
        return;
      }

      await setDoc(docRef, {
        uid: user.uid,
        email: user.email || '',
        name: updates.name ?? user.displayName ?? '',
        phone: updates.phone ?? '',
        role: user.email === PLATFORM_ADMIN_EMAIL ? 'admin' : 'owner',
        permissions: [],
        team_memberships: [],
        active: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  },

  isPlatformAdmin: (profile?: UserProfile | null) => {
    const email = auth.currentUser?.email || profile?.email || '';
    return email === PLATFORM_ADMIN_EMAIL;
  },

  hasPermission: (profile: UserProfile | null | undefined, permission: TeamPermissionKey) => {
    if (!profile) return false;
    if (profile.role === 'owner' || userProfileService.isPlatformAdmin(profile)) return true;
    return profile.permissions?.includes(permission) || false;
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      return snapshot.docs.map((entry) => ({ uid: entry.id, ...entry.data() } as UserProfile));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'users');
      return [];
    }
  }
};
