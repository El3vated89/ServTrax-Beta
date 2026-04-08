import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from './verificationService';
import { planConfigService } from './planConfigService';
import { waitForCurrentUser } from './authSessionService';

export type TeamMemberRole = 'crew_member' | 'crew_lead';
export type TeamAccountStatus = 'pending' | 'active' | 'inactive';

export interface TeamMember {
  id?: string;
  ownerId: string;
  name: string;
  email: string;
  role: TeamMemberRole;
  account_status: TeamAccountStatus;
  linked_user_id?: string;
  route_access: boolean;
  customer_access: boolean;
  expense_entry_access: boolean;
  job_interaction_access: boolean;
  created_at?: any;
  updated_at?: any;
}

const COLLECTION_NAME = 'team_members';

const buildPermissionList = (member: Partial<TeamMember>) => {
  const permissions: string[] = [];
  if (member.route_access) permissions.push('route_access');
  if (member.customer_access) permissions.push('customer_access');
  if (member.expense_entry_access) permissions.push('expense_entry_access');
  if (member.job_interaction_access) permissions.push('job_interaction_access');
  return permissions;
};

const syncLinkedUserProfile = async (memberId: string, member: Partial<TeamMember>) => {
  if (!member.email) return;

  try {
    const userSnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', member.email)));
    if (userSnapshot.empty) return;

    const permissions = buildPermissionList(member);

    await Promise.all(
      userSnapshot.docs.map((entry) => {
        const existingMemberships = Array.isArray(entry.data().team_memberships) ? entry.data().team_memberships : [];
        const nextMemberships = existingMemberships.includes(memberId)
          ? existingMemberships
          : [...existingMemberships, memberId];

        return updateDoc(entry.ref, {
          role: 'staff',
          active: member.account_status !== 'inactive',
          permissions,
          team_memberships: nextMemberships,
          updated_at: serverTimestamp(),
        });
      })
    );
  } catch (error) {
    console.error('Unable to sync linked user profile for team member yet:', error);
  }
};

export const teamService = {
  planAllowsTeams: (planName?: string) => {
    return planConfigService.isFeatureEnabled('team_mode', { plan_name: planName });
  },

  getDefaultMember: (): Omit<TeamMember, 'ownerId'> => ({
    name: '',
    email: '',
    role: 'crew_member',
    account_status: 'pending',
    route_access: true,
    customer_access: false,
    expense_entry_access: false,
    job_interaction_access: true,
  }),

  subscribeToTeamMembers: (callback: (members: TeamMember[]) => void) => {
    let unsubscribeMembers = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeMembers();

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeMembers = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid)),
        (snapshot) => {
          callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as TeamMember)));
        },
        (error) => handleFirestoreError(error, OperationType.GET, COLLECTION_NAME)
      );
    });

    return () => {
      unsubscribeMembers();
      unsubscribeAuth();
    };
  },

  addTeamMember: async (member: Omit<TeamMember, 'ownerId' | 'created_at' | 'updated_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      const ref = await addDoc(collection(db, COLLECTION_NAME), {
        ...member,
        ownerId: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      await syncLinkedUserProfile(ref.id, member);
      return ref;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  updateTeamMember: async (id: string, updates: Partial<TeamMember>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      await updateDoc(doc(db, COLLECTION_NAME, id), {
        ...updates,
        updated_at: serverTimestamp(),
      });
      await syncLinkedUserProfile(id, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },
};
