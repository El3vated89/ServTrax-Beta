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
import { db } from '../firebase';
import { planConfigService } from './planConfigService';
import { subscribeToResolvedUser, waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';
import { savePipelineService } from './savePipelineService';
import { cloudBackedLocalIdService } from './cloudBackedLocalIdService';
import { cloudTruthService } from './cloudTruthService';

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
const LOCAL_FALLBACK_NAMESPACE = 'team_members';
type LocalTeamMember = TeamMember & { _local_deleted?: boolean };
const teamCache = new Map<string, TeamMember>();
const toClientTimestamp = () => new Date().toISOString();

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
    const userSnapshot = await savePipelineService.withTimeout(
      getDocs(query(collection(db, 'users'), where('email', '==', member.email))),
      {
        timeoutMessage: 'Team sync timed out while looking up the linked user profile.',
      }
    );
    if (userSnapshot.empty) return;

    const permissions = buildPermissionList(member);

    await Promise.all(
      userSnapshot.docs.map((entry) => {
        const existingMemberships = Array.isArray(entry.data().team_memberships) ? entry.data().team_memberships : [];
        const nextMemberships = existingMemberships.includes(memberId)
          ? existingMemberships
          : [...existingMemberships, memberId];

        return savePipelineService.withTimeout(updateDoc(entry.ref, {
          role: 'staff',
          active: member.account_status !== 'inactive',
          permissions,
          team_memberships: nextMemberships,
          updated_at: serverTimestamp(),
        }), {
          timeoutMessage: 'Team sync timed out while updating the linked user profile.',
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
    let unsubscribeLocal = () => {};
    let primaryMembers: TeamMember[] = [];
    let localMembers: LocalTeamMember[] = [];

    const emit = () => {
      const next = new Map<string, TeamMember>();
      primaryMembers.forEach((entry) => {
        if (!entry.id) return;
        next.set(entry.id, entry);
      });
      localMembers.forEach((entry) => {
        if (!entry.id) return;
        if (entry._local_deleted) {
          next.delete(entry.id);
          return;
        }
        next.set(entry.id, {
          id: entry.id,
          ownerId: entry.ownerId,
          name: entry.name || '',
          email: entry.email || '',
          role: entry.role || 'crew_member',
          account_status: entry.account_status || 'pending',
          linked_user_id: entry.linked_user_id || '',
          route_access: entry.route_access ?? true,
          customer_access: entry.customer_access ?? false,
          expense_entry_access: entry.expense_entry_access ?? false,
          job_interaction_access: entry.job_interaction_access ?? true,
          created_at: entry.created_at as any,
          updated_at: entry.updated_at as any,
        });
      });
      const merged = Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
      teamCache.clear();
      merged.forEach((entry) => {
        if (entry.id) teamCache.set(entry.id, entry);
      });
      callback(merged);
    };

    const unsubscribeAuth = subscribeToResolvedUser((user) => {
      unsubscribeMembers();
      unsubscribeLocal();
      primaryMembers = [];
      localMembers = [];

      if (!user) {
        teamCache.clear();
        callback([]);
        return;
      }

      unsubscribeMembers = onSnapshot(
        query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid)),
        (snapshot) => {
          primaryMembers = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as TeamMember));
          emit();
        },
        (error) => {
          console.error('Primary team subscription failed, using local fallback only:', error);
          primaryMembers = [];
          emit();
        }
      );

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalTeamMember>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localMembers = records;
        emit();
      });
    });

    return () => {
      unsubscribeMembers();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addTeamMember: async (member: Omit<TeamMember, 'ownerId' | 'created_at' | 'updated_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      const ref = await savePipelineService.withTimeout(
        addDoc(collection(db, COLLECTION_NAME), {
          ...member,
          ownerId: user.uid,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }),
        {
          timeoutMessage: 'Team member save timed out while writing to the database.',
        }
      );
      await syncLinkedUserProfile(ref.id, member);
      return ref;
    } catch (error) {
      console.error('Primary team member save failed:', error);
      throw cloudTruthService.buildCreateError('Team member');
    }
  },

  updateTeamMember: async (id: string, updates: Partial<TeamMember>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      const shouldUseLocalFallback = await cloudBackedLocalIdService.shouldUseLocalFallback(
        COLLECTION_NAME,
        id,
        'Team member update timed out while checking the recovered cloud record.'
      );

      if (shouldUseLocalFallback) {
        throw cloudTruthService.buildUnsyncedRecordError('Team member');
      }

      await savePipelineService.withTimeout(
        updateDoc(doc(db, COLLECTION_NAME, id), {
          ...updates,
          updated_at: serverTimestamp(),
        }),
        {
          timeoutMessage: 'Team member update timed out while writing to the database.',
        }
      );
      await syncLinkedUserProfile(id, updates);
    } catch (error) {
      console.error('Primary team member update failed:', error);
      throw cloudTruthService.buildUpdateError('Team member');
    }
  },
};
