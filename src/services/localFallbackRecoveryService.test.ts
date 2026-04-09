import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  waitForCurrentUser,
  readRecords,
  removeRecord,
  getDoc,
  setDoc,
  collection,
  doc,
  markCloudBacked,
  savePipelineService,
} = vi.hoisted(() => ({
  waitForCurrentUser: vi.fn(),
  readRecords: vi.fn(),
  removeRecord: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  markCloudBacked: vi.fn(),
  savePipelineService: {
    createTraceId: vi.fn(() => 'trace-1'),
    log: vi.fn(),
    withTimeout: vi.fn((promise: Promise<any>) => promise),
  },
}));

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  getDoc,
  setDoc,
  collection,
  doc,
}));

vi.mock('./authSessionService', () => ({
  waitForCurrentUser,
}));

vi.mock('./localFallbackStore', () => ({
  localFallbackStore: {
    readRecords,
    removeRecord,
  },
}));

vi.mock('./cloudBackedLocalIdService', () => ({
  cloudBackedLocalIdService: {
    markCloudBacked,
  },
}));

vi.mock('./savePipelineService', () => ({
  savePipelineService,
}));

import { localFallbackRecoveryService } from './localFallbackRecoveryService';

describe('localFallbackRecoveryService.recoverCurrentUserData', () => {
  beforeEach(() => {
    waitForCurrentUser.mockReset();
    readRecords.mockReset();
    removeRecord.mockReset();
    getDoc.mockReset();
    setDoc.mockReset();
    collection.mockReset();
    doc.mockReset();
    markCloudBacked.mockReset();
    savePipelineService.createTraceId.mockClear();
    savePipelineService.log.mockClear();

    waitForCurrentUser.mockResolvedValue({ uid: 'owner-1' });
    readRecords.mockImplementation((namespace: string) =>
      namespace === 'customers'
        ? [{ id: 'local:customers:1', ownerId: 'owner-1', name: 'Acme' }]
        : []
    );
    collection.mockImplementation((_db: unknown, name: string) => name);
    doc.mockImplementation((collectionName: string, id: string) => `${collectionName}/${id}`);
    getDoc.mockResolvedValue({
      exists: () => false,
    });
    setDoc.mockResolvedValue(undefined);
  });

  it('promotes local fallback records into Firestore and clears them locally', async () => {
    const result = await localFallbackRecoveryService.recoverCurrentUserData();

    expect(result).toEqual({
      recoveredCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(setDoc).toHaveBeenCalledWith('customers/local:customers:1', {
      id: 'local:customers:1',
      ownerId: 'owner-1',
      name: 'Acme',
    });
    expect(removeRecord).toHaveBeenCalledWith('customers', 'owner-1', 'local:customers:1');
    expect(markCloudBacked).toHaveBeenCalledWith('customers', 'local:customers:1');
  });
});
