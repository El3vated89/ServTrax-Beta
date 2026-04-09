import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getDocs,
  collection,
  waitForCurrentUser,
  handleFirestoreError,
} = vi.hoisted(() => ({
  getDocs: vi.fn(),
  collection: vi.fn(),
  waitForCurrentUser: vi.fn(),
  handleFirestoreError: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getDocs,
  collection,
  doc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('./authSessionService', () => ({
  waitForCurrentUser,
}));

vi.mock('./verificationService', () => ({
  handleFirestoreError,
  OperationType: {
    GET: 'get',
    UPDATE: 'update',
  },
}));

vi.mock('./planConfigService', () => ({
  planConfigService: {
    resolveBusinessPlan: vi.fn((profile?: any) => ({
      planLabel: profile?.plan_name || 'Free',
      planKey: profile?.plan_key || 'free',
      storageLimitBytes: 1024,
    })),
  },
}));

vi.mock('./savePipelineService', () => ({
  savePipelineService: {
    withTimeout: vi.fn((promise: Promise<any>) => promise),
    log: vi.fn(),
    logError: vi.fn(),
  },
}));

import { adminService } from './adminService';

describe('adminService.getMetrics', () => {
  beforeEach(() => {
    getDocs.mockReset();
    collection.mockReset();
    waitForCurrentUser.mockReset();
    handleFirestoreError.mockReset();

    waitForCurrentUser.mockResolvedValue({
      uid: 'admin-1',
      email: 'thomaslmiller89@gmail.com',
    });

    collection.mockImplementation((_db: unknown, name: string) => name);
  });

  it('keeps business-based counts when one admin collection read fails', async () => {
    getDocs.mockImplementation(async (name: string) => {
      if (name === 'users') {
        throw new Error('permission denied');
      }

      if (name === 'business_profiles') {
        return {
          docs: [
            {
              id: 'owner-2',
              data: () => ({
                ownerId: 'owner-2',
                business_name: 'Second Business',
                plan_name: 'Starter',
                plan_key: 'starter',
                subscription_status: 'active',
              }),
            },
          ],
        };
      }

      return { docs: [] };
    });

    const metrics = await adminService.getMetrics();

    expect(metrics.totalUsers).toBe(1);
    expect(metrics.activeBusinesses).toBe(1);
    expect(metrics.users[0]?.uid).toBe('owner-2');
    expect(metrics.users[0]?.name).toBe('Second Business');
    expect(handleFirestoreError).not.toHaveBeenCalled();
  });
});
